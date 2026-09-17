import { test, expect } from '@playwright/test';

test.describe('6G-3 快捷短语', () => {
  test('面板 15 条；点击发送全房 toast 3s', async ({ page }) => {
    await page.goto('/');
    await page.fill('#nick', '短语测试员');
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

    // 快捷短语折叠面板常驻（与聊天同区），15 个按钮（默认折叠，先展开）
    const panel = page.locator('#phrase-panel');
    await expect(panel).toBeAttached({ timeout: 15_000 });
    expect(await panel.locator('[data-phrase]').count()).toBe(15);
    await panel.locator('summary').click();
    await expect(panel.locator('[data-phrase="0"]')).toBeVisible();

    // 点第 1 条：服务端广播回声 → 全房 toast 显示「昵称：短语」
    await panel.locator('[data-phrase="0"]').click();
    const toast = page.locator('#toast');
    await expect(toast).toContainText('短语测试员：快点啊，鸡都要叫了', { timeout: 5_000 });
    // toast 3s 后自动消失（容差到 5s 内消失）
    await expect(toast).toBeHidden({ timeout: 5_000 });
  });
});
