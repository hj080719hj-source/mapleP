import test from 'node:test';
import assert from 'node:assert/strict';
import { referenceDamage, referenceStat, projectReference, compareObserved, REFERENCE_MAX } from '../public/js/reference-model.js';

test('historical reference conversions retain golden values', () => {
  assert.equal(referenceStat(2300072790.8012433), 82823);
  assert.equal(referenceStat(2023361336.2765298), 78333);
});
test('curve is monotonic and invertible throughout its domain', () => {
  let previous = -1;
  for (let value = 0; value <= REFERENCE_MAX; value += 137) {
    const damage = referenceDamage(value);
    assert.ok(damage > previous);
    assert.equal(referenceStat(damage), value);
    previous = damage;
  }
  assert.equal(referenceStat(referenceDamage(REFERENCE_MAX)), REFERENCE_MAX);
});
test('anchor predicts nonlinear changes, not a constant multiple of score', () => {
  const unchanged = projectReference({ reference: 93821, baselineScore: 50000, minScore: 50000, confirmed: true });
  assert.equal(unchanged.min, 93821);
  const changed = projectReference({ reference: 93821, baselineScore: 50000, minScore: 55000, maxScore: 60000, confirmed: true });
  assert.ok(changed.min > unchanged.min && changed.max > changed.min);
  assert.ok(changed.min < 93821 * 1.1);
  const observed = compareObserved(changed, changed.min + 100);
  assert.equal(observed.minDelta, -100);
  assert.ok(observed.minPercent < 0);
});
test('missing confirmation, invalid baselines and extrapolation fail closed', () => {
  const valid = { reference: 90000, baselineScore: 50000, minScore: 55000, confirmed: true };
  for (const patch of [{ confirmed: false }, { baselineScore: 0 }, { reference: '' }, { minScore: -1 }, { maxScore: 1 }, { reference: Infinity }, { minScore: 1e20 }]) {
    assert.equal(projectReference({ ...valid, ...patch }).ok, false);
  }
  assert.throws(() => referenceDamage(-1), RangeError);
  assert.throws(() => referenceStat(Infinity), RangeError);
  assert.equal(compareObserved({ ok: true }, ''), null);
});
