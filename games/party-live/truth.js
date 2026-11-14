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
  function settingsForm(settings) {
    function group(name,title,options,selected) {
      return '<fieldset><legend>'+title+'</legend><div>'+options.map(([value,label])=>
        '<label><input type="radio" name="'+name+'" value="'+value+'"'+(value===selected?' checked':'')+
        '><span>'+label+'</span></label>').join('')+'</div></fieldset>';
    }
    return '<div class="truth-settings">'+
      group('truth-mode','카드 구성',[['mild','순한맛만'],['spicy','빨간맛만'],['mixed','반반']],settings.mode)+
      group('truth-visibility','고르기 전 카드 맛',[['hide','숨기기'],['show','보이기']],settings.showFlavor?'show':'hide')+'</div>';
  }
  function bindSettings(settings) {
    const controls=$('.truth-settings');
    if (!controls) return;
    controls.onchange=event=>{
      const input=event.target;
      if (input.name==='truth-mode') settings.mode=input.value;
      if (input.name==='truth-visibility') settings.showFlavor=input.value==='show';
    };
  }
  function enabledFlavors(mode) {return flavors.includes(mode)?[mode]:flavors;}
  function cardLabel(flavor) {
    return Object.hasOwn(labels,flavor)?'<span class="truth-card-label '+flavor+'">'+labels[flavor]+'</span>':'';
  }
  function sideName(i,flavor) {
    return (i===0?'왼쪽':'오른쪽')+' '+(Object.hasOwn(labels,flavor)?labels[flavor]+' ':'')+'카드 뒤집기';
  }
  window.PartyTruthCards={deck:personalDeck,register,settingsForm,bindSettings,enabledFlavors,cardLabel,sideName};
  if (document.documentElement.dataset.game!=='truth') return;

  let entry, activeRound, current;
  function formState(s) {
    const target=s.code+'/'+s.round;
    if (target!==activeRound) {
      activeRound=target;
      entry={mode:'mixed',showFlavor:false,flavor:'mild',question:'',expanded:false,message:'',busy:false};
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
      return '<h1>진실게임을 시작할까요?</h1>'+settingsForm(formState(s))+
        '<button type="button" class="action" id="truth-begin">이 카드로 시작</button><p role="status" id="truth-start-message"></p>';
    }
    const mine=s.me===s.game.turn, name=ui.esc(s.players[s.game.turn]);
    if (s.phase==='pick') {
      const cards=[0,1].map(i=>{
        const taste=s.game.cardFlavors?.[i];
        const control=mine?'data-truth-side="'+i+'"':'disabled';
        return '<button type="button" '+control+' aria-label="'+sideName(i,taste)+'">'+cardLabel(taste)+'</button>';
      });
      const heading=mine?'카드 한 장을 골라요':name+'님이 카드를 고르고 있어요';
      return '<h1>'+heading+'</h1><div class="truth-hand">'+cards.join('')+'</div>';
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
  function roomDeck(s) {
    const deck=personalDeck();
    for (const flavor of flavors) {
      const cards=deck[flavor];
      // Leave space for questions already added from other phones, plus this round's turns.
      const limit=Math.max(0,2048-(s.game.added?.[flavor] || 0)-s.players.length);
      if (cards.length<=limit) continue;
      const count=Math.min(s.players.length,limit);
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
    bindSettings(e);
    begin.onclick=async()=>{
      begin.disabled=true;
      const msg=$('#truth-start-message');
      try {
        msg.textContent='질문을 불러오는 중이에요…';
        if (!await window.DrinkingPrompts.refresh('truth')) {
          msg.textContent='질문을 불러오지 못했어요. 연결을 확인하고 다시 시작해 주세요.';return;
        }
        if (!current || current.s.code!==s.code || current.s.round!==s.round || current.s.phase!=='setup') return;
        const latest=current.s, deck=roomDeck(latest);
        const missing=enabledFlavors(e.mode).find(f=>!deck[f].length && !latest.game.added?.[f]);
        if (missing) {msg.textContent=labels[missing]+' 질문을 한 장 이상 추가해 주세요.';return;}
        msg.textContent='';
        await current.ui.send('truth_begin',{deck,mode:e.mode,showFlavor:e.showFlavor});
      } finally {begin.disabled=false;}
    };
  }
  window.PartyLiveGame={view,mount,unmount:()=>{current=null;}};
})();
