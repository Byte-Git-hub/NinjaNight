import type { Rng } from '../../core/rng';
import { PHRASES } from '../../data/phrases';
import {
  EFFECT_ITEM_IDS,
  REACTION_EMOJI_IDS,
  type EffectItemId,
  type ReactionEmojiId,
} from '../../shared/protocol';
import type { GameEvent, GamePhase, PlayerView } from '../../shared/types';
import { SOCIAL_TEMPLATES, type SocialTemplate } from './templates';

export type BotPersonality = 'aggressive' | 'cautious' | 'deceptive';
export type SocialRng = Pick<Rng, 'next' | 'int'>;
export type SocialTriggerKind =
  | 'roundStart' | 'playerDied' | 'selfViewed' | 'selfSwapped'
  | 'reactionOpened' | 'beforeHouseReveal' | 'lastWords';

export interface SocialTrigger {
  kind: SocialTriggerKind;
  key: string;
  targetSeatId?: string;
}

export interface BotProfile {
  seatId: string;
  personality: BotPersonality;
  llmChance: number;
  lastSocialAt: number;
  /** One last message per game, even though players revive in later rounds. */
  lastWordsUsed: boolean;
}

export type SocialAction =
  | { kind: 'chat'; text: string }
  | { kind: 'phrase'; phraseId: number }
  | { kind: 'reaction'; targetSeatId: string; emojiId: ReactionEmojiId }
  | { kind: 'effect'; targetSeatId: string; itemId: EffectItemId };

export const PERSONALITIES: readonly BotPersonality[] = ['aggressive', 'cautious', 'deceptive'];
export const LLM_CHANCE: Readonly<Record<BotPersonality, number>> = {
  aggressive: 0.75, cautious: 0.35, deceptive: 0.55,
};
export const TRIGGER_PROBABILITIES: Readonly<Record<SocialTriggerKind, Readonly<Record<BotPersonality, number>>>> = {
  roundStart: { aggressive: 0.85, cautious: 0.35, deceptive: 0.55 },
  playerDied: { aggressive: 0.9, cautious: 0.3, deceptive: 0.6 },
  selfViewed: { aggressive: 0.75, cautious: 0.25, deceptive: 0.5 },
  selfSwapped: { aggressive: 0.75, cautious: 0.25, deceptive: 0.5 },
  reactionOpened: { aggressive: 0.8, cautious: 0.2, deceptive: 0.5 },
  beforeHouseReveal: { aggressive: 0.7, cautious: 0.3, deceptive: 0.6 },
  lastWords: { aggressive: 1, cautious: 1, deceptive: 1 },
};

export function createBotProfile(seatId: string, rng: SocialRng): BotProfile {
  const personality = PERSONALITIES[rng.int(PERSONALITIES.length)] ?? 'cautious';
  return { seatId, personality, llmChance: LLM_CHANCE[personality], lastSocialAt: -Infinity, lastWordsUsed: false };
}

/** Explicit allowlist: this is the only view-derived JSON sent to an LLM. */
export interface SocialSummary {
  personality: BotPersonality;
  trigger: SocialTriggerKind;
  round: number;
  phase: GamePhase;
  aliveCount: number;
  self: { houseId: string; alive: boolean };
}

export function buildSocialSummary(view: PlayerView, profile: BotProfile, trigger: SocialTrigger): SocialSummary {
  return {
    personality: profile.personality,
    trigger: trigger.kind,
    round: view.round,
    phase: view.phase,
    aliveCount: view.seats.filter((s) => s.alive).length,
    self: {
      houseId: view.self.canViewOwnHouse ? view.self.houseId : '',
      alive: view.seats.find((s) => s.seatId === view.self.seatId)?.alive ?? false,
    },
  };
}

function visibleToSelf(event: GameEvent, selfSeat: string): boolean {
  return event.visibility === 'public' ||
    (typeof event.visibility === 'object' && event.visibility.seats.includes(selfSeat));
}

