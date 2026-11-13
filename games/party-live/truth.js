'use strict';
(() => {
  const $ = selector => document.querySelector(selector);
  const labels = {mild:'순한맛',spicy:'빨간맛'};
  const flavors = Object.keys(labels);
  const member = $('#access-content').dataset.member;
  const prefix = 'oj.party.' + member + '.truth.';
  const memory = {mild:new Set(),spicy:new Set()};
  const valid = (flavor,question) => Object.hasOwn(labels,flavor) && typeof question==='string' &&
    question.trim().length>0 && question.length<=240;

  const baseline = window.DrinkingPromptCatalog;
  const baseText = new Set([...baseline.mild,...baseline.spicy]);
  const legacyDefaults = [...baseline.mild.slice(0,24),...baseline.spicy.slice(0,16)];

  function personalDeck() {
    const official = window.DrinkingPrompts.truth();
    const deck = {mild:new Set(official.mild),spicy:new Set(official.spicy)};
    const canon = new Set([...official.mild,...official.spicy]);
    function add(flavor,question) {
      if (!valid(flavor,question)) return;
      const text=question.trim();
      if (canon.has(text) || baseText.has(text)) return;
      deck[flavor].add(text);
    }
    try {
      for (let i=0;i<localStorage.length;i++) {
        const key=localStorage.key(i);
        if (!key?.startsWith(prefix)) continue;
        const match=/^(card|base)\.(mild|spicy)\.([\s\S]+)$/.exec(key.slice(prefix.length));
        if (!match) continue;
        const [,type,flavor,text]=match;
        if (type==='card') add(flavor,text);
        else if (official[flavor].includes(text)) {
          let edit;
          try { edit=JSON.parse(localStorage.getItem(key)); } catch { continue; }
          add(edit?.flavor,edit?.question);
        }
      }
      // Old room edits had numeric preset indexes and were only available in multiplayer.
      if (document.documentElement.dataset.game==='truth') {
        const saved=JSON.parse(localStorage.getItem('oj.party.live.truth.edits.v1'));
        if (Array.isArray(saved)) for (const row of saved) {
          if (!Array.isArray(row) || typeof row[0]!=='string') continue;
          const [key,edit]=row;
          if (key.startsWith('c')) add(edit?.flavor,edit?.question);
          else if (/^b\d+$/.test(key)) {
            const i=Number(key.slice(1));
            if (official[i<24?'mild':'spicy'].includes(legacyDefaults[i])) add(edit?.flavor,edit?.question);
          }
        }
      }
    } catch { /* Browser storage may be unavailable. The current session still works. */ }
    for (const flavor of flavors) for (const text of memory[flavor]) add(flavor,text);
    return {mild:[...deck.mild],spicy:[...deck.spicy]};
  }
  function register(flavor,text) {
    const question=text.trim();
    if (!valid(flavor,question)) return {error:'질문을 1~240자로 적어 주세요.'};
    const deck=personalDeck();
    if (deck[flavor].includes(question)) return {known:true};
    if (baseText.has(question) || deck[flavor==='mild'?'spicy':'mild'].includes(question))
      return {error:'다른 질문을 적어 주세요.'};
    memory[flavor].add(question);
    let saved=true;
    try {localStorage.setItem(prefix+'card.'+flavor+'.'+question,'1');} catch {saved=false;}
    // Personal cards are available immediately. Community publication happens separately.
    void Promise.resolve().then(()=>window.DrinkingPrompts.submit('truth',question,flavor)).catch(()=>{});
    return {saved};
  }
  window.PartyTruthCards={deck:personalDeck,register};
  if (document.documentElement.dataset.game!=='truth') return;

  let entry, activeRound, current;
  function formState(s) {
    const target=s.code+'/'+s.round;
    if (target!==activeRound) {
      activeRound=target;
      entry={flavor:'mild',question:'',expanded:false,message:'',busy:false};
    }
    return entry;
  }
  function form(s,ui) {
    const e=formState(s);
    return '<details id="truth-editor" class="truth-edit"'+(e.expanded?' open':'')+'><summary>질문 카드 등록</summary>'+
      '<form id="truth-form"><label>카드 맛<select id="truth-flavor"><option value="mild">순한맛</option>'+
      '<option value="spicy"'+(e.flavor==='spicy'?' selected':'')+'>빨간맛</option></select></label>'+
      '<label>질문<textarea id="truth-question" rows="3" maxlength="240" required>'+ui.esc(e.question)+'</textarea></label>'+
      '<p><small>직접 쓴 내용은 관리자 검토 후 공용 목록에 등록될 수 있어요.</small></p>'+
      '<button type="submit" id="truth-submit"'+(e.busy?' disabled':'')+'>이 방에 추가</button></form>'+
      '<p role="status" id="truth-message">'+ui.esc(e.message)+'</p></details>';
  }
  function board(s,ui) {
    if (s.phase==='setup') {
      if (s.me!==0) return '<h1>방장이 카드를 준비하고 있어요</h1><p>내 차례에 카드 한 장을 골라 질문에 답해요.</p>';
      return '<h1>진실게임을 시작할까요?</h1><p>순한맛과 빨간맛을 한 장씩 섞어요. 카드를 고를 때까지 어느 맛인지 알 수 없어요.</p>'+
        '<button type="button" class="action" id="truth-begin">이 카드로 시작</button><p role="status" id="truth-start-message"></p>';
    }
    const mine=s.me===s.game.turn, name=ui.esc(s.players[s.game.turn]);
    if (s.phase==='pick') {
      if (!mine) return '<h1>'+name+'님이 카드를 고르고 있어요</h1><p>카드를 고르면 질문이 공개돼요.</p>';
      return '<h1>카드 한 장을 골라요</h1><p>순한맛 한 장, 빨간맛 한 장. 어떤 질문이 나올까요?</p><div class="truth-hand">'+
        '<button type="button" data-truth-side="0" aria-label="왼쪽 카드 뒤집기"></button>'+
        '<button type="button" data-truth-side="1" aria-label="오른쪽 카드 뒤집기"></button></div>';
    }
    const flavor=s.game.flavor==='spicy'?'spicy':'mild';
    return '<h1>'+name+'님의 질문</h1><div class="truth-face '+flavor+'"><span>'+labels[flavor]+'</span><strong>'+
      ui.esc(s.game.question)+'</strong></div>'+(mine?'<div class="actions">'+
      '<button type="button" class="action" data-truth-next="truth_answer">답했어요</button>'+
      '<button type="button" data-truth-next="truth_pass">패스</button></div>':'<p>답하거나 패스하면 다음 차례로 넘어가요.</p>');
  }
  function view(s,ui) {
    if (s.phase==='done') return '<h1>모두 한 번씩 마쳤어요!</h1><p>다음 판에는 어떤 질문이 나올까요?</p>';
    return board(s,ui)+form(s,ui);
  }
  function roomDeck(count) {
    const deck=personalDeck();
    for (const flavor of flavors) {
      const cards=deck[flavor];
      if (cards.length<=2048) continue;
      // Each player draws once. A sample without replacement draws fairly from the whole catalog.
      for (let i=0;i<count;i++) {
        const j=i+Math.floor(Math.random()*(cards.length-i));
        [cards[i],cards[j]]=[cards[j],cards[i]];
      }
      deck[flavor]=cards.slice(0,count);
    }
    return deck;
  }
  function mount(s,ui) {
    current={s,ui};
    if (s.phase==='done') return;
    const e=formState(s), editor=$('#truth-editor'), input=$('#truth-question'), flavor=$('#truth-flavor');
    editor.ontoggle=()=>{e.expanded=editor.open;};
    input.oninput=()=>{e.question=input.value;};
    flavor.onchange=()=>{e.flavor=flavor.value;};
    $('#truth-form').onsubmit=async event=>{
      event.preventDefault();
      if (e.busy) return;
      const text=input.value.trim(), taste=flavor.value;
      const result=register(taste,text);
      if (result.error) {e.message=result.error;$('#truth-message').textContent=e.message;input.focus();return;}
      e.busy=true;e.message='';$('#truth-submit').disabled=true;
      let ok=false;
      try {ok=await ui.send('truth_add',{flavor:taste,question:text});} finally {
        e.busy=false;
        if (ok) {if(e.question.trim()===text)e.question='';e.message='이 방의 질문에 추가했어요.';}
        else {e.message='방에 추가하지 못했어요. 다시 눌러 주세요.';}
        if (entry===e && $('#truth-submit')) {
          $('#truth-message').textContent=e.message;$('#truth-submit').disabled=false;
          if (ok && $('#truth-question').value.trim()===text) $('#truth-question').value='';
        }
      }
    };
    document.querySelectorAll('[data-truth-side]').forEach(button=>{
      button.onclick=()=>ui.send('truth_pick',{turn:s.game.turn,side:Number(button.dataset.truthSide)});
    });
    document.querySelectorAll('[data-truth-next]').forEach(button=>{
      button.onclick=()=>ui.send(button.dataset.truthNext,{turn:s.game.turn});
    });
    const begin=$('#truth-begin');
    if (!begin) return;
    begin.onclick=async()=>{
      begin.disabled=true;
      const msg=$('#truth-start-message');
      try {
        msg.textContent='질문을 불러오는 중이에요…';
        if (!await window.DrinkingPrompts.refresh()) {
          msg.textContent='질문을 불러오지 못했어요. 연결을 확인하고 다시 시작해 주세요.';return;
        }
        if (!current || current.s.code!==s.code || current.s.round!==s.round || current.s.phase!=='setup') return;
        const latest=current.s, deck=roomDeck(latest.players.length);
        const missing=flavors.find(f=>!deck[f].length && !latest.game.added?.[f]);
        if (missing) {msg.textContent=labels[missing]+' 질문을 한 장 이상 추가해 주세요.';return;}
        msg.textContent='';
        await current.ui.send('truth_begin',{deck});
      } finally {begin.disabled=false;}
    };
  }
  window.PartyLiveGame={view,mount,unmount:()=>{current=null;}};
})();
