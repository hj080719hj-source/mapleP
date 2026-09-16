import {createSimulation} from './simulator.js';

export function mountSimulation(getSettings,data,mode) {
  const card=document.createElement('details');
  card.className='card simulation-card';
  card.innerHTML=`<summary class="section-heading"><h2>강화 시뮬레이션</h2><span class="pill">목표까지 자동 진행</span></summary>
    <p class="hint">현재 목표·시작 등급·이벤트·파괴방지·복구 설정으로 장비 한 개를 완성해 봅니다. 실행할 때마다 결과가 달라집니다.</p>
    <div class="simulation-actions"><button type="button" class="primary" id="simulate-start">시뮬레이션 시작</button><button type="button" class="secondary" id="simulate-stop" hidden>중지</button></div>
    <p id="simulation-status" role="status">목표를 설정하고 시작해주세요.</p><div id="simulation-output"></div>
    <p class="hint">가상 시행 결과입니다. 잠재는 현재 계산기와 같은 확률 모델을 사용하며, 기존과 동일한 옵션 재등장 제외는 생략합니다. 스타포스·복구 비용도 계산기의 참고 비용을 사용합니다.</p>`;
  document.querySelector('.result-column').append(card);
  const start=card.querySelector('#simulate-start'),stop=card.querySelector('#simulate-stop'),status=card.querySelector('#simulation-status'),output=card.querySelector('#simulation-output');
  const number=n=>n.toLocaleString('ko-KR',{maximumFractionDigits:2});
  const money=n=>`${number(n/1e8)}억 메소`;
  const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let generation=0,running=false;
  const idle=()=>{running=false;start.disabled=false;stop.hidden=true;};
  const invalidate=()=>{
    generation++;idle();output.innerHTML='';status.textContent='조건이 변경되었습니다. 다시 시작해주세요.';
  };
  const form=document.querySelector('#calculator');
  form.addEventListener('input',invalidate);
  form.addEventListener('change',invalidate);
  form.addEventListener('click',e=>{if(e.target.closest('[data-item],[data-part],[data-event],[data-mvp],[data-guard],#reset,#reset-price,#clear-costs'))invalidate();});
  stop.addEventListener('click',()=>{generation++;idle();status.textContent='중지됨 · 아래는 중지 시점까지 사용한 비용입니다.';});
  start.addEventListener('click',()=>{
    generation++;const token=generation;
    let simulation;
    try {
      const settings=getSettings();
      if(!settings)throw Error('계산 조건을 확인해주세요.');
      if((mode==='starforce'||(!settings.stat&&!settings.additionalStat))&&(mode==='potential'||!settings.target))throw Error('잠재능력·에디셔널 또는 스타포스 목표를 선택해주세요.');
      simulation=createSimulation(settings,data,mode);
    }catch(error){output.innerHTML='';status.textContent=error.message;return;}
    running=true;start.disabled=true;stop.hidden=false;
    const draw=()=>{
      const r=simulation.result;
      const cells=[['잠재 등업',r.upgrade],['잠재 옵션 재설정',r.options],['스타포스 강화',r.enhancement],['파괴 복구 · 스페어',r.recovery],['최초 장비 구매',r.purchase]];
      if (simulation.state.additionalStat && mode!=='starforce') cells.splice(2,0,['에디셔널 등업',r.additionalUpgrade],['에디셔널 옵션 재설정',r.additionalOptions]);
      output.innerHTML=`<div class="simulation-total">${money(r.total)}</div><p class="hint">기대 비용 ${money(r.expected)}${r.done&&r.expected>0?` · 이번 결과는 기대 비용의 ${number(r.total/r.expected*100)}%`:''}</p>
        <dl class="simulation-metrics">${simulation.state.additionalStat && mode!=='starforce' ? `<div><dt>에디셔널 등업 시도</dt><dd>${number(r.additionalGradeAttempts)}회</dd></div><div><dt>에디셔널 재설정</dt><dd>${number(r.additionalOptionAttempts)}회</dd></div>` : ''}<div><dt>등업 시도</dt><dd>${number(r.gradeAttempts)}회</dd></div><div><dt>옵션 재설정</dt><dd>${number(r.optionAttempts)}회</dd></div><div><dt>스타포스 강화</dt><dd>${number(r.starAttempts)}회</dd></div><div><dt>파괴</dt><dd>${number(r.destroys)}회</dd></div><div><dt>사용 스페어</dt><dd>${number(r.spares)}개</dd></div><div><dt>현재 스타포스</dt><dd>${mode==='potential'||!simulation.state.target?'선택 없음':r.star+'성'}</dd></div></dl>
        <dl class="breakdown">${cells.map(([label,cost])=>`<div><dt>${label}</dt><dd>${money(cost)}</dd></div>`).join('')}</dl>
        ${r.additionalLines.length ? `<div class="simulation-lines"><strong>에디셔널 잠재</strong><ul>${r.additionalLines.map(line=>`<li>${escape(line)}</li>`).join('')}</ul></div>` : ''}${r.lines.length?`<div class="simulation-lines"><strong>${r.done?'목표 달성 잠재':'현재 잠재'}</strong><ul>${r.lines.map(line=>`<li>${escape(line)}</li>`).join('')}</ul></div>`:''}`;
    };
    const tick=()=>{
      if(token!==generation||!running)return;
      try {
        const deadline=performance.now()+12;
        let operations=0;
        while(!simulation.result.done && operations++<1000 && performance.now()<deadline){
          simulation.step();
          const r=simulation.result;
          if(r.gradeAttempts+r.optionAttempts+r.additionalGradeAttempts+r.additionalOptionAttempts+r.starAttempts>=2000000){draw();idle();status.textContent='200만 회에 도달해 중지했습니다. 목표 미달이며, 표시 비용은 여기까지의 소모량입니다.';return;}
        }
        draw();
        if(simulation.result.done){idle();status.textContent='목표 달성! 다시 실행하면 새로운 결과를 확인할 수 있습니다.';return;}
        status.textContent='목표까지 시뮬레이션 중…';setTimeout(tick,16);
      }catch(error){idle();status.textContent=`시뮬레이션 중단: ${error.message}`;}
    };
    status.textContent='목표까지 시뮬레이션 중…';draw();setTimeout(tick,0);
  });
}
