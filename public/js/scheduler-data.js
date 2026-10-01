// Field definitions: https://openapi.nexon.com/ko/game/maplestory/?id=57
export const isTrue = value => value === true || value === 'true';
export function koreanDate(now = new Date(), daysAgo = 0) {
  return new Date(now.getTime() + 9 * 3600000 - daysAgo * 86400000).toISOString().slice(0, 10);
}
export function charactersFrom(data) {
  if (!Array.isArray(data?.account_list)) throw new Error('캐릭터 목록 형식을 확인할 수 없습니다.');
  return [...new Map(data.account_list.flatMap(account => account.character_list || [])
    .filter(character => typeof character.ocid === 'string' && character.ocid)
    .map(character => [character.ocid, character])).values()]
    .sort((a, b) => Number(b.character_level) - Number(a.character_level));
}
export function activitiesFrom(data) {
  return [['daily', 'daily_contents'], ['weekly', 'weekly_contents'], ['boss', 'boss_contents']].flatMap(([group, field]) =>
    (Array.isArray(data?.[field]) ? data[field] : []).map(item => {
      const registered = isTrue(item.registration_flag);
      let done = null, detail = '정보 없음';
      if (group === 'boss') {
        if ([true, false, 'true', 'false'].includes(item.complete_flag)) {
          done = isTrue(item.complete_flag); detail = done ? '완료' : '미완료';
        }
      } else if (item.type === 'quest') {
        if (['0', '1', '2'].includes(String(item.quest_state))) {
          done = String(item.quest_state) === '2';
          detail = done ? '완료' : String(item.quest_state) === '1' ? '진행 중' : '미완료';
        }
      } else if (typeof item.now_count === 'number' && typeof item.max_count === 'number' && item.max_count > 0 && item.now_count >= 0) {
        done = item.now_count >= item.max_count;
        detail = `${done ? '완료 · ' : ''}${item.now_count} / ${item.max_count}`;
      }
      return { key: JSON.stringify([group, item.content_name, item.type || '', item.difficulty || '', item.cycle || '']), group,
        name: item.content_name || '이름 없음', difficulty: item.difficulty || '', cycle: item.cycle || '', registered, done, detail };
    }));
}
export function scheduleRows(entries, { category = 'all', registeredOnly = true, unfinishedOnly = false } = {}) {
  const maps = entries.map(entry => new Map(activitiesFrom(entry.data).map(item => [item.key, item])));
  const union = new Map(maps.flatMap(map => [...map]));
  return [...union.values()].filter(row => category === 'all' || row.group === category).map(row => ({ ...row,
    cells: maps.map((map, index) => entries[index].error ? { error: entries[index].error } : map.get(row.key) || null),
  })).filter(row => !registeredOnly || row.cells.some(cell => cell?.registered))
    .filter(row => !unfinishedOnly || row.cells.some(cell => cell && !cell.error && (!registeredOnly || cell.registered) && cell.done === false));
}
