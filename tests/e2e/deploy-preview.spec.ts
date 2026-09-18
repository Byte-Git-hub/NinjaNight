import { test, expect } from '@playwright/test';

/**
 * 6I-3 本地生产模拟：vite preview 产物（:4173）+ 生产入口后端（:3000）走完一整局。
 * 门控：仅当 NINJA_DEPLOY_CHECK=1 且 DEPLOY_FRONT 指向 preview 地址时跑，
 * 日常 `npm run test:e2e` 自动跳过（不污染 37 项基线）。
 * 后端建议 BOT_DELAY_MS=10 / BOT_JITTER_MS=0 加速，验证步骤见 docs/DEPLOY.md。
 */
const FRONT = process.env.DEPLOY_FRONT ?? '';
const ENABLED = process.env.NINJA_DEPLOY_CHECK === '1' && FRONT !== '';

test.skip(!ENABLED, '仅 6I-3 生产模拟时跑：NINJA_DEPLOY_CHECK=1 DEPLOY_FRONT=http://127.0.0.1:4173');

test('生产模拟走完一整局', async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto(FRONT);

  await page.fill('#nick', '房主玩家');
  await page.click('#btn-create');
  await expect(page.locator('.room')).toContainText('房间');

  await page.click('#btn-add-bot');
  await page.click('#btn-add-bot');
  await page.click('#btn-add-bot');
  await expect(page.locator('.seats li')).toHaveCount(4);
  await expect(page.locator('#btn-start')).toBeEnabled();

  await page.click('#btn-start');
  await expect(page.locator('.phase')).toBeVisible({ timeout: 15000 });

  // 驱动房主所有待办直至终局；Bot 由服务端 scheduler 自动决策
  for (let step = 0; step < 200; step++) {
    if ((await page.locator('.game-over-banner').count()) > 0) break;
    const nextRound = page.locator('#btn-next-round');
    if ((await nextRound.count()) > 0 && (await nextRound.isVisible())) {
      await nextRound.click();
      await page.waitForTimeout(400);
      continue;
    }
    const pending = page.locator('.pending');
    if ((await pending.count()) === 0) {
      await page.waitForTimeout(400);
      continue;
    }
    const declareBtn = page.locator('#btn-declare');
    const passBtn = page.locator('#btn-pass');
    if ((await passBtn.count()) > 0 && (await passBtn.isVisible())) {
      // declareCards：一律跳过（只验流程不断线，不验 host 出牌）
      await passBtn.click();
      await page.waitForTimeout(300);
      continue;
    }
    if ((await declareBtn.count()) > 0 && (await declareBtn.isVisible())) {
      await passBtn.click();
      await page.waitForTimeout(300);
      continue;
    }
    const opts = page.locator('.pending .opt[data-opt]');
    if ((await opts.count()) > 0) {
      await opts.first().click();
      await page.waitForTimeout(300);
      continue;
    }
    await page.waitForTimeout(400);
  }

  await expect(page.locator('.game-over-banner')).toBeVisible({ timeout: 60_000 });
  // 随机局终局应可见种子（截图报 bug 用）
  await expect(page.locator('.seed')).toContainText('种子');
});
