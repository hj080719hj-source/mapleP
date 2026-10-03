import { numberValue, practiceMeasurement } from './combat-model.js';
import { planHexa, sharesFromPractice } from './hexa-model.js';

const text = value => typeof value === 'string' ? value.trim() : '';
const skillKey = value => text(value).replace(/\s+강화$/u, '').replace(/\s+/gu, '');
const fail = (message, code = 'INVALID_COMBINATION') => ({ ok: false, message, code });
const sum = values => values.reduce((total, value) => total + value, 0);
const near = (a, b, count = 1) => Number.isFinite(a) && Number.isFinite(b)
  && Math.abs(a - b) <= Math.max(Number.MIN_VALUE * 8,
    Number.EPSILON * Math.max(Math.abs(a), Math.abs(b)) * Math.max(8, count * 4));
const validRange = (low, high) => Number.isFinite(low) && Number.isFinite(high) && low > 0 && high >= low;

function measurement(value) {
  const totalDamage = numberValue(value?.totalDamage), seconds = numberValue(value?.seconds);
  if (totalDamage === null || seconds === null || totalDamage <= 0 || seconds <= 0) return null;
  const dps = totalDamage / seconds;
  return Number.isFinite(dps) && dps > 0 ? { totalDamage, seconds, dps } : null;
}
const sameMeasurement = (a, b) => a && b && near(a.totalDamage, b.totalDamage) && near(a.seconds, b.seconds);

/**
 * Combine effects within each observed skill before averaging. Multiplying the
 * two independently averaged plans loses the relation between their effects.
 * Precision's fixed-380 score contributions keep their original denominator;
 * only projected DAMAGE shares are normalized again after the upgrades.
 */
