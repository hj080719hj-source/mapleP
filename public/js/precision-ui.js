import { calculatePrecision } from './precision-model.js';
import { createPrecisionRows } from './precision-data.js';
import { inputsFromStats, numberValue, practiceMeasurement } from './combat-model.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (value, digits = 2) => Number.isFinite(value) ? value.toLocaleString('ko-KR', { maximumFractionDigits: digits }) : '정보 부족';
const statFields = { minAttack: '최소 스탯공격력', maxAttack: '최대 스탯공격력', damage: '데미지 (%)', bossDamage: '보스 데미지 (%)', critRate: '크리티컬 확률 (%)', critDamage: '크리티컬 데미지 (%)', ignoreDefense: '방어율 무시 (%)' };
const modifierFields = { extraIED: '스킬 추가 방무 (%)', extraBoss: '스킬 추가 보공 (%)', extraCritRate: '스킬 추가 크확 (%)', extraCritDamage: '스킬 추가 크뎀 (%)', extraDamage: '스킬 가산 데미지 (%)' };
const modifierSummary = row => Object.entries(modifierFields).filter(([key]) => numberValue(row[key]) > 0).map(([key, label]) => `${label.replace(' (%)', '')} ${fmt(Number(row[key]))}%`).join(' · ') || '추가 보정 0% 초안 · 스킬별 효과 확인 필요';
const sameMeasurement = (a, b) => Boolean(a && b && Math.abs(a.totalDamage - b.totalDamage) <= Math.max(1, a.totalDamage * 1e-10) && Math.abs(a.seconds - b.seconds) < 1e-6);

