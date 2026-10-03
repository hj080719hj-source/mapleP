// Maple You model 1.0. This is our own index, not MapleScouter's converted stat.
// Stat attack already includes the character's stat formula, weapon constant,
// damage and final damage. Do not multiply those contributions a second time.
export const MODEL = Object.freeze({ version: '1.0', defense: 380, damagePerPoint: 10000 });

const fields = {
  minAttack: '최소 스탯공격력', maxAttack: '최대 스탯공격력', damage: '데미지',
  bossDamage: '보스 몬스터 데미지', critRate: '크리티컬 확률',
  critDamage: '크리티컬 데미지', ignoreDefense: '방어율 무시',
};
export function numberValue(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !value.trim()) return null;
  const result = Number(typeof value === 'string' ? value.replace(/,/g, '').trim() : value);
  return Number.isFinite(result) ? result : null;
}
export function statMap(data) {
  return new Map((Array.isArray(data?.final_stat) ? data.final_stat : []).filter(row => row && typeof row.stat_name === 'string').map(row => [row.stat_name.replace(/\s/g, ''), numberValue(row.stat_value)]));
}
export function inputsFromStats(data) {
  const values = statMap(data);
  return Object.fromEntries(Object.entries(fields).map(([key, name]) => [key, values.get(name.replace(/\s/g, '')) ?? null]));
}
export function calculateScore(input) {
  const values = Object.fromEntries(Object.keys(fields).map(key => [key, numberValue(input?.[key])]));
  const invalid = Object.keys(fields).filter(key => values[key] === null || values[key] < 0);
  if (invalid.length) return { ok: false, message: `${invalid.map(key => fields[key]).join(' · ')} 값을 입력해주세요.` };
  if (values.minAttack > values.maxAttack) return { ok: false, message: '최소 스탯공격력은 최대 스탯공격력 이하여야 합니다.' };
  if (values.ignoreDefense > 100) return { ok: false, message: '방어율 무시는 0~100% 범위로 입력해주세요.' };
  const averageAttack = (values.minAttack + values.maxAttack) / 2;
  const bossMultiplier = (100 + values.damage + values.bossDamage) / (100 + values.damage);
  const criticalMultiplier = 1 + Math.min(values.critRate, 100) / 100 * (0.35 + values.critDamage / 100);
  const defenseMultiplier = Math.max(0, 1 - MODEL.defense / 100 * (1 - values.ignoreDefense / 100));
  const basicDamage = averageAttack * bossMultiplier * criticalMultiplier * defenseMultiplier;
  if (!Number.isFinite(basicDamage)) return { ok: false, message: '입력값이 너무 큽니다. 스탯을 확인해주세요.' };
  return { ok: true, score: basicDamage / MODEL.damagePerPoint, basicDamage, averageAttack,
    bossMultiplier, criticalMultiplier, defenseMultiplier, values };
}

// The time forecast is based on an actual damage measurement, never the index.
// Retention is *relative to that measurement*, so default 100% adds no downtime.
export function estimateBoss({ totalDamage, seconds, hp, limitMinutes, retention = 100 }) {
  const values = [totalDamage, seconds, hp, limitMinutes, retention].map(numberValue);
  if (values.some(value => value === null || value <= 0)) return { ok: false, message: '총 피해량·측정 시간·보스 체력·제한 시간·딜 유지율을 0보다 크게 입력해주세요.' };
  const [damage, duration, health, minutes, rate] = values;
  if (rate > 100) return { ok: false, message: '측정 대비 딜 유지율은 100% 이하로 입력해주세요.' };
  const measuredDps = damage / duration, effectiveDps = measuredDps * rate / 100;
  const expectedSeconds = health / effectiveDps, requiredDps = health / (minutes * 60);
  const coverage = effectiveDps / requiredDps;
  if (![measuredDps, effectiveDps, expectedSeconds, requiredDps, coverage].every(Number.isFinite)) return { ok: false, message: '입력값의 범위를 확인해주세요.' };
  return { ok: true, measuredDps, effectiveDps, expectedSeconds, requiredDps, coverage, meetsTime: expectedSeconds <= minutes * 60 };
}

