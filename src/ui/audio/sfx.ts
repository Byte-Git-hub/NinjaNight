/**
 * 6H-1 音效合成：Web Audio API 原生合成，不下载任何音频资源，不引第三方库。
 * 所有 recipe 均为短包络振荡器/噪声组合；AudioContext 由 AudioManager 在
 * 首次用户交互后创建（浏览器自动播放策略）。
 */

export const SFX_NAMES = [
  'card-play',
  'card-reveal',
  'target-pick',
  'view-success',
  'kill',
  'self-die',
  'token-gain',
  'phase-change',
  'round-win',
  'game-win',
  'effect-send',
] as const;

export type SfxName = (typeof SFX_NAMES)[number];

export type EffectTimbre = 'soft' | 'hard' | 'bright';

/** 物品 id → 音色（8 物品简化为 3 类，见 6H-1 清单） */
export function effectTimbre(itemId: string): EffectTimbre {
  if (itemId === 'shuriken' || itemId === 'geta' || itemId === 'basket') return 'hard';
  if (itemId === 'sakura' || itemId === 'snowball' || itemId === 'tea') return 'bright';
  return 'soft';
}

/**
 * GameEvent → 音效映射（纯函数，可单测）。
 * payload 仅读 seatId/tokenValue 等公开字段；selfSeatId 用于区分 kill/self-die。
 */
export function eventToSfx(
  type: string,
  payload: Record<string, unknown>,
  selfSeatId: string,
): SfxName | null {
  switch (type) {
    case 'night.cardsDeclared':
      return 'card-play';
    case 'house.revealed':
      return 'card-reveal';
    case 'night.houseViewed':
    case 'night.ninjaViewed':
      return 'view-success';
    case 'night.playerDied':
      return String(payload['seatId'] ?? '') === selfSeatId ? 'self-die' : 'kill';
    case 'score.honorAwarded':
      return 'token-gain';
    case 'night.phaseStarted':
      return 'phase-change';
    case 'score.roundWinner':
      return 'round-win';
    case 'score.victory':
      return 'game-win';
    case 'react.opened':
      return 'phase-change';
    default:
      return null;
  }
}

interface ToneOpts {
  freq: number;
  end?: number;
  dur: number;
  type?: OscillatorType;
  gain?: number;
  delay?: number;
}

function tone(ctx: AudioContext, out: GainNode, o: ToneOpts): void {
  const t0 = ctx.currentTime + (o.delay ?? 0);
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(o.freq, t0);
  if (o.end !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(o.end, 1), t0 + o.dur);
  const peak = o.gain ?? 0.5;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
  osc.connect(g).connect(out);
  osc.start(t0);
  osc.stop(t0 + o.dur + 0.05);
}

function noise(ctx: AudioContext, out: GainNode, dur: number, delay = 0, gain = 0.4, lowpass = 4000): void {
  const t0 = ctx.currentTime + delay;
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = lowpass;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f).connect(g).connect(out);
  src.start(t0);
}

/** 播放单个音效；timbre 仅 effect-send 使用。 */
export function playSfx(ctx: AudioContext, out: GainNode, name: SfxName, timbre: EffectTimbre = 'soft'): void {
  switch (name) {
    case 'card-play': // 短促纸张：噪声 + 中频拨音
      noise(ctx, out, 0.12, 0, 0.5, 6000);
      tone(ctx, out, { freq: 660, end: 330, dur: 0.1, type: 'triangle', gain: 0.35 });
      break;
    case 'card-reveal': // 清脆"咔"：高频短音 + 噪声
      tone(ctx, out, { freq: 1568, end: 2093, dur: 0.09, type: 'square', gain: 0.22 });
      noise(ctx, out, 0.05, 0, 0.3, 8000);
      break;
    case 'target-pick': // 轻微"叮"
      tone(ctx, out, { freq: 880, dur: 0.18, type: 'sine', gain: 0.35 });
      tone(ctx, out, { freq: 1320, dur: 0.14, type: 'sine', gain: 0.18, delay: 0.03 });
      break;
    case 'view-success': // 柔和上扬
      tone(ctx, out, { freq: 523, dur: 0.14, type: 'sine', gain: 0.3 });
      tone(ctx, out, { freq: 784, dur: 0.2, type: 'sine', gain: 0.3, delay: 0.1 });
      break;
    case 'kill': // 低沉"咚"
      tone(ctx, out, { freq: 150, end: 55, dur: 0.35, type: 'sine', gain: 0.7 });
      noise(ctx, out, 0.2, 0, 0.35, 900);
      break;
    case 'self-die': // 下行音
      tone(ctx, out, { freq: 392, dur: 0.22, type: 'sawtooth', gain: 0.25 });
      tone(ctx, out, { freq: 311, dur: 0.22, type: 'sawtooth', gain: 0.25, delay: 0.18 });
      tone(ctx, out, { freq: 233, dur: 0.35, type: 'sawtooth', gain: 0.25, delay: 0.36 });
      break;
    case 'token-gain': // 金币碰撞：双高频
      tone(ctx, out, { freq: 2093, dur: 0.12, type: 'square', gain: 0.16 });
      tone(ctx, out, { freq: 2637, dur: 0.18, type: 'square', gain: 0.16, delay: 0.07 });
      break;
    case 'phase-change': // 中性提示
      tone(ctx, out, { freq: 440, dur: 0.12, type: 'triangle', gain: 0.3 });
      tone(ctx, out, { freq: 554, dur: 0.16, type: 'triangle', gain: 0.3, delay: 0.09 });
      break;
    case 'round-win': // 上升旋律（3 音）
      [523, 659, 784].forEach((f, i) =>
        tone(ctx, out, { freq: f, dur: 0.22, type: 'triangle', gain: 0.35, delay: i * 0.13 }),
      );
      break;
    case 'game-win': // 完整旋律（5 音）
      [523, 659, 784, 1047, 1319].forEach((f, i) =>
        tone(ctx, out, { freq: f, dur: 0.3, type: 'triangle', gain: 0.35, delay: i * 0.15 }),
      );
      break;
    case 'effect-send': // 按物品三类音色
      if (timbre === 'hard') {
        noise(ctx, out, 0.1, 0, 0.5, 3000);
        tone(ctx, out, { freq: 220, end: 110, dur: 0.14, type: 'square', gain: 0.3 });
      } else if (timbre === 'bright') {
        tone(ctx, out, { freq: 1175, dur: 0.12, type: 'sine', gain: 0.3 });
        tone(ctx, out, { freq: 1760, dur: 0.16, type: 'sine', gain: 0.22, delay: 0.06 });
      } else {
        noise(ctx, out, 0.14, 0, 0.4, 1800);
        tone(ctx, out, { freq: 330, end: 220, dur: 0.12, type: 'triangle', gain: 0.3 });
      }
      break;
  }
}
