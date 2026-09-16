import type { CardId, HouseId } from '../shared/types';

/** 阶段定义：决定属于哪个夜晚阶段 */
export type CardPhase = 'spy' | 'mystic' | 'trickster' | 'blind_assassin' | 'shinobi' | 'react' | 'reveal';

export interface CardDef {
  cardId: CardId;
  /** 与 cardId 相同的稳定标识 */
  nameEn: string;
  nameZh: string;
  phase: CardPhase;
  /** 夜晚同阶段结算顺序 1–6；react/reveal 为 null */
  number: number | null;
  /** 阶段 2 是否实现效果 */
  implemented: boolean;
}

/**
 * 阶段 2 临时 deck：与 docs/01 §7.3 一致，共 33 张。
 * 【待确认】官方张数分布 — 见文档。
 */
export const CARD_DEFS: readonly CardDef[] = [
  // spy ×8
  ...([1, 2, 3, 4, 4, 5, 5, 6] as const).map((number, i): CardDef => ({
    cardId: `spy:${number}:${i}`,
    nameEn: 'Spy',
    nameZh: '密探',
    phase: 'spy',
    number,
    implemented: true,
  })),
  // mystic ×3
  ...([2, 4, 6] as const).map((number, i): CardDef => ({
    cardId: `mystic:${number}:${i}`,
    nameEn: 'Mystic',
    nameZh: '隐士',
    phase: 'mystic',
    number,
    implemented: true,
  })),
  // tricksters ×6
  {
    cardId: 'shapeshifter:1',
    nameEn: 'Shapeshifter',
    nameZh: '变身者',
    phase: 'trickster',
    number: 1,
    implemented: false,
  },
  {
    cardId: 'grave_digger:2',
    nameEn: 'Grave Digger',
    nameZh: '掘墓人',
    phase: 'trickster',
    number: 2,
    implemented: false,
  },
  {
    cardId: 'troublemaker:3',
    nameEn: 'Troublemaker',
    nameZh: '捣乱者',
    phase: 'trickster',
    number: 3,
    implemented: false,
  },
  {
    cardId: 'spirit_merchant:4',
    nameEn: 'Spirit Merchant',
    nameZh: '灵商',
    phase: 'trickster',
    number: 4,
    implemented: false,
  },
  {
    cardId: 'thief:5',
    nameEn: 'Thief',
    nameZh: '盗贼',
    phase: 'trickster',
    number: 5,
    implemented: false,
  },
  {
    cardId: 'judge:6',
    nameEn: 'Judge',
    nameZh: '判官',
    phase: 'trickster',
    number: 6,
    implemented: false,
  },
  // BA ×5
  ...([1, 2, 3, 4, 5] as const).map((number, i): CardDef => ({
    cardId: `blind_assassin:${number}:${i}`,
    nameEn: 'Blind Assassin',
    nameZh: '盲眼刺客',
    phase: 'blind_assassin',
    number,
    implemented: true,
  })),
  // shinobi ×8
  ...([1, 1, 2, 2, 3, 4, 4, 5] as const).map((number, i): CardDef => ({
    cardId: `shinobi:${number}:${i}`,
    nameEn: 'Shinobi',
    nameZh: '上忍',
    phase: 'shinobi',
    number,
    implemented: true,
  })),
  // specials
  {
    cardId: 'mirror_monk',
    nameEn: 'Mirror Monk',
    nameZh: '镜僧',
    phase: 'react',
    number: null,
    implemented: false,
  },
  {
    cardId: 'martyr',
    nameEn: 'Martyr',
    nameZh: '殉道者',
    phase: 'react',
    number: null,
    implemented: false,
  },
  {
    cardId: 'mastermind',
    nameEn: 'Mastermind',
    nameZh: '幕后主脑',
    phase: 'reveal',
    number: null,
    implemented: false,
  },
];

export function getCardDef(cardId: string): CardDef {
  const def = CARD_DEFS.find((c) => c.cardId === cardId);
  if (!def) throw new Error(`unknown cardId: ${cardId}`);
  return def;
}

/** 4 人局：仙鹤/莲花各 1、2 */
export const HOUSES_4P: readonly HouseId[] = ['crane:1', 'crane:2', 'lotus:1', 'lotus:2'];

export function houseRank(houseId: HouseId): number {
  if (houseId === 'ronin') return 99;
  const rank = Number(houseId.split(':')[1]);
  return Number.isFinite(rank) ? rank : 99;
}

export function houseFamily(houseId: HouseId): 'crane' | 'lotus' | 'ronin' {
  if (houseId === 'ronin') return 'ronin';
  const fam = houseId.split(':')[0];
  if (fam === 'crane' || fam === 'lotus') return fam;
  return 'ronin';
}

export function totalNinjaCards(): number {
  return CARD_DEFS.filter((c) => c.phase !== 'react' || true).length;
}
