import { test, expect } from '@playwright/test';

const fakeKey = 'precision-browser-test-only-key';
const person = { character_name: '정밀테스트', character_class: '루미너스', character_level: 291, world_name: '엘리시움' };
const plainName = '기본 타격 VI';
const pierceName = '관통 타격 VI';
const buffName = '조건부 강화 VI';
const baseline = {
  minAttack: 100000000, maxAttack: 100000000, damage: 100,
  bossDamage: 300, critRate: 100, critDamage: 65, ignoreDefense: 90,
};
const statNames = {
  minAttack: '최소 스탯공격력', maxAttack: '최대 스탯공격력', damage: '데미지',
  bossDamage: '보스 몬스터 데미지', critRate: '크리티컬 확률',
  critDamage: '크리티컬 데미지', ignoreDefense: '방어율 무시',
};
const apiStats = input => ({ final_stat: Object.entries(input).map(([key, value]) => ({ stat_name: statNames[key], stat_value: String(value) })) });
const core = name => ({ hexa_core_name: name, hexa_core_type: '마스터리 코어', hexa_core_level: 10,
  hexa_core_event_level: 0, linked_skill: [{ hexa_skill_id: name }] });
const cores = [core(plainName), core(pierceName), { ...core(buffName), hexa_core_type: '공용 코어' }];
const skill = (name, effect, next) => ({ skill_name: name, skill_level: 10, skill_effect: effect,
  skill_effect_next: next, skill_description: '브라우저 테스트용 합성 스킬입니다.' });
const skills = { character_skill: [
  skill(plainName, 'MP 100 소비, 최대 6명의 적을 100%의 데미지로 6번 공격', 'MP 100 소비, 최대 6명의 적을 110%의 데미지로 6번 공격'),
  skill(pierceName, 'MP 100 소비, 최대 6명의 적을 100%의 데미지로 6번 공격\n몬스터 방어율 50% 추가 무시', 'MP 100 소비, 최대 6명의 적을 110%의 데미지로 6번 공격\n몬스터 방어율 50% 추가 무시'),
  skill(buffName, '30초 동안 보스 몬스터 공격 시 데미지 40%, 크리티컬 확률 100% 증가', '30초 동안 보스 몬스터 공격 시 데미지 41%, 크리티컬 확률 100% 증가'),
] };
const weightedDefenseRatio = (.81 / .62 + .905 / .81) / 2;

