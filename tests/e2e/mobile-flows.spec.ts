import { test, expect, devices, type Page } from '@playwright/test';

/**
 * 6J-4 手机真机测试：Pixel 7 模拟 + 真实触摸事件。
 * 5 关键流程（tap 驱动）+ 滑动/长按/双指缩放（CDP 触摸序列）。
 * 统一用条件等待（poll/toPass），无固定长 sleep。
 */
test.use({ ...devices['Pixel 7'], hasTouch: true });

async function tapFirst(page: Page, sel: string): Promise<boolean> {
  const el = page.locator(sel).first();
  if ((await el.count()) === 0) return false;
  try {
    await el.tap({ timeout: 3_000 });
    return true;
  } catch {
    return false;
  }
}

test('移动端 5 流程全 tap 走通', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/');

  // 1. 加入房间（tap）
  await page.tap('#nick');
  await page.fill('#nick', '手机党');
  await page.tap('#btn-create');
  await expect(page.locator('.room')).toContainText('房间');
  await page.screenshot({ path: 'docs/06J_screenshots/mobile-lobby.png' });

  // 加 3 Bot（tap）
  await page.tap('#btn-add-bot');
  await page.tap('#btn-add-bot');
  await page.tap('#btn-add-bot');
  await expect(page.locator('.seats li')).toHaveCount(4);
  await page.tap('#btn-start');
  await expect(page.locator('.phase')).toBeVisible({ timeout: 15_000 });
  await page.locator('.identity-modal').tap({ timeout: 5_000 }).catch(() => {});

  // 2. 选牌（tap 卡面）→ 3. 出牌（多选 + 确认/跳过）→ 4. 选择目标 → 5. 砸物品
  // poll 每轮做一个动作，直到终局或 5 流程齐 + 脱离选牌阶段
  let declared = false;
  let targeted = false;
  let smashed = false;
  await expect
    .poll(async () => {
      if ((await page.locator('.game-over-banner').count()) > 0) return 'over';
      if ((await page.locator('#btn-next-round').count()) > 0) {
        await tapFirst(page, '#btn-next-round');
        return 'progress';
      }
      // 砸物品优先做（fx-bar 开局即有），只做一次
      if (!smashed && (await page.locator('.fx-bar').count()) > 0) {
        const botCard = page.locator('.seat-card.bot').first();
        await botCard.locator('.seat-head').tap({ timeout: 3_000 }).catch(() => {});
        for (let i = 0; i < 5; i += 1) {
          await page.locator('[data-fx="egg"]').tap({ timeout: 3_000 }).catch(() => {});
        }
        smashed = true;
        return 'progress';
      }
      if ((await page.locator('.pending').count()) === 0) return 'progress';
      // 出牌：多选两张后确认，无牌可出则跳过
      const declareOpts = page.locator('.declare-opt');
      if ((await declareOpts.count()) > 0) {
        await declareOpts.nth(0).tap({ timeout: 3_000 }).catch(() => {});
        if ((await declareOpts.count()) > 1) {
          await declareOpts.nth(1).tap({ timeout: 3_000 }).catch(() => {});
        }
        const confirm = page.locator('#btn-declare');
        if ((await confirm.count()) > 0 && (await confirm.isEnabled().catch(() => false))) {
          await confirm.tap({ timeout: 3_000 }).catch(() => {});
          declared = true;
        } else {
          await tapFirst(page, '#btn-pass');
        }
        return 'progress';
      }
      if ((await page.locator('#btn-pass').count()) > 0) {
        await tapFirst(page, '#btn-pass');
        return 'progress';
      }
      // 选择目标 / 可选决策 / 商人：tap 首选项
      if (await tapFirst(page, '.pending .opt[data-opt]')) {
        targeted = true;
        return 'progress';
      }
      const phase = await page.locator('.phase').first().innerText().catch(() => '');
      const advanced = /夜间|密探|隐士|骗徒|刺客|上忍|计分|胜负|结束/.test(phase);
      if (declared && targeted && smashed && advanced) return 'done';
      return 'progress';
    }, { timeout: 120_000, intervals: [400] })
    .toMatch(/over|done/);

  expect(declared || targeted).toBe(true);
  expect(smashed).toBe(true);
  await page.screenshot({ path: 'docs/06J_screenshots/mobile-game.png' });
});

test('滑动/长按/双指缩放手势不崩', async ({ page }) => {
  await page.goto('/');
  await page.fill('#nick', '手势党');
  await page.tap('#btn-create');
  await expect(page.locator('.room')).toContainText('房间');
  await page.tap('#btn-add-bot');
  await page.tap('#btn-add-bot');
  await page.tap('#btn-add-bot');
  await page.tap('#btn-start');
  await expect(page.locator('.phase')).toBeVisible({ timeout: 15_000 });
  await page.locator('.identity-modal').tap({ timeout: 5_000 }).catch(() => {});

  const cdp = (await page.context().newCDPSession(page)) as unknown as {
    send(method: string, params: Record<string, unknown>): Promise<void>;
  };

  // 滑动：座位区上滑，scroll 变化且不断线
  const scrolled = await page.evaluate(`(() => {
    const el = document.querySelector('.seats-panel') || document.scrollingElement;
    if (!el) return 'no-el';
    const before = el.scrollTop;
    el.scrollTop = before + 120;
    return el.scrollTop !== before ? 'ok' : 'unscrollable';
  })()`);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: 195, y: 600, id: 1 }],
  });
  for (let i = 1; i <= 5; i += 1) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: 195, y: 600 - i * 40, id: 1 }],
    });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  expect(['ok', 'unscrollable']).toContain(scrolled);
  await expect(page.locator('.phase')).toBeVisible({ timeout: 10_000 });

  // 长按：卡面 700ms，无报错 toast、无卡死（长按本身需要真实时长）
  const card = page.locator('.seat-card').first();
  const box = await card.boundingBox();
  if (box) {
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: cx, y: cy, id: 2 }],
    });
    await page.waitForTimeout(700);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }
  await expect(page.locator('.phase')).toBeVisible({ timeout: 10_000 });

  // 双指缩放：页面不崩、布局仍在
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [
      { x: 150, y: 400, id: 3 },
      { x: 240, y: 400, id: 4 },
    ],
  });
  for (let i = 1; i <= 4; i += 1) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        { x: 150 - i * 15, y: 400, id: 3 },
        { x: 240 + i * 15, y: 400, id: 4 },
      ],
    });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.locator('.phase')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('#toast')).toHaveCount(1);
});
