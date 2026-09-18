import { test, expect } from '@playwright/test';
test.use({viewport:{width:390,height:844}});
test('移动端手牌和决策在视口内，情报抽屉点击开关后恢复',async({page})=>{
 await page.goto('/'); await page.fill('#nick','移动端'); await page.click('#btn-create');
 for(let i=0;i<3;i++)await page.click('#btn-add-bot'); await page.click('#btn-start');
 await expect(page.locator('.phase')).toBeVisible();await page.locator('.identity-modal').click().catch(()=>{});
 const decision=page.locator('#decision-zone');
 const before=await decision.boundingBox();expect(before!.y+before!.height).toBeLessThan(844);
 await page.click('[data-info-toggle]');await expect(page.locator('.known')).toBeVisible();
 await expect(page.locator('#btn-end')).toBeVisible();await page.click('[data-info-toggle]');
 await expect(page.locator('.known')).toBeHidden();
 await expect.poll(() => decision.boundingBox()).toEqual(before);
 await page.mouse.wheel(0,500);
 expect(await page.evaluate(()=>scrollY)).toBe(0);
 await page.locator('.pending .card.opt').first().click();
 await expect(page.locator('.phase')).toBeVisible();
});
