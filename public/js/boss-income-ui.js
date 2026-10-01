import { incomeFor } from './boss-income.js';
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const format = value => `${value.toLocaleString('ko-KR')} 메소`;
const labels = { daily: '일일', weekly: '주간', monthly: '월간', other: '주기 미확인' };
export function createIncomeView(host) {
  const overrides = new Map();
  let open = new Set();
  let entries = [], date = '';
  function render(nextEntries = entries, nextDate = date) {
    if (host.querySelector('.income-characters')) open = new Set([...host.querySelectorAll('.income-characters > details[open]')].map(node => node.dataset.character));
    entries = nextEntries; date = nextDate;
    host.hidden = !entries.length;
    if (!entries.length) { host.replaceChildren(); return; }
    const result = incomeFor(entries, date, overrides);
    const currencies = ['daily', 'weekly', 'monthly', ...(result.characters.some(c => c.rows.some(r => r.cycle === 'other')) ? ['other'] : [])];
    host.innerHTML = `<div class="scheduler-toolbar"><h2>보스 결정석 예상 수익</h2><span class="hint">${escape(date)} 조회 기록 기준 · 판매 제한 적용 전</span></div>
      <p class="hint income-intro">완료한 보스를 모두 집계합니다. 위 일정 필터와 무관하며, 일일은 해당 날짜·주간은 해당 주·월간은 해당 월의 완료 기록입니다.</p>
      <div class="income-totals">${currencies.map(cycle => `<div><span>${labels[cycle]} 완료분${result.missing || result.failed ? ' · 확인된 금액' : ''}</span><strong data-income-total="${cycle}">${format(result.totals[cycle])}</strong></div>`).join('')}</div>
      <p class="hint">기본 파티 인원은 1명(솔로)입니다. 보스별 인원을 바꾸면 1인 몫을 다시 계산합니다. API에는 파티 인원·결정석 판매 여부가 없으므로 실제 입금액과 다를 수 있습니다. 드롭 아이템·메멘토 큐브는 포함하지 않습니다.</p>
      ${result.missing || result.failed ? `<p class="error" role="status">${result.missing ? `가격 또는 인원 확인이 필요한 ${result.missing}건은 합계에서 제외했습니다. ` : ''}${result.failed ? `${result.failed}명은 보스 기록을 조회하지 못해 합계에서 제외했습니다.` : ''}</p>` : ''}
      <div class="income-characters">${result.characters.map(c => `<details data-character="${escape(c.character.ocid)}" ${open.has(c.character.ocid) ? 'open' : ''}><summary><strong>${escape(c.character.character_name)}</strong><span>${c.available ? currencies.map(cycle => `${labels[cycle]} ${format(c.sums[cycle])}`).join(' · ') : '보스 정보 없음'}${c.missing ? ` · ${c.missing}건 확인 필요` : ''}</span></summary>${c.available ? c.rows.length ? `<div class="income-scroll"><table><thead><tr><th scope="col">포함</th><th scope="col">완료한 보스</th><th scope="col">결정석 가격 (1인 기준)</th><th scope="col">파티 인원</th><th scope="col">내 몫</th></tr></thead><tbody>${c.rows.map(row => `<tr data-income-row="${escape(row.id)}"><td><input type="checkbox" data-setting="included" aria-label="${escape(row.name)} ${escape(row.difficulty)} 수익 포함" ${row.included ? 'checked' : ''}></td><th scope="row">${escape(row.name)} · ${escape(row.difficulty)}<small>${escape(row.rawCycle || '주기 미확인')}</small></th><td><input type="number" data-setting="price" aria-label="${escape(row.name)} ${escape(row.difficulty)} 결정석 가격" min="0" max="1000000000000" step="1" placeholder="가격 직접 입력" value="${row.price ?? ''}"><small>${row.base === null ? '공식 가격 미확인 · 직접 입력' : overrides.get(row.id)?.price !== undefined ? '직접 입력한 가격' : '공식 가격 적용'}</small></td><td><select data-setting="party" aria-label="${escape(row.name)} ${escape(row.difficulty)} 파티 인원">${[1, 2, 3, 4, 5, 6].map(n => `<option value="${n}" ${n === row.party ? 'selected' : ''}>${n}명${n === 1 ? ' (솔로)' : ''}</option>`).join('')}</select></td><td class="income-value">${!row.included ? '제외' : row.value === null ? '확인 필요' : format(row.value)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="hint">이 날짜의 완료한 보스 기록이 없습니다.</p>' : `<p class="hint">${escape(c.error || '보스 기록이 제공되지 않았습니다.')}</p>`}</details>`).join('')}</div>
      <details class="income-notes"><summary>가격·계산 기준</summary><p class="hint">1인 몫 = 결정석 가격 ÷ 파티 인원 (소수점 버림). 동일 기록은 한 번만 계산하며 날짜를 바꾸거나 재조회해도 누적하지 않습니다. 게임에서 받은 결정석 가격과 다르면 직접 수정해주세요. 보스별 설정은 연결을 해제하거나 페이지를 새로고침하면 초기화됩니다.</p><p class="hint">월드의 결정석 판매 제한과 이미 판매한 수량은 적용하지 않았습니다. 판매할 수 없는 결정석은 해당 보스의 ‘포함’을 해제해주세요. 캐릭터당 주간 12개 제한은 2026년 9월 17일 삭제되었습니다.</p><p class="hint">가격표: <a href="https://maplestory.nexon.com/news/update/806" target="_blank" rel="noopener noreferrer">6월 18일 공식 업데이트</a> · <a href="https://maplestory.nexon.com/news/update/813" target="_blank" rel="noopener noreferrer">9월 17일 공식 업데이트</a>. 검은 마법사의 변경 가격은 10월 1일부터 적용합니다. 가격이 확인되지 않은 보스는 입력 전까지 제외합니다.</p><button type="button" data-reset-income>가격·파티 인원 초기화</button></details>`;
  }
  host.addEventListener('change', event => {
    const row = event.target.closest('[data-income-row]'), setting = event.target.dataset.setting;
    if (!row || !setting) return;
    const id = row.dataset.incomeRow;
    overrides.set(id, { ...overrides.get(id), [setting]: setting === 'included' ? event.target.checked : event.target.value });
    render();
  });
  host.addEventListener('click', event => { if (event.target.closest('[data-reset-income]')) { overrides.clear(); render(); } });
  return { render, reset() { overrides.clear(); render([], ''); open.clear(); } };
}
