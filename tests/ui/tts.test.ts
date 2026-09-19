import { describe, expect, it, vi } from 'vitest';
import { PhraseTts, TTS_SETTINGS_KEY } from '../../src/ui/voice/tts';

class FakeUtterance {
  lang = '';
  rate = 0;
  pitch = 0;
  text: string;
  constructor(text: string) { this.text = text; }
}

function storage(initial?: string) {
  const data: Record<string, string> = initial === undefined ? {} : { [TTS_SETTINGS_KEY]: initial };
  return {
    data,
    getItem: (key: string) => data[key] ?? null,
    setItem: (key: string, value: string) => { data[key] = value; },
  };
}

describe('快捷短语本地语音播报', () => {
  it('默认关闭，不调用浏览器播报', () => {
    const speak = vi.fn();
    const cancel = vi.fn();
    const tts = new PhraseTts(storage(), { speak, cancel }, FakeUtterance);
    tts.speak('我是仙鹤');
    expect(tts.enabled).toBe(false);
    expect(speak).not.toHaveBeenCalled();
  });

  it('开关偏好持久化，并以中文自然语速播报', () => {
    const speak = vi.fn();
    const cancel = vi.fn();
    const st = storage();
    const tts = new PhraseTts(st, { speak, cancel }, FakeUtterance);
    tts.setEnabled(true);
    tts.speak('  今晚杀他   ');
    expect(st.data[TTS_SETTINGS_KEY]).toBe('1');
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(speak).toHaveBeenCalledTimes(1);
    const utterance = speak.mock.calls[0][0] as FakeUtterance;
    expect(utterance.text).toBe('今晚杀他');
    expect(utterance.lang).toBe('zh-CN');
    expect(utterance.rate).toBe(1.04);
  });

  it('浏览器不支持时自动降级且不抛错', () => {
    const st = storage('1');
    const tts = new PhraseTts(st, null, null);
    expect(tts.supported).toBe(false);
    expect(tts.enabled).toBe(false);
    expect(() => tts.setEnabled(true)).not.toThrow();
  });

  it('重复广播在短窗口内只播报一次', () => {
    const speak = vi.fn();
    const cancel = vi.fn();
    const tts = new PhraseTts(storage(), { speak, cancel }, FakeUtterance);
    tts.setEnabled(true);
    tts.speak('他刚才说谎');
    tts.speak('他刚才说谎');
    expect(speak).toHaveBeenCalledTimes(1);
  });
});
