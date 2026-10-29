const pending=new Map();
const requestUUID=()=>{
 if(crypto.randomUUID)return crypto.randomUUID();
 const b=crypto.getRandomValues(new Uint8Array(16));b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;
 const h=[...b].map(x=>x.toString(16).padStart(2,'0')).join('');
 return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
};
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const messages={not_signed_in:'로그인한 회원만 대전할 수 있어요.',need_players:'4명 이상 모이면 시작할 수 있어요.',room_full:'방 인원이 가득 찼어요.',room_not_found:'방 코드를 다시 확인해 주세요.',invalid_code:'8자리 방 코드를 입력해 주세요.',room_unavailable:'참여할 수 없는 방이에요.',room_in_progress:'참여 중인 방을 먼저 열어 주세요.',room_already_started:'이미 시작한 방이에요.',not_room_owner:'방장만 시작할 수 있어요.',state_conflict:'상황이 바뀌었어요. 새 화면에서 다시 선택해 주세요.',not_your_turn:'아직 내 차례가 아니에요.',invalid_action:'지금은 할 수 없는 행동이에요.',banned:'지금은 대전을 이용할 수 없어요.',room_rate_limit:'잠시 뒤에 방을 만들어 주세요.',unavailable:'연결이 원활하지 않아요. 다시 시도해 주세요.',timeout:'응답이 늦어요. 다시 시도해 주세요.'};
export const online={embedded:window.parent!==window,available:false,owner:null,nickname:'',room:null,busy:false,error:'',onChange:()=>{},onNotice:()=>{},timer:null,createRequest:null,closed:false,
 get playing(){return !!this.room?.state;},
 request(body){
  if(!this.embedded)return Promise.reject(Error('not_signed_in'));
  const requestId=requestUUID();
  return new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{pending.delete(requestId);reject(Error('timeout'));},12000);
   pending.set(requestId,{resolve,reject,timer});
   parent.postMessage({source:'ojjuda-bang',type:'ojjuda-bang-request',requestId,body},location.origin);
  });
 },
 accept(room){
  if(room&&this.room?.id===room.id&&room.version<this.room.version)return;
  const changed=JSON.stringify([room?.id,room?.version,room?.status])!==JSON.stringify([this.room?.id,this.room?.version,this.room?.status]);
  this.room=room;this.error='';if(changed){this.onChange();if(room?.status==='finished')parent.postMessage({source:'ojjuda-bang',type:'ojjuda-bang-finished'},location.origin);}this.schedule();
 },
 schedule(){
  clearTimeout(this.timer);
  if(!this.closed&&this.room&&['waiting','active'].includes(this.room.status))this.timer=setTimeout(()=>this.poll(),document.hidden?6000:1800);
 },
 async poll(){
  if(this.busy||!this.room){this.schedule();return;}
  try{const result=await this.request({action:'read',room_id:this.room.id});if(result.ok)this.accept(result.room);else this.error=messages[result.error]||messages.unavailable;}
  catch{this.error=messages.unavailable;}
  if(this.error)this.onNotice(this.error);this.schedule();
 },
 async run(action,extra={}){
  if(this.busy)return;
  this.busy=true;this.error='';this.onChange();
  try{
   const request_id=action==='create'?(this.createRequest??=requestUUID()):requestUUID();
   const result=await this.request({action,request_id,...(this.room?{room_id:this.room.id,version:this.room.version}:{}),...extra});
   if(!result.ok)throw Error(result.error||'unavailable');
   this.busy=false;this.accept(result.room);if(action==='create')this.createRequest=null;
   this.onChange();
   if(['create','join','start','leave','surrender'].includes(action))parent.postMessage({source:'ojjuda-bang',type:'ojjuda-bang-rooms-changed'},location.origin);
   if(result.room?.status==='finished')parent.postMessage({source:'ojjuda-bang',type:'ojjuda-bang-finished'},location.origin);
   return result;
  }catch(error){
   this.error=messages[error.message]||messages.unavailable;this.onNotice(this.error);
   this.busy=false;
   if(error.message==='state_conflict')await this.poll();
   this.onChange();return null;
  }finally{this.busy=false;this.schedule();}
 },
 move(move){return this.run('move',{move});},
 exit(){parent.postMessage({source:'ojjuda-bang',type:'ojjuda-game-exit'},location.origin);},
 waiting(){
  const r=this.room;
  return `<main class="online-lobby"><div class="eyebrow">PLAY TOGETHER · 4–7 PLAYERS</div><h1>${esc(r.title)}</h1><p>방 코드 <strong class="room-code">${r.code}</strong> <button class="secondary" data-action="online-copy">복사</button></p><p>친구에게 코드를 알려주고 함께 입장하세요.</p><div class="online-seats">${Array.from({length:r.capacity},(_,i)=>`<div class="${i<r.names.length?'joined':''}"><b>${i+1}</b><span>${esc(r.names[i]||'친구 기다리는 중')}</span>${i===r.hostSeat?'<small>방장</small>':''}${i===r.seat?'<small>나</small>':''}</div>`).join('')}</div><p class="online-rule">${r.names.length}/${r.capacity}명 · 4명 이상이면 방장이 시작할 수 있어요.<br>역할과 캐릭터는 시작할 때 무작위로 정해져요.</p><div class="modal-actions">${r.hostSeat===r.seat?`<button class="primary" data-action="online-start" ${r.names.length<4||this.busy?'disabled':''}>대전 시작</button>`:'<span>방장의 시작을 기다리고 있어요.</span>'}<button class="secondary" data-action="online-leave" ${this.busy?'disabled':''}>대기실 나가기</button></div><p class="online-error" role="status">${esc(this.error)}</p></main>`;
 },
 lobby(){return `<main class="online-lobby"><img class="online-logo" src="assets/logo.png" alt="BANG!"><div class="eyebrow">OJ JU DA · PLAY TOGETHER</div><h1>정체를 숨기고,<br>친구와 한 판.</h1><p>4~7명이 각자 접속해서 함께하는 서부 카드게임</p>${this.available?`<div class="online-create"><label>방 이름<input id="online-title" maxlength="40" value="뱅! 같이 한 판 해요"></label><label>최대 인원<select id="online-capacity">${[4,5,6,7].map(n=>`<option>${n}</option>`).join('')}</select></label><button class="primary" data-action="online-create" ${this.busy?'disabled':''}>방 만들기</button></div><div class="online-join"><input id="online-code" aria-label="8자리 방 코드" placeholder="8자리 방 코드" maxlength="8" autocapitalize="characters" autocomplete="off"><button class="secondary" data-action="online-join" ${this.busy?'disabled':''}>참여</button><button class="secondary" data-action="online-mine" ${this.busy?'disabled':''}>내 방</button></div>`:'<p class="online-rule">아지트에 로그인하면 친구와 대전할 수 있어요.</p>'}<div class="online-practice"><button class="secondary" data-action="tutorial-start">눌러서 배우기</button><button class="secondary" data-action="solo-lobby">컴퓨터와 연습</button></div><p class="online-rule">이번 달 순위는 현재 연승순 · 패배·기권 시 0연승<br>컴퓨터 연습과 튜토리얼은 순위에 포함되지 않아요.</p><p class="online-error" role="status">${esc(this.error)}</p></main>`;}
};
window.addEventListener('message',event=>{
 if(event.origin!==location.origin||event.source!==parent||event.data?.source!=='ojjuda-world')return;
 const message=event.data;
 if(message.type==='ojjuda-bang-init'){
  online.owner=message.owner||null;online.nickname=String(message.nickname||'').slice(0,12);online.available=!!message.onlineAvailable;
  online.onChange();
  if(online.available)void online.run(message.joinCode?'join':'mine',message.joinCode?{code:message.joinCode}:{});
 }
 if(message.type==='ojjuda-bang-response'){
  const request=pending.get(message.replyTo);if(!request)return;
  pending.delete(message.replyTo);clearTimeout(request.timer);request.resolve(message.result);
 }
});
window.addEventListener('pagehide',()=>{online.closed=true;clearTimeout(online.timer);});
window.addEventListener('pageshow',()=>{online.closed=false;online.schedule();});
window.addEventListener('visibilitychange',()=>{if(!document.hidden)void online.poll();});
