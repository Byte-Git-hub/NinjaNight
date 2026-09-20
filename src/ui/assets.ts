import { VISUAL_MAP } from '../../scripts/gen-assets/prompts';
import { CARD_DESCRIPTION_ZH, CARD_PHASE_ZH } from '../data/card-text';

/**
 * 6I：静态资源统一走 vite base（GitHub Pages 项目站为 /<repo>/，本地/Vercel 为 '/'）。
 * public/ 下文件构建时原样拷贝到 dist，运行时用 base 拼接，子路径部署不 404。
 * node 工程（vitest）无 vite/client 类型，base 由 main.ts 经 setAssetBase 注入，
 * 默认 '/'（本地/dev/测试行为不变）。
 *
 * 注意：默认值必须保持 '/'，不能直接取 import.meta.env.BASE_URL——
 * 本文件同时被 tsconfig.node 程序引用（scripts/simulate-llm-games.ts），
 * 那边没有 vite/client 类型会编译失败。模块顶层就求值的 URL 常量
 * （如 effects/items.ts 的 EFFECT_ITEMS.img）必须写成 lazy getter，
 * 等 setAssetBase() 跑完后再取值，否则线上子路径会请求 /assets/...（丢前缀）而 404。
 */
let ASSET_BASE = '/';

export function setAssetBase(base: string): void {
  ASSET_BASE = base.endsWith('/') ? base : `${base}/`;
}

export function assetUrl(p: string): string {
  return `${ASSET_BASE}${p.replace(/^\//, '')}`;
}

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
  return assetUrl(`assets/visuals/${visualId}.webp`);
}

/**
 * UI 素材路径（对齐无前缀文件名：lobby-bg.webp / table-texture.webp / button-primary.webp）。
 * 必须 lazy 计算：模块顶层求值早于 main.ts 的 setAssetBase()，eager 会冻结 '/' 前缀，
 * GitHub Pages 子路径部署即 404（与 EFFECT_ITEMS.img 的 getter 同理）。
 */
function uiAssetUrl(name: string): string {
  return assetUrl(`assets/ui/${name}.webp`);
}

/** 保留导出以兼容旧引用；取值一律走 lazy 计算，不再模块顶层冻结。 */
export const UI_ASSETS: Record<string, string> = {
  get 'ui-lobby-bg'() { return uiAssetUrl('lobby-bg'); },
  get 'lobby-bg'() { return uiAssetUrl('lobby-bg'); },
  get 'ui-table-texture'() { return uiAssetUrl('table-texture'); },
  get 'table-texture'() { return uiAssetUrl('table-texture'); },
  get 'ui-button-primary'() { return uiAssetUrl('button-primary'); },
  get 'button-primary'() { return uiAssetUrl('button-primary'); },
  get 'ui-washi-central-bg'() { return uiAssetUrl('washi-central-bg'); },
  get 'washi-central-bg'() { return uiAssetUrl('washi-central-bg'); },
  get 'ui-table-emblem'() { return uiAssetUrl('table-emblem'); },
  get 'table-emblem'() { return uiAssetUrl('table-emblem'); },
  get 'ui-identity-modal-bg'() { return uiAssetUrl('identity-modal-bg'); },
  get 'identity-modal-bg'() { return uiAssetUrl('identity-modal-bg'); },
};

/**
 * 获取桌心家徽装饰路径（6F-2 座位环中央装饰，PNG/JPG 半透明叠加）
 */
export function getTableEmblemPath(): string {
  return assetUrl('assets/ui/table-emblem.webp');
}

/**
 * 获取 UI 材质/背景资源路径
 */
export function getUiAssetPath(id: string): string {
  if (UI_ASSETS[id]) return UI_ASSETS[id];
  const stripped = id.replace(/^ui-/, '');
  return assetUrl(`assets/ui/${stripped}.webp`);
}

/**
 * 获取荣誉标记图片路径
 */
export function getHonorTokenPath(): string {
  return assetUrl('assets/tokens/honor-token-cutout.webp');
}

/**
 * 获取忍者牌卡背图片路径（6F 桌游感布局用：他人手牌背面展示）
 */
export function getNinjaCardBackPath(): string {
  return assetUrl('assets/visuals/ninja-card-back.webp');
}

/**
 * 获取身份牌卡背图片路径（6F 桌游感布局用：未公开身份牌展示）
 */
export function getHouseCardBackPath(): string {
  return assetUrl('assets/visuals/house-card-back.webp');
}

/**
 * 快捷表情 12 定稿（对齐 emoji-sheet 切割产物 public/assets/emoji/*.webp）
 */
export const EMOJI_IDS = [
  'swords',
  'kunai',
  'ninja_head',
  'noh_mask',
  'flame',
  'water',
  'moon',
  'star',
  'tea_cup',
  'bamboo',
  'kitsune_mask',
  'scroll',
] as const;
export type EmojiId = (typeof EMOJI_IDS)[number];

/**
 * 返回互动物品图片路径 '/assets/items/{itemId}.webp'（6G-2b 图集切割产物）
 */
export function getItemPath(itemId: string): string {
  return assetUrl(`assets/items/${itemId}.webp`);
}

/**
 * 返回快捷表情图片路径 '/assets/emoji/{emojiId}.webp'（6G-2b 图集切割产物）
 */
export function getEmojiPath(emojiId: string): string {
  return assetUrl(`assets/emoji/${emojiId}.webp`);
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
 * - 底部名称条（6F.5-fix2）+ data-tip 纯文本 tooltip（名字/编号/效果/阶段，CSS hover/:active 显示）
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

  const base = cardId.split(/[:-]/)[0] ?? cardId;
  const desc = CARD_DESCRIPTION_ZH[base] ?? '';
  const phaseZh = CARD_PHASE_ZH[base] ?? '';
  const tipText = `${displayName}｜阶段：${phaseZh}｜${desc}`;
  const tipAttr = ` data-tip="${escapeAttr(tipText)}"`;

  const tag = isButton ? 'button' : 'span';
  const iidAttr = instanceId ? ` data-iid="${instanceId}"` : '';
  const optAttr = dataOpt ? ` data-opt="${dataOpt}"` : '';
  const typeAttr = isButton ? ' type="button"' : '';
  const classAttr = extraClasses ? ` ${extraClasses}` : '';

  return `<${tag} class="card${classAttr}"${iidAttr}${optAttr}${typeAttr}${tipAttr}>
    <div class="card-inner">
      <img class="card-art" src="${visualPath}" alt="${displayName}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />
      <div class="card-placeholder">
        <span class="card-placeholder-text">${displayName}</span>
      </div>
      ${numHtml}
      <div class="card-name">${displayName}</div>
    </div>
  </${tag}>`;
}

function escapeAttr(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function getDrawPilePath(): string {
  return assetUrl('assets/ui/draw-pile.webp');
}

export function getStampFailedPath(): string {
  return assetUrl('assets/ui/stamp-failed.webp');
}
