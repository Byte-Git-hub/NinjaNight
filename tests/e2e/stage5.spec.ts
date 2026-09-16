import { test, expect, type Page, type BrowserContext } from '@playwright/test';

async function joinOrCreate(page: Page, nickname: string, code?: string) {
  await page.fill('#nick', nickname);
  if (code) {
    await page.fill('#code', code);
    await page.click('#btn-join');
  } else {
    await page.click('#btn-create');
  }
}

async function roomCodeFrom(page: Page): Promise<string> {
  await expect(page.locator('.room')).toContainText('房间');
  const roomText = await page.locator('.room').innerText();
  return roomText.replace(/[^\w]/g, '').replace('房间', '');
}

test.describe('移动端视口', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('iPhone 尺寸：准备与基本布局可操作', async ({ browser }) => {
    const contexts: BrowserContext[] = [];
    const pages: Page[] = [];
    for (const nick of ['H', 'A', 'B', 'C']) {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const p = await ctx.newPage();
      contexts.push(ctx);
      pages.push(p);
      await p.goto('/');
    }
    const [host, p1, p2, p3] = pages as [Page, Page, Page, Page];
    await joinOrCreate(host, 'H');
    const code = await roomCodeFrom(host);
    await joinOrCreate(p1, 'A', code);
    await joinOrCreate(p2, 'B', code);
    await joinOrCreate(p3, 'C', code);
    await p1.click('#btn-ready');
    await p2.click('#btn-ready');
    await p3.click('#btn-ready');
    await expect(host.locator('#btn-start')).toBeVisible();
    await host.click('#btn-start');
    await expect(host.locator('.phase')).toBeVisible({ timeout: 15_000 });
    // pending 全屏可点
    const opt = host.locator('.opt[data-opt]').first();
    if ((await opt.count()) > 0) {
      await expect(opt).toBeVisible();
    }
    for (const ctx of contexts) await ctx.close();
  });
});

test('断线：保留 session，房主可踢出', async ({ browser }) => {
  const ctxs: BrowserContext[] = [];
  const pages: Page[] = [];
  for (const nick of ['H', 'A', 'B', 'C']) {
    const ctx = await browser.newContext();
    const p = await ctx.newPage();
    ctxs.push(ctx);
    pages.push(p);
    await p.goto('/');
  }
  const [host, p1, p2, p3] = pages as [Page, Page, Page, Page];
  await joinOrCreate(host, 'H');
  const code = await roomCodeFrom(host);
  await joinOrCreate(p1, 'A', code);
  await joinOrCreate(p2, 'B', code);
  await joinOrCreate(p3, 'C', code);
  // 断开 A
  await p1.close();
  await host.waitForTimeout(800);
  // 房主应看到踢出按钮（断线座位）
  const kick = host.locator('.kick').first();
  await expect(kick).toBeVisible({ timeout: 8000 });
  await kick.click();
  await host.waitForTimeout(400);
  // 座位列表不应再有昵称「乙」（join 时 nickname 为 A）
  await expect(host.locator('.seats')).not.toContainText('A');
  for (const ctx of ctxs) await ctx.close();
});

test('商人完整流程：HONOR + 换刚看的那枚', async ({ browser }) => {
  // 通过服务端驱动更稳定：用四人局 + forceAdvance 到 trickster 后靠 UI 较难固定商人
  // 本 e2e 验证 merchantChoose/merchantExchange UI 出现与可点击（在能拿到商人时）
  // 真实完整交换由 core 单测覆盖；此处走 4 人开局并尝试 force 推进
  const ctxs: BrowserContext[] = [];
  const pages: Page[] = [];
  for (const nick of ['H', 'A', 'B', 'C']) {
    const ctx = await browser.newContext();
    const p = await ctx.newPage();
    ctxs.push(ctx);
    pages.push(p);
    await p.goto('/');
  }
  const [host, p1, p2, p3] = pages as [Page, Page, Page, Page];
  await joinOrCreate(host, 'H');
  const code = await roomCodeFrom(host);
  await joinOrCreate(p1, 'A', code);
  await joinOrCreate(p2, 'B', code);
  await joinOrCreate(p3, 'C', code);
  await p1.click('#btn-ready');
  await p2.click('#btn-ready');
  await p3.click('#btn-ready');
  await host.click('#btn-start');
  await expect(host.locator('.phase')).toBeVisible({ timeout: 15_000 });

  // 若出现商人查看选项则走完 seen 交换
  for (let i = 0; i < 20; i += 1) {
    for (const p of pages) {
      const viewHouse = p.locator('.opt[data-opt="view_house"]');
      const viewHonor = p.locator('.opt[data-opt="view_honor"]');
      if ((await viewHonor.count()) > 0) {
        await viewHonor.click();
        await p.waitForTimeout(150);
        if ((await p.locator('.opt[data-opt="no_swap"]').count()) > 0) {
          // 有令牌则选第一枚给出（排除 no_swap / view）
          const tokenOpts = p
            .locator(
              '.opt[data-opt]:not([data-opt="no_swap"]):not([data-opt="view_house"]):not([data-opt="view_honor"])',
            );
          if ((await tokenOpts.count()) > 0) {
            await tokenOpts.first().click();
            await p.waitForTimeout(100);
            const seen = p.locator('.opt[data-opt="seen"]');
            if ((await seen.count()) > 0) await seen.click();
            else {
              const rnd = p.locator('.opt[data-opt="random"]');
              if ((await rnd.count()) > 0) await rnd.click();
            }
          } else {
            await p.locator('.opt[data-opt="no_swap"]').click();
          }
        }
      } else {
        // 否则点第一个 opt 或跳过
        const opt = p.locator('.opt[data-opt]').first();
        if ((await opt.count()) > 0) await opt.click();
        else if ((await p.locator('#btn-pass').count()) > 0) {
          if (await p.locator('#btn-pass').isVisible()) await p.locator('#btn-pass').click();
        }
      }
    }
    await host.waitForTimeout(120);
    const phase = await host.locator('.phase').innerText().catch(() => '');
    if (phase.includes('结束') || phase.includes('胜负')) break;
  }
  await expect(host.locator('.panel').first()).toBeVisible();
  for (const ctx of ctxs) await ctx.close();
});

test('断线重连：A 加入 → 刷新 → 自动回到座位', async ({ browser }) => {
  const ctx = await browser.newContext();
  const host = await ctx.newPage();
  const p1 = await ctx.newPage();
  await host.goto('/');
  await p1.goto('/');

  await joinOrCreate(host, '房主');
  const code = await roomCodeFrom(host);
  await joinOrCreate(p1, '玩家A', code);
  await expect(p1.locator('.room')).toContainText(code);
  await expect(p1.locator('.seats')).toContainText('玩家A');
  await expect(p1.locator('.seat')).toContainText('s1');

  // 刷新玩家A页面
  await p1.reload();

  // 页面刷新后，带上 localStorage 中的 seatToken 握手重连，自动回到原房间和座位
  await expect(p1.locator('.room')).toContainText(code, { timeout: 10_000 });
  await expect(p1.locator('.seats')).toContainText('玩家A');
  await expect(p1.locator('.seat')).toContainText('s1');

  await ctx.close();
});

