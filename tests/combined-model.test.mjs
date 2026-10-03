import test from 'node:test';
import assert from 'node:assert/strict';
import { calculatePrecision } from '../public/js/precision-model.js';
import { buildHexaRows } from '../public/js/hexa-model.js';
import { combineSkillProjections } from '../public/js/combined-model.js';

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) <= 1e-11 * Math.max(1, Math.abs(expected)), `${actual} != ${expected}`);
const baseline = { minAttack: 1e8, maxAttack: 1e8, damage: 100, bossDamage: 300, critRate: 100, critDamage: 65, ignoreDefense: 90 };
const measured = { totalDamage: 120e12, seconds: 120 };
const precisionRow = (name, share, extraIED = 0) => ({ id: name, name, share, confirmed: true, extraDamage: 0, extraBoss: 0, extraIED, extraCritRate: 0, extraCritDamage: 0 });
const core = (name, components = [{ name, low: 1.1, high: 1.1 }]) => ({ id: `core-${name}`, name, level: 10, type: '마스터리 코어', supported: true,
  effectNames: components.map(component => component.name), currentEffects: components.map(() => '100%의 데미지로 1번 공격'),
  minRatio: Math.min(...components.map(component => component.low)), maxRatio: Math.max(...components.map(component => component.high)),
  components: components.map((component, i) => ({ id: `core-${name}-${i}`, name: component.name, supported: true, minRatio: component.low, maxRatio: component.high })),
});
function precision(patch = {}) {
  const result = calculatePrecision({ before: baseline, after: { ...baseline, ignoreDefense: 95 }, rows: [precisionRow('A', 50), precisionRow('B', 50, 50)],
    measurement: measured, sourceDefense: 380, targetDefense: 380, conditionsConfirmed: true, ...patch });
  assert.equal(result.ok, true);
  return { ...result, source: 'manual', consistent: true, contextCompatible: true };
}
function scenario(p, rows = [core('A')], settings = null) {
  return { rows, settings: settings || Object.fromEntries(rows.map(row => [row.id, { enabled: true, share: 50 }])),
    source: p.source, consistent: true, measurement: { ...p.measurement } };
}
function withPractice(p, s) {
  p.source = s.source = 'practice';
  s.liveClass = '루미너스';
  s.practice = { result: { total_damage: p.measurement.totalDamage, total_play_time: p.measurement.seconds * 1000,
    skill_statistic: p.rows.map(row => ({ skill_name: row.name, damage: p.measurement.totalDamage * row.share / 100 })) },
  characterInfo: { basic_object: { character_class: '루미너스' },
    hexa_matrix_object: { hexa_core_object: { character_hexa_core_equipment: s.rows.map(row => ({ hexa_core_name: row.name, hexa_core_level: row.level, hexa_core_type: row.type, hexa_core_event_level: 0 })) } },
    skill_object: { character_skill: s.rows.flatMap(row => row.effectNames.map((name, i) => ({ skill_name: name, skill_effect: row.currentEffects[i] }))) } } };
  return { p, s };
}

test('per-skill combination reproduces the independently calculated fixed-weight 44853.4965034965 score', () => {
  const p = precision(), result = combineSkillProjections(p, scenario(p));
  assert.equal(result.ok, true);
  const expected = 0.5 * (0.81 / 0.62) * 1.1 + 0.5 * (0.905 / 0.81);
  close(result.minMultiplier, expected);
  close(result.maxMultiplier, expected);
  close(result.minDps, 1e12 * expected);
  close(result.minScore, 44853.4965034965);
  close(result.maxScore, result.minScore);
  close(result.coveredShare, 50);
  assert.ok(Math.abs(result.minMultiplier - result.naiveMinMultiplier) > 0.001);
});

