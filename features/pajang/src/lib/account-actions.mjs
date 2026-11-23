import '../../../account/account-deletion.js';
import {client} from '../../member.mjs';

export async function openAccount(withNickname=false,onChange=()=>{}) {
  const db=await client();
  const {data,error}=await db.auth.getSession();
  if(error)throw error;
  const user=data?.session?.user;
  if(!user?.id||user.is_anonymous)throw Error('account_changed');
  const userId=user.id;
  let active=true,currentUserId=userId,leaving=false,invalidated=false;
  const {data:{subscription}}=db.auth.onAuthStateChange((_event,session)=>{
    currentUserId=session?.user?.is_anonymous?null:session?.user?.id??null;
    if(currentUserId!==userId&&!(leaving&&currentUserId===null)){
      invalidated=true;
      if(active)onChange();
    }
  });
  const account={db,userId,nickname:'',
    isCurrent:()=>active&&!invalidated&&currentUserId===userId,
    mayLeave:()=>active&&!invalidated&&(currentUserId===userId||currentUserId===null),
    startLeaving:()=>{leaving=true;},
    dispose:()=>{active=false;subscription.unsubscribe();}
  };
  try{
    if(withNickname){
      const result=await db.from('profiles').select('nickname').eq('id',userId).maybeSingle();
      if(result.error)throw result.error;
      if(!result.data?.nickname)throw Error('profile_unavailable');
      account.nickname=result.data.nickname;
    }
    if(!account.isCurrent())throw Error('account_changed');
    return account;
  }catch(error){account.dispose();throw error;}
}

function check(account){if(!account.isCurrent())throw Error('account_changed');}

export async function leaveAccount(account,withdraw=false) {
  check(account);
  const {data,error}=await account.db.auth.getSession();
  check(account);
  if(error)throw error;
  const session=data?.session;
  if(session?.user?.id!==account.userId||session.user.is_anonymous)throw Error('account_changed');
  if(withdraw){
    if(!session.access_token)throw Error('account_changed');
    const verified=await account.db.auth.getUser(session.access_token);
    check(account);
    if(verified.error)throw verified.error;
    if(verified.data?.user?.id!==account.userId||verified.data.user.is_anonymous)throw Error('account_changed');
    const config=window.OJJUDA_CONFIG;
    // Keep every deletion request bound to the account that confirmed the dialog.
    const owner=window.supabase.createClient(config.supabaseUrl,config.supabaseKey,{
      global:{headers:{Authorization:`Bearer ${session.access_token}`}},
      auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false,
        storageKey:`ojjuda-delete-${account.userId}-${crypto.randomUUID()}`}
    });
    if(!window.OjjudaAccountDeletion)throw Error('deletion_module_unavailable');
    await window.OjjudaAccountDeletion.run({client:owner,userId:account.userId,isCurrent:account.isCurrent});
    check(account);
    try{
      localStorage.removeItem(`ojjuda-note-composer-settings-v1:${account.userId}`);
      localStorage.removeItem('ojjuda-world-v1');
    }catch{/* Account deletion does not depend on local cache availability. */}
  }
  check(account);
  account.startLeaving();
  try{
    const result=await account.db.auth.signOut({scope:'local'});
    if(result.error)throw result.error;
  }catch(error){if(!withdraw)throw error;}
  if(!account.mayLeave())throw Error('account_changed');
  try{sessionStorage.removeItem('pajang:answered-round');}catch{/* Storage is optional. */}
  (window.top||window).location.replace('/features/pajang/');
}

export function accountError(error,withdraw=false) {
  if(error?.message==='account_changed')return '계정이 바뀌었어요. 창을 닫고 현재 계정으로 다시 시도해 주세요.';
  if(error?.message==='profile_unavailable')return '회원 닉네임을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.';
  if(withdraw)return window.OjjudaAccountDeletion?.message(error)||'탈퇴를 마치지 못했어요. 잠시 후 다시 시도해 주세요.';
  return '로그아웃하지 못했어요. 연결을 확인하고 다시 시도해 주세요.';
}
