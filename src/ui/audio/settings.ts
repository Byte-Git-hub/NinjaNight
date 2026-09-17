/** 6H-1 音效设置：开关 + 音量 + localStorage 持久化（纯函数式，可单测）。 */

export interface SoundSettings {
  enabled: boolean;
  volume: number; // 0–1
}

export const SOUND_SETTINGS_KEY = 'ninja-night:sound-settings';

export const DEFAULT_SOUND_SETTINGS: SoundSettings = { enabled: true, volume: 0.7 };

export function loadSoundSettings(storage?: Pick<Storage, 'getItem'>): SoundSettings {
  try {
    const raw = (storage ?? globalThis.localStorage).getItem(SOUND_SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SOUND_SETTINGS };
    const p = JSON.parse(raw) as Partial<SoundSettings>;
    return {
      enabled: typeof p.enabled === 'boolean' ? p.enabled : DEFAULT_SOUND_SETTINGS.enabled,
      volume:
        typeof p.volume === 'number' && Number.isFinite(p.volume)
          ? Math.min(1, Math.max(0, p.volume))
          : DEFAULT_SOUND_SETTINGS.volume,
    };
  } catch {
    return { ...DEFAULT_SOUND_SETTINGS };
  }
}

export function saveSoundSettings(s: SoundSettings, storage?: Pick<Storage, 'setItem'>): void {
  try {
    (storage ?? globalThis.localStorage).setItem(SOUND_SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* 无痕模式等写入失败时忽略 */
  }
}
