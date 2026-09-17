import { VISUAL_MAP } from '../../scripts/gen-assets/prompts';

export const CARD_CN: Record<string, string> = {
  spy: '密探',
  mystic: '隐士',
  shapeshifter: '百变者',
  grave_digger: '掘墓人',
  troublemaker: '捣蛋鬼',
  spirit_merchant: '商人',
  thief: '盗贼',
  judge: '裁判',
  blind_assassin: '刺客',
  shinobi: '上忍',
  mirror_monk: '还施者',
  martyr: '殉道者',
  mastermind: '大将军',
  crane: '仙鹤',
  lotus: '莲花',
  ronin: '浪人',
};

/**
 * 根据 cardId 反查其归属的视觉单元 ID (visualId)
 * 例：getVisualId('spy-3') -> 'spy'
 */
export function getVisualId(cardId: string): string {
  const norm = cardId.replace(':', '-');
  const base = cardId.split(/[:-]/)[0] ?? cardId;

  for (const [visId, list] of Object.entries(VISUAL_MAP)) {
    if (visId === cardId || visId === base || visId === norm) return visId;
    if (list.includes(norm) || list.includes(cardId) || list.includes(base)) return visId;
  }
  return base;
}

/**
 * 返回卡牌图片路径 '/assets/visuals/{visualId}.webp'
 */
export function getVisualPath(visualId: string): string {
  return `/assets/visuals/${visualId}.webp`;
}

/**
 * UI 素材映射表（对齐无前缀文件名：lobby-bg.webp / table-texture.webp / button-primary.webp）
 */
export const UI_ASSETS: Record<string, string> = {
  'ui-lobby-bg': '/assets/ui/lobby-bg.webp',
  'lobby-bg': '/assets/ui/lobby-bg.webp',
  'ui-table-texture': '/assets/ui/table-texture.webp',
  'table-texture': '/assets/ui/table-texture.webp',
  'ui-button-primary': '/assets/ui/button-primary.webp',
  'button-primary': '/assets/ui/button-primary.webp',
};

/**
 * 获取 UI 材质/背景资源路径
 */
export function getUiAssetPath(id: string): string {
  if (UI_ASSETS[id]) return UI_ASSETS[id];
  const stripped = id.replace(/^ui-/, '');
  return `/assets/ui/${stripped}.webp`;
}

/**
 * 获取荣誉标记图片路径
 */
export function getHonorTokenPath(): string {
  return '/assets/tokens/honor-token.webp';
}

/**
 * 获取忍者牌卡背图片路径（6F 桌游感布局用：他人手牌背面展示）
 */
export function getNinjaCardBackPath(): string {
  return '/assets/visuals/ninja-card-back.webp';
}

/**
 * 获取身份牌卡背图片路径（6F 桌游感布局用：未公开身份牌展示）
 */
export function getHouseCardBackPath(): string {
  return '/assets/visuals/house-card-back.webp';
}

/**
 * 从 cardId 解析编号（如 'spy-3' -> 3, 'spy:3' -> 3, 'shapeshifter' -> null, 'ronin' -> null）
 */
export function getCardNumber(cardId: string): number | null {
  const parts = cardId.split(/[:-]/);
  if (parts.length >= 2) {
    const n = Number(parts[1]);
    if (!Number.isNaN(n) && Number.isFinite(n)) return n;
  }
  return null;
}

/**
 * 返回卡牌中文显示名（如 'spy-3' -> '密探 3', 'spy:3' -> '密探 3', 'shapeshifter' -> '百变者'）
 */
export function getCardDisplayName(cardId: string): string {
  const base = cardId.split(/[:-]/)[0] ?? cardId;
  const num = getCardNumber(cardId);
  const cn = CARD_CN[base] ?? base;
  return num !== null ? `${cn} ${num}` : cn;
}

/**
 * 获取阵营/身份中文显示名（如 'crane:2' -> '仙鹤 · 地位 2', 'lotus:1' -> '莲花 · 地位 1', 'ronin' -> '浪人'）
 */
export function getHouseDisplayName(houseId?: string): string {
  if (!houseId) return '未知';
  if (houseId === 'ronin') return '浪人';
  const parts = houseId.split(/[:-]/);
  const fam = parts[0];
  const rank = parts[1];
  const famZh = fam === 'crane' ? '仙鹤' : fam === 'lotus' ? '莲花' : fam;
  return rank ? `${famZh} · 地位 ${rank}` : famZh;
}

/**
 * 渲染卡面内部 DOM：
 * - img src 指向 getVisualPath(getVisualId(cardId))
 * - img onerror 时显示占位色块 + 卡名文字
 * - 在卡面顶部留白区（12% 高度）叠加编号大字
 */
export function renderCardHtml(
  cardId: string,
  instanceId?: string,
  isButton = true,
  extraClasses = '',
  dataOpt?: string,
): string {
  const visualId = getVisualId(cardId);
  const visualPath = getVisualPath(visualId);
  const displayName = getCardDisplayName(cardId);
  const num = getCardNumber(cardId);
  const numHtml =
    num !== null
      ? `<div class="card-number" data-number="${num}">${num}</div>`
      : '';

  const tag = isButton ? 'button' : 'span';
  const iidAttr = instanceId ? ` data-iid="${instanceId}"` : '';
  const optAttr = dataOpt ? ` data-opt="${dataOpt}"` : '';
  const typeAttr = isButton ? ' type="button"' : '';
  const classAttr = extraClasses ? ` ${extraClasses}` : '';

  return `<${tag} class="card${classAttr}"${iidAttr}${optAttr}${typeAttr}>
    <div class="card-inner">
      <img class="card-art" src="${visualPath}" alt="${displayName}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />
      <div class="card-placeholder">
        <span class="card-placeholder-text">${displayName}</span>
      </div>
      ${numHtml}
    </div>
  </${tag}>`;
}
