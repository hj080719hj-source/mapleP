// Pure calculation functions shared by the browser and Node tests.
import { ITEMS, PARTS, LEVELS } from './catalog.js';
import {recoveryTableCost} from './recovery-costs.js';
export { ITEMS, PARTS, LEVELS };
export {recoveryTableCost};
export function recoveryBaseCost(s,star) {
  const restoreStar=Math.min(star,22);
  const fee=s.recoveryFees?.[restoreStar] ?? recoveryTableCost(s.level,restoreStar);
  if (!Number.isFinite(fee) || fee<0 || fee>1e14) throw new Error(`${restoreStar}성 복구 비용이 올바르지 않습니다.`);
  return fee;
}
export const DEFAULTS = { item: 'dreamy', level: 200, part: 13, stat: 'INT', threshold: 27,
  allStat: true, achieved: false, start: 0, target: 22, spare: 5, purchase: 0,
  discount: false, destroyDiscount: false, safeguard: true, recovery: 'reset',
  costOverrides: {}, recoveryFees: {}, mvp: 0, pcBang: false, guarantee: false,
  recoveryDiscount: false, safeguardStages: null, miracle: false, autoSafeguard: true, recoveryVersion: 1, potentialGrade: 'epic',
  additionalStat:'', additionalThreshold:14, additionalGrade:'epic' };

function finiteRange(value, min, max, name, integer = false) {
  if (!Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value)))
    throw new Error(`${name}: ${min}~${max} 범위의 ${integer ? '정수' : '숫자'}를 입력해주세요.`);
}
export function validate(s) {
  if (!['rare','epic','unique','legendary'].includes(s.additionalGrade ?? 'epic')) throw new Error('에디셔널 시작 등급을 선택해주세요.');
  if (!['','주스탯','올스탯','공격력','마력','쿨타임 감소','크리티컬 데미지'].includes(s.additionalStat ?? '')) throw new Error('에디셔널 목표를 선택해주세요.');
  if (s.additionalStat) finiteRange(s.additionalThreshold,1,39,'에디셔널 목표',true);
  if (!['rare','epic','unique','legendary'].includes(s.potentialGrade ?? 'epic')) throw new Error('잠재능력 시작 등급을 선택해주세요.');
  if (!LEVELS.includes(s.level)) throw new Error('지원 렙제를 선택해주세요.');
  if (!PARTS[s.part]) throw new Error('지원 장비 부위를 선택해주세요.');
  if (!['', '주스탯', '올스탯', 'STR', 'DEX', 'INT', 'LUK','공격력','마력','쿨타임 감소','크리티컬 데미지'].includes(s.stat)) throw new Error('목표 스탯을 선택해주세요.');
  finiteRange(s.threshold, s.stat === '쿨타임 감소' ? 1 : s.stat === '크리티컬 데미지' ? 8 : 9, s.stat === '쿨타임 감소' ? 6 : s.stat === '크리티컬 데미지' ? 24 : 39, '목표 옵션', true);
  finiteRange(s.start, 0, 27, '현재 스타포스', true);
  finiteRange(s.target, 0, 27, '목표 스타포스', true);
  if (s.target !== 0 && s.target < s.start) throw new Error('목표 스타포스는 시작 성수 이상으로 선택해주세요.');
  finiteRange(s.spare, 0, 100000, '스페어 가격');
  finiteRange(s.purchase, 0, 100000, '시작 장비 구매비');
  if (!['reset', 'preserve','auto'].includes(s.recovery)) throw new Error('복구 방식을 선택해주세요.');
  if (![0, .03, .05, .1].includes(s.mvp ?? 0)) throw new Error('MVP 할인 등급을 선택해주세요.');
  if (s.safeguardStages != null && (!Array.isArray(s.safeguardStages) || s.safeguardStages.some(n => ![15,16,17].includes(n))))
    throw new Error('파괴 방지 단계가 올바르지 않습니다.');
}

export function potentialCost(level) { return level >= 250 ? 50000000 : level >= 200 ? 45000000 : level >= 160 ? 42500000 : 40000000; }
// Nexon 1.2.392 (2024-06-20), mesos reroll costs, not cash cubes.
export function additionalCost(level) { return level >= 250 ? 98000000 : level >= 200 ? 88000000 : level >= 160 ? 83000000 : 78000000; }

