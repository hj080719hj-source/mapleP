import test from 'node:test';
import assert from 'node:assert/strict';
import { checkPrecisionContext } from '../public/js/precision-context.js';

const skill = (name = '직접 공격', skillLevel = 10, effect = '1000%의 데미지로 6번 공격') => ({ skill_name: name, skill_level: skillLevel, skill_effect: effect, skill_description: '공격 설명' });
const core = (name = '공격 코어', coreLevel = 10, links = ['직접 공격']) => ({ hexa_core_name: name, hexa_core_level: coreLevel, hexa_core_event_level: 0,
  hexa_core_type: '마스터리 코어', linked_skill: links.map(hexa_skill_id => ({ hexa_skill_id })) });
const fixture = () => {
  const character = { basic: { character_class: '루미너스', character_name: '테스트', character_level: 291 },
    skills: { character_skill_grade: '6', character_skill: [skill()] }, hexa: { character_hexa_core_equipment: [core()] } };
  const practice = { result: { skill_statistic: [{ skill_name: '직접 공격', damage: 1000 }] }, characterInfo: {
    basic_object: { ...character.basic }, skill_object: { character_skill: structuredClone(character.skills.character_skill) },
    hexa_matrix_object: { hexa_core_object: { character_hexa_core_equipment: structuredClone(character.hexa.character_hexa_core_equipment) } } } };
  return { character, practice };
};
const snapshotCores = practice => practice.characterInfo.hexa_matrix_object.hexa_core_object.character_hexa_core_equipment;
const hasCode = (result, code, kind = 'incompatible') => result[kind].some(issue => issue.code === code);

test('완전히 확인된 같은 정보는 현재 호환이며 입력을 변경하지 않는다', () => {
  const { character, practice } = fixture();
  const before = JSON.stringify({ character, practice });
  const result = checkPrecisionContext(character, practice);
  assert.equal(result.ok, true);
  assert.equal(result.historicalAllowed, true);
  assert.equal(result.currentCompatibility, 'compatible');
  assert.equal(result.currentCompatible, true);
  assert.equal(result.knownIncompatible, false);
  assert.deepEqual(result.warnings, []);
  assert.equal(result.skillChecks[0].status, 'compatible');
  assert.equal(result.hexaChecks[0].status, 'compatible');
  assert.equal(JSON.stringify({ character, practice }), before);
});

test('다른 직업은 과거 고정 비교도 차단하고 직업 누락은 불확실성으로 구분한다', () => {
  const { character, practice } = fixture();
  character.basic.character_class = '비숍';
  const changed = checkPrecisionContext(character, practice);
  assert.equal(changed.ok, false);
  assert.equal(changed.knownIncompatible, true);
  assert.equal(hasCode(changed, 'CLASS_CHANGED'), true);
  delete character.basic.character_class;
  const missing = checkPrecisionContext(character, practice);
  assert.equal(missing.ok, false);
  assert.equal(missing.currentCompatible, null);
  assert.equal(missing.knownIncompatible, false);
  assert.equal(hasCode(missing, 'CLASS_MISSING', 'unverified'), true);
});

test('현재 스킬 레벨과 효과가 바뀌어도 과거 스킬 고정 모드는 허용한다', () => {
  const { character, practice } = fixture();
  character.skills.character_skill[0].skill_level = 11;
  character.skills.character_skill[0].skill_effect = '1100%의 데미지로 6번 공격';
  const result = checkPrecisionContext(character, practice);
  assert.equal(result.ok, true);
  assert.equal(result.currentCompatible, false);
  assert.equal(result.currentCompatibility, 'incompatible');
  assert.equal(result.knownIncompatible, true);
  assert.equal(hasCode(result, 'SKILL_LEVEL_CHANGED'), true);
  assert.equal(hasCode(result, 'SKILL_EFFECT_CHANGED'), true);
});

test('직접 피해가 없는 6차 패시브·설명 변경도 확인한다', () => {
  const { character, practice } = fixture();
  character.skills.character_skill.push(skill('패시브', 1, '다른 스킬 데미지 20% 증가'));
  practice.characterInfo.skill_object.character_skill.push(skill('패시브', 1, '다른 스킬 데미지 10% 증가'));
  character.skills.character_skill[0].skill_description = '보스에게만 적용되는 새 조건';
  const result = checkPrecisionContext(character, practice);
  assert.equal(result.knownIncompatible, true);
  assert.equal(result.skillChecks.find(check => check.name === '패시브').measured, false);
  assert.equal(hasCode(result, 'SKILL_EFFECT_CHANGED'), true);
  assert.equal(hasCode(result, 'SKILL_DESCRIPTION_CHANGED'), true);
});

