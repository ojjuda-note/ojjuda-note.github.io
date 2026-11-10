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
  vm.runInNewContext(read('shared/games/admin-preview.js'),{window,localStorage,CustomEvent,setTimeout:callback=>Promise.resolve().then(callback)});
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
  assert.equal(revision,'20261110-admin-saetbyeol1');
  assert.ok(read('shared/games/world-game-assets.js').includes(`const revision='${revision}'`));
  assert.ok(read('world.html').includes(`world-game-assets.js?v=${revision}`));
});
