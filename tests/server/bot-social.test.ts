import { describe, expect, it } from 'vitest';
import { buildSocialSummary, chooseSocialAction, createBotProfile, socialTriggersFromEvents, type SocialRng } from '../../src/server/bot/social-heuristic';
import { SOCIAL_TEMPLATES } from '../../src/server/bot/templates';
import type { PlayerView } from '../../src/shared/types';

const rng = (...values: number[]): SocialRng => { let i = 0; return { next: () => values[Math.min(i++, values.length - 1)] ?? 0, int: () => 0 }; };
function view(overrides: Partial<PlayerView> = {}): PlayerView {
  return { roomCode: 'ABC123', round: 1, phase: 'nightSpy', step: 'pending', windowId: 'w', pendingDecision: null,
    seats: [
      { seatId: 'bot', nickname: 'bot', connected: true, alive: true, isHost: false, honorTokenCount: 0, handCount: 1, isBot: true },
      { seatId: 'p2', nickname: 'p2', connected: true, alive: true, isHost: false, honorTokenCount: 0, handCount: 1, publicHouseId: 'OTHER_HOUSE' as never },
    ],
    self: { seatId: 'bot', houseId: 'OWN_HOUSE' as never, canViewOwnHouse: true, hand: [{ instanceId: 'secret-card', cardId: 'spy:1' as never, number: 1 }], reserved: [], draftHand: [], honorTokens: [], knownHouseHistory: [{ round: 1, targetSeatId: 'p2', houseId: 'HISTORY_HOUSE' as never }], declaredThisPhase: [], hasPending: false },
    events: [], revealedCards: [], gameOver: false, winners: [], ...overrides } as PlayerView;
}

describe('bot social Layer 1', () => {
  it('keeps each personality compact enough for varied local chatter', () => {
    expect(Object.values(SOCIAL_TEMPLATES).every((templates) => templates.length >= 5 && templates.length <= 10)).toBe(true);
  });

  it('always produces a local action when trigger probability accepts', () => {
    const v = view(); const profile = { ...createBotProfile('bot', rng(0)), personality: 'aggressive' as const, llmChance: 0.75, lastSocialAt: -Infinity, lastWordsUsed: false };
    const action = chooseSocialAction(v, profile, { kind: 'roundStart', key: 'r1' }, rng(0, 0.1, 0.1, 0.1));
    expect(action).toBeTruthy();
  });

  it('only the viewed seat can receive a private-view trigger', () => {
    const v = view({ events: [{ id: 'e1', seq: 1, type: 'night.houseViewed', round: 1, visibility: { seats: ['viewer'] }, payload: { viewerSeatId: 'viewer', targetSeatId: 'p2' } }] });
    expect(socialTriggersFromEvents(v, 0)).toEqual([]);
  });

  it('last words are generated once and summary omits other secrets', () => {
    const v = view(); const profile = { ...createBotProfile('bot', rng(0)), personality: 'cautious' as const, llmChance: 0.35, lastSocialAt: -Infinity, lastWordsUsed: false };
    const t = { kind: 'lastWords' as const, key: 'death' };
    const first = chooseSocialAction(v, profile, t, rng(0, 0));
    expect(first?.kind).toBe('chat'); profile.lastWordsUsed = true;
    expect(chooseSocialAction(v, profile, t, rng(0, 0))).toBeNull();
    const json = JSON.stringify(buildSocialSummary(v, profile, t));
    expect(json).toContain('OWN_HOUSE'); expect(json).not.toContain('OTHER_HOUSE'); expect(json).not.toContain('HISTORY_HOUSE'); expect(json).not.toContain('secret-card'); expect(json).not.toContain('knownHouseHistory');
    const hidden = view({ self: { ...v.self, canViewOwnHouse: false } });
    expect(JSON.stringify(buildSocialSummary(hidden, profile, t))).not.toContain('OWN_HOUSE');
  });

  it('personality changes the social action mix and never targets a dead seat', () => {
    const v = view({ seats: [
      { seatId: 'bot', nickname: 'bot', connected: true, alive: true, isHost: false, honorTokenCount: 0, handCount: 1, isBot: true },
      { seatId: 'dead', nickname: 'dead', connected: true, alive: false, isHost: false, honorTokenCount: 0, handCount: 0 },
      { seatId: 'live', nickname: 'live', connected: true, alive: true, isHost: false, honorTokenCount: 0, handCount: 1 },
    ] });
    const aggressive = { ...createBotProfile('bot', rng(0)), personality: 'aggressive' as const, llmChance: 0.75, lastSocialAt: -Infinity, lastWordsUsed: false };
    const action = chooseSocialAction(v, aggressive, { kind: 'playerDied', key: 'd', targetSeatId: 'dead' }, rng(0, 0.73, 0.1));
    expect(action?.kind).toBe('effect');
    expect(action && 'targetSeatId' in action ? action.targetSeatId : '').toBe('live');
  });
});
