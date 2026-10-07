import { loadCharacter, loadPractice } from './character-api.js';
import { MODEL, inputsFromStats, calculateScore, estimateBoss, compareBossForecast, equipmentOverview, practiceMeasurement, statMap, numberValue } from './combat-model.js';
import { createHexaView } from './hexa-ui.js';
import { createPrecisionView } from './precision-ui.js';
import { createReferenceView } from './reference-ui.js';

const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const fmt = (value, digits = 0) => Number.isFinite(value) ? value.toLocaleString('ko-KR', { maximumFractionDigits: digits }) : '정보 없음';
const damageText = value => value >= 1e12 ? `${fmt(value / 1e12, 2)}조` : value >= 1e8 ? `${fmt(value / 1e8, 2)}억` : fmt(value);
const fieldIds = { minAttack: 'min-attack', maxAttack: 'max-attack', damage: 'damage-stat', bossDamage: 'boss-stat', critRate: 'crit-rate', critDamage: 'crit-damage', ignoreDefense: 'ignore-defense' };
let apiKey = '', character = null, practice = null, original = null, controller, revision = 0, busy = false;
let hexaView, precisionView, referenceView;

function status(id, message, error = false) { $(id).textContent = message; $(id).className = error ? 'error' : 'hint'; }
function setBusy(value) {
  busy = value;
  $('load-character').disabled = value;
  $('load-practice').disabled = value || !character;
  $('character-form').setAttribute('aria-busy', String(value));
}
function clearPractice() {
  practice = null;
  $('practice-record').hidden = true;
  $('practice-record').replaceChildren();
  $('total-damage').value = ''; $('battle-seconds').value = '';
  status('practice-status', '캐릭터 조회 후 연무장 기록을 불러오거나 전투분석 결과를 직접 입력하세요.');
  hexaView.setPractice(null);
  precisionView.setPractice(null);
}
function clearCharacter() {
  referenceView?.reset();
  revision++; controller?.abort(); apiKey = ''; character = null; original = null;
  $('combat-api-key').value = ''; $('combat-api-key').required = true;
  $('combat-results').hidden = true; $('combat-results').replaceChildren();
  $('clear-character').hidden = true;
  $('manual-form').reset(); clearPractice(); hexaView.reset(); precisionView.reset(); renderScore(); setBusy(false);
}
function readInputs() { return Object.fromEntries(Object.entries(fieldIds).map(([key, id]) => [key, $(id).value])); }
function writeInputs(input) { for (const [key, id] of Object.entries(fieldIds)) $(id).value = input[key] ?? ''; }
function renderScore() {
  const input = readInputs(), result = calculateScore(input);
  if (!result.ok) {
    $('score-output').innerHTML = `<p class="hint">${esc(result.message)}</p>`;
    return;
  }
  const edited = original && Object.keys(fieldIds).some(key => numberValue(input[key]) !== original[key]);
  const baseline = original && calculateScore(original);
  const delta = edited && baseline?.ok && baseline.score > 0 ? (result.score / baseline.score - 1) * 100 : null;
  $('score-output').innerHTML = `<div class="metric-grid">
    <div class="metric accent"><span>기본 스탯 지수 · v${MODEL.version}</span><strong id="own-score">${fmt(result.score)}<small> 점</small></strong><p class="hint">${edited ? '직접 수정한 스탯' : character ? '현재 착용 스탯 기준' : '직접 입력한 스탯'}${delta !== null ? ` · 조회값 대비 ${delta >= 0 ? '+' : ''}${fmt(delta, 2)}%` : ''}</p></div>
    <div class="metric"><span>방어율 380% 기준 기대 기본 타격량</span><strong>${damageText(result.basicDamage)}</strong><p class="hint">스킬 배율·타수·공격 주기를 적용하기 전 값</p></div>
  </div>
  <p class="notice">스킬 전용 방무·보공이 빠진 기본 지표입니다. <a href="#precision-panel">스킬 보정 환산</a>에서 실측 점유율과 스킬별 효과를 반영할 수 있습니다. 기존 환산주스탯과 다른 자체 척도이며, 쿨타임·속성 반감·레벨·포스 보정은 포함하지 않습니다.</p>
  ${edited ? '<p class="hint">수정한 스탯은 과거 연무장 실측 DPS에 적용되지 않습니다. <button type="button" id="restore-stats">조회한 스탯으로 복원</button></p>' : ''}
  ${result.defenseMultiplier === 0 ? '<p class="notice">입력한 방무로는 방어율 380% 대상의 방어를 관통하지 못해 이 기준 점수가 0입니다.</p>' : ''}
  <details><summary>점수 계산 과정</summary><dl class="stat-list"><div><dt>평균 스탯공격력</dt><dd>${fmt(result.averageAttack, 2)}</dd></div><div><dt>보스 데미지 보정</dt><dd>× ${fmt(result.bossMultiplier, 5)}</dd></div><div><dt>크리티컬 기대 배율</dt><dd>× ${fmt(result.criticalMultiplier, 5)}</dd></div><div><dt>방어 관통 배율</dt><dd>× ${fmt(result.defenseMultiplier, 5)}</dd></div></dl><p class="hint">평균 스탯공격력 × (100 + 데미지 + 보공) ÷ (100 + 데미지) × 크리티컬 기대 배율 × 방어 관통 배율 ÷ 10,000. 최종 데미지와 무기 상수는 스탯공격력에 이미 포함되어 다시 곱하지 않습니다. 기대 기본 타격량 1억을 1만점으로 정한 메이플유의 척도이며 DPS가 아닙니다.</p></details>`;
  $('restore-stats')?.addEventListener('click', () => { writeInputs(original); renderScore(); hexaView.refresh(); });
}
function renderCharacter() {
  const { basic, stats, equipment, hexa, errors, loadedAt } = character;
  const overview = equipmentOverview(equipment), values = statMap(stats);
  const sourceStats = ['STR', 'DEX', 'INT', 'LUK', '전투력', '최종데미지', '아케인포스', '어센틱포스'];
  const time = new Date(loadedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
  const cores = Array.isArray(hexa?.character_hexa_core_equipment) ? hexa.character_hexa_core_equipment : [];
  $('combat-results').hidden = false;
  $('combat-results').innerHTML = `<section class="card"><div class="combat-summary"><div><p class="hint">${esc(basic.world_name)} · Lv.${esc(basic.character_level)} ${esc(basic.character_class)}</p><h2>${esc(basic.character_name)}</h2></div><span class="badge">${overview.preset !== null ? `착용 프리셋 ${esc(overview.preset)}` : '착용 프리셋 정보 없음'}</span></div><p class="hint">${esc(time)} 조회 · API의 현재 착용 상태</p>
  <details><summary>캐릭터 스탯과 장비 프리셋 비교</summary><dl class="stat-list">${sourceStats.map(name => `<div><dt>${name}</dt><dd>${fmt(values.get(name))}${name === '최종데미지' && values.has(name) ? '%' : ''}</dd></div>`).join('')}</dl>
  <p class="notice">다른 장비 프리셋은 장비 목록만 비교합니다. 다른 프리셋의 종합 능력치를 조회할 수 없어 환산값을 임의로 계산하지 않습니다.</p>
  ${overview.presets.length ? `<div class="equipment-list">${overview.presets.map(p => `<div><strong>${p.number}번${p.number === overview.preset ? ' · 현재 착용' : ''}</strong><span>장비 ${p.count}개 · 드롭·메소 잠재 장비 ${p.loot}개</span><small>${esc(p.rings.join(' / ') || '특수 스킬 반지 없음')}</small></div>`).join('')}</div>` : ''}</details>
  <details><summary>현재 장비 ${overview.equipped.length}개 보기</summary><ul class="core-list">${overview.equipped.map(item => `<li><span>${esc(item.item_equipment_slot)} · ${esc(item.item_name)}</span><strong>${numberValue(item.starforce) > 0 ? `★ ${esc(item.starforce)}` : ''}</strong></li>`).join('') || '<li>장비 정보를 불러오지 못했습니다.</li>'}</ul></details>
  <details><summary>HEXA 코어 ${cores.length}개 보기</summary><p class="hint">아래 HEXA 패널에서 코어별 다음 레벨의 효과와 전체 데미지 변화를 비교할 수 있습니다.</p><ul class="core-list">${cores.map(core => `<li><span>${esc(core.hexa_core_name)}<small>${esc(core.hexa_core_type)}</small></span><strong>Lv.${esc(core.hexa_core_level)}</strong></li>`).join('') || '<li>HEXA 정보가 없거나 불러오지 못했습니다.</li>'}</ul></details>
  ${errors.length ? `<p class="notice">${errors.map(esc).join('<br>')}</p>` : ''}</section>`;
}
function renderBoss() {
  const damage = numberValue($('total-damage').value), hp = numberValue($('boss-hp').value);
  const input = { totalDamage: damage === null ? null : damage * 1e12, seconds: $('battle-seconds').value, hp: hp === null ? null : hp * 1e12, limitMinutes: $('boss-limit').value, retention: $('uptime').value };
  const result = estimateBoss(input);
  if (!result.ok) { $('boss-output').innerHTML = `<p class="hint">${esc(result.message)}</p>`; return; }
  const projection = hexaView?.getProjection();
  const applyHexa = projection?.applyBoss && projection.selected > 0;
  const precision = precisionView?.getProjection(), applyPrecision = Boolean(precision?.applyBoss);
  if (applyPrecision && (!precision.ok || !precision.consistent)) {
    $('boss-output').innerHTML = `<p class="error">스킬 보정 환산을 적용할 수 없습니다. ${esc(precision.ok ? '총 피해량·시간이 연무장 기록과 다릅니다.' : precision.message)}</p>`;
    return;
  }
  if (applyPrecision && precision.multiplier === 0) {
    $('boss-output').innerHTML = '<p class="notice">입력한 스탯과 스킬 보정으로는 대상의 방어율을 관통하지 못해 예상 피해량이 0입니다. 보스 처치 시간을 계산할 수 없습니다.</p>';
    return;
  }
  if (applyHexa && (!projection.ok || !projection.consistent)) {
    $('boss-output').innerHTML = `<p class="error">HEXA 보정을 적용할 수 없습니다. ${esc(projection.ok ? '피해량·측정 시간이 연무장 기록과 다릅니다. 점유율 기준을 확인해주세요.' : projection.message)} 보정을 끄면 입력한 실측값으로 계산합니다.</p>`;
    return;
  }
  const combined = applyHexa && applyPrecision ? precisionView.getCombinedProjection() : null;
  if (combined && !combined.ok) {
    $('boss-output').innerHTML = `<p class="error">스탯과 HEXA를 함께 적용할 수 없습니다. ${esc(combined.message)}</p>`;
    return;
  }
  const comparison = compareBossForecast(input, combined || (applyPrecision ? { minMultiplier: precision.multiplier, maxMultiplier: precision.multiplier } : applyHexa ? projection : {}));
  if (!comparison.ok) { $('boss-output').innerHTML = `<p class="error">${esc(comparison.message)}</p>`; return; }
  const { lower, upper } = comparison;
  const adjusted = applyHexa || applyPrecision, adjustmentName = combined ? '스탯·HEXA 보정' : applyPrecision ? '스탯·방어율 보정' : 'HEXA 강화';
  const timeText = value => { const total = Math.ceil(value); return `${fmt(Math.floor(total / 60))}분 ${total % 60}초`; };
  const time = timeText(upper.expectedSeconds) === timeText(lower.expectedSeconds) ? timeText(lower.expectedSeconds) : `${timeText(upper.expectedSeconds)} ~ ${timeText(lower.expectedSeconds)}`;
  const between = (low, high, digits = 1) => Math.abs(high - low) < 1e-9 ? fmt(low, digits) : `${fmt(low, digits)}~${fmt(high, digits)}`;
  const verdict = comparison.verdict === 'within' ? '제한 시간 내 피해량 충족' : comparison.verdict === 'uncertain' ? '예상 범위가 제한 시간에 걸쳐 있습니다' : '제한 시간 내 피해량 부족';
  const dps = lower.effectiveDps === upper.effectiveDps ? damageText(lower.effectiveDps) : `${damageText(lower.effectiveDps)}~${damageText(upper.effectiveDps)}`;
  const goalTitle = comparison.verdict === 'within' ? '남은 시간 여유' : '추가 필요한 데미지';
  const goalValue = comparison.verdict === 'within'
    ? `${between(comparison.spareSeconds.min, comparison.spareSeconds.max, 1)}초`
    : `+${between(comparison.additionalDamagePercent.min, comparison.additionalDamagePercent.max, 2)}%`;
  const goalNote = comparison.verdict === 'uncertain'
    ? `일부 예상 구간만 제한 시간을 충족합니다. 최대 ${fmt(comparison.overtimeSeconds.max, 1)}초 초과 ~ ${fmt(comparison.spareSeconds.max, 1)}초 여유입니다.`
    : comparison.verdict === 'within' ? '입력한 제한 시간에서 예상 소요 시간을 뺀 값입니다.' : '같은 전투 조건에서 현재 적용 DPS 대비 더 필요한 증가율입니다.';
  const beforeGoal = result.meetsTime ? `${adjustmentName} 전 시간 여유 ${fmt(comparison.baselineGoal.spareSeconds, 1)}초` : `${adjustmentName} 전 추가 데미지 +${fmt(comparison.baselineGoal.additionalDamagePercent, 2)}% 필요`;
  const saved = comparison.savedSeconds;
  const savedText = saved.min >= 0 ? `${between(saved.min, saved.max, 2)}초 단축`
    : saved.max <= 0 ? `${between(-saved.max, -saved.min, 2)}초 증가`
      : `${fmt(-saved.min, 2)}초 증가 ~ ${fmt(saved.max, 2)}초 단축`;
  const goalCards = `<div class="boss-progress${adjusted ? ' metric-grid' : ''}"><div class="metric"><span>${goalTitle}${adjusted ? ' · 보정 후' : ''}</span><strong id="boss-goal-gap">${goalValue}</strong><p class="hint">${goalNote}${adjusted ? ` ${beforeGoal}.` : ''}</p></div>${adjusted ? `<div class="metric"><span>${adjustmentName} 전 → 후</span><strong id="boss-hexa-comparison"><span>${timeText(result.expectedSeconds)}</span> <small>→</small> <span>${time}</span></strong><p class="hint" id="boss-time-saved">${savedText}</p><p class="hint">${combined ? '각 스킬의 스탯 변화율과 HEXA 변화율을 결합한 결과입니다.' : applyPrecision ? '측정 대비 입력한 스탯·대상 보정만 반영합니다.' : '선택한 HEXA 코어의 다음 1레벨 효과만 반영합니다.'}</p></div>` : ''}</div>`;
  $('boss-output').innerHTML = `<div class="metric-grid"><div class="metric accent"><span>${adjusted ? `${adjustmentName} 후 예상 소요 시간` : '입력 조건의 예상 소요 시간'}</span><strong id="boss-estimate">${time}</strong><p class="hint">${verdict}</p></div><div class="metric"><span>제한 시간 대비 피해량</span><strong>${between(lower.coverage * 100, upper.coverage * 100)}%</strong><p class="hint">확률이 아닌 필요 피해량 대비 비율</p></div></div>${goalCards}<dl class="stat-list"><div><dt>측정 평균 DPS</dt><dd>${damageText(result.measuredDps)} / 초</dd></div><div><dt>${adjusted ? '보정·딜 유지율 적용 DPS' : '딜 유지율 적용 DPS'}</dt><dd>${dps} / 초</dd></div><div><dt>시간 내 필요한 평균 DPS</dt><dd>${damageText(result.requiredDps)} / 초</dd></div></dl><p class="notice">${applyPrecision ? '방어율은 스킬 보정 패널의 입력값으로 비교했습니다. 속성 내성·레벨·포스·버프와 스킬 사용 조건은 동일하다고 가정합니다.' : '측정 대상과 보스의 방어율·속성 내성·레벨·포스 조건이 같다고 가정한 시간입니다.'} 페이즈 제한·강제 대기·회복·생존은 별도이며, 실제 클리어를 보장하지 않습니다. 이미 측정에 포함된 딜 손실은 유지율에서 중복 적용하지 마세요.</p>`;
}
function renderPractice() {
  const measurement = practiceMeasurement(practice);
  if (!measurement) throw new Error('양수인 피해량과 측정 시간이 있는 기록을 사용해주세요.');
  const atRecord = calculateScore(inputsFromStats(practice.characterInfo.stat_object.basic_stat_object));
  const recordedBasic = practice.characterInfo.basic_object;
  const endTypes = { '1': '자동 종료', '2': '수동 종료', '3': '시간 초과 종료', '9': '기타 종료' };
  const skills = [...(Array.isArray(practice.result.skill_statistic) ? practice.result.skill_statistic : [])].sort((a, b) => (Number(b.damage) || 0) - (Number(a.damage) || 0));
  $('practice-record').hidden = false;
  $('practice-record').innerHTML = `<p class="hint">${esc(practice.replay.register_date)} 등록 · ${esc(recordedBasic.character_name)} · ${esc(endTypes[String(practice.result.end_type)] || '종료 방식 정보 없음')}</p><div class="metric-grid"><div class="metric"><span>등록 기록의 평균 DPS</span><strong>${damageText(measurement.dps)}</strong><p class="hint">${fmt(measurement.seconds, 3)}초 동안 ${damageText(measurement.totalDamage)} 피해</p></div><div class="metric"><span>측정 당시 기본 스탯 지수</span><strong>${atRecord.ok ? fmt(atRecord.score) + '점' : '정보 부족'}</strong><p class="hint">현재 장비·수정 스탯과 별도 계산</p></div></div><details><summary>스킬별 피해 점유율</summary><ul class="core-list">${skills.map(skill => `<li><span>${esc(skill.skill_name)}</span><strong>${fmt(numberValue(skill.damage_percent), 2)}%</strong></li>`).join('') || '<li>스킬별 정보가 없습니다.</li>'}</ul></details><p class="hint">아래 총 피해량과 측정 시간에 이 기록을 입력했습니다. 보스 체력을 입력하면 예상 시간이 표시됩니다.</p>`;
  $('total-damage').value = measurement.totalDamage / 1e12;
  $('battle-seconds').value = measurement.seconds;
  $('uptime').value = '100';
  hexaView.setPractice(practice);
  precisionView.setPractice(practice);
}

hexaView = createHexaView($('hexa-panel'), {
  getCurrentScore: () => { const result = calculateScore(readInputs()); return result.ok ? result.score : null; },
  getMeasurement: () => ({ totalDamage: Number($('total-damage').value) * 1e12, seconds: Number($('battle-seconds').value) }),
  onChange: () => precisionView ? precisionView.refresh() : renderBoss(),
});
precisionView = createPrecisionView($('precision-panel'), {
  getCurrentStats: readInputs,
  getHexaScenario: () => hexaView.getScenario(),
  getMeasurement: () => ({ totalDamage: Number($('total-damage').value) * 1e12, seconds: Number($('battle-seconds').value) }),
  onChange: () => { renderBoss(); referenceView?.refresh(); },
});
referenceView = createReferenceView($('reference-panel'), {
  getBasic: () => ({ ...calculateScore(readInputs()), scenario: readInputs() }),
  getPrecision: () => precisionView.getReferenceBasis(),
});

$('character-form').addEventListener('submit', async event => {
  event.preventDefault(); if (busy) return;
  const name = $('character-name').value.trim(), nextKey = $('combat-api-key').value.trim() || apiKey;
  if (!name || !nextKey) { status('combat-status', '캐릭터 이름과 넥슨 API 키를 입력해주세요.', true); return; }
  clearCharacter(); apiKey = nextKey; $('combat-api-key').required = false;
  $('clear-character').hidden = false; controller = new AbortController(); const current = revision;
  setBusy(true);
  try {
    const result = await loadCharacter({ name, apiKey, signal: controller.signal, onProgress: message => { if (current === revision) status('combat-status', message); } });
    if (current !== revision) return;
    character = result; original = inputsFromStats(result.stats); writeInputs(original); renderCharacter(); renderScore();
    hexaView.setCharacter(result);
    precisionView.setCharacter(result);
    status('combat-status', `${result.basic.character_name}의 스탯을 불러왔습니다. 값을 수정하면 자체 환산이 바로 갱신됩니다.`);
  } catch (error) {
    if (current !== revision) return;
    apiKey = ''; $('combat-api-key').required = true;
    status('combat-status', error.message, true);
  } finally { if (current === revision) setBusy(false); }
});
$('clear-character').addEventListener('click', () => { clearCharacter(); status('combat-status', '연결을 해제하고 API 키·조회 기록을 지웠습니다.'); });
$('manual-form').addEventListener('submit', event => event.preventDefault());
$('manual-form').addEventListener('input', () => { renderScore(); hexaView.refresh(); });
$('boss-form').addEventListener('submit', event => event.preventDefault());
$('boss-form').addEventListener('input', () => { if (practice) status('practice-status', '실측 기록은 위에 보존됩니다. 아래 계산에는 입력한 피해량·시간을 사용합니다.'); hexaView.refresh(); });
$('load-practice').addEventListener('click', async () => {
  if (busy || !character || !apiKey) return;
  const current = revision; controller = new AbortController(); clearPractice(); setBusy(true);
  try {
    const result = await loadPractice({ ocid: character.ocid, apiKey, signal: controller.signal, onProgress: message => { if (current === revision) status('practice-status', message); } });
    if (current !== revision) return;
    if (!result) { status('practice-status', '등록된 연무장 기록이 없습니다. 게임에서 기록을 등록하거나 전투분석의 총 피해량과 측정 시간을 직접 입력해주세요.'); return; }
    practice = result; renderPractice(); status('practice-status', '가장 최근 등록 기록을 불러왔습니다. 현재 스탯과 측정 당시 스탯은 따로 표시합니다.');
  } catch (error) { if (current === revision) status('practice-status', [400, 404].includes(error.status) ? '이 캐릭터의 연무장 기록을 조회할 수 없습니다. 게임 내 리플레이 등록 여부와 조회 권한을 확인하거나 전투분석을 직접 입력해주세요.' : error.message, true); }
  finally { if (current === revision) setBusy(false); }
});
// No localStorage, sessionStorage, analytics, or service worker handles the key.
window.addEventListener('pagehide', () => { apiKey = ''; controller?.abort(); $('combat-api-key').value = ''; $('combat-api-key').required = true; });
window.addEventListener('pageshow', event => { if (event.persisted) { clearCharacter(); status('combat-status', '화면으로 돌아왔습니다. API 키를 다시 연결해주세요.'); } });
renderScore(); hexaView.reset(); precisionView.reset();
