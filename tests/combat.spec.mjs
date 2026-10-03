import { test, expect } from '@playwright/test';

const fakeKey = 'combat-browser-test-only-key';
const currentStats = {
  '최소 스탯공격력': 90000000, '최대 스탯공격력': 100000000,
  '데미지': 100, '보스 몬스터 데미지': 300, '크리티컬 확률': 100,
  '크리티컬 데미지': 65, '방어율 무시': 98, 'INT': 50000,
  'STR': 4000, 'DEX': 4000, 'LUK': 7000, '전투력': 140000000,
  '최종 데미지': 114, '아케인포스': 1350, '어센틱포스': 730,
};
const statsResponse = values => ({ final_stat: Object.entries(values).map(([stat_name, value]) => ({ stat_name, stat_value: String(value) })) });
const person = { character_name: '환산테스트', character_class: '루미너스', character_level: 291, world_name: '엘리시움' };
const gear = (name, extra = {}) => ({ item_name: name, item_equipment_slot: '반지1', starforce: '22', ...extra });
const equipment = {
  preset_no: 3,
  item_equipment: [gear('드롭 반지', { potential_option_1: '아이템 드롭률 : +20%' })],
  item_equipment_preset_1: [gear('리스트레인트 링', { special_ring_level: 4 })],
  item_equipment_preset_2: [gear('리스크테이커 링', { special_ring_level: 4 })],
  item_equipment_preset_3: [gear('드롭 반지', { potential_option_1: '아이템 드롭률 : +20%' })],
};
const newestReplay = { replay_id: 'record-latest', register_date: '2026-10-02T12:00:00+09:00', period_no: 8 };
const oldStats = statsResponse({ ...currentStats, '최소 스탯공격력': 45000000, '최대 스탯공격력': 50000000 });

async function mockApi(page, options = {}) {
  const calls = [];
  await page.route('https://open.api.nexon.com/**', async route => {
    const request = route.request(), url = new URL(request.url());
    expect(request.headers()['x-nxopen-api-key']).toBe(fakeKey);
    expect(url.href).not.toContain(fakeKey);
    expect(url.origin).toBe('https://open.api.nexon.com');
    calls.push(url);
    const path = url.pathname.replace('/maplestory/v1/', '');
    if (options.hold?.(path, route)) return;
    if (path === 'id' && url.searchParams.get('character_name') === '없는캐릭터') {
      return route.fulfill({ status: 400, json: { error: { message: 'Untrusted response' } } });
    }
    if (path === 'battle-practice/replay-id' && options.practiceError) {
      return route.fulfill({ status: options.practiceError, json: { error: { code: 'OPENAPI00004', message: fakeKey } } });
    }
    const responses = {
      id: { ocid: 'character-fake' },
      'character/basic': person,
      'character/stat': statsResponse(currentStats),
      'character/item-equipment': equipment,
      'character/hexamatrix': { character_hexa_core_equipment: [
        { hexa_core_name: '앱솔루트 스페이스', hexa_core_level: 18, hexa_core_type: '스킬 코어' },
        { hexa_core_name: '하모닉 패러독스', hexa_core_level: 20, hexa_core_type: '스킬 코어' },
      ] },
      'character/skill': { character_skill: [] },
      'battle-practice/replay-id': { replay_list: options.noReplay ? [] : [
        { replay_id: 'record-old', register_date: '2026-09-20T12:00:00+09:00', period_no: 7 },
        newestReplay,
      ] },
      'battle-practice/result': {
        total_play_time: 180000, total_damage: 180000000000000, total_dps: 1000000000000,
        end_type: '2', skill_statistic: [
          { skill_name: '앱솔루트 킬 VI', damage: 72000000000000, damage_percent: '40.00' },
          { skill_name: '앱솔루트 스페이스', damage: 108000000000000, damage_percent: '60.00' },
        ],
      },
      'battle-practice/character-info': { basic_object: { ...person, character_level: 290 }, stat_object: { basic_stat_object: oldStats } },
    };
    expect(responses[path], `Unexpected API path: ${path}`).toBeDefined();
    if (['battle-practice/result', 'battle-practice/character-info'].includes(path)) {
      expect(url.searchParams.get('replay_id')).toBe('record-latest');
    }
    await route.fulfill({ json: responses[path] });
  });
  return calls;
}

