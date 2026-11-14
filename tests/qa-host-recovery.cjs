'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {randomUUID}=require('node:crypto');
const script=fs.readFileSync(process.argv[2]||path.join(process.cwd(),'games/drinking/child.js'),'utf8');
const parent='AB12CD', child='DC21BA', lobby='/games/drinking/?room='+parent, rooms='/games/drinking/?mode=multi';
const tick=()=>new Promise(r=>setImmediate(r));
function model() {
  return {members:['Host','Guest','Other'],phase:'playing',revision:3,exists:true,
    state(actor){return {code:parent,revision:this.revision,me:this.members.indexOf(actor),players:this.members.slice(),phase:this.phase,kind:'truth',child};}};
}
function page(actor,room) {
  const events={},listeners={},main=[],h={current:null},log=[],dialogs=[],nav=[],copied=[];
  const controls={confirm:true,online:true,reject:'',invalid:false,lost:false,blocked:null};
  function element(){return {addEventListener(n,f){this[n]=f;},replaceWith(n){h.current=n;},setAttribute(){}};}
  const statusElem=element();
  const doc={hidden:false,querySelector:s=>s==='header a'?h.current:{append(n){main.push(n);}},
    createElement:s=>s==='p'?statusElem:element(),getElementById:()=>({}),
    addEventListener(n,f){listeners[n]=f;}};
  h.current=element();
  const win={confirm(prompt){dialogs.push(prompt);return controls.confirm;},addEventListener(n,f){events[n]=f;}};
  const ctx={window:win,document:doc,location:{origin:'https://example.test',pathname:'/games/truth/',search:'?party='+parent+'&room='+child,replace(url){nav.push(url);}},
    navigator:{clipboard:{async writeText(link){copied.push(link);}}},crypto:{randomUUID},URLSearchParams,URL,AbortSignal,setTimeout(){},clearTimeout(){}};
  vm.runInNewContext(script,ctx);
  async function request(a,opts){
    log.push([a,structuredClone(opts)]);
    const fail=m=>({data:null,error:{message:m}});
    if(controls.blocked)await controls.blocked;
    if(!controls.online)throw Error('연결 오류');
    if(!room.exists)return fail('room_unavailable');
    const me=room.members.indexOf(actor);
    if(me<0)return fail('not_room_member');
    if(a==='state')return {data:room.state(actor)};
    if(controls.reject){const rejected=controls.reject;controls.reject='';return fail(rejected);}
    if(opts.revision!==room.revision)return fail('stale_state');
    if(controls.invalid){controls.invalid=false;return {data:{left:false}};}
    if(a==='leave'){
      room.members.splice(me,1);
      if(me===0&&room.members.length>1)room.members.unshift(room.members.pop());
      if(!room.members.length)room.exists=false;
      room.phase='lobby';room.revision++;
      if(controls.lost){controls.lost=false;throw Error('lost response');}
      return {data:{left:true}};
    }
    if(a==='return'){
      if(me!==0)return fail('host_only');
      room.phase='lobby';room.revision++;return {data:room.state(actor)};
    }
    throw Error(a);
  }
  const client={rpc(n,{p_action:a,p_options:o}){assert.equal(n,'drinking_room');return {abortSignal:()=>request(a,o)};}};
  return {feature:win.DrinkingChild,room,log,controls,dialogs,nav,copied,status:statusElem,
    connect:()=>win.DrinkingChild.connect(client),copy:()=>h.current.click(),
    async click(act){const button={hasAttribute:key=>key==='data-party-'+act};listeners.click({target:{closest:()=>button}});await tick();return button;},
    async sync(){events.focus();await tick();}};
}
(async()=>{
 let room=model(),host=page('Host',room),guest=page('Guest',room),third=page('Other',room);
 for(const p of [host,guest,third]){assert.equal(await p.connect(),true);p.feature.setPhase('pick');}
 assert.match(guest.feature.control('leave'),/data-party-leave/);
 assert.doesNotMatch(guest.feature.control('leave'),/data-party-return/);
 assert.match(host.feature.control('leave'),/data-party-return/);
 await guest.click('return');assert.equal(guest.dialogs.length,0);
 assert.match(host.feature.control('leave'),/data-party-leave/);
 host.controls.confirm=false;await host.click('leave');assert.match(host.dialogs.at(-1),/새 방장/);
 assert.equal(host.log.filter(([a])=>a==='leave').length,0);host.controls.confirm=true;
 guest.controls.confirm=false;await guest.click('leave');assert.equal(guest.log.filter(([a])=>a==='leave').length,0);
 assert.match(guest.dialogs[0],/이번 판은 끝나고 남은 사람들은 대기실/);
 await guest.copy();const copied=guest.status.textContent;assert.ok(copied.includes('복사'));await guest.sync();assert.equal(guest.status.textContent,copied);
 guest.controls.online=false;await guest.sync();assert.ok(!guest.status.hidden && guest.status.textContent);
 guest.controls.online=true;await guest.sync();assert.ok(guest.status.hidden);
 guest.controls.confirm=true;guest.controls.reject='host_only';await guest.click('leave');assert.ok(!guest.status.hidden && guest.status.textContent);assert.equal(guest.nav.length,0);
 const first=guest.log.find(([a])=>a==='leave')[1].request_id;
 guest.controls.invalid=true;await guest.click('leave');assert.match(guest.status.textContent,/나간 상태/);assert.equal(guest.nav.length,0);
 assert.equal(guest.log.filter(([a])=>a==='leave').at(-1)[1].request_id,first);
 room.revision++;await guest.click('leave');assert.match(guest.status.textContent,/다시 눌러/);
 assert.equal(guest.nav.length,0);assert.equal(room.members.length,3);
 let unblock;guest.controls.blocked=new Promise(r=>unblock=r);const before=guest.log.filter(([a])=>a==='leave').length;
 await guest.click('leave');await guest.click('leave');assert.equal(guest.log.filter(([a])=>a==='leave').length,before+1);
 unblock();await tick();
 assert.notEqual(guest.log.filter(([a])=>a==='leave').at(-1)[1].request_id,first);
 assert.deepEqual(guest.nav,[rooms]);assert.deepEqual(room.members,['Host','Other']);
 await host.sync();await third.sync();assert.deepEqual(host.nav,[lobby]);assert.deepEqual(third.nav,[lobby]);
 assert.deepEqual(guest.copied,['https://example.test'+lobby]);
 room=model();guest=page('Guest',room);await guest.connect();guest.feature.setPhase('done');
 assert.match(guest.feature.control('leave'),/data-party-wait/);assert.match(guest.feature.control('leave'),/data-party-leave/);
 guest.controls.lost=true;await guest.click('leave');assert.deepEqual(guest.nav,[rooms]);assert.ok(!room.members.includes('Guest'));
 room=model();host=page('Host',room);await host.connect();host.feature.setPhase('done');
 await host.click('return');assert.equal(host.dialogs.length,0);assert.deepEqual(host.nav,[lobby]);assert.deepEqual(room.members,['Host','Guest','Other']);
 room=model();host=page('Host',room);third=page('Other',room);await host.connect();await third.connect();
 host.feature.setPhase('pick');host.controls.lost=true;await host.click('leave');
 assert.deepEqual(room.members,['Other','Guest']);assert.deepEqual(host.nav,[rooms]);await third.sync();assert.deepEqual(third.nav,[lobby]);
 room=model();room.members=['Host'];host=page('Host',room);await host.connect();
 host.controls.lost=true;await host.click('leave');
 assert.equal(room.exists,false);assert.match(host.dialogs.at(-1),/닫혀요/);assert.deepEqual(host.nav,[rooms]);
 console.log('PASS guest leave during/after game, explicit confirmation/cancel, wrong role, server rejection, stale revision, idempotent retry, double click, lost leave response, group return, transient poll error clearing and preserving copy notice.');
})().catch(e=>{console.error(e);process.exitCode=1;});
