import { test, expect, type Page } from '@playwright/test';

// 6G-4a 尺寸约束回归：互动条图标 ≤24px（badge 20 + 边框余量），Canvas 照常绘制
async function fxBursts(page: Page): Promise<number> {
  const v = await page.evaluate(
    () => (globalThis as unknown as { __ninjaFxBursts?: number }).__ninjaFxBursts ?? 0,
  );
  return v ?? 0;
}

test('6G-4a 互动条图标收敛 + 砸物功能完好', async ({ page }) => {
  await page.goto('/');
  await page.fill('#nick', '尺寸检查员');
  await page.click('#btn-create');
  await expect(page.locator('.room')).toContainText('房间');
  await page.click('#btn-add-bot');
  await page.click('#btn-add-bot');
  await page.click('#btn-add-bot');
  await page.click('#btn-start');
  await expect(page.locator('.phase')).toBeVisible({ timeout: 15_000 });
  await page.locator('.identity-modal').click({ timeout: 5_000 }).catch(() => {});
  await expect(page.locator('.identity-modal')).toHaveCount(0, { timeout: 5_000 }).catch(() => {});
  await expect(page.locator('.fx-bar')).toBeVisible({ timeout: 15_000 });

  // 9 物品 + 12 表情按钮图全部 ≤24px（不再用 341px 自然尺寸）
  const boxes = await page.locator('.fx-bar img').evaluateAll((els) =>
    (els as HTMLImageElement[]).map((el) => {
      const r = el.getBoundingClientRect();
      return { w: r.width, h: r.height };
    }),
  );
  expect(boxes).toHaveLength(21);
  for (const b of boxes) {
    expect(b.w).toBeLessThanOrEqual(24);
    expect(b.h).toBeLessThanOrEqual(24);
  }

  // 点击直接触发（无预览弹窗）：广播回声 → 抖动 + 绘制计数增长
  const botCard = page.locator('.seat-card.bot').first();
  await botCard.locator('.seat-head').click();
  const before = await fxBursts(page);
  await page.locator('[data-fx="egg"]').click();
  await expect(botCard).toHaveClass(/fx-hit/, { timeout: 5_000 });
  await expect.poll(() => fxBursts(page), { timeout: 5_000 }).toBeGreaterThan(before);
});
