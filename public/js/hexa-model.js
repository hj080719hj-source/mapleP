// One-level HEXA scenarios based on the API's current/next effect text.
// This deliberately does not extrapolate a whole level curve or invent skill shares.
const numeric = value => {
  if ((typeof value !== 'number' && typeof value !== 'string') || (typeof value === 'string' && !value.trim())) return null;
  const parsed = Number(typeof value === 'string' ? value.replace(/,/g, '').trim() : value);
  return Number.isFinite(parsed) ? parsed : null;
};
const text = value => typeof value === 'string' ? value.trim() : '';
const withoutEnhancement = value => text(value).replace(/\s+강화$/u, '');
const key = value => withoutEnhancement(value).replace(/\s+/gu, '');
const compact = value => text(value).replace(/\s+/gu, '');
const costless = value => text(value).replace(/\b(MP|HP)\s*[\d,]+(?:\.\d+)?\s*%?\s*(?:소비|소모)/giu, '$1 <소모량> 소비');
const attackPattern = /([\d,]+(?:\.\d+)?)\s*%\s*의\s*데미지로/gu;
const finalPattern = /최종\s*데미지(?:가|를)?\s*([\d,]+(?:\.\d+)?)\s*%\s*증가/gu;

function milestone(description, level) {
  const cleaned = text(description)
    .replace(/\[\s*마스터\s*레벨\s*:?\s*\d+\s*\]/gu, '')
    // Prerequisites refer to another skill's level, not a HEXA milestone.
    // Remove only the prerequisite's own line; preserve later effect lines.
    .replace(/^[\t ]*필요[\t ]*스킬[\t ]*[:：][^\r\n]*/gmu, '');
  if (new RegExp(`(?:^|[^0-9])${level}\\s*레벨(?:[^0-9]|$)|레벨\\s*:?\\s*${level}(?:[^0-9]|$)`, 'u').test(cleaned)) return true;
  return [...cleaned.matchAll(/(?:\d+\s*(?:[,/·]\s*\d+\s*)+)레벨|레벨\s*:?\s*\d+(?:\s*[,/·]\s*\d+)+/gu)]
    .some(match => [...match[0].matchAll(/\d+/gu)].some(number => Number(number[0]) === level));
}