async function connect(page, { currentIgnoreDefense = 90 } = {}) {
  const responses = {
    id: { ocid: 'precision-synthetic-ocid' },
    'character/basic': person,
    'character/stat': apiStats({ ...baseline, ignoreDefense: currentIgnoreDefense }),
    'character/item-equipment': { preset_no: 1, item_equipment: [] },
    'character/hexamatrix': { character_hexa_core_equipment: cores },
    'character/skill': skills,
    'battle-practice/replay-id': { replay_list: [{ replay_id: 'precision-synthetic-replay', register_date: '2026-10-03T12:00:00+09:00', period_no: 8 }] },
    'battle-practice/result': {
      total_play_time: 120000, total_damage: 120000000000000, total_dps: 1000000000000, end_type: '2',
      skill_statistic: [
        { skill_name: plainName, damage: 60000000000000, damage_percent: '99.00' },
        { skill_name: pierceName, damage: 60000000000000, damage_percent: '1.00' },
      ],
    },
    'battle-practice/character-info': {
      basic_object: person, stat_object: { basic_stat_object: apiStats(baseline) },
      hexa_matrix_object: { hexa_core_object: { character_hexa_core_equipment: cores } },
      skill_object: skills,
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
  await page.goto('/combat.html');
  await page.locator('#character-name').fill(person.character_name);
  await page.locator('#combat-api-key').fill(fakeKey);
  await page.locator('#load-character').click();
  await expect(page.locator('#combat-status')).toContainText('스탯을 불러왔습니다');
  await expect(page.locator('#precision-panel')).toBeVisible();
}

const row = (page, name) => page.locator('#precision-rows .precision-row').filter({ hasText: name });

async function measurement(page) {
  await page.locator('#total-damage').fill('120');
  await page.locator('#battle-seconds').fill('120');
  await page.locator('#boss-hp').fill('600');
}

async function manualSetup(page, { confirm = true } = {}) {
  await page.locator('#precision-use-current').click();
  await page.locator('#precision-source-defense').fill('380');
  await row(page, plainName).locator('[data-precision-share]').fill('50');
  await row(page, pierceName).locator('[data-precision-share]').fill('50');
  await measurement(page);
  if (confirm) {
    await row(page, plainName).locator('[data-precision-confirmed]').check();
    await row(page, pierceName).locator('[data-precision-confirmed]').check();
    await page.locator('#precision-conditions').check();
  }
}

async function expectGrowth(page, percentage) {
  await expect.poll(async () => Number((await page.locator('#precision-growth').innerText()).replace(/[^\d.-]/g, ''))).toBeCloseTo(percentage, 1);
}

test('precision requires an explicit baseline, source defense, and review before reporting unchanged growth', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/combat.html');
  await expect(page.locator('#precision-panel')).toBeVisible();
  await expect(page.locator('#precision-source')).toHaveValue('manual');
  await expect(page.locator('#precision-source-defense')).toHaveValue('');
  await expect(page.locator('#precision-target-defense')).toHaveValue('380');
  await expect(page.locator('#precision-conditions')).not.toBeChecked();
  await expect(page.locator('#precision-apply-boss')).not.toBeChecked();
  await expect(page.locator('#precision-growth')).toHaveCount(0);
  await connect(page);
  await manualSetup(page, { confirm: false });
  for (const [name, value] of Object.entries(baseline)) {
    await expect(page.locator(`#precision-before-form [data-before-stat="${name}"]`)).toHaveValue(String(value));
  }
  await expect(page.locator('#precision-growth')).toHaveCount(0);
  await row(page, plainName).locator('[data-precision-confirmed]').check();
  await row(page, pierceName).locator('[data-precision-confirmed]').check();
  await expect(page.locator('#precision-growth')).toHaveCount(0);
  await page.locator('#precision-conditions').check();
  await expectGrowth(page, 0);
  await expect(page.locator('#precision-dps')).toHaveText('1조 / 초');
  expect(errors).toEqual([]);
});

test('per-skill defense ratios are weighted before projecting measured DPS and boss time', async ({ page }) => {
  await connect(page);
  await manualSetup(page);
  await page.locator('#ignore-defense').fill('95');
  await expectGrowth(page, (weightedDefenseRatio - 1) * 100);
  // The measured shares already include each skill's defense modifier. Recovering
  // the pre-modifier weights produces a different index from a raw 50/50 mean.
  await expect(page.locator('#precision-score')).toContainText('42,559');
  await expect(page.locator('#boss-estimate')).toHaveText('10분 0초');
  await page.locator('#hexa-apply-boss').uncheck();
  await page.locator('#precision-apply-boss').check();
  await expect(page.locator('#boss-estimate')).toHaveText('8분 16초');
  await expect(page.locator('#precision-dps')).toHaveText('1.2119조 / 초');
  await page.locator('#precision-apply-boss').uncheck();
  await expect(page.locator('#boss-estimate')).toHaveText('10분 0초');
});

test('missing, excessive, or unreviewed damage shares block rather than renormalize a projection', async ({ page }) => {
  await connect(page);
  await manualSetup(page);
  await expectGrowth(page, 0);
  await row(page, plainName).locator('[data-precision-share]').fill('40');
  await expect(page.locator('#precision-growth')).toHaveCount(0);
  await expect(page.locator('#precision-result')).toContainText(/100/);
  await row(page, plainName).locator('[data-precision-share]').fill('51');
  await expect(page.locator('#precision-growth')).toHaveCount(0);
  await row(page, plainName).locator('[data-precision-share]').fill('50');
  await row(page, pierceName).locator('[data-precision-confirmed]').uncheck();
  await expect(page.locator('#precision-growth')).toHaveCount(0);
  await row(page, pierceName).locator('[data-precision-confirmed]').check();
  await expectGrowth(page, 0);
  await page.locator('#precision-source-defense').fill('');
  await expect(page.locator('#precision-growth')).toHaveCount(0);
});

test('API skill modifiers are suggestions and a conditional buff never silently becomes global damage', async ({ page }) => {
  await connect(page);
  await expect(page.locator('#precision-rows [data-precision-confirmed]:checked')).toHaveCount(0);
  const pierce = row(page, pierceName);
  await pierce.locator('details > summary').click();
  await expect(pierce.locator('[data-precision-modifier="extraIED"]')).toHaveValue('50');
  await manualSetup(page, { confirm: false });
  await page.locator('#precision-conditions').check();
  await expect(page.locator('#precision-growth')).toHaveCount(0);
  await row(page, plainName).locator('[data-precision-confirmed]').check();
  await pierce.locator('[data-precision-confirmed]').check();
  await page.locator('#ignore-defense').fill('95');
  await expectGrowth(page, (weightedDefenseRatio - 1) * 100);
  await expect(row(page, buffName).locator('[data-precision-share]')).toHaveValue('0');
  await expect(row(page, buffName).locator('[data-precision-confirmed]')).not.toBeChecked();
  await row(page, buffName).locator('details > summary').click();
  await expect(row(page, buffName).locator('[data-precision-modifier="extraBoss"]')).toHaveValue('0');
  await expect(row(page, buffName).locator('[data-precision-modifier="extraCritRate"]')).toHaveValue('0');
});

test('practice keeps historical stats and raw-damage shares and rejects edited measurements', async ({ page }) => {
  await connect(page, { currentIgnoreDefense: 95 });
  await page.locator('#load-practice').click();
  await expect(page.locator('#practice-status')).toContainText('가장 최근 등록 기록');
  await page.locator('#precision-source').selectOption('practice');
  await expect(page.locator('#ignore-defense')).toHaveValue('95');
  await expect(page.locator('#precision-before-form [data-before-stat="ignoreDefense"]')).toHaveValue('90');
  await expect(row(page, plainName).locator('[data-precision-share]')).toHaveValue('50');
  await expect(row(page, pierceName).locator('[data-precision-share]')).toHaveValue('50');
  await expect(page.locator('#precision-source-defense')).toHaveValue('');
  await page.locator('#precision-source-defense').fill('380');
  await row(page, plainName).locator('[data-precision-confirmed]').check();
  await row(page, pierceName).locator('[data-precision-confirmed]').check();
  await page.locator('#precision-conditions').check();
  await expectGrowth(page, (weightedDefenseRatio - 1) * 100);
  await page.locator('#hexa-apply-boss').uncheck();
  await page.locator('#precision-apply-boss').check();
  await page.locator('#boss-hp').fill('600');
  await expect(page.locator('#boss-estimate')).toHaveText('8분 16초');
  await page.locator('#total-damage').fill('240');
  await expectGrowth(page, (weightedDefenseRatio - 1) * 100);
  await expect(page.locator('#precision-result')).toContainText('기록과 달라졌습니다');
  await expect(page.locator('#boss-estimate')).toHaveCount(0);
  await expect(page.locator('#boss-output')).toContainText(/스킬 보정/);
  await page.locator('#precision-apply-boss').uncheck();
  await expect(page.locator('#boss-estimate')).toHaveText('5분 0초');
});

test('precision and a selected HEXA projection cannot both multiply the same measured boss damage', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await connect(page);
  await manualSetup(page);
  await page.locator('#ignore-defense').fill('95');
  const hexa = page.locator('#hexa-rows .hexa-row').filter({ hasText: plainName });
  await hexa.locator('[data-hexa-share]').fill('50');
  await hexa.locator('[data-hexa-enabled]').check();
  await page.locator('#hexa-apply-boss').check();
  await page.locator('#precision-apply-boss').check();
  await expect(page.locator('#boss-estimate')).toHaveCount(0);
  await expect(page.locator('#boss-output')).toContainText(/HEXA/);
  await expect(page.locator('#boss-output')).toContainText(/스킬 보정/);
  await page.locator('#hexa-apply-boss').uncheck();
  await expect(page.locator('#boss-estimate')).toHaveText('8분 16초');
  await row(page, pierceName).locator('details > summary').click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.locator('#clear-character').click();
  await expect(page.locator('#precision-rows .precision-row')).toHaveCount(0);
  await expect(page.locator('#precision-score')).toHaveCount(0);
  await expect(page.locator('#combat-api-key')).toHaveValue('');
  expect(await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }))).not.toContain(fakeKey);
});

