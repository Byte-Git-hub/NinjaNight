import type { CardId, HouseId } from '../shared/types';

export type CardPhase =
  | 'spy'
  | 'mystic'
  | 'trickster'
  | 'blind_assassin'
  | 'shinobi'
  | 'react'
  | 'reveal';

export interface CardDef {
  cardId: CardId;
  nameEn: string;
  nameZh: string;
  phase: CardPhase;
  number: number | null;
}

/** 冻结牌组：6×5 阶段 + 3 特殊 = 33（TBD-01） */
export const CARD_DEFS: readonly CardDef[] = [
  ...([1, 2, 3, 4, 5, 6] as const).map((number): CardDef => ({
    cardId: `spy:${number}`,
    nameEn: 'Spy',
    nameZh: '密探',
    phase: 'spy',
    number,
  })),
  ...([1, 2, 3, 4, 5, 6] as const).map((number): CardDef => ({
    cardId: `mystic:${number}`,
    nameEn: 'Mystic',
    nameZh: '隐士',
    phase: 'mystic',
    number,
  })),
  { cardId: 'shapeshifter:1', nameEn: 'Shapeshifter', nameZh: '百变者', phase: 'trickster', number: 1 },
  { cardId: 'grave_digger:2', nameEn: 'Grave Digger', nameZh: '掘墓人', phase: 'trickster', number: 2 },
  { cardId: 'troublemaker:3', nameEn: 'Troublemaker', nameZh: '捣蛋鬼', phase: 'trickster', number: 3 },
  { cardId: 'spirit_merchant:4', nameEn: 'Spirit Merchant', nameZh: '商人', phase: 'trickster', number: 4 },
  { cardId: 'thief:5', nameEn: 'Thief', nameZh: '盗贼', phase: 'trickster', number: 5 },
  { cardId: 'judge:6', nameEn: 'Judge', nameZh: '裁判', phase: 'trickster', number: 6 },
  ...([1, 2, 3, 4, 5, 6] as const).map((number): CardDef => ({
    cardId: `blind_assassin:${number}`,
    nameEn: 'Blind Assassin',
    nameZh: '刺客',
    phase: 'blind_assassin',
    number,
  })),
  ...([1, 2, 3, 4, 5, 6] as const).map((number): CardDef => ({
    cardId: `shinobi:${number}`,
    nameEn: 'Shinobi',
    nameZh: '上忍',
    phase: 'shinobi',
    number,
  })),
  { cardId: 'mirror_monk', nameEn: 'Mirror Monk', nameZh: '还施者', phase: 'react', number: null },
  { cardId: 'martyr', nameEn: 'Martyr', nameZh: '殉道者', phase: 'react', number: null },
  { cardId: 'mastermind', nameEn: 'Mastermind', nameZh: '大将军', phase: 'reveal', number: null },
];

export function getCardDef(cardId: string): CardDef {
  const def = CARD_DEFS.find((c) => c.cardId === cardId);
  if (!def) throw new Error(`unknown cardId: ${cardId}`);
  return def;
}

export function housesForPlayerCount(n: number): HouseId[] {
  if (n < 4 || n > 11) throw new Error('player count must be 4–11');
  const pairs = Math.floor(n / 2);
  const houses: HouseId[] = [];
  for (let r = 1; r <= pairs; r += 1) {
    houses.push(`crane:${r}`);
    houses.push(`lotus:${r}`);
  }
  if (n % 2 === 1) houses.push('ronin');
  return houses;
}

export function houseRank(houseId: HouseId): number {
  if (houseId === 'ronin') return 99;
  const rank = Number(houseId.split(':')[1]);
  return Number.isFinite(rank) ? rank : 99;
}

export function houseFamily(houseId: HouseId): 'crane' | 'lotus' | 'ronin' {
  if (houseId === 'ronin') return 'ronin';
  const fam = houseId.split(':')[0];
  return fam === 'crane' || fam === 'lotus' ? fam : 'ronin';
}

export function baseOf(cardId: string): string {
  return cardId.split(':')[0] ?? cardId;
}

export function cardNumber(cardId: string): number | null {
  const def = CARD_DEFS.find((c) => c.cardId === cardId);
  return def?.number ?? null;
}

export function totalNinjaCards(): number {
  return CARD_DEFS.length;
}
