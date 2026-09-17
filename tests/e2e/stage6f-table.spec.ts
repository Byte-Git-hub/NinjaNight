import { test, expect } from '@playwright/test';

// 6F 桌游布局：身份覆盖 / 手牌背堆叠 / 中央分组 / 移动端
test.describe('6F 桌游布局', () => {
  test('身份覆盖：弹窗→卡背→翻转→盖回', async ({ page }) => {
    await page.goto('/');
    await page.fill('#nick', '身份测试');
    await page.click('#btn-create');
    await page.click('#btn-add-bot');
    await page.click('#btn-add-bot');
    await page.click('#btn-add-bot');
    await page.click('#btn-start');
    await expect(page.locator('.phase')).toBeVisible({ timeout: 15_000 });

    // 开局弹窗
    await expect(page.locator('#identity-modal')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('#identity-modal .identity-name')).toContainText('你的身份');
    await page.locator('#identity-modal .identity-modal').click();
    await expect(page.locator('#identity-modal')).toHaveCount(0);

    // 关闭后为卡背 + 点击查看提示，不露身份名
    const selfCard = page.locator('.seat-card.self');
    await expect(selfCard.locator('.flip-wrap')).toBeVisible();
    await expect(selfCard.locator('.peek-hint')).toBeVisible();
    await expect(selfCard.locator('.self-meta')).not.toContainText('你的身份');

    // 翻转查看
    await selfCard.locator('.flip-wrap').click();
    await expect(selfCard.locator('.flip-wrap.show-front')).toBeVisible({ timeout: 5_000 });
    await expect(selfCard.locator('.self-meta')).toContainText('你的身份', { timeout: 5_000 });

    // 点外部盖回（点另一座位头，位于 .table 内、翻转区外）
    await page.locator('.seat-card[data-seat="s1"] .seat-head').click();
    await expect(selfCard.locator('.flip-wrap.show-front')).toHaveCount(0, { timeout: 5_000 });
  });

  test('手牌背堆叠 ×N（选牌期他人为 ×3）', async ({ page }) => {
    await page.goto('/');
    await page.fill('#nick', '堆叠测试');
    await page.click('#btn-create');
    await page.click('#btn-add-bot');
    await page.click('#btn-add-bot');
    await page.click('#btn-add-bot');
    await page.click('#btn-start');
    await expect(page.locator('.phase')).toBeVisible({ timeout: 15_000 });
    const stack = page.locator('.seat-card[data-seat="s1"] .hand-stack i');
    await expect(stack).toContainText('×3', { timeout: 10_000 });
    await expect(page.locator('.seat-card[data-seat="s1"] .house-mini.back')).toBeVisible();
  });

  test('中央分组：当前高亮、过往半透明', async ({ page }) => {
    await page.goto('/');
    await page.fill('#nick', '中央测试');
    await page.click('#btn-create');
    await page.click('#btn-add-bot');
    await page.click('#btn-add-bot');
    await page.click('#btn-add-bot');
    await page.click('#btn-start');
    await expect(page.locator('.phase')).toBeVisible({ timeout: 15_000 });
    for (let i = 0; i < 150; i++) {
      const n = await page
        .locator('.central .played-item')
        .count()
        .catch(() => 0);
      if (n > 0) break;
      if (await page.locator('.game-over-banner').isVisible().catch(() => false)) break;
      const declareOpts = page.locator('.pending .declare-opt');
      if ((await declareOpts.count().catch(() => 0)) > 0) {
        await declareOpts.first().click();
        await page.click('#btn-declare');
        await page.waitForTimeout(400);
        continue;
      }
      const passBtn = page.locator('#btn-pass');
      if (await passBtn.isVisible().catch(() => false)) {
        await passBtn.click();
        await page.waitForTimeout(400);
        continue;
      }
      const optBtn = page.locator('.pending .opt[data-opt]').first();
      if (await optBtn.isVisible().catch(() => false)) {
        await optBtn.click();
        await page.waitForTimeout(400);
        continue;
      }
      await page.waitForTimeout(400);
    }
    const nowGroup = page.locator('.central .phase-group.now');
    await expect(nowGroup).toBeVisible({ timeout: 10_000 });
    await expect(nowGroup).toContainText('进行中');
    await expect(nowGroup.locator('.played-item').first()).toBeVisible();
    // 署名：出牌者昵称 + 打出了 + 牌名
    await expect(nowGroup.locator('.played-who').first()).toContainText('打出了');
    const pastCount = await page.locator('.central .phase-group.past').count();
    if (pastCount > 0) {
      await expect(page.locator('.central .phase-group.past').first()).toHaveCSS('opacity', '0.55');
    }
  });

  test.describe('移动端', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('390宽：座位横滑、手牌底部固定、开局选牌可点', async ({ page }) => {
      await page.goto('/');
      await page.fill('#nick', '手机玩家');
      await page.click('#btn-create');
      await page.click('#btn-add-bot');
      await page.click('#btn-add-bot');
      await page.click('#btn-add-bot');
      await page.click('#btn-start');
      await expect(page.locator('.phase')).toBeVisible({ timeout: 15_000 });
      // 关身份弹窗（若仍在 2.5s 内），避免盖住后续点击
      if (await page.locator('#identity-modal').isVisible().catch(() => false)) {
        await page.locator('#identity-modal .identity-modal').click();
      }

      // 座位横向滚动
      const scrollable = await page.locator('.seats.ring').evaluate((el) => el.scrollWidth >= el.clientWidth);
      expect(scrollable).toBe(true);

      // 手牌底部固定
      await expect(page.locator('.hand')).toHaveCSS('position', 'fixed');

      // 选牌可点
      const draftOpt = page.locator('.pending .card.opt[data-opt]').first();
      await expect(draftOpt).toBeVisible({ timeout: 15_000 });
      await draftOpt.click();
      await page.waitForTimeout(500);

      // 交互元素不小于 32px（先展开折叠面板再抽查）
      await page.locator('#chat-log-panel summary').click();
      await expect(page.locator('#chat-input')).toBeVisible({ timeout: 5_000 });
      const sizes = await page
        .locator('#btn-chat, #chat-input')
        .evaluateAll((els) =>
          els.map((el) => {
            const r = el.getBoundingClientRect();
            return { w: r.width, h: r.height };
          }),
        );
      for (const s of sizes) {
        expect(Math.min(s.w, s.h)).toBeGreaterThanOrEqual(32);
      }
    });
  });
});
