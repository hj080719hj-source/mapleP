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

const compositeFixture = () => {
  const cores = [core('복합 코어', 10, '마스터리 코어', ['첫 공격', '둘째 공격'])];
  const skills = [skill('첫 공격'), skill('둘째 공격', 10, undefined, 'MP 101 소비, 1200%의 데미지로 6번 공격')];
  const rows = build(cores, skills);
  return { cores, skills, rows, row: rows[0] };
};

test('연결 스킬별 배율과 ID는 코어 내 연결 목록 순서가 바뀌어도 유지된다', () => {
  const { cores, skills, row } = compositeFixture();
  assert.equal(row.components.length, 2);
  approximately(row.components[0].minRatio, 1.1);
  approximately(row.components[1].minRatio, 1.2);
  assert.ok(row.components.every(component => component.supported && component.reason));
  const reordered = build([{ ...cores[0], linked_skill: [...cores[0].linked_skill].reverse() }], skills)[0];
  assert.deepEqual(Object.fromEntries(row.components.map(component => [component.name, component.id])),
    Object.fromEntries(reordered.components.map(component => [component.name, component.id])));
});

test('연결 스킬별 점유율로 복합 코어 범위를 실제 가중 합으로 좁힌다', () => {
  const { rows, row } = compositeFixture();
  const [a, b] = row.components;
  const legacy = planHexa(rows, { [row.id]: { enabled: true, share: 40 } }, 10000);
  approximately(legacy.minMultiplier, 1.04);
  approximately(legacy.maxMultiplier, 1.08);
  const refined = planHexa(rows, { [row.id]: { enabled: true, share: 40, componentShares: { [a.id]: 10, [b.id]: '30' } } }, 10000);
  assert.equal(refined.ok, true);
  approximately(refined.minMultiplier, 1.07);
  approximately(refined.maxMultiplier, 1.07);
  approximately(refined.minScore, 10700);
  approximately(refined.ranking[0].minGainPercent, 7);
  approximately(refined.ranking[0].maxGainPercent, 7);
  assert.equal(refined.ranking[0].refined, true);
});

test('연결 스킬의 내부 공격 비중이 없으면 그 스킬의 최소~최대 범위는 유지한다', () => {
  const { cores, skills } = compositeFixture();
  skills[1] = skill('둘째 공격', 10, '1000%의 데미지로 6번 공격, 2000%의 데미지로 8번 공격', '1200%의 데미지로 6번 공격, 2600%의 데미지로 8번 공격');
  const rows = build(cores, skills), row = rows[0], [a, b] = row.components;
  const result = planHexa(rows, { [row.id]: { enabled: true, share: 40, componentShares: { [a.id]: 10, [b.id]: 30 } } });
  approximately(result.minMultiplier, 1.07);
  approximately(result.maxMultiplier, 1.10);
  const unused = planHexa(rows, { [row.id]: { enabled: true, share: 40, componentShares: { [a.id]: 40, [b.id]: 0 } } });
  approximately(unused.minMultiplier, 1.04);
  approximately(unused.maxMultiplier, 1.04);
});

test('상세 점유율의 누락·공백·알 수 없는 키·잘못된 합은 조용히 기본값으로 대체하지 않는다', () => {
  const { rows, row } = compositeFixture(), [a, b] = row.components;
  const cases = [
    [{ [a.id]: 40 }, 'MISSING_COMPONENT_SHARE', b.id],
    [{ [a.id]: 40, [b.id]: '' }, 'INVALID_COMPONENT_SHARE', b.id],
    [{ [a.id]: 40, [b.id]: -1 }, 'INVALID_COMPONENT_SHARE', b.id],
    [{ [a.id]: 40, [b.id]: Infinity }, 'INVALID_COMPONENT_SHARE', b.id],
    [{ [a.id]: 40, [b.id]: 101 }, 'INVALID_COMPONENT_SHARE', b.id],
    [{ [a.id]: 10, [b.id]: 20 }, 'COMPONENT_SHARE_MISMATCH', null],
    [{ [a.id]: 10, [b.id]: 30, stale: 0 }, 'UNKNOWN_COMPONENT', null],
    [null, 'INVALID_COMPONENT_SHARES', null],
    [[], 'INVALID_COMPONENT_SHARES', null],
  ];
  for (const [componentShares, code, componentId] of cases) {
    const result = planHexa(rows, { [row.id]: { enabled: true, share: 40, componentShares } });
    assert.equal(result.ok, false);
    assert.equal(result.code, code);
    assert.equal(result.rowId, row.id);
    assert.equal(result.componentId, componentId);
    assert.match(result.message, /복합 코어/);
    assert.equal(result.errors[0].code, code);
  }
});

