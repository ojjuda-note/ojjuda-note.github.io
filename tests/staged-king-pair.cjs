const fs=require('fs'),assert=require('assert/strict'),{chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
 try{
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 const issues=[];page.on('pageerror',e=>issues.push(String(e)));
 await page.route('https://ojjuda.kr/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  if(path==='/config.js')return route.fulfill({contentType:'application/javascript',body:`window.OjjudaGetClient=async()=>({auth:{getSession:async()=>({data:{session:{user:{id:"mobile-user"}}}}),onAuthStateChange(){}},rpc:(_,q)=>({abortSignal:async()=>({data:window.testState(q)})})});`});
  const rel=path==='/games/king/'?'index.html':path.split('/').at(-1);
  if(!['index.html','room.js','room.css'].includes(rel))return route.abort();
  await route.fulfill({contentType:rel.endsWith('.js')?'text/javascript':rel.endsWith('.css')?'text/css':'text/html',body:fs.readFileSync('games/king/'+rel)});
 });
 await page.addInitScript(()=>{
  let state=null;
  window.testState=q=>{
   if(q.p_action==='create')state={code:'CD5678',title:'왕게임',capacity:12,players:Array.from({length:12},(_,i)=>'참가'+(i+1)),phase:'cards',me:0,card:0,ready:false,readyCount:11,revision:1,round:1};
   else if(q.p_action==='ready')state={...state,ready:true,readyCount:12,king:0,phase:'order',revision:2};
   else if(q.p_action==='order')state={...state,number:q.p_options.number,mission:q.p_options.mission,recipient:4,...(q.p_options.second?{second:q.p_options.second,secondRecipient:7}:{}),phase:'done',revision:3};
   else if(q.p_action==='again')state={...state,card:8,ready:false,readyCount:0,phase:'cards',round:2,revision:4};
   return state;
  };
 });
 for(const pair of [false,true]){
 await page.goto('https://ojjuda.kr/games/king/');
 await page.evaluate(()=>sessionStorage.clear());
 await page.reload();
 assert.deepEqual(await page.locator('select option').evaluateAll(items=>items.map(x=>Number(x.value))),[3,4,5,6,7,8,9,10,11,12]);
 await page.getByLabel('참여 인원').selectOption('12');await page.getByLabel('방 비밀번호').fill('test123');
 await page.locator('button[type=submit]').click();await page.getByText('내 카드를 확인하세요').waitFor();
 await page.getByRole('button',{name:'내 카드 보기'}).click();await page.getByText('당신은 왕이에요.').waitFor();
 await page.getByRole('button',{name:'확인했어요'}).click();await page.getByRole('heading',{name:'왕의 미션을 정하세요'}).waitFor();
 assert.deepEqual(await page.locator('select[name=number] option').evaluateAll(a=>a.map(x=>+x.value)),Array.from({length:11},(_,i)=>i+1));
 const first=page.getByLabel('첫 번째 번호'),second=page.getByLabel('두 번째 번호');
 assert.equal(await second.inputValue(),'');
 await second.selectOption('2');await first.selectOption('2');
 assert.equal(await second.inputValue(),'');
 assert.equal(await second.locator('option[value="2"]').count(),0);
 await first.selectOption('11');
 assert.equal(await second.locator('option[value="11"]').count(),0);
 if(pair)await second.selectOption('1');
 await page.getByRole('button',{name:'다른 미션 추천'}).click();
 assert.equal(await page.locator('select[name=number]').inputValue(),'11');
 assert.equal(await second.inputValue(),pair?'1':'');
 await page.locator('[name=mission]').fill('동물 흉내');
 await first.selectOption('10');await first.selectOption('11');
 assert.equal(await page.locator('[name=mission]').inputValue(),'동물 흉내');
 await page.getByRole('button',{name:'번호 주인공 공개'}).click();
 await page.getByRole('heading',{name:pair?'11번 참가5님 · 1번 참가8님':'11번은 참가5님!'}).waitFor();await page.getByText('동물 흉내',{exact:true}).waitFor();
 await page.getByRole('button',{name:'한 판 더'}).click();await page.getByRole('button',{name:'내 카드 보기'}).click();
 await page.getByText('내 번호는 8번이에요.').waitFor();
 }
 assert.deepEqual(issues,[]);console.log('Mobile king room passed: 12 seats, private cards, 11 targets, custom order, result and replay.');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
