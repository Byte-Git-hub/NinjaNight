import { test, expect, type Locator, type Page } from '@playwright/test';

type ViewportCase = { name: string; width: number; height: number };

const VIEWPORTS: ViewportCase[] = [
  { name: '1920x1080', width: 1920, height: 1080 },
  { name: '1440x900', width: 1440, height: 900 },
  { name: '1366x768', width: 1366, height: 768 },
  { name: '1024x768', width: 1024, height: 768 },
  { name: '390x844', width: 390, height: 844 },
  { name: '844x390', width: 844, height: 390 },
];

async function makeRoom(page: Page, seats: number, nickname: string) {
  await page.goto('/');
  await page.fill('#nick', nickname);
  await page.click('#btn-create');
  for (let i = 1; i < seats; i += 1) {
    await page.click('#btn-add-bot');
  }
  await expect(page.locator('.seat-card')).toHaveCount(seats, { timeout: 10_000 });
}

async function dismissIdentity(page: Page) {
  const modal = page.locator('#identity-modal .identity-modal');
  if (await modal.isVisible().catch(() => false)) await modal.click();
}

async function rect(locator: Locator) {
  return locator.boundingBox();
}

async function assertNoSeatOverlap(page: Page, label: string) {
  const snapshot = await page.evaluate(() => {
    const visible = (el: Element) => {
      const style = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && r.width > 0 && r.height > 0;
    };
    const toRect = (el: Element) => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    };
    return [...document.querySelectorAll<HTMLElement>('.seat-card')].map((card) => ({
      rect: toRect(card),
      images: [...card.querySelectorAll('.house-mini, .flip-wrap, .hand-stack img, .token-stack img')]
        .filter(visible).map(toRect),
    }));
  });
  const boxes = snapshot.map((entry) => entry.rect);
  expect(boxes.length, `${label}: every seat needs a box`).toBeGreaterThan(0);

  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  const { width, height } = viewport!;
  for (const [i, box] of boxes.entries()) {
    expect(box.x, `${label}: seat ${i} left`).toBeGreaterThanOrEqual(-1);
    expect(box.y, `${label}: seat ${i} top`).toBeGreaterThanOrEqual(-1);
    expect(box.x + box.width, `${label}: seat ${i} right`).toBeLessThanOrEqual(width + 1);
    expect(box.y + box.height, `${label}: seat ${i} bottom`).toBeLessThanOrEqual(height + 1);
    expect(box.width, `${label}: seat ${i} width`).toBeGreaterThan(32);
    expect(box.height, `${label}: seat ${i} height`).toBeGreaterThan(32);

    for (const [k, imageBox] of snapshot[i].images.entries()) {
      expect(imageBox.x, `${label}: seat ${i} image ${k} left`).toBeGreaterThanOrEqual(box.x - 1);
      expect(imageBox.x + imageBox.width, `${label}: seat ${i} image ${k} right`).toBeLessThanOrEqual(box.x + box.width + 1);
      expect(imageBox.y, `${label}: seat ${i} image ${k} top`).toBeGreaterThanOrEqual(box.y - 1);
      expect(imageBox.y + imageBox.height, `${label}: seat ${i} image ${k} bottom`).toBeLessThanOrEqual(box.y + box.height + 1);
    }
  }
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const a = boxes[i];
      const b = boxes[j];
      const overlap = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
        Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
      expect(overlap, `${label}: seats ${i} and ${j} overlap`).toBeLessThan(2);
    }
  }
}

async function assertSingleViewport(page: Page, label: string, lobby: boolean) {
  const viewport = page.viewportSize()!;
  const scroll = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    height: document.documentElement.scrollHeight,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
  }));
  expect(scroll.width, `${label}: horizontal scroll`).toBeLessThanOrEqual(scroll.viewportWidth + 1);
  expect(scroll.height, `${label}: vertical scroll`).toBeLessThanOrEqual(scroll.viewportHeight + 1);
  await assertNoSeatOverlap(page, label);

  const imageBoxes = await page.evaluate(() => [...document.querySelectorAll('.seat-card .house-mini, .seat-card .flip-wrap')].map(el => {
    const r = el.getBoundingClientRect(); return { width:r.width, height:r.height };
  }));
  for (const box of imageBoxes) {
    expect(box.width, `${label}: identity width`).toBeGreaterThan(lobby ? 20 : viewport.width < 701 ? 22 : 35);
    expect(box.height, `${label}: identity height`).toBeGreaterThan(lobby ? 26 : viewport.width < 701 ? 28 : 42);
  }

  if (!lobby) {
    const central = page.locator('.central');
    const hand = page.locator('.hand');
    const pendingCards = page.locator('.pending .card').first();
    const decision = page.locator('#decision-zone');
    const handBox = await rect(hand);
    const pendingBox = await rect(pendingCards);
    const handRegion: Locator = handBox && handBox.height > 0 ? hand : pendingCards;
    const regions: Array<[string, Locator]> = [['central', central], ['hand-or-pending', handRegion], ['decision', decision]];
    for (const [name, loc] of regions) {
      const box = await rect(loc);
      expect(box, `${label}: ${name} box`).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(-1);
      expect(box!.y).toBeGreaterThanOrEqual(-1);
      expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
      expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 1);
    }
  }
}

test.describe('单屏沉浸式牌桌布局', () => {
  for (const seats of [4, 5, 7, 9, 11]) {
    test(`${seats} 人布局矩阵：座位、中央区、手牌均在单屏`, async ({ page }) => {
      test.setTimeout(180_000);
      await makeRoom(page, seats, `几何${seats}`);

      // Lobby card grid is explicitly checked for the smallest and largest room.
      if (seats === 4 || seats === 11) {
        for (const viewport of VIEWPORTS) {
          await page.setViewportSize({ width: viewport.width, height: viewport.height });
          await page.waitForTimeout(80);
          await page.screenshot({
            path: `docs/06_assets/screenshots/arena-lobby-${seats}-${viewport.name}.png`,
            fullPage: false,
          });
          await assertSingleViewport(page, `lobby-${seats}-${viewport.name}`, true);
        }
      }

      await page.click('#btn-start');
      await expect(page.locator('.phase')).toBeVisible({ timeout: 15_000 });
      await dismissIdentity(page);

      for (const viewport of VIEWPORTS) {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.waitForTimeout(80);
        await page.screenshot({
          path: `docs/06_assets/screenshots/arena-${seats}-${viewport.name}.png`,
          fullPage: false,
        });
        await assertSingleViewport(page, `game-${seats}-${viewport.name}`, false);
      }
    });
  }
});
