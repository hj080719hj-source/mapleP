import test from 'node:test';
import assert from 'node:assert/strict';
import { loadCharacter, loadPractice } from '../public/js/character-api.js';

const fakeKey = 'test-only-fake-api-key';
const basic = { character_name: '테스트', character_class: '루미너스', character_level: 291 };
const stats = { final_stat: [{ stat_name: 'INT', stat_value: '54250' }] };
const equipment = { preset_no: 3, item_equipment: [] };
const hexa = { character_hexa_core_equipment: [] };
const skills = { character_skill_grade: '6', character_skill: [{ skill_name: '앱솔루트 스페이스', skill_level: 18, skill_description: '테스트 스킬 설명' }] };
const good = [
  { ocid: 'fake-ocid' }, basic, stats, equipment, hexa, skills,
];

function fixture(responses = good) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: new URL(url), options });
    const response = responses[calls.length - 1];
    assert.notEqual(response, undefined, 'Unexpected extra request');
    if (response instanceof Error) throw response;
    if (typeof response === 'function') return response(url, options);
    return new Response(JSON.stringify(response), { status: 200 });
  };
  return { calls, fetchImpl, load: options => loadCharacter({ name: '테스트', apiKey: fakeKey, fetchImpl, delayMs: 0, ...options }) };
}

function http(status) {
  // An untrusted server response must never reach the error message.
  return () => new Response(JSON.stringify({ error: { message: fakeKey } }), { status });
}

test('character loader preserves raw data and only sends the key to the official host header', async () => {
  const { load, calls } = fixture();
  const progress = [];
  const result = await load({ name: '  테스트  ', onProgress: message => progress.push(message) });
  assert.deepEqual(result.basic, basic);
  assert.equal(result.ocid, 'fake-ocid');
  assert.deepEqual(result.stats, stats);
  assert.deepEqual(result.equipment, equipment);
  assert.deepEqual(result.hexa, hexa);
  assert.deepEqual(result.skills, skills);
  assert.deepEqual(result.errors, []);
  assert.ok(Number.isFinite(Date.parse(result.loadedAt)));
  assert.equal(calls.length, 6);
  assert.deepEqual(calls.map(call => call.url.pathname), [
    '/maplestory/v1/id', '/maplestory/v1/character/basic', '/maplestory/v1/character/stat',
    '/maplestory/v1/character/item-equipment', '/maplestory/v1/character/hexamatrix', '/maplestory/v1/character/skill',
  ]);
  assert.equal(calls[0].url.searchParams.get('character_name'), '테스트');
  assert.equal(calls[5].url.searchParams.get('character_skill_grade'), '6');
  assert.equal(calls[5].url.searchParams.get('ocid'), 'fake-ocid');
  for (const [index, { url, options }] of calls.entries()) {
    assert.equal(url.origin, 'https://open.api.nexon.com');
    assert.equal(url.search.includes(fakeKey), false);
    if (index) assert.equal(url.searchParams.get('ocid'), 'fake-ocid');
    assert.equal(options.headers['x-nxopen-api-key'], fakeKey);
    assert.equal(options.credentials, 'omit');
    assert.equal(options.referrerPolicy, 'no-referrer');
    assert.equal(options.cache, 'no-store');
    assert.equal(options.redirect, 'error');
    assert.ok(options.signal instanceof AbortSignal);
  }
  assert.ok(progress.length >= 5);
  assert.equal(JSON.stringify(result).includes(fakeKey), false);
  assert.equal(progress.join('').includes(fakeKey), false);
});

test('missing required identity, basic data, or stats stops before optional requests', async () => {
  for (const [responses, expectedCalls] of [
    [[{}], 1], [[good[0], {}], 2], [[good[0], basic, { final_stat: [] }], 3],
  ]) {
    const { load, calls } = fixture(responses);
    await assert.rejects(load(), /정보|능력치/);
    assert.equal(calls.length, expectedCalls);
  }
});

test('optional failure preserves required data and explicitly reports missing data', async () => {
  const { load } = fixture([good[0], basic, stats, http(500), {}, skills]);
  const result = await load();
  assert.deepEqual(result.stats, stats);
  assert.equal(result.equipment, null);
  assert.equal(result.hexa, null);
  assert.deepEqual(result.skills, skills);
  assert.equal(result.errors.length, 2);
  assert.match(result.errors[0], /^장비: .*서버/);
  assert.match(result.errors[1], /^HEXA 코어: .*제공되지/);
  assert.equal(result.errors.join('').includes(fakeKey), false);
});

