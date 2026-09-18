import { test, expect, type Locator, type Page } from '@playwright/test';

async function reachDeclare(page: Page): Promise<void> {
  for (let i = 0; i < 180; i += 1) {
    const pending = page.locator('.pending');
    const text = await pending.innerText().catch(() => '');
    if (text.includes('拖动手牌')) return;
    const opt = page.locator('.pending .card.opt[data-opt]').first();
    if (await opt.isVisible().catch(() => false)) {
      await opt.click();
    } else if (await page.locator('#btn-pass').isVisible().catch(() => false)) {
      await page.locator('#btn-pass').click();
    } else {
      await page.waitForTimeout(150);
    }
    await page.waitForTimeout(120);
  }
  throw new Error('declareCards pending was not reached');
}

async function declarationCard(page: Page): Promise<Locator> {
  // Progress only through public pending windows and select a truly visible
  // playable card after each re-render; never rely on a stale locator count.
  for (let i = 0; i < 12; i += 1) {
    await reachDeclare(page);
    const candidate = page.locator('.hand .declare-opt[data-iid]:not(.dim):not([data-tip*="掘墓人"])').first();
    if (await candidate.isVisible().catch(() => false)) return candidate;
    const pass = page.locator('#btn-pass');
    if (!(await pass.isVisible().catch(() => false))) break;
    await pass.click();
    await page.waitForTimeout(180);
  }
  throw new Error('no playable declaration found in public UI windows');
}

test('拖动声明牌到玩家后由服务端 chooseTarget 自动接续', async ({ page }) => {
  await page.addInitScript(() => {
    const send = WebSocket.prototype.send;
    WebSocket.prototype.send = function (data: string | ArrayBufferLike | Blob | ArrayBufferView) {
      if (typeof data === 'string' && data.includes('night.chooseTarget')) {
        const w = window as unknown as { __ninjaChooseTargetCount?: number };
        w.__ninjaChooseTargetCount = (w.__ninjaChooseTargetCount ?? 0) + 1;
      }
      return send.call(this, data);
    };
  });
  await page.goto('/');
  await page.fill('#nick', '拖牌测试');
  await page.click('#btn-create');
  await page.click('#btn-add-bot');
  await page.click('#btn-add-bot');
  await page.click('#btn-add-bot');
  await page.click('#btn-start');
  await expect(page.locator('.phase')).toBeVisible({ timeout: 15_000 });
  await page.locator('#identity-modal .identity-modal').click().catch(() => undefined);
  const card = await declarationCard(page);
  const target = page.locator('.seat-card.bot').first();
  await expect(card).toBeVisible({ timeout: 10_000 });
  await expect(target).toBeVisible();
  const sourceRect = await card.boundingBox();
  const targetRect = await target.boundingBox();
  if (!sourceRect || !targetRect) throw new Error('drag geometry unavailable');
  await page.mouse.move(sourceRect.x + sourceRect.width / 2, sourceRect.y + sourceRect.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetRect.x + targetRect.width / 2, targetRect.y + targetRect.height / 2, { steps: 8 });
  await page.mouse.up();

  // The client submits night.declare, then resolveDragIntent submits the
  // server's chooseTarget window for the same instance/seat. No direct UI
  // target command is fabricated by the test.
  await expect.poll(async () => await page.evaluate(() => (window as unknown as { __ninjaChooseTargetCount?: number }).__ninjaChooseTargetCount ?? 0), { timeout: 15_000 }).toBeGreaterThan(0);
  await expect.poll(async () => (await page.locator('.central .played-item').count()), { timeout: 15_000 }).toBeGreaterThan(0);
  await expect(page.locator('.drag-ghost')).toHaveCount(0);
  await expect(page.locator('.drag-target')).toHaveCount(0);
});

test('ESC 取消拖牌且不产生指令', async ({ page }) => {
  await page.addInitScript(() => {
    const send = WebSocket.prototype.send;
    WebSocket.prototype.send = function (data: string | ArrayBufferLike | Blob | ArrayBufferView) {
      if (typeof data === 'string' && data.includes('night.chooseTarget')) {
        const w = window as unknown as { __ninjaChooseTargetCount?: number };
        w.__ninjaChooseTargetCount = (w.__ninjaChooseTargetCount ?? 0) + 1;
      }
      return send.call(this, data);
    };
  });
  await page.goto('/');
  await page.fill('#nick', '拖牌取消');
  await page.click('#btn-create');
  await page.click('#btn-add-bot');
  await page.click('#btn-add-bot');
  await page.click('#btn-add-bot');
  await page.click('#btn-start');
  await expect(page.locator('.phase')).toBeVisible({ timeout: 15_000 });
  await page.locator('#identity-modal .identity-modal').click().catch(() => undefined);
  const card = await declarationCard(page);
  const target = page.locator('.seat-card.bot').first();
  const beforeCommands = await page.evaluate(() => (window as unknown as { __ninjaChooseTargetCount?: number }).__ninjaChooseTargetCount ?? 0);
  const from = await card.boundingBox();
  const to = await target.boundingBox();
  if (!from || !to) throw new Error('drag geometry unavailable');

  // Browser-level pointercancel must clean the gesture without submitting.
  const pointerIdPromise = page.evaluate(() => new Promise<number>((resolve) => {
    document.addEventListener('pointerdown', (event) => resolve(event.pointerId), { once: true });
  }));
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  const pointerId = await pointerIdPromise;
  await page.mouse.move(to.x + 12, to.y + 12, { steps: 3 });
  await page.evaluate((id) => document.dispatchEvent(new PointerEvent('pointercancel', { pointerId: id, bubbles: true })), pointerId);
  await page.mouse.up();
  await expect(page.locator('.drag-ghost')).toHaveCount(0);
  await expect(page.locator('.drag-target')).toHaveCount(0);

  // ESC follows the same cancellation path and must leave the next click free.
  const secondFrom = await card.boundingBox();
  if (!secondFrom) throw new Error('card disappeared after pointercancel');
  await page.mouse.move(secondFrom.x + secondFrom.width / 2, secondFrom.y + secondFrom.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + 12, to.y + 12, { steps: 3 });
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(page.locator('.drag-ghost')).toHaveCount(0);
  await expect(page.locator('.drag-target')).toHaveCount(0);
  await expect(page.locator('.pending')).toContainText('拖动手牌');
  expect(await page.evaluate(() => (window as unknown as { __ninjaChooseTargetCount?: number }).__ninjaChooseTargetCount ?? 0)).toBe(beforeCommands);
});
