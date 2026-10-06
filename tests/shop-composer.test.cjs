const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{JSDOM}=require('jsdom');
const root=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const html=read('park/index.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
(async()=>{
 const dom=new JSDOM(html,{url:'https://fixture.test/park/?embedded=1',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,d=w.document,errors=[];
 const run=code=>new vm.Script(code).runInContext(dom.getInternalVMContext());
 try{
  w.addEventListener('error',e=>errors.push(e.message));w.scrollTo=()=>{};w.requestAnimationFrame=()=>0;w.cancelAnimationFrame=()=>{};w.HTMLElement.prototype.scrollTo=()=>{};w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});w.confirm=()=>true;
  run(read('ju-shop.js'));run(read('note/preview.js'));
  run(`session={user:{id:'member-a'}};authKnown=ready=true;myIdentity={gender:'male'};myIdentityReady=true;myGender='male';draftController=null;autoWritingLocation=()=>{};
    window.fixtureOwned=['card_stickers','card_fonts','card_foil'];window.fixtureCalls=[];
    OjjudaShop.install({getUserId:()=>session?.user?.id,onUseCardDecoration:useCardDecoration,client:{auth:{onAuthStateChange(){return{data:{subscription:{unsubscribe(){}}}}}},rpc:name=>({abortSignal:async()=>{
      fixtureCalls.push(name);if(name!=='ju_shop_state')throw Error('Unexpected write');return{data:{ok:true,coins:40,products:[],selected:{},owned:fixtureOwned.map(key=>({key,expires_at:new Date(Date.now()+86400000).toISOString()}))}};
    }})}});`);
  assert.equal(await run("useCardDecoration('card_stickers','member-a')"),true);
  assert.equal(d.getElementById('composer-backdrop').hidden,false);assert.equal(d.querySelector('[data-shop-style=Sticker]').value,'heart');
  assert.equal(d.querySelector('.ju-compose-tools').open,true);assert.equal(d.getElementById('compose-more').open,true);
  d.getElementById('compose-text').value='쓰던 글을 지우면 안 됩니다';d.getElementById('compose-text').dispatchEvent(new w.Event('input'));
  assert.equal(await run("useCardDecoration('card_fonts','member-a')"),true);
  assert.equal(d.querySelector('[data-shop-style=Font]').value,'book');assert.equal(d.getElementById('compose-text').value,'쓰던 글을 지우면 안 됩니다');assert.equal(d.querySelector('[data-shop-style=Sticker]').value,'heart');
  assert.equal(await run("useCardDecoration('card_foil','member-a')"),true);assert.equal(d.querySelector('[data-shop-style=Effect]').value,'foil');
  const card=d.createElement('div');run('window.proofStyle=OjjudaShop.styleFields()');w.OjjudaShop.decorateCard(card,w.proofStyle);assert.ok(card.classList.contains('ju-font-book'));assert.ok(card.classList.contains('ju-effect-foil'));assert.equal(card.querySelector('.ju-card-sticker').textContent,'♡');
  run("fixtureOwned=[]");assert.equal(await run("useCardDecoration('card_fonts','member-a')"),false,'expired or unowned products cannot be applied');
  assert.equal(await run("useCardDecoration('card_stickers','other-account')"),false);assert.ok(w.fixtureCalls.every(name=>name==='ju_shop_state'),'applying an existing item never charges again');
  assert.deepEqual(errors,[]);console.log('PASS: owned decoration opens the real composer, preserves text/other styles, updates preview, rejects expiry/account mismatch and never charges');
 }finally{w.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
