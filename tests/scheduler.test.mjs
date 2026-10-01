import test from 'node:test';
import assert from 'node:assert/strict';
import { activitiesFrom, scheduleRows, koreanDate, charactersFrom } from '../public/js/scheduler-data.js';
test('Korean date boundary and 14-day window', () => {
  assert.equal(koreanDate(new Date('2026-09-30T15:00:00Z')), '2026-10-01');
  assert.equal(koreanDate(new Date('2026-09-30T15:00:00Z'), 14), '2026-09-17');
});
test('official quest and count semantics preserve unknown states', () => {
  const rows = activitiesFrom({ daily_contents: [
    { type: 'quest', quest_state: '2', now_count: 0, max_count: 0 },
    { type: 'quest', quest_state: '1', now_count: 9, max_count: 1 },
    { type: 'contents', now_count: 1, max_count: 1 },
    { type: 'contents', now_count: 0, max_count: 0 },
  ], boss_contents: [{ complete_flag: 'false' }, { complete_flag: 'true' }, {}] });
  assert.deepEqual(rows.map(row => row.done), [true, false, true, null, false, true, null]);
});
test('matrix keeps distinct boss difficulty/cycle, missing data and failures', () => {
  const boss = { content_name: '보스', difficulty: '노멀', cycle: '주간', registration_flag: 'true', complete_flag: 'false' };
  const entries = [{ data: { boss_contents: [boss, { ...boss, difficulty: '하드', complete_flag: 'true' }] } }, { data: {} }, { error: '실패' }];
  const rows = scheduleRows(entries);
  assert.equal(rows.length, 2); assert.equal(rows[0].cells[1], null); assert.equal(rows[0].cells[2].error, '실패');
  assert.equal(scheduleRows(entries, { unfinishedOnly: true }).length, 1);
  assert.equal(scheduleRows([{ data: { boss_contents: [{ ...boss, registration_flag: 'false' }] } }]).length, 0);
});
test('account list flattens accounts, deduplicates and sorts levels', () => {
  assert.deepEqual(charactersFrom({ account_list: [{ character_list: [{ ocid: 'a', character_level: 200 }] }, { character_list: [{ ocid: 'b', character_level: 280 }, { ocid: 'a', character_level: 200 }] }] }).map(c => c.ocid), ['b', 'a']);
  assert.throws(() => charactersFrom({}));
});