function effectRatio(current, next, enhancement) {
  if (!current || !next) return { reason: '현재 또는 다음 레벨 효과가 없습니다.' };
  if (/(?:^|[^\d])0\s*(?:번|회|타)(?:[^\d]|$)/u.test(`${current}\n${next}`)) return { reason: '공격 횟수가 0인 효과는 계산하지 않습니다.' };
  if (enhancement) {
    const a = [...current.matchAll(finalPattern)], b = [...next.matchAll(finalPattern)];
    if (a.length !== 1 || b.length !== 1 || compact(current.replace(finalPattern, '<최종 데미지>')) !== compact(next.replace(finalPattern, '<최종 데미지>'))) {
      return { reason: '강화 코어의 단일 최종 데미지 증가 효과만 계산합니다.' };
    }
    const remaining = current.replace(finalPattern, '').trim();
    if (/\d|%|패시브|버프|무적|행동\s*불가|회복|보호막|추가\s*공격|발동|지속\s*효과/u.test(remaining)) {
      return { reason: '강화 외에 다른 효과가 함께 있어 자동 계산하지 않습니다.' };
    }
    const before = numeric(a[0][1]), after = numeric(b[0][1]);
    if (before === null || after === null || before <= 0 || after <= 0) return { reason: '양수인 최종 데미지 효과가 필요합니다.' };
    const ratio = (100 + after) / (100 + before);
    return { minRatio: ratio, maxRatio: ratio };
  }

  // Fixed skill-specific critical/IED/boss modifiers may remain; changes in any
  // such modifier are still rejected by the exact non-damage text comparison.
  const inspect = `${current}\n${next}`
    .replace(/보스\s*몬스터\s*공격\s*시\s*데미지\s*[\d,.]+\s*%\s*증가/gu, '')
    .replace(/(?:추가\s*)?크리티컬\s*확률\s*[\d,.]+\s*%\s*(?:증가)?/gu, '')
    .replace(/몬스터\s*방어율\s*[\d,.]+\s*%\s*(?:추가\s*)?무시/gu, '');
  if (/패시브|지속\s*효과|최종\s*데미지|버프|회복|보호막|부활|공격력|마력|주스탯|다른\s*스킬|강화|증가|감소|확률/u.test(inspect)) {
    return { reason: '패시브·버프 또는 다른 효과가 함께 있어 자동 계산하지 않습니다.' };
  }
  const a = [...current.matchAll(attackPattern)], b = [...next.matchAll(attackPattern)];
  if (!a.length || a.length !== b.length) return { reason: '비교 가능한 직접 공격 데미지가 없습니다.' };
  // A remaining percentage may describe a separate, unscaled damage component.
  // Do not accidentally multiply that component by the parsed attack's ratio.
  if (/%|데미지|피해량/u.test(costless(inspect).replace(attackPattern, ''))) {
    return { reason: '공격 배율 외에 해석되지 않은 피해 효과가 있어 자동 계산하지 않습니다.' };
  }
  const skeleton = value => compact(costless(value).replace(attackPattern, '<공격 데미지>'));
  if (skeleton(current) !== skeleton(next)) return { reason: '데미지 외에 타수·주기·조건이 바뀌어 자동 계산하지 않습니다.' };
  const ratios = a.map((match, i) => {
    const before = numeric(match[1]), after = numeric(b[i][1]);
    return before !== null && after !== null && before > 0 && after > 0 ? after / before : null;
  });
  if (ratios.some(value => value === null || !Number.isFinite(value) || value <= 0)) return { reason: '양수인 공격 데미지 효과가 필요합니다.' };
  return { minRatio: Math.min(...ratios), maxRatio: Math.max(...ratios) };
}

export function buildHexaRows(hexa, skills) {
  const cores = Array.isArray(hexa?.character_hexa_core_equipment) ? hexa.character_hexa_core_equipment : [];
  const skillList = Array.isArray(skills?.character_skill) ? skills.character_skill : [];
  return cores.map((core, index) => {
    const name = text(core?.hexa_core_name) || `이름 없는 코어 ${index + 1}`;
    const level = numeric(core?.hexa_core_level), type = text(core?.hexa_core_type);
    const declared = (Array.isArray(core?.linked_skill) ? core.linked_skill : []).map(link => text(link?.hexa_skill_id)).filter(Boolean);
    const names = [...new Set(declared.length ? declared : [name])];
    const linkedNames = [...new Set(names.flatMap(value => [value, withoutEnhancement(value)]))];
    const row = { id: `hexa-${index}`, name, type, level, nextLevel: level === null ? null : Math.min(30, level + 1), linkedNames,
      effectNames: [], currentEffects: [], nextEffects: [], supported: false, reason: '', minRatio: null, maxRatio: null };
    const matches = names.map(value => skillList.filter(skill => key(skill?.skill_name) === key(value)));
    row.effectNames = matches.map((list, i) => list.length === 1 ? text(list[0].skill_name) : names[i]);
    row.currentEffects = matches.map(list => list.length === 1 ? text(list[0].skill_effect) : '');
    row.nextEffects = matches.map(list => list.length === 1 ? text(list[0].skill_effect_next) : '');
    const reject = reason => ({ ...row, reason });
    if (skills?.character_skill_grade !== undefined && String(skills.character_skill_grade) !== '6') return reject('6차 스킬 효과가 필요합니다.');
    if (level === null || !Number.isInteger(level) || level < 1 || level > 30) return reject('코어 레벨을 확인할 수 없습니다.');
    if (level >= 30) return reject('최대 30레벨입니다.');
    const eventLevel = numeric(core?.hexa_core_event_level ?? 0);
    if (eventLevel === null || eventLevel !== 0) return reject('이벤트 코어 레벨이 있어 효과를 자동 계산하지 않습니다.');
    if (!names.length || matches.some(list => list.length !== 1)) return reject('연결된 스킬 효과를 하나로 확인할 수 없습니다.');
    const matched = matches.map(list => list[0]);
    if (matched.some(skill => numeric(skill.skill_level) !== level)) return reject('연결된 스킬과 코어 레벨이 달라 자동 계산하지 않습니다.');
    if (matched.some(skill => milestone(skill.skill_description, level + 1) || milestone(skill.skill_effect_next, level + 1))) return reject('다음 레벨에 추가 효과가 있어 별도 검증이 필요합니다.');
    const ratios = matched.map(skill => effectRatio(text(skill.skill_effect), text(skill.skill_effect_next), /강화/u.test(type)));
    const failed = ratios.find(result => result.reason);
    if (failed) return reject(failed.reason);
    const minRatio = Math.min(...ratios.map(result => result.minRatio)), maxRatio = Math.max(...ratios.map(result => result.maxRatio));
    return { ...row, supported: true, reason: minRatio === maxRatio ? 'API의 다음 레벨 효과 비교' : '공격별 증가율 차이를 최소~최대 범위로 계산', minRatio, maxRatio };
  });
}

