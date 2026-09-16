import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULTS,starExpectation,optimizeSafeguard} from '../public/js/engine.js';
test('mixed recovery matches exhaustive policies including re-enhancement costs',()=>{
  const s={...DEFAULTS,start:0,target:20,safeguardStages:[15,16],spare:3,recovery:'auto',recoveryFees:{17:0,18:1e12,19:0}};
  const best=starExpectation(s);
  assert.equal(best.recoveryStages[17],'preserve');assert.equal(best.recoveryStages[18],'reset');
  const policies=Array.from({length:8},(_,mask)=>Object.fromEntries([17,18,19].map((star,i)=>[star,mask&(1<<i)?'preserve':'reset'])));
  const minimum=Math.min(...policies.map(recoveryStages=>starExpectation({...s,recovery:'reset',recoveryStages}).cost));
  assert.ok(Math.abs(best.cost-minimum)<.01);
});
test('joint optimizer beats fixed global recovery and preserves upper-star reset rule',()=>{
  const s={...DEFAULTS,target:25,spare:10,recovery:'auto',recoveryFees:Object.fromEntries(Array.from({length:8},(_,i)=>[i+15,i%2?1e12:0]))};
  const optimal=optimizeSafeguard(s);
  for(const recovery of ['reset','preserve']) assert.ok(optimal.cost<=optimizeSafeguard({...s,recovery}).cost+.01);
  const result=starExpectation({...s,safeguardStages:optimal.stages});
  assert.ok(Number.isFinite(result.cost));
  assert.ok(Math.abs(result.cost-optimal.cost)<.01);
});
test('invalid automatic recovery fees fail instead of assuming free restoration',()=>{
  assert.throws(()=>starExpectation({...DEFAULTS,recovery:'auto',recoveryFees:{18:NaN}}),/복구 비용/);
});
