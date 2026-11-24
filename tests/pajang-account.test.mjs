import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import test from 'node:test';
import {openAccount,leaveAccount,accountError} from '../features/pajang/src/lib/account-actions.mjs';
import {watchAdminAccess} from '../features/pajang/src/lib/admin-access.mjs';

const cleanup=createRequire(import.meta.url)('../features/account/account-deletion.js');
const owner='00000000-0000-4000-8000-000000000001';
const other='00000000-0000-4000-8000-000000000002';
const originalToken='confirmed-member-token';
const ownSession=(id=owner,token=originalToken)=>({user:{id,is_anonymous:false},access_token:token});

// The real account actions and shared deletion module run against this in-memory
// Auth/Storage/RPC boundary. No request can reach an actual member account.
function fixture(t,{files=[],nickname='실제 회원 닉네임',session=ownSession()}={}){
  const state={session,nickname,files:files.map(file=>({...file})),calls:[],clients:[],
    redirects:[],removedLocal:[],removedSession:[],deleted:false,changes:0,
    listeners:new Set(),hook:null,signOutError:null,profileError:null,sessionError:null,
    verifiedError:null,verifiedUser:undefined,failBucket:null};
  async function step(name){if(state.hook)await state.hook(name);}
  function setSession(value,event='SIGNED_IN'){
    state.session=value;
    for(const listener of state.listeners)listener(event,value);
  }
  const fixedClient={
    async rpc(name,args){
      state.calls.push({kind:'rpc',name,args});
      assert.equal(args.p_expected_user_id,owner,'each deletion RPC remains bound to the confirmed account');
      let data=null;
      if(name==='my_account_deletion_files')data=state.files.slice(0,args.p_limit).map(file=>({...file}));
      if(name==='delete_my_account'){
        assert.equal(state.files.length,0,'the account must survive until all files are removed');
        state.deleted=true;
      }
      await step(name);
      return {data,error:null};
    },
    storage:{from(bucket){return {async remove(paths){
      state.calls.push({kind:'remove',bucket,paths:[...paths]});
      if(state.failBucket===bucket)return {error:Error('storage_unavailable')};
      state.files=state.files.filter(file=>file.bucket_id!==bucket||!paths.includes(file.photo_path));
      await step('remove');
      return {data:[],error:null};
    }};}}
  };
  const db={
    auth:{
      async getSession(){
        state.calls.push({kind:'getSession'});
        const current=state.session;
        await step('getSession');
        return {data:{session:current},error:state.sessionError};
      },
      onAuthStateChange(listener){
        state.listeners.add(listener);
        return {data:{subscription:{unsubscribe(){state.listeners.delete(listener);}}}};
      },
      async getUser(token){
        state.calls.push({kind:'getUser',token});
        await step('getUser');
        return {data:{user:state.verifiedUser??{id:owner,is_anonymous:false}},error:state.verifiedError};
      },
      async signOut(options){
        state.calls.push({kind:'signOut',options});
        await step('signOut');
        if(state.signOutError)return {error:state.signOutError};
        setSession(null,'SIGNED_OUT');
        await step('signedOut');
        return {error:null};
      }
    },
    from(table){
      return {select(columns){
        return {eq(column,id){
          return {async maybeSingle(){
            state.calls.push({kind:'profile',table,columns,column,id});
            await step('profile');
            return {data:state.nickname?{nickname:state.nickname}:null,error:state.profileError};
          }};
        }};
      }};
    },
    rpc(){throw Error('Deletion must never use the mutable shared client');}
  };
  const window={
    OjjudaGetClient:async()=>db,
    OjjudaAccountDeletion:cleanup,
    OJJUDA_CONFIG:{supabaseUrl:'https://accounts.invalid',supabaseKey:'mock-publishable'},
    supabase:{createClient(url,key,options){
      state.clients.push({url,key,options});
      return fixedClient;
    }},
    location:{replace(url){state.redirects.push(url);}}
  };
  window.parent=window;window.top=window;
  const globals={window,
    localStorage:{removeItem(key){state.removedLocal.push(key);}},
    sessionStorage:{removeItem(key){state.removedSession.push(key);}}
  };
  for(const [key,value] of Object.entries(globals)){
    const descriptor=Object.getOwnPropertyDescriptor(globalThis,key);
    Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});
    t.after(()=>{if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];});
  }
  return {state,setSession,open:withNickname=>openAccount(withNickname,()=>state.changes++)};
}

