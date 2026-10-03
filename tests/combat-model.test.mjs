import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateScore, inputsFromStats, estimateBoss, compareBossForecast, equipmentOverview, practiceMeasurement, numberValue } from '../public/js/combat-model.js';

const sample = { minAttack: 1000000, maxAttack: 1000000, damage: 100, bossDamage: 300, critRate: 100, critDamage: 100, ignoreDefense: 100 };
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-8 * Math.max(1, Math.abs(b)), `${a} != ${b}`);
test('score uses existing stat attack without counting damage twice', () => {
  const score = calculateScore(sample);
  assert.equal(score.ok, true);
  close(score.basicDamage, 1000000 * 2.5 * 2.35);
  close(score.score, 587.5);
  close(calculateScore({ ...sample, damage: 0, bossDamage: 0 }).basicDamage, 2350000);
});
test('critical probability caps at 100 and defense cannot yield negative damage', () => {
  close(calculateScore({ ...sample, critRate: 50 }).criticalMultiplier, 1.675);
  close(calculateScore({ ...sample, critRate: 0 }).criticalMultiplier, 1);
  close(calculateScore({ ...sample, critRate: 200 }).score, calculateScore(sample).score);
  assert.equal(calculateScore({ ...sample, ignoreDefense: 0 }).score, 0);
  close(calculateScore({ ...sample, ignoreDefense: 96 }).defenseMultiplier, 0.848);
});
test('API spacing, missing information and invalid values are not silently zeroed', () => {
  const input = inputsFromStats({ final_stat: [{ stat_name: '최대 스탯 공격력', stat_value: '1,000,000' }] });
  assert.equal(input.maxAttack, 1000000); assert.equal(input.minAttack, null);
  assert.equal(calculateScore(input).ok, false);
  for (const patch of [{ damage: '' }, { critRate: NaN }, { minAttack: 2000000 }, { ignoreDefense: 101 }, { bossDamage: -1 }]) assert.equal(calculateScore({ ...sample, ...patch }).ok, false);
  assert.equal(numberValue(null), null); assert.equal(numberValue(''), null);
});
test('API stat attack from Clean80 produces a reproducible own index, not supplied Scouter values', () => {
  const s = calculateScore({ minAttack: 105912504, maxAttack: 110325522, damage: 173, bossDamage: 387, critRate: 122, critDamage: 147.05, ignoreDefense: 97.85 });
  close(s.basicDamage, ((105912504 + 110325522) / 2) * (660 / 273) * 2.8205 * 0.9183);
  assert.notEqual(Math.round(s.score), 93821); assert.notEqual(Math.round(s.score), 90185);
});
test('boss forecast uses measured DPS and explicit relative retention', () => {
  const result = estimateBoss({ totalDamage: 120e12, seconds: 120, hp: 600e12, limitMinutes: 20, retention: 50 });
  assert.equal(result.measuredDps, 1e12); assert.equal(result.effectiveDps, 0.5e12);
  assert.equal(result.expectedSeconds, 1200); assert.equal(result.coverage, 1); assert.equal(result.meetsTime, true);
  assert.equal(estimateBoss({ totalDamage: 120e12, seconds: 120, hp: 601e12, limitMinutes: 20, retention: 50 }).meetsTime, false);
  for (const patch of [{ totalDamage: 0 }, { seconds: '' }, { hp: -1 }, { retention: 0 }, { retention: 101 }]) assert.equal(estimateBoss({ totalDamage: 120e12, seconds: 120, hp: 600e12, limitMinutes: 20, ...patch }).ok, false);
});
const measuredBoss = { totalDamage: 120e12, seconds: 120, hp: 900e12, limitMinutes: 10, retention: 100 };

test('boss goal gap expresses required damage gain rather than missing coverage', () => {
  const result = compareBossForecast(measuredBoss);
  assert.equal(result.ok, true);
  assert.equal(result.verdict, 'over');
  close(result.baseline.coverage, 2 / 3);
  close(result.additionalDamagePercent.min, 50);
  close(result.additionalDamagePercent.max, 50);
  assert.equal(result.overtimeSeconds.max, 300);
  assert.equal(result.spareSeconds.max, 0);
  assert.deepEqual(result.savedSeconds, { min: 0, max: 0 });
});

