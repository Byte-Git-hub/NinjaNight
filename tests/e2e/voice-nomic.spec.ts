import { test, expect } from '@playwright/test';

/**
 * 6G-1 降级 e2e：无麦克风环境下语音只降级、游戏仍可开局。
 * headless Chromium 默认无麦克风权限 → 点击加入语音应出现降级横幅，
 * 且后续加 Bot + 开局流程不受影响。
 */
test('无麦克风时语音降级但游戏仍可开局', async ({ page }) => {
  await page.goto('/');

  // 1. 创建房间，语音条可见
  await page.fill('#nick', '语音降级测试');
  await page.click('#btn-create');
  await expect(page.locator('.room')).toContainText('房间');
  await expect(page.locator('#voice-bar')).toBeVisible();
  await expect(page.locator('#btn-voice-join')).toBeVisible();

  // 2. 点击加入语音 → 无麦克风应降级（横幅），不抛错不卡死
  await page.click('#btn-voice-join');
  await expect(page.locator('#voice-banner')).toContainText('游戏不受影响', { timeout: 15000 });

  // 3. 语音降级后游戏链路正常：加 3 Bot 并开局
  await page.click('#btn-add-bot');
  await page.click('#btn-add-bot');
  await page.click('#btn-add-bot');
  await expect(page.locator('.seats li')).toHaveCount(4);
  await page.click('#btn-start');
  await expect(page.locator('.phase')).toBeVisible({ timeout: 15000 });
});
