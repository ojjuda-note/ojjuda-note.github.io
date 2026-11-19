import {requireMember} from './member.mjs?v=20261119-guest-account1';
import {mountStation,prepareProgram} from './load-station.mjs?v=20261119-guest-account1';
import {enhanceGuestGate} from './entry-design.mjs?v=20261119-invite-referral1';
let program;
const station=await requireMember('state',db=>{
  program=prepareProgram(db);
  // A guest or a new participant can leave this branch before using the program.
  program.catch(()=>{});
});
if(!station)enhanceGuestGate();
const url=new URL(location.href);
if(url.searchParams.get('entry')==='agit' && station && !station.me?.body){
  location.replace('./');
}else if(station?.joined===false){
  const params=new URLSearchParams(location.search);
  const next=params.has('chat')?'chat':params.get('tab')||(params.get('view')==='radar'?'radar':'');
  if(['radar','inbox','chat','profile'].includes(next))location.replace('./?view=feed&next='+next);
  else location.replace(location.hash==='#answers'?'./?view=feed':'./');
}else if(station?.authenticated){
  if(url.searchParams.has('entry')){
    url.searchParams.delete('entry');
    history.replaceState(history.state,'',url);
  }
  await mountStation(undefined,station,program);
}