test('counterexample: multiplying average stat and HEXA ratios overestimates damage', () => {
  const flat = { ...baseline, ignoreDefense: 100, damage: 0, bossDamage: 0, critRate: 0 };
  const p = precision({ before: flat, after: { ...flat, bossDamage: 100 }, rows: [precisionRow('A', 50), { ...precisionRow('B', 50), extraBoss: 100 }] });
  const b = core('B', [{ name: 'B', low: 2, high: 2 }]);
  const result = combineSkillProjections(p, scenario(p, [b]));
  assert.equal(result.ok, true);
  // A's stat response is 2x; B's is 1.5x, with B alone gaining 2x HEXA.
  close(p.multiplier, 1.75);
  close(result.minMultiplier, 0.5 * 2 + 0.5 * 1.5 * 2);
  close(result.naiveMinMultiplier, 1.75 * 1.5);
  assert.notEqual(result.minMultiplier, result.naiveMinMultiplier);
});

test('a uniform HEXA increase remains in DPS and score instead of disappearing through weight normalization', () => {
  const p = precision(), result = combineSkillProjections(p, scenario(p, [core('A'), core('B')]));
  assert.equal(result.ok, true);
  close(result.minMultiplier, p.multiplier * 1.1);
  close(result.minScore, p.targetScore * 1.1);
  close(result.minDps, p.projectedDps * 1.1);
  result.rows.forEach((row, i) => close(row.minProjectedShare, p.rows[i].projectedShare));
});

test('a multi-skill core uses the actual precision shares even without a detailed HEXA allocation', () => {
  const p = precision(), multi = core('두 스킬', [{ name: 'A', low: 1.1, high: 1.1 }, { name: 'B', low: 1.5, high: 1.5 }]);
  const result = combineSkillProjections(p, scenario(p, [multi], { [multi.id]: { enabled: true, share: 100 } }));
  assert.equal(result.ok, true);
  close(result.minMultiplier, 0.5 * p.rows[0].multiplier * 1.1 + 0.5 * p.rows[1].multiplier * 1.5);
  close(result.maxMultiplier, result.minMultiplier);
});

test('uncertain internal attack ratios produce conservative marginal projected-share bounds', () => {
  const p = precision(), ranged = core('A', [{ name: 'A', low: 1.05, high: 1.3 }]);
  const result = combineSkillProjections(p, scenario(p, [ranged]));
  assert.equal(result.ok, true);
  const a = 0.5 * p.rows[0].multiplier, b = 0.5 * p.rows[1].multiplier;
  close(result.minMultiplier, a * 1.05 + b);
  close(result.maxMultiplier, a * 1.3 + b);
  close(result.rows[0].minProjectedShare, a * 1.05 / (a * 1.05 + b) * 100);
  close(result.rows[1].minProjectedShare, b / (a * 1.3 + b) * 100);
  assert.ok(result.rows.every(row => row.minProjectedShare <= row.maxProjectedShare));
});

test('whitespace and a unique trailing enhancement alias match the same measured skill', () => {
  const p = precision(), renamed = core('강화', [{ name: ' A 강화 ', low: 1.1, high: 1.1 }]);
  assert.equal(combineSkillProjections(p, scenario(p, [renamed])).ok, true);
});

test('missing selected components are only accepted when explicitly declared unused', () => {
  const p = precision(), multi = core('다중', [{ name: 'A', low: 1.1, high: 1.1 }, { name: '미사용', low: 1.2, high: 1.2 }]);
  const s = scenario(p, [multi]);
  assert.equal(combineSkillProjections(p, s).code, 'MISSING_SKILL');
  s.settings[multi.id].componentShares = { [multi.components[0].id]: 50, [multi.components[1].id]: 0 };
  assert.equal(combineSkillProjections(p, s).ok, true);
  s.settings[multi.id].componentShares[multi.components[1].id] = 10;
  s.settings[multi.id].share = 60;
  assert.equal(combineSkillProjections(p, s).ok, false);
});

