/**
 * 6G-1 语音房间状态 + mediasoup SFU 信令。
 *
 * 硬边界：
 * - 只管理信令与布尔状态（inVoice/muted/speaking），不碰音频字节。
 * - 不录音、不存储、不落盘（代码层面无 MediaRecorder/文件写入）。
 * - 日志只记 roomCode/seatId/type，禁记 seatToken/握手参数。
 * - mediasoup worker 懒启动；初始化失败则标记不可用，游戏链路零依赖。
 */
import { networkInterfaces } from 'node:os';
import type { types as msTypes } from 'mediasoup';
import { logger } from './logger';
import {
  VOICE_ANNOUNCED_IP,
  VOICE_LISTEN_IP,
  VOICE_PORT_MAX,
  VOICE_PORT_MIN,
} from '../shared/timeouts';
import type { VoiceSeatState } from '../shared/protocol';

interface SeatVoice {
  inVoice: boolean;
  muted: boolean;
  speaking: boolean;
}

interface TransportRecord {
  transport: msTypes.WebRtcTransport;
  seatId: string;
  roomCode: string;
  direction: 'send' | 'recv';
}

interface ProducerRecord {
  producer: msTypes.Producer;
  seatId: string;
  roomCode: string;
}

/** 自动探测局域网 IP：优先 192.168.x，其次 10.x，再次 172.16–31.x */
export function detectLanIp(): string {
  const nets = networkInterfaces();
  const candidates: string[] = [];
  for (const addrs of Object.values(nets)) {
    for (const a of addrs ?? []) {
      if (a.family !== 'IPv4' || a.internal) continue;
      candidates.push(a.address);
    }
  }
  const pick = (prefix: (ip: string) => boolean): string | undefined =>
    candidates.find(prefix);
  return (
    pick((ip) => ip.startsWith('192.168.')) ??
    pick((ip) => ip.startsWith('10.')) ??
    pick((ip) => {
      const m = /^172\.(\d+)\./.exec(ip);
      if (!m) return false;
      const n = Number(m[1]);
      return n >= 16 && n <= 31;
    }) ??
    candidates[0] ??
    '127.0.0.1'
  );
}

export function resolveAnnouncedIp(): string {
  if (VOICE_ANNOUNCED_IP.trim() !== '') return VOICE_ANNOUNCED_IP.trim();
  return detectLanIp();
}

type IoLike = {
  to(room: string): { emit(event: string, payload: unknown): void };
};

export class VoiceManager {
  private io: IoLike;
  /** roomCode -> seatId -> 状态 */
  private rooms = new Map<string, Map<string, SeatVoice>>();
  private worker: msTypes.Worker | null = null;
  private router: msTypes.Router | null = null;
  private workerFailed = false;
  private transports = new Map<string, TransportRecord>();
  private producers = new Map<string, ProducerRecord>();

  constructor(io: IoLike) {
    this.io = io;
  }

  /** SFU 是否可用（worker 创建失败则永久不可用，游戏不受影响） */
  isAvailable(): boolean {
    return !this.workerFailed;
  }

  private roomChannel(roomCode: string): string {
    return `room:${roomCode}`;
  }

  private seatsOf(roomCode: string): Map<string, SeatVoice> {
    let m = this.rooms.get(roomCode);
    if (!m) {
      m = new Map();
      this.rooms.set(roomCode, m);
    }
    return m;
  }

