import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULTS,starExpectation,starRates,attemptCost,reachableStars} from '../public/js/engine.js';
test('upper stars use official success rates and exclude 30% destruction event',()=>{
  for(const [star,p] of [[22,.15],[23,.1],[24,.1]]){
    assert.equal(starRates(star,DEFAULTS).success,p*1.05);
    assert.deepEqual(starRates(star,DEFAULTS),starRates(star,{...DEFAULTS,destroyDiscount:true}));
    assert.ok(Number.isFinite(attemptCost(star,DEFAULTS)));
  }
  assert.ok(starRates(21,{...DEFAULTS,destroyDiscount:true}).destroy<starRates(21,DEFAULTS).destroy);
});
test('all 18 to 25 targets have increasing finite expected costs',()=>{
  let previous=0;for(let target=18;target<=25;target++){
    const result=starExpectation({...DEFAULTS,target});
    assert.ok(Number.isFinite(result.cost)&&result.cost>previous);previous=result.cost;
  }
});
test('23 and 24 star destruction returns to 22 using four spare items',()=>{
  const s={...DEFAULTS,start:23,target:25,recovery:'preserve',recoveryFees:{22:1e8}};
  assert.deepEqual(reachableStars(s),[22,23,24]);
  const result=starExpectation(s);
  assert.ok(Number.isFinite(result.cost));
  assert.ok(Math.abs(result.spares-4*result.destroys)<1e-9);
  const from22=starExpectation({...s,start:22});
  const rate=starRates(23,s),from24=starExpectation({...s,start:24});
  const rhs=attemptCost(23,s)+rate.stay*result.cost+rate.success*from24.cost+rate.destroy*(from22.cost+1e8+4*s.spare*1e8);
  assert.ok(Math.abs(result.cost-rhs)<1e-5);
});