const mutations=state=>state.calls.filter(call=>['rpc','remove','signOut'].includes(call.kind));
const mediaPhoto={bucket_id:'media',photo_path:`${owner}/profile.jpg`};
const parkPhoto={bucket_id:'note-card-photos',photo_path:`${owner}/card.jpg`};

test('opening and cancelling uses the real account nickname without changing any data',async t=>{
  const f=fixture(t),account=await f.open(true);
  assert.equal(account.nickname,'실제 회원 닉네임');
  assert.deepEqual(f.state.calls.find(call=>call.kind==='profile'),{
    kind:'profile',table:'profiles',columns:'nickname',column:'id',id:owner
  });
  assert.deepEqual(mutations(f.state),[]);
  account.dispose();
  assert.equal(f.state.listeners.size,0);
  await assert.rejects(leaveAccount(account,true),/account_changed/);
  assert.deepEqual(mutations(f.state),[]);
  assert.deepEqual(f.state.removedLocal,[]);
  assert.deepEqual(f.state.redirects,[]);
});

test('a failed profile read releases its listener and can be retried',async t=>{
  const f=fixture(t,{nickname:''});
  await assert.rejects(f.open(true),/profile_unavailable/);
  assert.equal(f.state.listeners.size,0);
  assert.deepEqual(mutations(f.state),[]);
  f.state.nickname='다시 확인한 닉네임';
  const account=await f.open(true);
  assert.equal(account.nickname,'다시 확인한 닉네임');
  account.dispose();
});

test('logout affects only the local session and returns to the Pajang entrance',async t=>{
  const f=fixture(t),account=await f.open(false);
  await leaveAccount(account);
  assert.deepEqual(mutations(f.state),[{kind:'signOut',options:{scope:'local'}}]);
  assert.equal(f.state.calls.some(call=>call.kind==='profile'||call.kind==='getUser'),false);
  assert.equal(f.state.clients.length,0);
  assert.equal(f.state.changes,0,'an expected signout is not reported as another account');
  assert.deepEqual(f.state.removedLocal,[]);
  assert.deepEqual(f.state.removedSession,['pajang:answered-round']);
  assert.deepEqual(f.state.redirects,['/features/pajang/']);
  account.dispose();
});

test('a logout failure keeps the session and allows a deliberate retry',async t=>{
  const f=fixture(t),account=await f.open(false);
  f.state.signOutError=Error('offline');
  await assert.rejects(leaveAccount(account),/offline/);
  assert.equal(account.isCurrent(),true);
  assert.equal(f.state.session.user.id,owner);
  assert.match(accountError(f.state.signOutError),/로그아웃하지 못했어요/);
  assert.deepEqual(f.state.redirects,[]);
  assert.deepEqual(f.state.removedSession,[]);
  f.state.signOutError=null;
  await leaveAccount(account);
  assert.equal(f.state.calls.filter(call=>call.kind==='signOut').length,2);
  assert.deepEqual(f.state.redirects,['/features/pajang/']);
  account.dispose();
});

test('withdrawal pins the verified token and expected user until photos and account are deleted',async t=>{
  const exchangePhoto={bucket_id:'pajang-exchange-photos',photo_path:'10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000001.jpg'};
  const f=fixture(t,{files:[mediaPhoto,parkPhoto,exchangePhoto]}),account=await f.open(true);
  f.state.hook=async name=>{
    if(name==='getUser')f.setSession(ownSession(owner,'refreshed-token'),'TOKEN_REFRESHED');
  };
  await leaveAccount(account,true);
  assert.equal(f.state.clients.length,1);
  const created=f.state.clients[0];
  assert.equal(created.url,'https://accounts.invalid');
  assert.equal(created.key,'mock-publishable');
  assert.equal(created.options.global.headers.Authorization,`Bearer ${originalToken}`);
  assert.equal(created.options.auth.persistSession,false);
  assert.equal(created.options.auth.autoRefreshToken,false);
  assert.equal(created.options.auth.detectSessionInUrl,false);
  assert.match(created.options.auth.storageKey,new RegExp(`^ojjuda-delete-${owner}-`));
  assert.deepEqual(f.state.calls.find(call=>call.kind==='getUser'),{kind:'getUser',token:originalToken});
  assert.equal(f.state.deleted,true);
  assert.deepEqual(f.state.files,[]);
  assert.deepEqual(f.state.calls.filter(call=>call.kind==='rpc').map(call=>call.name),[
    'prepare_my_account_deletion','my_account_deletion_files','my_account_deletion_files','delete_my_account'
  ]);
  assert.deepEqual(f.state.calls.filter(call=>call.kind==='signOut'),[{kind:'signOut',options:{scope:'local'}}]);
  assert.deepEqual(f.state.removedLocal,[`ojjuda-note-composer-settings-v1:${owner}`,'ojjuda-world-v1']);
  assert.deepEqual(f.state.redirects,['/features/pajang/']);
  account.dispose();
});