test('5차 본체 스킬과 HEXA 강화 스킬을 레벨 별칭으로 오인하지 않는다', () => {
  const { character, practice } = fixture();
  character.skills.character_skill = [skill('진리의 문 강화', 10, '진리의 문의 최종 데미지 25% 증가')];
  practice.characterInfo.skill_object.character_skill = [skill('진리의 문', 30), structuredClone(character.skills.character_skill[0])];
  practice.result.skill_statistic = [{ skill_name: '진리의 문', damage: 1000 }];
  const result = checkPrecisionContext(character, practice);
  assert.equal(result.ok, true);
  assert.equal(result.knownIncompatible, false);
  assert.equal(result.currentCompatibility, 'unverified');
  assert.equal(result.skillChecks.find(check => check.name === '진리의 문').status, 'unverified');
  assert.equal(result.skillChecks.find(check => check.name === '진리의 문 강화').status, 'compatible');
  assert.equal(hasCode(result, 'SKILL_LEVEL_CHANGED'), false);
});

test('현재 6차 조회 범위 밖의 과거 패시브는 알려진 불일치로 처리하지 않는다', () => {
  const { character, practice } = fixture();
  practice.characterInfo.skill_object.character_skill.push(skill('4차 패시브', 30, '최종 데미지 10% 증가'));
  const result = checkPrecisionContext(character, practice);
  assert.equal(result.currentCompatible, null);
  assert.equal(result.knownIncompatible, false);
  assert.equal(hasCode(result, 'OTHER_SKILLS_OUTSIDE_CURRENT_SCOPE', 'unverified'), true);
});

test('0 피해 스킬은 측정 사용 스킬로 검증하지 않는다', () => {
  const { character, practice } = fixture();
  practice.result.skill_statistic.push({ skill_name: '기록에만 있는 5차', damage: 0 });
  const result = checkPrecisionContext(character, practice);
  assert.equal(result.currentCompatible, true);
  assert.equal(result.skillChecks.some(check => check.name === '기록에만 있는 5차'), false);
});

test('전체 코어의 추가·삭제와 비공격 코어 레벨 변경을 찾는다', () => {
  const { character, practice } = fixture();
  character.hexa.character_hexa_core_equipment.push(core('새 코어', 1));
  snapshotCores(practice).push(core('삭제된 코어', 1));
  character.hexa.character_hexa_core_equipment.push(core('공통 버프', 12));
  snapshotCores(practice).push(core('공통 버프', 11));
  const result = checkPrecisionContext(character, practice);
  assert.equal(hasCode(result, 'HEXA_ADDED'), true);
  assert.equal(hasCode(result, 'HEXA_REMOVED'), true);
  assert.equal(hasCode(result, 'HEXA_LEVEL_CHANGED'), true);
  assert.equal(result.ok, true);
});

test('명시적인 이벤트 레벨 차이만 불일치로 판정하고 누락은 0으로 추정하지 않는다', () => {
  const { character, practice } = fixture();
  character.hexa.character_hexa_core_equipment[0].hexa_core_event_level = 3;
  assert.equal(hasCode(checkPrecisionContext(character, practice), 'HEXA_EVENT_CHANGED'), true);
  delete snapshotCores(practice)[0].hexa_core_event_level;
  let result = checkPrecisionContext(character, practice);
  assert.equal(hasCode(result, 'HEXA_EVENT_CHANGED'), false);
  assert.equal(hasCode(result, 'HEXA_EVENT_UNVERIFIED', 'unverified'), true);
  assert.equal(result.knownIncompatible, false);
  character.hexa.character_hexa_core_equipment[0].hexa_core_event_level = 0;
  assert.equal(checkPrecisionContext(character, practice).currentCompatible, null);
  delete character.hexa.character_hexa_core_equipment[0].hexa_core_event_level;
  result = checkPrecisionContext(character, practice);
  assert.equal(result.knownIncompatible, false);
  assert.equal(result.currentCompatible, null);
});

