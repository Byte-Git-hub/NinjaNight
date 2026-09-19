import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { applyStampToSeat } from "../../src/ui/animations/stamp";

class FakeElement {
  className = "";
  children: FakeElement[] = [];
  style: Record<string, string> = {};
  listeners: Record<string, Array<() => void>> = {};
  attributes: Record<string, string> = {};

  setAttribute(k: string, v: string) { this.attributes[k] = v; }
  getAttribute(k: string) { return this.attributes[k] ?? null; }
  appendChild(el: FakeElement) { this.children.push(el); }
  querySelector(sel: string) {
    if (sel.includes(".stamp-failed-overlay")) {
      return this.children.find(c => c.className.includes("stamp-failed-overlay")) ?? null;
    }
    return null;
  }
  querySelectorAll(sel: string) {
    if (sel.includes(".stamp-failed-overlay")) {
      return this.children.filter(c => c.className.includes("stamp-failed-overlay"));
    }
    return [];
  }
  addEventListener(event: string, fn: () => void) {
    this.listeners[event] = this.listeners[event] || [];
    this.listeners[event].push(fn);
  }
  removeEventListener(event: string, fn: () => void) {
    if (this.listeners[event]) {
      this.listeners[event] = this.listeners[event].filter(f => f !== fn);
    }
  }
  dispatchEvent(evt: { type: string }) {
    const list = this.listeners[evt.type] || [];
    list.forEach(f => f());
  }
  remove() {
    // no-op
  }
}

describe("P3: 死亡盖印动画 applyStampToSeat", () => {
  let seatCard: FakeElement;

  beforeEach(() => {
    seatCard = new FakeElement();
    seatCard.className = "seat-card";
    vi.stubGlobal("document", {
      createElement: () => new FakeElement(),
    });
    vi.stubGlobal("window", {
      matchMedia: () => ({ matches: false }),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("在座位卡上成功注入 .stamp-failed-overlay 印章 DOM 并在动画结束后保留", async () => {
    const promise = applyStampToSeat(seatCard as unknown as HTMLElement);
    const stamp = seatCard.querySelector(".stamp-failed-overlay");
    expect(stamp).not.toBeNull();
    expect(stamp?.getAttribute("aria-hidden")).toBe("true");
    
    // 触发 animationend
    stamp?.dispatchEvent({ type: "animationend" });
    await promise;
    
    // 印章常驻在座位卡上
    expect(seatCard.querySelector(".stamp-failed-overlay")).toBe(stamp);
  });

  it("若已存在印章，不再重复添加", async () => {
    await applyStampToSeat(seatCard as unknown as HTMLElement, { preserveOnCard: true });
    const stamp = seatCard.querySelector(".stamp-failed-overlay");
    stamp?.dispatchEvent({ type: "animationend" });
    
    await applyStampToSeat(seatCard as unknown as HTMLElement);
    const stamps = seatCard.querySelectorAll(".stamp-failed-overlay");
    expect(stamps.length).toBe(1);
  });
});