import { charactersFrom, koreanDate, scheduleRows } from './scheduler-data.js';
const $ = id => document.getElementById(id);
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const names = { daily: '일일', weekly: '주간', boss: '보스' };
let key = '', characters = [], selected = new Set(), entries = [], category = 'all', controller, revision = 0, busy = false;
let snapshotDate = '', snapshotTime = '';
function status(message, error = false) { $('status').textContent = message; $('status').className = error ? 'error' : 'hint'; }
function setBusy(value) {
  busy = value;
  for (const id of ['connect', 'refresh', 'query-date', 'today', 'select-world', 'clear-selection']) $(id).disabled = value;
  for (const input of $('characters').querySelectorAll('input')) input.disabled = value;
  $('schedule-panel').setAttribute('aria-busy', String(value));
}
async function request(path, params, signal) {
  const url = new URL(`https://open.api.nexon.com/maplestory/v1/${path}`);
  for (const [name, value] of Object.entries(params || {})) if (value) url.searchParams.set(name, value);
  let response;
  try { response = await fetch(url, { headers: { 'x-nxopen-api-key': key }, signal: AbortSignal.any([signal, AbortSignal.timeout(20000)]), cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' }); }
  catch (error) { if (signal.aborted) throw error; throw new Error('넥슨 API에 연결하지 못했습니다. 잠시 후 다시 조회해주세요.'); }
  if (!response.ok) {
    const error = new Error(response.status === 429 ? '조회 한도를 초과했습니다. 잠시 후 다시 조회해주세요.' : response.status === 401 || response.status === 403 ? 'API 키와 본인 계정의 조회 권한을 확인해주세요.' : response.status === 400 ? '조회 가능한 캐릭터·날짜인지 확인해주세요.' : '넥슨 API 조회에 실패했습니다. 다시 조회해주세요.');
    error.stop = [401, 403, 429].includes(response.status); throw error;
  }
  return response.json();
}
function reset() {
  revision++; controller?.abort(); key = ''; characters = []; selected.clear(); entries = [];
  $('api-key').value = ''; $('characters').replaceChildren(); $('schedule-table').replaceChildren();
  $('characters-panel').hidden = $('schedule-panel').hidden = $('disconnect').hidden = true;
  setBusy(false);
}
function renderCharacters() {
  const world = $('world').value;
  $('characters').innerHTML = characters.filter(c => !world || c.world_name === world).map(c => `<label class="character-choice"><input type="checkbox" value="${escape(c.ocid)}" ${selected.has(c.ocid) ? 'checked' : ''} ${busy ? 'disabled' : ''}><span>${escape(c.character_name)}<small>${escape(c.world_name)} · Lv.${escape(c.character_level)} ${escape(c.character_class)}</small></span></label>`).join('');
  $('selection-count').textContent = `${selected.size}명 선택 / 전체 ${characters.length}명`;
}
function options() { return { category, registeredOnly: $('registered-only').checked, unfinishedOnly: $('unfinished-only').checked }; }
function renderTable() {
  if (!entries.length) { $('schedule-table').innerHTML = '<p class="empty-schedule">관리할 캐릭터를 선택하고 조회해주세요.</p>'; return; }
  const rows = scheduleRows(entries, options());
  // Summary follows category/registration filters, independently of the remaining-only view.
  const summary = scheduleRows(entries, { ...options(), unfinishedOnly: false });
  const heads = entries.map((entry, index) => {
    const cells = summary.map(row => row.cells[index]).filter(cell => cell && !cell.error && (!options().registeredOnly || cell.registered) && cell.done !== null);
    return `<th scope="col">${escape(entry.character.character_name)}<small>${escape(entry.character.world_name)} · Lv.${escape(entry.character.character_level)}<br>${escape(entry.character.character_class)}</small>${entry.error ? `<small class="failed">${escape(entry.error)}</small>` : `<small class="schedule-summary">완료 ${cells.filter(cell => cell.done).length} / ${cells.length}</small>`}</th>`;
  }).join('');
  const cellHtml = cell => {
    if (cell?.error) return '<td class="failed">조회 실패</td>';
    if (!cell) return '<td class="unknown">정보 없음</td>';
    if (options().registeredOnly && !cell.registered) return '<td class="unknown">미등록</td>';
    return `<td class="${cell.done === null ? 'unknown' : cell.done ? 'done' : 'pending'}">${cell.done ? '✓ ' : ''}${escape(cell.detail)}</td>`;
  };
  $('schedule-table').innerHTML = `<table><caption class="hint">${escape(snapshotDate)} 기준 · ${entries.length}명 · ${rows.length}개 일정</caption><thead><tr><th scope="col">콘텐츠</th>${heads}</tr></thead><tbody>${rows.map(row => `<tr><th scope="row">${escape(row.name)}<small>${names[row.group]}${row.difficulty ? ` · ${escape(row.difficulty)}` : ''}${row.cycle ? ` · ${escape(row.cycle)}` : ''}</small></th>${row.cells.map(cellHtml).join('')}</tr>`).join('') || `<tr><td colspan="${entries.length + 1}">표시할 일정이 없습니다. 등록 여부와 필터를 확인해주세요.</td></tr>`}</tbody></table>`;
}
function selectionChanged() {
  entries = []; renderCharacters(); renderTable(); $('snapshot').textContent = '선택한 캐릭터를 다시 조회해주세요.';
}
function updateDateBounds() { $('query-date').min = koreanDate(new Date(), 14); $('query-date').max = koreanDate(); }
$('connect-form').addEventListener('submit', async event => {
  event.preventDefault(); if (busy) return;
  const inputKey = $('api-key').value.trim(); if (!inputKey) return;
  reset(); key = inputKey; controller = new AbortController(); const version = revision;
  $('disconnect').hidden = false; setBusy(true); status('캐릭터 목록을 불러오는 중입니다.');
  try {
    const data = await request('character/list', {}, controller.signal); if (version !== revision) return;
    characters = charactersFrom(data);
    $('world').innerHTML = '<option value="">전체 월드</option>' + [...new Set(characters.map(c => c.world_name))].map(world => `<option value="${escape(world)}">${escape(world)}</option>`).join('');
    $('characters-panel').hidden = $('schedule-panel').hidden = false;
    renderCharacters(); renderTable();
    status(characters.length ? `${characters.length}명의 캐릭터를 찾았습니다. 관리할 캐릭터를 선택해주세요.` : '조회 가능한 캐릭터가 없습니다. API 키를 발급한 계정을 확인해주세요.');
  } catch (error) { if (version === revision) { reset(); status(error.message, true); } }
  finally { if (version === revision) setBusy(false); }
});
$('disconnect').addEventListener('click', () => { reset(); status('연결을 해제하고 API 키와 조회 정보를 지웠습니다.'); });
$('world').addEventListener('change', renderCharacters);
$('characters').addEventListener('change', event => { const id = event.target.value; event.target.checked ? selected.add(id) : selected.delete(id); selectionChanged(); });
$('select-world').addEventListener('click', () => { for (const c of characters) if (!$('world').value || c.world_name === $('world').value) selected.add(c.ocid); selectionChanged(); });
$('clear-selection').addEventListener('click', () => { selected.clear(); selectionChanged(); });
$('query-date').addEventListener('change', () => { entries = []; renderTable(); $('snapshot').textContent = '변경한 날짜로 다시 조회해주세요.'; });
$('today').addEventListener('click', () => { updateDateBounds(); $('query-date').value = koreanDate(); $('query-date').dispatchEvent(new Event('change')); });
$('refresh').addEventListener('click', async () => {
  updateDateBounds(); if (busy || !key) return;
  if (!selected.size) { status('조회할 캐릭터를 먼저 선택해주세요.', true); return; }
  if (!$('query-date').reportValidity()) return;
  const date = $('query-date').value, version = revision;
  controller = new AbortController(); const signal = controller.signal;
  const chosen = characters.filter(c => selected.has(c.ocid)); entries = []; snapshotDate = date; renderTable(); setBusy(true);
  let stopped = '', failures = 0;
  for (const [index, character] of chosen.entries()) {
    if (version !== revision) return;
    status(`${index + 1} / ${chosen.length}명 조회 중 · ${character.character_name}`);
    try {
      if (stopped) throw new Error(stopped);
      const data = await request('scheduler/character-state', { ocid: character.ocid, date: date === koreanDate() ? '' : date }, signal);
      if (version !== revision) return;
      if (!data || !['daily_contents', 'weekly_contents', 'boss_contents'].some(field => Array.isArray(data[field]))) throw new Error('해당 날짜의 스케줄러 정보가 없습니다.');
      entries.push({ character, data });
    } catch (error) {
      if (version !== revision) return;
      failures++; entries.push({ character, error: error.message });
      if (error.stop) stopped = '조회가 중단되었습니다. 잠시 후 다시 조회해주세요.';
    }
    renderTable();
    if (!stopped && index < chosen.length - 1) await new Promise(resolve => setTimeout(resolve, 350));
  }
  if (version !== revision) return;
  snapshotTime = new Date().toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul' });
  $('snapshot').textContent = `${snapshotDate} 기준 · ${snapshotTime} 조회 (한국 시간) · ${chosen.length - failures}명 성공${failures ? ` / ${failures}명 실패` : ''}`;
  setBusy(false); status(failures ? '일부 캐릭터를 불러오지 못했습니다. 표의 안내를 확인하고 다시 조회해주세요.' : '조회했습니다. 게임 진행 후 새로 조회하면 완료 여부가 갱신됩니다.', Boolean(failures));
  $('refresh').textContent = '새로 조회';
});
$('category').addEventListener('click', event => {
  const button = event.target.closest('[data-category]'); if (!button) return; category = button.dataset.category;
  for (const item of $('category').children) item.setAttribute('aria-pressed', String(item === button)); renderTable();
});
for (const id of ['registered-only', 'unfinished-only']) $(id).addEventListener('change', renderTable);
updateDateBounds(); $('query-date').value = koreanDate();
