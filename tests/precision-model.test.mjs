import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateScore } from '../public/js/combat-model.js';
import { calculatePrecision } from '../public/js/precision-model.js';

const stats = { minAttack: 1e6, maxAttack: 1e6, damage: 100, bossDamage: 300, critRate: 100, critDamage: 100, ignoreDefense: 96 };
const row = (patch = {}) => ({ id: 'attack', name: '공격', share: 100, confirmed: true, extraDamage: 0, extraBoss: 0, extraIED: 0, extraCritRate: 0, extraCritDamage: 0, ...patch });
const input = (patch = {}) => ({ before: { ...stats }, after: { ...stats }, rows: [row()], measurement: { totalDamage: 120e12, seconds: 120 }, sourceDefense: 380, targetDefense: 380, conditionsConfirmed: true, ...patch });
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) <= 1e-11 * Math.max(1, Math.abs(expected)), `${actual} != ${expected}`);

test('unchanged complete inputs preserve measured DPS and fixed-380 own score', () => {
  const result = calculatePrecision(input());
  assert.equal(result.ok, true);
  close(result.multiplier, 1);
  close(result.projectedDps, 1e12);
  close(result.projectedDamage, 120e12);
  close(result.sourceScore, calculateScore(stats).score);
  close(result.targetScore, result.sourceScore);
  close(result.rows[0].projectedShare, 100);
});

test('the engine does not mutate input or frozen rows', () => {
  const original = input({ rows: [row({ share: 25 }), row({ id: 'second', name: '다른 공격', share: 75, extraIED: 20 })] });
  const expected = structuredClone(original);
  Object.values(original).forEach(value => { if (value && typeof value === 'object') Object.freeze(value); });
  original.rows.forEach(Object.freeze);
  assert.equal(calculatePrecision(original).ok, true);
  assert.deepEqual(original, expected);
});

test('zero critical chance ignores critical damage while skill critical chance caps at 100', () => {
  const before = { ...stats, critRate: 0 };
  const after = { ...before, critDamage: 250 };
  close(calculatePrecision(input({ before, after })).multiplier, 1);
  const addCrit = [row({ extraCritRate: 100 })];
  close(calculatePrecision(input({ before, after, rows: addCrit })).multiplier, 3.85 / 2.35);
  close(calculatePrecision(input({ before, after, rows: [row({ extraCritRate: 300 })] })).multiplier, 3.85 / 2.35);
});

test('additional defense ignore is multiplicative, not added to stat defense ignore', () => {
  const before = { ...stats, ignoreDefense: 90 };
  const after = { ...stats, ignoreDefense: 95 };
  const result = calculatePrecision(input({ before, after, rows: [row({ extraIED: 50 })] }));
  assert.equal(result.ok, true);
  close(result.multiplier, 0.905 / 0.81);
  assert.notEqual(result.multiplier, 1);
});

test('skill damage and boss damage are additive and stat-window damage is removed once', () => {
  const before = { ...stats, damage: 50, bossDamage: 300 };
  const after = { ...before, damage: 70, minAttack: 1e6 * 1.7 / 1.5, maxAttack: 1e6 * 1.7 / 1.5 };
  const result = calculatePrecision(input({ before, after, rows: [row({ extraDamage: 60, extraBoss: 40 })] }));
  close(result.multiplier, 5.7 / 5.5);
});

test('all-zero skill effects agree with the existing stat score ratio', () => {
  const after = { ...stats, minAttack: 1.2e6, maxAttack: 1.5e6, bossDamage: 360, ignoreDefense: 98 };
  const result = calculatePrecision(input({ after, rows: [row({ share: 30 }), row({ id: 'b', name: 'B', share: 70 })] }));
  close(result.multiplier, calculateScore(after).score / calculateScore(stats).score);
  close(result.targetScore, calculateScore(after).score);
});

test('already-buffed damage shares reconstruct a harmonic, not arithmetic, effect', () => {
  const before = { minAttack: 1e6, maxAttack: 1e6, damage: 0, bossDamage: 0, critRate: 0, critDamage: 0, ignoreDefense: 100 };
  const result = calculatePrecision(input({ before, after: before, rows: [
    row({ id: 'a', name: 'A', share: 100 / 3 }),
    row({ id: 'b', name: 'B', share: 200 / 3, extraBoss: 100 }),
  ] }));
  assert.equal(result.ok, true);
  close(result.rows[0].baseWeight, 0.5);
  close(result.rows[1].baseWeight, 0.5);
  close(result.sourceScore, 150);
  assert.ok(Math.abs(result.sourceScore - 100 * (1 / 3 + 2 * 2 / 3)) > 10);
});

test('measured target defense and fixed-380 own-score comparisons stay distinct', () => {
  const result = calculatePrecision(input({ sourceDefense: 300, targetDefense: 0 }));
  assert.equal(result.ok, true);
  close(result.multiplier, 1 / 0.88);
  close(result.projectedDps, 1e12 / 0.88);
  close(result.sourceScore, calculateScore(stats).score);
  close(result.targetScore, result.sourceScore);
  assert.equal(result.scoreDefense, 380);
});