test('component swaps with the same group total still reject stale observed shares', () => {
  const p = precision({ rows: [precisionRow('A', 40), precisionRow('B', 60, 50)] });
  const multi = core('다중', [{ name: 'A', low: 1.1, high: 1.1 }, { name: 'B', low: 1.3, high: 1.3 }]);
  const s = scenario(p, [multi], { [multi.id]: { enabled: true, share: 100, componentShares: { [multi.components[0].id]: 60, [multi.components[1].id]: 40 } } });
  assert.equal(combineSkillProjections(p, s).code, 'SHARE_MISMATCH');
});

test('group share differences beyond floating-point summation error are not silently reconciled', () => {
  const p = precision(), s = scenario(p);
  s.settings[s.rows[0].id].share = 50 + 1e-10;
  assert.equal(combineSkillProjections(p, s).code, 'SHARE_MISMATCH');
  s.settings[s.rows[0].id].share = 50 + Number.EPSILON * 50;
  assert.equal(combineSkillProjections(p, s).ok, true);
});

test('ambiguous damage names and overlapping selected cores do not multiply a skill twice', () => {
  const p = precision({ rows: [precisionRow('A', 50), precisionRow('A 강화', 50)] });
  assert.equal(combineSkillProjections(p, scenario(p)).code, 'AMBIGUOUS_SKILL');
  const clean = precision(), a = core('A'), alias = core('다른 코어', [{ name: 'A 강화', low: 1.2, high: 1.2 }]);
  assert.equal(combineSkillProjections(clean, scenario(clean, [a, alias])).code, 'OVERLAPPING_SKILL');
});

test('unmatched positive measured skills remain unchanged when their cores are not selected', () => {
  const p = precision(), s = scenario(p, [core('A'), core('B')]);
  s.settings[s.rows[1].id].enabled = false;
  const result = combineSkillProjections(p, s);
  assert.equal(result.ok, true);
  assert.equal(result.rows[1].minHexaRatio, 1);
  assert.equal(result.rows[1].coreId, null);
});

test('source, consistency, measurement and incompatible known context are enforced', () => {
  const p = precision();
  for (const patch of [{ source: 'practice' }, { consistent: false }, { measurement: { totalDamage: 121e12, seconds: 120 } }, { measurement: { totalDamage: 120e12, seconds: 121 } }]) {
    assert.equal(combineSkillProjections(p, { ...scenario(p), ...patch }).ok, false);
  }
  for (const patch of [{ ok: false }, { consistent: false }, { contextCompatible: false }, { multiplier: p.multiplier + .01 }, { measurement: null }]) {
    assert.equal(combineSkillProjections({ ...p, ...patch }, scenario(p)).ok, false);
  }
  assert.equal(combineSkillProjections({ ...p, contextCompatible: undefined }, scenario(p)).ok, true);
  assert.equal(combineSkillProjections(null, null).ok, false);
});

test('measurement equality uses relative precision rather than treating tiny unequal values as zero', () => {
  const p = precision({ measurement: { totalDamage: 1e-300, seconds: 1 } }), s = scenario(p);
  s.measurement.totalDamage = 2e-300;
  assert.equal(combineSkillProjections(p, s).code, 'MEASUREMENT_MISMATCH');
});

test('supported official effect rows generated by buildHexaRows can be used directly', () => {
  const p = precision();
  const rows = buildHexaRows({ character_hexa_core_equipment: [{ hexa_core_name: 'A', hexa_core_level: 10, hexa_core_type: '마스터리 코어', linked_skill: [{ hexa_skill_id: 'A' }] }] },
    { character_skill: [{ skill_name: 'A', skill_level: 10, skill_effect: '100%의 데미지로 1번 공격', skill_effect_next: '110%의 데미지로 1번 공격' }] });
  const result = combineSkillProjections(p, scenario(p, rows));
  assert.equal(result.ok, true);
  close(result.minScore, 44853.4965034965);
});

