import { test, expect, type Page } from '@playwright/test';

// 6G-4b 视觉审查截图：桌面 1440×900 + 移动 390×844，共 20 状态。
// 输出 docs/06G_screenshots/，文件名即状态名。
// 策略：lobby/early/social/endgame/mobile 六段式；阶段相关态（商人/刺客/反应）
// 以 pending 文案探测命中即拍，未命中则拍当前态（review 中标注 approx，不阻断）。

const OUT = 'docs/06G_screenshots';

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: `${OUT}/${name}.png` });
}

async function setupRoom(page: Page, nick: string, bots: number): Promise<void> {
  await page.goto('/');
  await page.fill('#nick', nick);
  await page.click('#btn-create');
  await expect(page.locator('.room')).toContainText('房间', { timeout: 10_000 });
  for (let i = 0; i < bots; i += 1) {
    await page.click('#btn-add-bot');
  }
}

async function startGame(page: Page): Promise<void> {
  await page.click('#btn-start');
  await expect(page.locator('.phase')).toBeVisible({ timeout: 15_000 });
}

async function dismissIdentity(page: Page): Promise<void> {
  await page.locator('#identity-modal .identity-modal').click({ timeout: 5_000 }).catch(() => {});
  await expect(page.locator('#identity-modal')).toHaveCount(0, { timeout: 5_000 }).catch(() => {});
}

/** 走一步决策：declare→opt→pass→forceAdvance，返回 true 表示走了一步 */
async function autoStep(page: Page): Promise<boolean> {
  const declareOpts = page.locator('.pending .declare-opt');
  if ((await declareOpts.count().catch(() => 0)) > 0) {
    await declareOpts.first().click().catch(() => {});
    await page.click('#btn-declare').catch(() => {});
    await page.waitForTimeout(400);
    return true;
  }
  const opt = page.locator('.pending .opt[data-opt]').first();
  if ((await opt.count().catch(() => 0)) > 0 && (await opt.isVisible().catch(() => false))) {
    await opt.click().catch(() => {});
    await page.waitForTimeout(400);
    return true;
  }
  const passBtn = page.locator('#btn-pass');
  if (await passBtn.isVisible().catch(() => false)) {
    await passBtn.click().catch(() => {});
    await page.waitForTimeout(400);
    return true;
  }
  const fa = page.locator('#btn-fa');
  if (await fa.isVisible().catch(() => false)) {
    await fa.click().catch(() => {});
    await page.waitForTimeout(700);
    return true;
  }
  await page.waitForTimeout(500);
  return false;
}

async function pendingText(page: Page): Promise<string> {
  return (await page.locator('.pending').textContent().catch(() => '')) ?? '';
}

/** 有界点击：不可见/不可点时跳过，绝不无限等待（默认动作超时为无限） */
async function tap(page: Page, sel: string, ms = 6000): Promise<void> {
  const loc = page.locator(sel).first();
  if (await loc.isVisible().catch(() => false)) {
    await loc.click({ timeout: ms }).catch(() => {});
  }
}

test.describe('6G-4b 截图：桌面静态', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('lobby-empty + lobby-waiting', async ({ page }) => {
    await page.goto('/');
    await shot(page, 'desktop-lobby-empty');
    await setupRoom(page, '截图员', 3);
    await page.waitForTimeout(600);
    await shot(page, 'desktop-lobby-waiting');
  });
});

