import { test, expect } from '@playwright/test';

test.describe('6E.7-bug1: 非本阶段手牌置灰不可选', () => {
  test('declareCards 时手牌中非本阶段牌带 .dim，点击不选中', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');

    await page.fill('#nick', '置灰测试');
    await page.click('#btn-create');
    await expect(page.locator('.room')).toContainText('房间');

    await page.click('#btn-add-bot');
    await page.click('#btn-add-bot');
    await page.click('#btn-add-bot');
    await expect(page.locator('.seats li')).toHaveCount(4);

    await page.click('#btn-start');
    await expect(page.locator('.phase')).toBeVisible({ timeout: 15_000 });

    let verified = false;
    for (let loop = 0; loop < 60; loop += 1) {
      const declareOpts = page.locator('.pending .declare-opt');
      const optCount = await declareOpts.count().catch(() => 0);
      if (optCount > 0) {
        const handCount = await page.locator('.hand .card').count().catch(() => 0);
        if (handCount > optCount) {
          // 手牌中有非本阶段牌：置灰数应等于差值
          const dimCount = await page.locator('.hand .card.dim').count();
          expect(dimCount).toBe(handCount - optCount);
          // 点击置灰牌不应被选中
          const before = await page.locator('#btn-declare').textContent().catch(() => '');
          await page.locator('.hand .card.dim').first().click();
          await page.waitForTimeout(300);
          const after = await page.locator('#btn-declare').textContent().catch(() => '');
          expect(after).toBe(before);
          verified = true;
          break;
        }
        // 全手牌可打：直接声明继续
        await declareOpts.first().click();
        await page.click('#btn-declare');
        await page.waitForTimeout(500);
        continue;
      }

      const draftOpts = page.locator('.pending .card.opt[data-opt]');
      if ((await draftOpts.count().catch(() => 0)) > 0) {
        await draftOpts.first().click();
        await page.waitForTimeout(400);
        continue;
      }
      const anyOpt = page.locator('.pending .opt[data-opt]').first();
      if (await anyOpt.isVisible().catch(() => false)) {
        await anyOpt.click();
        await page.waitForTimeout(400);
        continue;
      }
      const passBtn = page.locator('#btn-pass');
      if (await passBtn.isVisible().catch(() => false)) {
        await passBtn.click();
        await page.waitForTimeout(400);
        continue;
      }
      // 他人回合或终局：短等
      if (await page.locator('.game-over-banner').count().catch(() => 0)) break;
      await page.waitForTimeout(400);
    }
    expect(verified).toBe(true);
  });
});
