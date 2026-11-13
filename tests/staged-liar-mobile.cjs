const fs=require('fs'),assert=require('assert/strict'),{chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
 try{
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 const issues=[];page.on('pageerror',e=>issues.push(String(e)));
 await page.route('https://ojjuda.kr/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  if(path==='/config.js')return route.fulfill({contentType:'application/javascript',body:`window.OjjudaGetClient=async()=>({auth:{getSession:async()=>({data:{session:{user:{id:"mobile-user"}}}}),onAuthStateChange(){}},rpc:(_,q)=>({abortSignal:async()=>({data:window.testState(q)})})});`});
  const rel=path==='/games/liar/'?'index.html':path.split('/').at(-1);
  if(!['index.html','room.js','room.css'].includes(rel))return route.abort();
  await route.fulfill({contentType:rel.endsWith('.js')?'text/javascript':rel.endsWith('.css')?'text/css':'text/html',body:fs.readFileSync('games/liar/'+rel)});
 });
 await page.addInitScript(()=>{
  let state=null;
  window.testState=q=>{
   if(q.p_action==='create'){state={code:'AB1234',title:'모바일 테스트',capacity:12,players:Array.from({length:12},(_,i)=>'참가'+(i+1)),phase:'hints',me:0,turn:0,revision:1,round:1,hints:[],role:'liar',voted:false,voteCount:0}}
   else if(q.p_action==='hint'){state={...state,revision:2,phase:'voting',hints:[q.p_options.hint]}}
   else if(q.p_action==='vote'){state={...state,revision:3,phase:'done',liar:0,word:'팝콘',totals:[11,1,0,0,0,0,0,0,0,0,0,0]}}
   else if(q.p_action==='again'){state={...state,revision:4,phase:'hints',round:2,role:'citizen',word:'기차역',hints:[]}}
   return state;
  };
 });
 await page.goto('https://ojjuda.kr/games/liar/');
 assert.deepEqual(await page.locator('select option').evaluateAll(items=>items.map(x=>Number(x.value))),[3,4,5,6,7,8,9,10,11,12]);
 await page.getByLabel('참여 인원').selectOption('12');await page.getByLabel('방 비밀번호').fill('test123');
 await page.locator('button[type=submit]').click();await page.getByText('내 힌트를 남겨 주세요').waitFor();
 await page.getByRole('button',{name:'내 카드 보기'}).click();await page.getByText('당신은 라이어예요.').waitFor();
 await page.getByRole('button',{name:'내 카드 가리기'}).click();assert.equal(await page.getByText('당신은 라이어예요.').count(),0);
 await page.locator('[name=hint]').fill('영화관에서 봐요');await page.getByRole('button',{name:'힌트 보내기'}).click();
 await page.locator('.ballots').waitFor();assert.equal(await page.locator('.ballots button').count(),11);
 await page.locator('.ballots button').first().click();await page.getByText('라이어를 찾았어요!').waitFor();
 await page.getByRole('button',{name:'한 판 더'}).click();await page.getByRole('button',{name:'내 카드 보기'}).click();await page.getByText('제시어 · 기차역').waitFor();
 assert.deepEqual(issues,[]);console.log('Mobile UI passed: capacity selection, private cards, hints, votes and replay.');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
