/* Game-result metadata is shown only when the published rank row supports it. */
(()=>{
 'use strict';
 const count=(value,min,max)=>{
  const n=Number(value);
  return Number.isInteger(n)&&n>=min&&n<=max?n:null;
 };
 const nfmt=value=>Number(value).toLocaleString('ko-KR');
 const difficulties=Object.freeze({
  easy:'쉬움',normal:'보통',hard:'어려움',
  hard_exact:'어려움',pro:'프로',master:'마스터',grandmaster:'그랜드마스터',
  online:'온라인 대전'
 });
 const billiards=Object.freeze({carom4:'4구',carom3:'3쿠션',pool8:'포켓볼'});
 const matchSize=(row,min,max)=>{
  // There is no inferred size: only a positive server-reported participant count qualifies.
  return count(row?.players??row?.player_count,min,max);
 };
 function describe(id,row){
  if(!row||typeof row!=='object'||!(Number(row.score)>0))return '';
  const parts=[];
  if(id==='sacheonseong'||id==='archery'){
   const stage=count(row.stage,1,220);
   if(stage)parts.push(nfmt(stage)+'단계');
  }else if(id==='solitaire'){
   const name=window.OjjudaSolitaireRules?.record?.(Number(row.score))?.name;
   if(name)parts.push(name);
  }else if(id==='mines'){
   const name=window.OjjudaMinesRules?.record?.(Number(row.score))?.name;
   if(name)parts.push(name);
  }else if(id==='mole'){
   const grid=window.OjjudaMoleRanking?.rankingRecord?.(row.score)?.grid;
   if(count(grid,3,6))parts.push(grid+'×'+grid+' 구멍');
  }else if(id==='tank'){
   const opponents=count(row.opponents,1,11);
   if(opponents)parts.push((opponents+1)+'인 경기 · 상대 '+opponents+'명');
  }else if(id==='onecard'){
   // Every completed One Card round uses five seats (humans plus computer fill-ins).
   parts.push('5인 경기 · 컴퓨터 포함');
   if(row.mode==='solo')parts.push('컴퓨터 대전');
   else if(row.mode==='online')parts.push('온라인 대전');
  }else if(id==='janggi'||id==='chess'||id==='billiards'){
   if(id==='billiards'&&billiards[row.variant])parts.push(billiards[row.variant]);
   parts.push('2인 대국');
   let difficulty=difficulties[row.difficulty];
   // Historical Janggi "hard" includes a legacy combined tier.
   if(id==='janggi'&&row.difficulty==='hard')difficulty='기존 통합';
   if(difficulty)parts.push(difficulty);
  }else if(id==='ttang'||id==='matgo'){
   parts.push('2인 경기');
  }else if(['yut','tour','bang','poker'].includes(id)){
   const limits={yut:[2,8],tour:[2,8],bang:[4,7],poker:[2,4]}[id];
   const players=matchSize(row,...limits);
   parts.push(players?(id==='yut'?players+'팀 경기':players+'인 경기'):'참가 인원 미기록');
   if(id==='yut'){
    if(row.mode==='easy')parts.push('쉬운 놀이');
    else if(row.mode==='island')parts.push('보통 · 장애물 놀이');
   }else if(id==='poker'&&['normal','easy'].includes(row.difficulty)){
    parts.push(difficulties[row.difficulty]);
   }
  }
  return parts.join(' · ');
 }
 window.OjjudaRankingDetails=Object.freeze({describe});
})();