// Project a bounded upgrade without changing the observed measurement itself.
export function compareBossForecast(input, { minMultiplier = 1, maxMultiplier = 1 } = {}) {
  const baseline = estimateBoss(input);
  if (!baseline.ok) return baseline;
  const minimum = numberValue(minMultiplier), maximum = numberValue(maxMultiplier);
  if (minimum === null || maximum === null || minimum <= 0 || maximum < minimum) {
    return { ok: false, message: 'HEXA 보정 배율의 범위를 확인해주세요.' };
  }
  const limitSeconds = numberValue(input.limitMinutes) * 60;
  const project = multiplier => ({
    ...baseline,
    effectiveDps: baseline.effectiveDps * multiplier,
    expectedSeconds: baseline.expectedSeconds / multiplier,
    coverage: baseline.coverage * multiplier,
    meetsTime: baseline.expectedSeconds / multiplier <= limitSeconds,
  });
  const lower = project(minimum), upper = project(maximum);
  const gap = forecast => ({
    additionalDamagePercent: Math.max(0, (forecast.expectedSeconds / limitSeconds - 1) * 100),
    spareSeconds: Math.max(0, limitSeconds - forecast.expectedSeconds),
    overtimeSeconds: Math.max(0, forecast.expectedSeconds - limitSeconds),
  });
  const baselineGoal = gap(baseline), lowerGoal = gap(lower), upperGoal = gap(upper);
  const additionalDamagePercent = { min: upperGoal.additionalDamagePercent, max: lowerGoal.additionalDamagePercent };
  const spareSeconds = { min: lowerGoal.spareSeconds, max: upperGoal.spareSeconds };
  const overtimeSeconds = { min: upperGoal.overtimeSeconds, max: lowerGoal.overtimeSeconds };
  const savedSeconds = { min: baseline.expectedSeconds - lower.expectedSeconds, max: baseline.expectedSeconds - upper.expectedSeconds };
  const calculated = [limitSeconds, lower.effectiveDps, lower.expectedSeconds, lower.coverage, upper.effectiveDps, upper.expectedSeconds, upper.coverage,
    ...Object.values(baselineGoal), ...Object.values(additionalDamagePercent), ...Object.values(spareSeconds), ...Object.values(overtimeSeconds), ...Object.values(savedSeconds)];
  if (!calculated.every(Number.isFinite) || [limitSeconds, lower.effectiveDps, lower.expectedSeconds, lower.coverage, upper.effectiveDps, upper.expectedSeconds, upper.coverage].some(value => value <= 0)) {
    return { ok: false, message: '입력값 또는 HEXA 보정 배율이 계산 가능한 범위를 벗어났습니다.' };
  }
  return { ok: true, baseline, lower, upper, limitSeconds, baselineGoal, additionalDamagePercent, spareSeconds, overtimeSeconds, savedSeconds,
    verdict: lower.meetsTime ? 'within' : upper.meetsTime ? 'uncertain' : 'over' };
}

export function equipmentOverview(equipment) {
  const equipped = Array.isArray(equipment?.item_equipment) ? equipment.item_equipment : [];
  const presets = [1, 2, 3].map(number => {
    const items = equipment?.[`item_equipment_preset_${number}`];
    if (!Array.isArray(items) || !items.length) return null;
    const loot = items.filter(item => [1, 2, 3].some(line => /드롭|메소 획득/.test(item[`potential_option_${line}`] || ''))).length;
    return { number, count: items.length, loot, rings: items.filter(item => numberValue(item.special_ring_level) > 0).map(item => `${item.item_name} ${item.special_ring_level}레벨`) };
  }).filter(Boolean);
  return { preset: equipment?.preset_no ?? null, equipped, presets };
}
export function practiceMeasurement(data) {
  const result = data?.result;
  const totalDamage = numberValue(result?.total_damage), timeMs = numberValue(result?.total_play_time);
  if (totalDamage === null || totalDamage <= 0 || timeMs === null || timeMs <= 0) return null;
  return { totalDamage, seconds: timeMs / 1000, dps: totalDamage / (timeMs / 1000), reportedDps: numberValue(result.total_dps) };
}
