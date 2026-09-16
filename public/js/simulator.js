import {calculate, optimizeSafeguard, starRates, attemptCost, recoveryBaseCost, rollPotential, matchesPotentialGoal, additionalSettings} from './engine.js';

// Uses the same probabilities and recovery policy as the expectation calculator.
export function createSimulation(settings, data, mode = 'combined', random = Math.random) {
  const state = structuredClone(settings);
  if (mode !== 'potential' && state.target > 0 && state.autoSafeguard) state.safeguardStages = optimizeSafeguard(state).stages;
  const expected = calculate(state,data,mode);
  const promotions = expected.potential?.upgrade.rows ?? [];
  const policy = expected.starforce?.recoveryStages ?? state.recoveryStages ?? {};
  const result = {purchase:state.purchase*1e8, upgrade:0, options:0, enhancement:0, recovery:0, total:state.purchase*1e8,
    gradeAttempts:0, optionAttempts:0, starAttempts:0, destroys:0, spares:0, star:state.start,
    lines:[], grade:state.potentialGrade, done:false, expected:expected.total,
    additionalUpgrade:0, additionalOptions:0, additionalGradeAttempts:0, additionalOptionAttempts:0, additionalLines:[], additionalGrade:state.additionalGrade};
  let promotionIndex=0, failures=0, potentialDone=!expected.potential;
  let additionalIndex=0, additionalFailures=0, additionalDone=!expected.additional;
  const extraState=additionalSettings(state);
  const updateDone=()=>{result.done=potentialDone && additionalDone && (!expected.starforce || result.star>=state.target);};
  const add=(category,cost)=>{result[category]+=cost;result.total+=cost;};
  const roll=()=>{
    result.lines=rollPotential(data.tables[`${state.part}-${state.level}`],random);
    potentialDone=matchesPotentialGoal(result.lines,state);
    if (potentialDone && extraState.singleMainStat && state.additionalStat==='주스탯') {
      extraState.stat=['STR','DEX','INT','LUK'].find(stat=>matchesPotentialGoal(result.lines,{...state,stat,singleMainStat:true})) ?? 'STR';
    }
  };
  const rollAdditional=()=>{
    result.additionalLines=rollPotential(data.additional.tables[`${state.part}-${state.level}`],random);
    additionalDone=matchesPotentialGoal(result.additionalLines,extraState);
  };
  updateDone();
  return {state,result,step(){
    if(result.done)return null;
    let event;
    if(!potentialDone){
      const promotion=promotions[promotionIndex];
      if(promotion){
        add('upgrade',promotion.unitCost);result.gradeAttempts++;
        const success=failures>=promotion.maxAttempts-1 || random()<promotion.probability;
        event={type:'grade',label:promotion.name,success,cost:promotion.unitCost};
        if(success){promotionIndex++;failures=0;result.grade=['rare','epic','unique','legendary'][['rare','epic','unique','legendary'].indexOf(result.grade)+1];if(promotionIndex===promotions.length)roll();}
        else failures++;
      }else{
        add('options',expected.potential.unitCost);result.optionAttempts++;roll();
        event={type:'potential',success:potentialDone,lines:[...result.lines],cost:expected.potential.unitCost};
      }
    }else if(!additionalDone){
      const promotion=expected.additional.upgrade.rows[additionalIndex];
      if(promotion){
        add('additionalUpgrade',promotion.unitCost);result.additionalGradeAttempts++;
        const success=additionalFailures>=promotion.maxAttempts-1 || random()<promotion.probability;
        event={type:'additional-grade',label:promotion.name,success,cost:promotion.unitCost};
        if(success){additionalIndex++;additionalFailures=0;result.additionalGrade=['rare','epic','unique','legendary'][['rare','epic','unique','legendary'].indexOf(result.additionalGrade)+1];if(additionalIndex===expected.additional.upgrade.rows.length)rollAdditional();}
        else additionalFailures++;
      }else{
        add('additionalOptions',expected.additional.unitCost);result.additionalOptionAttempts++;rollAdditional();
        event={type:'additional',success:additionalDone,lines:[...result.additionalLines],cost:expected.additional.unitCost};
      }
    }else{
      const from=result.star,rates=starRates(from,state),cost=attemptCost(from,state),pick=random();
      add('enhancement',cost);result.starAttempts++;
      event={type:'star',from,to:from,outcome:'유지',cost};
      if(pick<rates.success){result.star++;event.outcome='성공';}
      else if(pick<rates.success+rates.destroy){
        result.destroys++;
        const recovery=policy[from] ?? state.recovery;
        const preserve=recovery==='preserve';
        const spares=preserve?(from<=18?1:from<=20?2:from===21?3:4):1;
        const fee=spares*state.spare*1e8+(preserve?recoveryBaseCost(state,from)*(state.recoveryDiscount?.8:1):0);
        result.spares+=spares;add('recovery',fee);result.star=preserve?Math.min(from,22):12;
        event.outcome='파괴 후 복구';event.cost+=fee;
      }
      event.to=result.star;
    }
    updateDone();return event;
  }};
}