test('a storage failure preserves the account and retries only the remaining files',async t=>{
  const f=fixture(t,{files:[mediaPhoto,parkPhoto]}),account=await f.open(true);
  f.state.failBucket='note-card-photos';
  await assert.rejects(leaveAccount(account,true),/storage_unavailable/);
  assert.equal(f.state.deleted,false);
  assert.deepEqual(f.state.files,[parkPhoto]);
  assert.equal(f.state.calls.some(call=>call.kind==='signOut'),false);
  assert.deepEqual(f.state.redirects,[]);
  assert.deepEqual(f.state.removedLocal,[]);
  assert.match(accountError(Error('storage_unavailable'),true),/남은 사진 정리부터/);
  f.state.failBucket=null;
  await leaveAccount(account,true);
  assert.equal(f.state.deleted,true);
  assert.equal(f.state.calls.filter(call=>call.kind==='remove'&&call.bucket==='media').length,1);
  assert.equal(f.state.calls.filter(call=>call.kind==='remove'&&call.bucket==='note-card-photos').length,2);
  assert.deepEqual(f.state.redirects,['/features/pajang/']);
  account.dispose();
});

test('the server-verified member must match the account that opened confirmation',async t=>{
  const f=fixture(t),account=await f.open(true);
  f.state.verifiedUser={id:other,is_anonymous:false};
  await assert.rejects(leaveAccount(account,true),/account_changed/);
  assert.equal(f.state.clients.length,0);
  assert.deepEqual(mutations(f.state),[]);
  account.dispose();
});

test('a changed session is rejected even before its auth event arrives',async t=>{
  const f=fixture(t),account=await f.open(true);
  f.state.session=ownSession(other,'another-member-token');
  await assert.rejects(leaveAccount(account,true),/account_changed/);
  assert.equal(f.state.clients.length,0);
  assert.deepEqual(mutations(f.state),[]);
  account.dispose();
});

for(const stage of ['getSession','getUser','prepare_my_account_deletion','my_account_deletion_files','remove']){
  test(`an account switch during ${stage} stops withdrawal before account deletion`,async t=>{
    const f=fixture(t,{files:[mediaPhoto]}),account=await f.open(true);
    f.state.hook=async name=>{if(name===stage)f.setSession(ownSession(other,'another-member-token'));};
    await assert.rejects(leaveAccount(account,true),/account_changed/);
    assert.equal(f.state.deleted,false);
    assert.equal(f.state.calls.some(call=>call.kind==='signOut'),false);
    assert.deepEqual(f.state.redirects,[]);
    assert.deepEqual(f.state.removedLocal,[]);
    assert.equal(f.state.changes,1);
    account.dispose();
  });
}

test('switching away and back cannot revive an old withdrawal confirmation',async t=>{
  const f=fixture(t,{files:[mediaPhoto]}),account=await f.open(true);
  f.state.hook=async name=>{
    if(name==='prepare_my_account_deletion'){
      f.setSession(ownSession(other,'another-member-token'));
      f.setSession(ownSession());
    }
  };
  await assert.rejects(leaveAccount(account,true),/account_changed/);
  assert.equal(f.state.deleted,false);
  assert.equal(f.state.calls.some(call=>call.kind==='remove'||call.kind==='signOut'),false);
  assert.deepEqual(f.state.redirects,[]);
  account.dispose();
});

test('an account that signs in during logout is not redirected or cleared',async t=>{
  const f=fixture(t),account=await f.open(false);
  f.state.hook=async name=>{if(name==='signedOut')f.setSession(ownSession(other,'new-login'));};
  await assert.rejects(leaveAccount(account),/account_changed/);
  assert.equal(f.state.session.user.id,other);
  assert.deepEqual(f.state.redirects,[]);
  assert.deepEqual(f.state.removedSession,[]);
  assert.deepEqual(f.state.removedLocal,[]);
  account.dispose();
});

test('anonymous visitors cannot open a member account action',async t=>{
  const f=fixture(t,{session:{user:{id:owner,is_anonymous:true},access_token:'guest-token'}});
  await assert.rejects(f.open(true),/account_changed/);
  assert.equal(f.state.listeners.size,0);
  assert.deepEqual(mutations(f.state),[]);
});

