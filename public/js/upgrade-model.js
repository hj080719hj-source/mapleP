import { numberValue } from './combat-model.js';
import { referenceDamage, REFERENCE_MAX } from './reference-model.js';

export function targetGap(target, result) {
  const goal = numberValue(target);
  if (goal === null || goal <= 0 || goal > REFERENCE_MAX) return { ok: false, message: `목표 환산을 1~${REFERENCE_MAX} 범위로 입력해주세요.` };
  if (!result?.ok || !Number.isFinite(result.reference) || result.reference <= 0 || result.reference > REFERENCE_MAX || !Number.isFinite(result.minRatio) || !Number.isFinite(result.maxRatio) || result.minRatio < 0 || result.maxRatio < result.minRatio) return { ok: false, message: '먼저 같은 조건의 기준 환산을 저장해주세요.' };
  const need = referenceDamage(goal), baseline = referenceDamage(result.reference);
  const low = baseline * result.minRatio, high = baseline * result.maxRatio;
  return { ok: true, target: goal,
    requiredFromBaseline: Math.max(0, (need / baseline - 1) * 100),
    additionalMin: high > 0 ? Math.max(0, (need / high - 1) * 100) : null,
    additionalMax: low > 0 ? Math.max(0, (need / low - 1) * 100) : null,
    // Compare unrounded damage rather than the rounded displayed stat.
    status: low >= need ? 'reached' : high >= need ? 'uncertain' : 'short',
  };
}

export function rankUpgradePlans(plans, target, budget = '') {
  const cap = budget === '' ? Infinity : numberValue(budget);
  if (cap === null || cap < 0) return { ok: false, message: '예산은 0 이상의 억 메소로 입력하거나 비워두세요.' };
  const evaluated = [];
  for (const plan of plans) {
    const cost = numberValue(plan.cost), gap = targetGap(target, plan.result);
    if (!gap.ok) return gap;
    if (cost === null || cost < 0) return { ok: false, message: '후보 비용을 확인해주세요.' };
    evaluated.push({ ...plan, cost, gap, withinBudget: cost <= cap });
  }
  const sort = (a, b) => a.cost - b.cost || b.result.min - a.result.min || a.id - b.id;
  const eligible = evaluated.filter(p => p.gap.status === 'reached' && p.withinBudget).sort(sort);
  return { ok: true,
    recommended: eligible.slice(0, 5),
    alternatives: [...eligible.slice(5), ...evaluated.filter(p => p.gap.status !== 'reached' || !p.withinBudget).sort(sort)],
  };
}
