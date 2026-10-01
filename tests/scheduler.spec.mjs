import { test, expect } from '@playwright/test';
const people = ['본캐', '부캐'].map((name, i) => ({ ocid: `character${i}`, character_name: name, world_name: '스카니아', character_level: 280 - i, character_class: '비숍' }));
async function mock(page, failing = false) {
  await page.route('https://open.api.nexon.com/**', async route => {
    const url = new URL(route.request().url());
    expect(route.request().headers()['x-nxopen-api-key']).toBe('test-only-key');
    expect(url.search).not.toContain('test-only-key');
    if (url.pathname.endsWith('/character/list')) return route.fulfill({ json: { account_list: [{ character_list: people }] } });
    if (failing && url.searchParams.get('ocid') === 'character1') return route.fulfill({ status: 403, json: {} });
    return route.fulfill({ json: { daily_contents: [{ content_name: '일일 퀘스트', type: 'quest', quest_state: url.searchParams.get('ocid') === 'character0' ? '2' : '1', registration_flag: 'true' }], weekly_contents: [], boss_contents: [{ content_name: '스우', difficulty: '하드', cycle: '주간', registration_flag: 'true', complete_flag: 'false' }] } });
  });
}
async function connect(page) {
  await page.goto('/scheduler.html'); await page.locator('#api-key').fill('test-only-key'); await page.locator('#connect').click();
  await expect(page.locator('#characters input')).toHaveCount(2);
  await page.locator('#select-world').click(); await page.locator('#refresh').click();
  await expect(page.locator('#refresh')).toBeEnabled();
}
test('multi-character matrix, filters, date, privacy, mobile and navigation', async ({ page }) => {
  await mock(page); await connect(page);
  await expect(page.locator('#schedule-table')).toContainText('완료 1 / 2');
  await expect(page.locator('#schedule-table .done')).toHaveCount(1);
  await page.locator('[data-category="boss"]').click(); await expect(page.locator('#schedule-table tbody tr')).toHaveCount(1);
  await page.locator('[data-category="daily"]').click(); await expect(page.locator('#schedule-table')).toContainText('진행 중');
  expect(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))).not.toContain('test-only-key');
  await expect(page.locator('#api-key')).toHaveValue('');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.locator('#disconnect').click(); await expect(page.locator('#schedule-panel')).toBeHidden();
  await page.goto('/'); await expect(page.getByRole('link', { name: '캐릭터 스케줄러', exact: true })).toHaveAttribute('href', './scheduler.html');
  await page.goto('/gold-cube.html'); await expect(page.getByRole('link', { name: '캐릭터 스케줄러', exact: true })).toBeVisible();
});
test('failed character never appears as incomplete and can retry', async ({ page }) => {
  await mock(page, true); await connect(page);
  await expect(page.locator('#snapshot')).toContainText('1명 실패');
  await expect(page.locator('#schedule-table')).toContainText('API 키와 본인 계정');
  await expect(page.locator('#schedule-table td.failed')).toHaveCount(2);
  await page.unrouteAll(); await mock(page); await page.locator('#refresh').click();
  await expect(page.locator('#snapshot')).toContainText('2명 성공');
  await expect(page.locator('#schedule-table td.failed')).toHaveCount(0);
});
