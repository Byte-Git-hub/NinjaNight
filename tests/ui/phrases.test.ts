import { describe, expect, it } from 'vitest';
import { phrasesPanelHtml, phraseToastText } from '../../src/ui/social/phrases';
import { PHRASES } from '../../src/data/phrases';

describe('phrasesPanelHtml', () => {
  it('渲染分页 3x3 结构，首页包含 9 个按钮，含翻页按钮与指示器', () => {
    const html = phrasesPanelHtml(0);
    expect(html).toContain('id="phrase-panel"');
    expect(html).toContain('class="panel phrases collapsed-panel"');
    expect(html).toContain('<summary>快捷短语</summary>');
    expect(html).toContain('class="phrase-grid-3x3"');
    expect(html).toContain('class="phrase-pagination"');
    for (let i = 0; i < 9; i++) {
      expect(html).toContain('data-phrase="' + i + '"');
    }
    expect(html).not.toContain('data-phrase="9"');
  });

  it('最后一页包含末尾短语', () => {
    const lastPage = Math.floor((PHRASES.length - 1) / 9);
    const html = phrasesPanelHtml(lastPage);
    expect(html).toContain(PHRASES[PHRASES.length - 1]);
    expect(html).toContain('data-phrase="' + (PHRASES.length - 1) + '"');
  });
});

describe('phraseToastText', () => {
  it('「昵称：短语」格式', () => {
    expect(phraseToastText('Alice', '不要走，决战到天亮')).toBe('Alice：不要走，决战到天亮');
  });
});
