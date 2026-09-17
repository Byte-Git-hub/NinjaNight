import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

test.describe('阶段 6E：状态同步与声明阶段卡面修复', () => {
  test('Bug B: 声明打出阶段待决策面板渲染真实卡面 (.card-art)', async ({ page }) => {
    const outDir = join(process.cwd(), 'docs', '06_assets', 'screenshots');
    mkdirSync(outDir, { recursive: true });

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');

    // 1. 创建房间并添加 3 个 Bot
    await page.fill('#nick', '水墨声明测试');
    await page.click('#btn-create');
    await expect(page.locator('.room')).toContainText('房间');

    await page.click('#btn-add-bot');
    await page.click('#btn-add-bot');
    await page.click('#btn-add-bot');
    await expect(page.locator('.seats li')).toHaveCount(4);

    // 2. 开始对局
    await page.click('#btn-start');
    await expect(page.locator('.phase')).toBeVisible({ timeout: 15_000 });

    let foundDeclareCards = false;

    // 持续推进直到进入某个 declareCards 阶段（卡牌声明打出）
    for (let loop = 0; loop < 30; loop += 1) {
      // 检查是否进入了 declareCards 决策
      const declareOpts = page.locator('.pending .declare-opt');
      if (await declareOpts.count().then((c) => c > 0).catch(() => false)) {
        foundDeclareCards = true;
        console.log('Detected declareCards decision in pending panel!');

        // 验证待决策面板包含真实卡面图片（.card-art）与编号徽章（.card-number）
        const cardArts = page.locator('.pending .declare-opt .card-art');
        await expect(cardArts.first()).toBeVisible({ timeout: 5000 });
        const artCount = await cardArts.count();
        expect(artCount).toBeGreaterThanOrEqual(1);

        const cardNumbers = page.locator('.pending .declare-opt .card-number');
        expect(await cardNumbers.count()).toBeGreaterThanOrEqual(1);

        // 验证声明操作按钮可见
        await expect(page.locator('#btn-declare')).toBeVisible();
        await expect(page.locator('#btn-pass')).toBeVisible();

        // 验证点击卡面能够切换选中状态
        const firstOpt = declareOpts.first();
        await firstOpt.click();
        await expect(firstOpt).toHaveClass(/sel/);

        // 截图 11：声明打出面板展示真实卡面、高亮选中态与操作按钮
        await page.screenshot({ path: join(outDir, '11_declare_cards.png') });
        console.log('Saved screenshot 11_declare_cards.png');

        // 点击确认打出或跳过以继续
        await page.click('#btn-declare');
        await page.waitForTimeout(500);
        break;
      }

      // 如果是在选牌阶段，优先选择编号 <= 9 的夜间牌以确保能进入声明阶段
      const draftOpts = page.locator('.pending .card.opt[data-opt]');
      if (await draftOpts.count().then((c) => c > 0).catch(() => false)) {
        await draftOpts.first().click();
        await page.waitForTimeout(400);
        continue;
      }

      // 常规选择按钮
      const anyOpt = page.locator('.pending .opt[data-opt]').first();
      if (await anyOpt.isVisible().catch(() => false)) {
        await anyOpt.click();
        await page.waitForTimeout(400);
        continue;
      }

      // 如果有跳过按钮
      const passBtn = page.locator('#btn-pass');
      if (await passBtn.isVisible().catch(() => false)) {
        await passBtn.click();
        await page.waitForTimeout(400);
        continue;
      }

      await page.waitForTimeout(300);
    }

    expect(foundDeclareCards).toBe(true);
  });

  test('Bug C: 房主点击强制推进可在 2 秒内使 phase 推进', async ({ page }) => {
    await page.goto('/');
    await page.fill('#nick', '推进测试房主');
    await page.click('#btn-create');
    await expect(page.locator('.room')).toContainText('房间');

    await page.click('#btn-add-bot');
    await page.click('#btn-add-bot');
    await page.click('#btn-add-bot');
    await expect(page.locator('.seats li')).toHaveCount(4);

    await page.click('#btn-start');
    await expect(page.locator('.phase')).toBeVisible({ timeout: 15_000 });
    const initialPhase = await page.locator('.phase').innerText();
    expect(initialPhase).toBeTruthy();

    // 点击强制推进
    await page.click('#btn-fa');

    // 验证 Toast 提示及时出现
    await expect(page.locator('#toast')).toContainText('已发送强制推进请求', { timeout: 2000 });

    // 验证 2 秒内 phase 发生改变
    await expect(page.locator('.phase')).not.toHaveText(initialPhase, { timeout: 2000 });
  });

  test('Bug A: 完整对局状态同步，view.phase 与服务端完全同步且不卡死在旧阶段', async ({ page }) => {
    await page.goto('/');
    await page.fill('#nick', '全链路同步');
    await page.click('#btn-create');
    await expect(page.locator('.room')).toContainText('房间');

    await page.click('#btn-add-bot');
    await page.click('#btn-add-bot');
    await page.click('#btn-add-bot');
    await expect(page.locator('.seats li')).toHaveCount(4);

    await page.click('#btn-start');
    await expect(page.locator('.phase')).toBeVisible({ timeout: 15_000 });

    const seenPhases = new Set<string>();

    for (let loop = 0; loop < 50; loop += 1) {
      const phaseText = await page.locator('.phase').innerText().catch(() => '');
      if (phaseText) seenPhases.add(phaseText);

      // 如果出现游戏结束横幅
      if (await page.locator('.game-over-banner').isVisible().catch(() => false)) {
        console.log('Game over banner detected!');
        break;
      }

      // 验证状态同步：如果日志中已经有了结算胜者事件，UI phase 绝不能卡在「隐士/密探」等早先阶段
      const logTexts = await page.locator('#game-log .ev').allInnerTexts().catch(() => []);
      const hasRoundWinner = logTexts.some((t) => t.includes('score.roundWinner'));
      if (hasRoundWinner) {
        // 当前 phase 应该是结算相关阶段或新一轮选牌，而不是旧的 night*
        expect(phaseText).not.toBe('隐士');
      }

      // 动作处理：
      // 1. 如果有 declare-opt，点击选中第一张再点击确认打出
      const declareOpts = page.locator('.pending .declare-opt');
      if (await declareOpts.count().then((c) => c > 0).catch(() => false)) {
        await declareOpts.first().click();
        await page.click('#btn-declare');
        await page.waitForTimeout(400);
        continue;
      }

      // 2. 如果有跳过按钮
      const passBtn = page.locator('#btn-pass');
      if (await passBtn.isVisible().catch(() => false)) {
        await passBtn.click();
        await page.waitForTimeout(400);
        continue;
      }

      // 3. 待决策选项按钮（选牌或目标选择）
      const optBtn = page.locator('.pending .opt[data-opt]').first();
      if (await optBtn.isVisible().catch(() => false)) {
        await optBtn.click();
        await page.waitForTimeout(400);
        continue;
      }

      // 4. 等待片刻
      await page.waitForTimeout(400);
    }

    console.log('Full game seen phases:', Array.from(seenPhases));
    // 验证至少经历了选牌与夜间等多个阶段推进
    expect(seenPhases.size).toBeGreaterThanOrEqual(3);
  });
});
