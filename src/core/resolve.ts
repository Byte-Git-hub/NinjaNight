import type { PendingDecision, SeatId } from '../shared/types';
import type { CardInstance, GameState, QueuedCard } from './game-state';
import { findSeat, syncRngCalls } from './utils';
import { pushEvent } from './events';
import { legalTargetsForCard, validateTarget } from './validate';
import { tryAdvanceNightPhase } from './night-flow';

export function sortQueue(queue: QueuedCard[]): QueuedCard[] {
  return queue.slice().sort((a, b) => {
    const an = a.instance.number ?? 99;
    const bn = b.instance.number ?? 99;
    if (an !== bn) return an - bn;
    if (a.actorSeatId !== b.actorSeatId) return a.actorSeatId < b.actorSeatId ? -1 : 1;
    return a.instance.instanceId < b.instance.instanceId ? -1 : 1;
  });
}

export function revealDeclaredAndBuildQueue(state: GameState): void {
  state.step = 'revealDeclared';
  const declared: QueuedCard[] = [];
  for (const seat of state.seats) {
    for (const card of seat.declared) {
      declared.push({ instance: { ...card }, actorSeatId: seat.seatId });
      state.zones.revealedInPlay.push({ ...card });
      seat.hand = seat.hand.filter((c) => c.instanceId !== card.instanceId);
    }
    seat.declared = [];
  }
  pushEvent(state, 'night.cardsDeclared', 'public', {
    phase: state.phase,
    cards: declared.map((d) => ({
      actorSeatId: d.actorSeatId,
      cardId: d.instance.cardId,
      instanceId: d.instance.instanceId,
      number: d.instance.number,
    })),
  });
  state.resolveQueue = sortQueue(declared);
  state.pending = [];
  pumpResolveQueue(state);
}

export function pumpResolveQueue(state: GameState): void {
  state.step = 'resolveQueue';
  if (state.resolveQueue.length === 0) {
    tryAdvanceNightPhase(state);
    return;
  }
  const next = state.resolveQueue[0];
  if (!next) return;
  const actor = findSeat(state, next.actorSeatId);
  if (!actor || !actor.alive) {
    state.resolveQueue.shift();
    pumpResolveQueue(state);
    return;
  }
  startResolution(state, next.instance, next.actorSeatId);
}

function startResolution(state: GameState, instance: CardInstance, actorSeatId: SeatId): void {
  const actor = findSeat(state, actorSeatId);
  if (!actor) return;
  const base = instance.cardId.split(':')[0];

  if (base === 'spy' || base === 'mystic' || base === 'blind_assassin' || base === 'shinobi') {
    state.resolveContext = {
      kind: 'target',
      actorSeatId,
      instance: { ...instance },
      mayKill: base === 'shinobi',
    };
    state.step = 'chooseTarget';
    const options = legalTargetsForCard(state, actor, instance);
    const pending: PendingDecision = {
      id: `${state.windowId}:target:${instance.instanceId}`,
      seatId: actorSeatId,
      kind: 'chooseTarget',
      options,
      deadline: null,
      defaultChoice: options.length > 0 ? { kind: 'chooseFirstTarget' } : { kind: 'decline' },
      context: {
        phase: state.phase,
        step: 'chooseTarget',
        relatedInstanceIds: [instance.instanceId],
        cardId: instance.cardId,
      },
    };
    state.pending = [pending];
    return;
  }
  state.resolveQueue.shift();
  state.zones.spent.push({ ...instance });
  pumpResolveQueue(state);
}

