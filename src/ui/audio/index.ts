/** 6H-1 音效统一入口：AudioManager（首次交互后建 AudioContext，本地触发，不经 server）。 */
import { playSfx, eventToSfx, type SfxName, type EffectTimbre } from './sfx';
import { loadSoundSettings, saveSoundSettings } from './settings';

export type { SfxName, EffectTimbre };
export { SFX_NAMES, eventToSfx, effectTimbre } from './sfx';
export { loadSoundSettings, saveSoundSettings, SOUND_SETTINGS_KEY } from './settings';

export class AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private gestureBound = false;
  enabled: boolean;
  volume: number;

  constructor() {
    const s = loadSoundSettings(typeof window !== 'undefined' ? window.localStorage : undefined);
    this.enabled = s.enabled;
    this.volume = s.volume;
  }

  /** 绑定一次性手势监听（pointerdown/keydown 后建 Context）。 */
  attachGesture(target: Window | HTMLElement): void {
    if (this.gestureBound) return;
    this.gestureBound = true;
    const init = (): void => {
      void this.ensure().catch(() => {});
    };
    target.addEventListener('pointerdown', init, { once: true });
    target.addEventListener('keydown', init, { once: true });
  }

  async ensure(): Promise<boolean> {
    if (typeof window === 'undefined') return false;
    const AC = window.AudioContext;
    if (!AC) return false;
    if (!this.ctx) {
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume().catch(() => {});
    }
    return this.ctx.state === 'running';
  }

  /** 播放单个音效；未初始化/已关闭时静默跳过。 */
  play(name: SfxName, timbre: EffectTimbre = 'soft'): void {
    if (!this.enabled || !this.ctx || !this.master) return;
    if (this.ctx.state !== 'running') return;
    try {
      playSfx(this.ctx, this.master, name, timbre);
    } catch {
      /* 合成异常不影响游戏 */
    }
  }

  /** GameEvent → 音效（本地判定，不改 core）。 */
  playForEvent(type: string, payload: Record<string, unknown>, selfSeatId: string): void {
    const name = eventToSfx(type, payload, selfSeatId);
    if (name) this.play(name);
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    saveSoundSettings({ enabled: this.enabled, volume: this.volume });
  }

  setVolume(v: number): void {
    this.volume = Math.min(1, Math.max(0, v));
    if (this.master && this.ctx) this.master.gain.value = this.volume;
    saveSoundSettings({ enabled: this.enabled, volume: this.volume });
  }

  toggle(): boolean {
    this.setEnabled(!this.enabled);
    return this.enabled;
  }
}