export function planHexa(rows, settings = {}, baselineScore = null) {
  const fail = message => ({ ok: false, message });
  if (!Array.isArray(rows) || !rows.length) return fail('조회한 HEXA 코어가 없습니다.');
  let totalShare = 0, coveredShare = 0, selectedCount = 0, minAddition = 0, maxAddition = 0;
  const ranking = [];
  for (const row of rows) {
    const setting = settings[row.id] ?? {};
    const share = numeric(setting.share === undefined ? 0 : setting.share);
    if (share === null || share < 0 || share > 100) return fail('각 코어의 점유율을 0~100% 숫자로 입력해주세요.');
    totalShare += share;
    if (!setting.enabled) continue;
    if (!row.supported || !Number.isFinite(row.minRatio) || !Number.isFinite(row.maxRatio) || row.minRatio <= 0 || row.maxRatio < row.minRatio) return fail(`${row.name}: 자동 계산이 지원되지 않는 코어입니다.`);
    selectedCount++;
    coveredShare += share;
    const minContribution = share / 100 * (row.minRatio - 1), maxContribution = share / 100 * (row.maxRatio - 1);
    minAddition += minContribution;
    maxAddition += maxContribution;
    ranking.push({ id: row.id, name: row.name, share, minContribution, maxContribution,
      minGainPercent: minContribution * 100, maxGainPercent: maxContribution * 100,
      minMultiplier: 1 + minContribution, maxMultiplier: 1 + maxContribution });
  }
  if (totalShare > 100 + 1e-9) return fail('코어 점유율 합계는 100% 이하여야 합니다. 중복된 스킬을 확인해주세요.');
  if (!selectedCount) return fail('비교할 코어를 선택해주세요.');
  if (coveredShare <= 0) return fail('선택한 코어의 현재 피해 점유율을 입력해주세요.');
  const score = baselineScore === null ? null : numeric(baselineScore);
  if (baselineScore !== null && (score === null || score < 0)) return fail('기준 점수를 확인해주세요.');
  const minMultiplier = 1 + minAddition, maxMultiplier = 1 + maxAddition;
  ranking.sort((a, b) => b.minContribution - a.minContribution || b.maxContribution - a.maxContribution);
  return { ok: true, message: '', minMultiplier, maxMultiplier, coveredShare, totalShare, selectedCount,
    minScore: score === null ? null : score * minMultiplier, maxScore: score === null ? null : score * maxMultiplier, ranking };
}

