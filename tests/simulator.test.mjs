import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {DEFAULTS,recoveryBaseCost,attemptCost} from '../public/js/engine.js';
import {createSimulation} from '../public/js/simulator.js';
const data=JSON.parse(await readFile(new URL('../public/data/potential.json',import.meta.url)));
function finish(sim,max=1000){for(let n=0;!sim.result.done&&n<max;n++)sim.step();assert.ok(sim.result.done);return sim.result;}

test('promotion outcome is sampled without charging an extra legendary roll',()=>{
  const r=finish(createSimulation({...DEFAULTS,target:0,purchase:5},data,'combined',()=>0));
  assert.equal(r.gradeAttempts,2);assert.equal(r.optionAttempts,0);
  assert.equal(r.upgrade,18e6+3825e4);assert.equal(r.total,r.upgrade+5e8);
  const legendary=finish(createSimulation({...DEFAULTS,target:0,potentialGrade:'legendary'},data,'combined',()=>0));
  assert.equal(legendary.upgrade,0);assert.equal(legendary.optionAttempts,1);assert.equal(legendary.options,45e6);
});
test('pity forces promotions after the configured failure counts',()=>{
  const sim=createSimulation({...DEFAULTS,target:0},data,'potential',()=>.999999);
  for(let n=0;n<151;n++)sim.step();
  assert.equal(sim.result.grade,'legendary');assert.equal(sim.result.gradeAttempts,151);
  assert.equal(sim.result.upgrade,43*18e6+108*3825e4);
});
test('destruction restores the configured star and charges spares and discounted fee',()=>{
  const state={...DEFAULTS,stat:'',start:15,target:16,recovery:'preserve',autoSafeguard:false,safeguard:false,recoveryDiscount:true};
  const values=[.32,0];const r=finish(createSimulation(state,data,'starforce',()=>values.shift()));
  assert.equal(r.destroys,1);assert.equal(r.spares,1);assert.equal(r.starAttempts,2);
  assert.equal(r.recovery,5e8+recoveryBaseCost(state,15)*.8);
  assert.equal(r.enhancement,2*attemptCost(15,state));assert.equal(r.star,16);
});
test('disabled targets and successful star attempts do not charge unrelated costs',()=>{
  const r=finish(createSimulation({...DEFAULTS,stat:'',target:18,purchase:2},data,'combined',()=>0));
  assert.equal(r.gradeAttempts,0);assert.equal(r.options,0);assert.equal(r.destroys,0);
  assert.equal(r.starAttempts,18);assert.equal(r.total,2e8+r.enhancement);
});
