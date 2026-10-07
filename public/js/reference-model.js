import { REFERENCE_CURVE as curve } from './reference-curve.js';
import { numberValue } from './combat-model.js';

export const REFERENCE_MAX = curve.x.at(-1);
// Retain the old project's Hermite conversion, but never extrapolate beyond
// its measured domain. In particular, below-domain values must not accidentally
// evaluate the last segment, as the original helper allowed.
export function referenceDamage(stat) {
  if (!Number.isFinite(stat) || stat < 0 || stat > REFERENCE_MAX) throw new RangeError('환산 곡선의 지원 범위를 벗어났습니다.');
  let i = 0;
  while (i < curve.x.length - 2 && stat > curve.x[i + 1]) i++;
  const width = curve.x[i + 1] - curve.x[i], t = (stat - curve.x[i]) / width;
  return (2*t**3-3*t**2+1)*curve.y[i] + (t**3-2*t**2+t)*width*curve.m[i]
    + (-2*t**3+3*t**2)*curve.y[i+1] + (t**3-t**2)*width*curve.m[i+1];
}
export function referenceStat(damage) {
  if (!Number.isFinite(damage) || damage < 0 || damage > curve.y.at(-1)) throw new RangeError('예상 피해량이 과거 환산 곡선의 지원 범위를 벗어났습니다.');
  let low = 0, high = REFERENCE_MAX;
  for (let i = 0; i < 60; i++) {
    const mid = (low + high) / 2;
    if (referenceDamage(mid) < damage) low = mid; else high = mid;
  }
  return Math.round((low + high) / 2);
}
export function projectReference({ reference, baselineScore, minScore, maxScore = minScore, confirmed = false } = {}) {
  const values = [reference, baselineScore, minScore, maxScore].map(numberValue);
  if (!confirmed) return { ok: false, message: '동일한 캐릭터·장비·버프·프리셋의 보스380 일반 환산인지 확인해주세요.' };
  const [anchor, baseline, low, high] = values;
  if (values.some(value => value === null) || anchor <= 0 || anchor > REFERENCE_MAX || baseline <= 0 || low < 0 || high < low) return { ok: false, message: `기준 환산은 1~${REFERENCE_MAX}, 기준 지수는 양수여야 합니다. 비교값도 확인해주세요.` };
  try {
    const baseDamage = referenceDamage(anchor), minRatio = low / baseline, maxRatio = high / baseline;
    return { ok: true, reference: anchor, min: referenceStat(baseDamage * minRatio), max: referenceStat(baseDamage * maxRatio), minRatio, maxRatio };
  } catch (error) { return { ok: false, message: error.message }; }
}
export function compareObserved(result, observed) {
  const actual = numberValue(observed);
  if (!result?.ok || actual === null || actual <= 0) return null;
  return { minDelta: result.min - actual, maxDelta: result.max - actual,
    minPercent: (result.min / actual - 1) * 100, maxPercent: (result.max / actual - 1) * 100 };
}