// Administrator visibility is tested against synthetic Auth and RPC results only.
function adminFixture(t,options={}){
  const state={session:ownSession(),verifiedUser:{id:owner,is_anonymous:false},role:true,
    sessionError:null,verifiedError:null,roleError:null,hook:null,...options,
    calls:[],shown:[],listeners:new Set(),sessionReads:0,inAuthCallback:false};
  async function step(name){
    assert.equal(state.inAuthCallback,false,'Auth operations never run inside an auth callback');
    if(state.hook)await state.hook(name);
  }
  const db={auth:{
    async getSession(){
      const value=state.session,error=state.sessionError;
      state.calls.push('getSession');
      await step('getSession:'+ ++state.sessionReads);
      return {data:{session:value},error};
    },
    async getUser(token){
      state.calls.push('getUser');
      assert.equal(token,originalToken,'identity verification uses the captured session token');
      const value=state.verifiedUser,error=state.verifiedError;
      await step('getUser');
      return {data:{user:value},error};
    },
    onAuthStateChange(listener){
      state.listeners.add(listener);
      return {data:{subscription:{unsubscribe(){state.listeners.delete(listener);}}}};
    }
  },async rpc(name){
    state.calls.push(name);assert.equal(name,'is_admin');
    const data=state.role,error=state.roleError;
    await step(name);
    return {data,error};
  }};
  function emit(session,event='SIGNED_IN'){
    state.session=session;state.inAuthCallback=true;
    try{for(const listener of state.listeners)listener(event,session);}
    finally{state.inAuthCallback=false;}
  }
  function start(){
    const dispose=watchAdminAccess(db,owner,allowed=>state.shown.push(allowed));
    t.after(dispose);
    return dispose;
  }
  return {state,db,emit,start};
}
const settleAdmin=async()=>{
  await new Promise(resolve=>setTimeout(resolve,0));
  await new Promise(resolve=>setImmediate(resolve));
};

test('administrator entry requires the same authenticated member and a true server role',async t=>{
  const f=adminFixture(t);f.start();
  assert.deepEqual(f.state.shown,[false],'the entry starts hidden');
  await settleAdmin();
  assert.deepEqual(f.state.calls,['getSession','getUser','is_admin','getSession']);
  assert.equal(f.state.shown.at(-1),true);
});

for(const [label,options] of [
  ['ordinary member',{role:false}],
  ['string role',{role:'true'}],
  ['numeric role',{role:1}],
  ['role RPC error',{roleError:Error('unavailable')}],
  ['editable metadata',{role:false,verifiedUser:{id:owner,user_metadata:{role:'admin',is_admin:true},app_metadata:{role:'admin'}}}],
]){
  test(`${label} does not grant administrator entry`,async t=>{
    const f=adminFixture(t,options);f.start();await settleAdmin();
    assert.equal(f.state.calls.includes('is_admin'),true);
    assert.equal(f.state.shown.includes(true),false);
  });
}

for(const [label,options] of [
  ['missing session',{session:null}],
  ['anonymous session',{session:{...ownSession(),user:{id:owner,is_anonymous:true}}}],
  ['different session',{session:ownSession(other)}],
  ['session read error',{sessionError:Error('session unavailable')}],
  ['different verified member',{verifiedUser:{id:other}}],
  ['unverified identity',{verifiedError:Error('identity unavailable')}],
]){
  test(`${label} is rejected before reading the administrator role`,async t=>{
    const f=adminFixture(t,options);f.start();await settleAdmin();
    assert.equal(f.state.calls.includes('is_admin'),false);
    assert.equal(f.state.shown.includes(true),false);
  });
}

for(const stage of ['getSession:1','getUser','is_admin','getSession:2']){
  test(`an account switch during ${stage} cannot reveal the old administrator entry`,async t=>{
    const f=adminFixture(t,{hook:name=>{if(name===stage)f.emit(ownSession(other,'other-token'));}});
    f.start();await settleAdmin();
    assert.equal(f.state.shown.includes(true),false);
  });
}

test('the final session check rejects a changed account before its auth event arrives',async t=>{
  const f=adminFixture(t,{hook:name=>{if(name==='is_admin')f.state.session=ownSession(other);}});
  f.start();await settleAdmin();
  assert.equal(f.state.shown.includes(true),false);
});

test('logout hides administrator entry synchronously',async t=>{
  const f=adminFixture(t);f.start();await settleAdmin();
  assert.equal(f.state.shown.at(-1),true);
  f.emit(null,'SIGNED_OUT');
  assert.equal(f.state.shown.at(-1),false);
  await settleAdmin();
  assert.equal(f.state.shown.at(-1),false);
});

