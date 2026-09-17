import { describe, expect, it } from 'vitest';
import { projectView } from '../../src/core/project-view';
import { forceNightSetup, makeAdapter } from '../fixtures/game';

/** 6F-fix4：掘墓人 gravePick 的 chooseTarget 必须携带牌面映射（UI 按卡面渲染，不裸显 id） */
describe('掘墓人选牌 pending 牌面映射', () => {
  it('pending.context.graveChoices 与 options 一一对应', () => {
    const a = makeAdapter(71, 4);
    const st = a.mutableState();
    st.zones.draftDiscard = [
      { instanceId: 'd1', cardId: 'spy:3', number: 3 },
      { instanceId: 'd2', cardId: 'mystic:4', number: 4 },
      { instanceId: 'd3', cardId: 'judge:6', number: 6 },
    ];
    forceNightSetup(a, { s0: [{ cardId: 'grave_digger:2', instanceId: 'gd1' }] }, 'nightTrickster');
    a.declare('s0', ['gd1']);
    const p = a.getState().pending[0];
    expect(p?.kind).toBe('chooseTarget');
    const graves = p?.context.graveChoices ?? [];
    expect(graves).toHaveLength(2);
    // 每个 option 都有 cardId 映射
    for (const o of p?.options ?? []) {
      expect(graves.some((g) => g.instanceId === o && typeof g.cardId === 'string')).toBe(true);
    }
  });

  it('actor 的 view 可见映射，他人 view 无 pending（不泄牌）', () => {
    const a = makeAdapter(72, 4);
    const st = a.mutableState();
    st.zones.draftDiscard = [
      { instanceId: 'd1', cardId: 'spy:3', number: 3 },
      { instanceId: 'd2', cardId: 'mystic:4', number: 4 },
    ];
    forceNightSetup(a, { s0: [{ cardId: 'grave_digger:2', instanceId: 'gd1' }] }, 'nightTrickster');
    a.declare('s0', ['gd1']);
    const selfView = projectView(a.getState(), 's0');
    expect(selfView?.pendingDecision?.context.graveChoices?.length).toBe(2);
    const otherView = projectView(a.getState(), 's1');
    expect(otherView?.pendingDecision).toBeNull();
  });
});