// Fresh pity counters: 42/107 consecutive failures guarantee the following attempt.
export function gradeUpExpectation(level, miracle = false, startingGrade = 'epic', additional = false) {
  const startIndex = ['rare','epic','unique','legendary'].indexOf(startingGrade);
  if (startIndex < 0) throw new Error('잠재능력 시작 등급을 선택해주세요.');
  const legendaryCost = additional ? additionalCost(level) : potentialCost(level);
  const rows = (additional ? [
    {name:'레어 → 에픽', probability:.023810, failures:62, unitCost:legendaryCost*.125},
    {name:'에픽 → 유니크', probability:.009804, failures:152, unitCost:legendaryCost*.35},
    {name:'유니크 → 레전드리', probability:.007, failures:214, unitCost:legendaryCost*.85}
  ] : [
    {name:'레어 → 에픽', probability:.15, failures:10, unitCost:legendaryCost*.1},
    {name:'에픽 → 유니크', probability:.035, failures:42, unitCost:legendaryCost*.4},
    {name:'유니크 → 레전드리', probability:.014, failures:107, unitCost:legendaryCost*.85}
  ]).slice(startIndex).map(row => {
    const probability = row.probability * (miracle ? 2 : 1);
    const maxAttempts = row.failures + 1;
    const attempts = -Math.expm1(maxAttempts * Math.log1p(-probability)) / probability;
    return {...row,probability,maxAttempts,attempts,cost:attempts*row.unitCost};
  });
  return {rows,attempts:rows.reduce((sum,r)=>sum+r.attempts,0),cost:rows.reduce((sum,r)=>sum+r.cost,0)};
}

