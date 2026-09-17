/**
 * 6G-1 语音客户端编排（WebRTC + mediasoup-client）。
 *
 * 路径：seatToken 鉴权 → Socket.IO 信令（VoiceNet）→ WebRTC 直连 mediasoup worker。
 * 游戏 Command 链路零依赖；任何语音异常只降级横幅，不抛到游戏层。
 * 无 MediaRecorder、无文件落盘、无音频持久化。
 */
import { VOICE_SPEAKING_THROTTLE_MS } from '../../shared/timeouts';
import type { VoiceNet } from '../../net/voice';

export type VoiceClientStatus = 'idle' | 'joining' | 'active' | 'unavailable';

/** 最小化的 mediasoup-client 形状（动态 import，避免测试/构建期硬依赖） */
interface MsDevice {
  loaded: boolean;
  rtpCapabilities: unknown;
  load(opts: { routerRtpCapabilities: unknown }): Promise<void>;
  canProduce(kind: string): boolean;
  createSendTransport(opts: Record<string, unknown>): MsTransport;
  createRecvTransport(opts: Record<string, unknown>): MsTransport;
}
interface MsTransport {
  id: string;
  on(event: string, cb: (...args: never[]) => void): void;
  produce(opts: { track: MediaStreamTrack }): Promise<{ id: string }>;
  consume(opts: Record<string, unknown>): Promise<MsConsumer>;
  close(): void;
}
interface MsConsumer {
  id: string;
  track: MediaStreamTrack;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

export interface VoiceNotice {
  onStatus(s: VoiceClientStatus): void;
  onNotice(msg: string): void;
}

export class VoiceClient {
  private net: VoiceNet;
  private notice: VoiceNotice;
  status: VoiceClientStatus = 'idle';
  /** 本地闭麦（默认开麦加入） */
  muted = false;
  /** 全局听语音开关（本地生效，不通知他人；进房默认听） */
  listening = true;
  unavailableReason = '';

  private device: MsDevice | null = null;
  private sendTransport: MsTransport | null = null;
  private recvTransport: MsTransport | null = null;
  private micStream: MediaStream | null = null;
  private producerId: string | null = null;
  private consumers = new Map<string, { consumer: MsConsumer; el: HTMLAudioElement }>();
  private analyser: AnalyserNode | null = null;
  private audioCtx: AudioContext | null = null;
  private speakTimer: ReturnType<typeof setInterval> | null = null;
  private lastSpeaking = false;
  private disposed = false;

  constructor(net: VoiceNet, notice: VoiceNotice) {
    this.net = net;
    this.notice = notice;
  }

  /** 浏览器是否具备 WebRTC 基础能力 */
  static isSupported(): boolean {
    try {
      return (
        typeof RTCPeerConnection !== 'undefined' &&
        typeof navigator !== 'undefined' &&
        !!navigator.mediaDevices?.getUserMedia
      );
    } catch {
      return false;
    }
  }

  private setStatus(s: VoiceClientStatus): void {
    this.status = s;
    try {
      this.notice.onStatus(s);
    } catch {
      /* UI 回调异常不扩散 */
    }
  }

  private fail(reason: string): void {
    this.unavailableReason = reason;
    this.setStatus('unavailable');
    try {
      this.notice.onNotice(reason);
    } catch {
      /* 忽略 */
    }
  }