export function combineSkillProjections(precision, hexaScenario) {
  if (precision?.ok !== true) return fail('먼저 스킬별 스탯 비교를 완료해주세요.');
  if (!['manual', 'practice'].includes(precision.source) || precision.source !== hexaScenario?.source) {
    return fail('스킬 보정과 HEXA의 측정 기준을 같게 선택해주세요.', 'SOURCE_MISMATCH');
  }
  if (precision.consistent !== true || hexaScenario.consistent !== true || precision.contextCompatible === false) {
    return fail('현재 스킬·측정 조건이 일치하지 않아 두 보정을 함께 적용할 수 없습니다.', 'CONTEXT_MISMATCH');
  }
  const observed = measurement(precision.measurement), hexaMeasured = measurement(hexaScenario.measurement);
  if (!sameMeasurement(observed, hexaMeasured)) return fail('스킬 보정과 HEXA가 같은 총 피해량·측정 시간을 사용해야 합니다.', 'MEASUREMENT_MISMATCH');
  if (!near(numberValue(precision.measuredDps), observed.dps)) return fail('스킬 보정의 기준 DPS가 실측 피해량·시간과 다릅니다.', 'MEASUREMENT_MISMATCH');
  if (!Array.isArray(precision.rows) || !precision.rows.length) return fail('확인한 스킬별 피해 점유율이 없습니다.');

  const skills = [], ids = new Set();
  for (const row of precision.rows) {
    const id = text(row?.id), name = text(row?.name), share = numberValue(row?.share), ratio = numberValue(row?.multiplier);
    if (!id || !name || ids.has(id) || share === null || share <= 0 || share > 100 || ratio === null || ratio < 0) {
      return fail('스킬 보정의 이름·점유율·변경 배율을 확인해주세요.');
    }
    ids.add(id);
    skills.push({ id, name, share, statRatio: ratio, minHexaRatio: 1, maxHexaRatio: 1, coreId: null, componentId: null });
  }
  const totalShare = sum(skills.map(skill => skill.share));
  const statMultiplier = sum(skills.map(skill => skill.share / 100 * skill.statRatio));
  if (!near(totalShare, 100, skills.length) || !near(numberValue(precision.totalShare), totalShare, skills.length)
    || !near(numberValue(precision.multiplier), statMultiplier, skills.length)
    || !near(numberValue(precision.projectedDps), observed.dps * statMultiplier, skills.length)
    || !near(numberValue(precision.projectedDamage), observed.totalDamage * statMultiplier, skills.length)) {
    return fail('스킬별 비중·배율 합계가 기존 스탯 비교 결과와 맞지 않습니다. 다시 계산해주세요.');
  }

  const cores = hexaScenario.rows, settings = hexaScenario.settings;
  if (!Array.isArray(cores) || !cores.length || !settings || typeof settings !== 'object' || Array.isArray(settings)) {
    return fail('비교할 HEXA 코어와 점유율 설정이 없습니다.');
  }
  const coreIds = new Set();
  for (const core of cores) {
    const id = text(core?.id);
    if (!id || !text(core?.name) || coreIds.has(id)) return fail('HEXA 코어의 이름과 중복되지 않는 식별자가 필요합니다.');
    coreIds.add(id);
  }
  if (Object.keys(settings).some(id => !coreIds.has(id)) || Object.values(settings).some(setting => !setting || typeof setting !== 'object'
    || Array.isArray(setting) || (setting.enabled !== undefined && typeof setting.enabled !== 'boolean'))) {
    return fail('현재 HEXA 코어와 맞지 않는 선택 정보가 있습니다.');
  }
  // Retain all existing HEXA plan validation, including unsupported effect text,
  // out-of-range component shares, missing components and duplicate shares.
  const plan = planHexa(cores, settings);
  if (!plan.ok) return fail(plan.message, plan.code);
  const selected = cores.filter(core => settings[core.id]?.enabled === true);

  let imported = null;
  if (precision.source === 'practice') {
    const record = practiceMeasurement(hexaScenario.practice);
    if (!sameMeasurement(observed, measurement(record))) return fail('선택한 연무장 기록의 실측값이 현재 기준과 다릅니다.', 'MEASUREMENT_MISMATCH');
    imported = sharesFromPractice(cores, hexaScenario.practice, hexaScenario.liveClass);
    if (selected.some(core => imported.incompatibleIds.includes(core.id))) {
      return fail('선택한 HEXA 코어의 레벨·효과가 연무장 측정 당시와 다릅니다.', 'CONTEXT_MISMATCH');
    }
  }

  const selectedNames = new Set(), assigned = new Set();
  for (const core of selected) {
    const setting = settings[core.id];
    if (!Array.isArray(core.components) || !core.components.length) return fail(`${core.name}: 연결된 스킬을 확인할 수 없습니다.`);
    if (imported && !near(numberValue(setting.share), numberValue(imported.settings[core.id]?.share), skills.length)) {
      return fail(`${core.name}: HEXA 점유율이 연무장 원본과 다릅니다.`, 'SHARE_MISMATCH');
    }
    const components = new Set();
    let matchedShare = 0;
    for (const component of core.components) {
      const componentId = text(component?.id), key = skillKey(component?.name);
      if (!componentId || !key || components.has(componentId)) return fail(`${core.name}: 연결 스킬을 구분할 수 없습니다.`);
      components.add(componentId);
      if (component.supported !== true || !validRange(component.minRatio, component.maxRatio)) return fail(`${core.name}: 확인되지 않은 연결 스킬 배율은 함께 계산할 수 없습니다.`);
      if (selectedNames.has(key)) return fail(`${component.name}: 여러 선택 코어가 같은 스킬에 겹칩니다.`, 'OVERLAPPING_SKILL');
      selectedNames.add(key);
      const matches = skills.filter(skill => skillKey(skill.name) === key);
      if (matches.length > 1) return fail(`${component.name}: 측정 스킬 이름이 겹쳐 한 항목으로 연결할 수 없습니다.`, 'AMBIGUOUS_SKILL');
      const detailed = setting.componentShares !== undefined;
      const declared = detailed ? numberValue(setting.componentShares[componentId]) : null;
      if (!matches.length) {
        // A missing component is not assumed unused merely because the total
        // core share equals the shares of the other matched components.
        if (!detailed || declared !== 0) return fail(`${component.name}: 실측 스킬을 찾지 못했습니다. 미사용 스킬이면 상세 점유율을 0으로 확인해주세요.`, 'MISSING_SKILL');
        if (imported && !near(numberValue(imported.settings[core.id]?.componentShares?.[componentId]), 0)) {
          return fail(`${component.name}: 연무장 원본의 스킬 피해가 누락되었습니다.`, 'SHARE_MISMATCH');
        }
        continue;
      }
      const match = matches[0];
      if (assigned.has(match.id)) return fail(`${match.name}: 스킬에 두 HEXA 보정을 중복 적용할 수 없습니다.`, 'OVERLAPPING_SKILL');
      if (detailed && !near(declared, match.share, skills.length)) return fail(`${match.name}: 스킬 보정과 HEXA의 실측 점유율이 다릅니다.`, 'SHARE_MISMATCH');
      if (imported && !near(numberValue(imported.settings[core.id]?.componentShares?.[componentId]), match.share, skills.length)) {
        return fail(`${match.name}: 점유율이 연무장 원본과 다릅니다.`, 'SHARE_MISMATCH');
      }
      assigned.add(match.id);
      matchedShare += match.share;
      match.minHexaRatio = component.minRatio; match.maxHexaRatio = component.maxRatio;
      match.coreId = core.id; match.componentId = componentId;
    }
    if (!near(matchedShare, numberValue(setting.share), skills.length)) return fail(`${core.name}: 연결된 실측 스킬 비중 합계와 코어 점유율이 다릅니다.`, 'SHARE_MISMATCH');
  }

  let hasScores = false;
  const scoreFields = ['sourceScoreContribution', 'targetScoreContribution'];
  for (const field of scoreFields) {
    const present = precision.rows.map(row => row[field] !== undefined);
    if (!present.some(Boolean)) continue;
    if (!present.every(Boolean)) return fail('스킬별 자체 지수 기여도가 일부 누락되어 있습니다.');
    const contributions = precision.rows.map(row => numberValue(row[field]));
    if (contributions.some(value => value === null || value < 0)) return fail('스킬별 자체 지수 기여도가 올바르지 않습니다.');
    const expected = numberValue(precision[field === 'sourceScoreContribution' ? 'sourceScore' : 'targetScore']);
    if (!near(sum(contributions), expected, skills.length)) return fail('스킬별 자체 지수 기여도 합계가 전체 지수와 다릅니다.');
    if (field === 'targetScoreContribution') {
      hasScores = true;
      contributions.forEach((value, index) => { skills[index].targetScoreContribution = value; });
    }
  }

  const lower = [], upper = [];
  for (const skill of skills) {
    skill.minRatio = skill.statRatio * skill.minHexaRatio;
    skill.maxRatio = skill.statRatio * skill.maxHexaRatio;
    const lo = skill.share / 100 * skill.minRatio, hi = skill.share / 100 * skill.maxRatio;
    if (![skill.minRatio, skill.maxRatio, lo, hi].every(Number.isFinite) || (skill.statRatio > 0 && lo <= 0)) {
      return fail('스킬별 통합 배율이 계산 가능한 범위를 벗어났습니다.');
    }
    lower.push(lo); upper.push(hi);
  }
  const minMultiplier = sum(lower), maxMultiplier = sum(upper);
  const minDps = observed.dps * minMultiplier, maxDps = observed.dps * maxMultiplier;
  const minDamage = observed.totalDamage * minMultiplier, maxDamage = observed.totalDamage * maxMultiplier;
  const minScore = hasScores ? sum(skills.map(skill => skill.targetScoreContribution * skill.minHexaRatio)) : null;
  const maxScore = hasScores ? sum(skills.map(skill => skill.targetScoreContribution * skill.maxHexaRatio)) : null;
  // Marginal share bounds use the opposite bounds for all other skills. Dividing
  // every lower contribution by the lower total would not produce share bounds.
  skills.forEach((skill, i) => {
    const lowDenominator = lower[i] + sum(upper.filter((_, j) => j !== i));
    const highDenominator = upper[i] + sum(lower.filter((_, j) => j !== i));
    skill.minProjectedShare = lowDenominator > 0 ? lower[i] / lowDenominator * 100 : 0;
    skill.maxProjectedShare = highDenominator > 0 ? upper[i] / highDenominator * 100 : 0;
  });
  const naiveMinMultiplier = statMultiplier * plan.minMultiplier, naiveMaxMultiplier = statMultiplier * plan.maxMultiplier;
  const outputs = [minMultiplier, maxMultiplier, minDps, maxDps, minDamage, maxDamage, naiveMinMultiplier, naiveMaxMultiplier,
    ...(hasScores ? [minScore, maxScore] : []), ...skills.flatMap(skill => [skill.minProjectedShare, skill.maxProjectedShare])];
  if (!outputs.every(value => Number.isFinite(value) && value >= 0) || maxMultiplier < minMultiplier
    || (minMultiplier > 0 && (minDps <= 0 || minDamage <= 0)) || (maxMultiplier > 0 && (maxDps <= 0 || maxDamage <= 0))
    || (hasScores && skills.some(skill => skill.targetScoreContribution > 0) && minScore <= 0)) {
    return fail('통합 결과가 계산 가능한 범위를 벗어났습니다.');
  }
  return { ok: true, minMultiplier, maxMultiplier, minDps, maxDps, minDamage, maxDamage, minScore, maxScore,
    measuredDps: observed.dps, selectedCount: selected.length, coveredShare: plan.coveredShare,
    naiveMinMultiplier, naiveMaxMultiplier, rows: skills };
}
