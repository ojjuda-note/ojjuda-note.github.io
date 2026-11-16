import {newGame, act} from './rules.mjs?v=1';
const encoder=new TextEncoder();
const curve={name:'ECDSA',namedCurve:'P-256'};
const signing={name:'ECDSA',hash:'SHA-256'};
const pack=bytes=>btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
const unpack=s=>Uint8Array.from(atob(s.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));
const validId=s=>typeof s==='string'&&/^B[A-Za-z0-9_-]{86}$/.test(s);
const saved=(key)=>{try{return JSON.parse(sessionStorage.getItem('island-yut:'+key));}catch{return null;}};
const save=(key,value)=>{try{sessionStorage.setItem('island-yut:'+key,JSON.stringify(value));}catch{}};
async function identity(jwk){
  let privateKey,publicKey;
  if(jwk){
    privateKey=await crypto.subtle.importKey('jwk',jwk,curve,true,['sign']);
    const pub={...jwk,key_ops:['verify']}; delete pub.d;
    publicKey=await crypto.subtle.importKey('jwk',pub,curve,true,['verify']);
  }else{
    ({privateKey,publicKey}=await crypto.subtle.generateKey(curve,true,['sign','verify']));
    jwk=await crypto.subtle.exportKey('jwk',privateKey);
  }
  return {jwk,privateKey,id:pack(await crypto.subtle.exportKey('raw',publicKey))};
}
export async function openRoom(invite,update,clientFactory=()=>window.OjjudaGetClient()){
  if(invite&&!validId(invite))throw Error('초대 링크를 다시 확인해 주세요.');
  const me=await identity(invite?saved('key:'+invite):null);
  const host=invite||me.id,isHost=host===me.id;
  save('key:'+host,me.jwk);
  const topic=pack(await crypto.subtle.digest('SHA-256',encoder.encode(host)));
  const client=await clientFactory(),channel=client.channel('island-yut-v1-'+topic,{config:{broadcast:{ack:true,self:false}}});
  const keys=new Map(),seen=new Map(),online=new Map();
  let closed=false,connected=false,timer=0,lastHost=Date.now(),notice='',clock=0,atHost=0;
  let snapshot=isHost?(saved('state:'+host)||{seats:[host],game:null}):{seats:[],game:null};
  const view=()=>({host,isHost,seats:snapshot.seats,seat:snapshot.seats.indexOf(me.id),game:snapshot.game,
    status:notice||(!connected?'방에 연결 중이에요.':!isHost&&Date.now()-lastHost>14000?'방장 연결을 기다리고 있어요.':!isHost&&!snapshot.seats.includes(me.id)?'방장의 응답을 기다리고 있어요.':''),
    connected:connected&&(isHost||Date.now()-lastHost<14000)});
  function render(){if(!closed)update(view());}
  async function send(type,data){
    if(!connected||closed)return;
    const body={room:host,from:me.id,type,data,seq:Math.max(Date.now()*100,clock+1)};clock=body.seq;
    const sig=pack(await crypto.subtle.sign(signing,me.privateKey,encoder.encode(JSON.stringify(body))));
    if(!closed)await channel.send({type:'broadcast',event:'game',payload:{body,sig}});
  }
  function broadcast(){return send('state',snapshot);}
  function changed(){save('state:'+host,snapshot);render();void broadcast().catch(()=>{});}
  function take(id,data){
    if(!snapshot.game||snapshot.seats.indexOf(id)!==snapshot.game.team||data?.revision!==snapshot.game.revision)return;
    const next=act(snapshot.game,data.action);
    if(next!==snapshot.game){snapshot={...snapshot,game:next};changed();}
  }
  async function receive({payload}){
    try{
      const {body,sig}=payload;if(!body||body.room!==host||!validId(body.from)||!Number.isSafeInteger(body.seq)||typeof sig!=='string')return;
      if(!isHost&&body.from!==host)return;
      if(isHost&&!['hi','action','bye'].includes(body.type))return;
      if(body.seq<=(seen.get(body.from)||0)||Math.abs(body.seq/100-Date.now())>300000)return;
      if(!keys.has(body.from))keys.set(body.from,crypto.subtle.importKey('raw',unpack(body.from),curve,false,['verify']));
      if(!await crypto.subtle.verify(signing,await keys.get(body.from),unpack(sig),encoder.encode(JSON.stringify(body))))return;
      if(closed||body.seq<=(seen.get(body.from)||0))return;
      seen.set(body.from,body.seq);
      if(!isHost){
        lastHost=Date.now();
        if(body.type==='state'&&Array.isArray(body.data?.seats)){
          snapshot=body.data;notice=snapshot.seats.includes(me.id)?'':snapshot.game?'이미 시작한 방이에요.':snapshot.seats.length===4?'자리가 모두 찼어요.':'';
        }else if(body.type==='closed')notice='방장이 방을 닫았어요.';
        render();return;
      }
      const id=body.from;
      if(body.type==='hi'){
        online.set(id,Date.now());
        if(!snapshot.game&&!snapshot.seats.includes(id)&&snapshot.seats.length<4){
          snapshot={...snapshot,seats:[...snapshot.seats,id]};changed();
        }else if(!snapshot.seats.includes(id)||!atHost||Date.now()-atHost>700){atHost=Date.now();void broadcast().catch(()=>{});}
      }
      if(body.type==='bye'&&!snapshot.game){snapshot={...snapshot,seats:snapshot.seats.filter(s=>s!==id)};changed();}
      if(body.type==='action')take(id,body.data);
    }catch{/* Ignore incomplete or malformed network messages. */}
  }
  try{
    await new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>reject(Error('연결이 늦어지고 있어요. 다시 시도해 주세요.')),14000);
      channel.on('broadcast',{event:'game'},receive).subscribe(status=>{
        if(closed)return;
        connected=status==='SUBSCRIBED';
        if(connected){clearTimeout(timeout);resolve();if(!isHost)void send('hi',null).catch(()=>{});}
        else if(['CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(status)){clearTimeout(timeout);reject(Error('방에 연결하지 못했어요. 다시 시도해 주세요.'));}
        render();
      });
    });
  }catch(e){closed=true;void client.removeChannel(channel);throw e;}
  snapshot.seats.forEach(id=>online.set(id,Date.now()));
  timer=setInterval(()=>{
    if(isHost&&connected){
      if(!snapshot.game){
        const seats=snapshot.seats.filter(s=>s===host||Date.now()-(online.get(s)||0)<18000);
        if(seats.length!==snapshot.seats.length){snapshot={...snapshot,seats};changed();}
      }
      void broadcast().catch(()=>{});
    }else if(connected)void send('hi',null).catch(()=>{});
    render();
  },4000);
  render();
  return {view,start(){if(!isHost||!connected||snapshot.game||snapshot.seats.length<2)return;
      snapshot={...snapshot,game:newGame(snapshot.seats.length)};changed();},
    action(action){if(!connected||!snapshot.game)return;
      const data={revision:snapshot.game.revision,action};
      if(isHost)take(me.id,data);else void send('action',data).catch(()=>{});},
    async close(){clearInterval(timer);try{await send(isHost?'closed':'bye',null);}finally{closed=true;connected=false;await client.removeChannel(channel);}}
  };
}
