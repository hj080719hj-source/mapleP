import {gradeUpExpectation,potentialProbability,acceptsAnyMainStat,restriction} from './engine.js';

export const GRADES = ['rare','epic','unique','legendary'];
export const GRADE_NAMES = ['레어','에픽','유니크','레전드리'];
// Nexon: Guide/OtherProbability/cube/artisan. Gold cubes have no mesos-reroll pity.
export const GOLD_RATES = [.079994,.016959,.001996];
export const SILVER_RATES = [.047619,.011858];
export function lootProbability(lines,dropGoal,mesoGoal=0) {
  if(!Array.isArray(lines)||lines.length!==3)throw new Error('드메 확률표를 불러오지 못했습니다.');
  function visit(index,drop,meso,seen) {
    if(index===3)return drop>=dropGoal&&meso>=mesoGoal?1:0;
    const options=lines[index].filter(o=>{const r=restriction(o.name);return !r||(seen[r[0]]||0)<r[1];});
    const total=options.reduce((sum,o)=>sum+o.probability,0);
    if(!(total>0))throw new Error('드메 확률표가 올바르지 않습니다.');
    return options.reduce((sum,o)=>{
      const rule=restriction(o.name),next=rule?{...seen,[rule[0]]:(seen[rule[0]]||0)+1}:seen;
      const d=Number(o.name.match(/^아이템 드롭률 \+(\d+)%$/)?.[1]||0);
      const m=Number(o.name.match(/^메소 획득량 \+(\d+)%$/)?.[1]||0);
      return sum+o.probability/total*visit(index+1,drop+d,meso+m,next);
    },0);
  }
  return visit(0,0,0,{});
}
export function lootPresetExpectations(settings,data) {
  return [
    {label:'드롭률 20% 이상',stat:'드롭률',threshold:20},
    {label:'드롭률 40% 이상',stat:'드롭률',threshold:40},
    {label:'드롭률 20% + 메소 획득량 20% 이상',stat:'드메',threshold:20},
    {label:'메소 획득량 40% 이상',stat:'메소 획득량',threshold:40}
  ].map(preset=>({...preset,result:goldExpectation({...settings,...preset},data)}));
}
export function hasAttackPercent(lines) {
  return !!lines?.some(line=>line.some(o=>o.probability>0 && /^(공격력|마력) \+\d+%$/.test(o.name)));
}
export function statPresetExpectations(settings,data) {
  const presets=[27,30,33,36].map(threshold=>({label:`주스탯 ${threshold}% 이상`,stat:'주스탯',threshold}));
  // Preserve equipment-specific options alongside the automatic main-stat comparison.
  if(settings.part===6)presets.push(...[1,2,3,4,5,6].map(threshold=>({label:`쿨타임 감소 ${threshold}초 이상`,stat:'쿨타임 감소',threshold})));
  if(settings.part===11)presets.push(...[8,16,24].map(threshold=>({label:`크리티컬 데미지 ${threshold}% 이상`,stat:'크리티컬 데미지',threshold})));
  return presets.map(preset=>({...preset,result:goldExpectation({...settings,...preset,allowIed:false},data)}));
}
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
export function compareGradeUp({level=140,start='epic',target='legendary',miracle=true,cube='gold'}={}) {
  const from=GRADES.indexOf(start), to=GRADES.indexOf(target);
  if (![90,140,145,150,160,200].includes(level)) throw new Error('200제 이하 지원 장비를 선택해주세요.');
  if (from<0 || to<0 || from>to) throw new Error('목표 등급은 시작 등급 이상이어야 합니다.');
  if(!['gold','silver'].includes(cube))throw new Error('큐브를 선택해주세요.');
  if(cube==='silver'&&(from>2||to>2))throw new Error('실버 큐브는 유니크 등급까지만 사용할 수 있습니다.');
  const mesos=gradeUpExpectation(level,miracle,start).rows.slice(0,to-from);
  const rows=mesos.map((row,i)=>{
    const probability=(cube==='silver'?SILVER_RATES:GOLD_RATES)[from+i]*(miracle?2:1), attempts=1/probability;
    return {name:row.name,probability,attempts,mesosCost:row.cost};
  });
  const attempts=rows.reduce((a,r)=>a+r.attempts,0), mesosCost=rows.reduce((a,r)=>a+r.mesosCost,0);
  return {rows,attempts,mesosCost};
}

export function silverPresetExpectations(settings,data) {
  const {fee=null}=settings;
  if(fee!==null&&(!Number.isFinite(fee)||fee<0||fee>1e12))throw new Error('1회 사용 비용을 확인해주세요.');
  const upgrade=compareGradeUp({...settings,cube:'silver',target:'unique'});
  const lines=data?.tables?.[`${settings.part}-${settings.level}`];
  if(!lines)throw new Error('실버 큐브 확률표를 불러오지 못했습니다.');
  const rows=[];
  if(!settings.loot) {
    const stats=hasAttackPercent(lines)?['공격력','마력']:['주스탯'];
    for(const stat of stats)for(const threshold of [15,18,21,24,27]) {
      const any=acceptsAnyMainStat({...settings,stat});
      const probability=potentialProbability(lines,any?['STR','DEX','INT','LUK']:stat==='주스탯'?'STR':stat,threshold,true);
      if(probability<=0)continue;
      const optionAttempts=Math.max(0,1/probability-(upgrade.rows.length?1:0));
      const attempts=upgrade.attempts+optionAttempts;
      rows.push({label:`${stat} ${threshold}% 이상`,probability,optionAttempts,attempts,cost:fee===null?null:attempts*fee});
    }
  }
  return {upgrade,rows,cost:fee===null?null:upgrade.attempts*fee};
}

export function goldExpectation(settings,data) {
  const {stat='',threshold=27,fee=null}=settings;
  if(fee!==null && (!Number.isFinite(fee)||fee<0||fee>1e12)) throw new Error('1회 사용 비용을 확인해주세요.');
  const upgrade=compareGradeUp({...settings,target:stat?'legendary':settings.target});
  let probability=null, optionAttempts=0;
  if(stat) {
    if(!['주스탯','올스탯','공격력','마력','쿨타임 감소','크리티컬 데미지','드롭률','드메','메소 획득량'].includes(stat)||!Number.isFinite(threshold)||threshold<=0) throw new Error('목표 옵션을 확인해주세요.');
    const lines=data?.tables?.[`${settings.part}-${settings.level}`];
    const anyMainStat=acceptsAnyMainStat(settings);
    probability=stat==='메소 획득량'?lootProbability(lines,0,threshold):['드롭률','드메'].includes(stat)?lootProbability(lines,threshold,stat==='드메'?20:0):settings.item==='mitra' && settings.part===2 && settings.allowIed && ['공격력','마력'].includes(stat)
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
