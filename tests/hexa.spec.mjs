import { test, expect } from '@playwright/test';

const fakeKey = 'hexa-browser-test-only-key';
const person = { character_name: '헥사테스트', character_class: '루미너스', character_level: 291, world_name: '엘리시움' };
const values = {
  '최소 스탯공격력': 90000000, '최대 스탯공격력': 100000000,
  '데미지': 100, '보스 몬스터 데미지': 300, '크리티컬 확률': 100,
  '크리티컬 데미지': 65, '방어율 무시': 98, 'INT': 50000,
  'STR': 4000, 'DEX': 4000, 'LUK': 7000, '전투력': 140000000,
};
const stats = { final_stat: Object.entries(values).map(([stat_name, value]) => ({ stat_name, stat_value: String(value) })) };
const core = (name, type, linked = name) => ({
  hexa_core_name: name, hexa_core_type: type, hexa_core_level: 10,
  hexa_core_event_level: 0, linked_skill: (Array.isArray(linked) ? linked : [linked]).map(hexa_skill_id => ({ hexa_skill_id })),
});
const cores = [
  core('진리의 문', '강화 코어', '진리의 문 강화'),
  core('시험 타격 VI', '마스터리 코어'),
  core('시험 버프 VI', '공용 코어'),
  core('시험 복합 공격', '스킬 코어'),
  core('시험 연계 코어', '마스터리 코어', ['시험 연계 타격 I', '시험 연계 타격 II']),
];
const skill = (name, effect, next) => ({ skill_name: name, skill_level: 10, skill_effect: effect, skill_effect_next: next, skill_description: '테스트용 합성 스킬입니다.' });
const skills = { character_skill: [
  skill('진리의 문 강화', '진리의 문의 최종 데미지 25% 증가', '진리의 문의 최종 데미지 26% 증가'),
  skill('시험 타격 VI', 'MP 100 소비, 최대 6명의 적을 100%의 데미지로 6번 공격', 'MP 100 소비, 최대 6명의 적을 110%의 데미지로 6번 공격'),
  skill('시험 버프 VI', '30초 동안 최종 데미지 10% 증가', '30초 동안 최종 데미지 11% 증가'),
  skill('시험 복합 공격', '빛의 공격: 100%의 데미지로 6번 공격\n어둠의 공격: 200%의 데미지로 6번 공격', '빛의 공격: 110%의 데미지로 6번 공격\n어둠의 공격: 240%의 데미지로 6번 공격'),
  skill('시험 연계 타격 I', '100%의 데미지로 6번 공격', '110%의 데미지로 6번 공격'),
  skill('시험 연계 타격 II', '200%의 데미지로 6번 공격', '240%의 데미지로 6번 공격'),
] };

async function mockApi(page, { mismatched = false, oldEffects = false, componentReplay = false } = {}) {
  const snapshot = cores.map(row => ({ ...row, hexa_core_level: mismatched ? 9 : row.hexa_core_level }));
  const responses = {
    id: { ocid: 'hexa-synthetic-ocid' },
    'character/basic': person,
    'character/stat': stats,
    'character/item-equipment': { preset_no: 1, item_equipment: [] },
    'character/hexamatrix': { character_hexa_core_equipment: cores },
    'character/skill': skills,
    'battle-practice/replay-id': { replay_list: [{ replay_id: 'hexa-synthetic-replay', register_date: '2026-10-02T12:00:00+09:00', period_no: 8 }] },
    'battle-practice/result': {
      total_play_time: 120000, total_damage: 120000000000000, total_dps: 1000000000000,
      end_type: '2', skill_statistic: [
        { skill_name: '진리의 문', damage: 30000000000000, damage_percent: '99.00' },
        { skill_name: '시험 타격 VI', damage: 30000000000000, damage_percent: '99.00' },
        ...(componentReplay ? [
          { skill_name: '시험 연계 타격 I', damage: 12000000000000, damage_percent: '99.00' },
          { skill_name: '시험 연계 타격 II', damage: 36000000000000, damage_percent: '99.00' },
          { skill_name: '기타 공격', damage: 12000000000000, damage_percent: '99.00' },
        ] : [{ skill_name: '기타 공격', damage: 60000000000000, damage_percent: '99.00' }]),
      ],
    },
    'battle-practice/character-info': {
      basic_object: person,
      stat_object: { basic_stat_object: stats },
      hexa_matrix_object: { hexa_core_object: { character_hexa_core_equipment: snapshot } },
      skill_object: { character_skill: skills.character_skill.map(row => ({ ...row,
        skill_effect: oldEffects ? row.skill_effect.replace('25%', '20%').replace('100%', '90%') : row.skill_effect,
      })) },
    },
  };
  await page.route('https://open.api.nexon.com/**', async route => {
    const url = new URL(route.request().url());
    expect(route.request().headers()['x-nxopen-api-key']).toBe(fakeKey);
    expect(url.href).not.toContain(fakeKey);
    const path = url.pathname.replace('/maplestory/v1/', '');
    expect(responses[path], `Unexpected API path: ${path}`).toBeDefined();
    if (path === 'character/skill') expect(url.searchParams.get('character_skill_grade')).toBe('6');
    await route.fulfill({ json: responses[path] });
  });
}

