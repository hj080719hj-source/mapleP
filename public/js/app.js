import { ITEMS, PARTS, LEVELS, DEFAULTS as ENGINE_DEFAULTS, calculate, validate, attemptCost, starRates, reachableStars, isSafeguarded, stageBreakdown, optimizeSafeguard, recoveryTableCost, acceptsAnyMainStat } from './engine.js';
import {equipmentIcon} from './icons.js';
import {mountSimulation} from './simulation-ui.js';
import {additionalThresholds} from './engine.js';
import {EQUIPMENT_PRICES,defaultEquipmentPrice} from './equipment-prices.js';

const page = document.body.dataset.page;
const $ = id => document.getElementById(id);
const esc = text => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const number = (n, digits = 2) => n.toLocaleString('ko-KR', { maximumFractionDigits: digits });
const money = n => n >= 1e8 ? `${number(n / 1e8)}억` : n >= 1e4 ? `${number(n / 1e4)}만` : number(n, 0);
const storageKey = 'maple-lab:v1';
const optionDefaults={miracle:true,additionalGrade:'rare',discount:true,destroyDiscount:true,recoveryDiscount:true,guarantee:false,mvp:.1,pcBang:true,autoSafeguard:true,safeguardStages:null,optionsVersion:1};
const DEFAULTS={...ENGINE_DEFAULTS,...optionDefaults};
const priceStorageKey='maple-you:equipment-prices:v1';
let priceOverrides={};
try {
  const saved=JSON.parse(localStorage.getItem(priceStorageKey) || '{}');
  priceOverrides=Object.fromEntries(Object.entries(saved).filter(([key,value])=>/^[a-z-]+:\d+$/.test(key) && Number.isFinite(value) && value>=0 && value<=100000));
} catch { /* Optional storage. */ }
const priceKey=()=>`${state.item}:${state.part}`;
function loadEquipmentPrice() {
  state.purchase=priceOverrides[priceKey()] ?? defaultEquipmentPrice(state.item);
  state.spare=state.purchase;
  if ($('purchase')) $('purchase').value=state.purchase;
}
function saveEquipmentPrice() {
  const value=Number($('purchase').value);
  if ($('purchase').value.trim() && Number.isFinite(value) && value>=0 && value<=100000) {
    priceOverrides[priceKey()]=value;
    try { localStorage.setItem(priceStorageKey,JSON.stringify(priceOverrides)); } catch { /* Optional storage. */ }
  }
}
let data;
let result;
let state = {...structuredClone(DEFAULTS), stat:'', recovery:'auto'};
if (page === 'combined') Object.assign(state, {item:'meister',level:140,part:18});
try {
  const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
  if (saved) {
    const merged = { ...state, ...Object.fromEntries(Object.entries(saved).filter(([k]) => k in DEFAULTS)) };
    if (!saved.recoveryVersion) merged.recovery='auto';
    if (!saved.optionsVersion) Object.assign(merged,optionDefaults);
    validate(merged);
    state = merged;
  }
} catch { /* A blocked or corrupt local store must not prevent calculation. */ }
const query = new URLSearchParams(location.search);
const requestedItem = ITEMS.find(i=>i.id===query.get('item'));
if (requestedItem) {
  state = {...structuredClone(DEFAULTS),stat:'',recovery:'auto',item:requestedItem.id,level:requestedItem.level,part:requestedItem.part};
  if (requestedItem.parts?.includes(Number(query.get('part')))) state.part=Number(query.get('part'));
  const candidate = {...state};
  for (const key of ['target','threshold']) if(query.has(key)) candidate[key]=Number(query.get(key));
  if(query.has('stat')) candidate.stat=query.get('stat');
  try {validate(candidate);state=candidate;} catch { /* Invalid optional URL values are ignored. */ }
}

loadEquipmentPrice();
if (['reset','preserve','auto'].includes(query.get('recovery'))) state.recovery=query.get('recovery');
state.start = 0;
state.target = state.target === 0 ? 0 : Math.max(17,Math.min(27,state.target));
if (['STR','DEX','INT','LUK'].includes(state.stat)) state.stat='주스탯';
if (!['주스탯','올스탯','공격력','마력','쿨타임 감소','크리티컬 데미지'].includes(state.stat)) state.stat = '';
function targetThresholds() {
  if (state.stat === '쿨타임 감소') return [1,2,3,4,5,6];
  if (state.stat === '크리티컬 데미지') return [8,16,24];
  return state.stat === '올스탯' ? (state.level > 200 ? [24,27,30] : [21,24,27]) : [27,30,33,36,39];
}
function targetUnit() { return state.stat === '쿨타임 감소' ? '초' : '%'; }
function additionalUnit() { return state.additionalStat === '쿨타임 감소' ? '초' : '%'; }
function additionalStats() {
  return [['','선택 없음'],...['주스탯','올스탯','공격력','마력','쿨타임 감소','크리티컬 데미지']
    .filter(stat=>additionalThresholds({...state,additionalStat:stat},data?.additional).length)
    .map(stat=>[stat,stat+(stat==='쿨타임 감소'?'':'%')])];
}
function defaultThreshold() { return state.stat === '쿨타임 감소' ? 2 : state.stat === '크리티컬 데미지' ? 8 : 27; }
function targetStats() {
  const lines = data?.tables?.[`${state.part}-${state.level}`] ?? [];
  const attackOptions = ['공격력','마력'].filter(stat => lines.some(line => line.some(option => option.probability > 0 && option.name.startsWith(`${stat} +`) && /\+\d+%$/.test(option.name))));
  const specialOptions = [];
  if (state.part === 6 && lines.some(line=>line.some(o=>o.probability>0 && /^스킬 재사용 대기시간 -\d+초$/.test(o.name)))) specialOptions.push(['쿨타임 감소','쿨타임 감소']);
  if (state.part === 11 && lines.some(line=>line.some(o=>o.probability>0 && /^크리티컬 데미지 \+\d+%$/.test(o.name)))) specialOptions.push(['크리티컬 데미지','크리티컬 데미지%']);
  return [['','선택 없음'],['주스탯','주스탯%'],['올스탯','올스탯%'],...attackOptions.map(stat=>[stat,`${stat}%`]),...specialOptions];
}
if (!targetThresholds().includes(state.threshold)) state.threshold = defaultThreshold();
const title = { combined: '잠재능력 · 스타포스 기대값 계산기', potential: '잠재능력 기대값 계산기',
  starforce: '스타포스 기대값 계산기', guide: '계산 기준과 데이터 출처' }[page];
