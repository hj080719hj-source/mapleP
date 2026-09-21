import {GOLD_ITEMS,PARTS} from './catalog.js?v=michaela';
import {equipmentIcon} from './icons.js?v=michaela';
import {goldExpectation,mitraPresetExpectations,statPresetExpectations,lootPresetExpectations,silverPresetExpectations,hasAttackPercent,GRADES,GRADE_NAMES} from './gold-cube-engine.js?v=silver';
const $=id=>document.getElementById(id), items=GOLD_ITEMS;
const LEVELS=[...new Set(items.map(item=>item.level))].sort((a,b)=>a-b);
let selectedItem=items[0],part=selectedItem.part,data;
let loading=true;
let cube='gold',silverData;
const gradeChoices={gold:'epic',silver:'epic'};
const fees=new Map();
const number=value=>value.toLocaleString('ko-KR',{maximumFractionDigits:2});
const money=value=>`${number(value/1e8)}억 메소`;
$('gold-equipment').innerHTML=LEVELS.filter(level=>level<=200).map(level=>`<div class="equipment-row"><span class="level-label">Lv. ${level}</span><div>${items.filter(item=>item.level===level).map(item=>`<button type="button" data-item="${item.id}" title="${item.name}" aria-label="${item.name}" aria-pressed="${item===selectedItem}">${equipmentIcon(item)}${item.label}</button>`).join('')}</div></div>`).join('');
const options=GRADES.map((grade,i)=>`<option value="${grade}">${GRADE_NAMES[i]}</option>`);
$('start-grade').innerHTML=options.join('');
$('target-grade').innerHTML=options.join('');
$('start-grade').value='epic'; $('target-grade').value='legendary';
function syncGoals() {
  const old=$('gold-stat').value, lines=data?.tables?.[`${part}-${selectedItem.level}`];
  $('gold-stat').disabled=!lines;
  if(!lines) {
    $('gold-stat').innerHTML=`<option value="">${loading?'옵션 확률 불러오는 중…':'옵션 확률을 불러오지 못했습니다'}</option>`;
    $('gold-threshold').innerHTML='<option value="">목표 옵션을 먼저 선택해주세요</option>';
    $('gold-threshold').disabled=true;
    $('gold-option-hint').textContent=loading?'잠시만 기다려주세요. 확률표를 불러오면 옵션을 선택할 수 있습니다.':'확률표 다시 불러오기를 눌러주세요.';
    return;
  }
  const available=['','주스탯','올스탯','공격력','마력','쿨타임 감소','크리티컬 데미지'].filter(stat=>!stat||lines?.some(line=>line.some(o=>o.name.startsWith(stat==='주스탯'?'STR +':stat==='쿨타임 감소'?'스킬 재사용 대기시간 -':`${stat} +`))));
  $('gold-stat').innerHTML=available.map(stat=>`<option value="${stat}">${stat||'선택 없음 · 등업만'}</option>`).join('');
  $('gold-stat').value=available.includes(old)?old:'';
  syncThreshold();
  $('gold-parts').innerHTML=(selectedItem.parts||[]).map(p=>`<button type="button" data-part="${p}" aria-pressed="${p===part}">${PARTS[p]}</button>`).join('');
}
function syncThreshold() {
  const stat=$('gold-stat').value, previous=Number($('gold-threshold').value);
  const values=stat==='쿨타임 감소'?[1,2,3,4,5,6]:stat==='크리티컬 데미지'?[8,16,24]:stat==='올스탯'?[21,24,27]:[27,30,33,36];
  $('gold-threshold').innerHTML=values.map(n=>`<option value="${n}">${n}${stat==='쿨타임 감소'?'초':'%'} 이상</option>`).join('');
  $('gold-threshold').value=String(values.includes(previous)?previous:values[0]);
  $('gold-threshold').disabled=!stat;
  $('gold-option-hint').textContent=!stat?'목표 옵션을 선택하면 레전드리 옵션 달성까지 계산합니다.':stat==='주스탯'?(selectedItem.shared?'공용 장비: STR·DEX·INT·LUK 중 한 스탯이 목표에 도달하면 성공. 올스탯% 포함.':'직업 전용 장비: 한 주스탯을 저격합니다. 올스탯% 포함.'):'선택한 옵션의 세 줄 합계를 계산합니다.';
}
function update() {
  $('cube-limit').textContent=cube==='silver'?'실버 큐브 · 유니크까지':'골드 큐브 · 레전드리까지';
  $('silver-help').hidden=cube!=='silver';$('gold-help').hidden=cube==='silver';
  $('start-grade').querySelector('[value="legendary"]').disabled=cube==='silver';
  $('gold-retry').hidden=loading||!!(cube==='silver'?silverData:data);
  if(cube==='silver') {
    $('gold-custom-goal').hidden=true;$('mitra-presets-note').hidden=true;$('mitra-combination').hidden=true;
    if($('start-grade').value==='legendary')$('start-grade').value='unique';
    $('target-grade').value='unique';$('target-grade').disabled=true;
    if(!silverData){$('gold-result').textContent=loading?'실버 큐브 확률 불러오는 중…':'실버 큐브 확률표를 다시 불러와주세요.';$('gold-breakdown').replaceChildren();return;}
    try {
      const result=silverPresetExpectations({item:selectedItem.id,part,level:selectedItem.level,loot:selectedItem.loot,start:$('start-grade').value,miracle:$('gold-miracle').checked,fee:$('gold-fee').value===''?null:$('gold-fee').valueAsNumber},silverData);
      $('gold-result').innerHTML=`<h2>실버 큐브 · ${selectedItem.name}</h2><p class="hint">유니크까지 등업에 필요한 평균 큐브</p><strong class="gold-total" id="silver-upgrade-count">${number(result.upgrade.attempts)}개</strong><p class="hint">등업 사용 비용: ${result.cost===null?'1회 사용 비용 확인 필요':money(result.cost)}</p>${selectedItem.loot?'<p class="notice">드롭률·메소 획득량은 레전드리 옵션입니다. 유니크까지 실버로 등업한 뒤 골드 큐브로 전환해주세요.</p>':`<p class="hint">유니크 옵션별 기대값 · 등업 포함. ${selectedItem.shared?'주스탯은 네 스탯 중 하나가 목표에 도달하면 성공.':'한 주스탯 또는 공격력·마력 각각의 기준.'} 주스탯에 올스탯% 포함.</p><div id="silver-preset-results">${result.rows.map(row=>`<section class="mitra-preset"><h3>${row.label}</h3><strong class="gold-total">${number(row.attempts)}개</strong><p class="hint">등업 ${number(result.upgrade.attempts)}개 + 옵션 추가 ${number(row.optionAttempts)}개</p><p class="hint">사용 비용: ${row.cost===null?'1회 사용 비용 확인 필요':money(row.cost)}</p></section>`).join('')}</div>`}`;
      $('gold-breakdown').innerHTML=result.upgrade.rows.length?`<dl class="metrics">${result.upgrade.rows.map(row=>`<div><dt>${row.name} · ${(row.probability*100).toFixed(4)}%</dt><dd>${number(row.attempts)}개</dd></div>`).join('')}</dl>`:'<p class="hint">이미 유니크이므로 등업 비용이 없습니다.</p>';
    }catch(error){$('gold-result').textContent=error.message;$('gold-breakdown').replaceChildren();}
    return;
  }
  const lines=data?.tables?.[`${part}-${selectedItem.level}`];
  const statFixed=!!lines && !hasAttackPercent(lines);
  const fixed=selectedItem.id==='mitra';
  $('gold-custom-goal').hidden=fixed||statFixed;
  $('mitra-presets-note').hidden=!fixed;
  if(statFixed) {
    $('mitra-combination').hidden=true;
    $('target-grade').value='legendary';$('target-grade').disabled=true;
    try {
      const rows=(selectedItem.loot?lootPresetExpectations:statPresetExpectations)({item:selectedItem.id,part,level:selectedItem.level,start:$('start-grade').value,miracle:$('gold-miracle').checked,fee:$('gold-fee').value===''?null:$('gold-fee').valueAsNumber},data);
      $('gold-result').innerHTML=`<h2>${selectedItem.name}${selectedItem.parts?` · ${PARTS[part]}`:''}</h2><p class="hint">${selectedItem.loot?'드롭률·드메 조합별 기대값입니다. 드메는 드롭률과 메소 획득량을 동시에 만족해야 합니다.':selectedItem.shared?'공용 장비: STR·DEX·INT·LUK 중 한 스탯이 목표에 도달하면 성공. 올스탯% 포함.':'직업 전용 장비: 한 주스탯을 저격하는 기준. 올스탯% 포함.'}</p><div id="stat-preset-results">${rows.map(row=>`<section class="mitra-preset" data-stat="${row.stat}"><h3>${row.label}</h3><strong class="gold-total">${number(row.result.attempts)}개</strong><p class="hint">등업 ${number(row.result.upgrade.attempts)}개 + 옵션 추가 ${number(row.result.optionAttempts)}개</p><p class="hint">사용 비용: ${row.result.cost===null?'1회 사용 비용 확인 필요':money(row.result.cost)}</p></section>`).join('')}</div>`;
      const upgrade=rows[0].result.upgrade;
      $('gold-breakdown').innerHTML=upgrade.rows.length?`<dl class="metrics">${upgrade.rows.map(row=>`<div><dt>${row.name}</dt><dd>${number(row.attempts)}개</dd></div>`).join('')}</dl>`:'<p class="hint">이미 레전드리이므로 옵션 재설정만 계산합니다.</p>';
    }catch(error){$('gold-result').textContent=error.message;$('gold-breakdown').replaceChildren();}
    return;
  }
  if(fixed) {
    $('mitra-combination').hidden=true;
    $('target-grade').value='legendary';$('target-grade').disabled=true;
    if(!data){$('gold-result').textContent=loading?'옵션 확률 불러오는 중…':'확률표를 다시 불러와주세요.';$('gold-breakdown').replaceChildren();return;}
    try {
      const rows=mitraPresetExpectations({start:$('start-grade').value,miracle:$('gold-miracle').checked,fee:$('gold-fee').value===''?null:$('gold-fee').valueAsNumber},data);
      const counts=(a,b)=>Math.abs(a-b)<1e-7?`${number(a)}개`:`공 ${number(a)}개 / 마 ${number(b)}개`;
      $('gold-result').innerHTML=`<h2>미트라의 분노 · 유효 옵션별 기대값</h2><p class="hint">각 조합을 개별 목표로 계산합니다. 공/마는 공격력형 또는 마력형 각각의 기준이며 섞어 세지 않습니다.</p><div id="mitra-preset-results">${rows.map(row=>`<section class="mitra-preset"><h3>${row.label}</h3><strong class="gold-total">${counts(row.attack.attempts,row.magic.attempts)}</strong><p class="hint">등업 ${number(row.attack.upgrade.attempts)}개 + 옵션 추가 ${counts(row.attack.optionAttempts,row.magic.optionAttempts)}</p><p class="hint">사용 비용: ${row.attack.cost===null?'1회 사용 비용 확인 필요':Math.abs(row.attack.cost-row.magic.cost)<1e-7?money(row.attack.cost):`공 ${money(row.attack.cost)} / 마 ${money(row.magic.cost)}`}</p></section>`).join('')}</div><p class="hint">표시한 공마 합계 % 이상을 성공으로 인정합니다. 방무 조합은 공마 2줄 + 방무 1줄만 계산하며 방무 수치는 무관합니다.</p>`;
      const upgrade=rows[0].attack.upgrade;
      $('gold-breakdown').innerHTML=upgrade.rows.length?`<dl class="metrics">${upgrade.rows.map(row=>`<div><dt>${row.name}</dt><dd>${number(row.attempts)}개</dd></div>`).join('')}</dl>`:'<p class="hint">이미 레전드리이므로 옵션 재설정만 계산합니다.</p>';
    }catch(error){$('gold-result').textContent=error.message;$('gold-breakdown').replaceChildren();}
    return;
  }
  const stat=$('gold-stat').value,from=GRADES.indexOf($('start-grade').value);
  const mitra=selectedItem.id==='mitra'&&['공격력','마력'].includes(stat);
  const allowIed=mitra&&$('mitra-ied').checked;
  $('mitra-combination').hidden=!mitra;
  $('mitra-two-field').hidden=!allowIed;
  $('mitra-two-threshold').disabled=!allowIed;
  const combination=allowIed?`${stat} 3줄 합계 ${$('gold-threshold').value}% 이상 또는 ${stat} 2줄 합계 ${$('mitra-two-threshold').value}% 이상 + 방무 1줄` : '';
  $('mitra-combination-hint').textContent=allowIed?`${combination}. 방무 수치는 무관하며 공격력과 마력은 섞어 세지 않습니다.`:'체크하면 공마 2줄 + 방무 1줄도 성공으로 인정합니다.';
  $('target-grade').disabled=!!stat;
  if(stat) $('target-grade').value='legendary';
  for(const option of $('target-grade').options) option.disabled=GRADES.indexOf(option.value)<from;
  if(GRADES.indexOf($('target-grade').value)<from) $('target-grade').value=GRADES[from];
  try {
    const result=goldExpectation({item:selectedItem.id,part,level:selectedItem.level,start:$('start-grade').value,target:$('target-grade').value,miracle:$('gold-miracle').checked,stat,threshold:Number($('gold-threshold').value),allowIed,twoLineThreshold:Number($('mitra-two-threshold').value),fee:$('gold-fee').value===''?null:$('gold-fee').valueAsNumber},data);
    $('gold-result').innerHTML=`<h2>평균 필요 골드 큐브</h2><p class="gold-total" id="gold-count">${number(result.attempts)}개</p><dl class="metrics"><div><dt>선택 장비</dt><dd>${selectedItem.name}${selectedItem.parts?` · ${PARTS[part]}`:''}</dd></div><div><dt>등업에 필요한 큐브</dt><dd>${number(result.upgrade.attempts)}개</dd></div>${stat?`<div><dt>옵션 재설정 추가 큐브</dt><dd id="gold-option-count">${number(result.optionAttempts)}개</dd></div><div><dt>목표 옵션 등장 확률</dt><dd>${(result.probability*100).toLocaleString('ko-KR',{maximumSignificantDigits:6})}%</dd></div>`:''}<div><dt>골드 큐브 총 사용 비용</dt><dd id="gold-total">${result.cost===null?'1회 사용 비용 확인 필요':money(result.cost)}</dd></div><div><dt>메소 재설정 등업 비용${stat?' · 옵션 제외':''}</dt><dd id="mesos-cost">${money(result.upgrade.mesosCost)}</dd></div></dl><p class="hint">보스 획득 큐브 기준입니다. 비용 미입력 시 무료로 간주하지 않고 개수만 계산합니다.</p>`;
    $('gold-breakdown').innerHTML=result.upgrade.rows.length?`<table><thead><tr><th>등업 구간</th><th>골드 등업 확률</th><th>평균 큐브 수</th><th>메소 재설정 비용</th></tr></thead><tbody>${result.upgrade.rows.map(r=>`<tr><td>${r.name}</td><td>${(r.probability*100).toFixed(4)}%</td><td>${number(r.attempts)}개</td><td>${money(r.mesosCost)}</td></tr>`).join('')}</tbody></table>`:'<p class="hint">시작 등급과 목표 등급이 같아 등업 비용이 없습니다.</p>';
  } catch(error) { $('gold-result').textContent=error.message; $('gold-breakdown').replaceChildren(); }
}
function switchEquipment() {
  $('gold-fee').value=fees.get(`${cube}-${selectedItem.id}-${part}`)??'';
  syncGoals();update();
}
$('gold-equipment').addEventListener('click',event=>{
  const button=event.target.closest('button[data-item]');if(!button)return;
  selectedItem=items.find(item=>item.id===button.dataset.item);part=selectedItem.part;
  for(const b of $('gold-equipment').querySelectorAll('button'))b.setAttribute('aria-pressed',String(b===button));
  switchEquipment();
});
$('gold-parts').addEventListener('click',event=>{const button=event.target.closest('button[data-part]');if(button){part=Number(button.dataset.part);switchEquipment();}});
$('gold-form').addEventListener('change',event=>{if(event.target.id==='gold-stat')syncThreshold();update();});
$('gold-fee').addEventListener('input',()=>{fees.set(`${cube}-${selectedItem.id}-${part}`,$('gold-fee').value);update();});
$('cube-type').addEventListener('click',event=>{
  const button=event.target.closest('button[data-cube]');if(!button||button.dataset.cube===cube)return;
  gradeChoices[cube]=$('start-grade').value;cube=button.dataset.cube;
  $('start-grade').value=gradeChoices[cube];
  for(const b of $('cube-type').querySelectorAll('button'))b.setAttribute('aria-pressed',String(b===button));
  switchEquipment();
});
$('gold-form').addEventListener('submit',event=>event.preventDefault());
async function loadData() {
  loading=true;$('gold-retry').hidden=true;syncGoals();update();
  const results=await Promise.allSettled(['gold','silver'].map(async kind=>{
    const response=await fetch(new URL(`../data/${kind}-potential.json?v=silver`,import.meta.url),{cache:'no-cache'});
    if(!response.ok)throw new Error();
    const next=await response.json();
    for(const item of items)for(const p of item.parts||[item.part])if(next.tables?.[`${p}-${item.level}`]?.length!==3)throw new Error();
    return next;
  }));
  data=results[0].status==='fulfilled'?results[0].value:undefined;
  silverData=results[1].status==='fulfilled'?results[1].value:undefined;
  loading=false;syncGoals();update();
}
$('gold-retry').addEventListener('click',loadData);
await loadData();