async function connect(page, options) {
  await mockApi(page, options);
  await page.goto('/combat.html');
  await page.locator('#character-name').fill(person.character_name);
  await page.locator('#combat-api-key').fill(fakeKey);
  await page.locator('#load-character').click();
  await expect(page.locator('#combat-status')).toContainText('스탯을 불러왔습니다');
  await expect(page.locator('#hexa-panel')).toBeVisible();
}

const row = (page, name) => page.locator('#hexa-rows .hexa-row').filter({ hasText: name });

test('HEXA reads official current/next effects and applies weighted enhancement to score and boss time', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await connect(page);
  const enhancement = row(page, '진리의 문');
  await expect(page.locator('#hexa-source')).toHaveValue('manual');
  await expect(page.locator('#hexa-apply-boss')).toBeChecked();
  await expect(page.locator('#own-score')).toHaveText('43,890 점');
  await page.locator('#total-damage').fill('120');
  await page.locator('#battle-seconds').fill('120');
  await page.locator('#boss-hp').fill('600');
  await expect(page.locator('#boss-estimate')).toHaveText('10분 0초');
  await enhancement.locator('[data-hexa-share]').fill('25');
  await enhancement.locator('[data-hexa-enabled]').check();
  await expect(page.locator('#hexa-result')).toContainText('0.2%');
  await expect(page.locator('#hexa-result')).toContainText('43,978');
  await expect(page.locator('#boss-estimate')).toHaveText('9분 59초');
  await expect(page.locator('#hexa-ranking')).toContainText('진리의 문');
  await page.locator('#hexa-apply-boss').uncheck();
  await expect(page.locator('#boss-estimate')).toHaveText('10분 0초');
  expect(errors).toEqual([]);
});

test('direct damage growth and multi-attack uncertainty remain separate from unsupported buffs', async ({ page }) => {
  await connect(page);
  await expect(row(page, '시험 버프 VI').locator('[data-hexa-enabled]')).toBeDisabled();
  const direct = row(page, '시험 타격 VI');
  await direct.locator('[data-hexa-share]').fill('50');
  await direct.locator('[data-hexa-enabled]').check();
  await expect(page.locator('#hexa-result')).toContainText('5%');
  const projected = Number((await page.locator('#hexa-score').innerText()).replace(/[^\d.]/g, ''));
  expect(Math.abs(projected - 43890 * 1.05)).toBeLessThanOrEqual(0.51);
  await direct.locator('[data-hexa-enabled]').uncheck();
  const mixed = row(page, '시험 복합 공격');
  await mixed.locator('[data-hexa-share]').fill('20');
  await mixed.locator('[data-hexa-enabled]').check();
  await expect(page.locator('#hexa-result')).toContainText(/2.*4%/);
  await page.locator('#total-damage').fill('120');
  await page.locator('#battle-seconds').fill('120');
  await page.locator('#boss-hp').fill('600');
  await page.locator('#boss-limit').fill('9.7');
  await expect(page.locator('#boss-estimate')).toHaveText(/9분 37초\s*~\s*9분 49초/);
  await expect(page.locator('#boss-output')).toContainText('예상 범위가 제한 시간에 걸쳐');
});

test('shares over one hundred block projection and reset returns to the current state', async ({ page }) => {
  await connect(page);
  const enhancement = row(page, '진리의 문'), direct = row(page, '시험 타격 VI');
  await enhancement.locator('[data-hexa-share]').fill('60');
  await enhancement.locator('[data-hexa-enabled]').check();
  await direct.locator('[data-hexa-share]').fill('41');
  await direct.locator('[data-hexa-enabled]').check();
  await expect(page.locator('#hexa-result')).toContainText(/100%|100 %/);
  await expect(page.locator('#hexa-result')).not.toContainText('43,978');
  await page.locator('#hexa-reset').click();
  await expect(page.locator('[data-hexa-enabled]:checked')).toHaveCount(0);
  await expect(page.locator('#own-score')).toHaveText('43,890 점');
});