  /** 加入语音：拿麦 → Device → 建发送通道 → 推流 → 起 speaking 检测 */
  async join(): Promise<void> {
    if (this.status === 'joining' || this.status === 'active') return;
    this.disposed = false;
    if (!VoiceClient.isSupported()) {
      this.fail('当前浏览器不支持语音（无 WebRTC），游戏不受影响');
      return;
    }
    if (!this.net.connected) {
      this.fail('语音暂不可用（连接未建立），游戏不受影响');
      return;
    }
    this.setStatus('joining');
    // 1. 拿麦（被拒则降级，不阻塞游戏）
    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
    } catch {
      this.fail('麦克风不可用（权限被拒或无设备），游戏不受影响');
      return;
    }
    // 2. 取路由能力 + 加载 Device（动态 import，失败即降级）
    try {
      const mod = (await import('mediasoup-client')) as unknown as {
        Device: new () => MsDevice;
      };
      const routerRes = (await this.net.getRouter()) as unknown;
      if (!isRecord(routerRes) || routerRes['error'] || !routerRes['routerRtpCapabilities']) {
        this.cleanupLocal();
        this.fail('语音暂不可用（SFU 不可达），游戏不受影响');
        return;
      }
      const device = new mod.Device();
      await device.load({ routerRtpCapabilities: routerRes['routerRtpCapabilities'] });
      if (!device.canProduce('audio')) {
        this.cleanupLocal();
        this.fail('当前浏览器不支持音频推流，游戏不受影响');
        return;
      }
      this.device = device;
    } catch {
      this.cleanupLocal();
      this.fail('语音暂不可用（初始化失败），游戏不受影响');
      return;
    }
    // 3. 建发送通道并推流
    try {
      await this.setupSendTransport();
    } catch {
      this.cleanupLocal();
      this.fail('语音暂不可用（推流失败），游戏不受影响');
      return;
    }
    this.net.join();
    this.startSpeakingWatch();
    this.setStatus('active');
    // 4. 拉取已在房间的流（只听，不存）
    void this.refreshRemote();
  }

  private async setupSendTransport(): Promise<void> {
    if (!this.device) throw new Error('no device');
    const t = (await this.net.createTransport('send')) as unknown;
    if (!isRecord(t) || t['error'] || typeof t['transportId'] !== 'string') {
      throw new Error('create send transport failed');
    }
    const transport = this.device.createSendTransport({
      id: t['transportId'],
      iceParameters: t['iceParameters'],
      iceCandidates: t['iceCandidates'],
      dtlsParameters: t['dtlsParameters'],
    });
    transport.on('connect', ({ dtlsParameters }, callback) => {
      void this.net.connectTransport(String(t['transportId']), dtlsParameters).then(() => {
        (callback as () => void)();
      });
    });
    transport.on('produce', ({ kind, rtpParameters }, callback) => {
      void this.net
        .produce(String(t['transportId']), String(kind), rtpParameters)
        .then((res) => {
          const id = isRecord(res) && typeof res['producerId'] === 'string' ? res['producerId'] : '';
          (callback as (opts: { id: string }) => void)({ id });
        });
    });
    const track = this.micStream?.getAudioTracks()[0];
    if (!track) throw new Error('no mic track');
    track.enabled = !this.muted;
    const { id } = await transport.produce({ track });
    this.sendTransport = transport;
    this.producerId = id;
  }

  private async ensureRecvTransport(): Promise<MsTransport | null> {
    if (!this.device) return null;
    if (this.recvTransport) return this.recvTransport;
    const t = (await this.net.createTransport('recv')) as unknown;
    if (!isRecord(t) || t['error'] || typeof t['transportId'] !== 'string') return null;
    const transport = this.device.createRecvTransport({
      id: t['transportId'],
      iceParameters: t['iceParameters'],
      iceCandidates: t['iceCandidates'],
      dtlsParameters: t['dtlsParameters'],
    });
    transport.on('connect', ({ dtlsParameters }, callback) => {
      void this.net.connectTransport(String(t['transportId']), dtlsParameters).then(() => {
        (callback as () => void)();
      });
    });
    this.recvTransport = transport;
    return transport;
  }

  /** 拉取房间内他人音频并播放（纯内存 Audio 元素，不存） */
  async refreshRemote(): Promise<void> {
    if (!this.device || this.status !== 'active') return;
    try {
      const res = (await this.net.listProducers()) as unknown;
      if (!isRecord(res) || !Array.isArray(res['producers'])) return;
      const list = res['producers'] as Array<{ producerId: string; seatId: string }>;
      for (const p of list) {
        if (this.consumers.has(p.producerId)) continue;
        await this.consumeOne(p.producerId);
      }
    } catch {
      /* 拉流失败不抛，只影响听 */
    }
  }