test('skill-specific defense can produce measured damage when the simple score is zero', () => {
  const before = { ...stats, ignoreDefense: 0 };
  const result = calculatePrecision(input({ before, after: before, rows: [row({ extraIED: 100 })] }));
  assert.equal(calculateScore(before).score, 0);
  assert.equal(result.ok, true);
  assert.ok(result.sourceScore > 0);
  close(result.multiplier, 1);
});

test('zero target penetration produces zero projected damage without invalid shares', () => {
  const result = calculatePrecision(input({ after: { ...stats, ignoreDefense: 0 } }));
  assert.equal(result.ok, true);
  assert.equal(result.multiplier, 0);
  assert.equal(result.projectedDps, 0);
  assert.equal(result.projectedDamage, 0);
  assert.equal(result.rows[0].projectedShare, 0);
});

test('new damage shares compose stat changes consistently', () => {
  const a = { ...stats, ignoreDefense: 90 };
  const b = { ...stats, bossDamage: 360 };
  const c = { ...stats, minAttack: 1.3e6, maxAttack: 1.3e6, critRate: 60 };
  const rows = [row({ share: 40 }), row({ id: 'second', name: '다른 공격', share: 60, extraIED: 40, extraCritRate: 40, extraBoss: 100 })];
  const ab = calculatePrecision(input({ before: a, after: b, rows }));
  const bc = calculatePrecision(input({ before: b, after: c, rows: rows.map((r, i) => ({ ...r, share: ab.rows[i].projectedShare })) }));
  const ac = calculatePrecision(input({ before: a, after: c, rows }));
  assert.equal(bc.ok, true);
  close(ab.multiplier * bc.multiplier, ac.multiplier);
  close(ab.targetScore, bc.sourceScore);
  close(ac.targetScore, bc.targetScore);
});

test('scaling stat attack alone scales every skill and preserves their shares', () => {
  const rows = [row({ share: 20 }), row({ id: 'b', name: 'B', share: 80, extraIED: 30, extraCritDamage: 50, extraBoss: 100 })];
  const result = calculatePrecision(input({ after: { ...stats, minAttack: stats.minAttack * 2, maxAttack: stats.maxAttack * 2 }, rows }));
  assert.equal(result.ok, true);
  close(result.multiplier, 2);
  close(result.targetScore, result.sourceScore * 2);
  result.rows.forEach((r, i) => close(r.projectedShare, rows[i].share));
});

test('unconfirmed conditions, unknown effects and incomplete shares block the full result', () => {
  for (const patch of [
    { conditionsConfirmed: false }, { conditionsConfirmed: 'true' }, { sourceDefense: '' },
    { rows: [] }, { rows: [row({ share: 99.99 })] }, { rows: [row({ share: 100.01 })] },
    { rows: [row({ confirmed: false })] }, { rows: [row({ extraBoss: '' })] },
    { rows: [row({ extraBoss: undefined })] }, { rows: [row({ extraIED: 101 })] },
    { rows: [row({ extraCritDamage: -1 })] }, { rows: [row({ extraCritRate: NaN })] },
    { rows: [row({ share: 50 }), row({ share: 50 })] },
  ]) assert.equal(calculatePrecision(input(patch)).ok, false, JSON.stringify(patch));
  assert.equal(calculatePrecision().ok, false);
});

test('unused zero-share rows may remain unknown without inventing residual damage', () => {
  const result = calculatePrecision(input({ rows: [row(), { id: 'unused', name: '미사용', share: 0, confirmed: false }] }));
  assert.equal(result.ok, true);
  assert.equal(result.rows.length, 1);
  assert.equal(calculatePrecision(input({ rows: [row({ share: 99 }), { share: 0 }] })).ok, false);
});

test('zero baselines and invalid finite ranges are rejected explicitly', () => {
  for (const patch of [
    { before: { ...stats, minAttack: 0, maxAttack: 0 } },
    { before: { ...stats, ignoreDefense: 0 } },
    { after: { ...stats, maxAttack: null } },
    { sourceDefense: -1 }, { targetDefense: 1001 },
    { measurement: { totalDamage: 0, seconds: 1 } },
    { measurement: { totalDamage: 1, seconds: '' } },
    { measurement: { totalDamage: 1e308, seconds: 1e-308 } },
    { after: { ...stats, maxAttack: 1e308 } },
    { rows: [row({ extraBoss: 1e308 })] },
  ]) assert.equal(calculatePrecision(input(patch)).ok, false, JSON.stringify(patch));
});

test('explicit numeric strings are accepted, but null and booleans are not numbers', () => {
  const result = calculatePrecision(input({ sourceDefense: '380', rows: [row({ share: '100', extraBoss: '0' })] }));
  assert.equal(result.ok, true);
  for (const value of [null, false, true, '', ' ', Infinity]) {
    assert.equal(calculatePrecision(input({ sourceDefense: value })).ok, false);
  }
});

test('a positive skill contribution cannot silently underflow to zero', () => {
  const before = { ...stats, minAttack: 1e200, maxAttack: 1e200, ignoreDefense: 0 };
  const after = { ...before, minAttack: 1e-100, maxAttack: 1e-100 };
  const result = calculatePrecision(input({ before, after, sourceDefense: 0, rows: [
    row({ share: 1e-30, extraIED: 100 }), row({ id: 'blocked', name: '관통 불가', share: 100 }),
  ] }));
  assert.equal(result.ok, false);
});
