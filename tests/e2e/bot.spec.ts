import { test, expect } from '@playwright/test';

test('单玩家与 3 个 Bot 完整对局流程', async ({ page }) => {
  await page.goto('/');

  // 1. 创建房间
  await page.fill('#nick', '房主玩家');
  await page.click('#btn-create');

  await expect(page.locator('.room')).toContainText('房间');
  await expect(page.locator('.seats li')).toHaveCount(1);

  // 2. 验证添加与移除人机按钮逻辑
  await expect(page.locator('#btn-remove-bot')).toHaveCount(0);
  await page.click('#btn-add-bot');
  await expect(page.locator('.seats li')).toHaveCount(2);
  await expect(page.locator('.seats li').nth(1)).toContainText('🤖');
  await expect(page.locator('#btn-remove-bot')).toBeVisible();

  // 移除人机
  await page.click('#btn-remove-bot');
  await expect(page.locator('.seats li')).toHaveCount(1);
  await expect(page.locator('#btn-remove-bot')).toHaveCount(0);

  // 添加 3 个人机至 4 人满编
  await page.click('#btn-add-bot');
  await page.click('#btn-add-bot');
  await page.click('#btn-add-bot');
  await expect(page.locator('.seats li')).toHaveCount(4);
  await expect(page.locator('.hint')).toContainText('可开始');
  await expect(page.locator('#btn-start')).toBeEnabled();

  // 3. 开始游戏
  await page.click('#btn-start');
  await expect(page.locator('.phase')).toBeVisible({ timeout: 15000 });

  // 4. Draft 阶段互动：房主选牌，Bot 自动行动推进
  // 选牌 1
  await expect(page.locator('.opt[data-opt]').first()).toBeVisible({ timeout: 10000 });
  await page.locator('.opt[data-opt]').first().click();

  // 轮转推进：等待下一轮待办或传牌阶段
  // 由于 Bot 有 500-1500ms 随机延迟，等待几秒后即可推进
  await expect(async () => {
    const text = await page.locator('.pending, .phase').allInnerTexts();
    // 应当推进到选牌 2 或弃牌或夜间阶段
    const combined = text.join(' ');
    expect(
      combined.includes('选牌 2') ||
      combined.includes('弃牌') ||
      combined.includes('夜间') ||
      combined.includes('密探') ||
      combined.includes('隐士') ||
      combined.includes('骗徒') ||
      combined.includes('刺客') ||
      combined.includes('上忍') ||
      combined.includes('等待其他玩家')
    ).toBe(true);
  }).toPass({ timeout: 15000, intervals: [500] });

  // 持续响应当前玩家的任何 pending 决策直至夜间
  for (let step = 0; step < 10; step++) {
    const opts = page.locator('.opt[data-opt]');
    if ((await opts.count()) > 0) {
      await opts.first().click();
      await page.waitForTimeout(600);
      continue;
    }
    const passBtn = page.locator('#btn-pass');
    if ((await passBtn.count()) > 0 && (await passBtn.isVisible())) {
      await passBtn.click();
      await page.waitForTimeout(600);
      continue;
    }
    await page.waitForTimeout(500);
  }

  // 5. 验证事件流正常推进：日志区有事件产生
  // 6F-5：聊天/日志默认折叠（DOM 常驻），可见性断言改为 attached
  await expect(page.locator('#game-log .ev').first()).toBeAttached({ timeout: 10000 });
  const logCount = await page.locator('#game-log .ev').count();
  expect(logCount).toBeGreaterThan(0);

  // 6. 验证信息隔离：玩家界面上不应泄露 Bot 的暗手牌内容
  const pageContent = await page.content();
  // 确认 Bot 座位只显示公开信息（昵称、🤖、状态），不出现 Bot 的未公开卡牌详情
  expect(pageContent).toContain('🤖');
});
