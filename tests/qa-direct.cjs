'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');

const origin='https://ojjuda.kr';
const kinds=['croc','bottle','bomb','stopwatch','liar','king','truth','initial','minority','mission','fingers','imagevote','updown'];
const rights=mode=>({
  adult:{data:{locked:true,age:19},error:null},
  minor:{data:{locked:true,age:18},error:null},
  unregistered:{data:null,error:null},
  error:{data:null,error:{message:'offline'}},
  unlocked:{data:{locked:false,age:30},error:null}
})[mode]||{data:null,error:{message:'unknown'}};
async function makePage(browser,mock,actor,errors,mode='adult',gate){
  const context=await browser.newContext({viewport:{width:350,height:730},hasTouch:true,isMobile:true});
  const page=await context.newPage();page.setDefaultTimeout(10000);
  page.on('pageerror',err=>errors.push(String(err)));
  const identity={actor,mode};
  const records=[];
  page.qa={records,identity};
  await page.exposeFunction('qaRpc',async(name,args={})=>{
    records.push([name,args,identity.actor]);
    if(name==='drinking_prompt_suggestions' && args.p_action==='pool' && identity.mode==='adult')return {data:{king:[],imagevote:[],fingers:[],truthFull:true,truth:{mild:['순한맛'],spicy:['빨간맛']}},error:null};
    if(name==='get_my_member_identity'){
      const recordedMode=identity.mode;
      if(gate)await gate.promise;
      return rights(recordedMode);
    }
    if(name!=='arcade_room_service'&&identity.mode!=='adult'){
      const detail='Game RPC before adult approval: '+name;
      errors.push(detail);return {data:null,error:{message:'adult_required'}};
    }
    return mock.rpc(identity.actor,name,args);
  });
  await page.route(origin+'/**',async route=>{
    const pathname=new URL(route.request().url()).pathname;
    if(pathname==='/world.html')return route.fulfill({contentType:'text/plain',body:'arcade'});
    if(pathname==='/config.js'){
      const user=identity.mode==='signedout'?null:{id:identity.actor,is_anonymous:identity.mode==='anonymous',user_metadata:{age:35,adult:true}};
      const body=`(() => {
        let user=${JSON.stringify(user)};
        const listeners=new Set();
        window.qaChangeAuth=next=>{
          user=next;for(const listener of [...listeners])listener(next?'SIGNED_IN':'SIGNED_OUT',next?{user:next}:null);
        };
        const client={auth:{getSession:async()=>({data:{session:user?{user}:null},error:null}),
          getUser:async()=>({data:{user},error:null}),onAuthStateChange:fn=>{
            listeners.add(fn);queueMicrotask(()=>{if(listeners.has(fn))fn('INITIAL_SESSION',user?{user}:null);});return {data:{subscription:{unsubscribe:()=>listeners.delete(fn)}}};
          }},
          rpc:(name,args)=>{const pending=window.qaRpc(name,args||{});pending.abortSignal=()=>pending;return pending;}};
        window.OjjudaGetClient=async()=>client;
      })();`;
      return route.fulfill({contentType:'text/javascript; charset=utf-8',body});
    }
    const file=path.join(process.cwd(),pathname.slice(1),pathname.endsWith('/')?'index.html':'');
    if(!fs.existsSync(file)||!fs.statSync(file).isFile())return route.fulfill({status:404,body:'missing'});
    const contentType={'.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.html':'text/html; charset=utf-8','.webp':'image/webp','.svg':'image/svg+xml','.png':'image/png','.wav':'audio/wav'}[path.extname(file)]||'application/octet-stream';
    return route.fulfill({contentType,body:fs.readFileSync(file)});
  });
  return page;
}
const code='CCA211';
async function check(browser,kind,errors) {
  let players=['별','달','해'], revision=3, round=1, notify, left=0;
  const ok=data=>({data,error:null});
  const model={rpc(actor,rpc,{p_action:a,p_code:c,p_options:opts}){
    const seat=players.indexOf(actor);
    if(c!==code)throw Error('unexpected room');
    if(a==='state') {
      if(seat<0)return {data:null,error:{message:'not_room_member'}};
      return ok({code,capacity:4,players,me:seat,phase:'waiting',kind,title:'방장 인계',hints:[],game:{},round,revision,serverMs:Date.now()});
    }
    if(a==='leave'){
      assert.deepEqual(opts,{round,waiting:true,host:true});assert.equal(seat,0);
      players=players.length===3?['해','달']:players.slice(1);
      round++;revision++;left++;notify?.();
      return ok({left:true});
    }
    throw Error('unexpected '+rpc+'/'+a);
  }};
  const exiting=await makePage(browser,model,'별',errors),promoted=await makePage(browser,model,'해',errors);
  try {
    const url=origin+'/games/'+kind+'/?room='+code;
    await Promise.all([exiting.goto(url),promoted.goto(url)]);
    const leave=exiting.getByRole('button',{name:'방 나가기',exact:true});
    await leave.waitFor();await promoted.getByRole('button',{name:'방 나가기',exact:true}).waitFor();
    exiting.once('dialog',d=>{assert.match(d.message(),/무작위/);return d.dismiss();});
    await leave.click();assert.equal(left,0);
    const request=new Promise(r=>{notify=r;});
    exiting.once('dialog',d=>d.accept());
    await leave.click();await request;
    await promoted.reload();await promoted.locator('li').filter({hasText:'해 · 방장'}).first().waitFor();
    assert.equal(await promoted.locator('li').filter({hasText:'별'}).count(),0);
    assert.equal(promoted.url(),url);
  }finally{await Promise.all([exiting.context().close(),promoted.context().close()]);}
}
(async()=>{const errors=[];const browser=await chromium.launch({executablePath:process.env.BROWSER_PATH||'/usr/bin/google-chrome',args:['--no-sandbox']});
try{for(const k of kinds){await check(browser,k,errors);console.log('Direct invitation host exit, cancel, same code and successor:',k);}assert.deepEqual(errors,[]);}
finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
