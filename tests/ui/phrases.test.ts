/**
 * 6G-3 快捷短语 UI 纯函数测试：渲染 HTML 结构与选择器契约。
 * 折叠面板与发送事件由 e2e 覆盖。
 */
import { describe, expect, it } from 'vitest';
import { phrasesPanelHtml, phraseToastText } from '../../src/ui/social/phrases';
import { PHRASES } from '../../src/data/phrases';

describe('phrasesPanelHtml', () => {
  it('渲染 21 个 data-phrase 按钮（0..20），折叠面板不碰已有选择器', () => {
    const html = phrasesPanelHtml();
    expect(html).toContain('id="phrase-panel"');
    expect(html).toContain('class="panel phrases collapsed-panel"');
    expect(html).toContain('<summary>快捷短语</summary>');
    for (let i = 0; i < 21; i++) {
      expect(html).toContain(`data-phrase="${i}"`);
    }
    expect(html).not.toContain('data-phrase="21"');
  });

  it('按钮文案含首尾短语', () => {
    const html = phrasesPanelHtml();
    expect(html).toContain(PHRASES[0]);
    expect(html).toContain(PHRASES[PHRASES.length - 1]);
  });
});

describe('phraseToastText', () => {
  it('「昵称：短语」格式', () => {
    expect(phraseToastText('Alice', '不要走，决战到天亮')).toBe('Alice：不要走，决战到天亮');
  });
});
