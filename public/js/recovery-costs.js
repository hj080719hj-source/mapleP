// Public calculator data, not a Nexon-published price table.
// Source: https://sf.sfcalc.workers.dev/script.js (retrieved 2026-09-12).
// Cross-check: https://www.boomback.com/ev. All level-200 entries agree;
// some other levels differ. Use exact supported levels, never interpolate.
export const RECOVERY_SOURCE = 'https://sf.sfcalc.workers.dev/';
export const RECOVERY_TABLE = {
  140:[148000000,358000000,605000000,1380000000,2280000000,4020000000,5050000000,8290000000],
  145:[165000000,398000000,671000000,1530000000,2540000000,4450000000,5610000000,9230000000],
  150:[183000000,441000000,745000000,1690000000,2810000000,4950000000,6230000000,10200000000],
  160:[222000000,535000000,903000000,2050000000,3410000000,6000000000,7540000000,12400000000],
  200:[433000000,1050000000,1770000000,4010000000,6650000000,11800000000,14800000000,24200000000],
  250:[846000000,2040000000,3450000000,7830000000,13000000000,22900000000,28800000000,47300000000]
};
export function recoveryTableCost(level, star) {
  if (!Number.isInteger(star) || star<15 || star>24) throw new Error('복구 성수는 15~24성 범위여야 합니다.');
  const value=RECOVERY_TABLE[level]?.[Math.min(star,22)-15];
  if(value===undefined) throw new Error('이 레벨의 복구 비용표가 없습니다.');
  return value;
}