/** Inspect only projected events; private views by somebody else never become a trigger. */
export function socialTriggersFromEvents(view: PlayerView, afterSeq: number): SocialTrigger[] {
  const triggers: SocialTrigger[] = [];
  for (const event of view.events) {
    if (event.seq <= afterSeq || event.round !== view.round || !visibleToSelf(event, view.self.seatId)) continue;
    const payload = event.payload;
    if (event.type === 'night.playerDied' && typeof payload['seatId'] === 'string') {
      triggers.push({ kind: payload['seatId'] === view.self.seatId ? 'lastWords' : 'playerDied', key: event.id, targetSeatId: payload['seatId'] });
    } else if (event.type === 'react.opened') {
      triggers.push({ kind: 'reactionOpened', key: event.id, ...(typeof payload['victimSeatId'] === 'string' ? { targetSeatId: payload['victimSeatId'] } : {}) });
    } else if ((event.type === 'night.houseViewed' || event.type === 'night.ninjaViewed') &&
      payload['viewerSeatId'] !== view.self.seatId &&
      (payload['targetSeatId'] === view.self.seatId || (Array.isArray(payload['seats']) && payload['seats'].includes(view.self.seatId)))) {
      triggers.push({ kind: 'selfViewed', key: event.id });
    } else if (event.type === 'night.optionalResolved' && payload['swapped'] === true &&
      event.visibility !== 'public' && payload['targetSeatId'] === view.self.seatId) {
      // Current engine does not notify swap targets. Do not infer a swap from a new houseId.
      triggers.push({ kind: 'selfSwapped', key: event.id });
    }
  }
  return triggers;
}

function preferTemplate(template: SocialTemplate, view: PlayerView): boolean {
  const cards = [...view.self.hand, ...view.self.reserved, ...(view.self.draftHand ?? [])];
  switch (template.preference) {
    case 'attack': return cards.some((c) => c.cardId.startsWith('shinobi:') || c.cardId.startsWith('blind_assassin:'));
    case 'defence': return cards.some((c) => c.cardId === 'mirror_monk' || c.cardId === 'martyr');
    case 'alone': return view.self.houseId === 'ronin';
    case 'fewAlive': return view.seats.filter((s) => s.alive).length <= 3;
    default: return false;
  }
}

/** Pure Layer 1: own projected view + injected social RNG, never the game's RNG/state. */
export function chooseSocialAction(
  view: PlayerView,
  profile: BotProfile,
  trigger: SocialTrigger,
  rng: SocialRng,
): SocialAction | null {
  const selfAlive = view.seats.find((s) => s.seatId === view.self.seatId)?.alive ?? false;
  if (view.gameOver || (!selfAlive && trigger.kind !== 'lastWords')) return null;
  if (trigger.kind === 'lastWords' && profile.lastWordsUsed) return null;
  if (rng.next() >= TRIGGER_PROBABILITIES[trigger.kind][profile.personality]) return null;

  const templates = SOCIAL_TEMPLATES[profile.personality];
  const specific = templates.filter((t) => t.triggers?.includes(trigger.kind));
  const preferred = templates.filter((t) => preferTemplate(t, view));
  const pool = trigger.kind === 'lastWords' ? specific : [...specific, ...preferred, ...templates.filter((t) => !t.triggers && !t.preference)];
  const text = pool[rng.int(pool.length)]?.text ?? templates[0].text;
  if (trigger.kind === 'lastWords') return { kind: 'chat', text };

  // Keep social actions believable: aggressive bots poke people more often,
  // cautious bots mostly talk, and deceptive bots mix a visible reaction with
  // an ambiguous line. Dead seats are not valid social targets.
  const actionRoll = rng.next();
  const targets = view.seats.filter((s) => s.seatId !== view.self.seatId && s.alive);
  const target = targets.find((s) => s.seatId === trigger.targetSeatId) ?? targets[rng.int(targets.length)];
  const effectCutoff = profile.personality === 'aggressive' ? 0.72 : profile.personality === 'deceptive' ? 0.82 : 0.92;
  const reactionCutoff = profile.personality === 'aggressive' ? 0.48 : profile.personality === 'deceptive' ? 0.58 : 0.78;
  if (target && actionRoll >= effectCutoff) {
    const preferredItem: EffectItemId = profile.personality === 'aggressive' ? 'egg' : profile.personality === 'cautious' ? 'tea' : 'secret_letter';
    return { kind: 'effect', targetSeatId: target.seatId, itemId: rng.next() < 0.7 ? preferredItem : EFFECT_ITEM_IDS[rng.int(EFFECT_ITEM_IDS.length)] };
  }
  if (target && actionRoll >= reactionCutoff) {
    return { kind: 'reaction', targetSeatId: target.seatId, emojiId: REACTION_EMOJI_IDS[rng.int(REACTION_EMOJI_IDS.length)] };
  }
  const phraseId = PHRASES.indexOf(text);
  return phraseId >= 0 ? { kind: 'phrase', phraseId } : { kind: 'chat', text };
}
