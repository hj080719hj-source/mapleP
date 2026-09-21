import {ITEMS,LEVELS,PARTS} from './catalog.js';
import {equipmentIcon} from './icons.js';
import {goldExpectation,GRADES,GRADE_NAMES} from './gold-cube-engine.js';
const $=id=>document.getElementById(id), items=ITEMS.filter(item=>item.level<=200);
let selectedItem=items[0],part=selectedItem.part,data;
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
  const stat=$('gold-stat').value,from=GRADES.indexOf($('start-grade').value);
  $('target-grade').disabled=!!stat;
  if(stat) $('target-grade').value='legendary';
  for(const option of $('target-grade').options) option.disabled=GRADES.indexOf(option.value)<from;
  if(GRADES.indexOf($('target-grade').value)<from) $('target-grade').value=GRADES[from];
  try {
    const result=goldExpectation({item:selectedItem.id,part,level:selectedItem.level,start:$('start-grade').value,target:$('target-grade').value,miracle:$('gold-miracle').checked,stat,threshold:Number($('gold-threshold').value),fee:$('gold-fee').value===''?null:$('gold-fee').valueAsNumber},data);
    $('gold-result').innerHTML=`<h2>평균 필요 골드 큐브</h2><p class="gold-total" id="gold-count">${number(result.attempts)}개</p><dl class="metrics"><div><dt>선택 장비</dt><dd>${selectedItem.name}${selectedItem.parts?` · ${PARTS[part]}`:''}</dd></div><div><dt>등업에 필요한 큐브</dt><dd>${number(result.upgrade.attempts)}개</dd></div>${stat?`<div><dt>옵션 재설정 추가 큐브</dt><dd id="gold-option-count">${number(result.optionAttempts)}개</dd></div><div><dt>목표 옵션 등장 확률</dt><dd>${(result.probability*100).toLocaleString('ko-KR',{maximumSignificantDigits:6})}%</dd></div>`:''}<div><dt>골드 큐브 총 사용 비용</dt><dd id="gold-total">${result.cost===null?'1회 사용 비용 확인 필요':money(result.cost)}</dd></div><div><dt>메소 재설정 등업 비용${stat?' · 옵션 제외':''}</dt><dd id="mesos-cost">${money(result.upgrade.mesosCost)}</dd></div></dl><p class="hint">보스 획득 큐브 기준입니다. 비용 미입력 시 무료로 간주하지 않고 개수만 계산합니다.</p>`;
    $('gold-breakdown').innerHTML=result.upgrade.rows.length?`<table><thead><tr><th>등업 구간</th><th>골드 등업 확률</th><th>평균 큐브 수</th><th>메소 재설정 비용</th></tr></thead><tbody>${result.upgrade.rows.map(r=>`<tr><td>${r.name}</td><td>${(r.probability*100).toFixed(4)}%</td><td>${number(r.attempts)}개</td><td>${money(r.mesosCost)}</td></tr>`).join('')}</tbody></table>`:'<p class="hint">시작 등급과 목표 등급이 같아 등업 비용이 없습니다.</p>';
  } catch(error) { $('gold-result').textContent=error.message; $('gold-breakdown').replaceChildren(); }
}
function switchEquipment() {
  $('gold-fee').value=fees.get(`${selectedItem.id}-${part}`)??'';
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
$('gold-fee').addEventListener('input',()=>{fees.set(`${selectedItem.id}-${part}`,$('gold-fee').value);update();});
$('gold-form').addEventListener('submit',event=>event.preventDefault());
syncGoals();update();
try {
  const response=await fetch(new URL('../data/gold-potential.json',import.meta.url));
  if(!response.ok)throw new Error();data=await response.json();syncGoals();update();
} catch { $('gold-option-hint').textContent='옵션 확률표를 불러오지 못했습니다. 새로고침해주세요. 등업 계산은 사용할 수 있습니다.'; }
