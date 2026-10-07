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
