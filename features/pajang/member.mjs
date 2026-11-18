import {prepareLocation} from './location.mjs?v=location4';
let verifiedUser;
const resumeKey='pajang:answered-round';
export function answeredRound(){
  try{
    const hint=JSON.parse(sessionStorage.getItem(resumeKey));
    if(hint?.until>Date.now()&&typeof hint.user==='string')return hint.user;
  }catch{/* Storage is optional. */}
}
function rememberRound(user,answered,nextAt){
  try{
    if(answered)sessionStorage.setItem(resumeKey,JSON.stringify({user,until:Date.parse(nextAt)}));
    else sessionStorage.removeItem(resumeKey);
  }catch{/* Routing still works with storage disabled. */}
}
export async function sameMember(db) {
  const {data,error}=await db.auth.getSession();
  return !error && !!verifiedUser && data.session?.user?.id===verifiedUser && !data.session.user.is_anonymous;
}
export function client(){
  // The Agit entry frame and its host share the same signed-in client.
  if(window.parent!==window && location.search.includes('embed=1')){
    try{
      const host=window.parent;
      if(host.location.origin===location.origin && host.location.pathname==='/world.html' &&
         window.frameElement?.closest('dialog.agit-pajang-dialog') && host.OjjudaGetClient){
        return host.OjjudaGetClient();
      }
    }catch{/* A standalone or cross-origin embed uses its own client. */}
  }
  return window.OjjudaGetClient();
}
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
export async function requireMember(action='entry',onSession) {
  try {
    const db=await client();
    const {data:{session}}=await db.auth.getSession();
    if(!session?.user||session.user.is_anonymous){
      showGate('로그인한 오쭈다 회원만 이용할 수 있어요.',true);return;
    }
    const expected=session.user.id;
    let changed=false;
    const {data:{subscription}}=db.auth.onAuthStateChange((_event,current)=>{
      if(!current||current.user?.id!==expected||current.user.is_anonymous){
        changed=true;verifiedUser=undefined;
        showGate('회원 정보를 다시 확인하고 있어요.');location.reload();
      }
    });
    window.addEventListener('pagehide',()=>subscription.unsubscribe(),{once:true});
    window.addEventListener('pageshow',e=>{if(e.persisted)location.reload();});
    onSession?.(db);
    const [identity,result]=await Promise.all([
      db.auth.getUser(),db.rpc('pajang_member',{p_action:action,p_data:{}})
    ]);
    if(changed)return;
    const user=identity.data?.user;
    if(identity.error||!user||user.is_anonymous||user.id!==expected){
      showGate('회원 정보를 다시 확인해 주세요.',true);return;
    }
    verifiedUser=user.id;
    if(result.error){
      if(action==='state' && result.error.code==='42501' && result.error.message==='먼저 파장에 참여해 주세요.'){
        return {joined:false};
      }
      throw result.error;
    }
    rememberRound(user.id,action==='state'?result.data?.me?.body:result.data?.body,result.data?.nextAt);
    const state=await prepareLocation(result.data,db,user.id);
    if(changed)return;
    return state;
  }catch(e){showGate(e.code==='42501'?'이 계정은 파장을 이용할 수 없어요. 만 19세 이상 회원 전용이에요.':'회원 정보를 확인하지 못했어요. 잠시 후 다시 열어주세요.');}
}
