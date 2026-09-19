import { test, expect } from '@playwright/test';

test.describe('房主 LLM 配置', () => {
  test('创建大厅显示 LLM 配置入口且 key 输入为密码框', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#llm-api-key')).toHaveAttribute('type', 'password');
  });

  test('房主大厅显示社交专家面板', async ({ page }) => {
    await page.goto('/');
    await page.locator('#nick').fill('Host');
    await page.locator('#btn-create').click();
    await expect(page.getByText('社交专家 / LLM')).toBeVisible();
  });

  test('快照重绘不折叠面板或清空未提交草稿', async ({ page }) => {
    await page.goto('/');
    await page.locator('#nick').fill('HostDraft');
    await page.locator('#btn-create').click();
    const panel = page.locator('details.llm-adv');
    await panel.locator('summary').click();
    await page.locator('#llm-room-key').fill('sk-e2e-draft');
    await page.locator('#btn-ready').click();
    await expect(panel).toHaveAttribute('open', '');
    await expect(page.locator('#llm-room-key')).toHaveValue('sk-e2e-draft');
  });

  test('空白保存给出提示，不会把已保存 key 当成撤回', async ({ page }) => {
    await page.goto('/');
    await page.locator('#nick').fill('HostClear');
    await page.locator('#llm-api-key').fill('sk-e2e-room');
    await page.locator('#btn-create').click();
    const panel = page.locator('details.llm-adv');
    await panel.locator('summary').click();
    await page.locator('#llm-room-key').fill('');
    await page.locator('#btn-llm-save').click();
    await expect(page.locator('#toast')).toContainText('请输入新的 key');
    await expect(panel).toContainText('已保存房主 key');
  });

  test('聊天发送后保留完整记录', async ({ page }) => {
    await page.goto('/');
    await page.locator('#nick').fill('HostChat');
    await page.locator('#btn-create').click();
    for (let i = 0; i < 3; i += 1) {
      await page.locator('#btn-add-bot').click();
    }
    await page.locator('#btn-start').click();
    await expect(page.locator('.phase')).toBeVisible({ timeout: 15_000 });
    await page.locator('[data-social-tab="chat"]').click();
    await page.locator('#chat-input').fill('试玩聊天气泡');
    await page.locator('#btn-chat').click();
    await expect(page.locator('#chat-log')).toContainText('试玩聊天气泡');
  });
});
