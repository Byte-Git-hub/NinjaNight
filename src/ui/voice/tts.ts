/**
 * 快捷短语的本地语音播报。
 *
 * 优先播放预生成的 mimo TTS 音频文件（public/assets/audio/phrases/phrase_{id}.mp3）。
 * 兜底使用浏览器 Web Speech API，不把文本发送到服务端，也不持久化内容。
 * 默认关闭；用户打开后仅保存在当前浏览器的偏好中。
 */

import { PHRASES } from '../../data/phrases';
import { assetUrl } from '../assets';

export const TTS_SETTINGS_KEY = 'ninja-night:phrase-tts';

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface SpeechUtteranceLike {
  lang: string;
  rate: number;
  pitch: number;
}

interface SpeechSynthesisLike {
  cancel(): void;
  speak(utterance: SpeechUtteranceLike): void;
}

type UtteranceCtor = new (text: string) => SpeechUtteranceLike;

function browserStorage(): StorageLike | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

function settingStorage(storage: StorageLike | null): boolean {
  if (!storage) return false;
  try {
    return storage.getItem(TTS_SETTINGS_KEY) === '1';
  } catch {
    return false;
  }
}

function persistSetting(storage: StorageLike | null, enabled: boolean): void {
  try {
    storage?.setItem(TTS_SETTINGS_KEY, enabled ? '1' : '0');
  } catch {
    /* 隐私模式或禁用存储时，偏好只保留在内存 */
  }
}

function defaultSynthesis(): SpeechSynthesisLike | null {
  try {
    const candidate = (globalThis as { speechSynthesis?: SpeechSynthesisLike }).speechSynthesis;
    return candidate && typeof candidate.speak === 'function' && typeof candidate.cancel === 'function'
      ? candidate
      : null;
  } catch {
    return null;
  }
}

function defaultUtterance(): UtteranceCtor | null {
  try {
    const candidate = (globalThis as { SpeechSynthesisUtterance?: UtteranceCtor }).SpeechSynthesisUtterance;
    return typeof candidate === 'function' ? candidate : null;
  } catch {
    return null;
  }
}

/** 判断当前浏览器是否能播报短语。可在 SSR / 测试环境安全调用。 */
export function isPhraseTtsSupported(): boolean {
  if (typeof Audio !== 'undefined') return true;
  return defaultSynthesis() !== null && defaultUtterance() !== null;
}

export class PhraseTts {
  private readonly synthesis: SpeechSynthesisLike | null;
  private readonly utteranceCtor: UtteranceCtor | null;
  private readonly storage: StorageLike | null;
  private enabledState: boolean;
  private lastText = '';
  private lastAt = 0;
  private activeAudio: HTMLAudioElement | null = null;

  constructor(
    storage: StorageLike | null = browserStorage(),
    synthesis: SpeechSynthesisLike | null = defaultSynthesis(),
    utteranceCtor: UtteranceCtor | null = defaultUtterance(),
  ) {
    this.storage = storage;
    this.synthesis = synthesis;
    this.utteranceCtor = utteranceCtor;
    this.enabledState = settingStorage(storage) && this.supported;
  }

  get supported(): boolean {
    return typeof Audio !== 'undefined' || (this.synthesis !== null && this.utteranceCtor !== null);
  }

  get enabled(): boolean {
    return this.enabledState;
  }

  setEnabled(enabled: boolean): void {
    this.enabledState = Boolean(enabled) && this.supported;
    persistSetting(this.storage, this.enabledState);
    if (!this.enabledState) this.stop();
  }

  toggle(): boolean {
    this.setEnabled(!this.enabledState);
    return this.enabledState;
  }

  stop(): void {
    try {
      if (this.activeAudio) {
        this.activeAudio.pause();
        this.activeAudio = null;
      }
      this.synthesis?.cancel();
    } catch {
      /* 播放器异常不能影响游戏 */
    }
  }

  /** 播报一条短语；优先播放静态 mimo TTS 音频，失败或无对应音频时回退 Web Speech */
  speak(text: string): void {
    if (!this.enabledState) return;
    const clean = text.replace(/\\s+/g, ' ').trim().slice(0, 80);
    if (!clean) return;
    const now = Date.now();
    // 同一广播 350ms 内不重复播报
    if (clean === this.lastText && now - this.lastAt < 350) return;
    this.lastText = clean;
    this.lastAt = now;

    // 1. 查找静态预生成音频
    const phraseIdx = PHRASES.findIndex((p) => p === clean);
    if (phraseIdx >= 0 && typeof Audio !== 'undefined') {
      try {
        if (this.activeAudio) {
          this.activeAudio.pause();
        }
        const audio = new Audio(assetUrl("assets/audio/phrases/phrase_" + phraseIdx + ".mp3"));
        audio.play().catch(() => {
          this.fallbackSpeak(clean);
        });
        return;
      } catch {
        // 回退到 Web Speech
      }
    }

    this.fallbackSpeak(clean);
  }

  private fallbackSpeak(clean: string): void {
    if (!this.synthesis || !this.utteranceCtor) return;
    try {
      const utterance = new this.utteranceCtor(clean);
      utterance.lang = 'zh-CN';
      utterance.rate = 1.04;
      utterance.pitch = 1.02;
      this.synthesis.cancel();
      this.synthesis.speak(utterance);
    } catch {
      /* 部分浏览器在页面切后台时会拒绝播报 */
    }
  }
}
