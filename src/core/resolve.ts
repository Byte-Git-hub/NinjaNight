import type { PendingDecision, SeatId } from '../shared/types';
import { baseOf, getCardDef } from './deck';
import type { CardInstance, GameState, QueuedCard, SeatState } from './game-state';
import { pushEvent } from './events';
import { tryAdvanceNightPhase } from './night-flow';
import { drawToken } from './tokens';
import { findSeat, syncRngCalls } from './utils';
import { legalTargetsForCard, validateTarget } from './validate';

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
  // 过滤死亡发动者（TBD-08）
  state.resolveQueue = state.resolveQueue.filter((q) => {
    const actor = findSeat(state, q.actorSeatId);
    if (actor && !actor.alive) {
      state.zones.spent.push({ ...q.instance });
      pushEvent(state, 'night.cardResolved', 'server', {
        actorSeatId: q.actorSeatId,
        cardId: q.instance.cardId,
        voided: true,
      });
      return false;
    }
    return true;
  });

  if (state.resolveQueue.length === 0) {
    tryAdvanceNightPhase(state);
    return;
  }
  const next = state.resolveQueue[0];
  if (!next) return;
  startCardResolution(state, next.instance, next.actorSeatId);
}

function setPending(
  state: GameState,
  kind: PendingDecision['kind'],
  options: string[],
  cardId?: string,
  graveChoices?: { instanceId: string; cardId: string }[],
): void {
  const actor = state.resolveContext?.actorSeatId;
  if (!actor) return;
  state.pending = [
    {
      id: `${state.windowId}:${kind}:${state.resolveContext?.instance.instanceId ?? 'x'}:${state.eventSeq}`,
      seatId: actor,
      kind,
      options,
      deadline: null,
      defaultChoice:
        options.length > 0
          ? kind === 'chooseOptional' || kind === 'reactDecide'
            ? { kind: 'decline' }
            : { kind: 'autoPick', optionId: options[0] as string }
          : { kind: 'decline' },
      context: {
        phase: state.phase,
        step: state.step,
        relatedInstanceIds: state.resolveContext ? [state.resolveContext.instance.instanceId] : [],
        cardId,
        ...(graveChoices ? { graveChoices } : {}),
      },
    },
  ];
}

function startCardResolution(state: GameState, instance: CardInstance, actorSeatId: SeatId): void {
  const actor = findSeat(state, actorSeatId);
  if (!actor || !actor.alive) {
    state.resolveQueue.shift();
    pumpResolveQueue(state);
    return;
  }
  const b = baseOf(instance.cardId);
  state.resolveContext = {
    actorSeatId,
    instance: { ...instance },
    step: 'target',
    targets: [],
  };
  state.step = 'chooseTarget';

  if (b === 'shapeshifter') {
    state.resolveContext.step = 'targetA';
    const opts = legalTargetsForCard(state, actor, instance);
    setPending(state, 'chooseTarget', opts, instance.cardId);
    return;
  }
  if (b === 'grave_digger') {
    startGraveDigger(state);
    return;
  }
  if (b === 'spirit_merchant') {
    const opts = legalTargetsForCard(state, actor, instance);
    if (opts.length === 0) {
      // 无合法目标（仅剩自己）：牌面作废，不下发空选项 pending（防 bot/超时卡死）
      finishInstance(state);
      return;
    }
    setPending(state, 'chooseTarget', opts, instance.cardId);
    return;
  }
  if (b === 'troublemaker') {
    const opts = legalTargetsForCard(state, actor, instance);
    if (opts.length === 0) {
      finishInstance(state);
      return;
    }
    setPending(state, 'chooseTarget', opts, instance.cardId);
    return;
  }
  if (b === 'thief') {
    const opts = legalTargetsForCard(state, actor, instance);
    if (opts.length === 0) {
      finishInstance(state);
      return;
    }
    setPending(state, 'chooseTarget', opts, instance.cardId);
    return;
  }
  if (b === 'judge' || b === 'blind_assassin' || b === 'spy' || b === 'mystic' || b === 'shinobi') {
    const opts = legalTargetsForCard(state, actor, instance);
    if (opts.length === 0) {
      // 无合法目标（如密探/隐士只剩自己存活）：牌面作废，不下发空选项 pending
      finishInstance(state);
      return;
    }
    setPending(state, 'chooseTarget', opts, instance.cardId);
    return;
  }
  finishInstance(state);
}

