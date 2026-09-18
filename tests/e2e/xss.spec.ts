import { test, expect } from '@playwright/test';

/** 6J-3：聊天载荷 <script>/<img onerror> 不执行，原样转义显示 */
test('XSS 载荷不执行', async ({ page }) => {
  await page.goto('/');
  await page.fill('#nick', '安全员');
  await page.click('#btn-create');
  await expect(page.locator('.room')).toContainText('房间');

  await page.locator('#chat-log-panel summary').click();
  await expect(page.locator('#chat-input')).toBeVisible({ timeout: 5_000 });
  const payload = `<script>window.__nx=1</script><img src=x onerror="window.__nx=1">`;
  await page.fill('#chat-input', payload);
  await page.click('#btn-chat');
  // 消息原文转义显示（尖括号可见，无实际 script/img 节点产生）
  await expect(page.locator('#chat-log')).toContainText('<script>', { timeout: 5_000 });
  const executed = await page.evaluate(() => (window as unknown as { __nx?: number }).__nx);
  expect(executed).toBeUndefined();
  expect(await page.locator('#chat-log img').count()).toBe(0);
  expect(await page.locator('#chat-log script').count()).toBe(0);
});
