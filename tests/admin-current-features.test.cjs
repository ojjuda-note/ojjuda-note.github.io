const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
async function entry(query, allowed = true, signedIn = true) {
  const panels = Object.fromEntries(['status', 'auth-required', 'no-permission', 'error', 'retry']
    .map(id => [id, {hidden: false, addEventListener() {}}]));
  const redirects = [], scheduled = [], checks = {user: 0, role: 0};
  const location = new URL('https://admin.test/admin/' + query);
  location.replace = url => redirects.push(url);
  let onAuth, beforeRoleResponse;
  const client = {
    auth: {
      async getUser() {
        checks.user++;
        return {data: {user: signedIn ? {id: 'synthetic-admin'} : null}};
      },
      onAuthStateChange(listener) { onAuth = listener; }
    },
    from() {
      return {
        select() { return this; },
        eq() { return this; },
        async maybeSingle() {
          checks.role++;
          beforeRoleResponse?.();
          return {data: allowed ? {user_id: 'synthetic-admin'} : null};
        }
      };
    }
  };
  const context = {URL, URLSearchParams, location, setTimeout: fn => scheduled.push(fn),
    document: {getElementById: id => panels[id]},
    window: {OJJUDA_CONFIG: {supabaseUrl: 'https://fixture.invalid', supabaseKey: 'synthetic'},
      supabase: {createClient: () => client}}};
  vm.runInNewContext(read('admin/app.js'), context);
  async function flush() {
    await new Promise(setImmediate);
    while (scheduled.length) await scheduled.shift()();
  }
  await flush();
  return {redirects, panels, checks, onAuth, flush,
    signOutDuringNextRoleCheck() {
      beforeRoleResponse = () => { signedIn = false; onAuth('SIGNED_OUT'); };
    }
  };
}
(async()=>{
 for(const [requested,expected]of Object.entries({overview:'overview',referrals:'referrals',content:'cards',world:'cards',posts:'cards','house-content':'cards',review:'cards',chats:'messages',quiz:'overview',messages:'messages','photo-stages':'photo-stages',cards:'cards',events:'cards','note-events':'cards',risk:'risk',map:'map',archive:'trash-cards',withdrawn:'trash-accounts','note-archive':'trash-cards',trash:'trash-all','trash-messages':'trash-messages',payment:'settings',support:'reports',operations:'notice'})){
  for(const route of ['?admin='+requested,'#'+requested]){
   const{redirects}=await entry(route);assert.equal(redirects.length,1);assert.equal(new URL(redirects[0]).searchParams.get('admin'),expected,route);
  }
 }
 for(const [allowed,signedIn,panel]of [[false,true,'no-permission'],[true,false,'auth-required']]){
  const result=await entry('?admin=messages',allowed,signedIn);assert.deepEqual(result.redirects,[]);assert.equal(result.panels[panel].hidden,false);
 }
 const opened = await entry('?admin=overview');
 opened.onAuth('INITIAL_SESSION');
 await opened.flush();
 assert.deepEqual(opened.checks, {user: 1, role: 1}, 'startup checks the user and role once');
 assert.equal(opened.redirects.length, 1);
 opened.signOutDuringNextRoleCheck();
 opened.onAuth('SIGNED_IN');
 await opened.flush();
 assert.deepEqual(opened.checks, {user: 3, role: 2}, 'later events verify the latest user and role');
 assert.equal(opened.panels['auth-required'].hidden, false);
 assert.equal(opened.redirects.length, 1, 'sign-out invalidates the pending role result');
 // Execute the real summary reader; card reports must be counted and read failures must not look like zero.
 const world=read('world.html'),start=world.indexOf('var U={overview:')+7,end=world.indexOf(',reports:',start);
 assert.ok(start>7&&end>start);
 const calls=[],context={mt:async name=>{calls.push(name);return{users:8,reports_open:2,feedback_open:1}},S:{schema(name){assert.equal(name,'ojjuda_note');return{rpc:async name=>{calls.push('note.'+name);return{data:{open_reports:5}}}}}}};
 const reader=vm.runInNewContext('({'+world.slice(start,end)+'})',context);
 assert.equal((await reader.overview()).reports_open,7);assert.deepEqual(calls,['admin_overview','note.admin_overview']);
 context.S.schema=()=>({rpc:async()=>({error:new Error('permission fixture')})});await assert.rejects(reader.overview(),/permission fixture/);
 assert.equal(/admin_chat_feed|admin_quiz_(stats|list|add|toggle)|data-act="adm-chatlim"|data-act="adm-cr"/.test(world),false);
 console.log('PASS: administrator entry routes and roles, active photo/message links, retired aliases, account/card report totals and read errors');
})().catch(error=>{console.error(error);process.exitCode=1});
