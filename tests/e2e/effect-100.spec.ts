import { test, expect } from '@playwright/test';

/**
 * 丢 100 连击验收：选樱花 × 目标 bot × 数量 100，连续发送，
 * 断言飞行层出现持续流（data-active-flights≠0 可被多次观测到），
 * 日志记“送出 100 个樱花”，全程无错误横幅，并截图存证连续流。
 */
test('丢100：樱花连击出现连续流 + 日志记数', async ({ page }) => {
  test.setTimeout(150000);
  await page.setViewportSize({ width: 1280, height: 800 });
  // 默认本地联调；E2E_BASE_URL 指向线上时即为线上验收（Pages 前端 + Railway 后端）
  await page.goto(process.env.E2E_BASE_URL ?? '/');
  await page.fill('#nick', '百连测试');
  await page.click('#btn-create');
  for (let i = 0; i < 3; i += 1) await page.click('#btn-add-bot');
  await page.click('#btn-start');
  await expect(page.locator('.phase')).toBeVisible({ timeout: 15_000 });
  await page.locator('.identity-modal').click().catch(() => undefined);

  await page.click('[data-social-tab="effects"]');
  // 樱花在物品第一页（perPage=6，index=1）；找不到则翻页
  for (let i = 0; i < 3; i += 1) {
    if (await page.locator('[data-fx="sakura"]').count()) break;
    await page.click('[data-page="social"][data-delta="1"]');
  }
  await page.click('[data-fx="sakura"]');
  const bot = page.locator('.seat-card.bot').first();
  await bot.locator('.seat-head').click();

  let streamSeen = 0;
  for (let round = 0; round < 5; round += 1) {
    await page.click('[data-reaction-count="100"]');
    await page.click('[data-social-send]');
    // 100 个≈12 即时 + 队列流（~40滴/秒），流应持续可观测
    const seen = await expect
      .poll(() => page.locator('.item-flight-layer').getAttribute('data-active-flights'), { timeout: 10_000 })
      .not.toBe('0')
      .then(() => true)
      .catch(() => false);
    if (seen) streamSeen += 1;
    if (round === 2) await page.screenshot({ path: 'test-results/effect-100-stream.png' });
    await page.waitForTimeout(1200);
  }
  expect(streamSeen).toBeGreaterThanOrEqual(3);
  await expect(page.locator('.reaction-log')).toContainText('送出 100 个樱花');
  await expect(page.locator('.banner.err')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/effect-100-final.png' });
});
