const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {randomUUID}=require('node:crypto'),{JSDOM}=require('jsdom');
const vm=require('node:vm'),root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const tags='utm_source=threads&utm_medium=social&utm_campaign=onecard-20261121&utm_content=threads-onecard-20261121';
const key='ojjuda.campaign-session.v1',tick=()=>new Promise(resolve=>setImmediate(resolve));
async function fixture({url='https://ojjuda.kr/games/onecard/index.html?'+tags,stored,privacy,member=false,blocked=false,fail=false}={}){
  const dom=new JSDOM('<main></main>',{url,runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window,calls=[];let changed;
  Object.defineProperty(w.crypto,'randomUUID',{value:randomUUID});
  if(stored)w.sessionStorage.setItem(key,stored);
  if(privacy==='dnt')Object.defineProperty(w.navigator,'doNotTrack',{value:'1'});
  if(privacy==='gpc')Object.defineProperty(w.navigator,'globalPrivacyControl',{value:true});
  if(privacy==='preview')w.OjjudaAdminPreview={isEnabled:()=>true};
  if(blocked)Object.defineProperty(w,'sessionStorage',{get(){throw Error('storage blocked');}});
  const client={auth:{getSession:async()=>({data:{session:member?{user:{id:'fixture-member'}}:null}}),onAuthStateChange(fn){changed=fn;return{data:{subscription:{unsubscribe(){}}}};}},rpc:async(name,args)=>{
    calls.push({name,args});return fail?{error:{message:'offline'}}:{data:{ok:true,accepted:true}};
  }};
  w.eval(read('shared/analytics/growth-attribution.js'));w.OjjudaGrowthAttribution.configure({client});
  await tick();await tick();return{dom,w,calls,changed};
}
(async()=>{
  const first=await fixture();assert.equal(first.calls.length,1);assert.equal(first.calls[0].args.p_event,'visit');
  assert.deepEqual(Object.keys(first.calls[0].args).sort(),['p_campaign','p_content','p_event','p_medium','p_source','p_visit_id']);
  assert.doesNotMatch(JSON.stringify(first.calls),/https:|referrer|email|phone|user_id/);
  first.w.OjjudaGrowthAttribution.startSignup();first.w.OjjudaGrowthAttribution.startSignup();await tick();await tick();
  const metadata=await first.w.OjjudaGrowthAttribution.signupMetadata();
  assert.equal(metadata.campaign_visit_token,first.calls[0].args.p_visit_id);
  assert.equal(first.calls.filter(x=>x.args.p_event==='signup_start').length,1);
  const stored=first.w.sessionStorage.getItem(key);first.dom.window.close();
  const continued=await fixture({url:'https://ojjuda.kr/?auth=signup&ref=00000000-0000-4000-8000-000000000001',stored});
  assert.equal(continued.calls.length,0,'direct/internal navigation keeps the same touch without another visit');
  assert.equal((await continued.w.OjjudaGrowthAttribution.signupMetadata()).campaign_visit_token,metadata.campaign_visit_token);
  continued.changed('SIGNED_IN',{user:{id:'fixture-member'}});assert.equal(continued.w.sessionStorage.getItem(key),null);
  continued.dom.window.close();
  for(const options of [{privacy:'dnt'},{privacy:'gpc'},{privacy:'preview'},{blocked:true},{member:true},
    {url:'https://ojjuda.kr/?'+tags+'&utm_medium=blog'},{url:'https://ojjuda.kr/?'+tags.replace('threads-onecard-20261121','person%40example.com')},
    {url:'https://ojjuda.kr/?'+tags.replace('onecard-20261121','01012345678')},
    {url:'https://unrelated.example/?'+tags}]){
    const f=await fixture(options);assert.equal(f.calls.length,0,JSON.stringify(options));
    assert.equal(Object.keys(await f.w.OjjudaGrowthAttribution.signupMetadata()).length,0);f.dom.window.close();
  }
  const expired=JSON.parse(stored);expired.expiresAt=Date.now()-1;
  const stale=await fixture({url:'https://ojjuda.kr/?auth=signup',stored:JSON.stringify(expired)});
  assert.equal(stale.calls.length,0);assert.equal(stale.w.sessionStorage.getItem(key),null);stale.dom.window.close();
  const longOpen=await fixture();longOpen.w.Date.now=()=>Date.now()+25*3600000;
  longOpen.w.OjjudaGrowthAttribution.startSignup();await tick();
  assert.equal(Object.keys(await longOpen.w.OjjudaGrowthAttribution.signupMetadata()).length,0);
  assert.equal(longOpen.w.sessionStorage.getItem(key),null,'a long-open tab removes expired storage');longOpen.dom.window.close();
  const changed=await fixture({stored,url:'https://ojjuda.kr/?'+tags.replace('threads-onecard-20261121','threads-onecard-followup')});
  assert.equal(changed.calls.length,1);assert.notEqual(changed.calls[0].args.p_visit_id,metadata.campaign_visit_token);changed.dom.window.close();
  const offline=await fixture({fail:true});assert.equal(Object.keys(await offline.w.OjjudaGrowthAttribution.signupMetadata()).length,0);offline.dom.window.close();

  function parkRedirect(query){
    let destination;const location=new URL('https://ojjuda.kr/note/?'+query);location.replace=value=>destination=value;
    const window={location};window.parent=window;
    vm.runInNewContext(read('park/route.js'),{window,parent:window,location,URL});return new URL(destination);
  }
  assert.equal(parkRedirect(tags).searchParams.get('utm_content'),'threads-onecard-20261121');
  for(const query of [tags+'&utm_medium=blog',tags+'&utm_content=again',tags.replace('social','person@example.com')])
    assert.deepEqual([...parkRedirect(query).searchParams.entries()],[['utm_source','invalid']]);
  const invalidRedirect=await fixture({stored,url:parkRedirect(tags+'&utm_medium=blog').href});
  assert.equal(invalidRedirect.calls.length,0);assert.equal(invalidRedirect.w.sessionStorage.getItem(key),null);invalidRedirect.dom.window.close();

  for(const file of ['index.html','world.html','features/pajang/index.html','features/pajang/station.html','games/onecard/index.html','games/moonlit-tarot/index.html','games/starlit-saju/index.html','features/biorhythm/index.html'])assert.match(read(file),/growth-attribution\.js\?v=/,file);
  console.log('PASS: campaign tags, payload minimization, DNT/GPC, session navigation, expiry, auth exclusion and park redirect');
})().catch(error=>{console.error(error);process.exitCode=1;});
