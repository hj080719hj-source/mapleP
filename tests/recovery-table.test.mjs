import test from 'node:test';
import assert from 'node:assert/strict';
import {RECOVERY_TABLE,recoveryTableCost} from '../public/js/recovery-costs.js';
import {DEFAULTS,LEVELS,recoveryBaseCost,starExpectation,optimizeSafeguard} from '../public/js/engine.js';
test('exact tables cover all supported levels and cap restoration at 22 stars',()=>{
  for(const level of LEVELS){
    assert.equal(RECOVERY_TABLE[level].length,8);
    for(let star=15;star<=24;star++) assert.ok(Number.isFinite(recoveryTableCost(level,star)));
    assert.equal(recoveryTableCost(level,24),recoveryTableCost(level,22));
    assert.ok(Number.isFinite(optimizeSafeguard({...DEFAULTS,level,recovery:'auto',target:25}).cost));
  }
  assert.equal(recoveryTableCost(145,15),165000000);
  assert.equal(recoveryTableCost(200,22),24200000000);
  assert.equal(recoveryTableCost(250,22),47300000000);
  assert.throws(()=>recoveryTableCost(146,15));
});
test('manual override including zero wins, and deletion restores table cost',()=>{
  const s={...DEFAULTS,recoveryFees:{22:0}};
  assert.equal(recoveryBaseCost(s,24),0);
  delete s.recoveryFees[22];assert.equal(recoveryBaseCost(s,24),24200000000);
});
test('20% discount applies to automatic recovery fee but never spares',()=>{
  const s={...DEFAULTS,start:21,target:22,recovery:'preserve',spare:2};
  const a=starExpectation(s),b=starExpectation({...s,recoveryDiscount:true});
  assert.ok(Math.abs(a.cost-b.cost-a.destroys*recoveryTableCost(200,21)*.2)<.01);
  assert.equal(a.spares,b.spares);
});
