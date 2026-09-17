import { test, expect } from '@playwright/test';
import { VISUAL_MAP } from '../../scripts/gen-assets/prompts';
import { renderCardHtml } from '../../src/ui/assets';

test('16 种卡面立绘全部成功加载且无占位色块', async ({ page }) => {
  // 生成包含全部 16 种视觉单元的卡面 HTML
  const cardKeys = Object.keys(VISUAL_MAP).filter((k) => !k.startsWith('ui-'));
  const cardsHtml = cardKeys.map((k) => renderCardHtml(k, `test-${k}`, false)).join('\n');

  await page.goto('/');
  await page.setContent(`<div class="gallery" style="display:flex;flex-wrap:wrap;gap:12px;padding:20px;">${cardsHtml}</div>`);

  // 等待图片全部加载
  const cardImgs = page.locator('.card-art');
  const count = await cardImgs.count();
  expect(count).toBe(16);

  // 验证每张卡面的 img 都有实际像素宽高（未触发 onerror 隐藏）
  for (let i = 0; i < count; i++) {
    const img = cardImgs.nth(i);
    await expect(img).toBeVisible();
    const isLoaded = await img.evaluate((el: any) => el.complete && el.naturalWidth > 0);
    expect(isLoaded).toBe(true);
  }

  // 验证 3 张 UI 素材与令牌均可成功访问
  const responseLobby = await page.request.get('http://localhost:5173/assets/ui/lobby-bg.webp');
  expect(responseLobby.status()).toBe(200);

  const responseTable = await page.request.get('http://localhost:5173/assets/ui/table-texture.webp');
  expect(responseTable.status()).toBe(200);

  const responseBtn = await page.request.get('http://localhost:5173/assets/ui/button-primary.webp');
  expect(responseBtn.status()).toBe(200);

  const responseToken = await page.request.get('http://localhost:5173/assets/tokens/honor-token.webp');
  expect(responseToken.status()).toBe(200);
});
