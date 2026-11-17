import {TEAMS,FINISH,position} from './rules.mjs?v=17';

export function roundStandings(pawns){
  const teams=pawns.map((pieces,team)=>({
    team,total:pieces.length,goals:pieces.filter(p=>position(p)===FINISH).length
  }));
  teams.sort((a,b)=>b.goals*a.total-a.goals*b.total);
  let previous;
  return teams.map((team,index)=>{
    const tied=previous&&team.goals*previous.total===previous.goals*team.total;
    previous={...team,rank:tied?previous.rank:index+1};
    return previous;
  });
}

let receipt;
function saveRound(round,won){
  if(receipt?.id!==round)receipt={id:round};
  const entry=receipt;
  if(entry.pending)return entry.pending;
  entry.pending=(async()=>{
    if(window.OjjudaAdminPreview?.isEnabled?.())return {ok:false,reason:'admin_preview'};
    const client=await window.OjjudaGetClient();
    const {data,error}=await client.auth.getSession();
    if(error)throw error;
    const user=data.session?.user;
    const member=user&&!user.is_anonymous?user.id:null;
    if('owner' in entry&&entry.owner!==member)return {ok:false,reason:'owner_changed'};
    entry.owner=member;
    const args={p_round:round,p_won:won};
    let result;
    if(member){
      const response=await client.rpc('record_yut_result',args).abortSignal(AbortSignal.timeout(10000));
      if(response.error)throw response.error;
      result=response.data;
    }else{
      result=await window.OjjudaGuestScores.yut(round,won);
    }
    if(result?.ok)window.dispatchEvent(new window.CustomEvent('ojjuda:game-record-saved',{detail:member?{owner:member}:{guest:true}}));
    return result;
  })().catch(()=>({ok:false,reason:'offline'})).then(result=>{
    if(!result?.ok)delete entry.pending;
    return result;
  });
  return entry.pending;
}

export function roundSummary(state,seat){
  const section=document.createElement('section');
  section.className='yut-round-summary';
  const heading=document.createElement('h3');heading.textContent='이번 판 순위';
  const list=document.createElement('ol');
  for(const {team,total,goals,rank} of roundStandings(state.pawns)){
    const row=document.createElement('li');
    const place=document.createElement('strong');place.textContent=rank+'위';
    const name=document.createElement('span');name.textContent=TEAMS[team].name+' 팀';
    const score=document.createElement('span');score.textContent='골인 '+goals+'/'+total;
    row.append(place,name,score);list.append(row);
  }
  section.append(heading,list);
  if(!state.roundId||seat<0||seat>=state.pawns.length)return section;
  const status=document.createElement('p');status.setAttribute('role','status');
  const retry=document.createElement('button');retry.type='button';retry.textContent='기록 다시 저장';
  async function submit(){
    retry.hidden=true;status.textContent='월간 기록 저장 중…';
    const result=await saveRound(state.roundId,state.winner===seat);
    if(result?.ok)status.textContent=TEAMS[seat].name+' 팀 '+(state.winner===seat?'승리':'패배')+' · 월간 기록 저장됨';
    else if(result?.reason==='admin_preview')status.textContent='';
    else if(['banned','owner_changed','request_conflict'].includes(result?.reason))status.textContent='이 플레이어의 월간 기록을 저장할 수 없어요.';
    else{status.textContent='월간 기록을 저장하지 못했어요.';retry.hidden=false;}
  }
  retry.onclick=submit;section.append(status,retry);void submit();
  return section;
}
