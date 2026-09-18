import { test, expect } from '@playwright/test';
test('互动分页图标受控，关闭后不占据牌桌布局',async({page})=>{
 await page.goto('/'); await page.fill('#nick','尺寸测试'); await page.click('#btn-create');
 for(let i=0;i<3;i++)await page.click('#btn-add-bot');
 await page.click('#btn-start'); await expect(page.locator('.phase')).toBeVisible();
 await page.locator('.identity-modal').click().catch(()=>{});
 const before=await page.locator('.seat-card.self').boundingBox();
 for(const tab of ['effects','emoji']){
   await page.click(`[data-social-tab="${tab}"]`);
   for(const box of await page.locator('.fx-bar img').evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect();return {w:r.width,h:r.height};}))){
     expect(box.w).toBeGreaterThan(0); expect(box.w).toBeLessThanOrEqual(48); expect(box.h).toBeLessThanOrEqual(48);
   }
 }
 await page.click('.social-close');
 await expect(page.locator('.social-pop')).toHaveCount(0);
 expect(await page.locator('.seat-card.self').boundingBox()).toEqual(before);
 expect(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight)).toBe(true);
});
