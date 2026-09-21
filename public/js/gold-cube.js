import {ITEMS} from './catalog.js';
import {compareGradeUp,GRADES,GRADE_NAMES} from './gold-cube-engine.js';
const $=id=>document.getElementById(id), items=ITEMS.filter(item=>item.level<200);
const number=value=>value.toLocaleString('ko-KR',{maximumFractionDigits:2});
const money=value=>`${number(value/1e8)}억 메소`;
$('item').innerHTML=items.map(item=>`<option value="${item.id}">Lv. ${item.level} · ${item.name}</option>`).join('');
const options=GRADES.map((grade,i)=>`<option value="${grade}">${GRADE_NAMES[i]}</option>`);
$('start-grade').innerHTML=options.slice(0,3).join('');
$('target-grade').innerHTML=options.slice(1).join('');
$('start-grade').value='epic'; $('target-grade').value='legendary';
function update() {
  const from=GRADES.indexOf($('start-grade').value);
  for(const option of $('target-grade').options) option.disabled=GRADES.indexOf(option.value)<=from;
  if(GRADES.indexOf($('target-grade').value)<=from) $('target-grade').value=GRADES[from+1];
  try {
    const result=compareGradeUp({level:items.find(i=>i.id===$('item').value).level,start:$('start-grade').value,target:$('target-grade').value,miracle:$('gold-miracle').checked,price:$('cube-price').value===''?null:$('cube-price').valueAsNumber*10000,fee:$('cube-fee').valueAsNumber});
    $('gold-result').innerHTML=`<h2>골드 큐브 기대 비용</h2><p class="gold-total" id="gold-total">${result.cost===null?'큐브 가격을 입력해주세요':money(result.cost)}</p><dl class="metrics"><div><dt>평균 필요 큐브</dt><dd id="gold-count">${number(result.attempts)}개</dd></div><div><dt>메소 재설정 등업 비용</dt><dd>${money(result.mesosCost)}</dd></div><div><dt>비용이 같아지는 큐브 가격</dt><dd>${result.breakEven<0?'추가 비용만으로 메소 재설정 초과':`${number(result.breakEven/10000)}만 메소 / 개`}</dd></div></dl><p class="gold-comparison">${result.cost===null?'큐브 가격을 입력하면 더 저렴한 방식을 비교합니다.':Math.abs(result.cost-result.mesosCost)<1?'두 방식의 기대 비용이 같습니다.':`${result.cost<result.mesosCost?'골드 큐브':'메소 재설정'}가 평균 ${money(Math.abs(result.cost-result.mesosCost))} 저렴합니다.`}</p>`;
    $('gold-breakdown').innerHTML=`<table><thead><tr><th>등업 구간</th><th>골드 등업 확률</th><th>평균 큐브 수</th><th>골드 비용</th><th>메소 재설정 비용</th></tr></thead><tbody>${result.rows.map(r=>`<tr><td>${r.name}</td><td>${(r.probability*100).toFixed(4)}%</td><td>${number(r.attempts)}개</td><td>${r.cost===null?'가격 미입력':money(r.cost)}</td><td>${money(r.mesosCost)}</td></tr>`).join('')}</tbody></table>`;
  } catch(error) { $('gold-result').textContent=error.message; $('gold-breakdown').replaceChildren(); }
}
$('gold-form').addEventListener('input',update);
$('gold-form').addEventListener('change',update);
$('gold-form').addEventListener('submit',event=>event.preventDefault());
update();