test('practice data independently verifies raw shares and current core levels/effects', () => {
  const p = precision(), s = scenario(p); withPractice(p, s);
  assert.equal(combineSkillProjections(p, s).ok, true);
  s.practice.characterInfo.hexa_matrix_object.hexa_core_object.character_hexa_core_equipment[0].hexa_core_level = 9;
  assert.equal(combineSkillProjections(p, s).code, 'CONTEXT_MISMATCH');
  s.practice.characterInfo.hexa_matrix_object.hexa_core_object.character_hexa_core_equipment[0].hexa_core_level = 10;
  s.practice.characterInfo.skill_object.character_skill[0].skill_effect = '99%의 데미지로 1번 공격';
  assert.equal(combineSkillProjections(p, s).code, 'CONTEXT_MISMATCH');
});

test('practice cannot be forged by manually changing imported share settings', () => {
  const p = precision(), s = scenario(p); withPractice(p, s);
  s.practice.result.skill_statistic[0].damage = 59e12;
  assert.equal(combineSkillProjections(p, s).code, 'SHARE_MISMATCH');
  s.practice.result.total_damage = 121e12;
  assert.equal(combineSkillProjections(p, s).code, 'MEASUREMENT_MISMATCH');
});

test('scores use fixed-380 contributions independently of target-defense DPS projection', () => {
  const p = precision({ targetDefense: 0 }), result = combineSkillProjections(p, scenario(p));
  assert.equal(result.ok, true);
  close(result.minScore, 44853.4965034965);
  close(result.minMultiplier, .5 * (1 / .62) * 1.1 + .5 * (1 / .81));
});

test('score contribution fields may be absent, but partial or inconsistent contributions are rejected', () => {
  const p = precision(), noScores = structuredClone(p);
  noScores.rows.forEach(row => { delete row.sourceScoreContribution; delete row.targetScoreContribution; });
  const result = combineSkillProjections(noScores, scenario(p));
  assert.equal(result.ok, true);
  assert.equal(result.minScore, null);
  assert.equal(result.maxScore, null);
  delete p.rows[0].targetScoreContribution;
  assert.equal(combineSkillProjections(p, scenario(p)).ok, false);
  const bad = precision(); bad.rows[0].targetScoreContribution += 1;
  assert.equal(combineSkillProjections(bad, scenario(bad)).ok, false);
});

test('zero projected damage has defined zero outputs and no division-by-zero shares', () => {
  const p = precision({ after: { ...baseline, ignoreDefense: 0 }, rows: [precisionRow('A', 50), precisionRow('B', 50)] });
  const result = combineSkillProjections(p, scenario(p));
  assert.equal(result.ok, true);
  assert.equal(result.minMultiplier, 0);
  assert.equal(result.minDps, 0);
  assert.equal(result.minScore, 0);
  assert.ok(result.rows.every(row => row.minProjectedShare === 0 && row.maxProjectedShare === 0));
});

test('invalid or unsupported cores and numeric overflow do not produce a result', () => {
  const p = precision();
  for (const modify of [
    s => { s.rows[0].supported = false; },
    s => { s.rows[0].components[0].supported = false; },
    s => { s.rows[0].components[0].minRatio = 0; },
    s => { s.rows[0].components[0].maxRatio = Infinity; },
    s => { s.settings.unknown = { enabled: true, share: 1 }; },
    s => { s.rows[0].components = []; },
    s => { s.rows[0].components[0].minRatio = s.rows[0].components[0].maxRatio = 1e308; },
  ]) { const s = scenario(p); modify(s); assert.equal(combineSkillProjections(p, s).ok, false); }
});

test('combined calculation is immutable for frozen precision and HEXA state', () => {
  const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
  const p = precision(), s = scenario(p), before = structuredClone({ p, s });
  freeze(p); freeze(s);
  assert.equal(combineSkillProjections(p, s).ok, true);
  assert.deepEqual({ p, s }, before);
});
