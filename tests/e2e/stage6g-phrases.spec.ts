import { test, expect } from '@playwright/test';
test('十五条快捷短语分页，仅在发送者座位上方显示气泡', async ({page}) => {
  await page.goto('/'); await page.fill('#nick','短语测试员'); await page.click('#btn-create');
  for(let i=0;i<3;i++) await page.click('#btn-add-bot');
  await page.click('#btn-start'); await expect(page.locator('.phase')).toBeVisible();
  await page.locator('.identity-modal').click().catch(()=>{});
  await page.click('[data-social-tab="phrases"]');
  const ids: string[]=[];
  for(let i=0;i<3;i++) {
    ids.push(...await page.locator('[data-phrase]').evaluateAll(es=>es.map(e=>e.getAttribute('data-phrase')!)));
    if(i<2) await page.click('[data-page="social"][data-delta="1"]');
  }
  expect(new Set(ids).size).toBe(15);
  await page.click('[data-page="social"][data-delta="-1"]'); await page.click('[data-page="social"][data-delta="-1"]');
  await page.click('[data-phrase="0"]');
  const bubble=page.locator('.phrase-bubble');
  await expect(bubble).toContainText('短语测试员：快点啊，鸡都要叫了');
  await expect(page.locator('#toast')).toBeHidden();
  const b=await bubble.boundingBox(), seat=await page.locator('.seat-card.self').boundingBox();
  expect(b!.y+b!.height).toBeLessThanOrEqual(seat!.y+4);
  await expect(bubble).toHaveCount(0,{timeout:5000});
});
