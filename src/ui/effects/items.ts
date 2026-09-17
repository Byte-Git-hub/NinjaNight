/**
 * 6G-2b 互动物品视觉定义（定稿 9 种，id 与 src/shared/protocol.EFFECT_ITEM_IDS 对齐，不得改名）。
 * 图标走图集切割产物（getItemPath），不保留 emoji 兜底；Canvas 用 drawImage 绘制。
 * 6G-4a：全部尺寸从 EFFECT_ICON_SIZE 取，不散落（particle 系为 Canvas 绘制边长 px）。
 */
import type { EffectItemId } from '../../shared/protocol';
import { EMOJI_IDS, type EmojiId, getItemPath } from '../assets';

/** 6G-4a 物品/表情图标尺寸集中定义（px） */
export const EFFECT_ICON_SIZE = {
  /** 飞向目标的粒子（Canvas 主粒子绘制边长） */
  particle: 32,
  /** 连击时最大放大（Canvas 主粒子绘制边长上限） */
  particleMax: 48,
  /** 若保留选择器预览，预览图边长（当前无预览弹窗，备用） */
  preview: 96,
  /** 座位卡上的痕迹小图标 / 互动条按钮图标边长 */
  badge: 20,
} as const;

export interface EffectItemMeta {
  id: EffectItemId;
  /** 定稿中文名（UI 按钮文案用） */
  name: string;
  /** 切割产物路径（/assets/items/{id}.webp） */
  img: string;
  /** 粒子主色 */
  color: string;
  /** 粒子副色 */
  color2: string;
}

export const EFFECT_ITEMS: EffectItemMeta[] = [
  { id: 'egg', name: '鸡蛋', img: getItemPath('egg'), color: '#fef3c7', color2: '#f59e0b' },
  { id: 'sakura', name: '樱花', img: getItemPath('sakura'), color: '#fbcfe8', color2: '#ec4899' },
  { id: 'geta', name: '破木屐', img: getItemPath('geta'), color: '#d6a35c', color2: '#92400e' },
  { id: 'rotten_pill', name: '烂药丸', img: getItemPath('rotten_pill'), color: '#a3e635', color2: '#4d7c0f' },
  { id: 'basket', name: '竹篮', img: getItemPath('basket'), color: '#fcd34d', color2: '#b45309' },
  { id: 'secret_letter', name: '密信', img: getItemPath('secret_letter'), color: '#e2e8f0', color2: '#38bdf8' },
  { id: 'tea', name: '敬茶', img: getItemPath('tea'), color: '#86efac', color2: '#15803d' },
  { id: 'snowball', name: '雪玉', img: getItemPath('snowball'), color: '#e0f2fe', color2: '#0284c7' },
  { id: 'shuriken', name: '手里剑', img: getItemPath('shuriken'), color: '#fde68a', color2: '#b45309' },
];

const ITEM_MAP: ReadonlyMap<string, EffectItemMeta> = new Map(EFFECT_ITEMS.map((m) => [m.id, m]));

export function getEffectItem(id: string): EffectItemMeta | undefined {
  return ITEM_MAP.get(id);
}

/** 快捷表情 12 个（定稿；对齐 emoji-sheet 切割产物，复用同一 Canvas 层，座位卡上方浮 3s 淡出） */
export const QUICK_EMOJIS: readonly EmojiId[] = EMOJI_IDS;

export function isQuickEmoji(v: unknown): v is EmojiId {
  return typeof v === 'string' && (QUICK_EMOJIS as readonly string[]).includes(v);
}
