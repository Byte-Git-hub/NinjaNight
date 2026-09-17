/**
 * 6G-3 快捷短语面板纯函数单测（node 环境，无 DOM）：15 按钮 + toast 文案。
 */
import { describe, expect, it } from 'vitest';
import { phrasesPanelHtml, phraseToastText } from '../../src/ui/social/phrases';

describe('phrasesPanelHtml', () => {
  it('渲染 15 个 data-phrase 按钮（0..14），折叠面板不碰已有选择器', () => {
    const html = phrasesPanelHtml();
    expect(html).toContain('id="phrase-panel"');
    for (let i = 0; i < 15; i += 1) {
      expect(html).toContain(`data-phrase="${i}"`);
    }
    expect(html).not.toContain('data-phrase="15"');
  });

  it('按钮文案含首尾短语', () => {
    const html = phrasesPanelHtml();
    expect(html).toContain('快点啊，鸡都要叫了');
    expect(html).toContain('这局我必活到最后');
  });
});

describe('phraseToastText', () => {
  it('「昵称：短语」格式', () => {
    expect(phraseToastText('甲', '快点啊，鸡都要叫了')).toBe('甲：快点啊，鸡都要叫了');
  });
});
