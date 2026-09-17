import { test, expect } from '@playwright/test';

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

const overlap = (a: Box, b: Box) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

test.describe('移动端手牌遮挡修复（390x844）', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('手牌区不遮挡已知身份区与底部按钮', async ({ page }) => {
    await page.goto('/');

    // 创建房间 + 3 Bot，开局
    await page.fill('#nick', '移动端遮挡测试');
    await page.click('#btn-create');
    await expect(page.locator('.room')).toContainText('房间');
    await page.click('#btn-add-bot');
    await page.click('#btn-add-bot');
    await page.click('#btn-add-bot');
    await expect(page.locator('.seats li')).toHaveCount(4);
    await page.click('#btn-start');
    await expect(page.locator('.phase')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('.hand')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('.in-game-table .known')).toBeVisible();
    // 关掉开局身份弹窗（2.5s 自闭，点击立即关闭），避免遮挡测量与截图
    await page.locator('.identity-modal').click({ timeout: 5_000 }).catch(() => {});
    await expect(page.locator('.identity-modal')).toHaveCount(0, { timeout: 5_000 }).catch(() => {});
    await page.waitForTimeout(800);

    const boxes = async () => {
      const hand = await page.locator('.hand').first().boundingBox();
      const known = await page.locator('.in-game-table .known').boundingBox();
      const endBtn = await page.locator('.in-game-table #btn-end').boundingBox();
      const bottomBar = await page.locator('.bottom-bar').boundingBox();
      return { hand, known, endBtn, bottomBar };
    };

    // 滚到底部：fixed 手牌若回退，会把已知身份区/终止按钮盖进同一视口带
    await page.keyboard.press('End');
    await page.waitForTimeout(400);
    await page.screenshot({ path: 'D:/Datum/TEMPDIR/opencode/mobile-hand-390.png' });

    const r = await boxes();
    console.log('RECTS ' + JSON.stringify(r));
    expect(r.hand).toBeTruthy();
    expect(r.known).toBeTruthy();
    expect(r.endBtn).toBeTruthy();
    expect(r.bottomBar).toBeTruthy();
    // 手牌区不得与已知身份区重叠
    expect(overlap(r.hand!, r.known!), `手牌遮挡已知身份: ${JSON.stringify(r)}`).toBe(false);
    // 手牌区不得与终止本局按钮重叠
    expect(overlap(r.hand!, r.endBtn!), `手牌遮挡终止按钮: ${JSON.stringify(r)}`).toBe(false);
    // 决策条不得滑过已知身份区 / 终止按钮（防 sticky 吸底回退）
    expect(overlap(r.bottomBar!, r.known!), `决策条覆盖已知身份: ${JSON.stringify(r)}`).toBe(false);
    expect(overlap(r.bottomBar!, r.endBtn!), `决策条覆盖终止按钮: ${JSON.stringify(r)}`).toBe(false);

    // 对局全程：回顶部再下滚 300px（小于最大滚动 651px，真中段）采一次，均无重叠
    await page.keyboard.press('Home');
    await page.waitForTimeout(300);
    await page.mouse.wheel(0, 300);
    await page.waitForTimeout(300);
    const mid = await boxes();
    console.log('RECTS-MID ' + JSON.stringify(mid));
    expect(overlap(mid.hand!, mid.known!), `中段手牌仍重叠: ${JSON.stringify(mid)}`).toBe(false);
    expect(overlap(mid.hand!, mid.endBtn!), `中段手牌遮挡按钮: ${JSON.stringify(mid)}`).toBe(false);
    expect(overlap(mid.bottomBar!, mid.known!), `中段决策条仍重叠: ${JSON.stringify(mid)}`).toBe(false);
  });
});
