import { CARD_DEFS } from '../../src/core/deck';
import type { GameState } from '../../src/core/game-state';
import { playableInstanceIds } from '../../src/core/night-flow';
import { createLocalAdapter, type LocalAdapter } from '../../src/dev/local-adapter';

export function makeAdapter(seed: number, playerCount = 4): LocalAdapter {
  return createLocalAdapter({
    seed,
    playerCount,
    nicknames: Array.from({ length: playerCount }, (_, i) => `P${i}`),
  });
}

export function forceNightSetup(
  adapter: LocalAdapter,
  hands: Record<string, Array<{ cardId: string; instanceId: string }>>,
  phase: GameState['phase'] = 'nightSpy',
): void {
  const st = adapter.mutableState();
  st.phase = phase;
  st.step = 'collectDeclarations';
  st.windowId = `w-test-${phase}-${st.eventSeq}`;
  st.resolveQueue = [];
  st.resolveContext = null;
  for (const seat of st.seats) {
    seat.declared = [];
    seat.declaredResponded = false;
    seat.hand = (hands[seat.seatId] ?? []).map((c) => ({
      instanceId: c.instanceId,
      cardId: c.cardId,
      number: numberFromCardId(c.cardId),
    }));
  }
  st.pending = st.seats
    .filter((s) => s.alive && playableInstanceIds(st, s).length > 0)
    .map((s) => ({
      id: `${st.windowId}:${s.seatId}`,
      seatId: s.seatId,
      kind: 'declareCards' as const,
      options: playableInstanceIds(st, s),
      deadline: null,
      defaultChoice: { kind: 'pass' as const },
      context: {
        phase: st.phase,
        step: 'collectDeclarations' as const,
        relatedInstanceIds: playableInstanceIds(st, s),
      },
    }));
}

function numberFromCardId(cardId: string): number | null {
  return CARD_DEFS.find((c) => c.cardId === cardId)?.number ?? null;
}

export const CHINESE_NAMES: Record<string, string> = {
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
};