const checkbox = (id, label, hint = '') => `<label class="check"><input type="checkbox" id="${id}" ${state[id] ? 'checked' : ''}><span>${label}${hint ? `<small>${hint}</small>` : ''}</span></label>`;
const options = (list, selected) => list.map(([value, label]) => `<option value="${value}" ${String(value) === String(selected) ? 'selected' : ''}>${esc(label)}</option>`).join('');
const field = (label, id, control, hint = '') => `<label class="field" for="${id}"><span>${label}</span>${control}${hint ? `<small>${hint}</small>` : ''}</label>`;
const input = (id, min, max, step = '1') => `<input id="${id}" type="number" min="${min}" max="${max}" step="${step}" value="${state[id]}" required>`;
const select = (id, list) => `<select id="${id}">${options(list, state[id])}</select>`;
const gradeLabels = {rare:'레어',epic:'에픽',unique:'유니크',legendary:'레전드리'};
const potentialStart = () => field('시작 등급','potentialGrade',select('potentialGrade',Object.entries(gradeLabels))) + `<p class="hint">선택한 등급부터 등업 비용 포함 · 레전드리는 옵션 재설정 비용만 계산</p>`;
const additionalStart = () => `<div class="additional-settings">${field('에디셔널 시작 등급','additionalGrade',select('additionalGrade',Object.entries(gradeLabels)))}<p class="hint">레전드리 목표 · 천장 누적 0회 · 메소 재설정 기준</p></div>`;
const potentialEvents = () => `<div class="option-row potential-events"><strong>잠재능력 이벤트</strong><div class="potential-event-choices"><span class="miracle-chip">${checkbox('miracle','미라클타임 적용')}</span><p class="hint">일반 잠재·에디셔널 함께 적용 · 등업 확률 2배 · 옵션 확률과 천장 횟수는 동일</p></div></div>`;
function additionalDetail(r) {
  if (!r) return '';
  return `<section class="card detail-card" id="additional-detail"><h3>에디셔널 · ${esc(state.additionalStat)} ${state.additionalThreshold}${additionalUnit()} 이상</h3><p class="hint">${gradeLabels[state.additionalGrade]} 시작 · ${state.miracle?'미라클 적용':'일반 등업'} · ${r.anyMainStat?'공용 장비의 주스탯 중 하나':'주스탯 선택 시 한 스탯 기준'}</p><dl class="metrics">
  ${r.upgrade.rows.map(row=>`<div><dt>${row.name} · ${number(row.probability*100,4)}%</dt><dd>${money(row.cost)} 메소</dd></div><div><dt>평균 ${number(row.attempts)}회 / 최대 ${row.maxAttempts}회</dt><dd>1회 ${money(row.unitCost)} 메소</dd></div>`).join('')}
  <div><dt>등업 비용</dt><dd id="additional-upgrade-cost">${money(r.upgrade.cost)} 메소</dd></div><div><dt>옵션 재설정 비용</dt><dd>${money(r.optionCost)} 메소</dd></div><div><dt>레전드리 옵션 달성 확률</dt><dd>${number(r.probability*100,6)}%</dd></div><div><dt>평균 추가 재설정</dt><dd>${number(r.attempts)}회</dd></div><div><dt>레전드리 1회 비용</dt><dd>${money(r.unitCost)} 메소</dd></div></dl><p class="hint">등업 때 생성되는 첫 레전드리 옵션 포함. 기존과 동일한 옵션 재등장 제외를 생략한 근사값입니다. <a href="https://maplestory.nexon.com/Guide/OtherProbability/cube/addi" target="_blank" rel="noopener noreferrer">공식 확률표 ↗</a> · <a href="https://maplestory.nexon.com/news/update/746" target="_blank" rel="noopener noreferrer">비용 기준 ↗</a></p></section>`;
}

function shell() {
  $('app').innerHTML = `<a class="skip" href="#main">본문으로 이동</a>
  <header class="sidebar"><a class="brand" href="./"><img src="./favicon.svg" alt="" width="38" height="38"><span>메이플유<small>MAPLE YOU</small></span></a></header>
  <div class="workspace">
    <main id="main"><section class="hero"><div><p class="eyebrow">MAKE YOUR NEXT UPGRADE COUNT</p><h1>${title}</h1><p class="subtitle">${page === 'guide' ? '계산에 사용한 데이터와 지원 범위를 안내합니다.' : '장비와 목표를 고르면, 완성까지의 평균 비용이 한눈에.'}</p></div><div class="hero-art" aria-hidden="true"><div class="orbit"></div><span class="spark a">✦</span><span class="spark b">✧</span><span class="spark c">✦</span><div class="gem">◇</div><span class="art-label">YOUR NEXT LEVEL</span></div></section>
    <div id="content"></div></main><footer>메이플유는 넥슨과 무관한 비공식 팬 제작 계산기입니다.<br>기대값은 평균이며 실제 소모 메소나 완제품 거래 가격을 보장하지 않습니다.</footer></div><div id="toast" role="status"></div>`;
}

