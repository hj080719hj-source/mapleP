import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULTS,optimizeSafeguard,starExpectation,attemptCost} from '../public/js/engine.js';
test('cheap spares favor no safeguards, expensive spares favor all safeguards',()=>{
  assert.deepEqual(optimizeSafeguard({...DEFAULTS,spare:0}).stages,[]);
  assert.deepEqual(optimizeSafeguard({...DEFAULTS,spare:1000}).stages,[15,16,17]);
});
test('selected policy is minimum across every eligible policy and input is immutable',()=>{
  for(const recovery of ['reset','preserve']) for(const target of [18,22,25]) for(const discount of [false,true]){
    const s={...structuredClone(DEFAULTS),spare:60,target,recovery,discount,mvp:.1,pcBang:true,recoveryFees:Object.fromEntries(Array.from({length:8},(_,i)=>[15+i,5e8]))};
    const before=JSON.stringify(s),r=optimizeSafeguard(s);
    assert.equal(r.candidates.length,8);
    for(let mask=0;mask<8;mask++){
      const stages=[15,16,17].filter((_,i)=>mask&(1<<i));
      assert.ok(r.cost<=starExpectation({...s,safeguardStages:stages}).cost+.01);
    }
    assert.equal(JSON.stringify(s),before);
  }
});
test('guaranteed steps are excluded and manual final prices lock their decisions',()=>{
  const a=optimizeSafeguard({...DEFAULTS,guarantee:true,spare:1000});
  assert.equal(a.candidates.length,4);assert.ok(!a.stages.includes(15));
  const s={...DEFAULTS,safeguardStages:[15],spare:1000};
  s.costOverrides={15:attemptCost(15,s),17:attemptCost(17,s)};
  const b=optimizeSafeguard(s);
  assert.equal(b.candidates.length,2);assert.ok(b.stages.includes(15));assert.ok(!b.stages.includes(17));
});
test('invalid recovery costs must not silently prune expensive policies',()=>{
  assert.throws(()=>optimizeSafeguard({...DEFAULTS,recovery:'preserve',recoveryFees:{15:NaN,18:1,19:1,20:1,21:1}}),/15성/);
});
