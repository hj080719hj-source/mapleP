import {gradeUpExpectation,potentialProbability,acceptsAnyMainStat} from './engine.js';

export const GRADES = ['rare','epic','unique','legendary'];
export const GRADE_NAMES = ['레어','에픽','유니크','레전드리'];
// Nexon: Guide/OtherProbability/cube/artisan. Gold cubes have no mesos-reroll pity.
export const GOLD_RATES = [.079994,.016959,.001996];
export function compareGradeUp({level=140,start='epic',target='legendary',miracle=true}={}) {
  const from=GRADES.indexOf(start), to=GRADES.indexOf(target);
  if (![140,145,150,160,200].includes(level)) throw new Error('200제 이하 지원 장비를 선택해주세요.');
  if (from<0 || to<0 || from>to) throw new Error('목표 등급은 시작 등급 이상이어야 합니다.');
  const mesos=gradeUpExpectation(level,miracle,start).rows.slice(0,to-from);
  const rows=mesos.map((row,i)=>{
    const probability=GOLD_RATES[from+i]*(miracle?2:1), attempts=1/probability;
    return {name:row.name,probability,attempts,mesosCost:row.cost};
  });
  const attempts=rows.reduce((a,r)=>a+r.attempts,0), mesosCost=rows.reduce((a,r)=>a+r.mesosCost,0);
  return {rows,attempts,mesosCost};
}

export function goldExpectation(settings,data) {
  const {stat='',threshold=27,fee=null}=settings;
  if(fee!==null && (!Number.isFinite(fee)||fee<0||fee>1e12)) throw new Error('1회 사용 비용을 확인해주세요.');
  const upgrade=compareGradeUp({...settings,target:stat?'legendary':settings.target});
  let probability=null, optionAttempts=0;
  if(stat) {
    if(!['주스탯','올스탯','공격력','마력','쿨타임 감소','크리티컬 데미지'].includes(stat)||!Number.isFinite(threshold)||threshold<=0) throw new Error('목표 옵션을 확인해주세요.');
    const lines=data?.tables?.[`${settings.part}-${settings.level}`];
    const anyMainStat=acceptsAnyMainStat(settings);
    probability=potentialProbability(lines,anyMainStat?['STR','DEX','INT','LUK']:stat==='주스탯'?'STR':stat,threshold,true);
    if(probability<=0) throw new Error('이 장비에서는 선택한 목표 옵션이 등장하지 않습니다.');
    // Promotion produces the first legendary roll; do not charge it twice.
    optionAttempts=Math.max(0,1/probability-(upgrade.rows.length?1:0));
  }
  const attempts=upgrade.attempts+optionAttempts;
  return {upgrade,probability,optionAttempts,attempts,cost:fee===null?null:attempts*fee};
}
