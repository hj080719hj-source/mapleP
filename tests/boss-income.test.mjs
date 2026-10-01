import test from 'node:test';
import assert from 'node:assert/strict';
import { crystalPrice, incomeFor } from '../public/js/boss-income.js';
const boss = (name = '스우', difficulty = '하드', extra = {}) => ({ content_name: name, difficulty, cycle: '주간', complete_flag: 'true', registration_flag: 'false', ...extra });
const entry = (ocid, bosses) => ({ character: { ocid }, data: { boss_contents: bosses } });
test('official September price changes, aliases and deferred October Black Mage price', () => {
  assert.equal(crystalPrice('스우', '노말', '2026-10-01'), 8350000);
  assert.equal(crystalPrice('스우', '하드', '2026-10-01'), 48900000);
  assert.equal(crystalPrice('세렌', 'hard', '2026-10-01'), 302000000);
  assert.equal(crystalPrice('검은마법사', '하드', '2026-09-30'), 665000000);
  assert.equal(crystalPrice('검은 마법사', '하드', '2026-10-01'), 465000000);
  assert.equal(crystalPrice('새 보스', '하드', '2026-10-01'), null);
});
test('completed-only income deduplicates exact records and separates all cycles', () => {
  const input = [entry('a', [boss(), boss(), boss('윌', '하드', { complete_flag: 'false' }), boss('아카이럼', '노멀', { cycle: '일간' }), boss('검은 마법사', '하드', { cycle: '월간' })])];
  const result = incomeFor(input, '2026-10-01');
  assert.equal(result.characters[0].rows.length, 3);
  assert.deepEqual(result.totals, { daily: 1110000, weekly: 48900000, monthly: 465000000, other: 0 });
  assert.deepEqual(incomeFor(input, '2026-10-01').totals, result.totals);
});
test('party and manual price apply per character; missing and failed data remain explicit', () => {
  const input = [entry('a', [boss(), boss('새 보스')]), entry('b', [boss()]), { character: { ocid: 'c' }, error: 'failed' }];
  const first = incomeFor(input, '2026-10-01');
  const override = new Map([[first.characters[0].rows[0].id, { party: 6 }]]);
  const result = incomeFor(input, '2026-10-01', override);
  assert.equal(result.totals.weekly, 8150000 + 48900000);
  assert.equal(result.missing, 1); assert.equal(result.failed, 1);
  const unknownId = first.characters[0].rows[1].id;
  override.set(unknownId, { price: '100', party: '3' });
  assert.equal(incomeFor(input, '2026-10-01', override).totals.weekly, result.totals.weekly + 33);
  override.set(unknownId, { price: '', party: 1 });
  assert.equal(incomeFor(input, '2026-10-01', override).missing, 1);
  override.set(unknownId, { price: '0', party: 1 });
  assert.equal(incomeFor(input, '2026-10-01', override).missing, 0);
  override.set(unknownId, { price: 100, party: 0 });
  assert.equal(incomeFor(input, '2026-10-01', override).missing, 1);
  override.set(unknownId, { included: false });
  assert.equal(incomeFor(input, '2026-10-01', override).missing, 0);
});
test('no obsolete 12-crystal cap and no inferred missing completion', () => {
  const bosses = Array.from({ length: 13 }, (_, i) => boss(`보스${i}`));
  const input = [entry('a', [...bosses, boss('미확인', '하드', { complete_flag: null })])];
  const first = incomeFor(input, '2026-10-01');
  const overrides = new Map(first.characters[0].rows.map(row => [row.id, { price: 100, party: 1 }]));
  assert.equal(incomeFor(input, '2026-10-01', overrides).totals.weekly, 1300);
});
