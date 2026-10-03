import test from 'node:test';
import assert from 'node:assert/strict';
import { buildHexaRows, planHexa, sharesFromPractice } from '../public/js/hexa-model.js';

const core = (name = '직접 공격', level = 10, type = '스킬 코어', linked = [name]) => ({ hexa_core_name: name, hexa_core_level: level, hexa_core_type: type, hexa_core_event_level: 0, linked_skill: linked.map(hexa_skill_id => ({ hexa_skill_id })) });
const skill = (name = '직접 공격', level = 10, current = 'MP 100 소비, 1000%의 데미지로 6번 공격', next = 'MP 101 소비, 1100%의 데미지로 6번 공격', description = '[마스터 레벨 : 30]') => ({ skill_name: name, skill_level: level, skill_effect: current, skill_effect_next: next, skill_description: description });
const build = (cores = [core()], skills = [skill()]) => buildHexaRows({ character_hexa_core_equipment: cores }, { character_skill: skills });
const approximately = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} != ${expected}`);
const record = (cores, statistics, total = 1000, characterClass = '루미너스') => ({ result: { total_damage: total, skill_statistic: statistics }, characterInfo: {
  basic_object: { character_class: characterClass }, hexa_matrix_object: { hexa_core_object: { character_hexa_core_equipment: cores } },
  skill_object: { character_skill: cores.flatMap(c => c.linked_skill.map(link => /강화/u.test(c.hexa_core_type)
    ? skill(link.hexa_skill_id, c.hexa_core_level, '진리의 문의 최종 데미지 25% 증가', '진리의 문의 최종 데미지 26% 증가')
    : skill(link.hexa_skill_id, c.hexa_core_level))) },
} });

test('HEXA 강화의 기존 최종 데미지를 다시 곱하지 않는다', () => {
  const [row] = build([core('진리의 문 강화', 10, '강화 코어')], [skill('진리의 문 강화', 10, '진리의 문의 최종 데미지 25% 증가', '진리의 문의 최종 데미지 26% 증가')]);
  assert.equal(row.supported, true);
  approximately(row.minRatio, 1.26 / 1.25);
  assert.ok(row.linkedNames.includes('진리의 문'));
});

test('MP 소모 변화만 허용하고 공격 피해 비율을 사용한다', () => {
  const [row] = build();
  assert.equal(row.supported, true);
  approximately(row.minRatio, 1.1);
  assert.equal(row.maxRatio, row.minRatio);
});

test('고정된 스킬 방무·보공·크리티컬은 재적용하지 않는다', () => {
  const extra = '\n몬스터 방어율 60% 추가 무시, 보스 몬스터 공격 시 데미지 40% 증가, 크리티컬 확률 100%';
  const [row] = build(undefined, [skill('직접 공격', 10, '2000%의 데미지로 13번 공격' + extra, '2100%의 데미지로 13번 공격' + extra)]);
  assert.equal(row.supported, true);
  approximately(row.minRatio, 1.05);
});

test('여러 공격의 증가율이 다르면 임의 평균 대신 최소~최대를 반환한다', () => {
  const [row] = build([core('앱솔루트 스페이스', 18)], [skill('앱솔루트 스페이스', 18,
    'MP 200 소비, 329%의 데미지로 10번 공격, 461%의 데미지로 15번 공격, 506%의 데미지로 7번 공격',
    'MP 200 소비, 344%의 데미지로 10번 공격, 482%의 데미지로 15번 공격, 529%의 데미지로 7번 공격')]);
  assert.equal(row.supported, true);
  approximately(row.minRatio, Math.min(344 / 329, 482 / 461, 529 / 506));
  approximately(row.maxRatio, Math.max(344 / 329, 482 / 461, 529 / 506));
});

test('누락·패시브·조건 변경·0 데미지·0타·이벤트 레벨은 지원하지 않는다', () => {
  const bad = [
    skill('직접 공격', 10, '1000%의 데미지로 6번 공격', null),
    skill('직접 공격', 10, '1000%의 데미지로 6번 공격\n패시브: 다른 스킬 강화', '1100%의 데미지로 6번 공격\n패시브: 다른 스킬 강화'),
    skill('직접 공격', 10, '1000%의 데미지로 6번 공격', '1100%의 데미지로 7번 공격'),
    skill('직접 공격', 10, '0%의 데미지로 6번 공격', '100%의 데미지로 6번 공격'),
    skill('직접 공격', 10, '1000%의 데미지로 0번 공격', '1100%의 데미지로 0번 공격'),
    skill('직접 공격', 10, '1000%의 데미지로 6번 공격, 부활', '1100%의 데미지로 6번 공격, 부활'),
    skill('직접 공격', 10, '1000%의 데미지로 6번 공격, 추가타 데미지 500%', '1100%의 데미지로 6번 공격, 추가타 데미지 500%'),
  ];
  for (const sample of bad) assert.equal(build(undefined, [sample])[0].supported, false, sample.skill_effect);
  assert.equal(build([{ ...core(), hexa_core_event_level: 1 }])[0].supported, false);
  assert.equal(build([core()], [])[0].supported, false);
});

test('루미너스 엔드리스 다크니스처럼 다른 스킬을 강화하면 거부한다', () => {
  const [row] = build([core('엔드리스 다크니스')], [skill('엔드리스 다크니스', 10, '500%의 데미지로 5번 공격\n라이트 리플렉션 VI의 데미지 10% 증가', '550%의 데미지로 5번 공격\n라이트 리플렉션 VI의 데미지 11% 증가')]);
  assert.equal(row.supported, false);
});

test('동일한 시전 무적·행동 불가·바인드는 허용하고 조건 변경은 거부한다', () => {
  const fixed = ', 시전 동작 중 무적, 10초 동안 행동 불가 상태와 바인드 적용';
  assert.equal(build(undefined, [skill('직접 공격', 10, '1000%의 데미지로 6번 공격' + fixed, '1100%의 데미지로 6번 공격' + fixed)])[0].supported, true);
  assert.equal(build(undefined, [skill('직접 공격', 10, '1000%의 데미지로 6번 공격' + fixed, '1100%의 데미지로 6번 공격' + fixed.replace('10초', '12초'))])[0].supported, false);
});

test('추가 효과 레벨 직전은 보류하고 마스터 레벨 헤더는 마일스톤으로 오인하지 않는다', () => {
  const description = '[마스터 레벨 : 30]\n10레벨과 20레벨에 효과가 추가됩니다.';
  assert.equal(build([core('직접 공격', 19)], [skill('직접 공격', 19, undefined, undefined, description)])[0].supported, false);
  assert.equal(build([core('직접 공격', 19)], [skill('직접 공격', 19, undefined, undefined, '10/20/30레벨에 추가 효과')])[0].supported, false);
  assert.equal(build([core('직접 공격', 15)], [skill('직접 공격', 15, undefined, undefined, description)])[0].supported, true);
  assert.equal(build([core('직접 공격', 29)], [skill('직접 공격', 29)])[0].supported, true);
  const max = build([core('직접 공격', 30)], [skill('직접 공격', 30)])[0];
  assert.equal(max.supported, false);
  assert.match(max.reason, /최대/);
  assert.equal(buildHexaRows({ character_hexa_core_equipment: [core()] }, { character_skill_grade: '5', character_skill: [skill()] })[0].supported, false);
});

test('필요 스킬의 요구 레벨을 HEXA 마일스톤으로 오인하지 않는다', () => {
  const description = '[마스터 레벨 : 30]\r\n[이퀄리브리엄]\n빛과 어둠의 검을 적에게 꽂아 넣어 강력한 피해를 입힌다.\r\n필요 스킬 : 앱솔루트 킬 30레벨 이상';
  const [row] = build([core('앱솔루트 킬 VI', 29)], [skill('앱솔루트 킬 VI', 29, 'MP 69 소비, 669%의 데미지로 7번 공격', 'MP 70 소비, 675%의 데미지로 7번 공격', description)]);
  assert.equal(row.supported, true);
  approximately(row.minRatio, 675 / 669);
  const apocalypse = description.replace(/앱솔루트 킬/gu, '아포칼립스');
  assert.equal(build([core('아포칼립스 VI', 29)], [skill('아포칼립스 VI', 29, undefined, undefined, apocalypse)])[0].supported, true);
  assert.equal(build([core('앱솔루트 킬 VI', 29)], [skill('앱솔루트 킬 VI', 29, undefined, undefined, description + '\r\n30레벨에 추가 효과가 적용된다.')])[0].supported, false);
});

test('복합 코어의 링크 하나라도 누락되거나 레벨이 다르면 전체 보류한다', () => {
  const cores = [core('복합', 10, '마스터리 코어', ['직접 공격', '팩텀'])];
  assert.equal(build(cores, [skill()])[0].supported, false);
  assert.equal(build(cores, [skill(), skill('팩텀', 1)])[0].supported, false);
});

test('선택된 점유율만 보정하고 나머지 피해는 그대로 유지한다', () => {
  const rows = build([core('A'), core('B')], [skill('A'), skill('B', 10, '1000%의 데미지로 6번 공격', null)]);
  const result = planHexa(rows, { [rows[0].id]: { enabled: true, share: 20 }, [rows[1].id]: { enabled: false, share: 50 } }, 10000);
  assert.equal(result.ok, true);
  approximately(result.minMultiplier, 1.02);
  approximately(result.minScore, 10200);
  assert.equal(result.coveredShare, 20);
  assert.equal(result.totalShare, 70);
  assert.equal(result.selectedCount, 1);
});

test('점유율 공백·음수·100% 초과 합계·지원하지 않는 선택을 거부한다', () => {
  const rows = build([core('A'), core('B')], [skill('A'), skill('B')]);
  for (const share of ['', -1, 101, 'NaN']) assert.equal(planHexa(rows, { [rows[0].id]: { enabled: true, share } }).ok, false);
  assert.equal(planHexa(rows, { [rows[0].id]: { enabled: true, share: 70 }, [rows[1].id]: { enabled: false, share: 31 } }).ok, false);
  assert.equal(planHexa([{ ...rows[0], supported: false }], { [rows[0].id]: { enabled: true, share: 10 } }).ok, false);
  assert.equal(planHexa(rows, { [rows[0].id]: { enabled: true, share: 0 } }).ok, false);
});

test('여러 코어를 동시에 적용해도 점유율 가중 합이며 배율끼리 곱하지 않는다', () => {
  const rows = build([core('A'), core('B')], [skill('A'), skill('B', 10, '1000%의 데미지로 6번 공격', '1200%의 데미지로 6번 공격')]);
  const result = planHexa(rows, Object.fromEntries(rows.map(row => [row.id, { enabled: true, share: 50 }])));
  approximately(result.minMultiplier, 1.15);
  assert.equal(result.ranking[0].name, 'B');
  assert.equal(result.minScore, null);
});

test('연무장 자동 점유율은 총 데미지가 분모이며 자동 선택하지 않는다', () => {
  const cores = [core('진리의 문 강화', 10, '강화 코어')];
  const rows = build(cores, [skill('진리의 문 강화', 10, '진리의 문의 최종 데미지 25% 증가', '진리의 문의 최종 데미지 26% 증가')]);
  const result = sharesFromPractice(rows, record(cores, [{ skill_name: '진리의 문', damage: 200, damage_percent: '999' }, { skill_name: '다른 공격', damage: 800 }]), '루미너스');
  assert.equal(result.settings[rows[0].id].share, 20);
  assert.equal(result.settings[rows[0].id].enabled, false);
  assert.equal(result.matchedShare, 20);
  assert.equal(result.unmatchedShare, 80);
});

test('연무장 예전 레벨·다른 직업·정보 없는 코어의 점유율을 적용하지 않는다', () => {
  const rows = build();
  const stats = [{ skill_name: '직접 공격', damage: 1000 }];
  const old = sharesFromPractice(rows, record([core('직접 공격', 9)], stats), '루미너스');
  assert.equal(old.matchedShare, 0);
  assert.deepEqual(old.incompatibleIds, [rows[0].id]);
  assert.equal(sharesFromPractice(rows, record([core()], stats, 1000, '비숍'), '루미너스').matchedShare, 0);
  assert.equal(sharesFromPractice(rows, record([], stats), '루미너스').matchedShare, 0);
  assert.equal(sharesFromPractice(rows, record([{ ...core(), hexa_core_event_level: 3 }], stats), '루미너스').matchedShare, 0);
});

test('연무장 중복 스킬 매칭을 제외하고 부분 일치를 사용하지 않는다', () => {
  const cores = [core('A', 10, '스킬 코어', ['직접 공격']), core('B', 10, '스킬 코어', ['직접 공격'])];
  const rows = build(cores, [skill()]);
  const result = sharesFromPractice(rows, record(cores, [{ skill_name: '직접 공격', damage: 500 }, { skill_name: '직접 공격 추가타', damage: 500 }]), '루미너스');
  assert.equal(result.matchedShare, 0);
  assert.match(result.warnings.join(' '), /중복/);
  const single = build();
  assert.equal(sharesFromPractice(single, record([core()], [{ skill_name: '직접 공격', damage: 400 }, { skill_name: '직접 공격', damage: 600 }]), '루미너스').matchedShare, 0);
});

test('같은 코어 레벨이라도 과거 스킬 효과가 다르거나 없으면 제외한다', () => {
  const rows = build(), stats = [{ skill_name: '직접 공격', damage: 1000 }];
  const changed = record([core()], stats);
  changed.characterInfo.skill_object.character_skill[0].skill_effect = 'MP 100 소비, 900%의 데미지로 6번 공격';
  const changedResult = sharesFromPractice(rows, changed, '루미너스');
  assert.equal(changedResult.matchedShare, 0);
  assert.deepEqual(changedResult.incompatibleIds, [rows[0].id]);
  assert.match(changedResult.warnings.join(' '), /스킬 효과/);
  const missing = record([core()], stats);
  delete missing.characterInfo.skill_object;
  assert.equal(sharesFromPractice(rows, missing, '루미너스').matchedShare, 0);
  const spacing = record([core()], stats);
  spacing.characterInfo.skill_object.character_skill[0].skill_effect = 'MP100 소비,\n1000%의 데미지로 6번 공격';
  assert.equal(sharesFromPractice(rows, spacing, '루미너스').matchedShare, 100);
});

test('연무장 피해량 합계가 총 피해량을 넘거나 잘못된 값이면 보류한다', () => {
  const rows = build();
  for (const damage of [1001, -1, '', null]) {
    const result = sharesFromPractice(rows, record([core()], [{ skill_name: '직접 공격', damage }]), '루미너스');
    assert.equal(result.matchedShare, 0);
    assert.ok(result.warnings.length);
  }
});

test('int64 피해량의 JS 누적 반올림만 허용하고 실질 초과는 거부한다', () => {
  const cores = ['A', 'B', 'C'].map(name => core(name));
  const rows = build(cores, ['A', 'B', 'C'].map(name => skill(name)));
  const statistics = ['A', 'B', 'C'].map(skill_name => ({ skill_name, damage: '9007199254740995' }));
  const result = sharesFromPractice(rows, record(cores, statistics, '27021597764222985'), '루미너스');
  approximately(result.matchedShare, 100);
  assert.equal(result.warnings.length, 0);
  assert.equal(result.incompatibleIds.length, 0);
  const exceeded = sharesFromPractice(rows, record(cores, statistics, '27021597764221985'), '루미너스');
  assert.equal(exceeded.matchedShare, 0);
  assert.ok(exceeded.warnings.length);
  const overflow = sharesFromPractice(rows, record(cores, ['A', 'B', 'C'].map(skill_name => ({ skill_name, damage: 1e308 })), 1e308), '루미너스');
  assert.equal(overflow.matchedShare, 0);
});
