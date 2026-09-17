import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

test('生成 6D 截图：08_draft_cards, 09_brightened_board, 10_leave_button', async ({ page }) => {
  const outDir = join(process.cwd(), 'docs', '06_assets', 'screenshots');
  mkdirSync(outDir, { recursive: true });

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');

  // 1. 创建房间进入大厅
  await page.fill('#nick', '水墨忍者');
  await page.click('#btn-create');
  await expect(page.locator('.room')).toContainText('房间');
  await expect(page.locator('#btn-leave-room')).toBeVisible();

  // 截图 10：大厅界面，右上角可见「返回大厅」按钮
  await page.screenshot({ path: join(outDir, '10_leave_button.png') });

  // 2. 添加 3 个 Bot
  await page.click('#btn-add-bot');
  await page.click('#btn-add-bot');
  await page.click('#btn-add-bot');
  await expect(page.locator('.seats li')).toHaveCount(4);

  // 3. 开始游戏进入 Draft 选牌
  await page.click('#btn-start');
  await expect(page.locator('.phase')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.pending .card.opt[data-opt]')).toHaveCount(3, { timeout: 15_000 });

  // 等待图片加载完成
  await page.waitForTimeout(1000);

  // 截图 08：选牌阶段展示三张候选卡牌与编号徽章
  await page.screenshot({ path: join(outDir, '08_draft_cards.png') });

  // 截图 09：对局主界面，展示提亮后的水墨背景与面板
  await page.screenshot({ path: join(outDir, '09_brightened_board.png') });
});