function restriction(name) {
  if (name.includes('쓸만한')) return ['skill', 1];
  if (name.includes('피격 후 무적시간')) return ['afterHit', 1];
  if (name.includes('피격 시') && name.includes('데미지의') && name.includes('무시')) return ['ignore', 2];
  if (name.includes('피격 시') && name.includes('무적')) return ['invincible', 2];
  return null;
}
function statValue(name, stat, includeAll) {
  if (stat === '쿨타임 감소') return Number(name.match(/^스킬 재사용 대기시간 -(\d+)초$/)?.[1] || 0);
  if (!name.startsWith(`${stat} +`) && !(includeAll && ['STR','DEX','INT','LUK'].includes(stat) && name.startsWith('올스탯 +'))) return 0;
  return Number(name.match(/\+(\d+)%/)?.[1] || 0);
}
export function potentialProbability(lines, stat, threshold, includeAll = true) {
  if (!Array.isArray(lines) || lines.length !== 3) throw new Error('잠재 확률표를 불러오지 못했습니다.');
  const stats = Array.isArray(stat) ? stat : [stat];
  // Enumerate ordered outcomes, applying exclusion and renormalization at each line.
  function visit(index, value, seen) {
    if (index === 3) return value.some(n=>n>=threshold) ? 1 : 0;
    const available = lines[index].filter(o => {
      const r = restriction(o.name);
      return !r || (seen[r[0]] || 0) < r[1];
    });
    const weight = available.reduce((sum, o) => sum + o.probability, 0);
    if (!(weight > 0)) throw new Error('잠재 확률표가 올바르지 않습니다.');
    let p = 0;
    for (const option of available) {
      const r = restriction(option.name);
      const next = r ? { ...seen, [r[0]]: (seen[r[0]] || 0) + 1 } : seen;
      p += option.probability / weight * visit(index + 1, value.map((n,i)=>n+statValue(option.name,stats[i],includeAll)), next);
    }
    return p;
  }
  return visit(0, stats.map(()=>0), {});
}
export function acceptsAnyMainStat(s) {
  const item=ITEMS.find(i=>i.id===s.item);
  return !s.singleMainStat && !!item?.shared && item.part===Number(s.part) && ['주스탯','STR','DEX','INT','LUK'].includes(s.stat);
}
export function rollPotential(lines, random = Math.random) {
  const selected = [], seen = {};
  for (const line of lines) {
    const available = line.filter(option => {
      const rule = restriction(option.name);
      return !rule || (seen[rule[0]] || 0) < rule[1];
    });
    let pick = random() * available.reduce((sum, option) => sum + option.probability, 0);
    const option = available.find(option => (pick -= option.probability) < 0) ?? available.at(-1);
    if (!option) throw new Error('잠재 확률표가 올바르지 않습니다.');
    selected.push(option.name);
    const rule = restriction(option.name);
    if (rule) seen[rule[0]] = (seen[rule[0]] || 0) + 1;
  }
  return selected;
}
export function matchesPotentialGoal(names, s) {
  const stats = acceptsAnyMainStat(s) ? ['STR','DEX','INT','LUK'] : [s.stat === '주스탯' ? 'STR' : s.stat];
  return stats.some(stat => names.reduce((sum, name) => sum + statValue(name,stat,s.allStat),0) >= s.threshold);
}
export function additionalSettings(s) {
  return {...s, stat:s.additionalStat, threshold:s.additionalThreshold, potentialGrade:s.additionalGrade ?? 'epic',
    miracle:s.miracle ?? false, achieved:false, allStat:true,
    singleMainStat:['주스탯','STR','DEX','INT','LUK'].includes(s.stat)};
}
export function additionalThresholds(s, data) {
  const lines=data?.tables?.[`${s.part}-${s.level}`];
  if (!lines) return [];
  const stat=s.additionalStat==='주스탯' || !s.additionalStat ? 'STR' : s.additionalStat;
  let sums=new Set([0]);
  for (const line of lines) {
    const values=new Set(line.filter(o=>o.probability>0).map(o=>statValue(o.name,stat,true)));
    sums=new Set([...sums].flatMap(sum=>[...values].map(value=>sum+value)));
  }
  return [...sums].filter(n=>n>0).sort((a,b)=>a-b);
}
export function potentialExpectation(s, data, additional = false) {
  if (!data.tables[`${s.part}-${s.level}`]) throw new Error('이 렙제·부위의 공식 잠재 확률표는 아직 확보하지 못했습니다.');
  const anyMainStat=acceptsAnyMainStat(s);
  const probability = potentialProbability(data.tables[`${s.part}-${s.level}`], anyMainStat?['STR','DEX','INT','LUK']:s.stat==='주스탯'?'STR':s.stat, s.threshold, s.allStat);
  const unitCost = additional ? additionalCost(s.level) : potentialCost(s.level);
  if (s.achieved) return { probability, unitCost, attempts: 0, cost: 0, median: 0, p90: 0 };
  if (probability <= 0) throw new Error('선택한 옵션은 이 장비에서 등장할 수 없습니다.');
  const upgrade = gradeUpExpectation(s.level,s.miracle,s.potentialGrade ?? 'epic',additional);
  // The promotion roll already gives one legendary outcome; do not charge it twice.
  const promotionRoll = upgrade.rows.length > 0 ? 1 : 0;
  const attempts = Math.max(0,1 / probability - promotionRoll);
  const optionCost = unitCost * attempts;
  const quantile = q => probability >= 1 ? 1-promotionRoll : Math.max(0,Math.ceil(Math.log1p(-q) / Math.log1p(-probability))-promotionRoll);
  return { probability, unitCost, attempts, optionCost, upgrade, anyMainStat, cost: upgrade.cost + optionCost,
    median: quantile(.5), p90: quantile(.9) };
}

const BASE_SUCCESS = [.95,.9,.85,.85,.8,.75,.7,.65,.6,.55,.5,.45,.4,.35,.3,.3,.3,.15,.15,.15,.3,.15,.15,.1,.1,.1,.07];
const BASE_DESTROY = Array(15).fill(0).concat([.021,.021,.068,.068,.085,.105,.1275,.17,.18,.18,.18,.186]);
// Planning formula, not a Nexon-published cost table. UI allows exact in-game costs.
export function estimatedStarCost(level, star) {
  const divisor = [571, 314, 214, 157, 107, 200, 200, 150, 70, 45, 200, 125, 200, 200, 200, 200, 200][star - 10];
  const raw = star < 10 ? level ** 3 * (star + 1) / 36 : level ** 3 * (star + 1) ** 2.7 / divisor;
  return Math.round((1000 + raw) / 100) * 100;
}
export function starRates(star, s) {
  if (s.guarantee && [5,10,15].includes(star)) return {success:1, destroy:0, stay:0};
  const original = BASE_SUCCESS[star];
  const success = Math.min(1, original * 1.05);
  // Star Catch's permanent success bonus proportionately reduces both failure outcomes.
  let destroy = BASE_DESTROY[star] * (1 - success) / (1 - original);
  if (s.destroyDiscount && star <= 21) destroy *= .7;
  if (isSafeguarded(star, s)) destroy = 0;
  return { success, destroy, stay: 1 - success - destroy };
}
export function isSafeguarded(star, s) {
  if (s.guarantee && [5,10,15].includes(star)) return false;
  return star >= 15 && star <= 17 && (s.safeguardStages == null ? s.safeguard : s.safeguardStages.includes(star));
}