test('token refresh rechecks a revoked role after the auth callback finishes',async t=>{
  const f=adminFixture(t);f.start();await settleAdmin();
  assert.equal(f.state.shown.at(-1),true);
  f.state.role=false;
  const calls=f.state.calls.length;
  f.emit(ownSession(),'TOKEN_REFRESHED');
  assert.equal(f.state.shown.at(-1),false);
  assert.equal(f.state.calls.length,calls,'no Auth request starts inside the callback');
  await settleAdmin();
  assert.equal(f.state.calls.filter(name=>name==='is_admin').length,2);
  assert.equal(f.state.shown.at(-1),false);
});

test('an older role response cannot revive access after switching away and back',async t=>{
  let release;
  const pending=new Promise(resolve=>{release=resolve;});
  const f=adminFixture(t,{hook:name=>name==='is_admin'?pending:undefined});
  f.start();await settleAdmin();
  f.emit(ownSession(other,'other-token'));
  f.state.hook=null;f.state.role=false;
  f.emit(ownSession());
  await settleAdmin();release();await settleAdmin();
  assert.equal(f.state.calls.filter(name=>name==='is_admin').length,2);
  assert.equal(f.state.shown.includes(true),false);
});

test('disposing the settings listener ignores a pending administrator result',async t=>{
  let release;
  const pending=new Promise(resolve=>{release=resolve;});
  const f=adminFixture(t,{hook:name=>name==='is_admin'?pending:undefined});
  const dispose=f.start();await settleAdmin();
  dispose();release();await settleAdmin();
  assert.equal(f.state.listeners.size,0);
  assert.equal(f.state.shown.includes(true),false);
});

test('a thrown role lookup remains hidden',async t=>{
  const f=adminFixture(t,{hook:name=>{if(name==='is_admin')throw Error('network interrupted');}});
  f.start();await settleAdmin();
  assert.equal(f.state.shown.includes(true),false);
});

test('the real settings component checks Auth UID while keeping a distinct Pajang profile ID',async t=>{
  const require=createRequire(import.meta.url);
  const featureRequire=createRequire(new URL('../features/pajang/package.json',import.meta.url));
  const {JSDOM}=require('jsdom');
  const {build}=featureRequire('esbuild');
  const built=await build({entryPoints:[new URL('../features/pajang/src/app/account-settings.tsx',import.meta.url).pathname],
    bundle:true,write:false,platform:'node',format:'cjs',jsx:'automatic',external:['react','react/jsx-runtime']});
  const dom=new JSDOM('<div id="root"></div>',{url:'https://fixture.invalid/features/pajang/station.html?tab=profile'});
  const f=adminFixture(t);
  dom.window.OjjudaGetClient=async()=>f.db;
  const globals={window:dom.window,document:dom.window.document,navigator:dom.window.navigator,IS_REACT_ACT_ENVIRONMENT:true};
  const originals=new Map();
  for(const [key,value] of Object.entries(globals)){
    originals.set(key,Object.getOwnPropertyDescriptor(globalThis,key));
    Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});
  }
  const {createElement,act}=featureRequire('react');
  const {createRoot}=featureRequire('react-dom/client');
  const module={exports:{}};
  new Function('require','module','exports',built.outputFiles[0].text)(featureRequire,module,module.exports);
  const {AccountSettings}=module.exports;
  const host=dom.window.document.getElementById('root'),reactRoot=createRoot(host);
  const profileId='synthetic-pajang-person';
  assert.notEqual(profileId,f.state.session.user.id);
  try{
    await act(async()=>{
      reactRoot.render(createElement(AccountSettings,{profileId,onOpen(){}}));
      await settleAdmin();
    });
    const entry=host.querySelector('a[href="/admin/?from=pajang&admin=pajang-answers"]');
    assert.equal(entry?.textContent,'파장 관리자모드›');
    assert.equal(entry?.target,'_top');
    assert.equal(f.state.calls.includes('is_admin'),true);
    await act(async()=>{
      f.emit(null,'SIGNED_OUT');
      await settleAdmin();
    });
    assert.equal(host.querySelector('a[href*="admin="]'),null,'auth logout removes the live administrator entry');
    f.state.session=ownSession();f.state.role=false;
    await act(async()=>{
      reactRoot.render(createElement(AccountSettings,{profileId:'another-pajang-person',onOpen(){}}));
      await settleAdmin();
    });
    assert.equal(host.querySelector('a[href*="admin="]'),null,'a different profile does not inherit previous visibility');
  }finally{
    await act(async()=>reactRoot.unmount());
    dom.window.close();
    for(const [key,descriptor] of originals){
      if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];
    }
  }
});
