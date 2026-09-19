/**
 * 死亡盖印动效 (P3)
 * 复用已有 public/assets/ui/stamp-failed.webp 和 .stamp-failed-overlay。
 * 在被刺杀/出局的玩家座位卡 (.seat-card) 上注入印章，落印动画结束后常驻。
 */

export interface StampOptions {
  /** 是否在动画结束后保留在座位卡上（默认 true，表示死亡出局） */
  preserveOnCard?: boolean;
}

export function applyStampToSeat(seatEl: HTMLElement, options: StampOptions = {}): Promise<void> {
  const { preserveOnCard = true } = options;
  if (!seatEl) return Promise.resolve();

  // 若该座位卡已存在印章，不再重复注入
  if (seatEl.querySelector(".stamp-failed-overlay")) {
    return Promise.resolve();
  }

  const reducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  const stamp = document.createElement("div");
  stamp.className = "stamp-failed-overlay";
  stamp.setAttribute("aria-hidden", "true");

  if (reducedMotion) {
    stamp.style.animation = "none";
    stamp.style.opacity = "1";
    stamp.style.transform = "scale(1) rotate(-8deg)";
    seatEl.appendChild(stamp);
    if (!preserveOnCard) stamp.remove();
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    let resolved = false;
    const finish = () => {
      if (resolved) return;
      resolved = true;
      stamp.removeEventListener("animationend", finish);
      clearTimeout(timer);
      if (!preserveOnCard) {
        stamp.remove();
      }
      resolve();
    };

    stamp.addEventListener("animationend", finish, { once: true });
    // 超时兜底（css 动画 650ms）
    const timer = setTimeout(finish, 850);

    seatEl.appendChild(stamp);
  });
}
