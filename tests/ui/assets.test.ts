import { describe, expect, it } from 'vitest';
import {
  getVisualId,
  getVisualPath,
  getCardNumber,
  getCardDisplayName,
  renderCardHtml,
  getUiAssetPath,
  getHonorTokenPath,
} from '../../src/ui/assets';

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
    expect(getVisualPath('spy')).toBe('/assets/visuals/spy.jpg');
    expect(getVisualPath('crane')).toBe('/assets/visuals/crane.jpg');
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
    expect(htmlWithNum).toContain('src="/assets/visuals/spy.jpg"');
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
    expect(getUiAssetPath('ui-lobby-bg')).toBe('/assets/ui/lobby-bg.jpg');
    expect(getUiAssetPath('lobby-bg')).toBe('/assets/ui/lobby-bg.jpg');
    expect(getUiAssetPath('ui-table-texture')).toBe('/assets/ui/table-texture.jpg');
    expect(getUiAssetPath('table-texture')).toBe('/assets/ui/table-texture.jpg');
    expect(getUiAssetPath('ui-button-primary')).toBe('/assets/ui/button-primary.jpg');
    expect(getUiAssetPath('button-primary')).toBe('/assets/ui/button-primary.jpg');
    expect(getHonorTokenPath()).toBe('/assets/tokens/honor-token.jpg');
  });
});