test('changing the measurement source, measured totals, or skill draft requires fresh confirmation', async ({ page }) => {
  await connect(page);
  await manualSetup(page);
  await expectGrowth(page, 0);
  await page.locator('#load-practice').click();
  await expect(page.locator('#practice-status')).toContainText('가장 최근 등록 기록');
  await expect(page.locator('#precision-source')).toHaveValue('practice');
  await expect(page.locator('#precision-conditions')).not.toBeChecked();
  await page.locator('#precision-source').selectOption('manual');
  await expect(page.locator('#precision-conditions')).not.toBeChecked();
  await expect(row(page, plainName).locator('[data-precision-share]')).toHaveValue('50');
  await expect(row(page, pierceName).locator('[data-precision-share]')).toHaveValue('50');
  await expect(page.locator('#precision-growth')).toHaveCount(0);
  await page.locator('#precision-conditions').check();
  await expect(page.locator('#precision-dps')).toHaveText('1조 / 초');

  await page.locator('#total-damage').fill('240');
  await expect(page.locator('#precision-conditions')).not.toBeChecked();
  await expect(page.locator('#precision-growth')).toHaveCount(0);
  await page.locator('#precision-conditions').check();
  await expect(page.locator('#precision-dps')).toHaveText('2조 / 초');
  await page.locator('#battle-seconds').fill('240');
  await expect(page.locator('#precision-conditions')).not.toBeChecked();
  await expect(page.locator('#precision-growth')).toHaveCount(0);
  await page.locator('#precision-conditions').check();
  await expect(page.locator('#precision-dps')).toHaveText('1조 / 초');

  const pierce = row(page, pierceName);
  await pierce.locator('details > summary').click();
  await expect(pierce.locator('[data-precision-summary]')).toContainText('50%');
  await pierce.locator('[data-precision-modifier="extraIED"]').fill('60');
  await expect(pierce.locator('[data-precision-summary]')).toContainText('60%');
  await expect(pierce.locator('[data-precision-summary]')).not.toContainText('50%');
  await expect(pierce.locator('[data-precision-confirmed]')).not.toBeChecked();
  await expect(page.locator('#precision-growth')).toHaveCount(0);
  await pierce.locator('[data-precision-confirmed]').check();
  await expectGrowth(page, 0);
});
