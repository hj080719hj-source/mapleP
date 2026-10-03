// Separate a hypothetical comparison with recorded skills held fixed from a
// claim that those recorded skills are still the character's current skills.
const text = value => typeof value === 'string' ? value.trim() : '';
const key = value => text(value).replace(/\s+/gu, '');
const level = value => {
  if ((typeof value !== 'number' && typeof value !== 'string') || (typeof value === 'string' && !value.trim())) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
};
const damage = value => {
  if ((typeof value !== 'number' && typeof value !== 'string') || (typeof value === 'string' && !value.trim())) return null;
  const parsed = Number(typeof value === 'string' ? value.replace(/,/g, '') : value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};
function groupByName(items, field) {
  const groups = new Map();
  for (const item of items || []) {
    const name = key(item?.[field]);
    if (!name) continue;
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(item);
  }
  return groups;
}
function linkSet(core) {
  if (!Array.isArray(core?.linked_skill)) return null;
  const names = core.linked_skill.map(link => key(link?.hexa_skill_id));
  if (names.some(name => !name) || new Set(names).size !== names.length) return null;
  return names.sort();
}
const equalSets = (left, right) => left.length === right.length && left.every((value, i) => value === right[i]);

export function checkPrecisionContext(character, practice) {
  const incompatible = [], unverified = [], skillChecks = [], hexaChecks = [], issueKeys = new Set();
  const add = (kind, scope, code, name, message, before, after) => {
    const id = `${kind}\u0000${scope}\u0000${code}\u0000${name}`;
    if (issueKeys.has(id)) return;
    issueKeys.add(id);
    const issue = { scope, code, name, message };
    if (before !== undefined) issue.before = before;
    if (after !== undefined) issue.after = after;
    (kind === 'incompatible' ? incompatible : unverified).push(issue);
  };
  const checkStatus = issues => issues.some(issue => incompatible.includes(issue)) ? 'incompatible' : issues.length ? 'unverified' : 'compatible';
  const finish = (ok, message) => {
    const currentCompatibility = incompatible.length ? 'incompatible' : unverified.length ? 'unverified' : 'compatible';
    return { ok, message, currentCompatibility, currentCompatible: currentCompatibility === 'unverified' ? null : currentCompatibility === 'compatible',
      knownIncompatible: incompatible.length > 0, historicalAllowed: ok,
      warnings: [...new Set([...incompatible, ...unverified].map(issue => issue.message))],
      incompatible, unverified, skillChecks, hexaChecks };
  };

  const snapshot = practice?.characterInfo;
  const currentClass = text(character?.basic?.character_class), recordedClass = text(snapshot?.basic_object?.character_class);
  if (!currentClass || !recordedClass) {
    const message = '현재와 측정 당시의 직업 정보가 없어 같은 직업의 비교인지 확인할 수 없습니다.';
    add('unverified', 'identity', 'CLASS_MISSING', '직업', message, recordedClass || null, currentClass || null);
    return finish(false, message);
  }
  if (key(currentClass) !== key(recordedClass)) {
    const message = `현재 직업(${currentClass})과 측정 당시 직업(${recordedClass})이 다릅니다. 같은 직업의 기록을 사용해주세요.`;
    add('incompatible', 'identity', 'CLASS_CHANGED', '직업', message, recordedClass, currentClass);
    return finish(false, message);
  }
  const currentName = text(character?.basic?.character_name), recordedName = text(snapshot?.basic_object?.character_name);
  if (currentName && recordedName && key(currentName) !== key(recordedName)) add('unverified', 'identity', 'CHARACTER_NAME_UNVERIFIED', '캐릭터',
    '현재와 기록의 캐릭터 이름이 다릅니다. 이름 변경 또는 동일 캐릭터의 기록인지 확인해주세요.', recordedName, currentName);
  const currentCharacterLevel = level(character?.basic?.character_level), recordedCharacterLevel = level(snapshot?.basic_object?.character_level);
  if (currentCharacterLevel !== null && recordedCharacterLevel !== null && currentCharacterLevel !== recordedCharacterLevel) add('incompatible', 'identity', 'CHARACTER_LEVEL_CHANGED', '캐릭터 레벨',
    '캐릭터 레벨이 측정 당시와 다릅니다. 현재 레벨의 피해 보정은 과거 고정 조건 비교에 자동 반영되지 않습니다.', recordedCharacterLevel, currentCharacterLevel);

  const grade = character?.skills?.character_skill_grade;
  const liveSkills = (grade === undefined || String(grade) === '6') && Array.isArray(character?.skills?.character_skill) ? character.skills.character_skill : null;
  const recordedSkills = Array.isArray(snapshot?.skill_object?.character_skill) ? snapshot.skill_object.character_skill : null;
  if (!liveSkills) add('unverified', 'skill', 'CURRENT_SKILLS_MISSING', '현재 6차 스킬', '현재 6차 스킬 목록이 없어 기록 당시의 효과와 비교하지 못했습니다.');
  if (!recordedSkills) add('unverified', 'skill', 'RECORDED_SKILLS_MISSING', '기록 스킬', '측정 당시의 스킬 목록이 없어 현재 효과와 비교하지 못했습니다.');
  const liveByName = groupByName(liveSkills, 'skill_name'), recordedByName = groupByName(recordedSkills, 'skill_name');
  const measuredNames = new Map(), statistics = practice?.result?.skill_statistic;
  if (!Array.isArray(statistics)) add('unverified', 'measurement', 'MEASURED_SKILLS_MISSING', '측정 스킬', '스킬별 측정 피해량이 없어 실제 사용한 스킬의 호환성을 확인하지 못했습니다.');
  else for (const statistic of statistics) {
    const value = damage(statistic?.damage), name = text(statistic?.skill_name);
    if (value === null || (value > 0 && !name)) {
      add('unverified', 'measurement', 'MEASURED_SKILL_INVALID', name || '이름 없는 측정 스킬', '측정 스킬의 이름 또는 피해량을 확인할 수 없습니다.');
      continue;
    }
    if (value > 0 && !measuredNames.has(key(name))) measuredNames.set(key(name), name);
  }
  const toCheck = new Map(measuredNames);
  for (const [id, entries] of liveByName) if (!toCheck.has(id)) toCheck.set(id, text(entries[0].skill_name));
  for (const [id, name] of toCheck) {
    const startIncompatible = incompatible.length, startUnverified = unverified.length;
    const current = liveByName.get(id) || [], recorded = recordedByName.get(id) || [];
    const isMeasured = measuredNames.has(id);
    const beforeLevel = recorded.length === 1 ? level(recorded[0].skill_level) : null;
    const afterLevel = current.length === 1 ? level(current[0].skill_level) : null;
    // A 5th-job skill and its HEXA enhancement have different level axes. Do not
    // alias "진리의 문" (V skill) to "진리의 문 강화" (HEXA enhancement).
    if (current.length > 1 || recorded.length > 1) add('unverified', 'skill', 'SKILL_NAME_AMBIGUOUS', name,
      `${name}: 같은 이름의 스킬 정보가 여러 개라 현재와 기록을 하나로 연결할 수 없습니다.`);
    else if (!current.length || !recorded.length) add('unverified', 'skill', !current.length ? 'SKILL_OUTSIDE_CURRENT_SCOPE' : 'SKILL_MISSING_IN_RECORD', name,
      !current.length ? `${name}: 현재 조회는 6차 스킬만 제공하여 이 측정 스킬의 현재 효과를 검증하지 못했습니다.`
        : `${name}: 기록에 같은 이름의 스킬이 없어 현재와의 변경 여부를 확인하지 못했습니다.`);
    else {
      if (beforeLevel === null || afterLevel === null) add('unverified', 'skill', 'SKILL_LEVEL_MISSING', name,
        `${name}: 스킬 레벨 정보가 부족하여 현재와 기록을 비교하지 못했습니다.`, beforeLevel, afterLevel);
      else if (beforeLevel !== afterLevel) add('incompatible', 'skill', 'SKILL_LEVEL_CHANGED', name,
        `${name}: 스킬 레벨이 측정 당시 ${beforeLevel}에서 현재 ${afterLevel}로 달라졌습니다.`, beforeLevel, afterLevel);
      const beforeEffect = text(recorded[0].skill_effect), afterEffect = text(current[0].skill_effect);
      if (!beforeEffect || !afterEffect) add('unverified', 'skill', 'SKILL_EFFECT_MISSING', name,
        `${name}: 현재 또는 기록의 스킬 효과가 없어 패치·효과 변경 여부를 확인하지 못했습니다.`);
      else if (key(beforeEffect) !== key(afterEffect)) add('incompatible', 'skill', 'SKILL_EFFECT_CHANGED', name,
        `${name}: 현재 스킬 효과가 측정 당시와 다릅니다.`, beforeEffect, afterEffect);
      const beforeDescription = text(recorded[0].skill_description), afterDescription = text(current[0].skill_description);
      if (beforeDescription && afterDescription && key(beforeDescription) !== key(afterDescription)) add('incompatible', 'skill', 'SKILL_DESCRIPTION_CHANGED', name,
        `${name}: 스킬 설명 또는 적용 조건이 측정 당시와 다릅니다.`, beforeDescription, afterDescription);
    }
    const issues = [...incompatible.slice(startIncompatible), ...unverified.slice(startUnverified)];
    skillChecks.push({ name, measured: isMeasured, status: checkStatus(issues), beforeLevel, afterLevel, codes: issues.map(issue => issue.code) });
  }
  const outsideMeasured = [...recordedByName].filter(([id]) => !liveByName.has(id) && !measuredNames.has(id)).map(([, entries]) => text(entries[0].skill_name));
  if (outsideMeasured.length) add('unverified', 'skill', 'OTHER_SKILLS_OUTSIDE_CURRENT_SCOPE', '6차 이전·기타 스킬',
    `기록의 다른 스킬 ${outsideMeasured.length}개는 현재 6차 조회에 없어 패시브·간접 효과의 변경 여부를 검증하지 못했습니다.`, outsideMeasured);
  if ((liveSkills || []).some(skill => !text(skill?.skill_name)) || (recordedSkills || []).some(skill => !text(skill?.skill_name))) add('unverified', 'skill', 'SKILL_NAME_MISSING', '스킬 이름', '스킬 목록에 이름이 없는 항목이 있어 전체 효과 비교를 완료하지 못했습니다.');

  const currentCores = Array.isArray(character?.hexa?.character_hexa_core_equipment) ? character.hexa.character_hexa_core_equipment : null;
  const recordedCoresValue = snapshot?.hexa_matrix_object?.hexa_core_object?.character_hexa_core_equipment;
  const recordedCores = Array.isArray(recordedCoresValue) ? recordedCoresValue : null;
  if (!currentCores || !recordedCores) add('unverified', 'hexa', 'HEXA_COLLECTION_MISSING', 'HEXA 코어 목록',
    '현재 또는 측정 당시의 HEXA 코어 목록이 없어 전체 코어 구성·패시브 변경을 확인하지 못했습니다.');
  else {
    const currentByName = groupByName(currentCores, 'hexa_core_name'), beforeByName = groupByName(recordedCores, 'hexa_core_name');
    const currentNamesComplete = currentCores.every(core => text(core?.hexa_core_name)), recordedNamesComplete = recordedCores.every(core => text(core?.hexa_core_name));
    if (!currentNamesComplete || !recordedNamesComplete) add('unverified', 'hexa', 'HEXA_NAME_MISSING', 'HEXA 코어 이름', 'HEXA 목록에 이름이 없는 코어가 있어 전체 코어 구성을 확인하지 못했습니다.');
    for (const id of new Set([...currentByName.keys(), ...beforeByName.keys()])) {
      const startIncompatible = incompatible.length, startUnverified = unverified.length;
      const current = currentByName.get(id) || [], recorded = beforeByName.get(id) || [];
      const name = text(current[0]?.hexa_core_name) || text(recorded[0]?.hexa_core_name);
      const beforeLevel = recorded.length === 1 ? level(recorded[0].hexa_core_level) : null;
      const afterLevel = current.length === 1 ? level(current[0].hexa_core_level) : null;
      if (current.length > 1 || recorded.length > 1) add('unverified', 'hexa', 'HEXA_NAME_AMBIGUOUS', name,
        `${name}: 같은 이름의 코어가 여러 개라 구성을 확정할 수 없습니다.`);
      else if ((!current.length && !currentNamesComplete) || (!recorded.length && !recordedNamesComplete)) add('unverified', 'hexa', 'HEXA_IDENTITY_UNVERIFIED', name,
        `${name}: 비교할 목록에 이름이 없는 코어가 있어 추가·삭제 여부를 단정할 수 없습니다.`);
      else if (!current.length || !recorded.length) add('incompatible', 'hexa', current.length ? 'HEXA_ADDED' : 'HEXA_REMOVED', name,
        current.length ? `${name}: 측정 당시에는 없던 HEXA 코어가 현재 목록에 있습니다.` : `${name}: 측정 당시의 HEXA 코어가 현재 목록에 없습니다.`,
        recorded.length > 0, current.length > 0);
      else {
        if (beforeLevel === null || afterLevel === null) add('unverified', 'hexa', 'HEXA_LEVEL_MISSING', name,
          `${name}: 코어 레벨을 확인할 수 없습니다.`, beforeLevel, afterLevel);
        else if (beforeLevel !== afterLevel) add('incompatible', 'hexa', 'HEXA_LEVEL_CHANGED', name,
          `${name}: HEXA 코어 레벨이 측정 당시 ${beforeLevel}에서 현재 ${afterLevel}로 달라졌습니다.`, beforeLevel, afterLevel);
        const beforeEvent = level(recorded[0].hexa_core_event_level), afterEvent = level(current[0].hexa_core_event_level);
        if (beforeEvent === null || afterEvent === null) add('unverified', 'hexa', 'HEXA_EVENT_UNVERIFIED', name,
          `${name}: 현재 또는 기록의 이벤트 코어 레벨이 제공되지 않아 일치 여부를 확인할 수 없습니다.`, beforeEvent, afterEvent);
        else if (beforeEvent !== afterEvent) add('incompatible', 'hexa', 'HEXA_EVENT_CHANGED', name,
          `${name}: 이벤트 코어 레벨이 측정 당시와 다릅니다.`, beforeEvent, afterEvent);
        const beforeType = text(recorded[0].hexa_core_type), afterType = text(current[0].hexa_core_type);
        if (!beforeType || !afterType) add('unverified', 'hexa', 'HEXA_TYPE_MISSING', name, `${name}: 코어 타입이 제공되지 않아 확인할 수 없습니다.`);
        else if (key(beforeType) !== key(afterType)) add('incompatible', 'hexa', 'HEXA_TYPE_CHANGED', name, `${name}: 코어 타입이 측정 당시와 다릅니다.`, beforeType, afterType);
        const beforeLinks = linkSet(recorded[0]), afterLinks = linkSet(current[0]);
        if (!beforeLinks || !afterLinks) add('unverified', 'hexa', 'HEXA_LINKS_UNVERIFIED', name, `${name}: 연결 스킬 목록이 누락되었거나 중복되어 구성을 확인할 수 없습니다.`);
        else if (!equalSets(beforeLinks, afterLinks)) add('incompatible', 'hexa', 'HEXA_LINKS_CHANGED', name,
          `${name}: 코어에 연결된 스킬 구성이 측정 당시와 다릅니다.`, beforeLinks, afterLinks);
      }
      const issues = [...incompatible.slice(startIncompatible), ...unverified.slice(startUnverified)];
      hexaChecks.push({ name, status: checkStatus(issues), beforeLevel, afterLevel, codes: issues.map(issue => issue.code) });
    }
  }
  const message = incompatible.length ? '현재 스킬·코어에 확인된 변경이 있습니다. 기록 당시 스킬을 고정한 가상 스탯 비교만 가능합니다.'
    : unverified.length ? '확인된 변경은 없지만 현재와 기록의 모든 스킬·코어가 일치하는지는 검증되지 않았습니다.'
      : '조회 가능한 현재 스킬·코어가 측정 당시 정보와 일치합니다.';
  return finish(true, message);
}
