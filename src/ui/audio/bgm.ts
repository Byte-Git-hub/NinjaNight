/**
 * 6H-2 BGM/环境音：Web Audio 合成循环，不下载资源。
 * night：低沉持续音 + 偶发风声/虫鸣；reveal：明亮五声音阶拨弦循环。
 * 调度器：setInterval 前视 0.2s 排音；stop 后清 timer 并静音。
 */
export type BgmTrack = 'night' | 'reveal';

/** phase → BGM（纯函数，可单测；draft/大厅无 BGM）。 */
export function phaseToBgmTrack(phase: string, gameOver: boolean): BgmTrack | null {
  if (gameOver || phase === 'gameOver') return 'reveal';
  if (phase.startsWith('night')) return 'night';
  if (phase === 'mastermindReveal' || phase === 'houseReveal' || phase === 'score' || phase === 'victoryCheck') {
    return 'reveal';
  }
  return null;
}

const NIGHT_DRONES = [55, 82.5, 110];
const REVEAL_SCALE = [523.25, 587.33, 659.25, 783.99, 880];

export class BgmPlayer {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private track: BgmTrack | null = null;
  private step = 0;
  volume = 0.5;

  /** 由 AudioManager 注入共享 Context（随音效 Context 生命周期）。 */
  attach(ctx: AudioContext, master: GainNode): void {
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = this.volume * 0.5;
    this.out.connect(master);
  }

  setVolume(v: number): void {
    this.volume = Math.min(1, Math.max(0, v));
    if (this.out && this.ctx) this.out.gain.setTargetAtTime(this.volume * 0.5, this.ctx.currentTime, 0.1);
  }

  start(track: BgmTrack): void {
    if (!this.ctx || !this.out) return;
    if (this.track === track && this.timer) return;
    this.stopTimer();
    this.track = track;
    this.step = 0;
    this.timer = setInterval(() => this.schedule(), 240);
    this.schedule();
  }

  stop(): void {
    this.stopTimer();
    this.track = null;
  }

  get current(): BgmTrack | null {
    return this.timer ? this.track : null;
  }

  private stopTimer(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private schedule(): void {
    if (!this.ctx || !this.out || !this.track) return;
    const t = this.ctx.currentTime;
    if (this.track === 'night') this.nightStep(t);
    else this.revealStep(t);
    this.step += 1;
  }

  private drone(freq: number, t: number, dur: number, gain: number): void {
    if (!this.ctx || !this.out) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + dur * 0.4);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.out);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  private pluck(freq: number, t: number, gain: number): void {
    if (!this.ctx || !this.out) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    osc.connect(g).connect(this.out);
    osc.start(t);
    osc.stop(t + 1);
  }

  private wind(t: number): void {
    if (!this.ctx || !this.out) return;
    const len = Math.floor(this.ctx.sampleRate * 1.6);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) d[i] = (Math.random() * 2 - 1) * Math.sin((i / len) * Math.PI);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 400 + Math.random() * 300;
    f.Q.value = 0.8;
    const g = this.ctx.createGain();
    g.gain.value = 0.12;
    src.connect(f).connect(g).connect(this.out);
    src.start(t);
  }

  private nightStep(t: number): void {
    // 持续低音：每 8 步轮换 drone 根音
    if (this.step % 8 === 0) {
      this.drone(NIGHT_DRONES[(this.step / 8) % NIGHT_DRONES.length] ?? 55, t, 2.4, 0.16);
    }
    // 偶发风声（约每 13 步）/ 虫鸣（约每 5 步，高频短音）
    if (this.step % 13 === 7) this.wind(t);
    if (this.step % 5 === 2 && this.ctx && this.out) {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 4200 + Math.random() * 600;
      g.gain.setValueAtTime(0.03, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
      osc.connect(g).connect(this.out);
      osc.start(t);
      osc.stop(t + 0.1);
    }
  }

  private revealStep(t: number): void {
    // 五声音阶上行拨弦，每步一个音
    const f = REVEAL_SCALE[this.step % REVEAL_SCALE.length] ?? 523.25;
    this.pluck(f, t, 0.14);
    if (this.step % 10 === 0) this.drone(130.8, t, 2.6, 0.1);
  }
}
