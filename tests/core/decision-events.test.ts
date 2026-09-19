import { describe, it, expect } from 'vitest';
import { createGame, enterNightPhase } from '../../src/core/engine';
import type { GameEvent } from '../../src/shared/types';

describe('Player Decision Events (night.decision)', () => {
  it('records night.decision events with decisionType, reason and timestamp', () => {
    const state = createGame({
      roomCode: 'TEST01',
      seed: 42,
      playerCount: 4,
      nicknames: ['N0', 'N1', 'N2', 'N3'],
    });

    enterNightPhase(state, 'nightSpy');

    const decisions = state.events.filter((e: GameEvent) => e.type === 'night.decision');
    expect(decisions.length).toBeGreaterThan(0);

    for (const d of decisions) {
      expect(d.visibility).toBe('public');
      const p = d.payload as Record<string, unknown>;
      expect(p['seatId']).toBeDefined();
      expect(p['nickname']).toBeDefined();
      expect(p['round']).toBe(state.round);
      expect(typeof p['phase']).toBe('string');
      expect(typeof p['timestamp']).toBe('number');
      expect((p['timestamp'] as number)).toBeGreaterThan(0);
      expect(['play_card', 'pass_by_choice', 'no_matching', 'timed_out', 'dead_skip']).toContain(p['decisionType']);
    }
  });

  it('records no_matching with no_card_in_hand for players without matching cards in a single phase', () => {
    const state = createGame({
      roomCode: 'TEST02',
      seed: 42,
      playerCount: 4,
      nicknames: ['N0', 'N1', 'N2', 'N3'],
    });

    for (const s of state.seats) {
      s.hand = [];
    }
    state.events = [];
    enterNightPhase(state, 'nightSpy');


    const spyNoMatches = state.events.filter(
      (e: GameEvent) =>
        e.type === 'night.decision' &&
        (e.payload as Record<string, unknown>)['phase'] === 'nightSpy' &&
        (e.payload as Record<string, unknown>)['decisionType'] === 'no_matching'
    );
    expect(spyNoMatches.length).toBe(4);
    for (const e of spyNoMatches) {
      expect((e.payload as Record<string, unknown>)['reason']).toBe('no_card_in_hand');
    }
  });

  it('records dead_skip for dead players at start of phase', () => {
    const state = createGame({
      roomCode: 'TEST03',
      seed: 42,
      playerCount: 4,
      nicknames: ['N0', 'N1', 'N2', 'N3'],
    });

    state.seats[1]!.alive = false;

    enterNightPhase(state, 'nightSpy');

    const deadSkips = state.events.filter(
      (e: GameEvent) => e.type === 'night.decision' && (e.payload as Record<string, unknown>)['decisionType'] === 'dead_skip'
    );
    expect(deadSkips.some((e: GameEvent) => (e.payload as Record<string, unknown>)['seatId'] === 's1')).toBe(true);
  });
});
