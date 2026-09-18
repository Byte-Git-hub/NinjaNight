import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';

const ITEM_IDS = ['egg', 'sakura', 'geta', 'rotten_pill', 'basket', 'secret_letter', 'tea', 'snowball', 'shuriken'];
const EMOJI_IDS = ['swords', 'kunai', 'ninja_head', 'noh_mask', 'flame', 'water', 'moon', 'star', 'tea_cup', 'bamboo', 'kitsune_mask', 'scroll'];

async function roomCode(page: Page): Promise<string> {
  const text = await page.locator('.room').innerText();
  const match = text.match(/[A-Z0-9]{6}/);
  if (!match) throw new Error(`room code missing: ${text}`);
  return match[0];
}

async function dismissModal(page: Page): Promise<void> {
  const modal = page.locator('.identity-modal');
  if (await modal.count()) await modal.first().click().catch(() => undefined);
}

/** Two real clients plus two server-side bots. */
async function openRoom(browser: Browser): Promise<{ host: Page; guest: Page; contexts: BrowserContext[] }> {
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();
  await host.goto('/');
  await guest.goto('/');
  await host.fill('#nick', '飞行房主');
  await host.click('#btn-create');
  const code = await roomCode(host);
  await guest.fill('#nick', '飞行观察员');
  await guest.fill('#code', code);
  await guest.click('#btn-join');
  await host.click('#btn-add-bot');
  await host.click('#btn-add-bot');
  await expect(host.locator('.seats li')).toHaveCount(4, { timeout: 10_000 });
  await guest.click('#btn-ready').catch(() => undefined);
  await host.click('#btn-start');
  await expect(host.locator('.phase')).toBeVisible({ timeout: 15_000 });
  await expect(guest.locator('.phase')).toBeVisible({ timeout: 15_000 });
  await dismissModal(host);
  await dismissModal(guest);
  return { host, guest, contexts: [hostContext, guestContext] };
}

async function chooseTarget(page: Page): Promise<void> {
  const target = page.locator('.seat-card.bot').first();
  await expect(target).toBeVisible();
  await target.click();
}

async function choosePaged(page: Page, selector: string, label: string): Promise<void> {
  // The Dock only renders the active page. Walk in either direction based on
  // the pager text, and never click a disabled arrow (page 1 has no previous).
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const button = page.locator(`.social-pop ${selector}`).first();
    if ((await button.count()) > 0 && (await button.isVisible())) {
      await button.click();
      return;
    }
    const pagerText = await page.locator('.social-pop .pager span').innerText();
    const match = pagerText.match(/(\d+)\s*\/\s*(\d+)/);
    if (!match) throw new Error(`${label} pager missing: ${pagerText}`);
    const current = Number(match[1]);
    const total = Number(match[2]);
    if (current < total) {
      await page.locator('.social-pop [data-page="social"][data-delta="1"]:not([disabled])').click();
    } else if (current > 1) {
      await page.locator('.social-pop [data-page="social"][data-delta="-1"]:not([disabled])').click();
    } else {
      throw new Error(`${label} not found on ${pagerText}`);
    }
  }
  throw new Error(`${label} not found after paging`);
}

async function chooseEffect(page: Page, id: string): Promise<void> {
  await choosePaged(page, `[data-fx="${id}"]`, `item ${id}`);
}

async function chooseEmoji(page: Page, id: string): Promise<void> {
  await choosePaged(page, `[data-reaction-emoji-id="${id}"]`, `emoji ${id}`);
}

async function sendSelected(page: Page, count: number): Promise<void> {
  await page.locator(`[data-reaction-count="${count}"]`).click();
  await page.locator('[data-social-send]').click();
}