test('authentication failures also stop optional requests immediately', async () => {
  for (const status of [401, 403]) {
    const { load, calls } = fixture([good[0], basic, stats, http(status)]);
    await assert.rejects(load(), error => error.status === status && /API 키/.test(error.message) && !error.message.includes(fakeKey));
    assert.equal(calls.length, 4);
  }
});

test('sixth-job skill failure is optional and leaves other data intact', async () => {
  for (const missing of [{}, http(500)]) {
    const { load, calls } = fixture([...good.slice(0, 5), missing]);
    const result = await load();
    assert.deepEqual(result.stats, stats);
    assert.deepEqual(result.hexa, hexa);
    assert.equal(result.skills, null);
    assert.equal(result.errors.length, 1);
    assert.match(result.errors[0], /^6차 스킬: /);
    assert.equal(calls.length, 6);
  }
});

test('sixth-job skill request preserves authentication and cancellation failures', async () => {
  const denied = fixture([...good.slice(0, 5), http(403)]);
  await assert.rejects(denied.load(), error => error.status === 403);
  assert.equal(denied.calls.length, 6);

  const controller = new AbortController();
  const aborted = fixture([...good.slice(0, 5), (_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(new Error(fakeKey)), { once: true });
    controller.abort();
  })]);
  await assert.rejects(aborted.load({ signal: controller.signal }), error => error.name === 'AbortError' && !error.message.includes(fakeKey));
  assert.equal(aborted.calls.length, 6);
});

test('rate limit retries succeed, but retry count is bounded at two', async () => {
  const successful = fixture([http(429), http(429), ...good]);
  const result = await successful.load();
  assert.deepEqual(result.stats, stats);
  assert.equal(successful.calls.length, 8);
  const exhausted = fixture([http(429), http(429), http(429)]);
  await assert.rejects(exhausted.load(), error => error.status === 429 && /조회 한도/.test(error.message));
  assert.equal(exhausted.calls.length, 3);
});

test('server and network messages are safe, including response JSON failures', async () => {
  for (const response of [http(400), http(403), http(500), new Error(fakeKey), () => ({ ok: true, status: 200, json: async () => { throw new Error(fakeKey); } })]) {
    const { load } = fixture([response]);
    await assert.rejects(load(), error => error.message.length > 0 && !error.message.includes(fakeKey));
  }
});

test('validation and an already-aborted signal do not send any requests', async () => {
  const { load, calls } = fixture();
  await assert.rejects(load({ name: ' ' }), /캐릭터 이름/);
  await assert.rejects(load({ apiKey: ' ' }), /API 키/);
  const controller = new AbortController();
  controller.abort(new Error(fakeKey));
  await assert.rejects(load({ signal: controller.signal }), error => error.name === 'AbortError' && !error.message.includes(fakeKey));
  assert.equal(calls.length, 0);
});

test('cancellation interrupts an in-flight request and stops all subsequent work', async () => {
  const controller = new AbortController();
  const { load, calls } = fixture([(_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(new Error(fakeKey)), { once: true });
    controller.abort(new Error(fakeKey));
  })]);
  await assert.rejects(load({ signal: controller.signal }), error => error.name === 'AbortError' && !error.message.includes(fakeKey));
  assert.equal(calls.length, 1);
});

test('cancellation interrupts rate-limit retry waits without making another request', async () => {
  const controller = new AbortController();
  const { load, calls } = fixture([http(429)]);
  await assert.rejects(load({
    signal: controller.signal,
    delayMs: 1000,
    onProgress: message => { if (message.includes('다시 시도')) setTimeout(() => controller.abort(), 5); },
  }), error => error.name === 'AbortError');
  assert.equal(calls.length, 1);
});

const latestReplay = { period_no: 3, register_date: '2026-10-03T10:00:00+09:00', replay_id: 'latest-replay' };
const practiceResult = { total_play_time: 360000, total_damage: 360000000000000, total_dps: 1000000000000 };
const practiceCharacter = { basic_object: basic, stat_object: { basic_stat_object: stats } };
function practiceFixture(responses) {
  const { calls, fetchImpl } = fixture(responses);
  return { calls, load: options => loadPractice({ ocid: 'fake-ocid', apiKey: fakeKey, delayMs: 0, fetchImpl, ...options }) };
}

