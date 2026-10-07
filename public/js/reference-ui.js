import { projectReference, compareObserved, REFERENCE_MAX } from './reference-model.js';

const fmt = value => value.toLocaleString('ko-KR', { maximumFractionDigits: 2 });
const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const range = (a, b) => a === b ? fmt(a) : `${fmt(a)} ~ ${fmt(b)}`;

export function createReferenceView(root, { getBasic, getPrecision }) {
  const $ = id => root.querySelector(`#${id}`);
  let anchor = null, lastScenario = '';
  root.innerHTML = `<div class="combat-section-heading"><h2>기준값으로 환산 예측</h2><span class="badge">보스380 일반 환산</span></div>
    <p class="hint">같은 조건에서 확인한 환산값을 기준으로, 스탯 변경과 HEXA 강화 후의 환산을 예측합니다. HEXA 환산 수치는 입력하지 마세요.</p>
    <div class="combat-fields">
      <label class="field">변화량 계산 방식<select id="reference-source"><option value="basic">기본 스탯 비교</option><option value="precision">스킬 보정 + HEXA 비교</option></select></label>
      <label class="field">기준 보스380 일반 환산<input id="reference-value" type="number" min="1" max="${REFERENCE_MAX}" step="1" placeholder="같은 조건의 환산값 입력"></label>
    </div>
    <p class="hint" id="reference-source-note"></p>
    <label class="precision-check"><input id="reference-confirm" type="checkbox">기준 환산의 캐릭터·직업·장비·프리셋·버프·측정 시점이 기준 스탯과 같습니다.</label>
    <div><button id="reference-capture" type="button">현재 기준 저장</button> <button id="reference-clear" type="button">기준 해제</button></div>
    <div id="reference-output" aria-live="polite"></div>
    <label class="field">변경 후 실제 환산으로 검증 (선택)<input id="reference-observed" type="number" min="1" step="1" placeholder="변경한 조건을 사이트에서 확인한 값"></label>
    <p id="reference-validation" class="hint" aria-live="polite"></p>
    <details><summary>예측 방법과 한계</summary><p class="hint">예전 프로젝트의 비선형 보스380 곡선으로 기준 환산을 피해량으로 변환하고, 스탯·스킬 변화 비율을 적용한 뒤 다시 환산으로 변환합니다. 기준값 재현은 정확도 검증이 아닙니다. 과거 곡선의 현재 패치 적합성과 변경 후 예측 오차는 별도 검증이 필요합니다. 지원 범위는 1~${fmt(REFERENCE_MAX)}이며 범위 밖은 추정하지 않습니다.</p><p class="hint">직업·스킬 구성·버프 가동률이 달라지는 변경은 이 예측으로 비교할 수 없습니다. 기본 스탯 비교에는 HEXA 강화가 포함되지 않습니다. 스킬 보정 방식은 측정 당시 점유율을 고정하고 선택한 HEXA 효과를 스킬별로 결합합니다.</p></details>`;
  function basis() {
    if ($('reference-source').value === 'precision') return getPrecision();
    const result = getBasic();
    return { ok: result.ok, message: result.message, baselineScore: result.score, minScore: result.score, maxScore: result.score, signature: 'basic', scenario: result.scenario };
  }
  function clear(message = '기준 스탯을 준비하고 같은 조건의 일반 환산을 입력해주세요.') {
    anchor = null; lastScenario = ''; $('reference-confirm').checked = false;
    $('reference-observed').value = ''; $('reference-validation').textContent = '';
    $('reference-output').innerHTML = `<p class="hint">${esc(message)}</p>`;
  }
  function refresh() {
    $('reference-source-note').textContent = $('reference-source').value === 'basic'
      ? '아래 기본 스탯의 현재 값을 기준으로 저장한 뒤 변경 후 스탯을 입력하세요.'
      : '스킬 보정 패널의 측정 당시 스탯을 기준으로 저장합니다. 변경 후 스탯과 선택한 HEXA 강화가 예측에 반영됩니다.';
    if (!anchor) return;
    const current = basis();
    if (!current.ok || current.signature !== anchor.signature) {
      clear('측정 기준이나 스킬 구성이 변경되었거나 입력이 불완전합니다. 같은 조건의 기준값을 다시 저장해주세요.');
      return;
    }
    const scenario = JSON.stringify([current.minScore, current.maxScore, current.scenario]);
    if (scenario !== lastScenario) $('reference-observed').value = '';
    lastScenario = scenario;
    const result = projectReference({ ...anchor, minScore: current.minScore, maxScore: current.maxScore, confirmed: true });
    $('reference-output').innerHTML = result.ok
      ? `<div class="metric-grid"><div class="metric"><span>저장한 기준 일반 환산</span><strong>${fmt(result.reference)}</strong></div><div class="metric accent"><span>변경 후 예상 일반 환산</span><strong id="reference-prediction">${range(result.min, result.max)}</strong><p class="hint">기준 대비 ${range(result.min - result.reference, result.max - result.reference)} · 피해량 변화 ${range((result.minRatio - 1) * 100, (result.maxRatio - 1) * 100)}%</p></div></div><p class="hint">기준값 보정 예측 · 사이트 자동 조회 결과가 아닙니다.</p>`
      : `<p class="notice">${esc(result.message)}</p>`;
    const comparison = compareObserved(result, $('reference-observed').value);
    $('reference-validation').textContent = comparison
      ? `입력한 실제 환산 대비 차이 ${range(comparison.minDelta, comparison.maxDelta)} (${range(comparison.minPercent, comparison.maxPercent)}%). 한 조건의 비교이며 전체 정확도를 뜻하지 않습니다.`
      : '';
  }
  $('reference-capture').addEventListener('click', () => {
    const current = basis();
    const candidate = { reference: $('reference-value').value, baselineScore: current.baselineScore, signature: current.signature };
    const result = projectReference({ ...candidate, minScore: current.minScore, maxScore: current.maxScore, confirmed: $('reference-confirm').checked });
    if (!current.ok || !result.ok) {
      clear(current.ok ? result.message : current.message || '기준 스탯을 먼저 입력해주세요.');
      return;
    }
    anchor = candidate; lastScenario = ''; refresh();
  });
  for (const id of ['reference-source', 'reference-value', 'reference-confirm']) $(id).addEventListener('input', () => {
    const confirmed = $('reference-confirm').checked;
    clear();
    if (id === 'reference-confirm') $('reference-confirm').checked = confirmed;
    refresh();
  });
  $('reference-clear').addEventListener('click', () => clear());
  $('reference-observed').addEventListener('input', refresh);
  clear(); refresh();
  return { refresh, reset() { $('reference-value').value = ''; clear(); } };
}