test('双客户端物品飞行、图片表情与快捷短语同步且无重复 DOM', async ({ browser }) => {
  const { host, guest, contexts } = await openRoom(browser);
  try {
    await host.click('[data-social-tab="effects"]');
    for (const id of ITEM_IDS) {
      await chooseEffect(host, id);
      await chooseTarget(host);
      await sendSelected(host, 10);
    }
    await expect.poll(async () => Number(await host.locator('.item-flight-layer').getAttribute('data-launched') ?? 0), { timeout: 15_000 }).toBe(90);
    await expect.poll(async () => Number(await guest.locator('.item-flight-layer').getAttribute('data-launched') ?? 0), { timeout: 15_000 }).toBe(90);
    expect(await host.locator('.item-flight-layer').count()).toBe(1);
    expect(await guest.locator('.item-flight-layer').count()).toBe(1);

    await host.click('[data-social-tab="emoji"]');
    for (const id of EMOJI_IDS) {
      await chooseEmoji(host, id);
      await chooseTarget(host);
      await sendSelected(host, 1);
    }
    await expect.poll(async () => Number(await host.locator('.item-flight-layer').getAttribute('data-emoji-launched') ?? 0), { timeout: 15_000 }).toBe(12);
    await expect.poll(async () => Number(await guest.locator('.item-flight-layer').getAttribute('data-emoji-launched') ?? 0), { timeout: 15_000 }).toBe(12);
    expect(Number(await host.locator('.item-flight-layer').getAttribute('data-launched') ?? 0)).toBeLessThan(100);

    await host.click('[data-social-tab="phrases"]');
    await host.locator('[data-phrase="0"]').click();
    await expect(host.locator('.phrase-bubble')).toContainText('飞行房主：快点啊，鸡都要叫了');
    await expect(guest.locator('.phrase-bubble')).toContainText('飞行房主：快点啊，鸡都要叫了');
    await expect(host.locator('#toast')).not.toContainText('快点啊');

    // A compressed 1,000-item event should occupy the same canvas, not 1,000 DOM nodes.
    await host.click('[data-social-tab="effects"]');
    await chooseEffect(host, 'egg');
    await chooseTarget(host);
    await sendSelected(host, 1000);
    await expect.poll(async () => Number(await guest.locator('.item-flight-layer').getAttribute('data-launched') ?? 0), { timeout: 20_000 }).toBe(1090);
    await expect.poll(async () => Number(await guest.locator('.item-flight-layer').getAttribute('data-peak-flights') ?? 0), { timeout: 15_000 }).toBeGreaterThanOrEqual(1000);
    await expect.poll(async () => Number(await guest.locator('.item-flight-layer').getAttribute('data-last-frame-ms') ?? 0), { timeout: 15_000 }).toBeGreaterThan(0);
    const frameInterval = Number(await guest.locator('.item-flight-layer').getAttribute('data-last-frame-ms') ?? 0);
    expect(Number.isFinite(frameInterval)).toBe(true);
    expect(frameInterval).toBeGreaterThanOrEqual(0);
    expect(Number(await guest.locator('.item-flight-layer').getAttribute('data-last-update-ms') ?? 0)).toBeGreaterThanOrEqual(0);
    expect(Number(await guest.locator('.item-flight-layer').getAttribute('data-last-draw-ms') ?? 0)).toBeGreaterThanOrEqual(0);
    await expect(host.locator('.effect-projectile, .reaction-projectile')).toHaveCount(0);
    await expect(host.locator('.banner.err').filter({ hasText: 'RATE_LIMITED' })).toHaveCount(0);
    await expect(guest.locator('.banner.err').filter({ hasText: 'RATE_LIMITED' })).toHaveCount(0);
  } finally {
    for (const context of contexts) await context.close();
  }
});

test('prefers-reduced-motion 仍广播数量但不启动飞行循环', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  try {
    await page.goto('/');
    await page.fill('#nick', '低动态测试');
    await page.click('#btn-create');
    await page.click('#btn-add-bot');
    await page.click('#btn-add-bot');
    await page.click('#btn-add-bot');
    await page.click('#btn-start');
    await expect(page.locator('.phase')).toBeVisible({ timeout: 15_000 });
    await dismissModal(page);
    await page.click('[data-social-tab="effects"]');
    await chooseEffect(page, 'egg');
    await chooseTarget(page);
    await sendSelected(page, 10);
    await expect.poll(async () => Number(await page.locator('.item-flight-layer').getAttribute('data-launched') ?? 0), { timeout: 5_000 }).toBeGreaterThanOrEqual(10);
    expect(await page.locator('.item-flight-layer').getAttribute('data-active-flights')).toBe('0');
    expect(await page.locator('.item-flight-layer').getAttribute('data-frames')).toBe('0');
  } finally {
    await context.close();
  }
});
