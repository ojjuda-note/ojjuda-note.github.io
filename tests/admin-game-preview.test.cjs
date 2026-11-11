const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('server-verified admins alone can enable account-scoped game previews',async()=>{
  const values=new Map(),listeners=new Map(),events=[];
  const localStorage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
  const window={
    addEventListener:(name,callback)=>listeners.set(name,callback),
    dispatchEvent:event=>{events.push(event);listeners.get(event.type)?.(event);}
  };
  const CustomEvent=class {constructor(type,options){this.type=type;this.detail=options.detail;}};
  vm.runInNewContext(read('shared/games/admin-preview.js'),{window,localStorage,CustomEvent,
    document:{readyState:'loading',addEventListener(){}},setTimeout:callback=>Promise.resolve().then(callback)});
  let owner='admin-account',admin=true;
  const client={auth:{
    getSession:async()=>({data:{session:owner?{user:{id:owner}}:null}}),
    getUser:async()=>({data:{user:owner?{id:owner}:null},error:null}),
    onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})
  },rpc:async name=>{assert.equal(name,'is_admin');return {data:admin,error:null};}};
  const preview=window.OjjudaAdminPreview;
  assert.equal(preview.setEnabled(true),false,'unverified clients cannot turn on the mode');
  preview.configure(client);await preview.refresh();
  assert.equal(preview.isAuthorized(),true);
  assert.equal(preview.isEnabled(),false);
  assert.equal(preview.setEnabled(true),true);
  assert.equal(preview.isEnabled(),true);
  assert.equal(values.get('ojjuda.admin-preview.v1:admin-account'),'on');
  assert.ok(events.some(event=>event.type==='ojjuda:admin-preview'&&event.detail.enabled));
  admin=false;await preview.refresh();
  assert.equal(preview.isEnabled(),false,'revoked roles disable the mode immediately');
  assert.equal(preview.setEnabled(true),false);
  owner='other-account';await preview.refresh();
  assert.equal(preview.isEnabled(),false,'saved admin preference never crosses to another account');
  admin=true;await preview.refresh();
  assert.equal(preview.isAuthorized(),true);
  assert.equal(preview.isEnabled(),false,'new admin accounts start with the mode off');
  owner=null;await preview.refresh();
  assert.equal(preview.isAuthorized(),false);
  assert.equal(preview.isEnabled(),false,'sign-out clears the active privilege');
});

test('previewing the last breakout stage cannot overwrite actual progress',()=>{
  const storage=new Map([['ojjuda-breakout-last-stage-v1','7']]);
  const context={window:{OjjudaAdminPreview:{isEnabled:()=>true},OjjudaGameControls:{get:()=>({speed:'normal'})}},localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,String(value))}};
  vm.runInNewContext(read('games/breakout/breakout-game.js'),context);
  const game=context.window.OjjudaBreakoutGame.create({setScore(){},end(){}},100);
  assert.equal(game.stage,100);
  assert.equal(storage.get('ojjuda-breakout-last-stage-v1'),'7');
  game.destroy();
  context.window.OjjudaAdminPreview.isEnabled=()=>false;
  const normal=context.window.OjjudaBreakoutGame.create({setScore(){},end(){}},3);
  assert.equal(normal.stage,3);
  assert.equal(storage.get('ojjuda-breakout-last-stage-v1'),'3');
  normal.destroy();
});

test('the daily section leaves the arcade for the Agit tab',()=>{
  const source=read('world.html');
  const start=source.indexOf('const renderArcadeMenuOriginal=Df;');
  const end=source.indexOf('// Keep the new Agit tab separate',start);
  assert.ok(start>=0&&end>start);
  const markup='<div class="arcade-card"><header class="game-section-heading"><h2>나만의 플레이</h2></header><div class="gbtns" data-arcade-games="solo"><button>혼자 게임</button></div><header class="game-section-heading" data-arcade-test-heading><div><h2>일상</h2></div></header><div class="gbtns" data-arcade-games="test"><button>일상 게임</button></div></div>';
  const context={Df:()=>markup,g:{place:{id:'arcade'}}};
  vm.runInNewContext(source.slice(start,end),context);
  const result=context.Df();
  assert.ok(result.includes('혼자 게임'));
  assert.ok(!result.includes('일상 게임'));
  assert.ok(!result.includes('data-arcade-test-heading'));
  assert.ok(source.includes('ys.unshift({id:"hub",label:"아지트",ic:"home"})'));
  assert.ok(source.includes('data-tab="hub" aria-label="오쭈다 아지트로 가기"'));
  assert.ok(source.includes('gm(()=>sr.tab({tab:"hub"}))'));
});

test('administrator star preview also supports the six new chapters without saving progress',()=>{
  const source=read('games/bulssi/index.html');
  assert.ok(source.includes('id="chapterSelect"'));
  assert.ok(source.includes('id="demoStageSelect"'));
  assert.ok(source.includes('if(DEMO){closeChapters();startDemo('));
  assert.ok(source.includes('S.maxStage=STAGES.length-1'));
  assert.ok(source.includes('if(!DEMO)DEMO=JSON.parse(JSON.stringify(S))'));
  assert.ok(source.includes('openChapters,'));
  assert.ok(source.includes("const save=()=>{if(!DEMO)window.OjjudaSaetbyeolEntry.save(S)}"));
  const revision=JSON.parse(read('game-release.json')).revision;
  assert.match(revision,/^\d{8}-[a-z0-9-]+$/);
  assert.ok(read('shared/games/world-game-assets.js').includes(`const revision='${revision}'`));
  assert.ok(read('world.html').includes(`world-game-assets.js?v=${revision}`));
});

