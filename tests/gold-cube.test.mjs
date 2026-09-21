import test from 'node:test';
import assert from 'node:assert/strict';
import {compareGradeUp} from '../public/js/gold-cube-engine.js';
import {gradeUpExpectation} from '../public/js/engine.js';
test('gold cube geometric expectation, no mesos pity, and miracle doubling',()=>{
  const normal=compareGradeUp({start:'unique',miracle:false,price:1000000});
  assert.ok(Math.abs(normal.attempts-1/.001996)<1e-9);
  assert.equal(normal.cost,normal.attempts*1000000);
  assert.equal(compareGradeUp({start:'unique',price:1000000}).attempts,normal.attempts/2);
});
test('only selected grade transitions contribute to comparison',()=>{
  const r=compareGradeUp({start:'rare',target:'epic',miracle:false,price:0,fee:1000});
  assert.equal(r.rows.length,1);
  assert.equal(r.attempts,1/.079994);
  assert.equal(r.mesosCost,gradeUpExpectation(140,false,'rare').rows[0].cost);
  assert.equal(r.cost,r.attempts*1000);
  assert.ok(Math.abs((r.breakEven+1000)*r.attempts-r.mesosCost)<1e-6);
});
test('blank cube price stays unknown and invalid scope is rejected',()=>{
  assert.equal(compareGradeUp().cost,null);
  assert.throws(()=>compareGradeUp({level:200}));
  assert.throws(()=>compareGradeUp({start:'unique',target:'epic'}));
  assert.throws(()=>compareGradeUp({price:NaN}));
});
