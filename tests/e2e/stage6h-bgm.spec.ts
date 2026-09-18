import { test, expect } from '@playwright/test';

// 6H-2 BGM：独立开关 + 音量 + 持久化（默认关闭）
test.describe('6H-2 BGM 环境音', () => {
  test('BGM 开关 + 音量持久化', async ({ page }) => {
    await page.goto('/');
    await page.locator('#btn-sound').click();
    const panel = page.locator('#audio-panel');
    await expect(panel).toBeVisible();

    const bgmBox = page.locator('#bgm-enabled');
    await expect(bgmBox).toBeVisible();
    // 默认关闭
    await expect(bgmBox).not.toBeChecked();

    // 开启不抛错
    await bgmBox.click();
    await expect(bgmBox).toBeChecked();
    await page.waitForTimeout(800);
    const stored = await page.evaluate(() => window.localStorage.getItem('ninja-night:sound-settings'));
    expect(stored).toContain('"bgmEnabled":true');

    await page.$eval('#bgm-volume', (el) => {
      const input = el as HTMLInputElement;
      input.value = '40';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const stored2 = await page.evaluate(() => window.localStorage.getItem('ninja-night:sound-settings'));
    expect(stored2).toContain('0.4');

    await page.reload();
    await page.locator('#btn-sound').click();
    await expect(page.locator('#bgm-enabled')).toBeChecked();
  });
});
