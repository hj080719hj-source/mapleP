import {ITEMS,LEVELS} from './catalog.js';
import {equipmentIcon} from './icons.js';
import {compareGradeUp,GRADES,GRADE_NAMES} from './gold-cube-engine.js';
const $=id=>document.getElementById(id), items=ITEMS.filter(item=>item.level<200);
let selectedItem=items[0];
const number=value=>value.toLocaleString('ko-KR',{maximumFractionDigits:2});
const money=value=>`${number(value/1e8)}억 메소`;
$('gold-equipment').innerHTML=LEVELS.filter(level=>level<200).map(level=>`<div class="equipment-row"><span class="level-label">Lv. ${level}</span><div>${items.filter(item=>item.level===level).map(item=>`<button type="button" data-item="${item.id}" title="${item.name}" aria-label="${item.name}" aria-pressed="${item===selectedItem}">${equipmentIcon(item)}${item.label}</button>`).join('')}</div></div>`).join('');
const options=GRADES.map((grade,i)=>`<option value="${grade}">${GRADE_NAMES[i]}</option>`);
$('start-grade').innerHTML=options.slice(0,3).join('');
$('target-grade').innerHTML=options.slice(1).join('');
$('start-grade').value='epic'; $('target-grade').value='legendary';
function update() {
  const from=GRADES.indexOf($('start-grade').value);
  for(const option of $('target-grade').options) option.disabled=GRADES.indexOf(option.value)<=from;
  if(GRADES.indexOf($('target-grade').value)<=from) $('target-grade').value=GRADES[from+1];
  try {
    const result=compareGradeUp({level:selectedItem.level,start:$('start-grade').value,target:$('target-grade').value,miracle:$('gold-miracle').checked});
    $('gold-result').innerHTML=`<h2>평균 필요 골드 큐브</h2><p class="gold-total" id="gold-count">${number(result.attempts)}개</p><dl class="metrics"><div><dt>선택 장비</dt><dd>${selectedItem.name}</dd></div><div><dt>메소 재설정으로 등업할 때</dt><dd id="mesos-cost">${money(result.mesosCost)}</dd></div></dl><p class="gold-comparison">보스에서 얻은 큐브로 등업하면 평균 ${money(result.mesosCost)}의 메소 재설정 비용을 대신할 수 있습니다.</p><p class="hint">큐브 획득에 필요한 보스 처치 횟수·기간과 별도 감정 비용은 포함하지 않습니다.</p>`;
    $('gold-breakdown').innerHTML=`<table><thead><tr><th>등업 구간</th><th>골드 등업 확률</th><th>평균 큐브 수</th><th>메소 재설정 비용</th></tr></thead><tbody>${result.rows.map(r=>`<tr><td>${r.name}</td><td>${(r.probability*100).toFixed(4)}%</td><td>${number(r.attempts)}개</td><td>${money(r.mesosCost)}</td></tr>`).join('')}</tbody></table>`;
  } catch(error) { $('gold-result').textContent=error.message; $('gold-breakdown').replaceChildren(); }
}
$('gold-equipment').addEventListener('click',event=>{
  const button=event.target.closest('button[data-item]');
  if(!button) return;
  selectedItem=items.find(item=>item.id===button.dataset.item);
  for(const itemButton of $('gold-equipment').querySelectorAll('button')) itemButton.setAttribute('aria-pressed',String(itemButton===button));
  update();
});
$('gold-form').addEventListener('change',update);
$('gold-form').addEventListener('submit',event=>event.preventDefault());
update();
