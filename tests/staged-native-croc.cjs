const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
(async()=>{
 const base=path.resolve('.');let current=null;const ids=['host','guest'];
 const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');let filename=path.join(base,url.pathname);
  if(url.pathname.endsWith('/'))filename=path.join(filename,'index.html');
  if(!filename.startsWith(base+path.sep)||!fs.existsSync(filename)){res.writeHead(404);return res.end();}
  res.writeHead(200,{'Content-Type':({'.js':'text/javascript','.css':'text/css','.html':'text/html','.webp':'image/webp','.wav':'audio/wav'})[path.extname(filename)]||'text/plain'});fs.createReadStream(filename).pipe(res);
 });
 await new Promise(y=>server.listen(0,'127.0.0.1',y));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});const errors=[];
 try{
 async function page(id){
  const context=await browser.newContext({viewport:{width:390,height:844}});
  await context.exposeFunction('mockRpc',async({p_action:a,p_code:c,p_options:o})=>{
   const me=ids.indexOf(id);
   if(a==='create')current={code:'ABC123',phase:'waiting',title:o.title,capacity:o.capacity,players:['방장'],revision:1,pressed:[],turn:0,round:1,trap:null};
   else if(!current||c!==current.code)return {error:{message:'room_unavailable'}};
   else if(a==='state'&&me>=current.players.length)return {error:{message:'not_room_member'}};
   else if(a==='join'){if(o.password!=='test1234')return {data:{error:'wrong_password'}};current.players=['방장','참가자'];current.phase='playing';current.revision++;}
   else if(a==='tooth'){assert.equal(me,current.turn);assert.equal(o.revision,current.revision);current.pressed.push(o.tooth);current.turn=1-me;current.revision++;if(o.tooth===1){current.phase='done';current.loser=me;current.trap=1}}
   else if(a==='again'){current.phase='playing';current.round++;current.revision++;current.pressed=[];current.turn=0;current.trap=null;}
   return {data:{...current,me}};
  });
  await context.route('**/config.js',route=>route.fulfill({contentType:'text/javascript',body:`window.OjjudaGetClient=async()=>({auth:{getSession:async()=>({data:{session:{user:{id:'${id}'}}}}),onAuthStateChange:()=>{}},rpc:(name,args)=>({abortSignal:()=>window.mockRpc(args)})})`}));
  const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));return p;
 }
 const host=await page('host'),guest=await page('guest');
 await host.goto(origin+'/games/croc/');await host.getByLabel('참여 인원').selectOption('2');await host.getByLabel('방 비밀번호').fill('test1234');
 await host.getByRole('button',{name:'방 만들기',exact:true}).last().click();await host.getByRole('heading',{name:'참가자를 기다려요'}).waitFor();
 await guest.goto(host.url());await guest.getByLabel('방 비밀번호').fill('wrong');await guest.getByRole('button',{name:'입장하기'}).click();await guest.getByText('방 비밀번호가 맞지 않아요.').waitFor();
 await guest.getByLabel('방 비밀번호').fill('test1234');await guest.getByRole('button',{name:'입장하기'}).click();await host.getByText('내 차례예요').waitFor();
 assert.equal(await host.locator('button.tooth').count(),24);assert.equal(await guest.locator('button.tooth:enabled').count(),0);
 await host.locator('.tooth[data-value="0"]').click();await guest.getByText('내 차례예요').waitFor();await guest.locator('.tooth[data-value="1"]').click();await guest.getByRole('button',{name:'확인',exact:true}).click();await host.getByRole('button',{name:'한 판 더'}).click();await guest.getByText('2번째 판 · 2명').waitFor();assert.deepEqual(errors,[]);console.log('Native mobile UI: create, incorrect password, join, 24 teeth, synchronized turns, acknowledge and replay passed');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1)});
