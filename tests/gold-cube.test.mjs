import test from 'node:test';
import assert from 'node:assert/strict';
import {compareGradeUp,goldExpectation} from '../public/js/gold-cube-engine.js';
import {gradeUpExpectation,ITEMS} from '../public/js/engine.js';
import {readFileSync} from 'node:fs';
const data=JSON.parse(readFileSync(new URL('../public/data/gold-potential.json',import.meta.url)));
test('gold cube geometric expectation, no mesos pity, and miracle doubling',()=>{
  const normal=compareGradeUp({start:'unique',miracle:false});
  assert.ok(Math.abs(normal.attempts-1/.001996)<1e-9);
  assert.equal(compareGradeUp({start:'unique'}).attempts,normal.attempts/2);
});
test('only selected grade transitions contribute to comparison',()=>{
  const r=compareGradeUp({start:'rare',target:'epic',miracle:false});
  assert.equal(r.rows.length,1);
  assert.equal(r.attempts,1/.079994);
  assert.equal(r.mesosCost,gradeUpExpectation(140,false,'rare').rows[0].cost);
});
test('equipment level affects mesos cost, not required cube count, and rejects invalid scope',()=>{
  assert.equal(compareGradeUp({level:140}).attempts,compareGradeUp({level:160}).attempts);
  assert.ok(compareGradeUp({level:160}).mesosCost>compareGradeUp({level:140}).mesosCost);
  assert.ok(compareGradeUp({level:200}).mesosCost>0);
  assert.throws(()=>compareGradeUp({level:250}));
  assert.throws(()=>compareGradeUp({start:'unique',target:'epic'}));
});
test('official gold tables cover all eligible equipment and conserve probability',()=>{
  assert.equal(data.cubeItemId,2711004);
  for(const item of ITEMS.filter(i=>i.level<=200))for(const part of item.parts||[item.part]) {
    const lines=data.tables[`${part}-${item.level}`];
    assert.equal(lines.length,3);
    for(const line of lines)assert.ok(Math.abs(line.reduce((sum,o)=>sum+o.probability,0)-1)<.001);
  }
});
test('promotion roll is counted once, miracle does not change option probability, manual fees only',()=>{
  const s={item:'dreamy',level:200,part:13,start:'unique',stat:'주스탯',threshold:27,miracle:false};
  const r=goldExpectation(s,data),legend=goldExpectation({...s,start:'legendary'},data);
  assert.equal(r.optionAttempts,legend.optionAttempts-1);
  assert.equal(legend.upgrade.attempts,0);
  assert.equal(r.cost,null);
  assert.equal(goldExpectation({...s,fee:12345},data).cost,r.attempts*12345);
  assert.equal(goldExpectation({...s,miracle:true},data).probability,r.probability);
  assert.ok(goldExpectation({...s,singleMainStat:true},data).optionAttempts>r.optionAttempts);
  assert.throws(()=>goldExpectation({...s,fee:-1},data));
  assert.throws(()=>goldExpectation({...s,stat:'공격력'},data));
});
test('hat cooldown and glove critical damage are supported with gold probabilities',()=>{
  for(const [part,stat,threshold] of [[6,'쿨타임 감소',2],[11,'크리티컬 데미지',16]]) {
    assert.ok(goldExpectation({item:'arcane',level:200,part,stat,threshold,start:'legendary'},data).optionAttempts>0);
  }
});
