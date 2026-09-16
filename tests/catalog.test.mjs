import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {ITEMS,LEVELS} from '../public/js/catalog.js';
import {DEFAULTS,potentialExpectation,starExpectation} from '../public/js/engine.js';
const data=JSON.parse(await readFile(new URL('../public/data/potential.json',import.meta.url)));
test('all 26 equipment entries and every grouped part have usable potential data',()=>{
  assert.equal(ITEMS.length,26);assert.equal(new Set(ITEMS.map(i=>i.id)).size,26);
  assert.deepEqual([...new Set(ITEMS.map(i=>i.level))],LEVELS);
  for(const item of ITEMS)for(const part of item.parts||[item.part]){
    const r=potentialExpectation({...structuredClone(DEFAULTS),item:item.id,level:item.level,part},data);
    assert.ok(Number.isFinite(r.cost)&&r.cost>0,`${item.id} part ${part}`);
  }
});
test('special equipment cannot silently use normal starforce prices',()=>{
  for(const item of ITEMS.filter(i=>i.special))assert.throws(()=>starExpectation({...structuredClone(DEFAULTS),item:item.id,level:item.level,part:item.part}));
});
