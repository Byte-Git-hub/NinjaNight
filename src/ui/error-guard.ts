/**
 * 6J-2 前端错误边界（纯逻辑，可单测；DOM 绑定见 AppUI.mountErrorGuard）。
 * - ErrToastGate：全局错误 toast 节流（5s 内只弹一次，防刷屏）。
 * - shouldHandleImg：非卡面 img（卡面自带 onerror 占位）走全局兜底：隐藏破图。
 */
export class ErrToastGate {
  private lastAt = -Infinity;
  private readonly intervalMs: number;
  constructor(intervalMs = 5000) {
    this.intervalMs = intervalMs;
  }

  /** 该时间点是否允许弹 toast（允许则记位） */
  allow(nowMs: number): boolean {
    if (nowMs - this.lastAt < this.intervalMs) return false;
    this.lastAt = nowMs;
    return true;
  }
}

/** 卡面（.card-art）自带 onerror 占位，不归全局管；其余 img 破图时隐藏 */
export function shouldHandleImg(className: string): boolean {
  return !className.split(/\s+/).includes('card-art');
}
