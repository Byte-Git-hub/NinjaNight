import { test, expect, type Page } from '@playwright/test';

/** 读 Canvas 层累计 burst 计数（绘制触发证明，不测像素） */
async function fxBursts(page: Page): Promise<number> {
  return (
    (await page.evaluate(
      () => (globalThis as unknown as { __ninjaFxBursts?: number }).__ninjaFxBursts ?? 0,
    )) ?? 0
  );
}

test.describe('6G-2 互动特效与社交标记', () => {
  test('扔物品广播到达并绘制；怀疑标记打标/取消全房同步', async ({ page }) => {
    await page.goto('/');
    await page.fill('#nick', '特效测试员');
    await page.click('#btn-create');
    await expect(page.locator('.room')).toContainText('房间');
    await page.click('#btn-add-bot');
    await page.click('#btn-add-bot');
    await page.click('#btn-add-bot');
    await expect(page.locator('.seats li')).toHaveCount(4);
    await page.click('#btn-start');
    await expect(page.locator('.phase')).toBeVisible({ timeout: 15_000 });
    await page.locator('.identity-modal').click({ timeout: 5_000 }).catch(() => {});
    await expect(page.locator('.identity-modal')).toHaveCount(0, { timeout: 5_000 }).catch(() => {});

    // 互动条：9 物品 + 12 表情（图集切图）
    await expect(page.locator('.fx-bar')).toBeVisible({ timeout: 15_000 });
    expect(await page.locator('[data-fx]').count()).toBe(9);
    expect(await page.locator('[data-emoji]').count()).toBe(12);

    // Canvas 覆盖层常驻且有尺寸
    const layerBox = await page.locator('#fx-layer').boundingBox();
    expect(layerBox).toBeTruthy();
    expect(layerBox!.width).toBeGreaterThan(0);
    expect(layerBox!.height).toBeGreaterThan(0);
    const before = await fxBursts(page);

    // 选目标：点 Bot 座位卡头
    const botCard = page.locator('.seat-card.bot').first();
    const targetSeat = await botCard.getAttribute('data-seat');
    expect(targetSeat).toBeTruthy();
    await botCard.locator('.seat-head').click();
    await expect(page.locator('#fx-target-hint')).not.toContainText('先点座位卡选目标');

    // 扔鸡蛋：广播回声 → 座位卡抖动类 + Canvas 计数增长（不测像素）
    await page.locator('[data-fx="egg"]').click();
    await expect(botCard).toHaveClass(/fx-hit/, { timeout: 5_000 });
    await expect
      .poll(() => fxBursts(page), { timeout: 5_000 })
      .toBeGreaterThan(before);

    // 快捷表情：本地渲染，计数同样增长
    const mid = await fxBursts(page);
    await page.locator('[data-emoji]').first().click();
    await expect.poll(() => fxBursts(page), { timeout: 5_000 }).toBeGreaterThan(mid);

    // 怀疑标记：打标 → 徽章出现；再点 → 取消，徽章消失（服务端广播往返）
    const markBtn = botCard.locator('[data-mark]').first();
    await expect(markBtn).toBeVisible();
    await markBtn.click();
    const badge = botCard.locator('.mark-badge');
    await expect(badge).toContainText('👁×1', { timeout: 5_000 });
    await botCard.locator('[data-mark]').first().click();
    await expect(botCard.locator('.mark-badge')).toHaveCount(0, { timeout: 5_000 });
  });
});
