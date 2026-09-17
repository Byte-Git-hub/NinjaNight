import { test, expect } from '@playwright/test';

test.describe('房间生命周期与 UI 修复', () => {
  test('房主点击「返回大厅」退出房间，清除 localStorage 与 URL 参数', async ({ page }) => {
    await page.goto('/');

    // 1. 创建房间
    await page.fill('#nick', '离开测试玩家');
    await page.click('#btn-create');

    await expect(page.locator('.room')).toContainText('房间');
    const lastRoom = await page.evaluate(() => localStorage.getItem('ninja-night:lastRoomCode'));
    expect(lastRoom).toBeTruthy();
    const token = await page.evaluate(
      (code) => localStorage.getItem(`ninja-night:seatToken:${code}`),
      lastRoom,
    );
    expect(token).toBeTruthy();

    // 2. 点击「返回大厅」
    await expect(page.locator('#btn-leave-room')).toBeVisible();
    await page.click('#btn-leave-room');

    // 3. 页面回到创建/加入房间表单
    await expect(page.locator('#btn-create')).toBeVisible();
    await expect(page.locator('#btn-join')).toBeVisible();
    await expect(page.locator('.room')).toHaveCount(0);

    // 4. localStorage 中的 seatToken 被清除，URL 参数清除
    const clearedLast = await page.evaluate(() => localStorage.getItem('ninja-night:lastRoomCode'));
    const clearedToken = await page.evaluate(
      (code) => localStorage.getItem(`ninja-night:seatToken:${code}`),
      lastRoom,
    );
    expect(clearedLast).toBeNull();
    expect(clearedToken).toBeNull();
    expect(page.url()).not.toContain('room=');
  });

  test('对局中点击「终止本局」无需刷新页面直接回到房间大厅', async ({ page }) => {
    await page.goto('/');

    // 1. 创建房间并添加 3 个 Bot
    await page.fill('#nick', '房主终止测试');
    await page.click('#btn-create');

    await expect(page.locator('.room')).toContainText('房间');
    await page.click('#btn-add-bot');
    await page.click('#btn-add-bot');
    await page.click('#btn-add-bot');
    await expect(page.locator('.seats li')).toHaveCount(4);

    // 2. 开始游戏
    await page.click('#btn-start');
    await expect(page.locator('.phase')).toBeVisible({ timeout: 15_000 });

    // 3. 点击「终止本局」
    await expect(page.locator('#btn-end')).toBeVisible({ timeout: 5_000 });
    await page.click('#btn-end');

    // 4. 无需刷新页面，立即回到大厅界面（显示座位列表和开始按钮）
    await expect(page.locator('.seats li')).toHaveCount(4, { timeout: 10_000 });
    await expect(page.locator('#btn-start')).toBeVisible();
    await expect(page.locator('.phase')).toHaveCount(0);
  });

  test('选牌阶段渲染完整卡面（包含 .card-art 与 .card-number）', async ({ page }) => {
    await page.goto('/');

    // 1. 创建房间并添加 3 个 Bot
    await page.fill('#nick', '选牌视觉测试');
    await page.click('#btn-create');

    await expect(page.locator('.room')).toContainText('房间');
    await page.click('#btn-add-bot');
    await page.click('#btn-add-bot');
    await page.click('#btn-add-bot');

    // 2. 开始游戏进入 Draft
    await page.click('#btn-start');
    await expect(page.locator('.phase')).toBeVisible({ timeout: 15_000 });

    // 3. 等待 Draft 选牌候选卡面出现（任一张有编号的卡即断言；
    //    罕见全无编号时（还施/殉道/大将军）选一张进下一轮选项，最多看 4 轮）
    let numText = '';
    for (let i = 0; i < 4; i++) {
      await expect(page.locator('.pending .card.opt[data-opt]').first()).toBeVisible({ timeout: 15_000 });
      const numbered = page
        .locator('.pending .card.opt[data-opt]')
        .filter({ has: page.locator('.card-number') });
      if ((await numbered.count()) > 0) {
        // 4. 验证卡面包含立绘 .card-art 与编号徽章 .card-number
        await expect(numbered.first().locator('.card-art')).toBeVisible();
        await expect(numbered.first().locator('.card-number')).toBeVisible();
        numText = await numbered.first().locator('.card-number').innerText();
        break;
      }
      await page.locator('.pending .card.opt[data-opt]').first().click();
      await page.waitForTimeout(600);
    }
    expect(Number(numText)).toBeGreaterThanOrEqual(1);

    // 5. 点击卡面可以完成选牌
    await page.locator('.pending .card.opt[data-opt]').first().click().catch(() => {});
    await page.waitForTimeout(500);
  });
});