test('practice matches names and levels, retains unassigned damage, and never renormalizes shares', async ({ page }) => {
  await connect(page);
  await page.locator('#load-practice').click();
  await expect(page.locator('#practice-status')).toContainText('가장 최근 등록 기록');
  await expect(page.locator('#hexa-source')).toHaveValue('practice');
  const enhancement = row(page, '진리의 문'), direct = row(page, '시험 타격 VI');
  await expect(enhancement.locator('[data-hexa-share]')).toHaveValue('25');
  await expect(direct.locator('[data-hexa-share]')).toHaveValue('25');
  await enhancement.locator('[data-hexa-enabled]').check();
  await direct.locator('[data-hexa-enabled]').check();
  await expect(page.locator('#hexa-result')).toContainText('2.7%');
  await expect(page.locator('#hexa-result')).toContainText('45,075');
  await page.locator('#hexa-select-all').click();
  await expect(row(page, '시험 버프 VI').locator('[data-hexa-enabled]')).not.toBeChecked();
});

test('old practice core levels cannot be silently applied to current upgrade projections', async ({ page }) => {
  await connect(page, { mismatched: true });
  await page.locator('#load-practice').click();
  await expect(page.locator('#practice-status')).toContainText('가장 최근 등록 기록');
  await expect(page.locator('#hexa-panel')).toContainText(/레벨.*다르|레벨.*일치|일치.*레벨/);
  await expect(page.locator('[data-hexa-enabled]:checked')).toHaveCount(0);
  await expect(row(page, '진리의 문').locator('[data-hexa-enabled]')).toBeDisabled();
});

test('practice from an older skill balance patch is rejected even when core levels match', async ({ page }) => {
  await connect(page, { oldEffects: true });
  await page.locator('#load-practice').click();
  await expect(page.locator('#practice-status')).toContainText('가장 최근 등록 기록');
  await expect(row(page, '진리의 문').locator('[data-hexa-enabled]')).toBeDisabled();
  await expect(row(page, '시험 타격 VI').locator('[data-hexa-enabled]')).toBeDisabled();
  await expect(page.locator('#hexa-panel')).toContainText(/효과.*다르|효과.*일치|패치/);
});

test('editing measured totals stops applying historical HEXA shares to the new boss measurement', async ({ page }) => {
  await connect(page);
  await page.locator('#load-practice').click();
  await expect(page.locator('#hexa-source')).toHaveValue('practice');
  await page.locator('#boss-hp').fill('600');
  await row(page, '진리의 문').locator('[data-hexa-enabled]').check();
  await expect(page.locator('#boss-estimate')).toHaveText('9분 59초');
  await page.locator('#total-damage').fill('240');
  await expect(page.locator('#hexa-result')).toContainText('기록과 달라졌습니다');
  await expect(page.locator('#boss-estimate')).toHaveCount(0);
  await expect(page.locator('#boss-output')).toContainText('HEXA 보정을 적용할 수 없습니다');
  await page.locator('#hexa-apply-boss').uncheck();
  await expect(page.locator('#boss-estimate')).toHaveText('5분 0초');
});

test('disconnect clears the projected score, shares, and all API credentials', async ({ page }) => {
  await connect(page);
  await row(page, '진리의 문').locator('[data-hexa-share]').fill('25');
  await row(page, '진리의 문').locator('[data-hexa-enabled]').check();
  await expect(page.locator('#hexa-result')).toContainText('43,978');
  await page.locator('#clear-character').click();
  await expect(page.locator('#hexa-rows .hexa-row')).toHaveCount(0);
  await expect(page.locator('#own-score')).toHaveCount(0);
  await expect(page.locator('#hexa-result')).not.toContainText('43,978');
  await expect(page.locator('#combat-api-key')).toHaveValue('');
  expect(await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }))).not.toContain(fakeKey);
});

