import test from 'node:test';
import assert from 'node:assert/strict';
import { createPrecisionRows } from '../public/js/precision-data.js';
import { calculatePrecision } from '../public/js/precision-model.js';

const attack = '1000%의 데미지로 6번 공격';
const skill = (name, effect, next = '다음 효과는 사용하지 않음') => ({ skill_name: name, skill_effect: effect, skill_effect_next: next });
const character = (skills, linked = skills.map(value => value.skill_name)) => ({ skills: { character_skill_grade: '6', character_skill: skills },
  hexa: { character_hexa_core_equipment: [{ hexa_core_name: '코어', linked_skill: linked.map(hexa_skill_id => ({ hexa_skill_id })) }] } });
const practice = (statistics, skills = [], total = 1000) => ({ result: { total_damage: total, skill_statistic: statistics },
  characterInfo: { skill_object: { character_skill: skills } } });
const approximate = (a, b) => assert.ok(Math.abs(a - b) < 1e-10, `${a} != ${b}`);

test('live 6차 공격과 HEXA 연결 스킬을 통합하고 강화 접미사 별칭을 연결한다', () => {
  const input = character([skill('직접 공격', attack), skill('진리의 문 강화', '진리의 문의 최종 데미지 25% 증가'), skill('관계없는 버프', '능력치 10 증가')], ['직접 공격', '진리의 문 강화', '진리의 문']);
  const result = createPrecisionRows(input);
  assert.equal(result.source, 'manual');
  assert.equal(result.measuredShare, 0);
  assert.deepEqual(result.rows.map(row => row.name), ['직접 공격', '진리의 문']);
  assert.equal(result.rows[1].effect, '진리의 문의 최종 데미지 25% 증가');
  assert.ok(result.rows.every(row => !row.confirmed && row.share === 0));
  assert.equal(new Set(result.rows.map(row => row.id)).size, result.rows.length);
});

test('앱솔루트 킬의 명시적 크확·방무만 현재 효과 초안에 옮긴다', () => {
  const effect = `${attack}\n추가 크리티컬 확률 100%, 몬스터 방어율 45% 추가 무시\n재사용 대기시간 10초`;
  const [row] = createPrecisionRows(character([skill('앱솔루트 킬 VI', effect, '몬스터 방어율 99% 추가 무시')])).rows;
  assert.equal(row.extraIED, 45);
  assert.equal(row.extraCritRate, 100);
  assert.equal(row.extraDamage, 0);
  assert.equal(row.confirmed, false);
  assert.equal(row.effect, effect);
});

test('동일 배율 공격 반복과 단일 공통 옵션은 러스트러스 초안으로 추출한다', () => {
  const effect = '2000%의 데미지로 13번 공격, 2000%의 데미지로 13번 공격\n몬스터 방어율 60% 추가 무시, 보스 몬스터 공격 시 데미지 40% 증가, 크리티컬 확률 100%';
  const [row] = createPrecisionRows(character([skill('러스트러스 오브', effect)])).rows;
  assert.equal(row.extraIED, 60);
  assert.equal(row.extraBoss, 40);
  assert.equal(row.extraCritRate, 100);
  assert.equal(row.extraDamage, 0);
  assert.equal(row.confirmed, false);
});

test('명시적 추가 크뎀만 추출하고 일반·최종 데미지는 가산으로 추측하지 않는다', () => {
  const [row] = createPrecisionRows(character([skill('공격', `${attack}\n추가 크리티컬 데미지 15%, 데미지 30% 증가, 최종 데미지 20% 증가`)])).rows;
  assert.equal(row.extraCritDamage, 15);
  assert.equal(row.extraDamage, 0);
  assert.match(row.notes.join(' '), /가산 여부/);
  assert.equal(row.confirmed, false);
});

test('중복 옵션 문구는 합산하지 않고 해당 옵션을 검토 대상으로 남긴다', () => {
  const [row] = createPrecisionRows(character([skill('공격', `${attack}\n몬스터 방어율 40% 추가 무시, 몬스터 방어율 40% 추가 무시, 추가 크리티컬 확률 100%`)])).rows;
  assert.equal(row.extraIED, 0);
  assert.equal(row.extraCritRate, 100);
  assert.match(row.notes.join(' '), /여러 번/);
});

