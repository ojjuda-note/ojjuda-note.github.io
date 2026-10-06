const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'..');
// Delay only the item-store operation; the real host owns the channel, watcher,
// cleanup and apply continuation under test.
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox']});
 try{
  for(const revoke of [false,true]){
   const context=await browser.newContext(),errors=[];
   await context.route('**/*',route=>{
    const url=new URL(route.request().url());if(url.hostname!=='fixture.test')return route.abort();
    const p=url.pathname;
    if(p==='/fixture')return route.fulfill({contentType:'text/html',body:`<!doctype html><body><script type="module">import {openFurnitureStudio} from '/house-test/studio-host.js';window.allowed=true;openFurnitureStudio({owner:'review-admin',authorized:()=>window.allowed});</script>`});
    if(p==='/house-test/studio-host.js')return route.fulfill({path:path.join(root,p)});
    if(p==='/house-test/custom-store.js')return route.fulfill({contentType:'application/javascript',body:"export const listMadeItems=async()=>[];export const saveMadeItem=()=>new Promise(resolve=>window.releaseSave=()=>resolve({id:'made-review'}));"});
    if(p==='/house-test/anchor-editor/runtime.js')return route.fulfill({contentType:'application/javascript',body:'export const prepareRuntime=async()=>{};'});
    if(p==='/house-test/host.js')return route.fulfill({contentType:'application/javascript',body:'export function openHouseTest(){window.openedHomes=(window.openedHomes||0)+1;return ()=>{};}'});
    if(p==='/house-test/anchor-editor/index.html')return route.fulfill({contentType:'text/html',body:`<!doctype html><script>addEventListener('message',e=>{const port=e.ports[0];if(!port)return;port.postMessage({type:'ready'});port.postMessage({type:'apply',requestId:'race',runtime:{},project:{format:'ojjuda-furniture-set',complete:true}});});</script>`});
    return route.abort();
   });
   const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
   await page.goto('https://fixture.test/fixture');await page.waitForFunction(()=>typeof releaseSave==='function');
   if(revoke){
    await page.evaluate(()=>allowed=false);
    await page.waitForFunction(()=>!document.querySelector('[role="dialog"]'));
   }
   const result=await page.evaluate(async()=>{allowed=true;releaseSave();await Promise.resolve();await Promise.resolve();return {openedHomes:window.openedHomes||0,studioOpen:!!document.querySelector('[role="dialog"]')};});
   assert.equal(result.openedHomes,revoke?0:1,revoke?'restoring access must not let a disposed studio reopen home after an in-flight save':'an active authorized studio must still open home after applying an item');
   assert.equal(result.studioOpen,!revoke);assert.deepEqual(errors,[]);await context.close();
  }
  console.log('STUDIO CLOSE RACE PASS: active apply opens home; revoked and disposed apply cannot reopen after access returns');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
