import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DEFAULTS, calculate, potentialProbability, potentialExpectation, starExpectation, starRates, attemptCost, reachableStars, stageBreakdown } from '../public/js/engine.js';
const data = JSON.parse(await readFile(new URL('../public/data/potential.json', import.meta.url)));
const settings = patch => ({ ...structuredClone(DEFAULTS), ...patch });
const close = (actual, expected, relative = 1e-9) => assert.ok(Math.abs(actual-expected) <= Math.max(1,Math.abs(expected))*relative, `${actual} != ${expected}`);

test('every downloaded table contains valid complete probability distributions', () => {
  assert.equal(Object.keys(data.tables).length, 92);
  for (const lines of Object.values(data.tables)) {
    assert.equal(lines.length, 3);
    for (const line of lines) {
      assert.ok(line.every(o=>Number.isFinite(o.probability) && o.probability > 0));
      close(line.reduce((a,o)=>a+o.probability,0),1,1e-4);
    }
  }
});
test('three independent 50% lines require three successes for 27%', () => {
  const line = [{name:'INT +9%',probability:.5},{name:'최대 MP +9%',probability:.5}];
  close(potentialProbability([line,line,line],'INT',27),.125);
});
test('all-stat inclusion is optional and changes qualifying outcomes', () => {
  const lines = [[{name:'INT +12%',probability:1}], [{name:'INT +9%',probability:1}], [{name:'올스탯 +6%',probability:1}]];
  assert.equal(potentialProbability(lines,'INT',27,true),1);
  assert.equal(potentialProbability(lines,'INT',27,false),0);
});
test('restricted options are excluded then remaining weights normalized', () => {
  const blocked = {name:'피격 후 무적시간 +3초',probability:1};
  const lines = [[blocked], [{...blocked,probability:.5},{name:'INT +12%',probability:.5}], [{name:'INT +9%',probability:1}]];
  close(potentialProbability(lines,'INT',21),1);
});
test('higher targets cost more; level-specific fees apply to the same belt options', () => {
  const a = potentialExpectation(settings({threshold:27}), data);
  const b = potentialExpectation(settings({threshold:30}), data);
  const c = potentialExpectation(settings({level:160}), data);
  assert.ok(b.cost > a.cost);
  assert.equal(a.unitCost,45000000);
  assert.equal(c.unitCost,42500000);
  assert.ok(a.p90 > a.median);
  assert.ok(a.probability > 0 && a.probability < .1);
});
test('already achieved targets require no rerolls or star attempts', () => {
  const r = calculate(settings({achieved:true,start:22,target:22,purchase:3}),data);
  assert.equal(r.total,3e8);
  assert.equal(r.potential.attempts,0);
  assert.equal(r.starforce.destroys,0);
});
test('single non-destructive step is a geometric expectation', () => {
  const s = settings({start:0,target:1,costOverrides:{0:100}});
  const r = starExpectation(s);
  close(r.attempts,1/.9975);
  close(r.cost,100/.9975);
  assert.equal(r.recovery,0);
});
test('preserve-star recovery has closed-form destruction and fee expectation', () => {
  const s = settings({start:21,target:22,recovery:'preserve',spare:2,recoveryFees:{21:3e8},costOverrides:{21:1e8}});
  const r = starExpectation(s);
  const p = .1575, d = .1275 * (.8425/.85);
  close(r.attempts,1/p);
  close(r.destroys,d/p);
  close(r.spares,3*d/p);
  close(r.cost,(1e8+d*(3*2e8+3e8))/p);
});
test('12-star reset includes rebuilding, and its Bellman equation holds', () => {
  const s = settings({start:21,target:22,spare:2});
  const r = starExpectation(s);
  const afterReset = starExpectation({...s,start:12});
  const q = starRates(21,s);
  close(r.cost,attemptCost(21,s)+q.stay*r.cost+q.destroy*(2e8+afterReset.cost));
  assert.equal(r.rows[0].star,12);
  assert.ok(r.attempts > 1/q.success);
});
test('a protected single step does not require unreachable 12-star costs', () => {
  const s = settings({start:15,target:16,safeguard:true});
  assert.deepEqual(reachableStars(s),[15]);
  assert.equal(starExpectation(s).destroys,0);
});
test('discount does not apply to the safeguard surcharge, nor to manual final costs', () => {
  const plain = settings({start:15,target:16,safeguard:false});
  const base = attemptCost(15,plain);
  close(attemptCost(15,{...plain,safeguard:true,discount:true}),Math.round(base*2.7/100)*100);
  assert.equal(attemptCost(15,{...plain,safeguard:true,discount:true,costOverrides:{15:777}}),777);
});
test('spare price affects only expected recovery cost', () => {
  const low = starExpectation(settings({spare:0}));
  const high = starExpectation(settings({spare:8}));
  close(high.enhancement,low.enhancement);
  close(high.cost-low.cost,high.spares*8e8);
});
test('invalid, nonfinite and missing inputs fail instead of producing a number', () => {
  for (const patch of [{start:23},{start:20,target:17},{spare:-1},{spare:NaN},{level:100},{target:21.5}])
    assert.throws(()=>calculate(settings(patch),data));
  assert.throws(()=>starExpectation(settings({recovery:'preserve',recoveryFees:{18:NaN}})),/복구/);
  assert.throws(()=>starExpectation(settings({costOverrides:{0:NaN}})));
});
test('complete example has finite costs equal to the displayed breakdown', () => {
  const r = calculate(settings({purchase:5}),data);
  close(r.total,r.potential.cost+r.starforce.enhancement+r.starforce.recovery+5e8);
  assert.ok(Number.isFinite(r.total) && r.total > 5e8);
});

