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
  const expected=verifiedUser;
  if(!expected)return false;
  const {data,error}=await db.auth.getSession();
  return !error && verifiedUser===expected && data.session?.user?.id===expected && !data.session.user.is_anonymous;
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
  const title=document.createElement('strong'),line=document.createElement('p');
  title.textContent='파장 · 회원 전용 소개팅';
  line.textContent=message;
  gate.replaceChildren(title,line);
  if(login){
    const account=document.createElement('div'),actions=document.createElement('div');
    account.className='ojjuda-guest-account';account.dataset.guestAccount='pajang';
    account.setAttribute('role','group');account.setAttribute('aria-label','회원가입 및 로그인');
    actions.className='ojjuda-guest-account-actions';
    for(const [mode,label] of [['signup','회원가입'],['login','로그인']]){
      const link=document.createElement('a');
      link.className='ojjuda-guest-account-'+mode;
      link.href='/?auth='+mode+'&next=pajang';link.target='_top';link.textContent=label;
      actions.append(link);
    }
    account.append(actions);gate.append(account);
  }else{
    const link=document.createElement('a');
    link.href='/features/pajang/';link.target='_top';link.textContent='파장 처음으로';
    gate.append(link);
  }
}
function accountData({data,error}) {
  if (error && (!error.status || error.status >= 500 || error.status === 408 || error.status === 429)) throw error;
  return error ? null : data;
}

export async function requireMember(action='entry',onSession,onResult) {
  verifiedUser=undefined;
  try {
    const db=await client();
    const session=accountData(await db.auth.getSession())?.session;
    if(!session?.user||session.user.is_anonymous){
      showGate('만 19세 이상 회원만 이용할 수 있어요. 로그인해 주세요.',true);return;
    }
    const expected=session.user.id;
    if(typeof action==='function')action=action(expected);
    let changed=false;
    const {data:{subscription}}=db.auth.onAuthStateChange((_event,current)=>{
      if(!current||current.user?.id!==expected||current.user.is_anonymous){
        changed=true;verifiedUser=undefined;
        rememberRound(expected,false);
        showGate('회원 정보를 다시 확인하고 있어요.');
        if(!current)(window.top||window).location.replace('/features/pajang/');
        else location.reload();
      }
    });
    window.addEventListener('pagehide',event=>{
      changed=true;verifiedUser=undefined;subscription.unsubscribe();
      if(event.persisted)showGate('회원 정보를 다시 확인하고 있어요.');
    },{once:true});
    window.addEventListener('pageshow',e=>{if(e.persisted)location.reload();});
    const [identity,result]=await Promise.all([
      db.auth.getUser(),db.rpc('pajang_member',{p_action:action,p_data:{}})
    ]);
    if(changed)return;
    const user=accountData(identity)?.user;
    if(!user||user.is_anonymous||user.id!==expected){
      showGate('회원 정보를 다시 확인해 주세요.',true);return;
    }
    if(result.error){
      if(action==='state' && result.error.code==='42501' && result.error.message==='먼저 파장에 참여해 주세요.'){
        const entry=await db.rpc('pajang_member',{p_action:'entry',p_data:{}});
        if(changed)return;
        if(entry.error||!entry.data)throw entry.error||Error('missing_member_response');
        verifiedUser=user.id;
        rememberRound(user.id,false);
        return {joined:false};
      }
      throw result.error;
    }
    if(!result.data)throw Error('missing_member_response');
    verifiedUser=user.id;
    onSession?.(db);
    onResult?.(result.data);
    rememberRound(user.id,action==='state'?result.data?.me?.body:result.data?.body,result.data?.nextAt);
    if(changed)return;
    return result.data;
  }catch(e){
    showGate(e.code==='42501'?'이 계정은 파장을 이용할 수 없어요. 만 19세 이상 회원 전용이에요.':'회원 정보를 확인하지 못했어요. 잠시 후 다시 열어주세요.');
  }
}
