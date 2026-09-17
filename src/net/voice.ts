/**
 * 6G-1 语音信令封装（复用 Socket.IO，不另建连接）。
 * 只传状态与 WebRTC 握手参数；音频字节走 mediasoup worker。
 */
import { EV, OUT, type VoiceSeatState } from '../shared/protocol';
import type { GameNet } from './client';

export type VoiceStatus = 'idle' | 'joining' | 'active' | 'unavailable';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

export class VoiceNet {
  private net: GameNet;
  private stateHandlers = new Set<(seats: VoiceSeatState[]) => void>();
  private unavailableHandlers = new Set<(message: string) => void>();
  private producersHandlers = new Set<
    (producers: Array<{ producerId: string; seatId: string }>) => void
  >();
  private bound = false;
  private onState = (p: unknown): void => {
    if (isRecord(p) && Array.isArray(p['seats'])) {
      this.stateHandlers.forEach((h) => h(p['seats'] as VoiceSeatState[]));
    }
  };
  private onUnavailable = (p: unknown): void => {
    const msg =
      isRecord(p) && typeof p['message'] === 'string' ? p['message'] : '语音暂不可用';
    this.unavailableHandlers.forEach((h) => h(msg));
  };
  private onProducers = (p: unknown): void => {
    if (isRecord(p) && Array.isArray(p['producers'])) {
      const list = p['producers'] as Array<{ producerId: string; seatId: string }>;
      this.producersHandlers.forEach((h) => h(list));
    }
  };

  constructor(net: GameNet) {
    this.net = net;
  }

  /** 挂载 voice.* 监听（mount 时一次） */
  attach(): void {
    if (this.bound) return;
    this.bound = true;
    this.net.onSocketEvent(OUT.voiceState, this.onState as (...args: never[]) => void);
    this.net.onSocketEvent(OUT.voiceUnavailable, this.onUnavailable as (...args: never[]) => void);
    this.net.onSocketEvent(OUT.voiceProducers, this.onProducers as (...args: never[]) => void);
  }

  detach(): void {
    if (!this.bound) return;
    this.bound = false;
    this.net.offSocketEvent(OUT.voiceState, this.onState as (...args: never[]) => void);
    this.net.offSocketEvent(OUT.voiceUnavailable, this.onUnavailable as (...args: never[]) => void);
    this.net.offSocketEvent(OUT.voiceProducers, this.onProducers as (...args: never[]) => void);
  }

  onStateChange(h: (seats: VoiceSeatState[]) => void): () => void {
    this.stateHandlers.add(h);
    return () => this.stateHandlers.delete(h);
  }

  onUnavailableNotice(h: (message: string) => void): () => void {
    this.unavailableHandlers.add(h);
    return () => this.unavailableHandlers.delete(h);
  }

  onProducersChange(
    h: (producers: Array<{ producerId: string; seatId: string }>) => void,
  ): () => void {
    this.producersHandlers.add(h);
    return () => this.producersHandlers.delete(h);
  }

  get connected(): boolean {
    return this.net.isSocketConnected;
  }

  join(): void {
    this.net.emitVoice(EV.voiceJoin, {});
  }

  leave(): void {
    this.net.emitVoice(EV.voiceLeave, {});
  }

  setMuted(muted: boolean): void {
    this.net.emitVoice(EV.voiceMute, { muted });
  }

  setSpeaking(speaking: boolean): void {
    this.net.emitVoice(EV.voiceSpeaking, { speaking });
  }

  getRouter(): Promise<unknown> {
    return this.net.emitWithAck(EV.voiceGetRouter, {});
  }

  createTransport(direction: 'send' | 'recv'): Promise<unknown> {
    return this.net.emitWithAck(EV.voiceCreateTransport, { direction });
  }

  connectTransport(transportId: string, dtlsParameters: unknown): Promise<unknown> {
    return this.net.emitWithAck(EV.voiceConnectTransport, { transportId, dtlsParameters });
  }

  produce(transportId: string, kind: string, rtpParameters: unknown): Promise<unknown> {
    return this.net.emitWithAck(EV.voiceProduce, { transportId, kind, rtpParameters });
  }

  consume(
    recvTransportId: string,
    producerId: string,
    rtpCapabilities: unknown,
  ): Promise<unknown> {
    return this.net.emitWithAck(EV.voiceConsume, {
      recvTransportId,
      producerId,
      rtpCapabilities,
    });
  }

  closeProducer(): void {
    this.net.emitVoice(EV.voiceCloseProducer, {});
  }

  listProducers(): Promise<unknown> {
    return this.net.emitWithAck(EV.voiceListProducers, {});
  }
}