test('조건부·패시브·서로 다른 공격이 섞이면 옵션을 자동 채우지 않는다', () => {
  const effects = [
    `${attack}\nHP가 50% 이하일 때 몬스터 방어율 45% 추가 무시`,
    `${attack}\n[패시브 효과] 몬스터 방어율 45% 추가 무시`,
    `${attack}, 2000%의 데미지로 8번 공격\n몬스터 방어율 45% 추가 무시`,
    `${attack}\n10초 동안 추가 크리티컬 확률 100%`,
  ];
  for (const effect of effects) {
    const [row] = createPrecisionRows(character([skill('공격', effect)])).rows;
    assert.deepEqual([row.extraDamage, row.extraBoss, row.extraIED, row.extraCritRate, row.extraCritDamage], [0, 0, 0, 0, 0]);
    assert.ok(row.notes.length);
    assert.equal(row.confirmed, false);
  }
});

test('추가인지 불명확한 크확·크뎀과 범위 밖 방무는 0으로 남긴다', () => {
  const [row] = createPrecisionRows(character([skill('공격', `${attack}\n크리티컬 확률 30%, 크리티컬 데미지 50%, 몬스터 방어율 150% 추가 무시`)])).rows;
  assert.equal(row.extraCritRate, 0);
  assert.equal(row.extraCritDamage, 0);
  assert.equal(row.extraIED, 0);
  assert.match(row.notes.join(' '), /가산/);
  assert.match(row.notes.join(' '), /범위/);
  const [decreased] = createPrecisionRows(character([skill('공격', `${attack}\n크리티컬 확률 100% 감소, 최종 크리티컬 데미지 50% 증가`)])).rows;
  assert.equal(decreased.extraCritRate, 0);
  assert.equal(decreased.extraCritDamage, 0);
});

test('연무장 rawdamage만으로 점유율을 구하고 미집계 피해를 별도 행으로 남긴다', () => {
  const result = createPrecisionRows(null, practice([{ skill_name: '공격', damage: 300, damage_percent: '99' }], [skill('공격', attack)]));
  assert.equal(result.source, 'practice');
  assert.equal(result.measuredShare, 30);
  assert.equal(result.rows[0].share, 30);
  assert.equal(result.rows[1].name, '구분되지 않은 피해');
  assert.equal(result.rows[1].share, 70);
  assert.ok(result.rows.every(row => !row.confirmed));
  assert.ok(result.warnings.length);
});

test('매우 작은 실제 미집계 피해도 남겨 확인 후 정밀 모델의 100% 검증을 통과한다', () => {
  const result = createPrecisionRows(null, practice([{ skill_name: '공격', damage: 1e12 - 1 }], [skill('공격', attack)], 1e12));
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[1].name, '구분되지 않은 피해');
  assert.ok(result.rows[1].share > 0 && result.rows[1].share < 1e-9);
  const stats = { minAttack: 100, maxAttack: 100, damage: 0, bossDamage: 0, critRate: 100, critDamage: 0, ignoreDefense: 100 };
  const calculated = calculatePrecision({ before: stats, after: stats, rows: result.rows.map(row => ({ ...row, confirmed: true })),
    measurement: { totalDamage: 1e12, seconds: 100 }, sourceDefense: 380, conditionsConfirmed: true });
  assert.equal(calculated.ok, true, calculated.message);
  approximate(calculated.multiplier, 1);
});

test('동일 스킬의 중복 측정 항목은 합치거나 버리지 않고 고유 ID로 유지한다', () => {
  const result = createPrecisionRows(null, practice([{ skill_name: '공격', damage: 400 }, { skill_name: '공격', damage: 600 }], [skill('공격', attack)]));
  assert.deepEqual(result.rows.map(row => row.share), [40, 60]);
  assert.notEqual(result.rows[0].id, result.rows[1].id);
  assert.ok(result.rows.every(row => !row.confirmed && /중복/.test(row.notes.join(' '))));
});

