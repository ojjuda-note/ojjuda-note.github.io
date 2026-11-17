export const client = () => window.OjjudaGetClient();
export async function call(action, data = {}) {
  const db = await client();
  const result = await db.rpc('pajang_member',{p_action:action,p_data:data});
  if(result.error) throw Object.assign(new Error(result.error.message),{code:result.error.code});
  return result.data;
}
export function showGate(message,login = false) {
  const gate=document.getElementById('gate');
  for(const id of ['welcome','station']){const area=document.getElementById(id);if(area)area.hidden=true;}
  gate.hidden=false;
  const title=document.createElement('strong'),line=document.createElement('p'),link=document.createElement('a');
  title.textContent='파장 · 회원 전용 소개팅';
  line.textContent=message;
  link.href=login?'/?auth=login&next=pajang':'/world.html';link.target='_top';
  link.textContent=login?'오쭈다 로그인하기':'아지트로 돌아가기';
  gate.replaceChildren(title,line,link);
}
export async function requireMember() {
  try {
    const db=await client();
    // The existing session is shared across Ojjuda pages. The RPC independently checks the caller.
    const {data:{user}}=await db.auth.getUser();
    if(!user||user.is_anonymous){showGate('로그인한 오쭈다 회원만 이용할 수 있어요.',true);return;}
    const {data:{subscription}}=db.auth.onAuthStateChange((_event,session)=>{
      if(!session||session.user?.id!==user.id)location.reload();
    });
    window.addEventListener('pagehide',()=>subscription.unsubscribe(),{once:true});
    const entry=await call('entry');
    window.addEventListener('pageshow',e=>{if(e.persisted)location.reload();});
    return entry;
  }catch(e){showGate(e.code==='42501'?'이 계정은 파장을 이용할 수 없어요. 만 19세 이상 회원 전용이에요.':'회원 정보를 확인하지 못했어요. 잠시 후 다시 열어주세요.');}
}
