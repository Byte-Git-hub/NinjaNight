/**
 * 6G-3 快捷短语集成测试：短语表定稿 21 条 + 服务端 validatePhrase 校验。
 * 广播链路由 e2e 覆盖；服务端不存储（无状态可断言）。
 */
import { describe, expect, it } from 'vitest';
import { PHRASES, normalizePhraseId } from '../../src/data/phrases';
import { validatePhrase } from '../../src/server/social';

describe('PHRASES 定稿', () => {
  it('共 23 条，与需求文案逐字一致', () => {
    expect(PHRASES).toHaveLength(23);
    expect(PHRASES[0]).toBe('我是红方老大');
    expect(PHRASES[1]).toBe('我是蓝方老大');
    expect(PHRASES[2]).toBe('我才是红方老大');
    expect(PHRASES[3]).toBe('我才是蓝方老大');
    expect(PHRASES[4]).toBe('我是浪人');
    expect(PHRASES[5]).toBe('我才是浪人');
    expect(PHRASES[6]).toBe('快点啊，鸡都要叫了');
    expect(PHRASES[7]).toBe('不要走，决战到天亮');
    expect(PHRASES[8]).toBe('你的忍术，是百变者教的吧');
    expect(PHRASES[9]).toBe('我俩是一伙的，相信我');
    expect(PHRASES[10]).toBe('我是浪人，别杀我');
    expect(PHRASES[11]).toBe('隐士先别动，让我来');
    expect(PHRASES[12]).toBe('我等的花都谢了');
    expect(PHRASES[13]).toBe('你确定你抽到的是忍者牌，不是菜鸟牌？');
    expect(PHRASES[14]).toBe('别拦我，我要去找师父重练了');
    expect(PHRASES[15]).toBe('别吵了，专心忍术');
    expect(PHRASES[16]).toBe('这一刀，我记下了');
    expect(PHRASES[17]).toBe('密探看了我，我是清白的');
    expect(PHRASES[18]).toBe('谁在骗我，我已经知道了');
    expect(PHRASES[19]).toBe('上忍已出，各位小心');
    expect(PHRASES[20]).toBe('这局我必活到最后');
    expect(PHRASES[21]).toBe('没牌');
    expect(PHRASES[22]).toBe('我的牌在后面呢');
  });

  it('无空串、无重复', () => {
    expect(new Set(PHRASES).size).toBe(23);
    for (const t of PHRASES) expect(t.length).toBeGreaterThan(0);
  });
});

describe('validatePhrase', () => {
  it('0..20 返回对应文本', () => {
    expect(validatePhrase(0)).toBe('我是红方老大');
    expect(validatePhrase(5)).toBe('我才是浪人');
    expect(validatePhrase(6)).toBe('快点啊，鸡都要叫了');
    expect(validatePhrase(20)).toBe('这局我必活到最后');
    expect(validatePhrase(21)).toBe('没牌');
    expect(validatePhrase(22)).toBe('我的牌在后面呢');
  });

  it('越界/非整数/非数字一律 null（整条拒收）', () => {
    expect(validatePhrase(-1)).toBeNull();
    expect(validatePhrase(23)).toBeNull();
    expect(validatePhrase(1.5)).toBeNull();
    expect(validatePhrase('3')).toBeNull();
    expect(validatePhrase(undefined)).toBeNull();
    expect(validatePhrase(null)).toBeNull();
    expect(validatePhrase(Number.NaN)).toBeNull();
  });

  it('normalizePhraseId 同步', () => {
    expect(normalizePhraseId(7)).toBe(7);
    expect(normalizePhraseId(20)).toBe(20);
    expect(normalizePhraseId(22)).toBe(22);
    expect(normalizePhraseId(23)).toBeNull();
    expect(normalizePhraseId(99)).toBeNull();
  });
});