test.describe('6G-4b 截图：桌面开局与阶段', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('identity + draft + night + merchant + assassin + react', async ({ page }) => {
    test.setTimeout(240_000);
    await setupRoom(page, '截图员', 3);
    await startGame(page);

    // 身份弹窗（出现即拍，不关）
    await expect(page.locator('#identity-modal')).toBeVisible({ timeout: 8_000 }).catch(() => {});
    await page.waitForTimeout(400);
    await shot(page, 'desktop-identity-modal');
    await dismissIdentity(page);

    // Draft 选牌
    await expect(page.locator('.pending')).toContainText('选一张留下', { timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(300);
    await shot(page, 'desktop-draft-picking');

    // 向前推进，沿途探测各阶段（每种最多等 ~50 步）
    let gotNight = false;
    let gotMerchant = false;
    let gotAssassin = false;
    let gotReact = false;
    for (let i = 0; i < 120 && !(gotNight && gotMerchant && gotAssassin && gotReact); i += 1) {
      const t = await pendingText(page);
      const phase = (await page.locator('.phase').textContent().catch(() => '')) ?? '';
      if (!gotNight && /密探|隐士|骗徒|刺客|上忍|夜晚|声明|打出/.test(`${t} ${phase}`)) {
        await page.waitForTimeout(300);
        await shot(page, 'desktop-night-known');
        gotNight = true;
      }
      if (!gotMerchant && t.includes('商人')) {
        await page.waitForTimeout(300);
        await shot(page, 'desktop-trickster-merchant');
        gotMerchant = true;
      }
      if (!gotAssassin && t.includes('选择目标')) {
        await page.waitForTimeout(300);
        await shot(page, 'desktop-assassin-target');
        gotAssassin = true;
      }
      if (!gotReact && t.includes('是否发动反应')) {
        await page.waitForTimeout(300);
        await shot(page, 'desktop-react-window');
        gotReact = true;
      }
      if (await page.locator('.game-over-banner').isVisible().catch(() => false)) break;
      if (await page.locator('.round-banner').isVisible().catch(() => false)) break;
      await autoStep(page);
    }
    // 未命中兜底：写 -approx 后缀，不覆盖已有的真实态截图（全量回归不破坏基线）
    if (!gotNight) await shot(page, 'desktop-night-known-approx');
    if (!gotMerchant) await shot(page, 'desktop-trickster-merchant-approx');
    if (!gotAssassin) await shot(page, 'desktop-assassin-target-approx');
    if (!gotReact) await shot(page, 'desktop-react-window-approx');
  });
});

test.describe('6G-4b 截图：桌面社交', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('combo + emoji + suspect + chat', async ({ page }) => {
    test.setTimeout(180_000);
    await setupRoom(page, '截图员', 3);
    await startGame(page);
    await dismissIdentity(page);
    await expect(page.locator('.fx-bar')).toBeVisible({ timeout: 15_000 });

    // 怀疑标记 2 人（先拍，静态徽章）
    const cards = page.locator('.seat-card.bot');
    await tap(page, '.seat-card.bot >> nth=0 >> [data-mark]');
    await page.waitForTimeout(400);
    await tap(page, '.seat-card.bot >> nth=1 >> [data-mark]');
    await page.waitForTimeout(600);
    await shot(page, 'desktop-suspect-2');

    // 砸物品 10 连击（选首个 bot 为目标，快速连点后立即拍粒子飞行）
    await tap(page, '.seat-card.bot >> nth=0 >> .seat-head');
    await page.waitForTimeout(300);
    const fxBtns = page.locator('.fx-bar [data-fx]');
    const n = await fxBtns.count().catch(() => 0);
    for (let i = 0; i < 10; i += 1) {
      const b = fxBtns.nth(i % Math.max(n, 1));
      if (await b.isVisible().catch(() => false)) await b.click({ timeout: 4000 }).catch(() => {});
      await page.waitForTimeout(90);
    }
    await shot(page, 'desktop-combo-10');

    // 快捷表情 5 连弹
    const emojiBtns = page.locator('.fx-bar [data-emoji]');
    for (let i = 0; i < 5; i += 1) {
      const b = emojiBtns.nth(i % 12);
      if (await b.isVisible().catch(() => false)) await b.click({ timeout: 4000 }).catch(() => {});
      await page.waitForTimeout(120);
    }
    await shot(page, 'desktop-emoji-5');

    // 聊天/日志展开：打开折叠面板 + 发一句话 + 发一快捷短语
    await tap(page, '#chat-log-panel summary');
    await tap(page, '#phrase-panel summary');
    if (await page.locator('#chat-input').isVisible().catch(() => false)) {
      await page.fill('#chat-input', '视觉审查走一波', { timeout: 5000 }).catch(() => {});
      await tap(page, '#btn-chat');
    }
    await tap(page, '#phrase-panel [data-phrase="0"]');
    await page.waitForTimeout(800);
    await shot(page, 'desktop-chat-expanded');
  });
});