test('admin preview never submits member or guest scores, and normal mode still saves',async()=>{
  const source=read('world.html');
  const start=source.indexOf('async function tf('),end=source.indexOf('}async function ef(',start);
  assert.ok(start>0&&end>start);
  let preview=true;const calls=[],events=[];
  const context={window:{OjjudaAdminPreview:{isEnabled:()=>preview},dispatchEvent:event=>events.push(event),
    OjjudaGuestScores:{submit:async(...args)=>{calls.push(['guest',...args]);return {ok:true};}}},
    CustomEvent:class {constructor(type,options){this.type=type;this.detail=options.detail;}},
    worldRewardRequest:()=>({owner:'member'}),worldRewardCurrent:()=>true,
    vl:async(...args)=>{calls.push(['member',...args]);return {ok:true};},
    crypto:{randomUUID:()=> 'request-id'}};
  vm.runInNewContext(source.slice(start,end+1),context);
  assert.equal((await context.tf('mole',42,{owner:'member'})).reason,'admin_preview');
  assert.equal((await context.tf('runner',17,{owner:null})).reason,'admin_preview');
  assert.equal(calls.length,0);
  assert.equal(events.length,0);
  preview=false;
  assert.equal((await context.tf('mole',42,{owner:'member'})).ok,true);
  assert.equal((await context.tf('runner',17,{owner:null})).ok,true);
  assert.equal(calls.length,2);
  assert.equal(events.length,1);
});

test('game RPC purchases and rewards are blocked only in admin preview',async()=>{
  const source=read('world.html');
  const start=source.indexOf('function adminGamePreviewActive()'),end=source.indexOf('function Al(',start);
  assert.ok(start>0&&end>start);
  let preview=true;const calls=[];
  const context={window:{OjjudaAdminPreview:{isEnabled:()=>preview}},
    vl:async(...args)=>{calls.push(args);return {ok:true};}};
  vm.runInNewContext(source.slice(start,end),context);
  for(const name of ['submit_score','submit_screw_box_score','record_marble_result','screw_upgrade_buy_v3','sacheonseong_tool_buy','archery_single_action']){
    assert.equal((await context.vl(name,{},{})).reason,'admin_preview');
  }
  assert.equal(calls.length,0);
  preview=false;
  assert.equal((await context.vl('submit_score',{p_game:'mole'},{})).ok,true);
  assert.equal(calls.length,1);
});

test('guest score and game-result endpoints are not called in admin preview',async()=>{
  let preview=true;const requests=[],events=[];
  const client={rpc:(name,args)=>{requests.push({name,args});return {abortSignal:async()=>({data:{ok:true},error:null})};}};
  const window={OjjudaAdminPreview:{isEnabled:()=>preview},OJJUDA_CONFIG:{supabaseUrl:'https://example.test',supabaseKey:'test'},
    supabase:{createClient:()=>client},dispatchEvent:event=>events.push(event)};
  vm.runInNewContext(read('shared/games/guest-game-scores.js'),{
    window,localStorage:{getItem:()=>null,setItem(){}},
    crypto:{randomUUID:()=> 'request-id',getRandomValues:array=>array},
    AbortSignal:{timeout:()=>({})},CustomEvent:class {constructor(type,options){this.type=type;this.detail=options.detail;}}
  });
  const api=window.OjjudaGuestScores;
  for(const request of [api.submit('mole',99),api.submitScrewBox(99,'id'),api.spot(3),api.territory('id',true),api.marble('id',false)]){
    assert.equal((await request).reason,'admin_preview');
  }
  assert.equal(requests.length,0);
  assert.equal(events.length,0);
  preview=false;
  assert.equal((await api.submit('mole',99)).ok,true);
  assert.equal(requests[0].name,'submit_guest_game_score');
  assert.equal(events.length,1);
});

test('individual game progress and replay saves are isolated from admin preview',()=>{
  const source=read('world.html');
  assert.ok(source.includes('if(adminGamePreviewActive())return;\n if(!E||E.kind'));
  assert.ok(source.includes("if(typeof adminGamePreviewActive==='function'&&adminGamePreviewActive())return;\n if(!S||R?.running)return;"));
  assert.ok(source.includes("render(null,adminPreview?'관리자 체험 · 기록은 저장하지 않아요.'"));
  const guarded=[
    ['games/spot-difference/wallet.js','async recordClear(owner,stage){'],
    ['games/spot-difference/world-spot-game.js',"if(window.OjjudaAdminPreview?.isEnabled?.()===true)return;"],
    ['games/solitaire/app.js','if(adminPreview())return;'],
    ['games/mines/entry.js',"if (!ready || adminPreview()) return;"],
    ['games/screw/screw-flat.js','if(adminPreview())return true;'],
    ['games/screw/screw3d.js','if(adminPreview())return true;'],
    ['games/photo-ttang/photo-ttang-ranking.js','async function save(stage){'],
    ['games/ojjuda-tour/world-tour-game.js','if(adminPreview()){'],
    ['games/ttang/ttang-bridge.js','if(adminPreview()){'],
    ['games/tank/world-tank-game.js','admin_preview'],
    ['games/matgo/matgo-bridge.js','관리자 체험 중에는 승패가 저장되는 맞고'],
    ['features/home/agit-hub.js','if(root.OjjudaAdminPreview?.isEnabled?.()===true)return false;'],
    ['shared/games/game-challenges.js','if (adminPreview() || !supported(game)']
  ];
  for(const [file,guard] of guarded)assert.ok(read(file).includes(guard),file+' has a preview guard');
});
