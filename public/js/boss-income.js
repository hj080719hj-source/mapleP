import { PRICE_CHANGES } from './boss-prices.js';
import { activitiesFrom } from './scheduler-data.js';
const clean = value => String(value ?? '').replace(/\s/g, '').toLowerCase();
const aliases = { 세렌: '선택받은세렌', 칼로스: '감시자칼로스' };
const difficulties = { normal: '노멀', 노말: '노멀', easy: '이지', hard: '하드', chaos: '카오스', extreme: '익스트림' };
export function bossId(name, difficulty) {
  const n = clean(name), d = clean(difficulty);
  return `${aliases[n] || n}|${difficulties[d] || d}`;
}
export function crystalPrice(name, difficulty, date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < '2026-09-17') return null;
  const changes = PRICE_CHANGES.filter(row => bossId(row.name, row.difficulty) === bossId(name, difficulty));
  const active = changes.filter(row => row.effective <= date).at(-1);
  // Before-values from September notes are valid for the supported September snapshot window.
  return active?.price ?? changes.find(row => row.effective > date)?.before ?? null;
}
export function bossCycle(value) {
  const v = clean(value);
  if (['일일', '일간', 'daily', 'day'].includes(v)) return 'daily';
  if (['주간', 'weekly', 'week'].includes(v)) return 'weekly';
  if (['월간', 'monthly', 'month'].includes(v)) return 'monthly';
  return 'other';
}
export function incomeFor(entries, date, overrides = new Map()) {
  const totals = { daily: 0, weekly: 0, monthly: 0, other: 0 };
  const characters = entries.map(entry => {
    const sums = { daily: 0, weekly: 0, monthly: 0, other: 0 };
    const available = !entry.error && Array.isArray(entry.data?.boss_contents);
    const activities = available ? [...new Map(activitiesFrom(entry.data).filter(row => row.group === 'boss' && row.done === true).map(row => [row.key, row])).values()] : [];
    const rows = activities.map(boss => {
      const id = JSON.stringify([entry.character.ocid, boss.key]);
      const override = overrides.get(id) || {};
      const base = crystalPrice(boss.name, boss.difficulty, date);
      const price = override.price === undefined ? base : override.price === '' ? null : Number(override.price);
      const party = override.party === undefined ? 1 : override.party === '' ? null : Number(override.party);
      const valid = Number.isSafeInteger(price) && price >= 0 && price <= 1e12 && Number.isInteger(party) && party >= 1 && party <= 6;
      const included = override.included !== false;
      const value = valid && included ? Math.floor(price / party) : null;
      const cycle = bossCycle(boss.cycle);
      if (value !== null) sums[cycle] += value;
      return { ...boss, id, cycle, rawCycle: boss.cycle, price, party, base, included, value, valid };
    });
    for (const cycle of Object.keys(totals)) totals[cycle] += sums[cycle];
    return { character: entry.character, available, error: entry.error, rows, sums,
      missing: rows.filter(row => row.included && !row.valid).length };
  });
  return { totals, characters, missing: characters.reduce((n, c) => n + c.missing, 0), failed: characters.filter(c => !c.available).length };
}
