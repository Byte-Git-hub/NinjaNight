import { test, expect } from '@playwright/test';

test.describe('6E.7-bug3: 本轮横幅 + 下一轮按钮 + 终局排名', () => {
  test('1 人 + 3 bot：横幅/按钮/排名全流程', async ({ page }) => {
    test.setTimeout(240000);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');

    await page.fill('#nick', '胜利流程测试');
    await page.click('#btn-create');
    await expect(page.locator('.room')).toContainText('房间');

    await page.click('#btn-add-bot');
    await page.click('#btn-add-bot');
    await page.click('#btn-add-bot');
    await expect(page.locator('.seats li')).toHaveCount(4);

    await page.click('#btn-start');
    await expect(page.locator('.phase')).toBeVisible({ timeout: 15_000 });

    // 阶段一：推到胜负，断言本轮横幅 + 开始下一轮按钮
    let reachedVictory = false;
    for (let loop = 0; loop < 40; loop += 1) {
      const phaseText = await page.locator('.phase').textContent().catch(() => '');
      if (phaseText?.includes('胜负')) {
        reachedVictory = true;
        break;
      }
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
    await expect(page.locator('.round-banner')).toContainText('本轮', { timeout: 10_000 });
    await expect(page.locator('#btn-next-round')).toBeVisible();

    // 阶段二：点下一轮 → 回到选牌
    await page.locator('#btn-next-round').click();
    await expect(page.locator('.phase')).toContainText('选牌', { timeout: 15_000 });

    // 阶段三：继续推到整局结束 → 排名表
    let reachedEnd = false;
    for (let loop = 0; loop < 60; loop += 1) {
      const phaseText = await page.locator('.phase').textContent().catch(() => '');
      if (phaseText?.includes('结束')) {
        reachedEnd = true;
        break;
      }
      // 胜负阶段优先用新的下一轮按钮（覆盖旧强制推进路径）
      const nextBtn = page.locator('#btn-next-round');
      if (await nextBtn.isVisible().catch(() => false)) {
        await nextBtn.click();
        await page.waitForTimeout(700);
        continue;
      }
      if (await page.locator('.table-info[hidden]').count()) await page.locator('[data-info-toggle]').click();
      const fa = page.locator('#btn-fa');
      if (await fa.isVisible().catch(() => false)) {
        await fa.click();
        await page.waitForTimeout(700);
        continue;
      }
      await page.waitForTimeout(500);
    }
    expect(reachedEnd).toBe(true);
    await expect(page.locator('.game-over-banner')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('.rank-table')).toBeVisible({ timeout: 10_000 });
    const rows = await page.locator('.rank-table tr').count();
    expect(rows).toBeGreaterThanOrEqual(4);
  });
});