export function createPrecisionView(host, { getCurrentStats, getMeasurement, onChange }) {
  let character = null, practice = null, source = 'manual', rows = [], warnings = [], dataError = '', recordBefore = null, manualDraft = null, serial = 0;
  let confirmedMeasurement = null;
  host.innerHTML = `<div class="combat-section-heading"><h2>스킬 보정 환산 · 실측 기준</h2><span class="combat-badge">측정 당시 → 변경 후</span></div>
    <p class="hint">스킬별 방무·보공·크리티컬 효과와 실측 점유율로 스탯 변경 효과를 계산합니다. 현재 스탯만으로 직업 간 절대 강함을 비교하는 수치는 아닙니다.</p>
    <div id="precision-result" aria-live="polite"></div>
    <div class="precision-toolbar"><label class="field" for="precision-source">측정 기준<select id="precision-source"><option value="manual">직접 입력한 전투분석</option><option value="practice" disabled>연무장 기록</option></select></label><button type="button" id="precision-use-current">현재 입력 스탯을 측정 기준으로</button></div>
    <p id="precision-source-note" class="hint"></p>
    <details class="precision-baseline"><summary>측정 당시 스탯 확인·수정</summary><form id="precision-before-form" class="combat-fields">${Object.entries(statFields).map(([key, label]) => `<label class="field">${label}<input type="number" min="0" ${key === 'ignoreDefense' ? 'max="100"' : ''} step="any" data-before-stat="${key}" aria-label="측정 당시 ${label}" inputmode="decimal"></label>`).join('')}</form><p class="hint">변경 후 값은 <a href="#manual-panel">직접 스탯 입력</a>의 값을 사용합니다. 장비·데미지·버프를 바꾸었다면 스탯공격력도 함께 갱신해주세요.</p></details>
    <div class="combat-fields"><label class="field" for="precision-source-defense">측정 대상 방어율 (%)<input id="precision-source-defense" type="number" min="0" max="1000" step="any" placeholder="직접 확인하여 입력"></label><label class="field" for="precision-target-defense">비교 대상 방어율 (%)<input id="precision-target-defense" type="number" min="0" max="1000" step="any" value="380"></label></div>
    <p class="hint">연무장 API는 대상 방어율을 제공하지 않습니다. 일반 몬스터가 아닌 보스 조건의 측정에 사용하세요. 속성·레벨·포스 조건 차이는 이번 계산에 포함하지 않습니다.</p>
    <div class="precision-coverage" id="precision-coverage" aria-live="polite"></div>
    <p class="hint">점유율은 전체 측정 피해량 기준입니다. API에서 찾은 옵션도 검토 전에는 적용하지 않습니다. 하이퍼·강화 코어·패시브의 스킬 전용 효과를 확인하고, 이미 스탯창에 포함된 값은 다시 더하지 마세요. 추가 옵션이 없다면 0을 확인해주세요.</p>
    <div id="precision-rows" class="precision-rows"></div>
    <div class="precision-toolbar" id="precision-add"><label class="field" for="precision-add-name">목록에 없는 스킬<input id="precision-add-name" type="text" maxlength="100" placeholder="전투분석의 스킬 이름"></label><button type="button" id="precision-add-row">스킬 추가</button><span id="precision-add-status" class="hint" role="status"></span></div>
    <label class="precision-check"><input type="checkbox" id="precision-conditions"> 측정 당시 스탯·버프를 확인했고, 스킬 레벨·사용 횟수와 대상의 레벨·포스·속성 조건을 유지합니다. 측정 대상은 보스입니다.</label>
    <label class="precision-check"><input type="checkbox" id="precision-apply-boss"> 이 스탯 비교를 보스 예상 시간에 적용</label>
    <p class="hint">HEXA 강화와 스탯 변경은 각각 비교합니다. 두 효과의 평균 배율을 서로 곱하면 스킬별 기여도가 어긋날 수 있습니다.</p>
    <details><summary>계산식과 정확도 범위</summary><p class="hint">각 스킬에 스탯창 밖의 추가 보공·가산 데미지와 크리티컬 효과를 반영하고, 방무는 잔여 방어율끼리 곱합니다. 스탯공격력에 이미 들어 있는 일반 데미지는 먼저 나누어 중복을 제거합니다.</p><p class="hint">예상 변화 = Σ [측정 당시 피해 점유율 × 변경 후 스킬 타격 지수 ÷ 측정 당시 스킬 타격 지수]. 측정 점유율에는 스킬 효과가 이미 포함되어 있으므로 추가 효과를 단순히 다시 곱하지 않습니다.</p><p class="hint">자체 환산은 측정 점유율에서 스킬별 보정 전의 상대 비중을 복원한 뒤, 방어율 380%에서 계산한 평균 타격 지수를 10,000으로 나눕니다. 크리티컬 기본 추가 피해의 기대값은 35%로 가정합니다. 미확인 피해는 0으로 간주하거나 남은 비중을 100%로 늘리지 않습니다.</p><p class="hint">버프 가동률·상태 전환·스킬 고유 스탯 변환·최대 데미지 제한으로 고정 스탯 가정이 깨지는 경우에는 실제 DPS와 차이가 납니다. 스킬 구성이나 쿨타임이 달라진 비교에는 새 전투분석이 필요합니다.</p><a href="https://maplestory.nexon.com/Guide/N23GameInformation/Articles/390" target="_blank" rel="noopener noreferrer">공식 스탯 연산 안내 ↗</a></details>`;
  const $ = id => host.querySelector(`#${id}`);
  const readBefore = () => source === 'practice' ? recordBefore : Object.fromEntries([...$('precision-before-form').querySelectorAll('[data-before-stat]')].map(input => [input.dataset.beforeStat, input.value]));
  function writeBefore(stats) { for (const input of $('precision-before-form').querySelectorAll('[data-before-stat]')) { input.value = stats?.[input.dataset.beforeStat] ?? ''; input.readOnly = source === 'practice'; } }
  function projection() {
    const measurement = source === 'practice' ? practiceMeasurement(practice) : getMeasurement();
    const result = dataError ? { ok: false, message: dataError } : calculatePrecision({ before: readBefore(), after: getCurrentStats(), rows, measurement, sourceDefense: $('precision-source-defense').value, targetDefense: $('precision-target-defense').value, conditionsConfirmed: $('precision-conditions').checked && (source === 'practice' || sameMeasurement(confirmedMeasurement, measurement)) });
    const now = getMeasurement();
    const consistent = source !== 'practice' || sameMeasurement(measurement, now);
    return { ...result, source, consistent, applyBoss: $('precision-apply-boss').checked };
  }
  function update() {
    if (source === 'manual' && $('precision-conditions').checked && !sameMeasurement(confirmedMeasurement, getMeasurement())) $('precision-conditions').checked = false;
    const result = projection();
    const total = rows.reduce((sum, row) => sum + (numberValue(row.share) || 0), 0);
    const checked = rows.filter(row => row.confirmed && numberValue(row.share) > 0).reduce((sum, row) => sum + Number(row.share), 0);
    $('precision-coverage').textContent = `점유율 합계 ${fmt(total)}% · 보정 확인 ${fmt(checked)}% · 미입력 ${fmt(Math.max(0, 100 - total))}%`;
    if (!result.ok) $('precision-result').innerHTML = `<p class="notice">${esc(result.message)}</p>`;
    else $('precision-result').innerHTML = `<div class="metric-grid"><div class="metric"><span>스킬 보정 자체 환산 · 방어율 380%</span><strong id="precision-score">${fmt(result.targetScore, 0)}점</strong><p class="hint">측정 당시 지수 ${fmt(result.sourceScore, 0)}점 → 변경 후</p></div><div class="metric"><span>입력 대상에 대한 실측 대비 변화</span><strong id="precision-growth">${result.multiplier >= 1 ? '+' : ''}${fmt((result.multiplier - 1) * 100, 3)}%</strong><p class="hint">스킬별 피해 비중과 변경 비율 반영</p></div><div class="metric"><span>예상 평균 DPS</span><strong id="precision-dps">${fmt(result.projectedDps / 1e12, 4)}조 / 초</strong><p class="hint">실측 ${fmt(result.measuredDps / 1e12, 4)}조 / 초 기준</p></div><div class="metric"><span>측정에 사용한 스탯</span><strong>${source === 'practice' ? '연무장 당시' : '직접 확인'}</strong><p class="hint">동일 버프·스킬 사용 조건의 비교</p></div></div>${result.consistent ? '' : '<p class="notice">총 피해량·시간이 연무장 기록과 달라졌습니다. 이 기록 기반 결과를 보스 예상 시간에 적용할 수 없습니다.</p>'}`;
    if (result.ok) $('precision-result').insertAdjacentHTML('beforeend', `<details class="precision-breakdown"><summary>스킬별 예상 변화 확인</summary><ul class="core-list">${result.rows.map(row => `<li><span>${esc(row.name)}<small>피해 비중 ${fmt(row.share, 3)}% → ${fmt(row.projectedShare, 3)}%</small></span><strong>${row.multiplier >= 1 ? '+' : ''}${fmt((row.multiplier - 1) * 100, 3)}%</strong></li>`).join('')}</ul><p class="hint">스킬별 증가율이 다르면 변경 후 점유율도 달라집니다. 위 전체 증가율은 측정 당시 점유율을 기준으로 합산합니다.</p></details>`);
    onChange();
  }
  function rowMarkup(row) {
    const listed = modifierSummary(row);
    return `<article class="precision-row" data-precision-id="${esc(row.id)}"><div class="precision-row-heading"><strong>${esc(row.name)}</strong><label class="field">점유율 (%)<input type="number" data-precision-share min="0" max="100" step="any" value="${esc(row.share)}" ${source === 'practice' ? 'readonly' : ''} aria-label="${esc(row.name)} 실측 점유율"></label><label class="precision-check"><input type="checkbox" data-precision-confirmed ${row.confirmed ? 'checked' : ''}> 보정 확인</label>${source === 'manual' ? `<button type="button" data-precision-remove aria-label="${esc(row.name)} 삭제">삭제</button>` : ''}</div><p class="hint" data-precision-summary>${esc(listed || '추가 보정 0% 초안 · 스킬별 효과 확인 필요')}</p><details><summary>스킬 보정 확인·수정</summary><div class="combat-fields">${Object.entries(modifierFields).map(([key, label]) => `<label class="field">${label}<input type="number" min="0" ${key === 'extraIED' ? 'max="100"' : ''} step="any" data-precision-modifier="${key}" value="${esc(row[key])}" aria-label="${esc(row.name)} ${label}"></label>`).join('')}</div><p class="hint">추가 방무가 여러 개면 잔여율을 곱한 합성값을 입력하세요. 가산 데미지와 최종 데미지는 다르며, 고정된 스킬 최종 데미지는 실측 피해에 이미 포함됩니다.</p>${row.notes?.length ? `<ul class="precision-notes">${row.notes.map(note => `<li>${esc(note)}</li>`).join('')}</ul>` : ''}<pre class="precision-effect">${esc(row.effect || 'API 설명 없음 · 하이퍼·패시브 등 전체 적용 효과를 직접 확인하세요.')}</pre></details></article>`;
  }
  function renderRows() {
    $('precision-rows').innerHTML = rows.map(rowMarkup).join('');
    $('precision-source').value = source;
    $('precision-source').querySelector('[value=practice]').disabled = !practice;
    $('precision-use-current').disabled = source === 'practice';
    $('precision-add').hidden = source === 'practice';
    $('precision-source-note').textContent = source === 'practice' ? `연무장 ${practice.replay.register_date} · 측정 당시 스탯·원본 피해량 사용. ${warnings.join(' ')}` : '측정 당시 스탯을 확인해주세요. API 현재 스탯은 측정 중의 버프 가동률을 알려주지 않습니다. 아래 보스 계산의 총 피해량·시간을 실측값으로 사용합니다.';
    update();
  }
  function saveManual() { if (source === 'manual') manualDraft = { rows: structuredClone(rows), before: readBefore(), defense: $('precision-source-defense').value, warnings: [...warnings], error: dataError }; }
  function chooseSource(next) {
    saveManual();
    if (next === 'practice' && practice) {
      source = 'practice';
      const data = createPrecisionRows(character, practice); rows = data.rows; warnings = data.warnings; dataError = data.error || '';
      const currentClass = character?.basic?.character_class, recordedClass = practice.characterInfo?.basic_object?.character_class;
      if (!currentClass || !recordedClass || currentClass !== recordedClass) dataError = '현재와 측정 당시의 직업을 일치시킬 수 없습니다. 같은 직업의 전투분석을 사용해주세요.';
      recordBefore = inputsFromStats(practice.characterInfo?.stat_object?.basic_stat_object); writeBefore(recordBefore);
      $('precision-source-defense').value = ''; $('precision-conditions').checked = false;
    } else {
      source = 'manual'; rows = structuredClone(manualDraft?.rows || []); warnings = manualDraft?.warnings || []; dataError = manualDraft?.error || '';
      writeBefore(manualDraft?.before); $('precision-source-defense').value = manualDraft?.defense ?? '';
    }
    confirmedMeasurement = null; $('precision-conditions').checked = false;
    $('precision-apply-boss').checked = false; renderRows();
  }
  $('precision-source').addEventListener('change', event => chooseSource(event.target.value));
  $('precision-use-current').addEventListener('click', () => { writeBefore(getCurrentStats()); $('precision-conditions').checked = false; update(); });
  $('precision-before-form').addEventListener('submit', event => event.preventDefault());
  $('precision-before-form').addEventListener('input', () => { $('precision-conditions').checked = false; update(); });
  for (const id of ['precision-source-defense', 'precision-target-defense']) $(id).addEventListener('input', update);
  $('precision-conditions').addEventListener('change', () => { confirmedMeasurement = $('precision-conditions').checked ? { ...getMeasurement() } : null; update(); });
  $('precision-apply-boss').addEventListener('change', update);
  $('precision-rows').addEventListener('input', event => {
    const input = event.target.closest('[data-precision-share], [data-precision-modifier]'); if (!input || input.readOnly) return;
    const node = input.closest('[data-precision-id]'), row = rows.find(row => row.id === node.dataset.precisionId);
    if (input.hasAttribute('data-precision-share')) row.share = input.value;
    else { row[input.dataset.precisionModifier] = input.value; row.confirmed = false; node.querySelector('[data-precision-confirmed]').checked = false; node.querySelector('[data-precision-summary]').textContent = modifierSummary(row); }
    update();
  });
  $('precision-rows').addEventListener('change', event => { const input = event.target.closest('[data-precision-confirmed]'); if (!input) return; rows.find(row => row.id === input.closest('[data-precision-id]').dataset.precisionId).confirmed = input.checked; update(); });
  $('precision-rows').addEventListener('click', event => { const button = event.target.closest('[data-precision-remove]'); if (!button || source !== 'manual') return; rows = rows.filter(row => row.id !== button.closest('[data-precision-id]').dataset.precisionId); renderRows(); });
  $('precision-add-row').addEventListener('click', () => {
    const name = $('precision-add-name').value.trim();
    if (!name) { $('precision-add-status').textContent = '스킬 이름을 입력해주세요.'; return; }
    if (rows.some(row => row.name.replace(/\s/g, '') === name.replace(/\s/g, ''))) { $('precision-add-status').textContent = '이미 있는 스킬입니다.'; return; }
    rows.push({ id: `manual-${++serial}`, name, share: 0, confirmed: false, extraDamage: 0, extraBoss: 0, extraIED: 0, extraCritRate: 0, extraCritDamage: 0, effect: '', notes: ['전투분석과 스킬 전용 보정을 직접 확인해주세요.'] });
    $('precision-add-name').value = ''; $('precision-add-status').textContent = ''; renderRows();
  });
  return {
    setCharacter(data) { character = data; practice = null; source = 'manual'; const prepared = createPrecisionRows(data); rows = prepared.rows; warnings = prepared.warnings; dataError = prepared.error || ''; writeBefore(inputsFromStats(data?.stats)); $('precision-source-defense').value = ''; $('precision-target-defense').value = '380'; $('precision-conditions').checked = $('precision-apply-boss').checked = false; saveManual(); renderRows(); },
    setPractice(data) { practice = data; chooseSource(data ? 'practice' : 'manual'); },
    refresh: update,
    getProjection: projection,
    reset() { character = null; practice = null; source = 'manual'; rows = []; warnings = []; dataError = ''; manualDraft = null; recordBefore = null; writeBefore(null); $('precision-source-defense').value = ''; $('precision-target-defense').value = '380'; $('precision-conditions').checked = $('precision-apply-boss').checked = false; $('precision-add-name').value = ''; $('precision-add-status').textContent = ''; renderRows(); },
  };
}