function startGraveDigger(state: GameState): void {
  const ctx = state.resolveContext;
  if (!ctx) return;
  if (state.zones.draftDiscard.length < 2) {
    finishInstance(state);
    return;
  }
  const picked: CardInstance[] = [];
  const pool = state.zones.draftDiscard.slice();
  for (let i = 0; i < 2; i += 1) {
    const idx = state.rng.int(pool.length);
    syncRngCalls(state);
    const c = pool.splice(idx, 1)[0];
    if (c) picked.push({ ...c });
  }
  ctx.graveChoices = picked;
  ctx.step = 'gravePick';
  state.step = 'chooseTarget';
  setPending(
    state,
    'chooseTarget',
    picked.map((c) => c.instanceId),
    ctx.instance.cardId,
    picked.map((c) => ({ instanceId: c.instanceId, cardId: c.cardId })),
  );
}

/** 统一处理目标选择 */
export function applyTargetChoice(
  state: GameState,
  actorSeatId: SeatId,
  targetSeatId: SeatId,
): { ok: true } | { ok: false; reason: string } {
  const ctx = state.resolveContext;
  if (!ctx || ctx.actorSeatId !== actorSeatId) return { ok: false, reason: 'noActiveWindow' };
  const actor = findSeat(state, actorSeatId);
  if (!actor) return { ok: false, reason: 'illegalTarget' };
  const b = baseOf(ctx.instance.cardId);

  // 掘墓人选牌（target 是牌实例 id，不是座位）
  if (ctx.step === 'gravePick') {
    const choice = ctx.graveChoices?.find((c) => c.instanceId === targetSeatId);
    if (!choice) return { ok: false, reason: 'illegalTarget' };
    state.zones.draftDiscard = state.zones.draftDiscard.filter(
      (c) => c.instanceId !== choice.instanceId,
    );
    pushEvent(
      state,
      'night.cardResolved',
      { seats: [actorSeatId] },
      {
        actorSeatId,
        cardId: 'grave_digger:2',
        dug: choice.cardId,
        instanceId: choice.instanceId,
      },
    );
    ctx.gravePick = { ...choice };
    ctx.graveChoices = [{ ...choice }];
    ctx.step = 'graveImmediate';
    state.step = 'chooseOptional';
    state.pending = [
      {
        id: `${state.windowId}:grave-imm:${choice.instanceId}`,
        seatId: actorSeatId,
        kind: 'chooseOptional',
        options: ['play_now', 'reserve'],
        deadline: null,
        defaultChoice: { kind: 'autoPick', optionId: 'reserve' },
        context: {
          phase: state.phase,
          step: 'chooseOptional',
          relatedInstanceIds: [choice.instanceId],
          cardId: choice.cardId,
        },
      },
    ];
    return { ok: true };
  }

  // 商人查看类型二选一：view_house / view_honor【官方】
  if (ctx.step === 'merchantView') {
    if (targetSeatId !== 'view_honor' && targetSeatId !== 'view_house') {
      return { ok: false, reason: 'illegalTarget' };
    }
    const tid = ctx.targets[0];
    const target0 = tid ? findSeat(state, tid) : undefined;
    if (!target0) return { ok: false, reason: 'illegalTarget' };
    if (targetSeatId === 'view_honor') {
      ctx.viewKind = 'honor';
      if (target0.tokens.length === 0) {
        finishInstance(state);
        return { ok: true };
      }
      // 随机查看一枚令牌面值（只看这一枚）
      const idx = state.rng.int(target0.tokens.length);
      syncRngCalls(state);
      const seen = target0.tokens[idx];
      if (!seen) {
        finishInstance(state);
        return { ok: true };
      }
      ctx.seenTokenId = seen.instanceId;
      ctx.seenTokenValue = seen.value;
      pushEvent(state, 'night.houseViewed', { seats: [actorSeatId] }, {
        viewerSeatId: actorSeatId,
        targetSeatId: target0.seatId,
        view: 'honor',
        tokenInstanceId: seen.instanceId,
        honorFace: seen.value,
      });
    } else {
      ctx.viewKind = 'house';
      ctx.seenTokenId = undefined;
      ctx.seenTokenValue = undefined;
      snapshotHouse(state, actor, target0, ctx.instance.cardId);
    }
    // 进入交换阶段（可选）
    if (actor.tokens.length === 0 || target0.tokens.length === 0) {
      finishInstance(state);
      return { ok: true };
    }
    beginMerchantExchange(state, actorSeatId);
    return { ok: true };
  }

  // 商人：选择自己给出的令牌（或放弃）
  if (ctx.step === 'merchantGive') {
    if (targetSeatId === 'no_swap') {
      finishInstance(state);
      return { ok: true };
    }
    const give = actor.tokens.find((t) => t.instanceId === targetSeatId);
    if (!give) return { ok: false, reason: 'illegalTarget' };
    ctx.giveTokenId = give.instanceId;
    ctx.step = 'merchantTake';
    const tid = ctx.targets[0];
    const target0 = tid ? findSeat(state, tid) : undefined;
    if (!target0 || target0.tokens.length === 0) {
      finishInstance(state);
      return { ok: true };
    }
    const takeOpts: string[] = [];
    if (
      ctx.viewKind === 'honor' &&
      ctx.seenTokenId &&
      target0.tokens.some((t) => t.instanceId === ctx.seenTokenId)
    ) {
      takeOpts.push('seen');
    }
    takeOpts.push('random');
    state.step = 'chooseTarget';
    state.pending = [
      {
        id: `${state.windowId}:sm-take:${ctx.instance.instanceId}`,
        seatId: actorSeatId,
        kind: 'merchantExchange',
        options: takeOpts,
        deadline: null,
        defaultChoice: { kind: 'autoPick', optionId: 'random' },
        context: {
          phase: state.phase,
          step: 'chooseTarget',
          relatedInstanceIds: [ctx.instance.instanceId],
          cardId: ctx.instance.cardId,
        },
      },
    ];
    return { ok: true };
  }

  // 商人：选择拿回方式并同步交换
  if (ctx.step === 'merchantTake') {
    if (targetSeatId !== 'seen' && targetSeatId !== 'random') {
      return { ok: false, reason: 'illegalTarget' };
    }
    const tid = ctx.targets[0];
    const target0 = tid ? findSeat(state, tid) : undefined;
    if (!target0) return { ok: false, reason: 'illegalTarget' };

    // 候选池：严格排除自己刚给出的那枚（不允许拿回自己刚给出的那枚）
    const candidatePool = target0.tokens.filter((t) => t.instanceId !== ctx.giveTokenId);

    // 目标手里只有刚给出的那枚时，random 无合法对象，降级为 no_swap
    if (candidatePool.length === 0) {
      finishInstance(state);
      return { ok: true };
    }

    let take = undefined as (typeof actor.tokens)[number] | undefined;
    if (targetSeatId === 'seen' && ctx.seenTokenId) {
      take = candidatePool.find((t) => t.instanceId === ctx.seenTokenId);
      if (!take) return { ok: false, reason: 'illegalTarget' };
      target0.tokens = target0.tokens.filter((t) => t.instanceId !== take!.instanceId);
    } else {
      // 随机再拿一枚
      // 1. 目标仅 1 枚：random 等价于 seen
      if (candidatePool.length === 1) {
        take = candidatePool[0];
      } else {
        // 目标有多枚：若看过 HONOR 且还有其他令牌，排除刚看的那枚
        let randomPool = candidatePool;
        if (ctx.viewKind === 'honor' && ctx.seenTokenId) {
          const filtered = candidatePool.filter((t) => t.instanceId !== ctx.seenTokenId);
          if (filtered.length > 0) randomPool = filtered;
        }
        const ri = state.rng.int(randomPool.length);
        syncRngCalls(state);
        take = randomPool[ri];
      }
      if (!take) {
        finishInstance(state);
        return { ok: true };
      }
      target0.tokens = target0.tokens.filter((t) => t.instanceId !== take!.instanceId);
    }
    const giveIdx = actor.tokens.findIndex((t) => t.instanceId === ctx.giveTokenId);
    if (giveIdx < 0 || !take) {
      finishInstance(state);
      return { ok: true };
    }
    const [give] = actor.tokens.splice(giveIdx, 1);
    if (give) target0.tokens.push(give);
    actor.tokens.push(take);
    pushEvent(state, 'score.honorAwarded', 'public', {
      swapped: true,
      a: actorSeatId,
      b: target0.seatId,
      giveTokenId: give?.instanceId,
      takeTokenId: take.instanceId,
      takeWasSeen: targetSeatId === 'seen' || (targetSeatId === 'random' && take.instanceId === ctx.seenTokenId),
    });
    finishInstance(state);
    return { ok: true };
  }

  const target = findSeat(state, targetSeatId);
  if (!target) return { ok: false, reason: 'illegalTarget' };

  // 百变者 A
  if (b === 'shapeshifter' && ctx.step === 'targetA') {
    const v = validateTarget(state, actor, ctx.instance, targetSeatId);
    // shapeshifter 任意目标，validate 返回 ok
    if (!v.ok) return v;
    ctx.targets = [targetSeatId];
    ctx.step = 'targetB';
    state.step = 'chooseTarget';
    // targetB 禁止重复选 targets[0]：直接从选项剔除，不下发非法选项。
    // 否则 bot 按 options 随机命中即被 illegalTarget 拒收，且 scheduler 已消费
    // schedKey 不重试、forceAdvance 默认 options[0] 同样非法 → 永久卡死。
    const first = ctx.targets[0] as string;
    const opts = state.seats.map((s) => s.seatId).filter((id) => id !== first);
    if (opts.length === 0) {
      finishInstance(state);
      return { ok: true };
    }
    setPending(state, 'chooseTarget', opts, ctx.instance.cardId);
    return { ok: true };
  }

  // 百变者 B → 查看两人并问是否交换
  if (b === 'shapeshifter' && ctx.step === 'targetB') {
    if (ctx.targets[0] === targetSeatId) {
      // 允许同一人两次？规则为两人；禁止重复
      return { ok: false, reason: 'illegalTarget' };
    }
    const a = findSeat(state, ctx.targets[0] as string);
    const c = findSeat(state, targetSeatId);
    if (!a || !c) return { ok: false, reason: 'illegalTarget' };
    actor.knownHouses.push({
      round: state.round,
      targetSeatId: a.seatId,
      houseId: a.house,
      viaCardId: ctx.instance.cardId,
    });
    actor.knownHouses.push({
      round: state.round,
      targetSeatId: c.seatId,
      houseId: c.house,
      viaCardId: ctx.instance.cardId,
    });
    pushEvent(state, 'night.houseViewed', { seats: [actorSeatId] }, {
      viewerSeatId: actorSeatId,
      seats: [a.seatId, c.seatId],
      houses: [a.house, c.house],
    });
    ctx.targets = [a.seatId, c.seatId];
    ctx.step = 'swapOrNot';
    state.step = 'chooseOptional';
    state.pending = [
      {
        id: `${state.windowId}:swap:${ctx.instance.instanceId}`,
        seatId: actorSeatId,
        kind: 'chooseOptional',
        options: ['swap', 'keep'],
        deadline: null,
        defaultChoice: { kind: 'autoPick', optionId: 'keep' },
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

  // 商人 / 捣蛋鬼 / 盗贼 / 刺杀等
  const v = validateTarget(state, actor, ctx.instance, targetSeatId);
  if (!v.ok) return v;

  if (b === 'spy') {
    snapshotHouse(state, actor, target, ctx.instance.cardId);
    finishInstance(state);
    return { ok: true };
  }
  if (b === 'mystic') {
    snapshotHouse(state, actor, target, ctx.instance.cardId);
    if (target.hand.length > 0) {
      const idx = state.rng.int(target.hand.length);
      syncRngCalls(state);
      const card = target.hand[idx];
      if (card) {
        pushEvent(state, 'night.ninjaViewed', { seats: [actorSeatId] }, {
          viewerSeatId: actorSeatId,
          targetSeatId: target.seatId,
          cardId: card.cardId,
          instanceId: card.instanceId,
        });
      }
    }
    finishInstance(state);
    return { ok: true };
  }
  if (b === 'blind_assassin') {
    resolveKill(state, targetSeatId, actorSeatId, false);
    return { ok: true };
  }
  if (b === 'shinobi') {
    snapshotHouse(state, actor, target, ctx.instance.cardId);
    if (!target.alive) {
      finishInstance(state);
      return { ok: true };
    }
    ctx.step = 'optionalKill';
    ctx.targets = [targetSeatId];
    ctx.mayKill = true;
    state.step = 'chooseOptional';
    state.pending = [
      {
        id: `${state.windowId}:sk:${ctx.instance.instanceId}`,
        seatId: actorSeatId,
        kind: 'chooseOptional',
        options: ['kill', 'spare'],
        deadline: null,
        defaultChoice: { kind: 'autoPick', optionId: 'spare' },
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
  if (b === 'troublemaker') {
    snapshotHouse(state, actor, target, ctx.instance.cardId);
    ctx.step = 'troubleReveal';
    ctx.targets = [targetSeatId];
    state.step = 'chooseOptional';
    state.pending = [
      {
        id: `${state.windowId}:tr:${ctx.instance.instanceId}`,
        seatId: actorSeatId,
        kind: 'chooseOptional',
        options: ['reveal', 'hide'],
        deadline: null,
        defaultChoice: { kind: 'autoPick', optionId: 'hide' },
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
  if (b === 'spirit_merchant') {
    // 查看类型必选二选一【官方】：house | honor
    ctx.targets = [targetSeatId];
    ctx.step = 'merchantView';
    state.step = 'chooseTarget';
    state.pending = [
      {
        id: `${state.windowId}:smview:${ctx.instance.instanceId}`,
        seatId: actorSeatId,
        kind: 'merchantChoose',
        options: ['view_house', 'view_honor'],
        deadline: null,
        defaultChoice: { kind: 'autoPick', optionId: 'view_house' },
        context: {
          phase: state.phase,
          step: 'chooseTarget',
          relatedInstanceIds: [ctx.instance.instanceId],
          cardId: ctx.instance.cardId,
        },
      },
    ];
    return { ok: true };
  }
  if (b === 'thief') {
    pushEvent(state, 'house.revealed', 'public', {
      seatId: actorSeatId,
      houseId: actor.house,
      by: 'thief',
    });
    actor.houseRevealed = true;
    const t = target.tokens.shift();
    if (t) actor.tokens.push(t);
    pushEvent(state, 'score.honorAwarded', 'public', {
      from: targetSeatId,
      to: actorSeatId,
      count: 1,
    });
    finishInstance(state);
    return { ok: true };
  }
  if (b === 'judge') {
    pushEvent(state, 'house.revealed', 'public', {
      seatId: actorSeatId,
      houseId: actor.house,
      by: 'judge',
    });
    actor.houseRevealed = true;
    // 无反应窗
    if (target.alive) {
      target.alive = false;
      pushEvent(state, 'night.playerDied', 'public', { seatId: targetSeatId, by: 'judge' });
    }
    finishInstance(state);
    return { ok: true };
  }

  finishInstance(state);
  return { ok: true };
}

export function applyOptionalChoice(
  state: GameState,
  actorSeatId: SeatId,
  choose: boolean,
): { ok: true } | { ok: false; reason: string } {
  const ctx = state.resolveContext;
  if (!ctx || ctx.actorSeatId !== actorSeatId) return { ok: false, reason: 'noActiveWindow' };
  const b = baseOf(ctx.instance.cardId);
  const actor = findSeat(state, actorSeatId);

  if (b === 'shapeshifter' && ctx.step === 'swapOrNot') {
    if (choose) {
      const a = findSeat(state, ctx.targets[0] as string);
      const c = findSeat(state, ctx.targets[1] as string);
      if (a && c) {
        const ha = a.house;
        a.house = c.house;
        c.house = ha;
        // 不刷新 knownHouses，不提示
        pushEvent(state, 'night.cardResolved', 'server', {
          actorSeatId,
          swapped: true,
          seats: [a.seatId, c.seatId],
        });
      }
    }
    finishInstance(state);
    return { ok: true };
  }

  if (ctx.step === 'graveImmediate') {
    const choice = ctx.graveChoices?.[0];
    if (!choice) {
      finishInstance(state);
      return { ok: true };
    }
    if (choose) {
      // 澄清 B【网页版】：已过去阶段（spy/mystic）与当前阶段可立即打出；未来阶段进 reserved
      const phaseOrder = ['spy', 'mystic', 'trickster', 'blind_assassin', 'shinobi'];
      const currentBase = (() => {
        switch (state.phase) {
          case 'nightSpy': return 'spy';
          case 'nightMystic': return 'mystic';
          case 'nightTrickster': return 'trickster';
          case 'nightBlindAssassin': return 'blind_assassin';
          case 'nightShinobi': return 'shinobi';
          default: return 'trickster';
        }
      })();
      const cardBase = baseOf(choice.cardId);
      const ci = phaseOrder.indexOf(currentBase);
      const bi = phaseOrder.indexOf(cardBase);
      // react/reveal 等非阶段牌 → reserved
      const isPhaseCard = bi >= 0;
      const isPastOrCurrent = isPhaseCard && bi <= ci;
      const isFuture = isPhaseCard && bi > ci;

      if (isPastOrCurrent) {
        // 立即打出：入队重排并结算
        state.resolveQueue.shift(); // 移除掘墓人本身
        state.zones.spent.push({ ...ctx.instance });
        state.zones.revealedInPlay.push({ ...choice });
        pushEvent(state, 'night.cardResolved', 'public', {
          actorSeatId,
          cardId: ctx.instance.cardId,
          instanceId: ctx.instance.instanceId,
        });
        const reinserted: QueuedCard = { instance: { ...choice }, actorSeatId };
        state.resolveQueue.push(reinserted);
        state.resolveQueue = sortQueue(state.resolveQueue);
        state.resolveContext = null;
        state.pending = [];
        pumpResolveQueue(state);
        return { ok: true };
      }
      // 未来阶段（刺客/上忍）或非阶段牌 → reserved
      if (isFuture || !isPhaseCard) {
        actor?.reserved.push({ ...choice });
        pushEvent(state, 'night.cardResolved', { seats: [actorSeatId] }, {
          actorSeatId,
          reserved: true,
          cardId: choice.cardId,
        });
        pumpResolveQueue(state);
        return { ok: true };
      }
    }
    // 保留
    actor?.reserved.push({ ...choice });
    pushEvent(state, 'night.cardResolved', { seats: [actorSeatId] }, {
      actorSeatId,
      reserved: true,
      cardId: choice.cardId,
    });
    finishInstance(state);
    return { ok: true };
  }

  if (b === 'shinobi' && ctx.step === 'optionalKill') {
    if (choose) {
      const tid = ctx.targets[0];
      if (tid) resolveKill(state, tid, actorSeatId, false);
      else finishInstance(state);
    } else {
      pushEvent(state, 'night.optionalResolved', 'public', { actorSeatId, killed: false });
      finishInstance(state);
    }
    return { ok: true };
  }

  if (b === 'troublemaker' && ctx.step === 'troubleReveal') {
    if (choose) {
      const tid = ctx.targets[0];
      const target = tid ? findSeat(state, tid) : undefined;
      if (target) {
        target.houseRevealed = true;
        pushEvent(state, 'house.revealed', 'public', {
          seatId: target.seatId,
          houseId: target.house,
          by: 'troublemaker',
        });
      }
    }
    finishInstance(state);
    return { ok: true };
  }

  finishInstance(state);
  return { ok: true };
}

export function applyReactChoice(
  state: GameState,
  actorSeatId: SeatId,
  react: boolean,
): { ok: true } | { ok: false; reason: string } {
  const ctx = state.resolveContext;
  if (!ctx?.react || ctx.react.victimSeatId !== actorSeatId) {
    return { ok: false, reason: 'noActiveWindow' };
  }
  const victim = findSeat(state, actorSeatId);
  const killer = ctx.react.killerSeatId ? findSeat(state, ctx.react.killerSeatId) : null;
  if (!victim) return { ok: false, reason: 'illegalTarget' };
  const hasMirror = !!victim.hand.find((c) => c.cardId === 'mirror_monk');
  const hasMartyr = !!victim.hand.find((c) => c.cardId === 'martyr');

  if (!react || (!hasMirror && !hasMartyr)) {
    completeKill(state, actorSeatId, false);
    return { ok: true };
  }

  // TBD-06：同开 → 自己死+凶手死+得令牌；仅镜僧 → 凶手死、自己活；仅殉道 → 自己死+得令牌
  if (hasMirror) {
    victim.hand = victim.hand.filter((c) => c.cardId !== 'mirror_monk');
    state.zones.spent.push({
      instanceId: `react-mirror-${state.eventSeq}`,
      cardId: 'mirror_monk',
      number: null,
    });
    if (killer && killer.alive) {
      killer.alive = false;
      pushEvent(state, 'night.playerDied', 'public', {
        seatId: killer.seatId,
        by: 'mirror_monk',
      });
    }
  }
  if (hasMartyr) {
    victim.hand = victim.hand.filter((c) => c.cardId !== 'martyr');
    state.zones.spent.push({
      instanceId: `react-martyr-${state.eventSeq}`,
      cardId: 'martyr',
      number: null,
    });
    const t = drawToken(state);
    if (t) victim.tokens.push(t);
  }
  // 自己死亡：有殉道，或镜僧反杀失败且无其他保护
  const shouldDie = hasMartyr || (!hasMirror && false) || hasMartyr;
  // 规则：仅镜僧成功反杀时自己不死；有殉道必死；同开必死
  if (hasMartyr || !hasMirror) {
    if (victim.alive) {
      victim.alive = false;
      pushEvent(state, 'night.playerDied', 'public', {
        seatId: actorSeatId,
        reacted: true,
        by: hasMartyr ? 'martyr' : 'kill',
      });
    }
  } else if (hasMirror && !hasMartyr) {
    // 凶手已死则自己存活；凶手未死（非法）仍尝试杀死目标
    if (killer && killer.alive) {
      victim.alive = false;
      pushEvent(state, 'night.playerDied', 'public', { seatId: actorSeatId, reacted: true });
    }
  }
  void shouldDie;
  pushEvent(state, 'react.resolved', 'public', { victimSeatId: actorSeatId });
  finishInstance(state);
  return { ok: true };
}

function completeKill(state: GameState, victimId: SeatId, _reacted: boolean, _mirror?: boolean): void {
  const victim = findSeat(state, victimId);
  if (victim && victim.alive) {
    victim.alive = false;
    pushEvent(state, 'night.playerDied', 'public', { seatId: victimId, reacted: true });
  }
  pushEvent(state, 'react.resolved', 'public', { victimSeatId: victimId });
  finishInstance(state);
}

/** BA / Shinobi 杀，含反应窗 */
export function resolveKill(
  state: GameState,
  targetSeatId: SeatId,
  killerSeatId: SeatId,
  fromJudge: boolean,
): void {
  const target = findSeat(state, targetSeatId);
  const ctx = state.resolveContext;
  if (!target || !target.alive) {
    finishInstance(state);
    return;
  }
  const hasMirror = target.hand.some((c) => c.cardId === 'mirror_monk');
  const hasMartyr = target.hand.some((c) => c.cardId === 'martyr');
  if (!fromJudge && (hasMirror || hasMartyr) && ctx) {
    ctx.react = { victimSeatId: targetSeatId, killerSeatId, fromJudge: false, opening: true };
    state.step = 'reactWindow';
    state.pending = [
      {
        id: `${state.windowId}:react:${ctx.instance.instanceId}`,
        seatId: targetSeatId,
        kind: 'reactDecide',
        options: ['react', 'decline'],
        deadline: null,
        defaultChoice: { kind: 'autoPick', optionId: 'decline' },
        context: {
          phase: state.phase,
          step: 'reactWindow',
          relatedInstanceIds: [ctx.instance.instanceId],
          cardId: ctx.instance.cardId,
        },
      },
    ];
    pushEvent(state, 'react.opened', 'public', { victimSeatId: targetSeatId });
    return;
  }
  target.alive = false;
  pushEvent(state, 'night.playerDied', 'public', { seatId: targetSeatId });
  finishInstance(state);
}

function snapshotHouse(
  state: GameState,
  actor: SeatState,
  target: SeatState,
  viaCardId: string,
): void {
  actor.knownHouses.push({
    round: state.round,
    targetSeatId: target.seatId,
    houseId: target.house,
    viaCardId,
  });
  pushEvent(state, 'night.houseViewed', { seats: [actor.seatId] }, {
    viewerSeatId: actor.seatId,
    targetSeatId: target.seatId,
    houseId: target.house,
    viaCardId,
  });
  pushEvent(state, 'night.targetChosen', 'public', {
    actorSeatId: actor.seatId,
    targetSeatId: target.seatId,
    cardId: viaCardId,
  });
}

/** 商人：进入交换决策（给出令牌或放弃） */
function beginMerchantExchange(state: GameState, actorSeatId: SeatId): void {
  const ctx = state.resolveContext;
  const actor = findSeat(state, actorSeatId);
  if (!ctx || !actor) return;
  ctx.step = 'merchantGive';
  const giveOpts = ['no_swap', ...actor.tokens.map((t) => t.instanceId)];
  state.step = 'chooseTarget';
  state.pending = [
    {
      id: `${state.windowId}:sm-give:${ctx.instance.instanceId}`,
      seatId: actorSeatId,
      kind: 'merchantExchange',
      options: giveOpts,
      deadline: null,
      defaultChoice: { kind: 'autoPick', optionId: 'no_swap' },
      context: {
        phase: state.phase,
        step: 'chooseTarget',
        relatedInstanceIds: [ctx.instance.instanceId],
        cardId: ctx.instance.cardId,
      },
    },
  ];
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

export { getCardDef };