export function applyTargetChoice(
  state: GameState,
  actorSeatId: SeatId,
  targetSeatId: SeatId,
): { ok: true } | { ok: false; reason: string } {
  const ctx = state.resolveContext;
  if (!ctx || ctx.kind !== 'target') return { ok: false, reason: 'noActiveWindow' };
  if (ctx.actorSeatId !== actorSeatId) return { ok: false, reason: 'notYourTurn' };
  const actor = findSeat(state, actorSeatId);
  const target = findSeat(state, targetSeatId);
  if (!actor || !target) return { ok: false, reason: 'illegalTarget' };

  const v = validateTarget(state, actor, ctx.instance, targetSeatId);
  if (!v.ok) return v;

  const base = ctx.instance.cardId.split(':')[0];

  if (base === 'spy') {
    snapshotHouse(state, actor, target, ctx.instance.cardId);
    finishInstance(state);
    return { ok: true };
  }

  if (base === 'mystic') {
    snapshotHouse(state, actor, target, ctx.instance.cardId);
    if (target.hand.length > 0) {
      const idx = state.rng.int(target.hand.length);
      syncRngCalls(state);
      const card = target.hand[idx];
      if (card) {
        pushEvent(
          state,
          'night.ninjaViewed',
          { seats: [actor.seatId] },
          {
            viewerSeatId: actor.seatId,
            targetSeatId: target.seatId,
            cardId: card.cardId,
            instanceId: card.instanceId,
          },
        );
      }
    }
    finishInstance(state);
    return { ok: true };
  }

  if (base === 'blind_assassin') {
    killSeat(state, targetSeatId);
    finishInstance(state);
    return { ok: true };
  }

  if (base === 'shinobi') {
    snapshotHouse(state, actor, target, ctx.instance.cardId);
    if (!target.alive) {
      finishInstance(state);
      return { ok: true };
    }
    state.resolveContext = {
      kind: 'optional',
      actorSeatId,
      instance: ctx.instance,
      targetSeatId,
      mayKill: true,
    };
    state.step = 'chooseOptional';
    state.pending = [
      {
        id: `${state.windowId}:opt:${ctx.instance.instanceId}`,
        seatId: actorSeatId,
        kind: 'chooseOptional',
        options: ['kill', 'spare'],
        deadline: null,
        defaultChoice: { kind: 'decline' },
        context: {
          phase: state.phase,
          step: 'chooseOptional',
          relatedInstanceIds: [ctx.instance.instanceId],
          cardId: ctx.instance.cardId,
        },
      },
    ];
    return { ok: true };
  }

  finishInstance(state);
  return { ok: true };
}

export function applyOptionalChoice(
  state: GameState,
  actorSeatId: SeatId,
  chooseKill: boolean,
): { ok: true } | { ok: false; reason: string } {
  const ctx = state.resolveContext;
  if (!ctx || ctx.kind !== 'optional') return { ok: false, reason: 'noActiveWindow' };
  if (ctx.actorSeatId !== actorSeatId) return { ok: false, reason: 'notYourTurn' };
  if (chooseKill && ctx.targetSeatId && ctx.mayKill) {
    const target = findSeat(state, ctx.targetSeatId);
    if (target?.alive) killSeat(state, ctx.targetSeatId);
  }
  pushEvent(state, 'night.optionalResolved', 'public', {
    actorSeatId,
    targetSeatId: ctx.targetSeatId,
    killed: chooseKill && ctx.mayKill,
  });
  finishInstance(state);
  return { ok: true };
}

function snapshotHouse(state: GameState, actor: SeatState, target: SeatState, viaCardId: string): void {
  actor.knownHouses.push({
    round: state.round,
    targetSeatId: target.seatId,
    houseId: target.house,
    viaCardId,
  });
  pushEvent(
    state,
    'night.houseViewed',
    { seats: [actor.seatId] },
    {
      viewerSeatId: actor.seatId,
      targetSeatId: target.seatId,
      houseId: target.house,
      viaCardId,
    },
  );
  pushEvent(state, 'night.targetChosen', 'public', {
    actorSeatId: actor.seatId,
    targetSeatId: target.seatId,
    cardId: viaCardId,
  });
}

function killSeat(state: GameState, targetSeatId: SeatId): void {
  const target = findSeat(state, targetSeatId);
  if (!target || !target.alive) return;
  target.alive = false;
  target.houseRevealed = false;
  pushEvent(state, 'night.playerDied', 'public', { seatId: targetSeatId });
}

export function finishInstance(state: GameState): void {
  const done = state.resolveQueue.shift();
  if (done) {
    state.zones.spent.push({ ...done.instance });
    pushEvent(state, 'night.cardResolved', 'public', {
      actorSeatId: done.actorSeatId,
      cardId: done.instance.cardId,
      instanceId: done.instance.instanceId,
    });
  }
  state.resolveContext = null;
  state.pending = [];
  pumpResolveQueue(state);
}

import type { SeatState } from './game-state';
