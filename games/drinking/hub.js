'use strict';
(() => {
  const games=window.DrinkingTableView.games.map(game=>({...game,name:game.title}));
  const byId = id => document.getElementById(id);
  const gameById = id => games.find(game => game.id === id);
  // An existing round can finish after its game leaves the catalog.
  const canResume = id => !!gameById(id) || id === 'partyroulette';
  const gameMin = kind => ['liar','king','minority','mission'].includes(kind) ? 3 : 2;
  const codePattern = /^[A-Z0-9]{6}$/;
  const params = new URL(location.href).searchParams;
  const entryRevision = '20261127-tutorial-once1';
  const localPlay = byId('local-play');
  let openingLocal = false;
  localPlay?.addEventListener('click', async event => {
    if (event.defaultPrevented || event.button || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (openingLocal) return;
    openingLocal = true;
    const source = location.href;
    try {
      const revision = new URL(localPlay.href).searchParams.get('v');
      if (!await window.OjjudaDrinkingEntry?.navigateLocal('menu', revision) && location.href === source &&
          !document.querySelector('.play-shell, dialog[open]'))
        location.assign(localPlay.href);
    } finally { openingLocal = false; }
  });
  if (!params.has('room') && !params.has('game') && params.get('mode') !== 'multi') {
    const code=(params.get('resume')||'').toUpperCase(), direct=params.get('gameFrom');
    if(codePattern.test(code)&&(!direct||canResume(direct))){
      const resume=byId('resume-drinks');
      resume.href=direct?'/games/'+direct+'/?room='+code+'&v='+entryRevision:'?room='+code+'&v='+entryRevision;
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
  const createPage = params.get('view') === 'create';
  if (createPage) {
    const moods = ['신나는', '반가운', '흥겨운', '유쾌한', '용감한', '느긋한', '춤추는', '노래하는', '웃는', '꿈꾸는', '빛나는', '즐거운'];
    const animals = ['수달', '펭귄', '여우', '너구리', '쿼카', '토끼', '고양이', '다람쥐', '판다', '돌고래', '부엉이', '고슴도치'];
    const pick = words => words[Math.floor(Math.random() * words.length)];
    byId('create-form').elements.title.defaultValue = pick(moods) + ' ' + pick(animals) + '의 테이블';
  }
  const search = byId('room-search');
  let availableRooms = null;
  let joinTarget = '';
  let randomStart;
  const inviteDialog=byId('friend-invite');
  let pickerVersion=0;
  if (suggested) byId('open-create').href += '&game=' + encodeURIComponent(suggested.id);
  let opening = false, initialized = false, listing, entryRecovery;
  const connection = window.OjjudaRoomConnection.create({
    onPause: () => { clearTimeout(pollTimer); closeInvites(); },
    onResume: () => {
      if (navigating) return;
      if (room) void sync();
      else if (!initialized || entryRecovery) void open();
      else void listRooms();
    }
  });
  byId('hub-back').addEventListener('click',event=>{
    if(event.button||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
    navigating=true;generation++;connection.pause();clearTimeout(pollTimer);
  });
  const messages = {
    not_signed_in:'오쭈다에 로그인해 주세요.', banned:'현재 이 계정으로 대전방을 이용할 수 없어요.',
    wrong_password:'방 비밀번호가 맞지 않아요.', invalid_password:'비밀번호를 4~32자로 입력해 주세요.',
    invalid_title:'방 제목과 최대 인원을 확인해 주세요.', invalid_capacity:'최대 인원을 2~12명으로 골라 주세요.',
    not_room_member:'방 비밀번호를 입력해 주세요.', room_unavailable:'방이 닫혔거나 만료됐어요.',
    room_full:'자리가 모두 찼어요.', join_rate_limit:'비밀번호를 여러 번 틀렸어요. 잠시 뒤 다시 시도해 주세요.',
    friend_required:'현재 친구 목록에 있는 친구만 초대할 수 있어요.', invite_rate_limit:'잠시 뒤에 다시 초대해 주세요.',
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
    const tile=window.DrinkingTableView.card(game);
    tile.classList.add('tile');tile.dataset.game=game.id;
    tile.onclick=()=> {
      if (room?.me!==0 || room.kind===game.id || busy) return;
      mutate('select', {kind:game.id,revision:room.revision});
    };
    return tile;
  });
  byId('games').replaceChildren(...tiles);

  function eligibleGames() {
    return games.filter(game=>room.players.length>=gameMin(game.id));
  }

  function updateActions() {
    byId('create-form').querySelector('button').disabled=busy;
    byId('join-form').querySelector('button').disabled=busy;
    if (!room) return;
    const host=room.me===0, selected=gameById(room.kind);
    const randomButton=byId('random-start');
    randomButton.hidden=!host;
    randomButton.disabled=!host || busy || !eligibleGames().length;
    byId('start').hidden=!host;
    byId('start').disabled=busy || !selected || room.players.length<gameMin(room.kind);
    byId('leave').disabled=busy;
    byId('invite').disabled=busy || room.players.length>=room.capacity;
    if (byId('invite').disabled) closeInvites();
    tiles.forEach(tile=>{
      const chosen=tile.dataset.game===room.kind;
      tile.setAttribute('aria-pressed', String(chosen));
      tile.disabled=busy || !host;
    });
  }

  function render(next) {
    if(navigating || !connection.active())return;
    if (!next || !codePattern.test(next.code) || !Array.isArray(next.players)) throw Error('invalid_room');
    if (room && room.code===next.code && room.revision>=next.revision) return;
    const promoted=room?.code===next.code && room.me>0 && next.me===0;
    room=next; listSequence++; byId('welcome').hidden=true; byId('lobby').hidden=false;
    byId('hub-back').href='/games/drinking/?resume='+room.code;
    const url=new URL('/games/drinking/',location.origin);
    url.searchParams.set('room',room.code); history.replaceState(null,'',url);
    if (room.phase==='playing' && canResume(room.kind) && codePattern.test(room.child)) {
      navigating=true;connection.pause();clearTimeout(pollTimer);
      location.replace('/games/'+room.kind+'/?room='+room.child+'&party='+room.code+'&v='+entryRevision);
      return;
    }
    byId('room-title').textContent=room.title;
    document.title=room.title+' · 술게임';
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
    closeInvites();
    byId('hub-back').href='/games/drinking/';
    room=null; clearTimeout(pollTimer); document.title='술게임 멀티 · 오쭈다';
    byId('lobby').hidden=true; byId('welcome').hidden=false; byId('account').hidden=true; byId('entry').hidden=false;
    joinTarget=invite;
    const creating=createPage && !invite;
    byId('directory').hidden=creating || !!invite;
    byId('detail').hidden=!byId('directory').hidden;
    byId('create-form').hidden=!creating;
    byId('join-form').hidden=!invite;
    if(creating) document.title='방 만들기 · 술게임';
    updateActions();
  }

  function authScreen(text,login=false,retry=false) {
    byId('lobby').hidden=true; byId('welcome').hidden=false; byId('entry').hidden=true; byId('account').hidden=false;
    byId('account-message').textContent=text;
    byId('login').hidden=!login; byId('retry').hidden=!retry;
  }
  async function rpc(action,code='',options={}) {
    try {
      const {data,error}=await connection.request(signal => {
        const query=client.rpc('drinking_room',{p_action:action,p_code:code,p_options:options});
        return query.abortSignal ? query.abortSignal(signal) : query;
      }, {read:['state','list','mine','invite_friends'].includes(action)});
      if (error || data?.error) throw Error(error?.message || data.error);
      connection.succeeded();
      return data;
    } catch(err) {
      if (!connection.cancelled(err)) {
        if (Object.hasOwn(messages,err.message)) connection.succeeded();
        else connection.failed();
      }
      throw err;
    }
  }
  function explain(err) { return messages[err.message] || '연결을 확인한 뒤 다시 시도해 주세요.'; }

  const searchable = text => text.normalize('NFC').trim().toLocaleLowerCase('ko');
  function renderRooms() {
    if (!availableRooms) return;
    const query=searchable(search.value);
    const matches=availableRooms.filter(r=>searchable(r.title).includes(query));
    const rows=matches.map(r=>{
      const row=el('li'), link=el('a','room');
      link.href='/games/drinking/?room='+r.code;
      link.dataset.member=String(r.mine===true);
      const info=el('span','room-copy');
      info.append(el('strong','',r.title),el('small','',[
        r.mine && '내 방', r.phase==='playing'?'게임 중':'대기 중',r.players+'/'+r.capacity+'명',r.host && '방장 '+r.host
      ].filter(Boolean).join(' · ')));
      link.append(info,el('span','room-go',r.mine?'이어서 입장 ›':'입장 ›'));
      row.append(link);
      return row;
    });
    list.replaceChildren(...rows);
    message.textContent=query ? (rows.length ? '검색 결과 '+rows.length+'개' : '검색 결과가 없어요. 다른 방 제목으로 찾아보세요.')
      : rows.length ? '' : '아직 열린 방이 없어요. 새 방을 만들어 보세요.';
  }
  search.addEventListener('input',renderRooms);

  async function listRooms() {
    if (!actor || room || byId('directory').hidden || navigating || !connection.active()) return;
    if (listing) return listing;
    const seq=++listSequence; byId('refresh').disabled=true;
    if (!list.children.length) message.textContent='방을 불러오는 중이에요.';
    listing=(async () => { try {
      const data=await rpc('list'); if(seq!==listSequence || room)return;
      if (!Array.isArray(data?.rooms)) throw Error('invalid_rooms');
      availableRooms=data.rooms.filter(r=>codePattern.test(r?.code) && (r.phase==='lobby' || r.mine===true));
      renderRooms();
    } catch(err) { if(seq===listSequence && !connection.cancelled(err))message.textContent=explain(err); }
    finally { if(seq===listSequence)byId('refresh').disabled=false; }
    })().finally(() => {listing=null;});
    return listing;
  }

  function schedule() {
    clearTimeout(pollTimer);
    if(room&&connection.active()&&!navigating) pollTimer=setTimeout(sync,connection.delay(1250));
  }
  async function sync() {
    if (!room || busy || polling || !connection.active() || navigating) return;
    const code=room.code, gen=generation; polling=true;
    try {
      const next=await rpc('state',code);
      if(gen===generation && room?.code===code) {
        render(next);
        if(notice.dataset.network){notice.textContent='';delete notice.dataset.network;}
      }
    } catch(err) {
      if(connection.cancelled(err))return;
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
    if(busy || !actor || navigating || !connection.active())return;
    const gen=generation; busy=true;updateActions();notice.textContent='';delete notice.dataset.network;
    connection.cancelReads();clearTimeout(pollTimer);
    if(action==='create'||action==='join')entryRecovery={attempts:0};
    try {
      const opts={...options};
      if(action!=='join')opts.request_id=operationId(action,code,options);
      const next=await rpc(action,code,opts);
      if(gen!==generation)return;
      entryRecovery=null;
      if (action==='leave') {
        if(next?.left!==true)throw Error('invalid_leave');
        navigating=true;connection.pause();clearTimeout(pollTimer);
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
      if(Object.hasOwn(messages,err.message))entryRecovery=null;
      if(gen===generation && !connection.cancelled(err))notice.textContent=explain(err);
    } finally {
      busy=false;updateActions();schedule();
      if(room && !navigating)void sync();
      else if(entryRecovery && connection.active() && !navigating)void open();
    }
  }

  byId('create-form').onsubmit=e=>{
    e.preventDefault();const f=e.target.elements;
    if(byId('create-form').hidden)return;
    f.title.value=f.title.value.trim() || f.title.defaultValue;
    void mutate('create',{title:f.title.value,capacity:Number(f.capacity.value),password:f.password.value});
  };
  byId('join-form').onsubmit=e=>{
    e.preventDefault();
    if(!joinTarget || byId('join-form').hidden)return;
    void mutate('join',{password:e.target.elements.password.value},joinTarget);
  };
  byId('random-start').onclick=()=>{
    if(!room || room.me!==0 || room.phase!=='lobby' || busy || navigating)return;
    const eligible=eligibleGames();
    if(!eligible.length)return;
    // Retry the same draw if the server reply was lost at this room revision.
    if(randomStart?.room!==room){
      randomStart={room,kind:eligible[Math.floor(Math.random()*eligible.length)].id};
    }
    void mutate('start',{kind:randomStart.kind,revision:room.revision});
  };
  byId('start').onclick=()=>{
    if(room?.me===0 && gameById(room.kind) && room.players.length>=gameMin(room.kind))
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
  function closeInvites() {
    pickerVersion++;
    if (inviteDialog.open) inviteDialog.close();
  }
  byId('invite-close').onclick=closeInvites;
  byId('invite').onclick=async()=>{
    if (!room || busy || navigating || inviteDialog.open || !connection.active()) return;
    const code=room.code, version=++pickerVersion;
    const current=()=>inviteDialog.open && pickerVersion===version && room?.code===code && connection.active();
    const status=byId('invite-status'), friends=byId('invite-list');
    friends.replaceChildren();
    status.textContent='친구 목록을 불러오는 중이에요.';
    inviteDialog.showModal();
    try {
      const data=await rpc('invite_friends',code);
      if (!current()) return;
      if (!Array.isArray(data?.friends)) throw Error('invalid_friends');
      status.textContent=data.friends.length?'초대할 친구를 선택해 주세요.':'지금 초대할 수 있는 친구가 없어요.';
      for (const friend of data.friends) {
        const row=el('li'), send=el('button','','초대');
        send.type='button';
        send.setAttribute('aria-label',friend.nick+'님 초대');
        send.onclick=async()=>{
          if (!current() || send.disabled) return;
          send.disabled=true;
          try {
            const {data:sent,error}=await connection.request(signal=>{
              const q=client.rpc('arcade_friend_invite',{p_action:'send',p_kind:'drinking',p_code:code,p_to:friend.id});
              return q.abortSignal ? q.abortSignal(signal) : q;
            });
            if (error || !sent?.ok) throw Error(error?.message || 'unavailable');
            if (current()) {send.textContent='초대 보냄';status.textContent=friend.nick+'님에게 초대 알림을 보냈어요.';}
          } catch(err) {
            if (current()) {send.disabled=false;status.textContent=explain(err);}
          }
        };
        row.append(el('strong','',friend.nick),send);friends.append(row);
      }
    } catch(err) { if(current()) status.textContent=explain(err); }
  };
  byId('refresh').onclick=listRooms;
  byId('retry').onclick=()=>{if(room)void sync();else void open();};

  async function open() {
    if(opening || navigating || !connection.active())return;
    opening=true;
    if(!initialized)authScreen('회원 정보를 확인하고 있어요.');
    try {
      client=await connection.request(()=>window.OjjudaGetClient(),{read:true});
      const {data,error}=await connection.request(()=>client.auth.getSession(),{read:true});
      if(error)throw error;
      const user=data.session?.user;
      actor=user&&!user.is_anonymous?user.id:null;
      if (!subscribed) {
        subscribed=true;
        client.auth.onAuthStateChange((_event,session)=>{
          const id=session?.user&&!session.user.is_anonymous?session.user.id:null;
          if(id!==actor) { generation++;listSequence++;connection.pause();clearTimeout(pollTimer);location.reload(); }
        });
      }
      if(!actor){initialized=true;authScreen('술게임방에 참여하려면 오쭈다에 로그인해 주세요.',true);return;}
      if(entryRecovery){
        const mine=await rpc('mine');
        if(mine?.room){
          entryRecovery=null;lastMutation=null;initialized=true;render(mine.room);return;
        }
        initialized=true;showEntry(codePattern.test(inviteCode)?inviteCode:'');
        // A submitted create/join can finish after its response was lost.
        // Read back membership; never blindly replay a mutation on reconnect.
        if(++entryRecovery.attempts<4)pollTimer=setTimeout(open,connection.delay(1500));
        else {entryRecovery=null;notice.textContent='입장 결과를 확인하지 못했어요. 다시 눌러 주세요.';}
        return;
      }
      if(inviteCode && codePattern.test(inviteCode)){
        try {render(await rpc('state',inviteCode));initialized=true;return;}
        catch(err){
          if(!['not_room_member','room_unavailable'].includes(err.message))throw err;
          if(err.message==='room_unavailable'){
            showEntry();initialized=true;notice.textContent=explain(err);void listRooms();return;
          }
          const directory=await rpc('list');
          const invited=directory?.rooms?.find(r=>r.code===inviteCode);
          byId('join-title').textContent=invited?.title || '초대받은 방';
          showEntry(inviteCode);initialized=true;
          return;
        }
      }
      const mine=await rpc('mine');
      if(mine?.room){render(mine.room);initialized=true;return;}
      showEntry();
      initialized=true;
      if(inviteCode)notice.textContent='초대 링크가 올바르지 않아요. 목록에서 방을 찾아 주세요.';
      void listRooms();
    } catch(err) {
      if(!connection.cancelled(err)){
        authScreen(explain(err),err.message==='not_signed_in',true);
        if(err.message!=='not_signed_in' && connection.active())pollTimer=setTimeout(open,connection.delay(1500));
      }
    } finally {opening=false;}
  }
  window.addEventListener('pageshow',event=>{if(event.persisted)navigating=false;});
  open();
})();
