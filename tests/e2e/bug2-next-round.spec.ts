import { test, expect } from '@playwright/test';

test.describe('6E.7-bug2: 上忍不再卡住 + 胜负后可进下一轮', () => {
  test('1 人 + 3 bot：击杀可选、胜负后强制推进进选牌', async ({ page }) => {
    test.setTimeout(150000);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');

    await page.fill('#nick', '下一轮测试');
    await page.click('#btn-create');
    await expect(page.locator('.room')).toContainText('房间');

    await page.click('#btn-add-bot');
    await page.click('#btn-add-bot');
    await page.click('#btn-add-bot');
    await expect(page.locator('.seats li')).toHaveCount(4);

    await page.click('#btn-start');
    await expect(page.locator('.phase')).toBeVisible({ timeout: 15_000 });

    let killClicked = false;
    let reachedVictory = false;
    // forceAdvance 一路推到胜负；途中若出现击杀选项则点它（验证按钮语义不断链）
    for (let loop = 0; loop < 40; loop += 1) {
      const phaseText = await page.locator('.phase').textContent().catch(() => '');
      if (phaseText?.includes('胜负')) {
        reachedVictory = true;
        break;
      }
      if (phaseText?.includes('结束')) break;
      const killBtn = page.locator('.pending .opt', { hasText: '击杀' }).first();
      if (await killBtn.isVisible().catch(() => false)) {
        await killBtn.click();
        killClicked = true;
        await page.waitForTimeout(800);
        continue;
      }
      const fa = page.locator('#btn-fa');
      if (await fa.isVisible().catch(() => false)) {
        await fa.click();
        await page.waitForTimeout(700);
        continue;
      }
      await page.waitForTimeout(500);
    }
    expect(reachedVictory).toBe(true);

    // 房主点强制推进 → 进入下一轮选牌
    await page.locator('#btn-fa').click();
    await expect(page.locator('.phase')).toContainText('选牌', { timeout: 15_000 });
    console.log(`bug2 e2e ok, killClicked=${killClicked}`);
  });
});
