import { describe, expect, it } from 'vitest';
import { eventToSfx, effectTimbre, SFX_NAMES } from '../../src/ui/audio/sfx';
import {
  loadSoundSettings,
  saveSoundSettings,
  DEFAULT_SOUND_SETTINGS,
} from '../../src/ui/audio/settings';

describe('6H-1 音效映射', () => {
  it('11 个音效名齐备', () => {
    expect(SFX_NAMES).toHaveLength(11);
  });

  it('事件 → 音效全映射', () => {
    const self = 's0';
    expect(eventToSfx('night.cardsDeclared', {}, self)).toBe('card-play');
    expect(eventToSfx('house.revealed', {}, self)).toBe('card-reveal');
    expect(eventToSfx('night.houseViewed', {}, self)).toBe('view-success');
    expect(eventToSfx('night.ninjaViewed', {}, self)).toBe('view-success');
    expect(eventToSfx('score.honorAwarded', { tokenValue: 3 }, self)).toBe('token-gain');
    expect(eventToSfx('night.phaseStarted', {}, self)).toBe('phase-change');
    expect(eventToSfx('react.opened', {}, self)).toBe('phase-change');
    expect(eventToSfx('score.roundWinner', {}, self)).toBe('round-win');
    expect(eventToSfx('score.victory', {}, self)).toBe('game-win');
  });

  it('kill/self-die 按受害者区分', () => {
    expect(eventToSfx('night.playerDied', { seatId: 's1' }, 's0')).toBe('kill');
    expect(eventToSfx('night.playerDied', { seatId: 's0' }, 's0')).toBe('self-die');
  });

  it('未知事件返回 null', () => {
    expect(eventToSfx('draft.cardPicked', {}, 's0')).toBe(null);
    expect(eventToSfx('whatever', {}, 's0')).toBe(null);
  });

  it('物品三类音色', () => {
    expect(effectTimbre('shuriken')).toBe('hard');
    expect(effectTimbre('geta')).toBe('hard');
    expect(effectTimbre('sakura')).toBe('bright');
    expect(effectTimbre('snowball')).toBe('bright');
    expect(effectTimbre('egg')).toBe('soft');
    expect(effectTimbre('unknown')).toBe('soft');
  });
});

describe('6H-1 音效设置持久化', () => {
  function fakeStorage(initial?: string): Pick<Storage, 'getItem' | 'setItem'> & { data: Record<string, string> } {
    const data: Record<string, string> = initial !== undefined ? { 'ninja-night:sound-settings': initial } : {};
    return {
      data,
      getItem: (k: string) => data[k] ?? null,
      setItem: (k: string, v: string) => {
        data[k] = v;
      },
    };
  }

  it('空存储返回默认', () => {
    expect(loadSoundSettings(fakeStorage())).toEqual(DEFAULT_SOUND_SETTINGS);
  });

  it('损坏 JSON 返回默认', () => {
    expect(loadSoundSettings(fakeStorage('not-json'))).toEqual(DEFAULT_SOUND_SETTINGS);
  });

  it('音量钳制 0–1', () => {
    expect(loadSoundSettings(fakeStorage('{"enabled":true,"volume":9}')).volume).toBe(1);
    expect(loadSoundSettings(fakeStorage('{"enabled":true,"volume":-2}')).volume).toBe(0);
  });

  it('保存后可读回', () => {
    const st = fakeStorage();
    saveSoundSettings({ enabled: false, volume: 0.3 }, st);
    expect(loadSoundSettings(st)).toEqual({ enabled: false, volume: 0.3, bgmEnabled: false, bgmVolume: 0.5 });
  });

  it('旧存档（无 bgm 字段） back-compat，默认 BGM 关闭', () => {
    const loaded = loadSoundSettings(fakeStorage('{"enabled":true,"volume":0.7}'));
    expect(loaded.bgmEnabled).toBe(false);
    expect(loaded.bgmVolume).toBe(0.5);
  });
});

describe('6H-2 BGM 轨道映射', () => {
  it('夜晚五阶段 → night', async () => {
    const { phaseToBgmTrack } = await import('../../src/ui/audio/bgm');
    for (const p of ['nightSpy', 'nightMystic', 'nightTrickster', 'nightBlindAssassin', 'nightShinobi']) {
      expect(phaseToBgmTrack(p, false)).toBe('night');
    }
  });

  it('揭示/计分/胜负/终局 → reveal，选牌/大厅 → null', async () => {
    const { phaseToBgmTrack } = await import('../../src/ui/audio/bgm');
    for (const p of ['mastermindReveal', 'houseReveal', 'score', 'victoryCheck', 'gameOver']) {
      expect(phaseToBgmTrack(p, false)).toBe('reveal');
    }
    expect(phaseToBgmTrack('nightSpy', true)).toBe('reveal');
    for (const p of ['draftPick1', 'draftPick2', 'draftDiscard', 'dealHouses', 'roomLobby']) {
      expect(phaseToBgmTrack(p, false)).toBe(null);
    }
  });
});
