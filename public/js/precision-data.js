// Build editable drafts from observed damage and official current skill text.
// Extracted options are never treated as verified: every row starts unconfirmed.
const text = value => typeof value === 'string' ? value.trim() : '';
const compact = value => text(value).replace(/\s+/gu, '');
const baseName = value => text(value).replace(/\s+강화$/u, '');
const nameKey = value => compact(baseName(value));
const number = value => {
  if ((typeof value !== 'number' && typeof value !== 'string') || (typeof value === 'string' && !value.trim())) return null;
  const result = Number(typeof value === 'string' ? value.replace(/,/g, '').trim() : value);
  return Number.isFinite(result) ? result : null;
};
const attackPattern = /([\d,]+(?:\.\d+)?)\s*%\s*의\s*데미지로/gu;
const blankOptions = () => ({ extraDamage: 0, extraBoss: 0, extraIED: 0, extraCritRate: 0, extraCritDamage: 0 });
const optionDefinitions = [
  { field: 'extraIED', label: '스킬 방어율 무시', max: 100,
    pattern: /(?:몬스터(?:의)?\s*)?방어율(?:을)?\s*([\d,]+(?:\.\d+)?)\s*%\s*(?:추가\s*)?무시/gu },
  { field: 'extraBoss', label: '스킬 보스 데미지',
    pattern: /보스\s*몬스터\s*(?:공격\s*시\s*)?데미지(?:가)?\s*([\d,]+(?:\.\d+)?)\s*%\s*증가/gu },
  { field: 'extraCritRate', label: '스킬 추가 크리티컬 확률', max: 100,
    pattern: /(?:추가\s*)?크리티컬\s*확률(?:이)?\s*([\d,]+(?:\.\d+)?)\s*%\s*(?:증가)?/gu },
  { field: 'extraCritDamage', label: '스킬 추가 크리티컬 데미지',
    pattern: /(?:추가\s*)?크리티컬\s*데미지(?:가)?\s*([\d,]+(?:\.\d+)?)\s*%\s*(?:증가)?/gu },
];

function optionDraft(effect) {
  const options = blankOptions(), notes = [];
  if (!effect) return { ...options, notes: ['공식 현재 스킬 효과를 연결하지 못했습니다. 옵션을 직접 확인해주세요.'] };
  const conditionText = effect.replace(optionDefinitions[1].pattern, '');
  const conditional = /패시브|지속\s*효과|버프|다른\s*스킬|동안|경우|확률로|상태에서|조건|누적|중첩|(?:적중|타격|발동|강화|사용|연계|해제)\s*시|(?:했을|할|일|하는|공격할|적중할)\s*때|(?:미만|초과|이하|이상)(?:인|일|이면)|(?:시전|키다운|차지|발동|공격)\s*중/u.test(conditionText);
  const attackValues = [...effect.matchAll(attackPattern)].map(match => number(match[1]));
  const mixed = new Set(attackValues).size > 1 || /(?:첫|두\s*번째|마지막|추가)\s*(?:공격|타격)(?:은|는|에만)|(?:일부|해당)\s*공격에만/u.test(effect);
  if (conditional || mixed) {
    notes.push(conditional ? '조건부·패시브 효과가 있어 옵션을 자동으로 채우지 않았습니다. 실제 적용 조건을 확인해주세요.'
      : '여러 공격의 효과가 섞여 있어 옵션을 자동으로 채우지 않았습니다. 공격별 적용 범위를 확인해주세요.');
    return { ...options, notes };
  }
  let extracted = false;
  for (const definition of optionDefinitions) {
    const matches = [...effect.matchAll(definition.pattern)];
    if (!matches.length) continue;
    if (matches.length !== 1) {
      notes.push(`${definition.label} 설명이 여러 번 나와 합산하지 않았습니다. 직접 확인해주세요.`);
      continue;
    }
    const match = matches[0], value = number(match[1]);
    if (value === null || value < 0 || (definition.max !== undefined && value > definition.max)) {
      notes.push(`${definition.label} 수치의 범위를 확인해주세요.`);
      continue;
    }
    const after = effect.slice(match.index + match[0].length), before = effect.slice(Math.max(0, match.index - 8), match.index);
    if (definition.field.startsWith('extraCrit') && (/^\s*감소/u.test(after) || /최종\s*$/u.test(before))) {
      notes.push(`${definition.label}이 가산 증가 효과가 아니어서 직접 확인해야 합니다.`);
      continue;
    }
    if (definition.field.startsWith('extraCrit') && !/추가|증가/u.test(match[0]) && !(definition.field === 'extraCritRate' && value === 100)) {
      notes.push(`${definition.label}이 가산 수치인지 확인되지 않아 0으로 두었습니다.`);
      continue;
    }
    options[definition.field] = value;
    extracted = true;
  }
  // Ordinary damage wording may describe a multiplier or another skill, so it
  // is not mapped to additive extraDamage even when the phrase looks simple.
  if (/데미지(?:가)?\s*[\d,.]+\s*%\s*증가/u.test(effect.replace(optionDefinitions[1].pattern, '').replace(optionDefinitions[3].pattern, ''))) {
    notes.push('일반·최종 데미지 증가 문구는 가산 여부를 자동 판단하지 않았습니다.');
  }
  notes.push(extracted ? '공식 효과에서 옮긴 초안입니다. 적용 범위를 확인한 뒤 직접 확인 완료로 표시해주세요.'
    : '0은 옵션이 없다는 확정값이 아닙니다. 스킬별 추가 옵션을 직접 확인해주세요.');
  return { ...options, notes };
}

