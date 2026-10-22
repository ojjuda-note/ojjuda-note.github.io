(() => {
  'use strict';
  const listeners=new Set();
  const state={ready:false,userId:null,coins:null,error:null,canViewAnswers:false};
  const ownerUserId='22188825-167a-488b-8914-1b6ecc5ea717';
  // This is the public browser key already used by Ojjuda World, never a secret.
  const client=window.supabase?.createClient('https://ziezbdjofcugznowiuda.supabase.co','sb_publishable_iUpPUBr2HlJr9LhDRVtB0Q_toJUMazo',{
    auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}
  });
  const emit=()=>listeners.forEach(fn=>fn({...state}));
  let revision=0;
  async function checkAnswerAccess(userId){
    if(userId!==ownerUserId)return false;
    const {data:identity,error:identityError}=await client.auth.getUser();
    if(identityError||identity.user?.id!==ownerUserId)return false;
    const {data,error}=await client.rpc('is_admin').abortSignal(AbortSignal.timeout(10000));
    return !error&&data===true;
  }
  async function sync(session){
    const rev=++revision;
    state.userId=session?.user?.id||null;state.coins=null;state.error=null;state.canViewAnswers=false;state.ready=true;emit();
    if(!state.userId)return;
    const [balance,canViewAnswers]=await Promise.all([
      client.from('user_private').select('coins').eq('user_id',state.userId).maybeSingle(),
      checkAnswerAccess(state.userId).catch(()=>false)
    ]);
    if(rev!==revision)return;
    const {data,error}=balance;state.canViewAnswers=canViewAnswers;
    if(error||!data||!Number.isInteger(data.coins))state.error='잔액을 불러오지 못했어요. 다시 확인해 주세요.';
    else state.coins=data.coins;
    emit();
  }
  async function refresh(){
    if(!client){state.ready=true;state.error='로그인 연결을 불러오지 못했어요.';emit();return;}
    const {data,error}=await client.auth.getSession();
    if(error){state.ready=true;state.error='로그인 연결을 확인해 주세요.';emit();return;}
    await sync(data.session);
  }
  window.JjudaWallet={
    getState:()=>({...state}),
    subscribe(fn){listeners.add(fn);fn({...state});return()=>listeners.delete(fn);},
    refresh,
    async recordScore(owner,score){
      if(!Number.isInteger(score)||score<0||score>6)throw new Error('잘못된 점수예요.');
      for(let attempt=0;attempt<2;attempt++){
        if(!client||!owner||state.userId!==owner)throw new Error('게임을 시작한 계정으로 로그인해 주세요.');
        const {data,error}=await client.rpc('submit_score',{p_game:'spot',p_score:score}).abortSignal(AbortSignal.timeout(12000));
        if(error)throw error;
        if(data?.ok)return data;
        if(data?.reason!=='too_fast'||attempt)throw new Error('점수를 저장하지 못했어요.');
        await new Promise(resolve=>setTimeout(resolve,5100));
      }
    },
    async signIn(email,password){
      if(!client)throw new Error('로그인 연결을 불러오지 못했어요.');
      const {data,error}=await client.auth.signInWithPassword({email,password});
      if(error)throw new Error(error.code==='invalid_credentials'?'이메일과 비밀번호를 확인해 주세요.':'로그인하지 못했어요. 계정과 인터넷 연결을 확인해 주세요.');
      await sync(data.session);
    },
    async signOut(){
      if(!client)return;
      const {error}=await client.auth.signOut({scope:'local'});if(error)throw error;
      await sync(null);
    },
    async buy(request,stage){
      if(!client||!state.userId||state.userId!==request.userId)throw new Error('구매를 시작한 계정으로 로그인해 주세요.');
      const buyer=state.userId;
      const {data,error}=await client.rpc('spot_game_buy_v2',{
        p_kind:request.kind,p_request_id:request.requestId,p_stage:stage,p_spot:request.spot,p_verify_only:false
      }).abortSignal(AbortSignal.timeout(12000));
      if(error)throw new Error('연결을 확인한 뒤 구매 확인을 다시 눌러주세요. 중복으로 차감되지 않아요.');
      if(!data||typeof data.ok!=='boolean')throw new Error('구매 결과를 다시 확인해 주세요.');
      if(buyer===state.userId&&Number.isInteger(data.coins)){state.coins=data.coins;state.error=null;emit();}
      return data;
    }
  };
  if(client)client.auth.onAuthStateChange((_event,session)=>{setTimeout(()=>{sync(session).catch(()=>{state.error='잔액을 다시 확인해 주세요.';emit();});},0);});
  refresh().catch(()=>{state.ready=true;state.error='인터넷 연결을 확인해 주세요.';emit();});
})();
