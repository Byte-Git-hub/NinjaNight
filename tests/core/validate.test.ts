import { describe, expect, it } from 'vitest';
import { createGame } from '../../src/core/setup';
import { validateTarget } from '../../src/core/validate';
import { findSeat } from '../../src/core/utils';

describe('validateTarget 裁定 A/B', () => {
  it('spy 不能自选', () => {
    const st = createGame({ seed: 1 });
    const actor = findSeat(st, 's0');
    if (!actor) throw new Error('no seat');
    const res = validateTarget(st, actor, { instanceId: 'x', cardId: 'spy:1:0', number: 1 }, 's0');
    expect(res.ok).toBe(false);
  });

  it('spy 可指向死亡者', () => {
    const st = createGame({ seed: 1 });
    const actor = findSeat(st, 's0');
    const target = findSeat(st, 's1');
    if (!actor || !target) throw new Error('no seat');
    target.alive = false;
    const res = validateTarget(st, actor, { instanceId: 'x', cardId: 'spy:1:0', number: 1 }, 's1');
    expect(res.ok).toBe(true);
  });

  it('blind_assassin 不能指向死亡者，可自杀', () => {
    const st = createGame({ seed: 1 });
    const actor = findSeat(st, 's0');
    const target = findSeat(st, 's1');
    if (!actor || !target) throw new Error('no seat');
    target.alive = false;
    expect(
      validateTarget(st, actor, { instanceId: 'x', cardId: 'blind_assassin:2:1', number: 2 }, 's1').ok,
    ).toBe(false);
    expect(
      validateTarget(st, actor, { instanceId: 'x', cardId: 'blind_assassin:2:1', number: 2 }, 's0').ok,
    ).toBe(true);
  });

  it('shinobi 可指向死亡者', () => {
    const st = createGame({ seed: 1 });
    const actor = findSeat(st, 's0');
    const target = findSeat(st, 's1');
    if (!actor || !target) throw new Error('no seat');
    target.alive = false;
    expect(
      validateTarget(st, actor, { instanceId: 'x', cardId: 'shinobi:1:0', number: 1 }, 's1').ok,
    ).toBe(true);
  });
});
