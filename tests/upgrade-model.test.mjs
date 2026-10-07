import test from 'node:test';
import assert from 'node:assert/strict';
import { projectReference, referenceDamage } from '../public/js/reference-model.js';
import { targetGap, rankUpgradePlans } from '../public/js/upgrade-model.js';
const result = (low, high = low) => projectReference({ reference: 90000, baselineScore: 100, minScore: 100 * low, maxScore: 100 * high, confirmed: true });
test('target uses nonlinear damage growth and distinguishes ranges', () => {
  const required = referenceDamage(100000) / referenceDamage(90000);
  const gap = targetGap(100000, result(1));
  assert.equal(gap.requiredFromBaseline, (required - 1) * 100);
  assert.equal(gap.additionalMin, gap.requiredFromBaseline);
  assert.equal(targetGap(100000, result(required * .99, required * 1.01)).status, 'uncertain');
  assert.equal(targetGap(100000, result(required * 1.01)).status, 'reached');
  assert.equal(targetGap(100000, result(0)).additionalMax, null);
  assert.equal(targetGap('', result(1)).ok, false);
  assert.equal(targetGap(150000, result(1)).ok, false);
});
test('rounded visible stat cannot falsely satisfy target', () => {
  const low = referenceDamage(99999.8) / referenceDamage(90000);
  const predicted = result(low);
  assert.equal(predicted.min, 100000);
  assert.equal(targetGap(100000, predicted).status, 'short');
});
test('ranking compares whole plans, preserves zero costs, and enforces budget', () => {
  const plans = [
    { id: 1, cost: 100, result: result(1.6) },
    { id: 2, cost: 80, result: result(1.6) },
    { id: 3, cost: 0, result: result(1) },
    { id: 4, cost: 10, result: result(1, 2) },
  ];
  const ranked = rankUpgradePlans(plans, 100000, 90);
  assert.deepEqual(ranked.recommended.map(p => p.id), [2]);
  assert.deepEqual(ranked.alternatives.map(p => p.id), [3, 4, 1]);
  assert.equal(rankUpgradePlans(plans, 90000, 0).recommended[0].id, 3);
  assert.equal(rankUpgradePlans(plans, 100000, -1).ok, false);
  assert.equal(rankUpgradePlans([{ id: 1, cost: '', result: result(2) }], 100000).ok, false);
});
test('more than five valid candidates remain accessible', () => {
  const plans = Array.from({ length: 8 }, (_, i) => ({ id: i, cost: 100-i, result: result(2) }));
  const ranked = rankUpgradePlans(plans, 100000);
  assert.equal(ranked.recommended.length, 5);
  assert.equal(ranked.alternatives.length, 3);
  assert.equal(ranked.recommended[0].id, 7);
});
