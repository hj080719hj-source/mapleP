import test from 'node:test';
import assert from 'node:assert/strict';
import {compareGradeUp} from '../public/js/gold-cube-engine.js';
import {gradeUpExpectation} from '../public/js/engine.js';
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
  assert.throws(()=>compareGradeUp({level:200}));
  assert.throws(()=>compareGradeUp({start:'unique',target:'epic'}));
});
test('appraisal estimate follows equipment level and is deducted from savings',()=>{
  for(const [level,fee] of [[140,392000],[145,420500],[150,450000],[160,512000]]) {
    const r=compareGradeUp({level});
    assert.equal(r.appraisalFee,fee);
    assert.equal(r.appraisalCost,r.attempts*fee);
    assert.equal(r.savings,r.mesosCost-r.appraisalCost);
    assert.ok(Math.abs(r.rows.reduce((sum,row)=>sum+row.appraisalCost,0)-r.appraisalCost)<1e-6);
    assert.equal(compareGradeUp({level,miracle:false}).appraisalCost,r.appraisalCost*2);
  }
});
