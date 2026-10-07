import { numberValue } from './combat-model.js';
import { REFERENCE_MAX } from './reference-model.js';
import { targetGap, rankUpgradePlans } from './upgrade-model.js';

const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = value => Number.isFinite(value) ? value.toLocaleString('ko-KR', { maximumFractionDigits: 2 }) : '계산 불가';
const range = (a, b) => a === b ? fmt(a) : `${fmt(a)} ~ ${fmt(b)}`;
const methods = { buy: '완제품 구매비', craft: '직접 강화 기대비용', mixed: '구매 + 강화 기대비용' };
const statNames = { minAttack: '최소 스탯공격력', maxAttack: '최대 스탯공격력', damage: '데미지 %', bossDamage: '보스 데미지 %', critRate: '크리티컬 확률 %', critDamage: '크리티컬 데미지 %', ignoreDefense: '방어율 무시 %' };
function settingsMarkup(snapshot) {
  const before = snapshot.baseline?.before || snapshot.baseline || {};
  const after = snapshot.after?.after || snapshot.after || {};
  const cores = snapshot.after?.cores || [];
  return `<p class="hint">${esc(snapshot.mode)} · 기준 → 변경 후</p><dl class="stat-list">${Object.entries(statNames).map(([key, label]) => `<div><dt>${label}</dt><dd>${fmt(numberValue(before[key]))} → ${fmt(numberValue(after[key]))}</dd></div>`).join('')}</dl>${cores.length ? `<ul class="core-list">${cores.map(core => `<li>${esc(core.name)} · Lv.${esc(core.level)} → ${esc(core.nextLevel)}</li>`).join('')}</ul>` : '<p class="hint">적용한 HEXA 강화 없음</p>'}`;
}