async function connect(page) {
  await page.goto('/combat.html');
  await page.locator('#character-name').fill(person.character_name);
  await page.locator('#combat-api-key').fill(fakeKey);
  await page.locator('#load-character').click();
  await expect(page.locator('#combat-status')).toContainText('스탯을 불러왔습니다');
  await expect(page.locator('#own-score')).toHaveText('43,890 점');
}

test('character API populates live score, safely clears key, and shows current preset and newer HEXA core', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await mockApi(page);
  await connect(page);
  await expect(page.locator('#combat-api-key')).toHaveValue('');
  expect(await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }))).not.toContain(fakeKey);
  expect(await page.locator('body').innerText()).not.toContain(fakeKey);
  expect(await page.evaluate(() => [...document.querySelectorAll('input')].some(input => input.value.includes('combat-browser-test-only-key')))).toBe(false);
  await expect(page.locator('#combat-results')).toContainText('착용 프리셋 3');
  const presets = page.locator('.equipment-list > div');
  await expect(presets).toHaveCount(3);
  await expect(presets.nth(0)).toContainText('리스트레인트 링 4레벨');
  await expect(presets.nth(1)).toContainText('리스크테이커 링 4레벨');
  await expect(presets.nth(2)).toContainText('현재 착용');
  await expect(presets.nth(2)).toContainText('드롭·메소 잠재 장비 1개');
  await page.getByText('HEXA 코어 2개 보기', { exact: true }).click();
  await expect(page.locator('#combat-results')).toContainText('앱솔루트 스페이스');
  await expect(page.locator('#combat-results')).toContainText('Lv.18');
  await page.locator('#boss-stat').fill('400');
  await expect(page.locator('#own-score')).toHaveText('52,668 점');
  await expect(page.locator('#score-output')).toContainText('조회값 대비 +20%');
  await page.getByRole('button', { name: '조회한 스탯으로 복원' }).click();
  await expect(page.locator('#own-score')).toHaveText('43,890 점');
  await expect(page.locator('#boss-stat')).toHaveValue('300');
  await expect(page.getByRole('button', { name: '조회한 스탯으로 복원' })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('latest practice record uses historical stats, converts milliseconds, and predicts measured boss time', async ({ page }) => {
  const calls = await mockApi(page);
  await connect(page);
  await page.locator('#load-practice').click();
  await expect(page.locator('#practice-status')).toContainText('가장 최근 등록 기록');
  await expect(page.locator('#battle-seconds')).toHaveValue('180');
  await expect(page.locator('#total-damage')).toHaveValue('180');
  await expect(page.locator('#practice-record')).toContainText('21,945점');
  await expect(page.locator('#practice-record')).toContainText('수동 종료');
  await expect(page.locator('#practice-record')).toContainText('180초 동안 180조 피해');
  await expect(page.locator('#own-score')).toHaveText('43,890 점');
  await page.getByText('스킬별 피해 점유율', { exact: true }).click();
  await expect(page.locator('#practice-record .core-list li').first()).toContainText('앱솔루트 스페이스');
  await expect(page.locator('#practice-record .core-list li').first()).toContainText('60%');
  await page.locator('#boss-hp').fill('900');
  await expect(page.locator('#boss-estimate')).toHaveText('15분 0초');
  await expect(page.locator('#boss-output')).toContainText('제한 시간 내 피해량 충족');
  await page.locator('#boss-stat').fill('400');
  await expect(page.locator('#own-score')).toHaveText('52,668 점');
  await expect(page.locator('#practice-record')).toContainText('21,945점');
  await expect(page.locator('#boss-estimate')).toHaveText('15분 0초');
  await page.locator('#uptime').fill('50');
  await expect(page.locator('#boss-estimate')).toHaveText('30분 0초');
  await page.locator('#boss-hp').fill('901');
  await expect(page.locator('#boss-output')).toContainText('제한 시간 내 피해량 부족');
  expect(calls.filter(url => url.pathname.includes('battle-practice/'))).toHaveLength(3);
});

test('unregistered practice record keeps manual measurement usable', async ({ page }) => {
  const calls = await mockApi(page, { noReplay: true });
  await connect(page);
  await page.locator('#load-practice').click();
  await expect(page.locator('#practice-status')).toContainText('등록된 연무장 기록이 없습니다');
  await expect(page.locator('#practice-record')).toBeHidden();
  await expect(page.locator('#load-practice')).toBeEnabled();
  expect(calls.filter(url => url.pathname.includes('battle-practice/'))).toHaveLength(1);
  await page.locator('#total-damage').fill('60');
  await page.locator('#battle-seconds').fill('60');
  await page.locator('#boss-hp').fill('900');
  await expect(page.locator('#boss-estimate')).toHaveText('15분 0초');
});

test('practice HTTP400 explains an unavailable query without claiming no record and permits manual input', async ({ page }) => {
  await mockApi(page, { practiceError: 400 });
  await connect(page);
  await page.locator('#load-practice').click();
  await expect(page.locator('#practice-status')).toContainText('연무장 기록을 조회할 수 없습니다');
  await expect(page.locator('#practice-status')).not.toContainText('등록된 연무장 기록이 없습니다');
  await expect(page.locator('#practice-status')).not.toContainText(fakeKey);
  await expect(page.locator('#practice-record')).toBeHidden();
  await expect(page.locator('#load-practice')).toBeEnabled();
  await expect(page.locator('#own-score')).toHaveText('43,890 점');
  await page.locator('#total-damage').fill('60');
  await page.locator('#battle-seconds').fill('60');
  await page.locator('#boss-hp').fill('900');
  await expect(page.locator('#boss-estimate')).toHaveText('15분 0초');
});

test('failed replacement character removes previous character, score, and practice data', async ({ page }) => {
  await mockApi(page);
  await connect(page);
  await page.locator('#load-practice').click();
  await expect(page.locator('#practice-record')).toBeVisible();
  await page.locator('#character-name').fill('없는캐릭터');
  await page.locator('#load-character').click();
  await expect(page.locator('#combat-status')).toContainText('조회 가능한 캐릭터인지');
  await expect(page.locator('#combat-results')).toBeHidden();
  await expect(page.locator('#combat-results')).toBeEmpty();
  await expect(page.locator('#own-score')).toHaveCount(0);
  await expect(page.locator('#practice-record')).toBeHidden();
  await expect(page.locator('#practice-record')).toBeEmpty();
  await expect(page.locator('#battle-seconds')).toHaveValue('');
  await expect(page.locator('#min-attack')).toHaveValue('');
  await expect(page.locator('#load-practice')).toBeDisabled();
  await expect(page.locator('#combat-api-key')).toHaveAttribute('required', '');
});

test('disconnect cancels a pending query and late responses cannot restore cleared state', async ({ page }) => {
  let pending;
  const calls = await mockApi(page, { hold: (path, route) => { if (path === 'id') { pending = route; return true; } return false; } });
  await page.goto('/combat.html');
  await page.locator('#character-name').fill(person.character_name);
  await page.locator('#combat-api-key').fill(fakeKey);
  await page.locator('#load-character').click();
  await expect.poll(() => Boolean(pending)).toBe(true);
  await expect(page.locator('#load-character')).toBeDisabled();
  await page.locator('#clear-character').click();
  await expect(page.locator('#combat-status')).toContainText('연결을 해제');
  await pending.fulfill({ json: { ocid: 'late-character' } });
  await expect(page.locator('#load-character')).toBeEnabled();
  await expect(page.locator('#load-practice')).toBeDisabled();
  await expect(page.locator('#combat-results')).toBeHidden();
  await expect(page.locator('#own-score')).toHaveCount(0);
  await expect(page.locator('#combat-api-key')).toHaveValue('');
  expect(calls).toHaveLength(1);
});

test('390px layout stays within viewport and all existing pages link to own calculator', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page);
  await connect(page);
  await page.locator('#load-practice').click();
  await expect(page.locator('#practice-record')).toBeVisible();
  await page.locator('#boss-hp').fill('900');
  await expect(page.locator('#boss-estimate')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await expect(page.getByRole('link', { name: '자체 환산', exact: true })).toHaveAttribute('aria-current', 'page');
  for (const path of ['/', '/gold-cube.html', '/scheduler.html']) {
    await page.goto(path);
    await expect(page.getByRole('link', { name: '자체 환산', exact: true })).toHaveAttribute('href', './combat.html');
  }
});