  /** 懒启动 worker + router（纯音频 Opus） */
  async ensureRouter(): Promise<msTypes.Router | null> {
    if (this.router) return this.router;
    if (this.workerFailed) return null;
    try {
      const { createWorker } = await import('mediasoup');
      this.worker = await createWorker({
        rtcMinPort: VOICE_PORT_MIN,
        rtcMaxPort: VOICE_PORT_MAX,
      });
      this.worker.on('died', () => {
        logger.error('voice.worker_died', {});
        this.worker = null;
        this.router = null;
        this.workerFailed = true;
        this.transports.clear();
        this.producers.clear();
      });
      this.router = await this.worker.createRouter({
        mediaCodecs: [
          {
            kind: 'audio',
            mimeType: 'audio/opus',
            clockRate: 48000,
            channels: 2,
          },
        ],
      });
      logger.info('voice.router_ready', { announcedIp: resolveAnnouncedIp() });
      return this.router;
    } catch (err) {
      this.workerFailed = true;
      logger.error('voice.worker_failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  getRouterCapabilities(): unknown {
    return this.router ? this.router.rtpCapabilities : null;
  }

  // -- 纯状态 API（单测直接覆盖，无需 worker） -------------------------------

  join(roomCode: string, seatId: string): VoiceSeatState[] {
    const seats = this.seatsOf(roomCode);
    const cur = seats.get(seatId) ?? { inVoice: false, muted: false, speaking: false };
    cur.inVoice = true;
    seats.set(seatId, cur);
    logger.info('voice.join', { roomCode, seatId });
    return this.snapshot(roomCode);
  }

  leave(roomCode: string, seatId: string): VoiceSeatState[] {
    const seats = this.seatsOf(roomCode);
    seats.delete(seatId);
    this.closeSeatResources(roomCode, seatId);
    logger.info('voice.leave', { roomCode, seatId });
    return this.snapshot(roomCode);
  }

  setMuted(roomCode: string, seatId: string, muted: boolean): VoiceSeatState[] {
    const seats = this.seatsOf(roomCode);
    const cur = seats.get(seatId) ?? { inVoice: false, muted: false, speaking: false };
    cur.muted = muted;
    if (muted) cur.speaking = false;
    seats.set(seatId, cur);
    logger.info('voice.mute', { roomCode, seatId, muted });
    return this.snapshot(roomCode);
  }

  setSpeaking(roomCode: string, seatId: string, speaking: boolean): VoiceSeatState[] | null {
    const seats = this.seatsOf(roomCode);
    const cur = seats.get(seatId);
    // 未加入语音或已闭麦的座位不接受 speaking（防脏状态）
    if (!cur || !cur.inVoice || cur.muted) return null;
    if (cur.speaking === speaking) return null;
    cur.speaking = speaking;
    return this.snapshot(roomCode);
  }

  snapshot(roomCode: string): VoiceSeatState[] {
    const seats = this.rooms.get(roomCode);
    if (!seats) return [];
    return [...seats.entries()].map(([seatId, s]) => ({
      seatId,
      inVoice: s.inVoice,
      muted: s.muted,
      speaking: s.speaking,
    }));
  }

  broadcastState(roomCode: string): void {
    this.io
      .to(this.roomChannel(roomCode))
      .emit('voice.state', { roomCode, seats: this.snapshot(roomCode) });
  }

  /** 房间销毁/回大厅时清理语音资源（状态 + SFU 句柄） */
  cleanupRoom(roomCode: string): void {
    this.rooms.delete(roomCode);
    for (const [id, rec] of [...this.transports]) {
      if (rec.roomCode === roomCode) {
        try {
          rec.transport.close();
        } catch {
          /* 已关闭则忽略 */
        }
        this.transports.delete(id);
      }
    }
    for (const [id, rec] of [...this.producers]) {
      if (rec.roomCode === roomCode) {
        try {
          rec.producer.close();
        } catch {
          /* 已关闭则忽略 */
        }
        this.producers.delete(id);
      }
    }
  }

  removeSeatEverywhere(seatId: string, roomCode: string): void {
    const seats = this.rooms.get(roomCode);
    if (seats?.has(seatId)) {
      seats.delete(seatId);
      this.broadcastState(roomCode);
    }
    this.closeSeatResources(roomCode, seatId);
  }

  private closeSeatResources(roomCode: string, seatId: string): void {
    for (const [id, rec] of [...this.transports]) {
      if (rec.roomCode === roomCode && rec.seatId === seatId) {
        try {
          rec.transport.close();
        } catch {
          /* 忽略 */
        }
        this.transports.delete(id);
      }
    }
    for (const [id, rec] of [...this.producers]) {
      if (rec.roomCode === roomCode && rec.seatId === seatId) {
        try {
          rec.producer.close();
        } catch {
          /* 忽略 */
        }
        this.producers.delete(id);
      }
    }
  }

  // -- SFU 握手 API ----------------------------------------------------------

  async createTransport(
    roomCode: string,
    seatId: string,
    direction: 'send' | 'recv',
  ): Promise<{
    transportId: string;
    iceParameters: unknown;
    iceCandidates: unknown;
    dtlsParameters: unknown;
  } | null> {
    const router = await this.ensureRouter();
    if (!router) return null;
    const announcedIp = resolveAnnouncedIp();
    const transport = await router.createWebRtcTransport({
      listenIps: [{ ip: VOICE_LISTEN_IP, announcedIp }],
      enableUdp: true,
      enableTcp: true,
      preferUdp: true,
    });
    this.transports.set(transport.id, { transport, seatId, roomCode, direction });
    logger.info('voice.transport', { roomCode, seatId, direction });
    return {
      transportId: transport.id,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters,
    };
  }

  async connectTransport(transportId: string, dtlsParameters: unknown): Promise<boolean> {
    const rec = this.transports.get(transportId);
    if (!rec) return false;
    try {
      await rec.transport.connect({
        dtlsParameters: dtlsParameters as msTypes.DtlsParameters,
      });
      return true;
    } catch (err) {
      logger.warn('voice.transport_connect_fail', {
        error: err instanceof Error ? err.message : String(err),
      });
      return false;
    }
  }

  async produce(
    roomCode: string,
    seatId: string,
    transportId: string,
    kind: string,
    rtpParameters: unknown,
  ): Promise<string | null> {
    const rec = this.transports.get(transportId);
    // 仅允许音频 producer，且 transport 必须属于同一座位
    if (!rec || rec.seatId !== seatId || rec.roomCode !== roomCode) return null;
    if (kind !== 'audio') return null;
    try {
      const producer = await rec.transport.produce({
        kind: 'audio',
        rtpParameters: rtpParameters as msTypes.RtpParameters,
      });
      this.producers.set(producer.id, { producer, seatId, roomCode });
      producer.on('transportclose', () => {
        this.producers.delete(producer.id);
      });
      logger.info('voice.produce', { roomCode, seatId });
      return producer.id;
    } catch (err) {
      logger.warn('voice.produce_fail', {
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  async consume(
    roomCode: string,
    seatId: string,
    recvTransportId: string,
    producerId: string,
    rtpCapabilities: unknown,
  ): Promise<{
    consumerId: string;
    kind: string;
    rtpParameters: unknown;
    producerSeatId: string;
  } | null> {
    const router = this.router;
    const rec = this.transports.get(recvTransportId);
    const prod = this.producers.get(producerId);
    if (!router || !rec || !prod) return null;
    if (rec.seatId !== seatId || rec.roomCode !== roomCode) return null;
    if (prod.roomCode !== roomCode) return null;
    try {
      const caps = rtpCapabilities as msTypes.RtpCapabilities;
      if (!router.canConsume({ producerId, rtpCapabilities: caps })) return null;
      const consumer = await rec.transport.consume({
        producerId,
        rtpCapabilities: caps,
        paused: false,
      });
      return {
        consumerId: consumer.id,
        kind: consumer.kind,
        rtpParameters: consumer.rtpParameters,
        producerSeatId: prod.seatId,
      };
    } catch (err) {
      logger.warn('voice.consume_fail', {
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  /** 列出房间内可消费的 producer（只给 id + 座位，不给流信息） */
  listProducers(roomCode: string): Array<{ producerId: string; seatId: string }> {
    const out: Array<{ producerId: string; seatId: string }> = [];
    for (const [id, rec] of this.producers) {
      if (rec.roomCode === roomCode) out.push({ producerId: id, seatId: rec.seatId });
    }
    return out;
  }
}
