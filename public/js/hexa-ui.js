import { buildHexaRows, planHexa, sharesFromPractice } from './hexa-model.js';
import { calculateScore, inputsFromStats, practiceMeasurement, numberValue } from './combat-model.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (value, digits = 2) => Number.isFinite(value) ? value.toLocaleString('ko-KR', { maximumFractionDigits: digits }) : '정보 부족';
const range = (low, high, digits = 2) => Math.abs(high - low) < 1e-9 ? fmt(low, digits) : `${fmt(low, digits)}~${fmt(high, digits)}`;
const effects = values => (values || []).map(value => typeof value === 'string' ? value : JSON.stringify(value)).join('\n\n');

export function createHexaView(host, { getCurrentScore, getMeasurement, onChange }) {
  let character = null, practice = null, rows = [], settings = {}, source = 'manual', imported = null;
  let applyBoss = true;
  host.innerHTML = `<div class="combat-section-heading"><h2>HEXA 코어별 강화 보정</h2><span class="combat-badge">공식 API 현재 → 다음 레벨</span></div>
    <p class="hint">코어마다 다음 1레벨의 효과를 비교합니다. 전체 상승률을 보려면 현재 전투분석의 피해 점유율을 입력하거나 연무장 기록을 불러오세요.</p>
    <div class="hexa-toolbar"><label class="field" for="hexa-source">점유율 기준<select id="hexa-source"><option value="manual">직접 입력한 전투분석</option><option value="practice" disabled>연무장 기록</option></select></label><button type="button" id="hexa-select-all">계산 가능한 코어 선택</button><button type="button" id="hexa-reset">선택 초기화</button></div>
    <p id="hexa-source-note" class="hint"></p><div id="hexa-rows" class="hexa-rows"></div>
    <div id="hexa-result" aria-live="polite"></div><div id="hexa-ranking"></div>
    <label class="hexa-apply"><input type="checkbox" id="hexa-apply-boss" checked> 선택한 HEXA 강화를 보스 예상 시간에 반영</label>
    <details><summary>HEXA 보정 기준</summary><p class="hint">전체 변화 배율 = 1 + 각 코어의 현재 피해 점유율 × (강화 후 스킬 배율 − 1)의 합. 기존 전투분석에 들어 있는 강화 효과를 다시 곱하지 않습니다. 같은 장비·버프·스킬 사용 횟수와 적중 조건을 유지한다고 가정합니다.</p><p class="hint">한 코어의 여러 공격이 서로 다른 비율로 증가하면, 세부 점유율을 추측하지 않고 최소~최대 범위로 표시합니다. 모든 피해 항목을 확인하지 못했거나 타수·주기·패시브·방무·보공이 바뀌는 코어는 자동 계산에서 제외합니다. 다음 1레벨 데이터를 다른 목표 레벨로 늘려 쓰지 않습니다.</p><a href="https://openapi.nexon.com/ko/game/maplestory/?id=14" target="_blank" rel="noopener noreferrer">공식 스킬 효과 데이터 ↗</a></details>`;
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
  function update() {
    const result = projection(), baseline = baseScore();
    $('hexa-select-all').disabled = !effectiveRows().some(row => row.supported);
    $('hexa-reset').disabled = !rows.length;
    if (!rows.length) {
      $('hexa-result').innerHTML = '<p class="hint">캐릭터의 HEXA 코어와 6차 스킬 효과를 조회하면 코어별 보정이 표시됩니다.</p>';
    } else if (!result.selected) {
      $('hexa-result').innerHTML = '<p class="hint">강화할 코어를 선택하세요. 점유율은 강화 전 전체 피해량에서 해당 코어가 담당한 비율입니다.</p>';
    } else if (!result.ok) {
      $('hexa-result').innerHTML = `<p class="error">${esc(result.message)}</p>`;
    } else {
      const growth = range((result.minMultiplier - 1) * 100, (result.maxMultiplier - 1) * 100, 3);
      $('hexa-result').innerHTML = `<div class="metric-grid"><div class="metric"><span>선택 코어 강화 후 전체 데미지</span><strong id="hexa-growth">+${growth}%</strong><p class="hint">변경하지 않은 스킬의 피해량도 포함</p></div><div class="metric"><span>코어 변경을 반영한 자체 점수</span><strong id="hexa-score">${Number.isFinite(baseline) ? `${range(baseline * result.minMultiplier, baseline * result.maxMultiplier, 0)}점` : '스탯 입력 필요'}</strong><p class="hint">${source === 'practice' ? '연무장 측정 당시' : '현재 입력한'} 스탯 ${fmt(baseline, 0)}점 기준</p></div></div><p class="hint">현재 코어 상태를 기준으로 한 강화 전후 비교입니다. 기존 환산 서비스의 절대 HEXA 환산값과는 다릅니다.</p>${result.consistent ? '' : '<p class="notice">전투분석의 피해량·시간을 수정해 기록과 달라졌습니다. 보스 시간에는 이 보정을 적용할 수 없습니다. 점유율 기준을 직접 입력으로 바꿔 확인해주세요.</p>'}`;
    }
    const ranking = effectiveRows().filter(row => settings[row.id]?.enabled && row.supported && numberValue(settings[row.id].share) > 0).map(row => ({ ...row, contribution: Number(settings[row.id].share) * (row.minRatio - 1), high: Number(settings[row.id].share) * (row.maxRatio - 1) })).sort((a, b) => b.contribution - a.contribution);
    $('hexa-ranking').innerHTML = result.ok && result.selected && ranking.length ? `<h3>선택 코어의 다음 1레벨 기여도</h3><ol class="hexa-rank">${ranking.map(row => `<li><span>${esc(row.name)}</span><strong>+${range(row.contribution, row.high, 3)}%</strong></li>`).join('')}</ol><p class="hint">전체 피해량의 상승률 하한 순서입니다. 소모 조각 수에 따른 가성비 순위는 아닙니다.</p>` : '';
    onChange();
  }
  function renderRows() {
    const active = effectiveRows();
    $('hexa-rows').innerHTML = active.map(row => {
      const value = settings[row.id] || { enabled: false, share: 0 };
      return `<article class="hexa-row" data-core-id="${esc(row.id)}"><div class="hexa-row-heading"><label><input type="checkbox" data-hexa-enabled ${value.enabled ? 'checked' : ''} ${row.supported ? '' : 'disabled'} aria-label="${esc(row.name)} 다음 레벨 적용"><span><strong>${esc(row.name)}</strong><small>${esc(row.type)} · Lv.${esc(row.level)}${row.supported ? ` → ${esc(row.nextLevel)}` : ''}</small></span></label><strong class="hexa-ratio">${row.supported ? `스킬 +${range((row.minRatio - 1) * 100, (row.maxRatio - 1) * 100, 3)}%` : Number(row.level) >= 30 ? '최대 레벨' : '효과 확인 필요'}</strong></div>
      ${row.supported ? `<label class="field hexa-share">현재 피해 점유율 (%)<input type="number" min="0" max="100" step="any" data-hexa-share value="${esc(value.share)}" aria-label="${esc(row.name)} 피해 점유율" ${source === 'practice' ? 'readonly' : ''}></label>` : `<p class="hint">${esc(row.reason)}</p>`}
      <details><summary>공식 현재·다음 효과 보기</summary><div class="hexa-effects"><div><b>현재</b><pre>${esc(effects(row.currentEffects)) || '효과 정보 없음'}</pre></div><div><b>다음 레벨</b><pre>${esc(effects(row.nextEffects)) || '다음 레벨 정보 없음'}</pre></div></div></details></article>`;
    }).join('');
    $('hexa-source').value = source;
    $('hexa-source').querySelector('[value=practice]').disabled = !practice;
    $('hexa-source-note').textContent = source === 'practice'
      ? `연무장 ${practice.replay.register_date} 기록 기준 · 자동 연결 ${fmt(imported?.matchedShare)}% · 나머지는 기존 피해량 유지. ${(imported?.warnings || []).join(' ')}`
      : '기본 점유율은 0%입니다. 각 코어에 포함되는 스킬의 현재 피해 점유율 합계를 입력하세요. 스킬을 여러 코어에 중복 입력하지 마세요.';
    update();
  }
  function chooseSource(nextSource) {
    source = nextSource;
    if (source === 'practice' && practice) {
      imported = sharesFromPractice(rows, practice, character?.basic?.character_class);
      settings = imported.settings;
    } else { source = 'manual'; imported = null; settings = blankSettings(); }
    renderRows();
  }
  $('hexa-rows').addEventListener('input', event => {
    const input = event.target.closest('[data-hexa-share]'); if (!input) return;
    const id = input.closest('[data-core-id]').dataset.coreId;
    settings[id] = { ...settings[id], share: input.value }; update();
  });
  $('hexa-rows').addEventListener('change', event => {
    const input = event.target.closest('[data-hexa-enabled]'); if (!input) return;
    const id = input.closest('[data-core-id]').dataset.coreId;
    settings[id] = { ...settings[id], enabled: input.checked }; update();
  });
  $('hexa-source').addEventListener('change', event => chooseSource(event.target.value));
  $('hexa-select-all').addEventListener('click', () => { for (const row of effectiveRows()) settings[row.id] = { ...settings[row.id], enabled: row.supported }; renderRows(); });
  $('hexa-reset').addEventListener('click', () => { for (const item of Object.values(settings)) item.enabled = false; renderRows(); });
  $('hexa-apply-boss').addEventListener('change', event => { applyBoss = event.target.checked; update(); });
  return {
    setCharacter(data) { character = data; practice = null; source = 'manual'; imported = null; rows = buildHexaRows(data?.hexa, data?.skills); settings = blankSettings(); renderRows(); },
    setPractice(data) { practice = data; chooseSource(data ? 'practice' : 'manual'); },
    refresh: update,
    getProjection: projection,
    reset() { character = null; practice = null; rows = []; source = 'manual'; imported = null; settings = {}; applyBoss = true; $('hexa-apply-boss').checked = true; renderRows(); },
  };
}
