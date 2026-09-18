import { test, expect } from '@playwright/test';

// 6H-4 高光时刻：推到一轮结束，高光横幅出现（含获胜行），点击展开完整日志
test.describe('6H-4 高光时刻', () => {
  test('轮结束高光横幅 + 展开', async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.fill('#nick', '高光员');
    await page.click('#btn-create');
    await expect(page.locator('.room')).toContainText('房间', { timeout: 10_000 });
    for (let i = 0; i < 3; i += 1) await page.click('#btn-add-bot');
    await page.click('#btn-start');
    await expect(page.locator('.phase')).toBeVisible({ timeout: 15_000 });
    await page.locator('#identity-modal .identity-modal').click({ timeout: 5_000 }).catch(() => {});

    for (let loop = 0; loop < 60; loop += 1) {
      if (await page.locator('.round-banner').isVisible().catch(() => false)) break;
      if (await page.locator('.game-over-banner').isVisible().catch(() => false)) break;
      const fa = page.locator('#btn-fa');
      if (await fa.isVisible().catch(() => false)) {
        await fa.click({ timeout: 5000 }).catch(() => {});
        await page.waitForTimeout(700);
        continue;
      }
      await page.waitForTimeout(500);
    }
    const hl = page.locator('#highlight-pop');
    await expect(hl).toBeVisible({ timeout: 15_000 });
    await expect(hl).toContainText('本轮高光');
    await expect(hl).toContainText('获胜');
    // 点击展开完整日志区
    await hl.click();
    await expect(page.locator('.hl-full')).toBeAttached({ timeout: 5_000 });
    await page.screenshot({ path: 'docs/06H_screenshots/highlight-banner.png' });
  });
});
