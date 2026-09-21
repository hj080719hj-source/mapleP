import {gradeUpExpectation,potentialProbability,acceptsAnyMainStat} from './engine.js';

export const GRADES = ['rare','epic','unique','legendary'];
export const GRADE_NAMES = ['레어','에픽','유니크','레전드리'];
// Nexon: Guide/OtherProbability/cube/artisan. Gold cubes have no mesos-reroll pity.
export const GOLD_RATES = [.079994,.016959,.001996];
export function mitraCombinationProbability(lines,stat,threeLineThreshold,twoLineThreshold) {
  if(!['공격력','마력'].includes(stat)||!Array.isArray(lines)||lines.length!==3||![18,21,24].includes(twoLineThreshold)) throw new Error('미트라 유효 옵션 조건을 확인해주세요.');
  // All successful outcomes contain only attack/magic and IED: none of the
  // official restricted option families can occur along these paths.
  const choices=lines.map(line=>{
    const total=line.reduce((sum,o)=>sum+o.probability,0);
    if(!(total>0))throw new Error('잠재 확률표가 올바르지 않습니다.');
    return line.flatMap(o=>{
      const attack=o.name.startsWith(`${stat} +`) && o.name.match(/\+(\d+)%$/);
      if(attack)return [{attack:Number(attack[1]),ied:0,p:o.probability/total}];
      if(/^몬스터 방어율 무시 \+\d+%$/.test(o.name))return [{attack:0,ied:1,p:o.probability/total}];
      return [];
    });
  });
  let probability=0;
  for(const a of choices[0])for(const b of choices[1])for(const c of choices[2]) {
    const ied=a.ied+b.ied+c.ied, attack=a.attack+b.attack+c.attack;
    if((ied===0&&attack>=threeLineThreshold)||(ied===1&&attack>=twoLineThreshold))probability+=a.p*b.p*c.p;
  }
  return probability;
}
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
    probability=settings.item==='mitra' && settings.part===2 && settings.allowIed && ['공격력','마력'].includes(stat)
      ?mitraCombinationProbability(lines,stat,settings.iedOnly?Infinity:threshold,settings.twoLineThreshold??21)
      :potentialProbability(lines,anyMainStat?['STR','DEX','INT','LUK']:stat==='주스탯'?'STR':stat,threshold,true);
    if(probability<=0) throw new Error('이 장비에서는 선택한 목표 옵션이 등장하지 않습니다.');
    // Promotion produces the first legendary roll; do not charge it twice.
    optionAttempts=Math.max(0,1/probability-(upgrade.rows.length?1:0));
  }
  const attempts=upgrade.attempts+optionAttempts;
  return {upgrade,probability,optionAttempts,attempts,cost:fee===null?null:attempts*fee};
}

export function mitraPresetExpectations(settings,data) {
  return [
    {label:'공/마 30%',threshold:30,allowIed:false},
    {label:'공/마 21% + 방무',threshold:30,allowIed:true,iedOnly:true,twoLineThreshold:21},
    {label:'공/마 18% + 방무',threshold:30,allowIed:true,iedOnly:true,twoLineThreshold:18}
  ].map(preset=>({label:preset.label,attack:goldExpectation({...settings,...preset,item:'mitra',level:200,part:2,stat:'공격력'},data),magic:goldExpectation({...settings,...preset,item:'mitra',level:200,part:2,stat:'마력'},data)}));
}
