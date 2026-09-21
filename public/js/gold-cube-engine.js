import {gradeUpExpectation} from './engine.js';

export const GRADES = ['rare','epic','unique','legendary'];
export const GRADE_NAMES = ['레어','에픽','유니크','레전드리'];
// Nexon: Guide/OtherProbability/cube/artisan. Gold cubes have no mesos-reroll pity.
export const GOLD_RATES = [.079994,.016959,.001996];
export function compareGradeUp({level=140,start='epic',target='legendary',miracle=true,price=null,fee=0}={}) {
  const from=GRADES.indexOf(start), to=GRADES.indexOf(target);
  if (![140,145,150,160].includes(level)) throw new Error('200제 미만 지원 장비를 선택해주세요.');
  if (from<0 || to<0 || from>=to) throw new Error('목표 등급은 시작 등급보다 높아야 합니다.');
  if ((price!==null && (!Number.isFinite(price)||price<0||price>1e12)) || !Number.isFinite(fee)||fee<0||fee>1e12) throw new Error('가격을 올바르게 입력해주세요.');
  const mesos=gradeUpExpectation(level,miracle,start).rows.slice(0,to-from);
  const rows=mesos.map((row,i)=>{
    const probability=GOLD_RATES[from+i]*(miracle?2:1), attempts=1/probability;
    return {name:row.name,probability,attempts,cost:price===null?null:attempts*(price+fee),mesosCost:row.cost};
  });
  const attempts=rows.reduce((a,r)=>a+r.attempts,0), mesosCost=rows.reduce((a,r)=>a+r.mesosCost,0);
  return {rows,attempts,cost:price===null?null:attempts*(price+fee),mesosCost,breakEven:mesosCost/attempts-fee};
}
