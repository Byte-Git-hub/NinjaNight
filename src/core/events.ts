import type { EventVisibility, GameEventType } from '../shared/types';
import type { GameState } from './game-state';

export function pushEvent(
  state: GameState,
  type: GameEventType,
  visibility: EventVisibility,
  payload: Record<string, unknown>,
): void {
  state.eventSeq += 1;
  state.events.push({
    id: `e${state.eventSeq}`,
    seq: state.eventSeq,
    type,
    round: state.round,
    visibility,
    payload,
  });
}
