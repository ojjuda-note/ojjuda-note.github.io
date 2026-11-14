'use strict';
(() => {
  const games = [
    ['croc','악어 이빨','🐊','아픈 이빨은 딱 하나','#d8e9cb'],
    ['bottle','술병 나침반','🍾','병 끝이 가리키는 사람','#d7eae4'],
    ['bomb','시간폭탄','💣','터지기 전에 넘겨요','#f5d7c9'],
    ['stopwatch','감각 스톱워치','⏱️','목표 시간에 멈추기','#dce8dd'],
    ['liar','라이어 찾기','🎭','단어를 모르는 한 사람','#e6dded'],
    ['king','왕게임','👑','왕의 미션은 몇 번에게?','#f4e3b7'],
    ['truth','진실게임','🃏','솔직한 질문 카드','#f3d9d8'],
    ['initial','초성 대결','💬','5초 안에 단어 하나','#d8e6ed'],
    ['minority','소수파 찾기','⚖️','우리의 선택은 몇 대 몇?','#d7e6cf'],
    ['mission','한 명만 다른 미션','🎬','누구의 몸짓이 다를까?','#efd6c9'],
    ['fingers','손병호 게임','🖐️','해당하면 손가락 하나 접기','#f0dbc2'],
    ['imagevote','이미지 게임','🪞','이 질문에 딱 맞는 사람은?','#dbe2f1'],
    ['updown','업앤다운','🔢','숫자를 부르면 업 또는 다운','#dbe7ef']
  ].map(([id,name,icon,description,color]) => ({id,name,icon,description,color}));

  const byId = id => document.getElementById(id);
  const gameById = id => games.find(game => game.id === id);
  const gameMin = kind => ['liar','king','minority','mission'].includes(kind) ? 3 : 2;
  const codePattern = /^[A-Z0-9]{6}$/;
  const params = new URL(location.href).searchParams;
  if (!params.has('room') && !params.has('game') && params.get('mode') !== 'multi') {
    const code=(params.get('resume')||'').toUpperCase(), direct=params.get('gameFrom');
    if(codePattern.test(code)&&(!direct||gameById(direct))){
      const resume=byId('resume-drinks');
      resume.href=direct?'/games/'+direct+'/?room='+code:'?room='+code;
      resume.hidden=false;
    }
    byId('play-modes').hidden = false;
    return;
  }
  byId('hub-back').href = '/games/drinking/';
  byId('hub-back').textContent = '← 술게임 메인';
  byId('hub-back').classList.add('drinks-home');
  byId('hub-back').closest('header').classList.add('drinks-room-header');
  byId('welcome').hidden = false;
  const inviteCode = (params.get('room') || '').trim().toUpperCase();
  const suggested = !inviteCode && gameById(params.get('game'));
  const notice = byId('notice'), message = byId('room-message'), list = byId('room-list');
  let client, actor, room, pollTimer, polling = false, busy = false, navigating = false, subscribed = false;
  let generation = 0, lastMutation, listSequence = 0;
  byId('hub-back').addEventListener('click',event=>{
    if(event.button||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
    navigating=true;generation++;clearTimeout(pollTimer);
  });
  const messages = {
    not_signed_in:'오쭈다에 로그인해 주세요.', banned:'현재 이 계정으로 대전방을 이용할 수 없어요.',
    wrong_password:'방 비밀번호가 맞지 않아요.', invalid_password:'비밀번호를 4~32자로 입력해 주세요.',
    invalid_title:'방 제목과 최대 인원을 확인해 주세요.', invalid_capacity:'최대 인원을 2~12명으로 골라 주세요.',
    not_room_member:'방 비밀번호를 입력해 주세요.', room_unavailable:'방이 닫혔거나 만료됐어요.',
    room_full:'자리가 모두 찼어요.', join_rate_limit:'비밀번호를 여러 번 틀렸어요. 잠시 뒤 다시 시도해 주세요.',
    room_in_progress:'참여 중인 방을 먼저 나가 주세요.', room_already_started:'이미 게임이 시작됐어요.',
    host_only:'방장만 할 수 있어요.', stale_state:'방 상태가 바뀌었어요. 현재 대기실을 확인해 주세요.',
    unavailable:'방 상태가 바뀌었어요. 다시 확인해 주세요.', not_enough_players:'게임에 필요한 인원이 아직 모이지 않았어요.'
  };
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  const capacity = byId('create-form').elements.capacity;
  for (let n=2;n<=12;n++) {
    const option = el('option','',n+'명'); option.value=String(n); option.selected=n===4; capacity.append(option);
  }
  const tiles = games.map(game => {
    const tile = el('button','tile');
    tile.type='button'; tile.dataset.game=game.id;
    const icon=el('span','game-icon',game.icon);
    icon.setAttribute('aria-hidden','true'); icon.style.backgroundColor=game.color;
    const copy=el('span','tile-copy');
    copy.append(el('strong','',game.name),el('small','',game.description));
    tile.append(icon,copy);
    tile.onclick=()=> {
      if (room?.me!==0 || room.kind===game.id || busy) return;
      mutate('select', {kind:game.id,revision:room.revision});
    };
    return tile;
  });
  byId('games').replaceChildren(...tiles);

  function updateActions() {
    byId('create-form').querySelector('button').disabled=busy;
    byId('join-form').querySelector('button').disabled=busy;
    if (!room) return;
    const host=room.me===0, selected=gameById(room.kind);
    byId('start').hidden=!host;
    byId('start').disabled=busy || !selected || room.players.length<gameMin(room.kind);
    byId('leave').disabled=busy;
    tiles.forEach(tile=>{
      const chosen=tile.dataset.game===room.kind;
      tile.setAttribute('aria-pressed', String(chosen));
      tile.disabled=busy || !host;
    });
  }

  function render(next) {
    if(navigating)return;
    if (!next || !codePattern.test(next.code) || !Array.isArray(next.players)) throw Error('invalid_room');
    if (room && room.code===next.code && room.revision>=next.revision) return;
    const promoted=room?.code===next.code && room.me>0 && next.me===0;
    room=next; listSequence++; byId('welcome').hidden=true; byId('lobby').hidden=false;
    byId('hub-back').href='/games/drinking/?resume='+room.code;
    const url=new URL('/games/drinking/',location.origin);
    url.searchParams.set('room',room.code); history.replaceState(null,'',url);
    if (room.phase==='playing' && gameById(room.kind) && codePattern.test(room.child)) {
      navigating=true;clearTimeout(pollTimer);
      location.replace('/games/'+room.kind+'/?room='+room.child+'&party='+room.code);
      return;
    }
    byId('room-title').textContent=room.title;
    document.title=room.title+' · 술게임';
    byId('lobby-code').textContent=room.code;
    byId('member-count').textContent='참가자 '+room.players.length+'/'+room.capacity+'명';
    byId('members').replaceChildren(...room.players.map((name,i)=>{
      const marks=[i===0?'방장':'',i===room.me?'나':''].filter(Boolean);
      return el('li',i===room.me?'me':'',name+(marks.length?' ('+marks.join(' · ')+')':''));
    }));
    const selected=gameById(room.kind);
    let line=selected?'선택한 게임 · '+selected.name:(room.me===0?'하고 싶은 게임을 골라 주세요.':'방장이 게임을 고르고 있어요.');
    if (promoted) line='새 방장이 되었어요. '+line;
    if (selected && room.players.length<gameMin(room.kind)) line+=' · '+gameMin(room.kind)+'명부터 시작할 수 있어요.';
    byId('selected-game').textContent=line;
    updateActions(); schedule();
  }

  function showEntry(invite='') {
    byId('hub-back').href='/games/drinking/';
    room=null; clearTimeout(pollTimer); document.title='술게임 멀티 · 오쭈다';
    byId('lobby').hidden=true; byId('welcome').hidden=false; byId('account').hidden=true; byId('entry').hidden=false;
    byId('create-form').hidden=!!invite; byId('rooms').hidden=!!invite; byId('all-rooms').hidden=!invite;
    byId('room-code').value=invite; updateActions();
  }

  function authScreen(text,login=false,retry=false) {
    byId('lobby').hidden=true; byId('welcome').hidden=false; byId('entry').hidden=true; byId('account').hidden=false;
    byId('account-message').textContent=text;
    byId('login').hidden=!login; byId('retry').hidden=!retry;
  }
  async function rpc(action,code='',options={}) {
    if (!navigator.onLine) throw Error('offline');
    const query=client.rpc('drinking_room',{p_action:action,p_code:code,p_options:options});
    const {data,error}=await (query.abortSignal ? query.abortSignal(AbortSignal.timeout(12000)) : query);
    if (error || data?.error) throw Error(error?.message || data.error);
    return data;
  }
  function explain(err) { return messages[err.message] || '연결을 확인한 뒤 다시 시도해 주세요.'; }

  async function listRooms() {
    if (!actor || room || byId('rooms').hidden) return;
    const seq=++listSequence; byId('refresh').disabled=true;
    list.replaceChildren(); message.textContent='방을 불러오는 중이에요.';
    try {
      const data=await rpc('list'); if(seq!==listSequence || room)return;
      if (!Array.isArray(data?.rooms)) throw Error('invalid_rooms');
      const links=data.rooms.filter(r=>codePattern.test(r?.code) && (r.phase==='lobby' || r.mine===true)).map(r=>{
        const row=el('li'), link=el('a','room');
        link.href='/games/drinking/?room='+r.code;
        link.dataset.room=r.code; link.dataset.member=String(r.mine===true); link.dataset.status=r.phase;
        const info=el('span','room-copy');
        info.append(el('strong','',r.title),el('small','',[
          r.mine && '내 방', r.phase==='playing'?'게임 중':'대기 중',r.players+'/'+r.capacity+'명', r.host && '방장 '+r.host
        ].filter(Boolean).join(' · ')));
        link.append(info,el('span','room-go',r.mine?'이어서 입장 ›':'입장 ›'));row.append(link);return row;
      });
      list.replaceChildren(...links);message.textContent=links.length?'':'아직 열린 방이 없어요.';
    } catch(err) { if(seq===listSequence)message.textContent=explain(err); }
    finally { if(seq===listSequence)byId('refresh').disabled=false; }
  }

  function schedule() {
    clearTimeout(pollTimer);
    if(room&&!document.hidden&&!navigating) pollTimer=setTimeout(sync,1250);
  }
  async function sync() {
    if (!room || busy || polling || document.hidden || navigating) return;
    const code=room.code, gen=generation; polling=true;
    try {
      const next=await rpc('state',code);
      if(gen===generation && room?.code===code) {
        render(next);
        if(notice.dataset.network){notice.textContent='';delete notice.dataset.network;}
      }
    } catch(err) {
      if(gen===generation && room?.code===code) {
        notice.textContent=explain(err);notice.dataset.network='1';
        if(['room_unavailable','not_room_member'].includes(err.message)){
          history.replaceState(null,'','/games/drinking/?mode=multi');showEntry();void listRooms();
        }
      }
    } finally {polling=false;schedule();}
  }

  function operationId(action,code,opts) {
    const signature=JSON.stringify([action,code,opts]);
    if(lastMutation?.signature!==signature) lastMutation={signature,id:crypto.randomUUID()};
    return lastMutation.id;
  }
  async function mutate(action,options,code=room?.code || '') {
    if(busy || !actor || navigating)return;
    const gen=generation; busy=true;updateActions();notice.textContent='';delete notice.dataset.network;
    try {
      const opts={...options};
      if(action!=='join')opts.request_id=operationId(action,code,options);
      const next=await rpc(action,code,opts);
      if(gen!==generation)return;
      if (action==='leave') {
        if(next?.left!==true)throw Error('invalid_leave');
        navigating=true;clearTimeout(pollTimer);
        location.replace('/games/drinking/?mode=multi');return;
      }
      lastMutation=null;
      render(next);
      byId('create-form').elements.password.value='';byId('join-form').elements.password.value='';
      if(action==='create' && suggested && next.me===0 && !next.kind && !navigating) {
        const selecting={kind:suggested.id,revision:next.revision,request_id:crypto.randomUUID()};
        const chosen=await rpc('select',next.code,selecting);
        if(gen===generation && room?.code===next.code)render(chosen);
      }
    } catch(err) {
      if(gen===generation)notice.textContent=explain(err);
    } finally {
      busy=false;updateActions();schedule();
      if(room && !navigating)void sync();
    }
  }

  byId('create-form').onsubmit=e=>{
    e.preventDefault();const f=e.target.elements;
    void mutate('create',{title:f.title.value.trim(),capacity:Number(f.capacity.value),password:f.password.value});
  };
  byId('join-form').onsubmit=e=>{
    e.preventDefault();const f=e.target.elements,code=f.code.value.trim().toUpperCase();
    if(!codePattern.test(code)){notice.textContent='영문 또는 숫자로 된 방 코드 6자리를 입력해 주세요.';f.code.focus();return;}
    void mutate('join',{password:f.password.value},code);
  };
  byId('start').onclick=()=>{
    if(room?.me===0 && room.kind && room.players.length>=gameMin(room.kind))
      void mutate('start',{kind:room.kind,revision:room.revision});
  };
  byId('leave').onclick=()=>{
    if(!room || busy || navigating)return;
    if(room.me===0){
      const prompt=room.players.length===1?'마지막 참가자예요. 나가면 방이 닫혀요. 나갈까요?':
        '술게임방에서 나갈까요? 남은 참가자 중 한 명이 무작위로 새 방장이 돼요.';
      if(!confirm(prompt))return;
    }
    void mutate('leave',{revision:room.revision});
  };
  byId('invite').onclick=async()=>{
    if(!room)return;
    const link=location.origin+'/games/drinking/?room='+room.code;
    try{await navigator.clipboard.writeText(link);notice.textContent='초대 링크를 복사했어요. 비밀번호와 함께 알려 주세요.';}
    catch{notice.textContent=link;}
  };
  byId('refresh').onclick=listRooms;
  byId('retry').onclick=()=>location.reload();

  async function open() {
    authScreen('회원 정보를 확인하고 있어요.');
    try {
      client=await window.OjjudaGetClient();
      const {data,error}=await client.auth.getSession();
      if(error)throw error;
      const user=data.session?.user;
      actor=user&&!user.is_anonymous?user.id:null;
      if (!subscribed) {
        subscribed=true;
        client.auth.onAuthStateChange((_event,session)=>{
          const id=session?.user&&!session.user.is_anonymous?session.user.id:null;
          if(id!==actor) { generation++;listSequence++;clearTimeout(pollTimer);location.reload(); }
        });
      }
      if(!actor){authScreen('술게임방에 참여하려면 오쭈다에 로그인해 주세요.',true);return;}
      if(inviteCode && codePattern.test(inviteCode)){
        try {render(await rpc('state',inviteCode));return;}
        catch(err){
          if(!['not_room_member','room_unavailable'].includes(err.message))throw err;
          showEntry(inviteCode); if(err.message==='room_unavailable')notice.textContent=explain(err);
          return;
        }
      }
      const mine=await rpc('mine');
      if(mine?.room){render(mine.room);return;}
      showEntry();
      if(inviteCode)notice.textContent='방 코드 6자리를 다시 확인해 주세요.';
      void listRooms();
    } catch(err) {authScreen(explain(err),err.message==='not_signed_in',true);}
  }

  window.addEventListener('pageshow',e=>{if(e.persisted)location.reload();});
  window.addEventListener('pagehide',()=>clearTimeout(pollTimer));
  window.addEventListener('online',()=>{if(room)void sync();else if(actor)void listRooms();});
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden)clearTimeout(pollTimer);
    else if(room)void sync();
    else if(actor)void listRooms();
  });
  open();
})();
