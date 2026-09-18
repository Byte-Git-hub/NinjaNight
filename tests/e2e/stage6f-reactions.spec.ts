import { test, expect } from '@playwright/test';

test('6F-B3 reaction：目标选择、数量选择和互动日志', async ({ page }) => {
  await page.goto('/');
  await page.fill('#nick', '互动测试员');
  await page.click('#btn-create');
  await page.click('#btn-add-bot');
  await page.click('#btn-add-bot');
  await page.click('#btn-add-bot');
  await page.click('#btn-start');
  await expect(page.locator('.phase')).toBeVisible({ timeout: 15_000 });
  await page.locator('.identity-modal').click({ timeout: 5_000 }).catch(() => {});

  const panel = page.locator('#chat-log-panel');
  await panel.locator('summary').click();
  await panel.locator('[data-chat-tab="reaction"]').click();
  await panel.locator('[data-chat-pane="reaction"] [data-reaction-kind="egg"]').click();
  const bot = page.locator('.seat-card.bot').first();
  await bot.locator('.seat-head').click();
  await expect(panel.locator('[data-reaction-count="3"]')).toBeVisible();
  await panel.locator('[data-reaction-count="3"]').click();
  await expect(panel.locator('.reaction-log')).toContainText('互动测试员');
});