test('측정 효과 연결은 정확한 이름을 먼저 쓰고 강화 별칭은 유일할 때만 쓴다', () => {
  const exact = createPrecisionRows(null, practice([{ skill_name: '공격', damage: 1000 }], [skill('공격', `${attack}\n추가 크리티컬 확률 20%`), skill('공격 강화', '다른 효과')]));
  assert.equal(exact.rows[0].extraCritRate, 20);
  const alias = createPrecisionRows(null, practice([{ skill_name: '공격', damage: 1000 }], [skill('공격 강화', `${attack}\n추가 크리티컬 확률 25%`)]));
  assert.equal(alias.rows[0].extraCritRate, 25);
  const ambiguous = createPrecisionRows(null, practice([{ skill_name: '공격', damage: 1000 }], [skill('공격 강화', attack), skill('공격  강화', `${attack}\n추가 크리티컬 확률 30%`)]));
  assert.equal(ambiguous.rows[0].effect, '');
  assert.match(ambiguous.rows[0].notes.join(' '), /여러 개/);
});

test('snapshot 효과가 없으면 live 효과로 대체하지 않는다', () => {
  const live = character([skill('공격', `${attack}\n추가 크리티컬 확률 100%`)]);
  const result = createPrecisionRows(live, practice([{ skill_name: '공격', damage: 1000 }]));
  assert.equal(result.rows[0].effect, '');
  assert.equal(result.rows[0].extraCritRate, 0);
  assert.ok(result.warnings.length);
});

test('피해량 초과·잘못된 수치·합계 오버플로는 빈 초안과 오류로 반환한다', () => {
  for (const damage of [1001, -1, '', null, 'NaN']) {
    const result = createPrecisionRows(null, practice([{ skill_name: '공격', damage }]));
    assert.deepEqual(result.rows, []);
    assert.ok(result.error);
    assert.ok(result.warnings.length);
  }
  assert.ok(createPrecisionRows(null, practice([], [], 0)).error);
  assert.ok(createPrecisionRows(null, practice([{ damage: 1e308 }, { damage: 1e308 }], [], 1e308)).error);
});

test('int64의 JS 반올림 오차만 허용하고 실질 피해량 초과는 거부한다', () => {
  const statistics = ['A', 'B', 'C'].map(skill_name => ({ skill_name, damage: '9007199254740995' }));
  const result = createPrecisionRows(null, practice(statistics, [], '27021597764222985'));
  assert.equal(result.error, undefined);
  assert.equal(result.rows.length, 3);
  assert.equal(result.measuredShare, 100);
  approximate(result.rows.reduce((sum, row) => sum + row.share, 0), 100);
  assert.ok(createPrecisionRows(null, practice(statistics, [], '27021597764221985')).error);
});

test('공백 이름 충돌과 특수 객체 키도 임의 연결이나 행 손실을 만들지 않는다', () => {
  const live = character([skill('a b', attack), skill('ab', `${attack}\n추가 크리티컬 확률 100%`), skill('__proto__', attack), skill('constructor', attack)]);
  const result = createPrecisionRows(live);
  assert.equal(result.rows.length, 3);
  assert.equal(result.rows[0].effect, '');
  assert.ok(result.rows.some(row => row.name === '__proto__'));
  assert.ok(result.rows.some(row => row.name === 'constructor'));
  assert.equal(new Set(result.rows.map(row => row.id)).size, 3);
});

test('공격 없는 HEXA 연결 버프도 미확인 행으로 유지하고 6차 이외 효과는 사용하지 않는다', () => {
  const live = character([skill('버프', '버프 지속 시간 10초')]);
  assert.equal(createPrecisionRows(live).rows[0].confirmed, false);
  live.skills.character_skill_grade = '5';
  const result = createPrecisionRows(live);
  assert.equal(result.rows[0].effect, '');
  assert.ok(result.warnings.length);
});

test('입력 객체를 변경하지 않고 빈 데이터와 빈 측정 목록도 설명 가능한 초안으로 처리한다', () => {
  const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
  const live = freeze(character([skill('공격', attack)])), measured = freeze(practice([{ skill_name: '공격', damage: 1000 }], [skill('공격', attack)]));
  assert.equal(createPrecisionRows(live).rows.length, 1);
  assert.equal(createPrecisionRows(live, measured).rows.length, 1);
  assert.deepEqual(createPrecisionRows(null).rows, []);
  const empty = createPrecisionRows(null, practice([]));
  assert.equal(empty.rows[0].name, '구분되지 않은 피해');
  assert.equal(empty.rows[0].share, 100);
  assert.equal(empty.rows[0].confirmed, false);
});
