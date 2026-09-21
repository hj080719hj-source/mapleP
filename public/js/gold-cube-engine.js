import {gradeUpExpectation} from './engine.js';

export const GRADES = ['rare','epic','unique','legendary'];
export const GRADE_NAMES = ['레어','에픽','유니크','레전드리'];
// Nexon: Guide/OtherProbability/cube/artisan. Gold cubes have no mesos-reroll pity.
export const GOLD_RATES = [.079994,.016959,.001996];
export function compareGradeUp({level=140,start='epic',target='legendary',miracle=true}={}) {
  const from=GRADES.indexOf(start), to=GRADES.indexOf(target);
  if (![140,145,150,160].includes(level)) throw new Error('200제 미만 지원 장비를 선택해주세요.');
  if (from<0 || to<0 || from>=to) throw new Error('목표 등급은 시작 등급보다 높아야 합니다.');
  const mesos=gradeUpExpectation(level,miracle,start).rows.slice(0,to-from);
  // Community appraisal formula for supported levels (140–160), not an official cost table.
  // https://gall.dcinside.com/board/view/?id=maplestory&no=9329337
  const appraisalFee=level*level*20;
  const rows=mesos.map((row,i)=>{
    const probability=GOLD_RATES[from+i]*(miracle?2:1), attempts=1/probability;
    return {name:row.name,probability,attempts,appraisalCost:attempts*appraisalFee,mesosCost:row.cost};
  });
  const attempts=rows.reduce((a,r)=>a+r.attempts,0), mesosCost=rows.reduce((a,r)=>a+r.mesosCost,0);
  const appraisalCost=attempts*appraisalFee;
  return {rows,attempts,mesosCost,appraisalFee,appraisalCost,savings:mesosCost-appraisalCost};
}
