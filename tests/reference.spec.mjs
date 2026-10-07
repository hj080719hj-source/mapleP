import { test, expect } from '@playwright/test';

async function prepare(page) {
  await page.goto('/combat.html');
  for (const [id, value] of Object.entries({ 'min-attack': 100000000, 'max-attack': 100000000, 'damage-stat': 100, 'boss-stat': 300, 'crit-rate': 100, 'crit-damage': 65, 'ignore-defense': 95 })) await page.locator(`#${id}`).fill(String(value));
  await page.locator('#reference-value').fill('90000');
  await page.locator('#reference-confirm').check();
  await page.locator('#reference-capture').click();
}
test('reference follows edits, clears stale validation and requires explicit recapture', async ({ page }) => {
  await prepare(page);
  await expect(page.locator('#reference-prediction')).toHaveText('90,000');
  await page.locator('#boss-stat').fill('350');
  const predicted = Number((await page.locator('#reference-prediction').innerText()).replaceAll(',', ''));
  expect(predicted).toBeGreaterThan(90000);
  expect(predicted).toBeLessThan(99000);
  await page.locator('#reference-observed').fill(String(predicted + 100));
  await expect(page.locator('#reference-validation')).toContainText('-100');
  await page.locator('#boss-stat').fill('360');
  await expect(page.locator('#reference-observed')).toHaveValue('');
  await expect(page.locator('#reference-validation')).toBeEmpty();
  await page.locator('#reference-value').fill('91000');
  await expect(page.locator('#reference-prediction')).toHaveCount(0);
  await expect(page.locator('#reference-confirm')).not.toBeChecked();
  await page.locator('#reference-capture').click();
  await expect(page.locator('#reference-output')).toContainText('확인해주세요');
});
test('no reference is prefilled and changing mode clears calibration', async ({ page }) => {
  await page.goto('/combat.html');
  await expect(page.locator('#reference-value')).toHaveValue('');
  await prepare(page);
  await page.locator('#reference-source').selectOption('precision');
  await expect(page.locator('#reference-prediction')).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('upgrade plans freeze settings, rank costs, filter budget and clear with anchor', async ({ page }) => {
  await prepare(page);
  await page.locator('#upgrade-target').fill('93000');
  await expect(page.locator('#upgrade-gap')).toContainText('목표 미달');
  await page.locator('#boss-stat').fill('350');
  await expect(page.locator('#upgrade-gap')).toContainText('범위 전체가 목표 충족');
  async function save(name, cost, method) {
    await page.locator('#upgrade-name').fill(name);
    await page.locator('#upgrade-cost').fill(cost);
    await page.locator('#upgrade-method').selectOption(method);
    await page.locator('#upgrade-save').click();
  }
  await save('구매 세팅', '100', 'buy');
  await save('강화 세팅', '80', 'craft');
  await expect(page.locator('.upgrade-plan').first()).toContainText('강화 세팅');
  await page.locator('#boss-stat').fill('300');
  await expect(page.locator('.upgrade-plan').first()).toContainText('93,464');
  await page.locator('.upgrade-plan').first().locator('summary').click();
  await expect(page.locator('.upgrade-plan').first()).toContainText('300 → 350');
  await page.locator('#upgrade-budget').fill('90');
  await expect(page.locator('[data-plan-id="1"]')).toContainText('예산 초과');
  await page.locator('#upgrade-budget').fill('70');
  await expect(page.locator('#upgrade-ranking')).toContainText('모두 충족하는 후보가 없습니다');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.locator('[data-remove-plan="1"]').click();
  await expect(page.locator('.upgrade-plan')).toHaveCount(1);
  await page.locator('#reference-clear').click();
  await expect(page.locator('.upgrade-plan')).toHaveCount(0);
  await expect(page.locator('#upgrade-save')).toBeDisabled();
});
