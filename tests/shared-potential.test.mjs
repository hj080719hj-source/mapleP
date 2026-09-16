import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {DEFAULTS,potentialProbability,potentialExpectation,acceptsAnyMainStat} from '../public/js/engine.js';
const data=JSON.parse(await readFile(new URL('../public/data/potential.json',import.meta.url)));
const stats=['STR','DEX','INT','LUK'];

test('cooldown seconds and critical damage use only their own option values',()=>{
  const cooldownLine=[{name:'스킬 재사용 대기시간 -2초',probability:.5},{name:'STR +13%',probability:.5}];
  assert.equal(potentialProbability([cooldownLine,cooldownLine,cooldownLine],'쿨타임 감소',6),.125);
  const criticalLine=[{name:'크리티컬 데미지 +8%',probability:.5},{name:'크리티컬 확률 +12%',probability:.5}];
  assert.equal(potentialProbability([criticalLine,criticalLine,criticalLine],'크리티컬 데미지',16),.5);
  for(const [part,stat,targets] of [[6,'쿨타임 감소',[1,2,3,4,5,6]],[11,'크리티컬 데미지',[8,16,24]]]) {
    let previous=0;
    for(const threshold of targets){
      const r=potentialExpectation({...DEFAULTS,item:'arcane',part,stat,threshold},data);
      assert.ok(Number.isFinite(r.cost) && r.cost>previous);
      assert.equal(r.anyMainStat,false);
      previous=r.cost;
    }
  }
});

test('all-stat-only target excludes individual stats and does not use the shared union',()=>{
  const line=[{name:'올스탯 +9%',probability:.5},{name:'STR +12%',probability:.5}];
  assert.equal(potentialProbability([line,line,line],'올스탯',27,true),.125);
  assert.equal(potentialProbability([line,line,line],'올스탯',27,false),.125);
  const shared=potentialExpectation({...DEFAULTS,stat:'올스탯'},data);
  const single=potentialExpectation({...DEFAULTS,stat:'올스탯',item:'custom'},data);
  assert.equal(shared.anyMainStat,false);
  assert.equal(shared.cost,single.cost);
  assert.ok(shared.probability>0);
});
test('any-main-stat success is a union of targets, not mixed-stat addition',()=>{
  const line=[{name:'STR +9%',probability:.5},{name:'INT +9%',probability:.5}];
  assert.equal(potentialProbability([line,line,line],stats,27),.25);
  assert.equal(potentialProbability([line,line,line],'INT',27),.125);
  assert.equal(potentialProbability([[{name:'STR +12%',probability:1}],[{name:'INT +9%',probability:1}],[{name:'DEX +6%',probability:1}]],stats,27),0);
});
test('all-stat contributes to every main stat without counting overlapping outcomes twice',()=>{
  const lines=Array.from({length:3},()=>[{name:'올스탯 +9%',probability:1}]);
  assert.equal(potentialProbability(lines,stats,27,true),1);
  assert.equal(potentialProbability(lines,stats,27,false),0);
  const mixed=[[{name:'INT +12%',probability:1}],[{name:'INT +9%',probability:1}],[{name:'올스탯 +6%',probability:1}]];
  assert.equal(potentialProbability(mixed,stats,27,true),1);
});
test('shared equipment lowers option cost while grade-up cost is unchanged',()=>{
  const shared=potentialExpectation(DEFAULTS,data);
  const single=potentialExpectation({...DEFAULTS,item:'custom'},data);
  assert.ok(shared.probability>single.probability);
  assert.ok(shared.optionCost<single.optionCost);
  assert.equal(shared.upgrade.cost,single.upgrade.cost);
  assert.ok(shared.anyMainStat);
  assert.equal(acceptsAnyMainStat({...DEFAULTS,stat:'공격력'}),false);
  assert.equal(acceptsAnyMainStat({...DEFAULTS,stat:''}),false);
  const eternal={...DEFAULTS,item:'eternal-main',part:6,level:250};
  const r=potentialExpectation(eternal,data);
  assert.equal(r.anyMainStat,false);
  assert.equal(r.probability,potentialProbability(data.tables['6-250'],'INT',27,true));
});