export function optimizeSafeguard(s) {
  validate(s);
  // Manual final prices include the current safeguard surcharge. Keep those
  // decisions fixed rather than reuse the same price for incompatible policies.
  const fixed = [15,16,17].filter(star=>s.costOverrides?.[star] !== undefined);
  const candidates = [];
  for (let mask=0; mask<8; mask++) {
    const stages = [15,16,17].filter((star,i)=>(mask & (1<<i)) && !(s.guarantee && star===15));
    if (candidates.some(c=>c.stages.join(',')===stages.join(','))) continue;
    if (fixed.some(star=>stages.includes(star)!==isSafeguarded(star,s))) continue;
    const result = starExpectation({...s,safeguardStages:stages});
    candidates.push({stages,cost:result.cost,recoveryStages:result.recoveryStages});
  }
  candidates.sort((a,b)=>Math.abs(a.cost-b.cost)<.01 ? a.stages.length-b.stages.length : a.cost-b.cost);
  if (!candidates.length) throw new Error('파괴 방지 조합을 비교할 수 없습니다.');
  return {...candidates[0],candidates,fixed};
}
export function attemptCost(star, s) {
  const override = s.costOverrides?.[star];
  if (override !== undefined) {
    finiteRange(override, 1, 1e13, `${star}성 1회 비용`);
    return override; // Already includes every discount / safeguard selected in game.
  }
  const base = estimatedStarCost(s.level, star);
  const localDiscount = star <= 16 ? (s.mvp || 0) + (s.pcBang ? .05 : 0) : 0;
  return Math.round((base * (1-localDiscount) * (s.discount ? .7 : 1) + (isSafeguarded(star,s) ? base * 2 : 0)) / 100) * 100;
}
function linearSolve(matrix, rhs) {
  const n = rhs.length;
  const a = matrix.map((row, i) => [...row, rhs[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
    [a[col], a[pivot]] = [a[pivot], a[col]];
    const divisor = a[col][col];
    if (Math.abs(divisor) < 1e-12) throw new Error('목표 도달 기대값을 계산할 수 없습니다.');
    for (let j = col; j <= n; j++) a[col][j] /= divisor;
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const scale = a[row][col];
      for (let j = col; j <= n; j++) a[row][j] -= scale * a[col][j];
    }
  }
  return a.map(row => row[n]);
}
export function starExpectation(s) {
  if (s.recovery === 'auto') return optimizeRecovery(s);
  validate(s);
  if (ITEMS.find(i=>i.id===s.item)?.special && s.start!==s.target) throw new Error('이 특수 무기는 강화·복구 규칙 확인이 필요합니다. 잠재능력 페이지에서 옵션 비용을 계산할 수 있습니다.');
  if (s.start === s.target) return { cost: 0, enhancement: 0, recovery: 0, attempts: 0, destroys: 0, spares: 0, rows: [], estimated: false };
  const low = reachableStars(s)[0];
  const count = s.target - low;
  const matrix = Array.from({ length: count }, () => Array(count).fill(0));
  const rewards = { enhancement: [], recovery: [], attempts: [], destroys: [], spares: [] };
  const rows = [];
  for (let star = low; star < s.target; star++) {
    const i = star - low;
    const rates = starRates(star, s);
    const unitCost = attemptCost(star, s);
    const restoreStar = Math.min(star,22);
    const recoveryMode = s.recoveryStages?.[star] ?? s.recovery;
    const spareCount = recoveryMode === 'reset' ? 1 : star <= 18 ? 1 : star <= 20 ? 2 : star === 21 ? 3 : 4;
    let fee = 0;
    if (rates.destroy > 0 && recoveryMode === 'preserve') {
      fee = recoveryBaseCost(s,restoreStar);
      finiteRange(fee, 0, 1e14, `${star}성 복구 비용`);
      if (s.recoveryDiscount) fee *= .8;
    }
    matrix[i][i] = 1 - rates.stay;
    if (i + 1 < count) matrix[i][i + 1] -= rates.success;
    if (rates.destroy > 0) matrix[i][(recoveryMode === 'reset' ? 12 : restoreStar) - low] -= rates.destroy;
    rewards.enhancement.push(unitCost);
    rewards.recovery.push(rates.destroy * (fee + spareCount * s.spare * 1e8));
    rewards.attempts.push(1);
    rewards.destroys.push(rates.destroy);
    rewards.spares.push(rates.destroy * spareCount);
    rows.push({ star, unitCost, ...rates, manual: s.costOverrides?.[star] !== undefined });
  }
  const solved = Object.fromEntries(Object.entries(rewards).map(([key,values])=>[key,linearSolve(matrix,values)]));
  const result = Object.fromEntries(Object.entries(solved).map(([key,values])=>[key,values[s.start-low]]));
  const costByStar = Object.fromEntries(solved.enhancement.map((value,i)=>[low+i,value+solved.recovery[i]]));
  costByStar[s.target]=0;
  return { ...result, cost: result.enhancement + result.recovery, costByStar, rows, estimated: rows.some(r => !r.manual) };
}
export function optimizeRecovery(s) {
  validate(s);
  const evaluationStart = Math.min(s.start,12);
  let policy = {};
  const states = Array.from({length:Math.max(0,s.target-evaluationStart)},(_,i)=>i+evaluationStart).filter(star=>starRates(star,s).destroy>0);
  for (const star of states) {
    const restoreStar=Math.min(star,22), fee=recoveryBaseCost(s,restoreStar);
    finiteRange(fee,0,1e14,`${restoreStar}성 복구 비용`);
  }
  for(let iteration=0;iteration<50;iteration++){
    const evaluated=starExpectation({...s,start:evaluationStart,recovery:'reset',recoveryStages:policy});
    const next={...policy};let changed=false;
    for(const star of states){
      const restoreStar=Math.min(star,22);
      const spares=star<=18?1:star<=20?2:star===21?3:4;
      const reset=s.spare*1e8+evaluated.costByStar[12];
      const preserve=spares*s.spare*1e8+recoveryBaseCost(s,restoreStar)*(s.recoveryDiscount ? .8 : 1)+evaluated.costByStar[restoreStar];
      const choice=preserve<reset-.01?'preserve':'reset';
      if(choice!==(policy[star]??'reset'))changed=true;
      next[star]=choice;
    }
    policy=next;
    if(!changed){
      const result=starExpectation({...s,recovery:'reset',recoveryStages:policy});
      return {...result,recoveryStages:policy};
    }
  }
  throw new Error('복구 최적화가 수렴하지 않았습니다. 입력 비용을 확인해주세요.');
}
export function reachableStars(s) {
  const forward = Array.from({length: Math.max(0, s.target - s.start)}, (_,i) => s.start + i);
  const canReset = (s.recovery === 'auto' || s.recovery === 'reset') && forward.some(star => starRates(star, s).destroy > 0);
  const low = canReset ? Math.min(12, s.start) : s.recovery === 'preserve' && forward.length ? Math.min(22,s.start) : s.start;
  return Array.from({length: Math.max(0, s.target - low)}, (_,i) => low + i);
}
export function calculate(s, data, mode = 'combined') {
  validate(s);
  const potential = mode === 'starforce' || s.stat === '' ? null : potentialExpectation(s, data);
  if (mode !== 'starforce' && s.additionalStat && !data.additional?.tables?.[`${s.part}-${s.level}`]) throw new Error('이 장비의 에디셔널 공식 확률표를 확보하지 못했습니다.');
  const additional = mode === 'starforce' || !s.additionalStat ? null : potentialExpectation(additionalSettings(s),data.additional,true);
  const starforce = mode === 'potential' || s.target === 0 ? null : starExpectation(s);
  return { potential, additional, starforce, purchase: s.purchase * 1e8,
    total: (potential?.cost || 0) + (additional?.cost || 0) + (starforce?.cost || 0) + s.purchase * 1e8 };
}
export function stageBreakdown(s) {
  validate(s);
  if (s.target === 0) return [];
  let previous = {cost:0, destroys:0, attempts:0};
  return Array.from({length:s.target-s.start}, (_,i) => {
    const target = s.start+i+1;
    const cumulative = starExpectation({...s,target});
    const row = {star:target-1, cost:cumulative.cost-previous.cost, cumulative:cumulative.cost,
      destroys:cumulative.destroys, attempts:cumulative.attempts};
    previous = cumulative;
    return row;
  });
}