test('미지원 연결 스킬의 점유율이 0이어도 코어 전체의 지원 제한을 우회하지 못한다', () => {
  const { cores, skills } = compositeFixture();
  skills[1].skill_effect_next = null;
  const rows = build(cores, skills), row = rows[0], [a, b] = row.components;
  assert.equal(a.supported, true);
  assert.equal(b.supported, false);
  assert.ok(b.reason);
  assert.equal(row.supported, false);
  const result = planHexa(rows, { [row.id]: { enabled: true, share: 40, componentShares: { [a.id]: 40, [b.id]: 0 } } });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'UNSUPPORTED_CORE');
});

test('연무장 원시 피해량으로 연결 스킬별 점유율을 채우고 정밀 보정에 사용한다', () => {
  const { rows, row, cores } = compositeFixture(), [a, b] = row.components;
  const result = sharesFromPractice(rows, record(cores, [
    { skill_name: '첫 공격', damage: 100, damage_percent: '99' },
    { skill_name: '둘째 공격', damage: 300, damage_percent: '99' },
    { skill_name: '미매칭 공격', damage: 600 },
  ]), '루미너스');
  assert.equal(result.matchedShare, 40);
  assert.equal(result.unmatchedShare, 60);
  assert.equal(result.settings[row.id].enabled, false);
  assert.deepEqual(result.settings[row.id].componentShares, { [a.id]: 10, [b.id]: 30 });
  const plan = planHexa(rows, { [row.id]: { ...result.settings[row.id], enabled: true } });
  assert.equal(plan.ok, true);
  approximately(plan.minMultiplier, 1.07);
  approximately(plan.maxMultiplier, 1.07);
});

test('관측되지 않은 연결 스킬의 점유율도 명시적인 0으로 제공한다', () => {
  const { rows, row, cores } = compositeFixture(), [a, b] = row.components;
  const result = sharesFromPractice(rows, record(cores, [{ skill_name: '첫 공격', damage: 100 }, { skill_name: '다른 공격', damage: 900 }]), '루미너스');
  assert.deepEqual(result.settings[row.id].componentShares, { [a.id]: 10, [b.id]: 0 });
  assert.equal(result.settings[row.id].share, 10);
});

test('연결 스킬 이름이 중복이면 정밀 점유율을 이중 배분하지 않는다', () => {
  const cores = [core('중복 코어', 10, '스킬 코어', ['같은 공격', '같은 공격 강화'])];
  const rows = build(cores, [skill('같은 공격'), skill('같은 공격 강화')]), row = rows[0];
  assert.equal(row.supported, false);
  const result = sharesFromPractice(rows, record(cores, [{ skill_name: '같은 공격', damage: 1000 }]), '루미너스');
  assert.equal(result.matchedShare, 0);
  assert.ok(Object.values(result.settings[row.id].componentShares).every(share => share === 0));
  assert.match(result.warnings.join(' '), /중복/);
});

test('복합 코어의 연결 스킬 하나가 과거 패치 효과이면 부분 가져오기도 하지 않는다', () => {
  const { rows, row, cores } = compositeFixture();
  const practice = record(cores, [{ skill_name: '첫 공격', damage: 100 }, { skill_name: '둘째 공격', damage: 900 }]);
  practice.characterInfo.skill_object.character_skill[1].skill_effect = '900%의 데미지로 6번 공격';
  const result = sharesFromPractice(rows, practice, '루미너스');
  assert.equal(result.matchedShare, 0);
  assert.equal(result.settings[row.id].share, 0);
  assert.deepEqual(result.incompatibleIds, [row.id]);
});

test('복합 코어 int64 반올림으로 점유율이 아주 조금 100을 넘어도 계획은 유효하다', () => {
  const cores = [core('큰 피해 코어', 10, '스킬 코어', ['A', 'B', 'C'])];
  const rows = build(cores, ['A', 'B', 'C'].map(name => skill(name))), row = rows[0];
  const result = sharesFromPractice(rows, record(cores, ['A', 'B', 'C'].map(skill_name => ({ skill_name, damage: '9007199254740995' })), '27021597764222985'), '루미너스');
  assert.equal(result.settings[row.id].share, 100);
  const plan = planHexa(rows, { [row.id]: { ...result.settings[row.id], enabled: true } });
  assert.equal(plan.ok, true);
  approximately(plan.minMultiplier, 1.1);
});
