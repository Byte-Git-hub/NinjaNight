import { describe, expect, it } from 'vitest';
import {
  getVisualId,
  getVisualPath,
  getCardNumber,
  getCardDisplayName,
  renderCardHtml,
  getUiAssetPath,
  getHonorTokenPath,
  getNinjaCardBackPath,
  getHouseCardBackPath,
} from '../../src/ui/assets';
import { CARD_DESCRIPTION_ZH, CARD_PHASE_ZH } from '../../src/data/card-text';

describe('UI assets mapping & card rendering', () => {
  it('getVisualId: 正确反查视觉单元', () => {
    expect(getVisualId('spy-3')).toBe('spy');
    expect(getVisualId('spy:3')).toBe('spy');
    expect(getVisualId('shapeshifter')).toBe('shapeshifter');
    expect(getVisualId('shapeshifter:1')).toBe('shapeshifter');
    expect(getVisualId('crane-2')).toBe('crane');
    expect(getVisualId('crane:2')).toBe('crane');
    expect(getVisualId('ronin')).toBe('ronin');
  });

  it('getVisualPath: 返回正确图片路径', () => {
    expect(getVisualPath('spy')).toBe('/assets/visuals/spy.webp');
    expect(getVisualPath('crane')).toBe('/assets/visuals/crane.webp');
  });

  it('getCardNumber: 解析编号与无编号特殊牌', () => {
    expect(getCardNumber('spy-3')).toBe(3);
    expect(getCardNumber('spy:6')).toBe(6);
    expect(getCardNumber('shapeshifter:1')).toBe(1);
    expect(getCardNumber('mastermind')).toBeNull();
    expect(getCardNumber('ronin')).toBeNull();
  });

  it('getCardDisplayName: 中文显示名', () => {
    expect(getCardDisplayName('spy-3')).toBe('密探 3');
    expect(getCardDisplayName('spy:1')).toBe('密探 1');
    expect(getCardDisplayName('shapeshifter:1')).toBe('百变者 1');
    expect(getCardDisplayName('mastermind')).toBe('大将军');
    expect(getCardDisplayName('ronin')).toBe('浪人');
  });

  it('renderCardHtml: 占位色块、卡名文字与顶部编号渲染', () => {
    const htmlWithNum = renderCardHtml('spy:3', 'inst-1', true);
    // 包含 img 指向对应 visualId 路径
    expect(htmlWithNum).toContain('src="/assets/visuals/spy.webp"');
    // 包含占位色块与卡名文字（供图片未就绪/加载失败时回退显示）
    expect(htmlWithNum).toContain('class="card-placeholder"');
    expect(htmlWithNum).toContain('密探 3');
    // 包含顶部叠加编号大字
    expect(htmlWithNum).toContain('class="card-number" data-number="3"');
    expect(htmlWithNum).toContain('>3</div>');

    // 无编号卡牌：不渲染 .card-number
    const htmlNoNum = renderCardHtml('mastermind', 'inst-2', true);
    expect(htmlNoNum).toContain('大将军');
    expect(htmlNoNum).not.toContain('class="card-number"');
  });

  it('getUiAssetPath & getHonorTokenPath: 路径解析对齐无前缀文件名', () => {
    expect(getUiAssetPath('ui-lobby-bg')).toBe('/assets/ui/lobby-bg.webp');
    expect(getUiAssetPath('lobby-bg')).toBe('/assets/ui/lobby-bg.webp');
    expect(getUiAssetPath('ui-table-texture')).toBe('/assets/ui/table-texture.webp');
    expect(getUiAssetPath('table-texture')).toBe('/assets/ui/table-texture.webp');
    expect(getUiAssetPath('ui-button-primary')).toBe('/assets/ui/button-primary.webp');
    expect(getUiAssetPath('button-primary')).toBe('/assets/ui/button-primary.webp');
    expect(getHonorTokenPath()).toBe('/assets/tokens/honor-token.webp');
  });

  it('getNinjaCardBackPath & getHouseCardBackPath: 卡背路径（6F 布局用）', () => {
    expect(getNinjaCardBackPath()).toBe('/assets/visuals/ninja-card-back.webp');
    expect(getHouseCardBackPath()).toBe('/assets/visuals/house-card-back.webp');
  });

  it('6F.5-fix2: 卡面底部中文名 + data-tip（含名字/阶段/效果）', () => {
    const html = renderCardHtml('spy:3', 'inst-tip-1', true);
    expect(html).toContain('class="card-name"');
    expect(html).toContain('密探 3');
    expect(html).toContain('data-tip="');
    // tooltip 含阶段与效果（纯文本，CSS hover/:active 显示）
    expect(html).toContain('密探');
    expect(html).toContain('查看其 HOUSE 牌');
    // mini 小卡同样有名称条与 tooltip
    const mini = renderCardHtml('spy:3', 'inst-tip-2', false, 'mini');
    expect(mini).toContain('class="card-name"');
    expect(mini).toContain('data-tip="');
    // 无编号特殊牌也有名称与 tooltip，不渲染编号
    const special = renderCardHtml('mastermind', 'inst-tip-3', true);
    expect(special).toContain('大将军');
    expect(special).toContain('data-tip="');
    expect(special).toContain('揭示');
  });

  it('6F.5-fix2: 13 条文案全覆盖（base 去重）', () => {
    const bases = [
      'spy',
      'mystic',
      'shapeshifter',
      'grave_digger',
      'troublemaker',
      'spirit_merchant',
      'thief',
      'judge',
      'blind_assassin',
      'shinobi',
      'mirror_monk',
      'martyr',
      'mastermind',
    ];
    expect(Object.keys(CARD_DESCRIPTION_ZH).sort()).toEqual([...bases].sort());
    for (const b of bases) {
      expect(CARD_DESCRIPTION_ZH[b]?.length ?? 0).toBeGreaterThan(0);
      expect(CARD_PHASE_ZH[b]?.length ?? 0).toBeGreaterThan(0);
    }
  });
});
