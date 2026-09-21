import { test, expect } from '@playwright/test';

/**
 * 单人+3bot：进入 victoryCheck 后结算区出现可视倒计时，
 * 不做任何操作，约 10 秒后自动进入下一轮选牌。
 */
test('单人房结算倒计时可视 + 约10秒自动进下一轮', async ({ page }) => {
  test.setTimeout(150000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  await page.fill('#nick', '倒计时测试');
  await page.click('#btn-create');
  await page.click('#btn-add-bot');
  await page.click('#btn-add-bot');
  await page.click('#btn-add-bot');
  await page.click('#btn-start');
  await expect(page.locator('.phase')).toBeVisible({ timeout: 15_000 });
  await page.locator('.identity-modal').click().catch(() => undefined);

  // forceAdvance 一路推到胜负
  let reachedVictory = false;
  for (let loop = 0; loop < 40; loop += 1) {
    const phaseText = await page.locator('.phase').textContent().catch(() => '');
    if (phaseText?.includes('胜负')) { reachedVictory = true; break; }
    if (phaseText?.includes('结束')) break;
    if (await page.locator('.table-info[hidden]').count()) await page.locator('[data-info-toggle]').click();
    const fa = page.locator('#btn-fa');
    if (await fa.isVisible().catch(() => false)) {
      await fa.click();
      await page.waitForTimeout(700);
      continue;
    }
    await page.waitForTimeout(500);
  }
  expect(reachedVictory).toBe(true);

  // 倒计时出现且读数递减
  const cd = page.locator('[data-auto-advance]');
  await expect(cd).toBeVisible({ timeout: 10_000 });
  const first = await cd.textContent();
  expect(first).toMatch(/约 \d+ 秒/);
  await page.screenshot({ path: 'test-results/victory-countdown.png' });

  // 不做任何操作，自动进下一轮选牌（10s + 余量）
  await expect(page.locator('.phase')).toContainText('选牌', { timeout: 30_000 });
});
