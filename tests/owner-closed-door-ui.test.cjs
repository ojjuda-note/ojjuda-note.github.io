const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const makeAlbumFixture=require('./fixtures/house-album.cjs');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'..');
const proof=process.env.HOUSE_PUBLIC_PROOF_DIR||path.resolve(root,'../house-public-proof'),proofFont=process.env.HOUSE_PUBLIC_PROOF_FONT;
let world=fs.readFileSync(path.join(root,'world.html'),'utf8').replace(/<script\b[^>]*\bsrc=[^>]*>\s*<\/script>/g,'').replace('import { screw3d as screwGame } from "./screw3d.js";','const screwGame={};');
world=world.replace('<script type="module">',`<script>${fs.readFileSync(path.join(root,'world-navigation.js'),'utf8')}</script><script type="module">`);
const boot=world.indexOf('j1(()=>H());gm(');assert(boot>0);
world=world.slice(0,boot)+`
window.houseWorldTest={state:g,auth:D,actions:sr,render:H,get data(){return $;},open:openWorldHouse};D.doorReady=true;D.doorWritable=true;
U.cleanupMedia=async()=>({});U.overview=async()=>({});U.contentFeed=async()=>[];U.chatFeed=async()=>[];
const makeAlbum=${makeAlbumFixture.toString()};window.albumFixture=makeAlbum();albumFixture.state.owner='world-member-a';S=albumFixture.client;const baseRPC=S.rpc,rooms=new Map();S.rpc=async(name,args)=>{albumFixture.state.owner=D.user?.id;if(name==='house_room_load'){const saved=rooms.get(args.p_owner);return {data:{ok:true,found:!!saved,canEdit:true,...saved}};}if(name==='house_room_save'){const saved={snapshot:args.p_snapshot,revision:crypto.randomUUID(),updatedAt:new Date().toISOString()};rooms.set(args.p_owner,saved);return {data:{ok:true,...saved}};}return baseRPC(name,args);};S.auth={signOut:async()=>{sessionStorage.setItem('fixture-logged-out','yes');D.user=null;D.online=false;D.isAdmin=false;H();}};
if(!localStorage.getItem('ojjuda-house-playtest-v1:world-member-a'))localStorage.setItem('ojjuda-house-playtest-v1:world-member-a',JSON.stringify({version:13,rooms:[{x:0,y:0,curtains:true,shelf:null,furniture:{}}],diary:'기존 기기 원본'}));
gm(()=>{g.tab='friends';g.visiting=null;g.visitData=null;H();window.scrollTo(0,0)});
D.online=!sessionStorage.getItem('fixture-logged-out');D.user=D.online?{id:'world-member-a'}:null;D.isAdmin=false;g.tab='friends';H();
`+world.slice(world.indexOf('</script>',boot));
(async()=>{const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox']});try{
const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
await context.route('**/*',r=>{const u=new URL(r.request().url());if(u.hostname!=='fixture.test')return r.abort();if(u.pathname==='/world.html')return r.fulfill({contentType:'text/html',body:world});const f=path.resolve(root,'.'+u.pathname);return f.startsWith(root+path.sep)&&fs.existsSync(f)&&fs.statSync(f).isFile()?r.fulfill({path:f}):r.abort();});
await page.goto('https://fixture.test/world.html');await page.waitForFunction(()=>!!window.houseWorldTest);
await page.evaluate(()=>{houseWorldTest.data.doorClosed=true;houseWorldTest.actions.tab({tab:'home'});});
await page.getByRole('img',{name:'닫힌 문',exact:true}).waitFor();assert.equal(await page.locator('iframe').count(),0);
await page.evaluate(()=>houseWorldTest.open());assert.equal(await page.locator('iframe').count(),0,'direct open cannot bypass the closed owner view');
for(const width of [320,390,1280]){await page.setViewportSize({width,height:844});assert.equal(await page.locator('.owner-closed-home').evaluate(n=>n.scrollWidth<=n.clientWidth+1),true);assert.equal(await page.getByRole('button',{name:'문 열기',exact:true}).isVisible(),true);}
await page.setViewportSize({width:390,height:844});await page.screenshot({path:'/tmp/ojjuda-owner-closed-door.png'});
await page.getByRole('button',{name:'문 열기',exact:true}).click();await page.locator('[data-house-inline][aria-busy=false]').waitFor();assert.equal(await page.locator('.owner-closed-home').count(),0);assert.equal(await page.evaluate(()=>houseWorldTest.data.doorClosed),false);
await page.evaluate(()=>{houseWorldTest.data.doorClosed=true;houseWorldTest.render();});await page.getByRole('img',{name:'닫힌 문',exact:true}).waitFor();assert.equal(await page.locator('iframe').count(),0,'closing removes an already mounted room');
await page.evaluate(()=>{houseWorldTest.actions.tab({tab:'friends'});houseWorldTest.actions.tab({tab:'home'});});assert.equal(await page.locator('iframe').count(),0,'returning home keeps the closed state');
assert.deepEqual(errors,[]);console.log('PASS: closed owner view, blocked direct open, mounted-room cleanup, reopen, return home, mobile/desktop');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