export function createUpgradeView(root) {
  let result = null, plans = [], serial = 0, snapshot = null;
  const $ = id => root.querySelector(`#${id}`);
  root.innerHTML = `<h3>목표 환산 · 세팅 후보 비교</h3>
    <div class="combat-fields">
      <label class="field">목표 일반 환산<input id="upgrade-target" type="number" min="1" max="${REFERENCE_MAX}" step="1" placeholder="예: 100000"></label>
      <label class="field">예산 (억 메소, 선택)<input id="upgrade-budget" type="number" min="0" step="any" placeholder="비워두면 제한 없음"></label>
    </div>
    <p id="upgrade-gap" class="notice" aria-live="polite"></p>
    <p class="hint">아래에서 변경 후 스탯·HEXA를 설정한 뒤 전체 세팅을 후보로 저장하세요. 같은 기준에서 저장한 후보 중 목표와 예산을 충족하는 세팅을 비용순으로 최대 5개 보여줍니다. 후보끼리 효과를 더하지 않습니다.</p>
    <div class="combat-fields">
      <label class="field">세팅 이름<input id="upgrade-name" type="text" maxlength="100" placeholder="예: 모자 구매 + 장갑 강화"></label>
      <label class="field">비용 종류<select id="upgrade-method"><option value="buy">완제품 구매</option><option value="craft">직접 강화</option><option value="mixed">구매 + 직접 강화</option></select></label>
      <label class="field">전체 세팅 추가 비용 (억 메소)<input id="upgrade-cost" type="number" min="0" step="any" placeholder="현재 장비 대비 추가 지출"></label>
    </div>
    <p class="hint">비용은 직접 입력합니다. 판매 대금을 반영한다면 모든 후보에 같은 기준을 적용하세요. 직접 강화는 기대비용이며 실제 지출이나 예산 내 성공을 보장하지 않습니다. 자동 시세 조회·장비 조합 탐색 기능은 아닙니다.</p>
    <div><button id="upgrade-save" type="button">현재 세팅을 후보로 저장</button> <button id="upgrade-clear" type="button">후보 모두 삭제</button></div>
    <p id="upgrade-status" class="hint" role="status"></p>
    <div id="upgrade-ranking" aria-live="polite"></div>
    <p class="hint">후보는 이 화면에서만 유지됩니다. 기준값 변경·캐릭터 재조회·새로고침 시 삭제됩니다.</p>`;
  function render() {
    const gap = targetGap($('upgrade-target').value, result);
    $('upgrade-gap').textContent = gap.ok
      ? `기준 세팅에서 목표까지 필요한 피해량 +${fmt(gap.requiredFromBaseline)}%. 현재 변경안에서 추가로 +${range(gap.additionalMin, gap.additionalMax)}% 필요. ${gap.status === 'reached' ? '예상 범위 전체가 목표 충족' : gap.status === 'uncertain' ? '예상 범위 일부만 목표 충족' : '목표 미달'}.`
      : gap.message;
    $('upgrade-save').disabled = !result?.ok || plans.length >= 20;
    if (!plans.length) { $('upgrade-ranking').innerHTML = '<p class="hint">저장한 후보가 없습니다. 최대 20개까지 비교할 수 있습니다.</p>'; return; }
    const ranking = rankUpgradePlans(plans, $('upgrade-target').value, $('upgrade-budget').value);
    if (!ranking.ok) { $('upgrade-ranking').innerHTML = `<p class="notice">${esc(ranking.message)}</p>`; return; }
    const card = (plan, recommended) => `<article class="metric upgrade-plan" data-plan-id="${plan.id}"><span>${recommended ? '목표·예산 충족' : !plan.withinBudget ? '예산 초과' : plan.gap.status === 'reached' ? '추가 충족 후보' : plan.gap.status === 'uncertain' ? '범위 일부만 충족' : '목표 미달'}</span><h4>${esc(plan.name)}</h4><strong>${fmt(plan.cost)}<small>억 메소</small></strong><p class="hint">${methods[plan.method]} · 예상 환산 ${range(plan.result.min, plan.result.max)}</p><details><summary>저장한 설정 확인</summary>${settingsMarkup(plan.snapshot)}</details><button type="button" data-remove-plan="${plan.id}">후보 삭제</button></article>`;
    $('upgrade-ranking').innerHTML = `<h4>입력한 후보 중 비용이 낮은 세팅</h4>${ranking.recommended.length ? `<div class="metric-grid">${ranking.recommended.map(p => card(p, true)).join('')}</div>` : '<p class="notice">목표와 예산을 모두 충족하는 후보가 없습니다. 범위가 있는 예측은 최솟값으로 판정합니다.</p>'}${ranking.alternatives.length ? `<h4>다른 후보</h4><div class="metric-grid">${ranking.alternatives.map(p => card(p, false)).join('')}</div>` : ''}<p class="hint">총 ${plans.length}개 후보 비교 · 전체 시장의 최저 비용을 의미하지 않습니다.</p>`;
  }
  for (const id of ['upgrade-target', 'upgrade-budget']) $(id).addEventListener('input', render);
  $('upgrade-save').addEventListener('click', () => {
    const name = $('upgrade-name').value.trim(), cost = numberValue($('upgrade-cost').value);
    if (!result?.ok || plans.length >= 20) return;
    if (!name || cost === null || cost < 0) { $('upgrade-status').textContent = '세팅 이름과 0 이상의 추가 비용을 입력해주세요.'; return; }
    plans.push({ id: ++serial, name, cost, method: $('upgrade-method').value, result: structuredClone(result), snapshot: structuredClone(snapshot) });
    $('upgrade-status').textContent = `${name} 후보를 저장했습니다.`;
    render();
  });
  $('upgrade-clear').addEventListener('click', () => { plans = []; $('upgrade-status').textContent = '후보를 삭제했습니다.'; render(); });
  $('upgrade-ranking').addEventListener('click', event => {
    const button = event.target.closest('[data-remove-plan]');
    if (button) { plans = plans.filter(p => p.id !== Number(button.dataset.removePlan)); render(); }
  });
  render();
  return {
    setResult(value, settings) { result = value; snapshot = settings; render(); },
    reset() { result = null; snapshot = null; plans = []; $('upgrade-status').textContent = ''; render(); },
  };
}