function form() {
  $('content').innerHTML = `<div class="intro-strip"><span class="dot"></span><strong>${page === 'potential' ? '목표 옵션까지의 평균 재설정 비용' : page === 'starforce' ? '강화 · 파괴 · 복구 비용을 한 번에' : '잠재능력 + 스타포스, 하나의 목표로'}</strong><span>장비 가격 직접 입력 · 확률표 확인 2026.09.12</span></div>
    <div class="calculator-layout"><form id="calculator" class="form-stack">
      <section class="card equipment-card"><div class="section-heading"><span class="step">01</span><h2>장비 선택</h2><span class="pill">전체 ${ITEMS.length}개 장비 · 방어구 묶음</span></div>
      <div class="equipment-grid" aria-label="렙제별 장비 선택">${LEVELS.map(level => `<div class="equipment-row"><span class="level-label">Lv. ${level}</span><div>${ITEMS.filter(i=>i.level===level).map(i=>`<button type="button" data-item="${i.id}" title="${i.name}" aria-label="${i.name}" aria-pressed="${state.item===i.id}">${equipmentIcon(i)}${i.label}</button>`).join('')}</div></div>`).join('')}</div><div id="group-parts" class="chips group-parts"></div><p id="item-note" class="hint"></p>
      <div hidden>
      ${field('장비 선택', 'item', select('item', [...ITEMS.map(i => [i.id, `${i.name} · Lv.${i.level}`]), ['custom', '직접 설정']]))}
      <div class="item-preview"><div class="item-symbol" aria-hidden="true">◇</div><div><strong id="item-name"></strong><small id="item-meta"></small></div><span class="pill">일반 장비</span></div>
      <div class="field-grid">${field('아이템 레벨 제한', 'level', select('level', LEVELS.map(n => [n, `Lv. ${n}`])))}${field('장비 부위', 'part', select('part', Object.entries(PARTS)))}</div></div>
      </section>
      <section class="card potential-card goal-card"><div class="section-heading"><span class="step">02</span><h2>목표 설정</h2>${page !== 'potential' ? `<span class="star-label">★ <span id="star-label">${state.target}</span></span>` : '<span class="pill">시작 등급 선택 가능</span>'}</div>
      <div class="goal-fields ${page}">
      ${field('장비 1개 가격 (억 메소)', 'purchase', input('purchase', 0, 100000, '0.01'))}
      <div class="price-source"><span id="price-note"></span><button type="button" class="text-button" id="reset-price">기본 가격으로</button></div>
      ${page !== 'starforce' ? `${field('목표 잠재', 'stat', select('stat', targetStats()))}${field(`목표 합계 (${targetUnit()}) 이상`, 'threshold', select('threshold', targetThresholds().map(n=>[n,`${n}${targetUnit()} 이상`])) )}` : ''}
      ${page !== 'starforce' ? `${field('목표 에디셔널','additionalStat',select('additionalStat',additionalStats()))}${field('에디셔널 합계 (%) 이상','additionalThreshold',select('additionalThreshold',additionalThresholds(state,data.additional).map(n=>[n,`${n}${additionalUnit()} 이상`])))}<p class="hint additional-hint">에디셔널은 별도 레전드리 목표입니다. 주스탯에는 올스탯%를 포함하며, 고정 스탯·9레벨당 스탯은 %로 환산하지 않습니다. 일반 잠재도 주스탯이면 같은 스탯을 맞추는 순서로 계산합니다.</p>` : ''}
      ${page !== 'potential' ? `<div class="star-target-field"><span id="star-target-title">목표 스타포스</span><input type="hidden" id="target" value="${state.target}"><div class="chips star-target-buttons" role="group" aria-labelledby="star-target-title">${[0,17,18,19,20,21,22,23,24,25,26,27].map(n=>`<button type="button" data-target="${n}" aria-pressed="${state.target===n}">${n?`${n}성`:'선택 없음'}</button>`).join('')}</div><p class="hint">선택 없음이면 스타포스 강화·복구 비용을 제외합니다.</p></div>` : ''}
      </div>
      <p class="hint">장비 가격은 최초 장비와 스페어에 공통 적용합니다. 0이면 장비 구매비를 제외합니다.</p>
      ${page !== 'starforce' ? '<p class="notice" id="potential-rule"></p>' : ''}
      <p class="hint">${page !== 'starforce' ? '잠재: 선택한 시작 등급부터 등업 포함 · 선택 없음이면 비용 제외 · 천장 누적 0회 · 에디셔널 별도 선택' : ''}${page === 'combined' ? '<br>' : ''}${page !== 'potential' ? '스타포스: 0성부터 목표까지 강화·파괴 복구 비용 포함' : ''}</p>
      ${page === 'potential' ? `<details class="potential-settings" open><summary>상세 옵션 · 잠재능력</summary>${potentialStart()}${additionalStart()}${potentialEvents()}</details>` : ''}</section>
      ${page !== 'potential' ? `<details class="card option-card" open><summary><span class="step">03</span> 상세 옵션 <span class="summary-hint">이벤트 · 할인 · 파괴 방지 · 복구</span></summary>
      <div class="option-row"><strong>잠재능력</strong><div>${potentialStart()}</div></div>
      ${page !== 'starforce' ? `<div class="option-row"><strong>에디셔널</strong>${additionalStart()}</div>` : ''}
      ${page !== 'starforce' ? potentialEvents() : ''}
      <div class="option-row"><strong>스타포스 이벤트</strong><div class="chips" id="event-presets">${[['none','이벤트 없음'],['cost','30% 할인'],['destroy','30% 파괴 감소'],['shining','샤이닝'],['shining-guarantee','샤이닝 + 5·10·15성 확정']].map(([id,label])=>`<button type="button" data-event="${id}">${label}</button>`).join('')}<p class="hint" id="event-description"></p></div></div>
      <div class="option-row"><strong>MVP 할인</strong><div class="chips">${[[0,'없음 · 브론즈'],[.03,'실버 3%'],[.05,'골드 5%'],[.1,'다이아 이상 10%']].map(([value,label])=>`<button type="button" data-mvp="${value}">${label}</button>`).join('')}</div></div>
      <div class="option-row"><strong>PC방</strong>${checkbox('pcBang','5% 추가 할인','0→1성부터 16→17성까지 MVP와 합산 적용')}</div>
      <div class="option-row"><strong>파괴 방지</strong><div>${checkbox('autoSafeguard','기대 비용 최소로 자동 선택','장비 가격·이벤트·할인·복구 조건이 바뀌면 다시 비교합니다.')}<div class="chips">${[15,16,17].map(n=>`<button type="button" data-guard="${n}">${n}성</button>`).join('')}</div><p class="hint" id="guard-result" role="status"></p><p class="hint">직접 성수를 누르면 수동 선택으로 전환됩니다. 최종 강화비를 직접 입력한 단계는 현재 방지 설정을 유지합니다.</p></div></div>
      <details class="custom-events"><summary>이벤트 효과 개별 설정</summary>${checkbox('safeguard','15~17성 모두 파괴 방지')}${checkbox('discount','강화 비용 30% 할인','파괴 방지 추가 비용에는 할인이 적용되지 않습니다.')}${checkbox('destroyDiscount','21성 이하 파괴 확률 30% 감소')}${checkbox('guarantee','5·10·15성에서 100% 성공')}${checkbox('recoveryDiscount','별 유지 복구 메소 20% 할인')}</details>
      ${field('파괴 후 복구 방식', 'recovery', select('recovery', [['auto','자동 최적화 · 12성 / 성수 유지 비교'],['reset','장비 1개로 12성 복구'],['preserve','성수 유지 확정 복구']]))}
      <p class="hint" id="recovery-result" role="status"></p>
      <div id="recovery-fields"></div><p class="hint">스타캐치 성공 보정 상시 적용 · 실패 시 별 하락 없음</p>
      <details id="cost-details"><summary>단계별 강화 비용 확인 · 직접 수정</summary><p class="hint">기본값은 추정 산식입니다. 인게임의 할인·파괴 방지까지 적용된 <strong>최종 1회 비용</strong>을 메소 단위로 입력하면 해당 값을 우선 사용합니다. 이벤트를 바꿨다면 직접 입력한 비용도 수정해주세요.</p><div class="table-scroll"><table><thead><tr><th>강화 단계</th><th>1회 최종 비용 (메소)</th></tr></thead><tbody id="cost-fields"></tbody></table></div><button type="button" class="text-button" id="clear-costs">직접 입력한 비용 지우기</button></details></details>` : ''}
      <div id="form-error" class="error" role="alert" hidden></div><div class="form-actions"><button class="primary" type="submit">기대 비용 계산하기 <span>↗</span></button><button class="secondary" type="button" id="reset">초기화</button></div>
    </form><aside class="result-column" aria-label="계산 결과"><div id="result" aria-live="polite"><section class="card">확률표를 불러오는 중입니다…</section></div></aside><details class="card stages-card" id="stages" ${page === 'potential' ? 'hidden' : ''}><summary><span class="step">${page === 'starforce' ? '04' : '05'}</span> 단계별 상세 표</summary><p class="hint">스타포스만의 누적 기대 비용입니다. 파괴 후 재강화와 복구를 포함하며 잠재능력·시작 장비 구매비는 제외합니다.</p><div class="table-scroll"><table><thead><tr><th>강화 단계</th><th>단계별 비용</th><th>누적 비용</th><th>누적 평균 파괴</th><th>누적 평균 시도</th></tr></thead><tbody id="stage-rows"></tbody></table></div></details></div>`;
  syncItem();
  renderAdvanced();
  $('calculator').addEventListener('submit', e => { e.preventDefault(); compute(); });
  $('calculator').addEventListener('input', e => {
    result = null;
    const note = $('result-state');
    if (note) note.textContent = '조건 변경됨 · 계산 버튼을 눌러 결과를 갱신하세요.';
  });
  $('calculator').addEventListener('change', e => {
    if (e.target.id === 'purchase') saveEquipmentPrice();
    if (e.target.id === 'item') {
      const item = ITEMS.find(i => i.id === $('item').value);
      if (item) { $('level').value = item.level; $('part').value = item.part; }
      state.item=$('item').value;state.part=Number($('part').value);loadEquipmentPrice();
      state.costOverrides = {}; state.recoveryFees = {};
    }
    if (e.target.id === 'level') { state.costOverrides = {}; state.recoveryFees = {}; }
    if (e.target.id === 'safeguard') {state.safeguardStages = null; $('autoSafeguard').checked=false;}
    if (e.target.dataset.cost !== undefined) {
      const k = e.target.dataset.cost;
      if (e.target.value.trim() === '') delete state.costOverrides[k]; else state.costOverrides[k] = Number(e.target.value);
      readForm(); compute(); return;
    }
    if (e.target.dataset.recovery !== undefined) {
      const k = e.target.dataset.recovery;
      if (e.target.value.trim() === '') delete state.recoveryFees[k]; else state.recoveryFees[k] = Number(e.target.value);
      readForm(); compute(); return;
    }
    readForm(); syncItem(); renderAdvanced(); compute();
  });
  $('group-parts').addEventListener('click',e=>{
    const button=e.target.closest('[data-part]');if(!button)return;
    $('part').value=button.dataset.part;readForm();loadEquipmentPrice();syncItem();compute();
  });
  document.querySelectorAll('[data-item]').forEach(b=>b.addEventListener('click',()=>{
    $('item').value = b.dataset.item;
    $('item').dispatchEvent(new Event('change',{bubbles:true}));
  }));
  document.querySelectorAll('[data-event]').forEach(b=>b.addEventListener('click',()=>{
    const preset = b.dataset.event;
    $('discount').checked = ['cost','shining','shining-guarantee'].includes(preset);
    $('destroyDiscount').checked = ['destroy','shining','shining-guarantee'].includes(preset);
    $('recoveryDiscount').checked = preset.startsWith('shining');
    $('guarantee').checked = preset === 'shining-guarantee';
    readForm(); renderAdvanced(); compute();
  }));
  document.querySelectorAll('[data-mvp]').forEach(b=>b.addEventListener('click',()=>{
    state.mvp = Number(b.dataset.mvp); readForm(); renderAdvanced(); compute();
  }));
  document.querySelectorAll('[data-guard]').forEach(b=>b.addEventListener('click',()=>{
    $('autoSafeguard').checked = false;
    const stages = state.safeguardStages ?? (state.safeguard ? [15,16,17] : []);
    const stage = Number(b.dataset.guard);
    state.safeguardStages = stages.includes(stage) ? stages.filter(n=>n!==stage) : [...stages,stage];
    $('safeguard').checked = state.safeguardStages.length === 3;
    readForm(); renderAdvanced(); compute();
  }));
  document.querySelectorAll('[data-target]').forEach(b => b.addEventListener('click', () => { $('target').value = b.dataset.target; $('target').dispatchEvent(new Event('change',{bubbles:true})); }));
  $('reset-price').addEventListener('click',()=>{delete priceOverrides[priceKey()];try {localStorage.setItem(priceStorageKey,JSON.stringify(priceOverrides));}catch{}loadEquipmentPrice();$('purchase').dispatchEvent(new Event('input',{bubbles:true}));syncItem();compute();});
  $('reset').addEventListener('click', () => { state = {...structuredClone(DEFAULTS),stat:'',recovery:'auto'}; loadEquipmentPrice(); form(); compute(); mountSimulation(()=>{result=null;compute();return result?structuredClone(state):null;},data,page); });
  $('clear-costs')?.addEventListener('click', () => { state.costOverrides = {}; renderAdvanced(); compute(); });
}
function readForm() {
  state.start = 0;
  state.allStat = true;
  state.achieved = false;
  for (const key of Object.keys(DEFAULTS)) {
    const el = $(key);
    if (!el) continue;
    if (el.type === 'checkbox') state[key] = el.checked;
    else state[key] = typeof DEFAULTS[key] === 'number' ? (el.value.trim() === '' ? NaN : Number(el.value)) : el.value;
  }
  state.spare = state.purchase;
}
function syncItem() {
  const known=Object.hasOwn(EQUIPMENT_PRICES,state.item);
  $('price-note').textContent=known?'':'기본값 없음 · 가격을 입력해주세요.';
  if ($('additionalStat')) {
    const stats=additionalStats();
    if (!stats.some(([value])=>value===state.additionalStat)) state.additionalStat='';
    $('additionalStat').innerHTML=options(stats,state.additionalStat);
    const thresholds=additionalThresholds(state,data.additional);
    if (!thresholds.includes(state.additionalThreshold)) state.additionalThreshold=thresholds.find(n=>n>=14) ?? thresholds[0] ?? 14;
    $('additionalThreshold').innerHTML=options(thresholds.map(n=>[n,`${n}${additionalUnit()} 이상`]),state.additionalThreshold);
    $('additionalThreshold').disabled=!state.additionalStat;
    $('additionalThreshold').closest('label').querySelector('span').textContent=`에디셔널 합계 (${additionalUnit()}) 이상`;
  }
  if ($('stat')) {
    const stats = targetStats();
    if (!stats.some(([value])=>value === state.stat)) state.stat = '';
    $('stat').innerHTML = options(stats,state.stat);
  }
  if ($('threshold')) {
    const thresholds = targetThresholds();
    if (!thresholds.includes(state.threshold)) state.threshold = defaultThreshold();
    $('threshold').closest('label').querySelector('span').textContent = `목표 합계 (${targetUnit()}) 이상`;
    $('threshold').innerHTML = options(thresholds.map(n=>[n,`${n}${targetUnit()} 이상`]),state.threshold);
  }
  const selected = ITEMS.find(i => i.id === $('item').value);
  $('level').disabled = !!selected;
  $('part').disabled = !!selected;
  $('item-name').textContent = selected?.name || '직접 설정한 장비';
  $('item-meta').textContent = `Lv.${$('level').value} · ${PARTS[$('part').value]}`;
  $('group-parts').innerHTML=selected?.parts ? `<span>계산할 부위</span>${selected.parts.map(part=>`<button type="button" data-part="${part}" aria-pressed="${Number($('part').value)===part}">${PARTS[part]}</button>`).join('')}` : '';
  $('item-note').textContent=selected?.special?'특수 무기의 스타포스는 규칙 검증 중입니다. 잠재능력 페이지에서 옵션 비용을 확인할 수 있습니다.':selected?.parts?'선택한 부위의 잠재 확률로 장비 1개를 계산합니다. 묶음 전체 합계가 아닙니다.':'';
  document.querySelectorAll('[data-item]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.item === $('item').value)));
  if($('potential-rule')) $('potential-rule').textContent = state.stat === '쿨타임 감소' ? '쿨타임 감소 옵션의 초 합계만 계산합니다. 주스탯·올스탯은 합산하지 않습니다.' : state.stat === '크리티컬 데미지' ? '크리티컬 데미지% 옵션의 합계만 계산합니다. 크리티컬 확률·주스탯은 합산하지 않습니다.' : state.stat === '올스탯' ? '올스탯% 옵션의 합계만 계산합니다. STR·DEX·INT·LUK 개별 옵션은 합산하지 않습니다.' : !state.stat ? (selected?.shared?'공용 장비 · 주스탯을 선택하면 STR·DEX·INT·LUK 중 하나라도 목표 이상이면 성공입니다.':'직업별 장비 · 선택한 스탯 하나를 목표로 계산합니다.') : acceptsAnyMainStat(state)?'공용 장비: STR·DEX·INT·LUK 중 하나라도 목표 이상이면 성공 · 올스탯 포함 · 서로 다른 주스탯은 합산하지 않음':`선택한 ${state.stat}%만 목표로 계산합니다. 주스탯에는 올스탯%를 포함합니다.`;
}
function activeStars() {
  return reachableStars(state);
}
function renderAdvanced() {
  if (!$('cost-fields')) return;
  $('star-label').textContent = state.target === 0 ? '선택 없음' : state.target;
  document.querySelectorAll('[data-target]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.target)===state.target)));
  document.querySelectorAll('[data-mvp]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.mvp)===state.mvp)));
  document.querySelectorAll('[data-guard]').forEach(b=>{b.disabled=state.guarantee && Number(b.dataset.guard)===15; b.setAttribute('aria-pressed',String(isSafeguarded(Number(b.dataset.guard),state)));});
  const preset = !state.discount && !state.destroyDiscount && !state.guarantee && !state.recoveryDiscount ? 'none'
    : state.discount && state.destroyDiscount && state.recoveryDiscount ? (state.guarantee ? 'shining-guarantee':'shining')
    : state.discount && !state.destroyDiscount && !state.guarantee && !state.recoveryDiscount ? 'cost'
    : !state.discount && state.destroyDiscount && !state.guarantee && !state.recoveryDiscount ? 'destroy' : '';
  document.querySelectorAll('[data-event]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.event===preset)));
  $('event-description').textContent = [state.discount?'강화 비용 30% 할인':'강화 비용 할인 없음',state.destroyDiscount?'21성 이하 파괴 30% 감소':'',state.recoveryDiscount?'별 유지 복구 메소 20% 할인':'',state.guarantee?'5·10·15성 확정 성공':''].filter(Boolean).join(' · ');
  const stars = activeStars();
  $('cost-fields').innerHTML = stars.map(star => {
    let cost = '';
    try { cost = attemptCost(star, { ...state, costOverrides: {} }); } catch { /* Validation is handled by compute. */ }
    return `<tr><td>${star} → ${star+1}성</td><td><input aria-label="${star}성 최종 강화 비용" type="number" min="1" max="10000000000000" step="1" data-cost="${star}" placeholder="${cost}" value="${esc(state.costOverrides?.[star] ?? '')}"></td></tr>`;
  }).join('');
  const recoveryStars=[...new Set(stars.filter(star=>starRates(star,state.autoSafeguard?{...state,safeguard:false,safeguardStages:[]}:state).destroy>0).map(star=>Math.min(star,22)))];
  $('recovery-fields').innerHTML=state.recovery==='reset'?'':`<p class="hint">Lv.${state.level} 복구비 참고표 자동 적용 · 복구 할인은 자동 반영 · <a href="./guide.html">출처와 정확도</a></p><details id="recovery-cost-details"><summary>복구 비용표 확인 · 직접 수정</summary><p class="hint">공개 계산기 참고표입니다. 일부 레벨은 출처 간 차이가 있습니다. 수정할 때만 할인 전 메소를 입력하세요. 비우면 표의 값으로 돌아갑니다.</p><div class="field-grid">${recoveryStars.map(star=>`<label class="field"><span>${star}성 복구 · 표 기준 ${money(recoveryTableCost(state.level,star))} 메소</span><input aria-label="${star}성 복구 메소" type="number" data-recovery="${star}" min="0" max="100000000000000" step="1" placeholder="${recoveryTableCost(state.level,star)}" value="${esc(state.recoveryFees?.[star]??'')}"></label>`).join('')}</div></details>`;

}

function compute() {
  readForm();
  try {
      if (!$('calculator').checkValidity()) throw new Error('입력 범위와 필수 항목을 확인해주세요.');
      validate(state);
      try { localStorage.setItem(storageKey, JSON.stringify(state)); } catch { /* Optional storage. */ }
      if (page !== 'potential' && state.target > 0) {
        let optimized;
        if (state.autoSafeguard) {
          optimized = optimizeSafeguard(state);
          state.safeguardStages = optimized.stages;
        }
        document.querySelectorAll('[data-guard]').forEach(b=>b.setAttribute('aria-pressed',String(isSafeguarded(Number(b.dataset.guard),state))));
        const stages=[15,16,17].filter(n=>isSafeguarded(n,state));
        $('safeguard').checked=stages.length===3;
        $('guard-result').textContent = `${state.autoSafeguard?'자동 선택':'수동 선택'}: ${stages.length?stages.map(n=>`${n}성`).join(' · '):'방지 안 함'}${optimized?` · ${optimized.candidates.length}개 조합 비교${optimized.fixed.length?' (직접 입력 비용 단계 고정)':''}`:''}`;
        document.querySelectorAll('[data-cost]').forEach(el=>el.placeholder=attemptCost(Number(el.dataset.cost),{...state,costOverrides:{}}));
      }
      if ($('guard-result') && state.target === 0) $('guard-result').textContent = '스타포스 선택 없음 · 비용 제외';
      try { localStorage.setItem(storageKey, JSON.stringify(state)); } catch { /* Optional storage. */ }
      result = calculate(state, data, page);
    $('form-error').hidden = true;
    try { localStorage.setItem(storageKey, JSON.stringify(state)); } catch { /* Optional storage. */ }
    renderResult();
    if ($('recovery-result')) {
      const policy=result.starforce?.recoveryStages;
      $('recovery-result').textContent=!result.starforce ? '스타포스 선택 없음 · 복구 비용 제외' : policy ? '자동 복구: '+Object.entries(policy).map(([star,mode])=>`${star}성 파괴 → ${mode==='reset'?'12성':Math.min(Number(star),22)+'성 유지'}`).join(' / ') : state.recovery==='reset'?'모든 파괴에 12성 복구 적용':'모든 파괴에 성수 유지 복구 적용 (최대 22성)';
    }
    if (page !== 'potential') $('stage-rows').innerHTML = stageBreakdown(state).map(row=>`<tr><td>${row.star}성 → ${row.star+1}성</td><td>${money(row.cost)}</td><td>${money(row.cumulative)}</td><td>${number(row.destroys)}회</td><td>${number(row.attempts)}회</td></tr>`).join('') || '<tr><td colspan="5">스타포스 선택 없음 · 강화·복구 비용 제외</td></tr>';
  } catch (error) {
    if ($('recovery-result')) $('recovery-result').textContent=state.recovery==='auto'?'자동 복구 비교 대기 · 입력 조건을 확인해 주세요.':'';
    if ($('guard-result')) $('guard-result').textContent=state.autoSafeguard?'자동 선택 대기 · 입력 조건을 확인해 주세요.':'수동 선택';
    result = null;
    $('form-error').hidden = false;
    $('form-error').textContent = error.message;
    $('stage-rows').innerHTML = '';
    $('result').innerHTML = `<section class="result-card empty"><span class="eyebrow">EXPECTED COST</span><h2>조건을 확인해주세요</h2><p>${esc(error.message)}</p></section>`;
  }
}
function renderResult() {
  const r = result;
  const shownPotential=r.potential ?? r.additional;
  const detailsOpen = document.querySelector('#calculation-details')?.open;
    const selected = ITEMS.find(i => i.id === state.item);
    const item = selected ? `${selected.name}${selected.parts ? ` · ${PARTS[state.part]}` : ''}` : `Lv.${state.level} ${PARTS[state.part]}`;
  const pieces = [ ['잠재 등업', r.potential?.upgrade?.cost || 0, 'blue'], ['잠재 옵션 재설정', r.potential?.optionCost || 0, 'purple'], ['스타포스 강화', r.starforce?.enhancement || 0, 'green'],
    ['파괴 복구 · 스페어', r.starforce?.recovery || 0, 'gold'], ['최초 장비 구매', r.purchase, 'gray'] ];
  if (r.additional) pieces.splice(2,0,['에디셔널 등업',r.additional.upgrade.cost,'teal'],['에디셔널 옵션 재설정',r.additional.optionCost,'pink']);
  const active = pieces.filter(([,value]) => value > 0);
  $('result').innerHTML = `<section class="result-card"><div class="result-top"><span class="eyebrow">YOUR UPGRADE PLAN</span><span class="result-badge">${r.starforce?.estimated ? '추정 비용 포함' : shownPotential ? '잠재 근사값' : '입력 비용 기준'}</span></div>
    <h2>${esc(item)}</h2><div class="goal-tags">${r.potential ? `<span>${r.potential.anyMainStat?'주스탯 중 하나':state.stat} ${state.threshold}${targetUnit()} 이상</span>` : '<span>잠재 선택 없음 · 비용 제외</span>'}${r.additional ? `<span>에디셔널 ${esc(state.additionalStat)} ${state.additionalThreshold}${additionalUnit()} 이상</span>` : ''}${r.starforce ? `<span>★ ${state.target}성</span>` : ''}</div>
    <div class="total-label">예상 비용 <span>${r.starforce ? `${state.start}★ → ${state.target}★` : shownPotential ? '목표 잠재능력 달성까지' : '장비 구매비만 포함'}</span></div><div class="total">${money(r.total)} <small>메소</small></div><p class="raw-total">${number(r.total,0)} 메소 · 최초 장비 및 스페어 구매비 포함</p>
    <div class="headline-metrics"><div><span>${r.starforce?'평균 파괴':'목표 달성 확률'}</span><strong>${r.starforce?`${number(r.starforce.destroys)}회`:`${number((shownPotential?.probability ?? 0)*100,4)}%`}</strong></div><div><span>${r.starforce?'평균 강화 시도':'평균 재설정'}</span><strong>${number(r.starforce?.attempts ?? shownPotential?.attempts ?? 0)}회</strong></div><div><span>장비 1개 가격</span><strong>${number(state.purchase)}억 <small>메소</small></strong></div></div>
    <div class="cost-bar" aria-hidden="true">${active.map(([,value,color])=>`<span class="${color}" style="width:${value / r.total * 100}%"></span>`).join('')}</div>
    <dl class="breakdown">${pieces.map(([name,value,color])=>`<div><dt><i class="${color}"></i>${name}</dt><dd>${money(value)} <small>메소</small></dd></div>`).join('')}</dl>
    <p class="result-state" id="result-state">현재 조건으로 계산 완료</p><button class="copy-button" type="button" id="copy">계산 결과 복사 <span>↗</span></button></section>
<details id="calculation-details" class="calculation-details" ${detailsOpen ? 'open' : ''}><summary>상세 계산 내역 <span>등업 · 잠재 · 에디셔널 · 강화</span></summary>
${additionalDetail(r.additional)}
          ${r.potential?.upgrade?.rows.length ? `<section class="card detail-card" id="upgrade-detail"><h3>${gradeLabels[state.potentialGrade]} → 레전드리 등업</h3><p class="hint">${state.miracle?'미라클타임 · 등업 확률 2배':'일반 등업 확률'} · 누적 실패 0회부터</p><dl class="metrics">${r.potential.upgrade.rows.map(row=>`<div><dt>${row.name}<small> · ${number(row.probability*100,2)}%</small></dt><dd>${money(row.cost)} 메소</dd></div><div><dt>평균 ${number(row.attempts)}회 · 최대 ${row.maxAttempts}회</dt><dd>1회 ${money(row.unitCost)} 메소</dd></div>`).join('')}<div><dt>등업 기대 비용 합계</dt><dd id="upgrade-cost">${money(r.potential.upgrade.cost)} 메소</dd></div></dl><p class="hint">미라클은 등업 확률에만 적용합니다. 천장 횟수와 옵션 확률은 동일합니다.</p></section>` : ''}
${r.potential ? `<section class="card detail-card"><h3><span class="purple-text">◇</span> 레전드리 옵션 재설정</h3><dl class="metrics"><div><dt>레전드리 옵션 1회 달성 확률</dt><dd>${number((r.potential?.probability ?? 0)*100,4)}%</dd></div><div><dt>평균 재설정 횟수</dt><dd>${number(r.potential.attempts)}회</dd></div><div><dt>1회 재설정 비용</dt><dd>${money(r.potential.unitCost)} 메소</dd></div><div><dt>등업 후 50% 달성까지</dt><dd>${number(r.potential.median)}회</dd></div><div><dt>등업 후 90% 달성까지</dt><dd>${number(r.potential.p90)}회</dd></div></dl><p class="hint">${r.potential.upgrade.rows.length ? '등업 시 생성되는 첫 레전드리 옵션 포함' : '현재 옵션은 목표 미달로 가정 · 첫 재설정부터 비용 포함'} · 올스탯 ${state.allStat ? '포함' : '제외'}<br>동일 옵션 재등장 제외를 생략한 근사값입니다.</p></section>` : ''}
    ${r.starforce ? `<section class="card detail-card"><h3><span class="gold-text">☆</span> 스타포스 자세히</h3><dl class="metrics"><div><dt>강화 구간</dt><dd>${state.start} → ${state.target}성</dd></div><div><dt>평균 강화 횟수</dt><dd>${number(r.starforce.attempts)}회</dd></div><div><dt>평균 파괴 횟수</dt><dd>${number(r.starforce.destroys)}회</dd></div><div><dt>평균 스페어 사용량</dt><dd>${number(r.starforce.spares)}개</dd></div></dl></section>` : ''}
    <div class="result-note"><strong>계산 전에 알아두세요</strong><p>성수 유지 복구비는 공개 계산기 참고표를 사용합니다. 일부 레벨은 출처 간 차이가 있으며, 인게임 값으로 수정할 수 있습니다.</p><p>${r.starforce?.estimated ? '스타포스 비용은 추정 산식입니다. 정확한 인게임 비용을 직접 입력할 수 있습니다. ' : ''}${r.potential ? '선택한 시작 등급부터 계산, 에디셔널은 선택 시 합산. ' : ''}파괴 흔적으로 잠재능력을 복구하므로 잠재 비용을 중복 합산하지 않습니다.</p><a href="./guide.html">계산 기준과 출처 보기 →</a></div></details>`;
  $('copy').addEventListener('click', async () => {
    if (!result) { toast('조건을 계산한 뒤 복사해주세요.'); return; }
    const summary = `${item} / ${r.additional ? `에디셔널 ${state.additionalStat} ${state.additionalThreshold}${additionalUnit()} / ${gradeLabels[state.additionalGrade]} 시작 / 에디 미라클 ${state.miracle} / ` : ''}${r.potential ? `${r.potential.anyMainStat?'주스탯 중 하나':state.stat} ${state.threshold}${targetUnit()} 이상 / ` : ''}${r.starforce ? `${state.start}→${state.target}성 / ` : ''}평균 ${number(r.total,0)} 메소\n스페어 1개 ${state.spare}억 · 시작 장비 ${state.purchase}억\n${state.discount?'30% 할인':'할인 없음'} · 파괴 방지 ${[15,16,17].filter(n=>isSafeguarded(n,state)).join(',')||'없음'} · MVP ${state.mvp*100}% · PC방 ${state.pcBang?'적용':'미적용'} · ${state.recovery==='auto'?'복구 자동 최적화':state.recovery==='reset'?'12성 복구':'별 유지 복구'}\n파괴 감소 ${state.destroyDiscount?'30%':'없음'} · 5/10/15 확정 ${state.guarantee?'적용':'미적용'} · 복구 할인 ${state.recoveryDiscount?'20%':'없음'}\n${gradeLabels[state.potentialGrade]} 시작 · 미라클 ${state.miracle?'적용':'미적용'} · 잠재 근사값 · ${r.starforce?.estimated?'스타포스 추정 산식':'입력 비용 기준'} · 기준 2026-09-12`;
    try { await navigator.clipboard.writeText(summary); toast('계산 결과를 복사했습니다.'); } catch { toast('브라우저에서 복사를 허용해주세요.'); }
  });
}
function toast(text) { $('toast').textContent = text; $('toast').classList.add('visible'); setTimeout(() => $('toast').classList.remove('visible'), 2500); }

function guide() {
  $('content').innerHTML = `<div class="guide-grid"><article class="card prose"><span class="eyebrow">CALCULATION NOTES</span><h2>지원 범위</h2><p>한국 메이플스토리 PC 일반 월드의 일반 장비를 대상으로 합니다. 140·145·150·160·200·250레벨의 26개 장비·방어구 묶음과 최대 27성을 제공합니다. 아케인·에테르넬은 선택한 부위 1개의 비용입니다. 잠재 확률표는 16개 부위의 92개 표이며, 250레벨 보조무기·벨트·귀고리·기계심장 조합은 표가 없어 계산하지 않습니다. 아스트라·데스티니는 특수 강화 규칙 검증 전이므로 잠재 계산만 제공합니다. 슈페리얼, 놀장, 제로 무기, 특수 장비는 대상이 아닙니다.</p><h3>잠재능력</h3><p>선택한 시작 등급(레어·에픽·유니크·레전드리)에서 목표 옵션을 만드는 비용입니다. 기본 시작 등급은 에픽입니다. 레전드리 시작 시 등업 비용은 없으며 현재 옵션은 목표 미달로 가정하고 첫 재설정부터 비용을 계산합니다. 등급별 천장 누적은 0회부터 시작합니다. 공용 장신구·기계심장은 STR·DEX·INT·LUK 중 하나라도 목표 이상인 세 줄 조합을 성공으로 계산합니다. 아케인·에테르넬 방어구와 직업별 무기는 선택한 스탯 하나를 목표로 합니다. 공격력%·마력%는 선택한 옵션만 계산합니다. 서로 다른 주스탯은 더하지 않고 여러 조건을 만족하는 결과도 한 번만 셉니다. 올스탯%는 주스탯 합계에 항상 포함합니다. 제한 옵션의 중복 제한과 남은 확률의 재정규화를 반영합니다.</p><p>레어→에픽 확률은 15%(미라클 30%), 연속 실패 10회 후 다음 시도 확정이며 비용은 레전드리 재설정 비용의 10%입니다. 에픽→유니크 확률은 3.5%, 유니크→레전드리는 1.4%이며 미라클은 각각 7%, 2.8%입니다. 연속 실패 42회·107회 후 다음 시도의 확정 등업을 반영합니다. 등업을 거치는 경우 첫 레전드리 옵션이 생성되므로 이후 추가 재설정 기대 횟수는 1 ÷ 목표 확률 − 1입니다. 레전드리 시작 시에는 1 ÷ 목표 확률입니다. 옵션 확률은 등업 시에도 동일하다고 가정합니다. 50%·90% 횟수는 등업 후 추가 옵션 재설정만의 값이며 전체 등업 포함 횟수가 아닙니다. 표기 확률의 반올림과 직전 세 줄과 완전히 같은 결과를 제외하는 규칙 때문에 <strong>잠재능력은 근사값</strong>으로 표시합니다. 등업과 천장, 선택한 미라클타임을 반영합니다. 큐브 아이템 비용은 제외합니다.</p><h3>에디셔널 잠재능력</h3><p>공식 에디셔널 확률표와 2024.06.20 메소 재설정 비용을 적용합니다. 선택한 시작 등급에서 레전드리 목표까지 계산하며, 미라클은 일반 잠재와 에디셔널에 함께 적용됩니다. 주스탯은 올스탯%를 포함하며 고정 수치와 9레벨당 스탯은 환산하지 않습니다. 일반 잠재와 에디셔널이 모두 주스탯이면 일반 잠재를 먼저 맞춘 뒤 같은 스탯의 에디셔널을 맞추는 순서입니다. 재설정 순서까지 최적화한 값은 아닙니다.</p><h3>스타포스</h3><p>실패 유지·성공·파괴 후 복구를 상태 전이 방정식으로 풀어 평균 비용과 파괴 횟수를 계산합니다. 2025년 확률표에 2026년 스타캐치 상시 보정을 적용합니다. 성공 확률을 1.05배로 하고 남은 실패 확률을 유지와 파괴에 비례 배분합니다.</p><p>12성 복구는 파괴마다 동일 장비 한 개가 필요합니다. 별 유지 복구는 18성 이하 한 개, 19~20성 두 개, 21성 세 개, 22성 이상 네 개와 직접 입력한 복구 메소를 사용합니다. 23성 이상에서 파괴되면 별 유지 복구도 22성으로 돌아갑니다. 12성부터 재강화하는 구간도 계산에 포함됩니다.</p><h3>복구 비용표</h3><p>성수 유지 복구 메소는 SF 계산기의 공개 표를 사용합니다. 140·145·150·160·200·250레벨, 15~22성 값을 자동 적용합니다. 23성 이상에서 파괴되면 22성 복구비를 사용합니다. 200레벨 표는 BOOMBACK과 전부 일치하지만 다른 일부 레벨은 출처 간 차이가 있습니다. 넥슨이 공개한 공식 비용표나 직접 인게임 검증값은 아니므로 참고 비용입니다. 복구 20% 할인은 메소에만 적용하고 스페어 비용은 할인하지 않습니다.</p><h3>비용의 정확도</h3><p><strong>스타포스 기본 강화비는 추정 산식이며 넥슨이 공개한 공식 비용표가 아닙니다.</strong> 실제 비용 검증 전의 계획용 값입니다. 단계별 비용 입력란에 인게임 최종 비용을 입력하면 추정값 대신 사용합니다. 직접 입력한 값에는 할인·파괴 방지를 다시 적용하지 않습니다.</p><p>MVP 실버 3%·골드 5%·다이아 이상 10%와 PC방 5% 할인은 0→1성부터 16→17성까지 합산합니다. 30% 이벤트 할인은 곱연산하며 파괴 방지 추가 비용은 할인하지 않습니다. 5·10·15성 확정 성공 이벤트에서는 파괴 방지 비용이 발생하지 않습니다. 샤이닝 프리셋은 강화 비용 30%·파괴 확률 30%·별 유지 복구 메소 20% 할인을 선택합니다. 복구 메소는 할인 전 값을 입력하고 스페어 가격은 할인하지 않습니다. 이벤트 여부는 사용자가 선택하며 현재 진행 중인 이벤트를 자동 감지하지 않습니다.</p><h3>화면 구성 참고</h3><p><a href="https://www.boomback.com/ev" target="_blank" rel="noopener noreferrer">BOOMBACK 기대값 계산기</a>의 렙제별 장비 선택, 별 구간 조절, 큰 요약 결과와 단계별 표 흐름을 참고했습니다. 장비 아이콘은 넥슨 게임 이미지이며 BOOMBACK 공개 스프라이트에서 가져왔습니다. 자체 계산 엔진을 사용하며 참고 사이트와의 수치 일치는 검증하지 않았습니다. 15·16·17성 파괴 방지 조합을 비교해 입력 조건에서 기대 비용이 가장 낮은 조합을 자동 선택합니다. 강화비를 직접 입력한 단계는 해당 비용에 포함된 방지 설정을 유지하고, 나머지 단계만 비교합니다. 자동 복구는 각 파괴 단계마다 12성 복구와 성수 유지 복구의 향후 재강화 비용까지 비교합니다. 복구비는 공개 계산기의 레벨·성수별 참고표를 자동 적용합니다. 직접 입력한 값이 있으면 우선 사용하며, 비우면 참고표로 돌아갑니다. 표가 없는 레벨은 보간하지 않고 계산을 중단합니다. 최대 목표는 27성입니다.</p><h3>총 비용과 저장</h3><p>잠재능력 + 에디셔널 + 스타포스 강화 + 파괴 복구 + 최초 장비 구매비를 합산합니다. 입력한 장비 1개 가격을 최초 구매와 스페어에 공통 적용합니다. 0을 입력하면 장비 구매비를 제외합니다. 주문서·추가옵션·거래 수수료는 제외됩니다.</p><p>계산 조건은 이 브라우저에만 저장되며 브라우저 데이터를 삭제하면 사라집니다. 실시간 시세 조회, 회원 계정, 광고는 현재 연결되어 있지 않습니다.</p></article>
    <aside class="card source-card"><span class="eyebrow">SOURCES</span><h2>데이터 출처</h2><p class="hint">자료 확인일 · 2026.09.12</p>
    <a href="https://maplestory.nexon.com/Guide/OtherProbability/cube/black" target="_blank" rel="noopener noreferrer"><strong>넥슨 잠재능력 확률표 ↗</strong><small>블랙 큐브 / 메소 재설정 · 부위별 표</small></a>
    <a href="https://maplestory.nexon.com/news/update/737" target="_blank" rel="noopener noreferrer"><strong>잠재능력 재설정 비용 ↗</strong><small>2024.01.25 도입 공지의 레벨별 비용</small></a>
    <a href="https://maplestory.nexon.com/news/update/767" target="_blank" rel="noopener noreferrer"><strong>스타포스 개편 확률표 ↗</strong><small>15성 이상 유지·파괴 확률, 방지 비용</small></a>
    <a href="https://maplestory.nexon.com/news/update/799" target="_blank" rel="noopener noreferrer"><strong>2026년 강화 개편 ↗</strong><small>스타캐치 상시 적용 · 흔적 복구</small></a>
    <a href="https://maplestory.nexon.com/Guide/N23GameInformation/Articles/412" target="_blank" rel="noopener noreferrer"><strong>현재 스타포스 공식 가이드 ↗</strong><small>레벨별 한도 · 파괴 복구 규칙</small></a>
    <a href="https://www.jhnsoft.co.kr/maple-starforce-calculator/" target="_blank" rel="noopener noreferrer"><strong>강화 비용 산식 참고 ↗</strong><small>비공식 계산기 산식 참고 · 비용 검증 필요</small></a>
    <a href="https://maplestory.nexon.com/Guide/N23GameInformation/Articles/425" target="_blank" rel="noopener noreferrer"><strong>MVP 할인 안내 ↗</strong><small>실버·골드·다이아 이상 할인율</small></a><a href="https://maplestory.nexon.com/Guide/N23GameInformation/Articles/444" target="_blank" rel="noopener noreferrer"><strong>PC방 혜택 ↗</strong><small>스타포스 5% 추가 할인</small></a><a href="./data/potential.json"><strong>사용 중인 확률 데이터 ↗</strong><small>넥슨 공개 표를 저장한 JSON</small></a><a href="https://sf.sfcalc.workers.dev/" target="_blank" rel="noopener noreferrer"><strong>복구 메소 참고표 ↗</strong><small>SF 계산기 · 6개 지원 레벨별 표 · BOOMBACK 대조</small></a><a href="./js/recovery-costs.js"><strong>적용 중인 복구 비용표 ↗</strong><small>할인 전 메소 · 2026.09.12 확인</small></a><a href="https://maplestory.nexon.com/News/Event/1086" target="_blank" rel="noopener noreferrer"><strong>미라클타임 공식 안내 ↗</strong><small>등업 확률 2배 · 일반/미라클 확률 비교</small></a></aside></div>`;
}

shell();
if (page === 'guide') guide();
else {
  try {
    const response = await fetch('./data/potential.json');
    if (!response.ok) throw new Error('확률 데이터 파일을 읽을 수 없습니다.');
    data = await response.json();
    const additionalResponse=await fetch('./data/additional.json');
    if (!additionalResponse.ok) throw new Error('에디셔널 확률 데이터를 읽을 수 없습니다.');
    data.additional=await additionalResponse.json();
    form(); compute();
    mountSimulation(()=>{result=null;compute();return result?structuredClone(state):null;},data,page);
  } catch (error) {
    $('content').innerHTML = `<section class="card error" role="alert">${esc(error.message)} 새로고침하거나 START.cmd로 사이트를 실행해주세요.</section>`;
  }
}