function linkedEffect(name, skills) {
  const exact = skills.filter(skill => compact(skill?.skill_name) === compact(name));
  const candidates = exact.length ? exact : skills.filter(skill => nameKey(skill?.skill_name) === nameKey(name));
  if (candidates.length > 1) return { effect: '', notes: ['동일하거나 유사한 스킬 이름이 여러 개라 효과를 자동 연결하지 않았습니다.'] };
  return { effect: candidates.length === 1 ? text(candidates[0].skill_effect) : '', notes: [] };
}

function draftRow(id, name, share, skills, notes = []) {
  const linked = linkedEffect(name, skills), draft = optionDraft(linked.effect);
  return { id, name, share, confirmed: false, extraDamage: draft.extraDamage, extraBoss: draft.extraBoss,
    extraIED: draft.extraIED, extraCritRate: draft.extraCritRate, extraCritDamage: draft.extraCritDamage,
    effect: linked.effect, notes: [...notes, ...linked.notes, ...draft.notes] };
}

export function createPrecisionRows(character, practice = null) {
  if (practice !== null && practice !== undefined) {
    const source = 'practice', warnings = [];
    const invalid = message => ({ rows: [], warnings: [message], source, measuredShare: 0, error: message });
    const total = number(practice?.result?.total_damage), statistics = practice?.result?.skill_statistic;
    if (total === null || total <= 0 || !Array.isArray(statistics)) return invalid('연무장의 총 피해량 또는 스킬별 피해량이 없어 정밀 비교 초안을 만들 수 없습니다.');
    const damages = statistics.map(stat => number(stat?.damage));
    if (damages.some(damage => damage === null || damage < 0)) return invalid('연무장 스킬별 피해량에 올바르지 않은 값이 있어 정밀 비교 초안을 만들 수 없습니다.');
    const sum = damages.reduce((acc, damage) => acc + damage, 0);
    const tolerance = Number.EPSILON * Math.max(total, sum, 1) * Math.max(4, damages.length);
    if (!Number.isFinite(sum) || sum - total > tolerance) return invalid('연무장 스킬별 피해량 합계가 총 피해량을 초과합니다. 측정 데이터를 확인해주세요.');
    const skills = Array.isArray(practice?.characterInfo?.skill_object?.character_skill) ? practice.characterInfo.skill_object.character_skill : [];
    if (!skills.length) warnings.push('측정 당시의 공식 스킬 효과가 없어 추가 옵션을 직접 확인해야 합니다.');
    const names = statistics.map((stat, i) => text(stat?.skill_name) || `이름 없는 스킬 ${i + 1}`);
    const counts = new Map();
    names.forEach(name => counts.set(nameKey(name), (counts.get(nameKey(name)) || 0) + 1));
    const rows = statistics.map((stat, i) => {
      const notes = [];
      if (!text(stat?.skill_name)) notes.push('측정 기록에 스킬 이름이 없어 직접 구분해야 합니다.');
      if (counts.get(nameKey(names[i])) > 1) notes.push('같거나 유사한 이름의 피해 항목이 중복되어 있습니다. 각 항목을 구분하고 옵션을 확인해주세요.');
      const share = Math.min(100, damages[i] / total * 100);
      return draftRow(`precision-record-${i}-${encodeURIComponent(compact(names[i]))}`, names[i], share, skills, notes);
    });
    const measuredShare = Math.min(100, sum / total * 100);
    const remainder = Math.max(0, 100 - rows.reduce((share, row) => share + row.share, 0));
    // Preserve even tiny real gaps; only raw int64 rounding error may disappear.
    if (total - sum > tolerance && remainder > 0) {
      rows.push({ id: 'precision-unclassified', name: '구분되지 않은 피해', share: remainder, confirmed: false,
        ...blankOptions(), effect: '', notes: ['스킬별 기록 합계에 포함되지 않은 피해입니다. 다른 스킬로 분리하거나 실제 적용 옵션을 직접 확인해주세요.'] });
      warnings.push(`스킬별로 구분되지 않은 피해 ${remainder}%를 별도 행으로 남겼습니다.`);
    }
    return { rows, warnings, source, measuredShare };
  }

  const warnings = [], source = 'manual';
  const grade = character?.skills?.character_skill_grade;
  const skills = (grade === undefined || String(grade) === '6') && Array.isArray(character?.skills?.character_skill) ? character.skills.character_skill : [];
  if (grade !== undefined && String(grade) !== '6') warnings.push('6차 스킬 정보가 아니어서 자동 효과 연결에 사용하지 않았습니다.');
  const candidates = [];
  for (const skill of skills) if ([...text(skill?.skill_effect).matchAll(attackPattern)].length) candidates.push(baseName(skill.skill_name));
  const cores = Array.isArray(character?.hexa?.character_hexa_core_equipment) ? character.hexa.character_hexa_core_equipment : [];
  for (const core of cores) {
    const linked = (Array.isArray(core?.linked_skill) ? core.linked_skill : []).map(link => text(link?.hexa_skill_id)).filter(Boolean);
    for (const name of linked.length ? linked : [text(core?.hexa_core_name)]) if (name) candidates.push(baseName(name));
  }
  const unique = new Map();
  candidates.filter(Boolean).forEach(name => { if (!unique.has(nameKey(name))) unique.set(nameKey(name), name); });
  const rows = [...unique].map(([key, name]) => draftRow(`precision-skill-${encodeURIComponent(key)}`, name, 0, skills));
  if (!rows.length) warnings.push('연결할 공격 스킬 정보가 없습니다. 스킬과 점유율을 직접 추가해주세요.');
  return { rows, warnings, source, measuredShare: 0 };
}
