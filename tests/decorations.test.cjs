const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{JSDOM}=require('jsdom');
const root=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
for(const file of ['world.html','park/index.html','note/preview.js','ju-charge.js','park/integration.js','world-park-notes.js','photo-ttang-help.js']){
 assert.doesNotMatch(read(file),/OjjudaShop|data-ju-shop-open|ju-shop\.(js|css)|onUseCardDecoration|useCardDecoration/);
}
assert.doesNotMatch(read('ju-decorations.js'),/ju_shop_buy|ju_shop_equip|showModal|상점/);
assert.ok(!fs.existsSync(path.join(root,'ju-shop.js'))&&!fs.existsSync(path.join(root,'ju-shop.css')));
const html=read('park/index.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
(async()=>{
 const dom=new JSDOM(html,{url:'https://fixture.test/park/?embedded=1',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,d=w.document,errors=[];
 const run=code=>new vm.Script(code).runInContext(dom.getInternalVMContext());
 try{
  w.AbortSignal=AbortSignal;w.addEventListener('error',e=>errors.push(e.message));w.scrollTo=()=>{};w.requestAnimationFrame=()=>0;w.cancelAnimationFrame=()=>{};w.HTMLElement.prototype.scrollTo=()=>{};w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});w.confirm=()=>true;
  run(read('ju-decorations.js'));run(read('note/preview.js'));
  run(`session={user:{id:'member-a'}};authKnown=ready=true;myIdentity={gender:'male'};myIdentityReady=true;myGender='male';draftController=null;autoWritingLocation=()=>{};
    window.fixtureOwned=['card_stickers'];window.fixtureCalls=[];
    OjjudaDecorations.install({getUserId:()=>session?.user?.id,client:{auth:{onAuthStateChange(){return{data:{subscription:{unsubscribe(){}}}}}},rpc:name=>({abortSignal:async()=>{
      fixtureCalls.push(name);if(name!=='ju_shop_state')throw Error('Unexpected write');return{data:{ok:true,coins:40,products:[],selected:{},owned:fixtureOwned.map(key=>({key,expires_at:new Date(Date.now()+86400000).toISOString()}))}};
    }})}});`);
  await run('OjjudaDecorations.refresh()');await run("openComposer('new')");
  assert.equal(d.getElementById('composer-backdrop').hidden,false);
  assert.equal(d.querySelector('.ju-compose-tools').hidden,false,'existing paid sticker remains usable');
  assert.equal(d.querySelector('[data-shop-style=Font]').closest('label').hidden,true,'unowned products are not advertised');
  d.getElementById('compose-text').value='작성 중인 글을 보존해요';
  const sticker=d.querySelector('[data-shop-style=Sticker]');sticker.value='heart';sticker.dispatchEvent(new w.Event('change'));
  assert.equal(d.getElementById('compose-text').value,'작성 중인 글을 보존해요');
  const card=d.createElement('div');w.OjjudaDecorations.decorateCard(card,w.OjjudaDecorations.styleFields());assert.equal(card.querySelector('.ju-card-sticker').textContent,'♡');
  run('fixtureOwned=[]');await run('OjjudaDecorations.refresh()');
  assert.equal(d.querySelector('.ju-compose-tools').hidden,true,'expired controls disappear');assert.equal(sticker.value,'none');
  w.OjjudaDecorations.decorateCard(card,{shopSticker:'clover'});assert.equal(card.querySelector('.ju-card-sticker').textContent,'🍀','published stickers survive expiry');
  assert.equal(d.querySelectorAll('[data-ju-shop-open],.ju-shop-dialog,.ju-compose-tools button').length,0);
  assert.ok(w.fixtureCalls.every(name=>name==='ju_shop_state'),'remaining decorations never charge');
  assert.deepEqual(errors,[]);console.log('PASS: storefront removed, owned sticker usable without purchases, drafts preserved, expiry hides controls and published stickers retained');
 }finally{w.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