test('HEXA rows, ranking, and long effect descriptions fit a 390px viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await connect(page);
  await row(page, '진리의 문').locator('[data-hexa-share]').fill('25');
  await row(page, '진리의 문').locator('[data-hexa-enabled]').check();
  await expect(page.locator('#hexa-result')).toContainText('43,978');
  await row(page, '시험 복합 공격').locator('details > summary').click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.locator('#load-practice').click();
  await expect(page.locator('#hexa-source')).toHaveValue('practice');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('summary and coverage stay above searchable rows while filters preserve the selected projection', async ({ page }) => {
  await connect(page);
  expect(await page.locator('#hexa-result').evaluate(result => Boolean(result.compareDocumentPosition(document.querySelector('#hexa-rows')) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
  await expect(page.locator('#hexa-filter')).toHaveValue('all');
  await expect(page.locator('#hexa-unavailable')).toHaveJSProperty('open', false);
  await expect(row(page, '시험 버프 VI')).toBeHidden();
  await row(page, '진리의 문').locator('[data-hexa-share]').fill('25');
  await row(page, '시험 타격 VI').locator('[data-hexa-share]').fill('10');
  await row(page, '진리의 문').locator('[data-hexa-enabled]').check();
  await expect(page.locator('#hexa-coverage')).toContainText('35%');
  await expect(page.locator('#hexa-coverage')).toContainText('25%');
  await expect(page.locator('#hexa-coverage')).toContainText('65%');
  await expect(page.locator('#hexa-growth')).toHaveText('+0.2%');
  await page.locator('#hexa-search').fill('시험 타격');
  await expect(row(page, '시험 타격 VI')).toBeVisible();
  await expect(row(page, '진리의 문')).toBeHidden();
  await expect(row(page, '진리의 문').locator('[data-hexa-enabled]')).toBeChecked();
  await expect(page.locator('#hexa-growth')).toHaveText('+0.2%');
  await page.locator('#hexa-search').fill('');
  await page.locator('#hexa-filter').selectOption('selected');
  await expect(row(page, '진리의 문')).toBeVisible();
  await expect(row(page, '시험 타격 VI')).toBeHidden();
  await expect(page.locator('#hexa-rows .hexa-row')).toHaveCount(5);
  await page.locator('#hexa-filter').selectOption('available');
  await expect(row(page, '시험 타격 VI')).toBeVisible();
  await expect(row(page, '시험 버프 VI')).toBeHidden();
  await expect(page.locator('#hexa-coverage')).toContainText('35%');
});

test('candidate ranking compares unselected cores and best selection uses weighted damage gain', async ({ page }) => {
  await connect(page);
  await expect(page.locator('#hexa-best')).toBeDisabled();
  await row(page, '진리의 문').locator('[data-hexa-share]').fill('25');
  await row(page, '시험 타격 VI').locator('[data-hexa-share]').fill('10');
  await row(page, '시험 복합 공격').locator('[data-hexa-share]').fill('20');
  await expect(page.locator('[data-hexa-enabled]:checked')).toHaveCount(0);
  await expect(page.locator('#hexa-ranking')).toContainText('진리의 문');
  await expect(page.locator('#hexa-ranking')).toContainText('시험 복합 공격');
  await page.locator('#hexa-best').click();
  await expect(page.locator('[data-hexa-enabled]:checked')).toHaveCount(1);
  await expect(row(page, '시험 복합 공격').locator('[data-hexa-enabled]')).toBeChecked();
  await expect(page.locator('#hexa-growth')).toHaveText(/2.*4%/);
  const enhancementId = await row(page, '진리의 문').getAttribute('data-core-id');
  await page.locator(`#hexa-ranking [data-select-core="${enhancementId}"]`).click();
  await expect(page.locator('[data-hexa-enabled]:checked')).toHaveCount(1);
  await expect(row(page, '진리의 문').locator('[data-hexa-enabled]')).toBeChecked();
  await expect(page.locator('#hexa-growth')).toHaveText('+0.2%');
  await page.locator('#hexa-select-all').click();
  await expect(page.locator('[data-hexa-enabled]:checked')).toHaveCount(3);
  await expect(row(page, '시험 연계 코어').locator('[data-hexa-enabled]')).not.toBeChecked();
  await expect(row(page, '시험 버프 VI').locator('[data-hexa-enabled]')).not.toBeChecked();
});

test('manual shares and choices survive switching to practice and back, then clear with the character', async ({ page }) => {
  await connect(page);
  await row(page, '진리의 문').locator('[data-hexa-share]').fill('12.5');
  await row(page, '시험 타격 VI').locator('[data-hexa-share]').fill('30');
  await row(page, '진리의 문').locator('[data-hexa-enabled]').check();
  await page.locator('#load-practice').click();
  await expect(page.locator('#hexa-source')).toHaveValue('practice');
  await expect(row(page, '진리의 문').locator('[data-hexa-share]')).toHaveValue('25');
  await page.locator('#hexa-source').selectOption('manual');
  await expect(row(page, '진리의 문').locator('[data-hexa-share]')).toHaveValue('12.5');
  await expect(row(page, '시험 타격 VI').locator('[data-hexa-share]')).toHaveValue('30');
  await expect(row(page, '진리의 문').locator('[data-hexa-enabled]')).toBeChecked();
  await expect(row(page, '시험 타격 VI').locator('[data-hexa-enabled]')).not.toBeChecked();
  await expect(page.locator('#hexa-growth')).toHaveText('+0.1%');
  await page.locator('#clear-character').click();
  await page.locator('#combat-api-key').fill(fakeKey);
  await page.locator('#load-character').click();
  await expect(page.locator('#combat-status')).toContainText('스탯을 불러왔습니다');
  await expect(row(page, '진리의 문').locator('[data-hexa-share]')).toHaveValue('0');
  await expect(page.locator('[data-hexa-enabled]:checked')).toHaveCount(0);
});

test('component shares resolve a multi-skill core into precise weighted growth', async ({ page }) => {
  await connect(page);
  await page.locator('#total-damage').fill('120');
  await page.locator('#battle-seconds').fill('120');
  await page.locator('#boss-hp').fill('900');
  await page.locator('#boss-limit').fill('10');
  await expect(page.locator('#boss-goal-gap')).toHaveText('+50%');
  const linked = row(page, '시험 연계 코어');
  await linked.locator('[data-hexa-share]').fill('40');
  await linked.locator('[data-hexa-enabled]').check();
  await expect(page.locator('#hexa-growth')).toHaveText(/4.*8%/);
  await linked.locator('[data-hexa-detail]').check();
  const components = linked.locator('[data-hexa-component]');
  await expect(components).toHaveCount(2);
  await components.nth(0).fill('10');
  await components.nth(1).fill('30');
  await expect(linked.locator('[data-hexa-share]')).toHaveValue('40');
  await expect(page.locator('#hexa-growth')).toHaveText('+7%');
  await expect(page.locator('#hexa-score')).toHaveText('46,962점');
  await expect(page.locator('#hexa-coverage')).toContainText('40%');
  await page.locator('#boss-hp').fill('600');
  await expect(page.locator('#boss-estimate')).toHaveText('9분 21초');
  await expect(page.locator('#boss-hexa-comparison')).toHaveText('10분 0초 → 9분 21초');
  await expect(page.locator('#boss-time-saved')).toHaveText('39.25초 단축');
  await expect(page.locator('#boss-goal-gap')).toHaveText('39.3초');
  await page.locator('#hexa-reset').click();
  await expect(page.locator('[data-hexa-enabled]:checked')).toHaveCount(0);
  await components.nth(0).fill('-10');
  await components.nth(1).fill('10');
  await expect(linked.locator('[data-hexa-share]')).toHaveValue('0');
  await expect(page.locator('#hexa-result .error')).toBeVisible();
  await components.nth(1).fill('20');
  await expect(linked.locator('[data-hexa-share]')).toHaveValue('10');
  await expect(page.locator('#hexa-result .error')).toBeVisible();
  await components.nth(0).fill('10');
  await components.nth(1).fill('30');
  await linked.locator('[data-hexa-enabled]').check();
  await expect(page.locator('#hexa-growth')).toHaveText('+7%');
});

test('practice imports per-skill shares without replacing the whole-damage denominator', async ({ page }) => {
  await connect(page, { componentReplay: true });
  await page.locator('#load-practice').click();
  await expect(page.locator('#hexa-source')).toHaveValue('practice');
  const linked = row(page, '시험 연계 코어');
  const components = linked.locator('[data-hexa-component]');
  await expect(linked.locator('[data-hexa-share]')).toHaveValue('40');
  await expect(components).toHaveCount(2);
  await expect(components.nth(0)).toHaveValue('10');
  await expect(components.nth(1)).toHaveValue('30');
  await expect(components.nth(0)).toHaveJSProperty('readOnly', true);
  await expect(components.nth(1)).toHaveJSProperty('readOnly', true);
  await linked.locator('[data-hexa-enabled]').check();
  await expect(page.locator('#hexa-growth')).toHaveText('+7%');
  await expect(page.locator('#hexa-coverage')).toContainText('90%');
  await expect(page.locator('#hexa-coverage')).toContainText('40%');
});