test('MVP and PC discounts apply through 16→17 only and exclude safeguard surcharge', () => {
  const s = settings({mvp:.1,pcBang:true,discount:true,safeguard:false});
  const base16 = attemptCost(16, settings({safeguard:false}));
  close(attemptCost(16,s),Math.round(base16*.85*.7/100)*100);
  close(attemptCost(16,{...s,safeguard:true}),Math.round((base16*.85*.7+base16*2)/100)*100);
  close(attemptCost(17,s),attemptCost(17,{...s,mvp:0,pcBang:false}));
});
test('guaranteed steps have exactly one attempt and no safeguard surcharge', () => {
  const s = settings({start:15,target:16,guarantee:true,safeguard:true});
  const r = starExpectation(s);
  assert.equal(r.attempts,1);
  assert.equal(r.destroys,0);
  assert.equal(r.cost,attemptCost(15,settings({safeguard:false})));
});
test('individual safeguard selections affect only selected steps', () => {
  const s = settings({safeguardStages:[16]});
  assert.ok(starRates(15,s).destroy>0);
  assert.equal(starRates(16,s).destroy,0);
  assert.ok(starRates(17,s).destroy>0);
});
test('recovery discount affects meso fee, not spare equipment', () => {
  const s = settings({start:21,target:22,recovery:'preserve',spare:2,recoveryFees:{21:1e9}});
  const regular = starExpectation(s);
  const discount = starExpectation({...s,recoveryDiscount:true});
  close(regular.cost-discount.cost,regular.destroys*1e9*.2);
  close(regular.spares,discount.spares);
});
test('stepwise costs telescope to the total including repeated rebuilding', () => {
  const s = settings({start:12,target:22,discount:true,destroyDiscount:true});
  const rows = stageBreakdown(s);
  const total = starExpectation(s);
  assert.equal(rows.length,10);
  close(rows.reduce((sum,r)=>sum+r.cost,0),total.cost);
  close(rows.at(-1).attempts,total.attempts);
  assert.ok(rows.every(r=>r.cost>=0));
  assert.deepEqual(stageBreakdown({...s,start:22}),[]);
});
