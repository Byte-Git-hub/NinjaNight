import { test, expect } from '@playwright/test';
test('图片表情广播记录，数量与草稿在快照更新后保留',async({page})=>{
 await page.goto('/'); await page.fill('#nick','互动测试员'); await page.click('#btn-create');
 for(let i=0;i<3;i++)await page.click('#btn-add-bot'); await page.click('#btn-start');
 await expect(page.locator('.phase')).toBeVisible(); await page.locator('.identity-modal').click().catch(()=>{});
 await page.click('[data-social-tab="emoji"]'); await page.locator('[data-emoji]').first().click();
 await page.locator('.seat-card.bot .seat-head').first().click(); await page.click('[data-reaction-count="3"]');
 await page.click('[data-social-send]'); await page.click('#chat-log-panel summary'); await page.click('[data-chat-tab="reaction"]');
 await expect(page.locator('.reaction-log')).toContainText('互动测试员');
 await page.click('[data-social-tab="chat"]'); await page.fill('#chat-input','草稿不会丢失');
 await page.locator('.seat-card.bot [data-mark]').first().click();
 await expect(page.locator('#chat-input')).toHaveValue('草稿不会丢失');
});
