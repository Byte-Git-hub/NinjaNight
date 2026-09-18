import { test, expect } from '@playwright/test';

/** 6J-2：断线横幅出现/恢复隐藏；破图 img 被隐藏且不影响建房 */
test('断线显示正在重连横幅，恢复后隐藏', async ({ page, context }) => {
  await page.goto('/');
  await page.fill('#nick', '断线测试');
  await page.click('#btn-create');
  await expect(page.locator('.room')).toContainText('房间');

  await context.setOffline(true);
  await expect(page.locator('.banner.warn')).toContainText('正在重连', { timeout: 10_000 });

  await context.setOffline(false);
  await expect(page.locator('.banner.warn')).toHaveCount(0, { timeout: 15_000 });
  // 重连后房间仍在（seatToken 抢占重绑）
  await expect(page.locator('.room')).toContainText('房间');
});

test('图片 404 时破图隐藏，不阻塞建房', async ({ page }) => {
  await page.route('**/honor-token.webp', (r) => r.abort());
  await page.goto('/');
  await page.fill('#nick', '破图测试');
  await page.click('#btn-create');
  await expect(page.locator('.room')).toContainText('房间');
  await page.click('#btn-add-bot');
  await page.click('#btn-add-bot');
  await page.click('#btn-add-bot');
  await page.click('#btn-start');
  await expect(page.locator('.phase')).toBeVisible({ timeout: 15_000 });
  // 破图 img 被全局兜底隐藏（无碎图图标），对局照常推进
  const hidden = await page.evaluate(() => {
    const imgs = [...document.querySelectorAll('img')].filter((i) =>
      (i as HTMLImageElement).currentSrc.includes('honor-token'),
    );
    return imgs.length > 0 && imgs.every((i) => (i as HTMLElement).style.visibility === 'hidden');
  });
  expect(hidden).toBe(true);
});
