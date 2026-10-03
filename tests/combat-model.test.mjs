import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateScore, inputsFromStats, estimateBoss, equipmentOverview, practiceMeasurement, numberValue } from '../public/js/combat-model.js';

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
