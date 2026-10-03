import { calculateScore, MODEL, numberValue } from './combat-model.js';

const effectFields = ['extraDamage', 'extraBoss', 'extraIED', 'extraCritRate', 'extraCritDamage'];
const fail = message => ({ ok: false, message });
const sum = values => values.reduce((total, value) => total + value, 0);

// This is the expected stat response of one skill, before its fixed coefficient
// and number of hits. Additional effects must not already be in the stat window.
function skillResponse(stats, effects, defense) {
  const averageAttack = (stats.minAttack + stats.maxAttack) / 2;
  const boss = (100 + stats.damage + stats.bossDamage + effects.extraDamage + effects.extraBoss) / (100 + stats.damage);
  const critical = 1 + Math.min(stats.critRate + effects.extraCritRate, 100) / 100
    * (0.35 + (stats.critDamage + effects.extraCritDamage) / 100);
  const penetration = Math.max(0, 1 - defense / 100 * (1 - stats.ignoreDefense / 100) * (1 - effects.extraIED / 100));
  return averageAttack * boss * critical * penetration;
}

/**
 * Project one observed rotation under new stats/target defense. Skill levels,
 * hit counts, timing, buffs, and every other target condition must be unchanged.
 * Shares are observed DAMAGE shares; they already contain the skill effects.
 * Missing effects or unaccounted damage are never replaced by zero effects.
 */