  private async consumeOne(producerId: string): Promise<void> {
    if (!this.device) return;
    const transport = await this.ensureRecvTransport();
    if (!transport) return;
    try {
      const res = (await this.net.consume(
        transport.id,
        producerId,
        this.device.rtpCapabilities,
      )) as unknown;
      if (!isRecord(res) || res['error'] || typeof res['consumerId'] !== 'string') return;
      const consumer = await transport.consume({
        id: res['consumerId'],
        producerId,
        kind: res['kind'],
        rtpParameters: res['rtpParameters'],
      });
      const el = new Audio();
      el.srcObject = new MediaStream([consumer.track]);
      el.autoplay = true;
      // 全局开关：不听则暂停本地播放（不断流、不通知他人）
      if (!this.listening) void el.pause();
      else void el.play().catch(() => {});
      this.consumers.set(producerId, { consumer, el });
    } catch {
      /* 单路失败跳过 */
    }
  }

  /** 开麦/闭麦切换（同步本地 track + 广播布尔状态） */
  setMuted(muted: boolean): void {
    this.muted = muted;
    const track = this.micStream?.getAudioTracks()[0];
    if (track) track.enabled = !muted;
    if (this.status === 'active') {
      this.net.setMuted(muted);
      if (muted) this.net.setSpeaking(false);
    }
  }

  /** 全局听语音开关：纯本地暂停/恢复播放 */
  setListening(listening: boolean): void {
    this.listening = listening;
    for (const { el } of this.consumers.values()) {
      try {
        if (listening) void el.play().catch(() => {});
        else el.pause();
      } catch {
        /* 忽略 */
      }
    }
  }

  /** 本地音量门限 speaking 检测（节流上报） */
  private startSpeakingWatch(): void {
    try {
      const track = this.micStream?.getAudioTracks()[0];
      if (!track) return;
      const Ctx = window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      this.audioCtx = new Ctx();
      const src = this.audioCtx.createMediaStreamSource(new MediaStream([track]));
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 512;
      src.connect(this.analyser);
      const buf = new Uint8Array(this.analyser.frequencyBinCount);
      this.speakTimer = setInterval(() => {
        if (this.disposed || this.status !== 'active' || this.muted) return;
        try {
          this.analyser?.getByteTimeDomainData(buf);
          let peak = 0;
          for (let i = 0; i < buf.length; i += 4) {
            const v = Math.abs((buf[i] ?? 128) - 128) / 128;
            if (v > peak) peak = v;
          }
          const speaking = peak > 0.18;
          if (speaking !== this.lastSpeaking) {
            this.lastSpeaking = speaking;
            this.net.setSpeaking(speaking);
          }
        } catch {
          /* 忽略单次采样失败 */
        }
      }, VOICE_SPEAKING_THROTTLE_MS);
    } catch {
      /* 无 AudioContext 则无光效，不影响语音 */
    }
  }

  /** 离开语音：关流 + 关通道 + 关麦（全部本地释放） */
  leave(): void {
    this.disposed = true;
    try {
      this.net.closeProducer();
    } catch {
      /* 忽略 */
    }
    try {
      this.net.leave();
    } catch {
      /* 忽略 */
    }
    this.cleanupLocal();
    this.muted = false;
    this.lastSpeaking = false;
    this.setStatus('idle');
  }

  private cleanupLocal(): void {
    if (this.speakTimer) {
      clearInterval(this.speakTimer);
      this.speakTimer = null;
    }
    for (const { el } of this.consumers.values()) {
      try {
        el.pause();
        el.srcObject = null;
      } catch {
        /* 忽略 */
      }
    }
    this.consumers.clear();
    try {
      this.sendTransport?.close();
    } catch {
      /* 忽略 */
    }
    try {
      this.recvTransport?.close();
    } catch {
      /* 忽略 */
    }
    this.sendTransport = null;
    this.recvTransport = null;
    this.device = null;
    this.producerId = null;
    if (this.micStream) {
      try {
        this.micStream.getTracks().forEach((t) => t.stop());
      } catch {
        /* 忽略 */
      }
      this.micStream = null;
    }
    if (this.audioCtx) {
      try {
        void this.audioCtx.close();
      } catch {
        /* 忽略 */
      }
      this.audioCtx = null;
    }
    this.analyser = null;
  }
}