test('연결 스킬 순서는 무시하지만 실제 구성과 코어 타입 변화는 찾는다', () => {
  const { character, practice } = fixture();
  character.hexa.character_hexa_core_equipment[0] = core('공격 코어', 10, ['직접 공격', '다른 공격']);
  snapshotCores(practice)[0] = core('공격 코어', 10, ['다른 공격', '직접 공격']);
  assert.equal(checkPrecisionContext(character, practice).currentCompatible, true);
  character.hexa.character_hexa_core_equipment[0].linked_skill[1].hexa_skill_id = '추가 공격';
  character.hexa.character_hexa_core_equipment[0].hexa_core_type = '스킬 코어';
  const result = checkPrecisionContext(character, practice);
  assert.equal(hasCode(result, 'HEXA_LINKS_CHANGED'), true);
  assert.equal(hasCode(result, 'HEXA_TYPE_CHANGED'), true);
});

test('중복 정규화 이름과 누락된 메타데이터는 임의 연결하지 않는다', () => {
  const { character, practice } = fixture();
  practice.characterInfo.skill_object.character_skill.push(skill('직접공격'));
  snapshotCores(practice)[0].linked_skill.push({ hexa_skill_id: '직접공격' });
  const result = checkPrecisionContext(character, practice);
  assert.equal(result.knownIncompatible, false);
  assert.equal(hasCode(result, 'SKILL_NAME_AMBIGUOUS', 'unverified'), true);
  assert.equal(hasCode(result, 'HEXA_LINKS_UNVERIFIED', 'unverified'), true);
});

test('공백 차이는 허용하고 모르는 레벨과 효과는 변경으로 단정하지 않는다', () => {
  const { character, practice } = fixture();
  character.skills.character_skill[0].skill_effect = '1000%의데미지로\n6번 공격';
  assert.equal(checkPrecisionContext(character, practice).currentCompatible, true);
  delete character.skills.character_skill[0].skill_level;
  delete snapshotCores(practice)[0].hexa_core_type;
  const result = checkPrecisionContext(character, practice);
  assert.equal(result.knownIncompatible, false);
  assert.equal(hasCode(result, 'SKILL_LEVEL_MISSING', 'unverified'), true);
  assert.equal(hasCode(result, 'HEXA_TYPE_MISSING', 'unverified'), true);
});

test('목록 누락은 코어 전체 삭제로 오인하지 않고 명시적 빈 목록과 구분한다', () => {
  const { character, practice } = fixture();
  delete character.hexa;
  const missing = checkPrecisionContext(character, practice);
  assert.equal(missing.knownIncompatible, false);
  assert.equal(hasCode(missing, 'HEXA_COLLECTION_MISSING', 'unverified'), true);
  character.hexa = { character_hexa_core_equipment: [] };
  assert.equal(hasCode(checkPrecisionContext(character, practice), 'HEXA_REMOVED'), true);
});

test('이름이 없는 코어를 상대편 코어의 추가·삭제로 단정하지 않는다', () => {
  const { character, practice } = fixture();
  delete snapshotCores(practice)[0].hexa_core_name;
  const result = checkPrecisionContext(character, practice);
  assert.equal(result.knownIncompatible, false);
  assert.equal(hasCode(result, 'HEXA_IDENTITY_UNVERIFIED', 'unverified'), true);
  assert.equal(hasCode(result, 'HEXA_ADDED'), false);
  snapshotCores(practice)[0].hexa_core_name = '공격 코어';
  delete character.hexa.character_hexa_core_equipment[0].hexa_core_name;
  assert.equal(checkPrecisionContext(character, practice).knownIncompatible, false);
});

test('캐릭터 레벨 변화는 현재 조건 변경이며 이름 변경은 확인 필요로 남긴다', () => {
  const { character, practice } = fixture();
  character.basic.character_level++;
  character.basic.character_name = '변경된 이름';
  const result = checkPrecisionContext(character, practice);
  assert.equal(result.ok, true);
  assert.equal(hasCode(result, 'CHARACTER_LEVEL_CHANGED'), true);
  assert.equal(hasCode(result, 'CHARACTER_NAME_UNVERIFIED', 'unverified'), true);
});

test('잘못된 grade나 수치·빈 이름도 알려진 변경으로 만들어내지 않는다', () => {
  const { character, practice } = fixture();
  character.skills.character_skill_grade = '5';
  practice.result.skill_statistic.push({ skill_name: '', damage: 1 });
  snapshotCores(practice)[0].hexa_core_level = '';
  const result = checkPrecisionContext(character, practice);
  assert.equal(result.knownIncompatible, false);
  assert.equal(hasCode(result, 'CURRENT_SKILLS_MISSING', 'unverified'), true);
  assert.equal(hasCode(result, 'MEASURED_SKILL_INVALID', 'unverified'), true);
  assert.equal(hasCode(result, 'HEXA_LEVEL_MISSING', 'unverified'), true);
});