export function calculatePrecision({ before, after, rows, measurement, sourceDefense, targetDefense = 380, conditionsConfirmed = false } = {}) {
  if (conditionsConfirmed !== true) return fail('측정 당시 스탯·버프 상태와 동일한 보스 대상·스킬 구성·레벨·타수 조건인지 확인해주세요.');
  const source = calculateScore(before), target = calculateScore(after);
  if (!source.ok) return fail(`측정 당시 스탯: ${source.message}`);
  if (!target.ok) return fail(`변경 후 스탯: ${target.message}`);
  if (source.averageAttack <= 0 || target.averageAttack <= 0) return fail('측정 당시와 변경 후 평균 스탯공격력은 0보다 커야 합니다.');
  const sourceP = numberValue(sourceDefense), targetP = numberValue(targetDefense);
  if ([sourceP, targetP].some(value => value === null || value < 0 || value > 1000)) return fail('측정 대상과 목표 대상의 방어율을 0~1000% 범위로 입력해주세요.');
  const damage = numberValue(measurement?.totalDamage), seconds = numberValue(measurement?.seconds);
  if (damage === null || seconds === null || damage <= 0 || seconds <= 0) return fail('실측 총 피해량과 측정 시간을 0보다 크게 입력해주세요.');
  const measuredDps = damage / seconds;
  if (!Number.isFinite(measuredDps) || measuredDps <= 0) return fail('실측 피해량과 측정 시간이 계산 가능한 범위를 벗어났습니다.');
  if (!Array.isArray(rows) || !rows.length) return fail('실측 피해량 전체에 해당하는 스킬과 점유율을 입력해주세요.');

  const active = [], seen = new Set();
  for (const row of rows) {
    const share = numberValue(row?.share);
    if (share === null || share < 0 || share > 100) return fail('각 스킬의 실측 피해 점유율을 0~100% 범위로 입력해주세요.');
    // Zero-share rows describe unused skills, not unknown portions of the damage.
    if (share === 0) continue;
    const id = typeof row.id === 'string' ? row.id.trim() : '';
    const name = typeof row.name === 'string' ? row.name.trim() : '';
    if (!id || !name || seen.has(id)) return fail('피해 점유율이 있는 스킬의 이름과 중복되지 않는 식별자가 필요합니다.');
    seen.add(id);
    if (row.confirmed !== true) return fail(`${name}: 스킬별 추가 효과를 확인해야 전체 결과를 계산할 수 있습니다.`);
    const effects = Object.fromEntries(effectFields.map(field => [field, numberValue(row[field])]));
    if (effectFields.some(field => effects[field] === null || effects[field] < 0) || effects.extraIED > 100) {
      return fail(`${name}: 추가 효과를 빠짐없이 입력해주세요. 효과가 없음을 확인한 항목은 0, 추가 방무는 0~100%입니다.`);
    }
    active.push({ id, name, share, effects });
  }
  const totalShare = sum(active.map(row => row.share));
  // Only tolerate floating-point summation error, never a missing/rounded share.
  const allowance = Number.EPSILON * Math.max(totalShare, 100) * Math.max(4, active.length * 4);
  if (!active.length || !Number.isFinite(totalShare) || Math.abs(totalShare - 100) > allowance) {
    return fail('확인한 스킬의 실측 피해 점유율 합계가 100%여야 합니다. 누락된 피해를 임의로 채우지 않습니다.');
  }

  const responses = [];
  for (const row of active) {
    const sourceResponse = skillResponse(source.values, row.effects, sourceP);
    const targetResponse = skillResponse(target.values, row.effects, targetP);
    const fixedSourceResponse = skillResponse(source.values, row.effects, MODEL.defense);
    const fixedTargetResponse = skillResponse(target.values, row.effects, MODEL.defense);
    if (![sourceResponse, targetResponse, fixedSourceResponse, fixedTargetResponse].every(Number.isFinite)
      || sourceResponse <= 0 || targetResponse < 0 || fixedSourceResponse < 0 || fixedTargetResponse < 0) {
      return fail(`${row.name}: 실측 피해가 있는 스킬의 측정 당시 기대 피해가 0이거나 계산 범위를 벗어났습니다. 스탯과 방어율을 확인해주세요.`);
    }
    const fraction = row.share / 100;
    const multiplier = targetResponse / sourceResponse;
    const contribution = fraction * multiplier;
    const unscaledWeight = fraction / sourceResponse;
    if (!Number.isFinite(multiplier) || !Number.isFinite(contribution) || !Number.isFinite(unscaledWeight) || unscaledWeight <= 0
      || (targetResponse > 0 && contribution <= 0)) return fail(`${row.name}: 스킬 보정 비율이 계산 가능한 범위를 벗어났습니다.`);
    responses.push({ ...row, fraction, multiplier, contribution, unscaledWeight, fixedSourceResponse, fixedTargetResponse });
  }

  const multiplier = sum(responses.map(row => row.contribution));
  const weightSum = sum(responses.map(row => row.unscaledWeight));
  if (!Number.isFinite(weightSum) || weightSum <= 0) return fail('스킬별 기저 가중치를 계산할 수 없습니다.');
  // Invert the observed damage shares to recover the relative fixed rotation
  // weights. Weighting the effects directly by observed shares double counts them.
  const outputRows = responses.map(row => ({ id: row.id, name: row.name, share: row.share,
    multiplier: row.multiplier,
    projectedShare: multiplier > 0 ? row.contribution / multiplier * 100 : 0,
    baseWeight: row.unscaledWeight / weightSum,
    sourceScoreContribution: row.unscaledWeight / weightSum * row.fixedSourceResponse / MODEL.damagePerPoint,
    targetScoreContribution: row.unscaledWeight / weightSum * row.fixedTargetResponse / MODEL.damagePerPoint,
  }));
  const sourceScore = sum(responses.map((row, i) => outputRows[i].baseWeight * row.fixedSourceResponse)) / MODEL.damagePerPoint;
  const targetScore = sum(responses.map((row, i) => outputRows[i].baseWeight * row.fixedTargetResponse)) / MODEL.damagePerPoint;
  const projectedDps = measuredDps * multiplier, projectedDamage = damage * multiplier;
  const numbers = [multiplier, projectedDps, projectedDamage, sourceScore, targetScore,
    ...outputRows.flatMap(row => [row.multiplier, row.projectedShare, row.baseWeight, row.sourceScoreContribution, row.targetScoreContribution])];
  if (!numbers.every(value => Number.isFinite(value) && value >= 0)
    || (multiplier > 0 && (projectedDps <= 0 || projectedDamage <= 0))
    || (sourceScore <= 0 && responses.some(row => row.fixedSourceResponse > 0))
    || (targetScore <= 0 && responses.some(row => row.fixedTargetResponse > 0))
    || outputRows.some(row => row.baseWeight <= 0)) return fail('스킬별 보정 결과가 계산 가능한 범위를 벗어났습니다.');
  return { ok: true, multiplier, projectedDps, measuredDps, projectedDamage,
    sourceScore, targetScore, sourceDefense: sourceP, targetDefense: targetP,
    scoreDefense: MODEL.defense, totalShare, rows: outputRows, measurement: { totalDamage: damage, seconds } };
}