test('boss time margin respects relative retention and exact time boundary', () => {
  const surplus = compareBossForecast({ ...measuredBoss, limitMinutes: 20 });
  assert.equal(surplus.verdict, 'within');
  assert.deepEqual(surplus.spareSeconds, { min: 300, max: 300 });
  assert.deepEqual(surplus.additionalDamagePercent, { min: 0, max: 0 });
  const boundary = compareBossForecast({ ...measuredBoss, limitMinutes: 30, retention: 50 });
  assert.equal(boundary.verdict, 'within');
  assert.equal(boundary.spareSeconds.min, 0);
  assert.equal(boundary.baseline.effectiveDps, 0.5e12);
});

test('HEXA range can cross the time limit without implying definite success', () => {
  const result = compareBossForecast({ ...measuredBoss, hp: 660e12 }, { minMultiplier: 1.05, maxMultiplier: 1.2 });
  assert.equal(result.ok, true);
  assert.equal(result.verdict, 'uncertain');
  close(result.baselineGoal.additionalDamagePercent, 10);
  assert.equal(result.additionalDamagePercent.min, 0);
  close(result.additionalDamagePercent.max, (660 / 1.05 / 600 - 1) * 100);
  close(result.overtimeSeconds.max, 660 / 1.05 - 600);
  close(result.spareSeconds.max, 50);
  close(result.savedSeconds.min, 660 - 660 / 1.05);
  close(result.savedSeconds.max, 110);
  assert.equal(result.baseline.measuredDps, 1e12);
  assert.equal(result.lower.measuredDps, 1e12);
  assert.equal(result.upper.measuredDps, 1e12);
  assert.equal(result.lower.meetsTime, false);
  assert.equal(result.upper.meetsTime, true);
});

test('bounded boss changes preserve input and represent possible slower outcomes', () => {
  const input = { ...measuredBoss };
  const result = compareBossForecast(input, { minMultiplier: 0.9, maxMultiplier: 1.1 });
  assert.deepEqual(input, measuredBoss);
  close(result.savedSeconds.min, -100);
  close(result.savedSeconds.max, 900 - 900 / 1.1);
  assert.equal(result.verdict, 'over');
  const exact = compareBossForecast(measuredBoss, { minMultiplier: 1.5, maxMultiplier: 1.5 });
  assert.equal(exact.verdict, 'within');
  close(exact.lower.expectedSeconds, 600);
});

test('boss upgrade comparison rejects invalid, overflowed and underflowed values', () => {
  for (const multipliers of [
    { minMultiplier: 0 }, { minMultiplier: 2, maxMultiplier: 1 },
    { minMultiplier: '' }, { maxMultiplier: Infinity },
    { minMultiplier: 1, maxMultiplier: 1e308 },
    { minMultiplier: Number.MIN_VALUE, maxMultiplier: 1 },
  ]) assert.equal(compareBossForecast(measuredBoss, multipliers).ok, false);
  assert.equal(compareBossForecast({ ...measuredBoss, hp: '' }).ok, false);
  assert.equal(compareBossForecast({ ...measuredBoss, hp: 1e308, limitMinutes: 1e-308 }).ok, false);
});

test('practice milliseconds are converted once and original reported DPS remains distinct', () => {
  const result = practiceMeasurement({ result: { total_play_time: 400000, total_damage: 800e12, total_dps: 2e12 } });
  assert.equal(result.seconds, 400); assert.equal(result.dps, 2e12);
  assert.equal(practiceMeasurement({ result: { total_play_time: 0, total_damage: 3 } }), null);
});
test('equipment comparison does not pretend alternate presets have computed character stats', () => {
  const loot = { item_name: '링', potential_option_1: '메소 획득량 +20%', special_ring_level: 0 };
  const ring = { item_name: '리스트레인트 링', special_ring_level: 4 };
  const summary = equipmentOverview({ preset_no: 3, item_equipment: [loot], item_equipment_preset_1: [ring], item_equipment_preset_3: [loot] });
  assert.equal(summary.preset, 3); assert.equal(summary.presets[1].loot, 1);
  assert.deepEqual(summary.presets[0].rings, ['리스트레인트 링 4레벨']);
  assert.equal('score' in summary.presets[0], false);
});
