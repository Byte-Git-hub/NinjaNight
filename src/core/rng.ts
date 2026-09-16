/** 可注入随机源；core 内禁止 Math.random */

export interface Rng {
  /** [0, 1) */
  next(): number;
  /** [0, max) 整数 */
  int(maxExclusive: number): number;
  shuffle<T>(arr: readonly T[]): T[];
  /** 当前已消耗的 next 调用次数（便于重放） */
  calls: number;
}

/** mulberry32 */
export function createRng(seed: number): Rng {
  let s = seed >>> 0;
  let calls = 0;

  const next = (): number => {
    calls += 1;
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const rng: Rng = {
    get calls() {
      return calls;
    },
    next,
    int(maxExclusive: number): number {
      if (maxExclusive <= 0) return 0;
      return Math.floor(next() * maxExclusive);
    },
    shuffle<T>(arr: readonly T[]): T[] {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i -= 1) {
        const j = rng.int(i + 1);
        const tmp = a[i] as T;
        a[i] = a[j] as T;
        a[j] = tmp;
      }
      return a;
    },
  };
  return rng;
}

/** 从 seed 起空转 calls 次，恢复到指定进度 */
export function resumeRng(seed: number, calls: number): Rng {
  const rng = createRng(seed);
  for (let i = 0; i < calls; i += 1) {
    rng.next();
  }
  return rng;
}
