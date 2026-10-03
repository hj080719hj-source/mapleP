import { buildHexaRows, planHexa, sharesFromPractice } from './hexa-model.js';
import { calculateScore, inputsFromStats, practiceMeasurement, numberValue } from './combat-model.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (value, digits = 2) => Number.isFinite(value) ? value.toLocaleString('ko-KR', { maximumFractionDigits: digits }) : '정보 부족';
const range = (low, high, digits = 2) => Math.abs(high - low) < 1e-9 ? fmt(low, digits) : `${fmt(low, digits)}~${fmt(high, digits)}`;
const gain = (low, high) => `${low >= 0 ? '+' : ''}${range(low, high, 3)}%`;
const effects = (values, names) => (values || []).map((value, i) => `${names?.[i] ? `${names[i]}\n` : ''}${value || '효과 정보 없음'}`).join('\n\n');
const clone = value => structuredClone(value);

export function createHexaView(host, { getCurrentScore, getMeasurement, onChange }) {
  let character = null, practice = null, rows = [], settings = {}, manualDraft = {}, source = 'manual', imported = null;
  let applyBoss = true;
  host.innerHTML = `<div class="combat-section-heading"><h2>HEXA 코어별 강화 보정</h2><span id="hexa-count" class="combat-badge">현재 → 다음 1레벨</span></div>
    <p class="hint">현재 전투분석의 피해 점유율로 강화 전후를 비교하세요. 연무장 기록을 불러오면 연결 가능한 스킬의 점유율이 채워집니다.</p>
    <div id="hexa-result" aria-live="polite"></div>
    <div id="hexa-coverage" class="hexa-coverage" aria-live="polite"></div>
    <div class="hexa-toolbar"><label class="field" for="hexa-source">점유율 기준<select id="hexa-source"><option value="manual">직접 입력한 전투분석</option><option value="practice" disabled>연무장 기록</option></select></label><button type="button" id="hexa-best">효과 큰 코어 1개 선택</button><button type="button" id="hexa-select-all">점유율 입력된 코어 선택</button><button type="button" id="hexa-reset">선택 초기화</button></div>
    <p id="hexa-source-note" class="hint"></p><details id="hexa-warnings" hidden><summary>자동 연결에서 제외한 항목</summary><ul class="hexa-warning-list"></ul></details><div id="hexa-ranking"></div>
    <div class="hexa-filters"><label class="field" for="hexa-search">코어 검색<input id="hexa-search" type="search" placeholder="코어·스킬 이름" autocomplete="off"></label><label class="field" for="hexa-filter">표시할 코어<select id="hexa-filter"><option value="all">전체 코어</option><option value="available">계산 가능한 코어</option><option value="selected">선택한 코어</option></select></label></div>
    <div id="hexa-rows"><div id="hexa-available" class="hexa-rows"></div><details id="hexa-unavailable"><summary>최대 레벨·확인 필요한 코어 <span id="hexa-unavailable-count"></span></summary><div id="hexa-other-rows" class="hexa-rows"></div></details><p id="hexa-empty" class="empty-state" hidden>조건에 맞는 코어가 없습니다.</p></div>
    <label class="hexa-apply"><input type="checkbox" id="hexa-apply-boss" checked> 선택한 HEXA 강화를 보스 예상 시간에 반영</label>
    <a class="hexa-back" href="#hexa-result">강화 비교 결과로 이동 ↑</a>
    <details><summary>HEXA 보정 기준</summary><p class="hint">전체 변화 배율 = 1 + 각 코어의 현재 피해 점유율 × (강화 후 스킬 배율 − 1)의 합. 기존 전투분석에 들어 있는 강화 효과를 다시 곱하지 않습니다. 같은 장비·버프·스킬 사용 횟수와 적중 조건을 유지한다고 가정합니다.</p><p class="hint">복합 코어의 연결 스킬별 점유율이 있으면 각각 계산합니다. 한 스킬 안의 여러 공격이 다른 비율로 증가하면 최소~최대 범위로 표시합니다. 모든 피해 항목을 확인하지 못했거나 타수·주기·패시브·방무·보공이 바뀌는 코어는 자동 계산에서 제외합니다. 다음 1레벨 데이터를 다른 목표 레벨로 늘려 쓰지 않습니다.</p><a href="https://openapi.nexon.com/ko/game/maplestory/?id=14" target="_blank" rel="noopener noreferrer">공식 스킬 효과 데이터 ↗</a></details>`;
  const $ = id => host.querySelector(`#${id}`);
  function effectiveRows() {
    const incompatible = new Set(source === 'practice' ? imported?.incompatibleIds || [] : []);
    return rows.map(row => incompatible.has(row.id) ? { ...row, supported: false, reason: '측정 당시와 현재 코어 레벨·스킬 효과를 일치시킬 수 없어 자동 보정할 수 없습니다.' } : row);
  }
  function blankSettings() { return Object.fromEntries(rows.map(row => [row.id, { enabled: false, share: 0 }])); }
  function baseScore() {
    if (source !== 'practice') return getCurrentScore();
    const result = calculateScore(inputsFromStats(practice?.characterInfo?.stat_object?.basic_stat_object));
    return result.ok ? result.score : null;
  }
  function projection() {
    const selected = Object.values(settings).filter(value => value.enabled).length;
    const result = planHexa(effectiveRows(), settings, baseScore());
    let consistent = true;
    if (source === 'practice' && practice) {
      const measured = practiceMeasurement(practice), now = getMeasurement();
      consistent = Boolean(measured && now && Math.abs(now.totalDamage - measured.totalDamage) <= Math.max(1, measured.totalDamage * 1e-10) && Math.abs(now.seconds - measured.seconds) < 1e-6);
    }
    return { ...result, selected, applyBoss, source, consistent };
  }
  function candidates() {
    const active = effectiveRows();
    const all = Object.fromEntries(active.map(row => [row.id, { ...settings[row.id], enabled: row.supported && numberValue(settings[row.id]?.share) > 0 }]));
    return planHexa(active, all, baseScore());
  }
  function applyFilter() {
    const query = $('hexa-search').value.replace(/\s+/g, '').toLocaleLowerCase('ko'), filter = $('hexa-filter').value;
    const active = effectiveRows();
    let visible = 0, unavailable = 0, available = 0;
    for (const node of $('hexa-rows').querySelectorAll('.hexa-row')) {
      const row = active.find(value => value.id === node.dataset.coreId);
      const matches = `${row.name} ${row.linkedNames.join(' ')}`.replace(/\s+/g, '').toLocaleLowerCase('ko').includes(query);
      node.hidden = !matches || (filter === 'available' && !row.supported) || (filter === 'selected' && !settings[row.id]?.enabled);
      if (!node.hidden) { visible++; if (row.supported) available++; else unavailable++; }
    }
    $('hexa-available').hidden = !available;
    $('hexa-unavailable').hidden = !unavailable;
    $('hexa-unavailable-count').textContent = `${unavailable}개`;
    if (query && unavailable) $('hexa-unavailable').open = true;
    $('hexa-empty').hidden = visible > 0 || !rows.length;
  }
  function update() {
    const result = projection(), baseline = baseScore(), comparison = candidates();
    const ranking = comparison.ok ? comparison.ranking : [];
    $('hexa-best').disabled = !ranking.some(row => row.minGainPercent > 0);
    $('hexa-select-all').disabled = !ranking.length;
    $('hexa-reset').disabled = !result.selected;
    if (!rows.length) {
      $('hexa-result').innerHTML = '<p class="empty-state">캐릭터를 불러오면 코어별 강화 효과를 비교할 수 있습니다.</p>';
    } else if (!result.ok && result.code !== 'INVALID_PLAN') {
      $('hexa-result').innerHTML = `<p class="error">${esc(result.message)}</p>`;
    } else if (!result.selected) {
      $('hexa-result').innerHTML = '<p class="hint">점유율을 입력하면 후보 코어의 기여도가 표시됩니다. 비교할 코어를 선택하세요.</p>';
    } else if (!result.ok) {
      $('hexa-result').innerHTML = `<p class="error">${esc(result.message)}</p>`;
    } else {
      $('hexa-result').innerHTML = `<div class="metric-grid"><div class="metric"><span>선택 코어 강화 후 전체 데미지</span><strong id="hexa-growth">${gain((result.minMultiplier - 1) * 100, (result.maxMultiplier - 1) * 100)}</strong><p class="hint">${result.selected}개 코어 · 피해 점유율 ${fmt(result.coveredShare)}%</p></div><div class="metric"><span>강화 후 자체 점수</span><strong id="hexa-score">${Number.isFinite(baseline) ? `${range(result.minScore, result.maxScore, 0)}점` : '스탯 입력 필요'}</strong><p class="hint">${source === 'practice' ? '연무장 측정 당시' : '현재 입력한'} 스탯 ${fmt(baseline, 0)}점 기준</p></div></div><p class="hint">현재 코어 상태를 기준으로 한 강화 전후 비교입니다. 기존 환산 서비스의 절대 HEXA 환산값과는 다릅니다.</p>${result.consistent ? '' : '<p class="notice">전투분석의 피해량·시간을 수정해 기록과 달라졌습니다. 보스 시간에는 이 보정을 적용할 수 없습니다. 점유율 기준을 직접 입력으로 바꿔 확인해주세요.</p>'}`;
    }
    const shares = Object.values(settings).map(value => numberValue(value.share));
    const valid = shares.every(value => value !== null && value >= 0 && value <= 100);
    const total = shares.reduce((sum, value) => sum + (value || 0), 0);
    const selectedShare = Object.values(settings).filter(value => value.enabled).reduce((sum, value) => sum + (numberValue(value.share) || 0), 0);
    $('hexa-coverage').hidden = !rows.length;
    $('hexa-coverage').innerHTML = valid && total <= 100 + 1e-9
      ? `<div><span>입력 합계 <b>${fmt(total)}%</b></span><span>선택 코어 <b>${fmt(selectedShare)}%</b></span><span>미입력 <b>${fmt(Math.max(0, 100 - total))}%</b></span></div><progress max="100" value="${Math.min(100, total)}" aria-label="전체 피해량 중 점유율 입력 비율"></progress>`
      : '<p class="error">점유율은 0~100%로 입력하고, 전체 합계는 100% 이하여야 합니다.</p>';
    $('hexa-ranking').innerHTML = ranking.length ? `<h3>다음 1레벨 기여도 · 상위 ${Math.min(5, ranking.length)}개</h3><ol class="hexa-rank">${ranking.slice(0, 5).map(item => `<li><div><span>${esc(item.name)}</span><strong>${gain(item.minGainPercent, item.maxGainPercent)}</strong></div><button type="button" data-select-core="${esc(item.id)}">이 코어만 비교</button></li>`).join('')}</ol><p class="hint">선택 여부와 관계없이, 점유율이 입력된 코어를 전체 피해량 상승률 하한 순서로 비교합니다. 조각 수에 따른 가성비 순위는 아닙니다.</p>` : '';
    for (const node of $('hexa-rows').querySelectorAll('.hexa-row')) {
      const item = ranking.find(value => value.id === node.dataset.coreId), output = node.querySelector('[data-hexa-contribution]');
      if (output) output.textContent = item ? `전체 데미지 ${gain(item.minGainPercent, item.maxGainPercent)}` : '점유율 입력 후 기여도 비교';
      node.classList.toggle('is-selected', Boolean(settings[node.dataset.coreId]?.enabled));
    }
    applyFilter();
    onChange();
  }
  function rowMarkup(row) {
    const value = settings[row.id] || { enabled: false, share: 0 };
    const components = row.components || [], detailed = Boolean(value.componentShares);
    const componentFields = row.supported && components.length > 1 ? `<div class="hexa-components"><label class="hexa-detail-toggle"><input type="checkbox" data-hexa-detail ${detailed ? 'checked' : ''} ${source === 'practice' ? 'disabled' : ''}> 연결 스킬별 점유율 입력</label><div class="hexa-component-fields" ${detailed ? '' : 'hidden'}>${components.map(component => `<label class="field">${esc(component.name)} (%)<input type="number" min="0" max="100" step="any" data-hexa-component="${esc(component.id)}" value="${esc(value.componentShares?.[component.id] ?? 0)}" ${source === 'practice' ? 'readonly' : ''}></label>`).join('')}<p class="hint">각 값은 전체 피해량 기준입니다. 합계를 코어 점유율에 반영합니다.</p></div></div>` : '';
    return `<article class="hexa-row" data-core-id="${esc(row.id)}"><div class="hexa-row-heading"><label><input type="checkbox" data-hexa-enabled ${value.enabled ? 'checked' : ''} ${row.supported ? '' : 'disabled'} aria-label="${esc(row.name)} 다음 레벨 적용"><span><strong>${esc(row.name)}</strong><small>${esc(row.type)} · Lv.${esc(row.level)}${row.supported ? ` → ${esc(row.nextLevel)}` : ''}</small></span></label><strong class="hexa-ratio">${row.supported ? `스킬 ${gain((row.minRatio - 1) * 100, (row.maxRatio - 1) * 100)}` : Number(row.level) >= 30 ? '최대 레벨' : '효과 확인 필요'}</strong></div>
      ${row.supported ? `<div class="hexa-row-values"><label class="field hexa-share">현재 피해 점유율 (%)<input type="number" min="0" max="100" step="any" data-hexa-share value="${esc(value.share)}" aria-label="${esc(row.name)} 피해 점유율" ${source === 'practice' || detailed ? 'readonly' : ''}></label><p class="hexa-contribution" data-hexa-contribution></p></div>${componentFields}` : `<p class="hint">${esc(row.reason)}</p>`}
      <details><summary>공식 현재·다음 효과 보기</summary><div class="hexa-effects"><div><b>현재</b><pre>${esc(effects(row.currentEffects, row.effectNames)) || '효과 정보 없음'}</pre></div><div><b>다음 레벨</b><pre>${esc(effects(row.nextEffects, row.effectNames)) || '다음 레벨 정보 없음'}</pre></div></div></details></article>`;
  }
  function renderRows() {
    const active = effectiveRows(), available = active.filter(row => row.supported);
    const openIds = new Set([...$('hexa-rows').querySelectorAll('.hexa-row details[open]')].map(node => node.closest('[data-core-id]').dataset.coreId));
    $('hexa-available').innerHTML = available.map(rowMarkup).join('');
    $('hexa-other-rows').innerHTML = active.filter(row => !row.supported).map(rowMarkup).join('');
    for (const node of $('hexa-rows').querySelectorAll('.hexa-row')) if (openIds.has(node.dataset.coreId)) node.querySelector('details').open = true;
    $('hexa-count').textContent = rows.length ? `계산 가능 ${available.length} · 전체 ${rows.length}개` : '현재 → 다음 1레벨';
    $('hexa-source').value = source;
    $('hexa-source').querySelector('[value=practice]').disabled = !practice;
    $('hexa-search').disabled = $('hexa-filter').disabled = !rows.length;
    $('hexa-source-note').textContent = source === 'practice'
      ? `연무장 ${practice.replay.register_date} 기록 기준 · 자동 연결 ${fmt(imported?.matchedShare)}% · 나머지는 기존 피해량 유지.`
      : '각 코어에 포함되는 스킬의 현재 피해 점유율을 입력하세요. 연결 스킬별 입력도 전체 피해량 기준이며, 같은 스킬을 여러 코어에 중복 입력하지 마세요.';
    const warnings = source === 'practice' ? [...new Set(imported?.warnings || [])] : [];
    $('hexa-warnings').hidden = !warnings.length;
    $('hexa-warnings').querySelector('ul').innerHTML = warnings.map(message => `<li>${esc(message)}</li>`).join('');
    update();
  }
  function chooseSource(nextSource) {
    if (source === 'manual') manualDraft = clone(settings);
    if (nextSource === 'practice' && practice) {
      source = 'practice';
      imported = sharesFromPractice(rows, practice, character?.basic?.character_class);
      settings = clone(imported.settings);
    } else { source = 'manual'; imported = null; settings = clone(manualDraft); }
    renderRows();
  }
  function selectOnly(id) {
    if (!effectiveRows().some(row => row.id === id && row.supported)) return;
    for (const [key, item] of Object.entries(settings)) item.enabled = key === id;
    renderRows();
  }
  $('hexa-rows').addEventListener('input', event => {
    const input = event.target.closest('[data-hexa-share], [data-hexa-component]'); if (!input || input.readOnly) return;
    const node = input.closest('[data-core-id]'), id = node.dataset.coreId;
    if (input.hasAttribute('data-hexa-component')) {
      settings[id].componentShares[input.dataset.hexaComponent] = input.value;
      const parts = Object.values(settings[id].componentShares).map(numberValue);
      settings[id].share = parts.some(value => value === null) ? '' : parts.reduce((sum, value) => sum + value, 0);
      node.querySelector('[data-hexa-share]').value = settings[id].share;
    } else { settings[id].share = input.value; delete settings[id].componentShares; }
    update();
  });
  $('hexa-rows').addEventListener('change', event => {
    const input = event.target.closest('[data-hexa-enabled], [data-hexa-detail]'); if (!input || input.disabled) return;
    const id = input.closest('[data-core-id]').dataset.coreId;
    if (input.hasAttribute('data-hexa-detail')) {
      if (input.checked) {
        settings[id].componentShares = Object.fromEntries(rows.find(row => row.id === id).components.map(component => [component.id, 0]));
        settings[id].share = 0;
      } else delete settings[id].componentShares;
      renderRows();
    } else { settings[id].enabled = input.checked; update(); }
  });
  $('hexa-ranking').addEventListener('click', event => { const button = event.target.closest('[data-select-core]'); if (button) selectOnly(button.dataset.selectCore); });
  $('hexa-best').addEventListener('click', () => { const first = candidates().ranking?.find(item => item.minGainPercent > 0); if (first) selectOnly(first.id); });
  $('hexa-source').addEventListener('change', event => chooseSource(event.target.value));
  $('hexa-search').addEventListener('input', applyFilter);
  $('hexa-filter').addEventListener('change', applyFilter);
  $('hexa-select-all').addEventListener('click', () => { for (const row of effectiveRows()) settings[row.id].enabled = row.supported && numberValue(settings[row.id].share) > 0; renderRows(); });
  $('hexa-reset').addEventListener('click', () => { for (const item of Object.values(settings)) item.enabled = false; renderRows(); });
  $('hexa-apply-boss').addEventListener('change', event => { applyBoss = event.target.checked; update(); });
  function clearFilters() { $('hexa-search').value = ''; $('hexa-filter').value = 'all'; $('hexa-unavailable').open = false; }
  return {
    setCharacter(data) { character = data; practice = null; source = 'manual'; imported = null; rows = buildHexaRows(data?.hexa, data?.skills); settings = blankSettings(); manualDraft = clone(settings); clearFilters(); renderRows(); },
    setPractice(data) { practice = data; chooseSource(data ? 'practice' : 'manual'); },
    refresh: update,
    getProjection: projection,
    getScenario() { return { rows: effectiveRows(), settings: clone(settings), source, consistent: projection().consistent,
      measurement: source === 'practice' ? practiceMeasurement(practice) : getMeasurement(), practice, liveClass: character?.basic?.character_class }; },
    reset() { character = null; practice = null; rows = []; source = 'manual'; imported = null; settings = {}; manualDraft = {}; applyBoss = true; $('hexa-apply-boss').checked = true; clearFilters(); renderRows(); },
  };
}
