import { test, expect } from '@playwright/test';

// 6H-1 音效 UI：顶栏喇叭 + 设置面板（开关/音量/11 试听）+ localStorage 持久化
test.describe('6H-1 音效系统', () => {
  test('喇叭开关 + 面板 + 试听 + 持久化', async ({ page }) => {
    await page.goto('/');
    const btn = page.locator('#btn-sound');
    await expect(btn).toBeVisible();
    await expect(btn).toContainText('🔊');

    // 打开面板：音量滑块 + 11 试听按钮
    await btn.click();
    const panel = page.locator('#audio-panel');
    await expect(panel).toBeVisible();
    await expect(page.locator('#sound-volume')).toBeVisible();
    expect(await page.locator('[data-sfx-test]').count()).toBe(11);

    // 试听不抛错（点击即手势，AudioContext 应可建）
    await page.locator('[data-sfx-test="card-play"]').click();
    await page.locator('[data-sfx-test="game-win"]').click();
    await page.waitForTimeout(500);

    // 关音效 → 图标变 + 持久化
    await page.locator('#sound-enabled').click();
    await expect(btn).toContainText('🔇');
    const stored = await page.evaluate(() => window.localStorage.getItem('ninja-night:sound-settings'));
    expect(stored).toContain('"enabled":false');

    // 音量持久化（range 用 JS 设值 + 派发 input）
    await page.$eval('#sound-volume', (el) => {
      const input = el as HTMLInputElement;
      input.value = '30';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const stored2 = await page.evaluate(() => window.localStorage.getItem('ninja-night:sound-settings'));
    expect(stored2).toContain('0.3');

    // 刷新后保持关闭态
    await page.reload();
    await expect(page.locator('#btn-sound')).toContainText('🔇');
  });
});
