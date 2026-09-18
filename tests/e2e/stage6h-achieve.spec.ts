import { test, expect } from '@playwright/test';

// 6H-3 成就：🏆 面板列出 8 成就（锁定态），解锁卡片容器常驻
test.describe('6H-3 成就系统', () => {
  test('成就面板 + 8 条 + 锁定图标', async ({ page }) => {
    await page.goto('/');
    await page.locator('#btn-achieve').click();
    const panel = page.locator('#achieve-panel');
    await expect(panel).toBeVisible();
    expect(await panel.locator('.achieve-row').count()).toBe(8);
    expect(await panel.locator('.achieve-row.locked').count()).toBe(8);
    await expect(panel).toContainText('忍界宗师');
    // 解锁卡片容器常驻（空时无卡片）
    await expect(page.locator('#achieve-pop')).toBeAttached();
    await expect(page.locator('.achieve-card')).toHaveCount(0);
  });
});
