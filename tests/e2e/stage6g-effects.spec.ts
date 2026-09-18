import { test, expect, type Page } from '@playwright/test';

async function started(page: Page) {
  await page.goto('/'); await page.fill('#nick', '特效测试员'); await page.click('#btn-create');
  for (let i=0;i<3;i++) await page.click('#btn-add-bot');
  await page.click('#btn-start'); await expect(page.locator('.phase')).toBeVisible();
  await page.locator('.identity-modal').click().catch(() => {});
}

test('九种物品与十二种表情独立分页；广播触发飞行和目标震动', async ({page}) => {
  await started(page);
  await page.click('[data-social-tab="effects"]');
  const ids = await page.locator('[data-fx]').evaluateAll(es => es.map(e => e.getAttribute('data-fx')));
  await page.click('[data-page="social"][data-delta="1"]');
  ids.push(...await page.locator('[data-fx]').evaluateAll(es => es.map(e => e.getAttribute('data-fx'))));
  expect(new Set(ids).size).toBe(9);
  await expect(page.locator('[data-emoji], [data-phrase]')).toHaveCount(0);
  await page.click('[data-page="social"][data-delta="-1"]');
  await page.click('[data-fx="egg"]');
  const bot = page.locator('.seat-card.bot').first();
  await bot.locator('.seat-head').click();
  await page.click('[data-reaction-count="1000"]');
  await page.click('[data-social-send]');
  await expect.poll(() => page.locator('.item-flight-layer').getAttribute('data-active-flights')).not.toBe('0');
  await expect(bot).toHaveClass(/fx-hit/);
  await expect(page.locator('.effect-projectile')).toHaveCount(0);
  await page.click('[data-social-tab="emoji"]');
  await expect(page.locator('[data-phrase], [data-fx]')).toHaveCount(0);
  const emoji = await page.locator('[data-emoji]').evaluateAll(es => es.map(e => e.getAttribute('data-emoji')));
  await page.click('[data-page="social"][data-delta="1"]');
  emoji.push(...await page.locator('[data-emoji]').evaluateAll(es => es.map(e => e.getAttribute('data-emoji'))));
  expect(new Set(emoji).size).toBe(12);
  await page.locator('[data-emoji]').first().click();
  await page.click('[data-social-send]');
  await expect.poll(() => page.locator('.item-flight-layer').getAttribute('data-active-emoji')).not.toBe('0');
  await expect(page.locator('.reaction-projectile')).toHaveCount(0);
  await bot.locator('[data-mark]').click();
  await expect(bot.locator('.mark-badge')).toContainText('👁×1');
  await bot.locator('[data-mark]').click();
  await expect(bot.locator('.mark-badge')).toHaveCount(0);
  await expect(page.locator('.banner.err')).toHaveCount(0);
});
