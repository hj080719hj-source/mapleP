import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {DEFAULTS,gradeUpExpectation,potentialExpectation,calculate} from '../public/js/engine.js';
const data=JSON.parse(await readFile(new URL('../public/data/potential.json',import.meta.url)));

test('starting grade charges remaining promotions and only credits an actual promotion roll',()=>{
  const expectations=Object.fromEntries(['rare','epic','unique','legendary'].map(potentialGrade=>[potentialGrade,potentialExpectation({...DEFAULTS,potentialGrade},data)]));
  assert.deepEqual(Object.values(expectations).map(p=>p.upgrade.rows.length),[3,2,1,0]);
  assert.equal(expectations.legendary.upgrade.cost,0);
  assert.equal(expectations.legendary.attempts,1/expectations.legendary.probability);
  assert.ok(Math.abs(expectations.legendary.optionCost-expectations.unique.optionCost-expectations.legendary.unitCost)<1e-5);
  assert.equal(expectations.epic.optionCost,expectations.unique.optionCost);
  const rare=expectations.rare.upgrade.rows[0];
  assert.equal(rare.unitCost,4500000);
  assert.equal(rare.maxAttempts,11);
  assert.equal(gradeUpExpectation(200,true,'rare').rows[0].probability,.3);
  assert.equal(potentialExpectation({...DEFAULTS,potentialGrade:'legendary',miracle:true},data).cost,expectations.legendary.cost);
  assert.throws(()=>gradeUpExpectation(200,false,'invalid'));
});
test('grade-up expectation matches explicit capped outcome distribution',()=>{
  for(const miracle of [false,true]) for(const row of gradeUpExpectation(200,miracle).rows){
    let expected=0;
    for(let n=1;n<row.maxAttempts;n++) expected+=n*(1-row.probability)**(n-1)*row.probability;
    expected+=row.maxAttempts*(1-row.probability)**(row.maxAttempts-1);
    assert.ok(Math.abs(row.attempts-expected)<1e-10);
    assert.equal(row.cost,row.unitCost*row.attempts);
  }
});
test('grade fees vary by level and miracle doubles only grade chances',()=>{
  for(const [level,epic,unique] of [[140,16e6,34e6],[145,16e6,34e6],[150,16e6,34e6],[160,17e6,36125000],[200,18e6,38250000],[250,20e6,42500000]]){
    const a=gradeUpExpectation(level),b=gradeUpExpectation(level,true);
    assert.deepEqual(a.rows.map(r=>r.unitCost),[epic,unique]);
    assert.deepEqual(a.rows.map(r=>r.maxAttempts),[43,108]);
    assert.ok(b.cost<a.cost);
    a.rows.forEach((r,i)=>{assert.equal(b.rows[i].probability,r.probability*2);assert.equal(b.rows[i].maxAttempts,r.maxAttempts);});
  }
  const a=potentialExpectation(DEFAULTS,data),b=potentialExpectation({...DEFAULTS,miracle:true},data);
  assert.equal(a.optionCost,b.optionCost);assert.equal(a.cost,a.optionCost+a.upgrade.cost);
  assert.ok(Math.abs(a.attempts-(1/a.probability-1))<1e-10);
});
test('no potential selection never adds grade costs',()=>{
  const a=calculate({...DEFAULTS,stat:''},data),b=calculate({...DEFAULTS,stat:'',miracle:true},data);
  assert.equal(a.potential,null);assert.equal(a.total,b.total);
});
