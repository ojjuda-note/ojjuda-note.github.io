import {requireMember} from './member.mjs?v=3';
import {mountStation} from './load-station.mjs?v=letter1';
const entry=await requireMember();
if(entry && !entry.joined){
  const params=new URLSearchParams(location.search);
  const next=params.has('chat')?'chat':params.get('tab')||(params.get('view')==='radar'?'radar':'');
  if(['radar','inbox','chat','profile'].includes(next))location.replace('./?view=feed&next='+next);
  else location.replace(location.hash==='#answers'?'./?view=feed':'./');
}
if(entry?.joined)await mountStation();