export function sharesFromPractice(rows, practice, liveClass) {
  const list = Array.isArray(rows) ? rows : [];
  const settings = Object.fromEntries(list.map(row => [row.id, { enabled: false, share: 0 }]));
  const warnings = [], incompatible = new Set();
  const finish = matchedShare => ({ settings, matchedShare, unmatchedShare: Math.max(0, 100 - matchedShare), warnings, incompatibleIds: [...incompatible] });
  const reject = message => { warnings.push(message); list.forEach(row => incompatible.add(row.id)); return finish(0); };
  const snapshot = practice?.characterInfo;
  if (!text(liveClass) || compact(snapshot?.basic_object?.character_class) !== compact(liveClass)) return reject('연무장 기록과 현재 캐릭터의 직업을 일치시킬 수 없습니다.');
  const total = numeric(practice?.result?.total_damage);
  const statistics = practice?.result?.skill_statistic;
  if (total === null || total <= 0 || !Array.isArray(statistics) || !statistics.length) return reject('연무장의 총 피해량 또는 스킬별 피해량이 없습니다.');
  const damages = statistics.map(stat => numeric(stat?.damage));
  const damageSum = damages.reduce((sum, damage) => sum + damage, 0);
  // API int64 damage values may exceed JavaScript's exact integer range.
  // Permit only the rounding error from parsing and adding those numbers.
  const roundingAllowance = Number.EPSILON * Math.max(total, damageSum, 1) * Math.max(4, damages.length);
  if (damages.some(damage => damage === null || damage < 0) || !Number.isFinite(damageSum) || damageSum - total > roundingAllowance) return reject('스킬 피해량 합계가 총 피해량과 맞지 않아 자동 적용하지 않습니다.');
  const snapshotCores = snapshot?.hexa_matrix_object?.hexa_core_object?.character_hexa_core_equipment;
  if (!Array.isArray(snapshotCores)) return reject('연무장 입장 당시의 HEXA 코어 정보가 없습니다.');
  const snapshotSkills = snapshot?.skill_object?.character_skill;
  if (!Array.isArray(snapshotSkills)) return reject('연무장 입장 당시의 스킬 효과 정보가 없어 현재 패치와 비교할 수 없습니다.');
  for (const row of list) {
    const candidates = snapshotCores.filter(core => key(core?.hexa_core_name) === key(row.name));
    if (candidates.length !== 1 || numeric(candidates[0].hexa_core_level) !== row.level ||
      (candidates[0].hexa_core_event_level !== undefined && numeric(candidates[0].hexa_core_event_level) !== 0) ||
      (text(candidates[0].hexa_core_type) && text(candidates[0].hexa_core_type) !== row.type)) {
      incompatible.add(row.id);
      warnings.push(`${row.name}: 연무장 당시와 현재 코어 레벨이 다르거나 확인되지 않아 제외했습니다.`);
      continue;
    }
    const effectNames = Array.isArray(row.effectNames) ? row.effectNames : [];
    const effectsMatch = effectNames.length > 0 && effectNames.length === row.currentEffects?.length && effectNames.every((name, i) => {
      const exact = snapshotSkills.filter(skill => compact(skill?.skill_name) === compact(name));
      const matching = exact.length ? exact : snapshotSkills.filter(skill => key(skill?.skill_name) === key(name));
      return matching.length === 1 && text(row.currentEffects[i]) && compact(matching[0].skill_effect) === compact(row.currentEffects[i]);
    });
    if (!effectsMatch) {
      incompatible.add(row.id);
      warnings.push(`${row.name}: 연무장 당시와 현재 스킬 효과가 다르거나 확인되지 않아 제외했습니다.`);
    }
  }
  const seenNames = new Set(), duplicateNames = new Set();
  statistics.forEach(stat => { const name = key(stat?.skill_name); if (seenNames.has(name)) duplicateNames.add(name); seenNames.add(name); });
  let matchedShare = 0;
  statistics.forEach((stat, i) => {
    const name = key(stat?.skill_name);
    if (!name || damages[i] <= 0) return;
    const matches = list.filter(row => row.linkedNames.some(link => key(link) === name));
    if (matches.length > 1 || duplicateNames.has(name)) {
      warnings.push(`${text(stat.skill_name)}: 중복 매칭되어 점유율에서 제외했습니다.`);
      return;
    }
    if (matches.length !== 1 || incompatible.has(matches[0].id)) return;
    const share = damages[i] / total * 100;
    settings[matches[0].id].share += share;
    matchedShare += share;
  });
  return finish(Math.min(100, matchedShare));
}
