import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DEFAULTS,ITEMS,additionalCost,additionalThresholds,gradeUpExpectation,calculate} from '../public/js/engine.js';
import {createSimulation} from '../public/js/simulator.js';
const data=JSON.parse(fs.readFileSync(new URL('../public/data/potential.json',import.meta.url)));
data.additional=JSON.parse(fs.readFileSync(new URL('../public/data/additional.json',import.meta.url)));
const settings={...DEFAULTS,stat:'',target:0,additionalStat:'주스탯',additionalThreshold:14};
test('additional official tables cover every catalog item and conserve probability',()=>{
  for(const item of ITEMS)for(const part of item.parts??[item.part])assert.ok(data.additional.tables[`${part}-${item.level}`]);
  for(const lines of Object.values(data.additional.tables)){
    assert.equal(lines.length,3);
    for(const line of lines)assert.ok(Math.abs(line.reduce((n,o)=>n+o.probability,0)-1)<.001);
  }
  assert.deepEqual([140,160,200,250].map(additionalCost),[78e6,83e6,88e6,98e6]);
});
test('additional mesos promotions use separate fees, pity and miracle',()=>{
  const normal=gradeUpExpectation(250,false,'rare',true),miracle=gradeUpExpectation(250,true,'rare',true);
  assert.deepEqual(normal.rows.map(r=>r.maxAttempts),[63,153,215]);
  assert.deepEqual(normal.rows.map(r=>r.unitCost),[12250000,34300000,83300000]);
  for(let i=0;i<3;i++){
    const row=normal.rows[i];let explicit=0;
    for(let n=0;n<row.maxAttempts;n++)explicit+=(1-row.probability)**n;
    assert.ok(Math.abs(explicit-row.attempts)<1e-9);
    assert.equal(miracle.rows[i].probability,row.probability*2);
    assert.equal(miracle.rows[i].maxAttempts,row.maxAttempts);
  }
  assert.ok(miracle.cost<normal.cost);
});
test('additional-only costs, start grades, shared targeting and total remain consistent',()=>{
  const alone=calculate(settings,data),combined=calculate({...settings,stat:'주스탯'},data);
  assert.equal(alone.potential,null);assert.equal(alone.starforce,null);
  assert.equal(alone.total,alone.additional.cost+settings.purchase*1e8);
  assert.ok(alone.additional.anyMainStat);assert.equal(combined.additional.anyMainStat,false);
  assert.ok(alone.additional.probability>combined.additional.probability);
  const legend=calculate({...settings,additionalGrade:'legendary'},data).additional;
  assert.equal(legend.upgrade.cost,0);
  assert.ok(Math.abs(legend.attempts-alone.additional.attempts-1)<1e-8);
  const miracle=calculate({...settings,additionalMiracle:true},data).additional;
  assert.equal(miracle.optionCost,alone.additional.optionCost);
  assert.ok(miracle.upgrade.cost<alone.additional.upgrade.cost);
  assert.equal(calculate({...settings,additionalStat:''},data).additional,null);
  assert.equal(calculate(settings,data,'starforce').additional,null);
});
test('additional thresholds reflect actual item options',()=>{
  assert.deepEqual(additionalThresholds({...settings,additionalStat:'공격력'},data.additional),[]);
  assert.ok(additionalThresholds({...settings,part:1,additionalStat:'공격력'},data.additional).includes(30));
  assert.deepEqual(additionalThresholds({...settings,part:6,additionalStat:'쿨타임 감소'},data.additional),[1,2,3]);
  assert.throws(()=>calculate({...settings,additionalThreshold:39},data),/등장/);
});
test('additional simulation samples promotion roll once and charges every cost',()=>{
  const fixture={...data,additional:{tables:{'13-200':Array.from({length:3},()=>[{name:'STR +8%',probability:1}])}}};
  const sim=createSimulation(settings,fixture,'potential',()=>0);
  while(!sim.result.done)sim.step();
  assert.equal(sim.result.additionalGradeAttempts,2);
  assert.equal(sim.result.additionalOptionAttempts,0);
  assert.equal(sim.result.additionalUpgrade,30800000+74800000);
  assert.equal(sim.result.total,sim.result.purchase+sim.result.additionalUpgrade);
  assert.equal(sim.result.gradeAttempts,0);assert.equal(sim.result.starAttempts,0);
});
test('shared main and additional simulation must finish on the same stat',()=>{
  const lines=Array.from({length:3},()=>[{name:'STR +20%',probability:.5},{name:'INT +20%',probability:.5}]);
  const fixture={tables:{'13-200':lines},additional:{tables:{'13-200':lines}}};
  const randoms=[.75,.75,.75,0,0,0,.75,.75,.75];
  const sim=createSimulation({...settings,stat:'주스탯',potentialGrade:'legendary',additionalGrade:'legendary'},fixture,'potential',()=>randoms.shift());
  sim.step();sim.step();assert.equal(sim.result.done,false);
  sim.step();assert.equal(sim.result.done,true);
  assert.equal(sim.result.additionalOptionAttempts,2);
  assert.equal(sim.result.additionalOptions,176000000);
});