test('practice loader selects latest registered record and retains measured-time units and snapshot', async () => {
  const { load, calls } = practiceFixture([
    { replay_list: [
      { period_no: 1, register_date: '2026-09-27T10:00:00+09:00', replay_id: 'old-replay' },
      latestReplay,
      { period_no: 2, register_date: '2026-10-02T10:00:00+09:00', replay_id: 'other-replay' },
    ] }, practiceResult, practiceCharacter,
  ]);
  const result = await load();
  assert.deepEqual(result.replay, latestReplay);
  assert.deepEqual(result.result, practiceResult);
  assert.equal(result.result.total_play_time, 360000, 'API milliseconds are preserved');
  assert.deepEqual(result.characterInfo, practiceCharacter);
  assert.ok(Number.isFinite(Date.parse(result.loadedAt)));
  assert.deepEqual(calls.map(call => call.url.pathname), [
    '/maplestory/v1/battle-practice/replay-id', '/maplestory/v1/battle-practice/result', '/maplestory/v1/battle-practice/character-info',
  ]);
  assert.equal(calls[0].url.searchParams.get('ocid'), 'fake-ocid');
  for (const { url, options } of calls) {
    assert.equal(url.origin, 'https://open.api.nexon.com');
    assert.equal(url.href.includes(fakeKey), false);
    assert.equal(options.headers['x-nxopen-api-key'], fakeKey);
    assert.equal(options.redirect, 'error');
  }
  assert.equal(calls[1].url.searchParams.get('replay_id'), 'latest-replay');
  assert.equal(calls[2].url.searchParams.get('replay_id'), 'latest-replay');
});

test('only an explicitly empty practice list returns null', async () => {
  const empty = practiceFixture([{ replay_list: [] }]);
  assert.equal(await empty.load(), null);
  assert.equal(empty.calls.length, 1);
  for (const records of [{}, { replay_list: [{ replay_id: 'broken', register_date: 'invalid' }] }]) {
    const { load } = practiceFixture([records]);
    await assert.rejects(load(), /연무장 기록/);
  }
});

test('practice result requires valid measurement data and character snapshot', async () => {
  for (const result of [{}, { ...practiceResult, total_play_time: 0 }, { ...practiceResult, total_damage: null }, { ...practiceResult, total_dps: '' }]) {
    const { load, calls } = practiceFixture([{ replay_list: [latestReplay] }, result]);
    await assert.rejects(load(), /측정 시간이나 데미지/);
    assert.equal(calls.length, 2);
  }
  const { load } = practiceFixture([{ replay_list: [latestReplay] }, practiceResult, {}]);
  await assert.rejects(load(), /입장 당시의 캐릭터 능력치/);
});

test('practice authentication errors stop and rate limits share bounded retries', async () => {
  const denied = practiceFixture([{ replay_list: [latestReplay] }, http(403)]);
  await assert.rejects(denied.load(), error => error.status === 403 && !error.message.includes(fakeKey));
  assert.equal(denied.calls.length, 2);
  const limited = practiceFixture([http(429), http(429), http(429)]);
  await assert.rejects(limited.load(), error => error.status === 429);
  assert.equal(limited.calls.length, 3);
});

test('practice supports immediate cancellation and does not query without character identity', async () => {
  const { load, calls } = practiceFixture([]);
  await assert.rejects(load({ ocid: '' }), /캐릭터를 먼저/);
  const controller = new AbortController();
  controller.abort(new Error(fakeKey));
  await assert.rejects(load({ signal: controller.signal }), error => error.name === 'AbortError' && !error.message.includes(fakeKey));
  assert.equal(calls.length, 0);
});

test('every request sets a 20-second timeout with a safe timeout error', async context => {
  const configured = [];
  context.mock.method(AbortSignal, 'timeout', ms => {
    configured.push(ms);
    return AbortSignal.abort(new DOMException('Timed out', 'TimeoutError'));
  });
  const { load } = fixture([new Error(fakeKey)]);
  await assert.rejects(load(), error => /응답 시간이 초과/.test(error.message) && !error.message.includes(fakeKey));
  assert.deepEqual(configured, [20000]);
});