test.describe('6G-4b 截图：桌面终局', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('round-banner + game-over', async ({ page }) => {
    test.setTimeout(300_000);
    await setupRoom(page, '截图员', 3);
    await startGame(page);
    await dismissIdentity(page);
    for (let loop = 0; loop < 60; loop += 1) {
      if (await page.locator('.round-banner').isVisible().catch(() => false)) break;
      if (await page.locator('.game-over-banner').isVisible().catch(() => false)) break;
      const fa = page.locator('#btn-fa');
      if (await fa.isVisible().catch(() => false)) {
        await fa.click().catch(() => {});
        await page.waitForTimeout(700);
        continue;
      }
      await autoStep(page);
    }
    await page.waitForTimeout(500);
    await shot(page, 'desktop-round-banner');
    // 下一轮 → 推到整局结束
    await page.locator('#btn-next-round').click().catch(() => {});
    for (let loop = 0; loop < 80; loop += 1) {
      if (await page.locator('.game-over-banner').isVisible().catch(() => false)) break;
      const nextBtn = page.locator('#btn-next-round');
      if (await nextBtn.isVisible().catch(() => false)) {
        await nextBtn.click().catch(() => {});
        await page.waitForTimeout(700);
        continue;
      }
      const fa = page.locator('#btn-fa');
      if (await fa.isVisible().catch(() => false)) {
        await fa.click().catch(() => {});
        await page.waitForTimeout(700);
        continue;
      }
      await autoStep(page);
    }
    await page.waitForTimeout(500);
    await shot(page, 'desktop-game-over');
  });
});

test.describe('6G-4b 截图：移动端', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('m-lobby + m-identity + m-draft + m-night + m-combo', async ({ page }) => {
    await page.goto('/');
    await shot(page, 'mobile-lobby');
    await setupRoom(page, '手机玩家', 3);
    await startGame(page);
    await expect(page.locator('#identity-modal')).toBeVisible({ timeout: 8_000 }).catch(() => {});
    await page.waitForTimeout(400);
    await shot(page, 'mobile-identity');
    await dismissIdentity(page);
    await expect(page.locator('.pending')).toBeVisible({ timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(300);
    await shot(page, 'mobile-draft');
    for (let i = 0; i < 25; i += 1) {
      const t = await pendingText(page);
      if (/密探|隐士|骗徒|刺客|上忍|夜晚|声明|打出/.test(t)) break;
      await autoStep(page);
    }
    await page.waitForTimeout(300);
    await shot(page, 'mobile-night');
    await expect(page.locator('.fx-bar')).toBeVisible({ timeout: 15_000 }).catch(() => {});
    const botCard = page.locator('.seat-card.bot').first();
    await botCard.locator('.seat-head').click().catch(() => {});
    await page.waitForTimeout(300);
    const fxBtns = page.locator('.fx-bar [data-fx]');
    const n = await fxBtns.count().catch(() => 0);
    for (let i = 0; i < 6; i += 1) {
      await fxBtns.nth(i % Math.max(n, 1)).click().catch(() => {});
      await page.waitForTimeout(100);
    }
    await shot(page, 'mobile-combo');
  });

  test('m-gameover', async ({ page }) => {
    test.setTimeout(300_000);
    await setupRoom(page, '手机玩家', 3);
    await startGame(page);
    await dismissIdentity(page);
    for (let loop = 0; loop < 140; loop += 1) {
      if (await page.locator('.game-over-banner').isVisible().catch(() => false)) break;
      const nextBtn = page.locator('#btn-next-round');
      if (await nextBtn.isVisible().catch(() => false)) {
        await nextBtn.click().catch(() => {});
        await page.waitForTimeout(700);
        continue;
      }
      const fa = page.locator('#btn-fa');
      if (await fa.isVisible().catch(() => false)) {
        await fa.click().catch(() => {});
        await page.waitForTimeout(700);
        continue;
      }
      await autoStep(page);
    }
    await page.waitForTimeout(500);
    await shot(page, 'mobile-gameover');
  });
});
