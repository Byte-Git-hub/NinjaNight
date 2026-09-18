/**
 * 6G-3 快捷短语定稿 21 条（纯静态文本，不进 core）。
 * 客户端只发 phraseId（下标），文本以服务端 lookup 为准广播，不存储、不记历史。
 */
export const PHRASES: readonly string[] = [
  '快点啊，鸡都要叫了',
  '不要走，决战到天亮',
  '你的忍术，是百变者教的吧',
  '我俩是一伙的，相信我',
  '我是浪人，别杀我',
  '隐士先别动，让我来',
  '我等的花都谢了',
  '你确定你抽到的是忍者牌，不是菜鸟牌？',
  '别拦我，我要去找师父重练了',
  '别吵了，专心忍术',
  '这一刀，我记下了',
  '密探看了我，我是清白的',
  '谁在骗我，我已经知道了',
  '上忍已出，各位小心',
  '这局我必活到最后',
  '我是红方老大',
  '我是蓝方老大',
  '我才是红方老大',
  '我才是蓝方老大',
  '我是浪人',
  '我才是浪人',
];

/** 合法下标：0..14 的整数；非法返回 null（服务端整条拒收） */
export function normalizePhraseId(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isInteger(v)) return null;
  if (v < 0 || v >= PHRASES.length) return null;
  return v;
}
