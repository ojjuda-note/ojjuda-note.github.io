import {TEAMS,validTeamCount,DEFAULT_MODE,DEFAULT_PIECES,newMatch,act,restoreGame} from './rules.mjs?v=21';
const encoder=new TextEncoder();
const curve={name:'ECDSA',namedCurve:'P-256'};
const signing={name:'ECDSA',hash:'SHA-256'};
const pack=bytes=>btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
const unpack=s=>Uint8Array.from(atob(s.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));
const validId=s=>typeof s==='string'&&/^B[A-Za-z0-9_-]{86}$/.test(s);
const saved=(key)=>{try{return JSON.parse(sessionStorage.getItem('island-yut:'+key));}catch{return null;}};
const save=(key,value)=>{try{sessionStorage.setItem('island-yut:'+key,JSON.stringify(value));}catch{}};
export async function roomIdentity(jwk){
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
export function roomCode(value){
  const raw=String(value??'').trim();
  if(validId(raw))return raw;
  const hash=raw.indexOf('#');
  const code=new URLSearchParams(hash>=0?raw.slice(hash+1):raw).get('room');
  return validId(code)?code:null;
}
export async function openRoom(invite,update,clientFactory=()=>window.OjjudaGetClient(),setup=null,access=null){
  if(invite!=null&&!validId(invite))throw Error('초대 링크를 다시 확인해 주세요.');
  if(setup&&!validTeamCount(setup.count))throw Error('초대방 정원은 2~'+TEAMS.length+'명이에요.');
  const me=access?.identity||await roomIdentity(invite?saved('key:'+invite):null);
  const host=invite||me.id,isHost=host===me.id;
  if(!access)save('key:'+host,me.jwk);
  const topic=pack(await crypto.subtle.digest('SHA-256',encoder.encode(host)));
  const keys=new Map(),seen=new Map(),online=new Map();
  let closed=false,connected=false,timer=0,lastHost=Date.now(),notice='',clock=0,atHost=0,reading=null,lastRead=0,starting=false,closing=null;
  let directory=access?.initial??null,directoryError='',terminal=false;
  const initial={seats:directory?.players.map(p=>p.key)||[host],game:null,setup:directory?.setup??setup};
  let snapshot=isHost?(saved('state:'+host)||initial):{seats:[],game:null};
  if(directory&&isHost&&directory.status==='playing'&&!snapshot.game)throw Error('게임을 이어갈 정보가 없어요. 방을 새로 만들어 주세요.');
  if(directory&&isHost&&!snapshot.game)snapshot=initial;
  if(isHost&&snapshot.game)snapshot={...snapshot,game:restoreGame(snapshot.game)};
  const client=await clientFactory(),channel=client.channel('island-yut-v1-'+topic,{config:{broadcast:{ack:true,self:false}}});
  const limit=()=>snapshot.setup?.count??TEAMS.length;
  const view=()=>({host,isHost,seats:snapshot.seats,seat:snapshot.seats.indexOf(me.id),game:snapshot.game,setup:snapshot.setup??directory?.setup??null,
    ...(directory?{directory:true,closed:terminal,room_no:directory.room_no,title:directory.title,names:Object.fromEntries(directory.players.map(p=>[p.key,p.name])),players:directory.players.map((p,seat)=>({...p,seat}))}:{}),
    status:notice||directoryError||(!connected?'방에 연결 중이에요.':!isHost&&Date.now()-lastHost>14000?'방장 연결을 기다리고 있어요.':!isHost&&!snapshot.seats.includes(me.id)?'방장의 응답을 기다리고 있어요.':''),
    connected:connected&&!directoryError&&(isHost||Date.now()-lastHost<14000)});
  function render(){if(!closed)update(view());}
  async function send(type,data){
    if(!connected||closed)return;
    const body={room:host,from:me.id,type,data,seq:Math.max(Date.now()*100,clock+1)};clock=body.seq;
    const sig=pack(await crypto.subtle.sign(signing,me.privateKey,encoder.encode(JSON.stringify(body))));
    if(!closed)await channel.send({type:'broadcast',event:'game',payload:{body,sig}});
  }
  function broadcast(){return send('state',snapshot);}
  function changed(){save('state:'+host,snapshot);render();void broadcast().catch(()=>{});}
  function acceptDirectory(next){
    if(!next||next.host!==host||next.room_no!==directory?.room_no)throw Error('방 정보를 다시 확인해 주세요.');
    directory=next;directoryError='';
    if(isHost){
      if(!snapshot.game){
        const seats=next.players.filter(p=>!p.departed).map(p=>p.key);
        if(JSON.stringify(seats)!==JSON.stringify(snapshot.seats)){snapshot={...snapshot,seats,setup:next.setup};changed();}
      }else{
        // Departed seats stay in order; the host's existing computer driver can
        // finish their turns without handing a human's seat to a newcomer.
        const departed=snapshot.seats.flatMap((key,i)=>next.players.some(p=>p.key===key&&!p.departed)?[]:[i]);
        const bots=[...new Set([...(snapshot.game.computerTeams||[]),...departed])];
        if(bots.length!==(snapshot.game.computerTeams||[]).length){snapshot={...snapshot,game:{...snapshot.game,computerTeams:bots,revision:snapshot.game.revision+1}};changed();}
      }
    }
    render();return next;
  }
  function refreshDirectory(force=false){
    if(!access||closed||terminal)return Promise.resolve(directory);
    if(reading)return reading;
    if(!force&&Date.now()-lastRead<1000)return Promise.resolve(directory);
    lastRead=Date.now();
    reading=access.read().then(next=>{if(!closed)return acceptDirectory(next);return next;}).catch(error=>{
      if(!closed){
        directoryError=error.message||'방 연결을 다시 확인하고 있어요.';
        if(['room_unavailable','not_room_member','not_signed_in','banned'].includes(error.code)){
          terminal=true;clearInterval(timer);void client.removeChannel(channel);
        }
        render();
      }throw error;
    }).finally(()=>{reading=null;});return reading;
  }
  const authorized=id=>!directory||directory.players.some(p=>p.key===id&&!p.departed);
  function apply(action){
    const next=act(snapshot.game,action);
    if(next!==snapshot.game){snapshot={...snapshot,game:next};changed();}
  }
  function take(id,data){
    if(closing||directoryError||!authorized(id)||!snapshot.game||snapshot.game.phase==='opening'||snapshot.seats.indexOf(id)!==snapshot.game.team||data?.revision!==snapshot.game.revision)return;
    apply(data.action);
  }
  async function receive({payload}){
    try{
      if(closed||terminal)return;
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
          snapshot=body.data;notice=snapshot.seats.includes(me.id)?'':snapshot.game?'이미 시작한 방이에요.':snapshot.seats.length>=limit()?'자리가 모두 찼어요.':'';
        }else if(body.type==='closed'){
          notice='방장이 방을 닫았어요.';
          if(access){directoryError=notice;terminal=true;clearInterval(timer);void client.removeChannel(channel);}
        }
        render();return;
      }
      const id=body.from;
      if(access&&!authorized(id))await refreshDirectory();
      if(!authorized(id))return;
      if(body.type==='hi'){
        online.set(id,Date.now());
        if(!access&&!snapshot.game&&!snapshot.seats.includes(id)&&snapshot.seats.length<limit()){
          snapshot={...snapshot,seats:[...snapshot.seats,id]};changed();
        }else if(!snapshot.seats.includes(id)||!atHost||Date.now()-atHost>700){atHost=Date.now();void broadcast().catch(()=>{});}
      }
      if(body.type==='bye'&&!snapshot.game&&!access){snapshot={...snapshot,seats:snapshot.seats.filter(s=>s!==id)};changed();}
      if(body.type==='bye'&&access)void refreshDirectory(true).catch(()=>{});
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
    if(access)void refreshDirectory(true).catch(()=>{});
    if(isHost&&connected){
      if(!snapshot.game&&!access){
        const seats=snapshot.seats.filter(s=>s===host||Date.now()-(online.get(s)||0)<18000);
        if(seats.length!==snapshot.seats.length){snapshot={...snapshot,seats};changed();}
      }
      void broadcast().catch(()=>{});
    }else if(connected)void send('hi',null).catch(()=>{});
    render();
  },4000);
  render();
  function beginGame(zodiacOffset,mode,pieceCounts,fillBots){
      if(closing||directoryError||!isHost||!connected||snapshot.game)return;
      const humans=snapshot.seats.length,settings=snapshot.setup,count=settings?.count??humans;
      if(count<2||humans>count||(!fillBots&&humans<count))return;
      const bots=Array.from({length:count-humans},(_,i)=>humans+i);
      const game=newMatch(count,settings?.offset??zodiacOffset,settings?.mode??mode,settings?.counts??pieceCounts,bots,settings?.animals);
      snapshot={...snapshot,game};changed();
  }
  return {view,start(zodiacOffset=2,mode=DEFAULT_MODE,pieceCounts=DEFAULT_PIECES,fillBots=false){
      if(!access)return beginGame(zodiacOffset,mode,pieceCounts,fillBots);
      if(closing||terminal||!isHost||!connected||snapshot.game||starting)return Promise.resolve();
      starting=true;
      return refreshDirectory(true).then(()=>access.start(snapshot.seats,fillBots)).then(next=>{
        if(closed)return;acceptDirectory(next);beginGame(zodiacOffset,mode,pieceCounts,fillBots);
      }).finally(()=>{starting=false;});
    },
    opening(action){
      if(!closing&&!directoryError&&isHost&&connected&&snapshot.game?.phase==='opening')apply(action);
    },
    computerAction(action,revision){
      const g=snapshot.game;
      if(!closing&&!directoryError&&isHost&&connected&&g&&g.phase!=='opening'&&g.revision===revision&&g.computerTeams?.includes(g.team))apply(action);
    },
    action(action){if(closing||!connected||directoryError||!snapshot.game)return;
      const data={revision:snapshot.game.revision,action};
      if(isHost)take(me.id,data);else void send('action',data).catch(()=>{});},
    async close(){
      if(closed)return;
      if(closing)return closing;
      clearInterval(timer);
      closing=(async()=>{
        try{if(access)await access.leave();await send(isHost?'closed':'bye',null);}
        finally{closed=true;connected=false;await client.removeChannel(channel);}
      })();return closing;
    }
  };
}
