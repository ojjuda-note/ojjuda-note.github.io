'use strict';
(() => {
const mildQuestions=['요즘 생각만 해도 기분이 좋아지는 일은?','하루 동안 다른 직업을 체험한다면?','최근에 가장 크게 웃은 순간은?','지금 이 자리에 어울리는 노래는?','친구에게 들은 말 중 아직 기억나는 말은?','몰래 연습해 보고 싶은 특기는?','어릴 적 별명은 어떻게 생겼어요?','나만 알고 싶은 음식 조합은?','마지막으로 용기를 냈던 일은?','딱 한 번 다시 가고 싶은 여행지는?','올해 나에게 주고 싶은 선물은?','오늘 처음 알게 된 사람에게 어떤 인상이고 싶어요?','최근 산 것 중 가장 마음에 드는 건?','약속 없는 주말에 제일 먼저 하는 일은?','나를 이모티콘 하나로 표현한다면?','친구와 꼭 함께 해 보고 싶은 일은?','한 곡만 완벽하게 부를 수 있다면 어떤 곡?','예전의 나에게 한마디 한다면?','무대에 올라간다면 어떤 이름을 쓸래요?','요즘 내가 푹 빠진 것은?','다시 만나 고맙다고 말하고 싶은 사람은?','남들은 의외라고 할 내 취향은?','완벽한 하루에 꼭 들어가는 한 가지는?','단 하루 동물로 산다면 무엇이 되고 싶어요?'];
const spicyQuestions=[
  '좋아하는 사람한테 잘 보이려고 했던 가장 티 나는 행동은?',
  '관심 없는 척했는데 사실 답장을 기다렸던 적은?',
  '여기 있는 사람 중 첫인상과 지금 인상이 가장 다른 사람은? 어떻게 달라졌어요?',
  '질투가 났는데 아무렇지 않은 척했던 순간은?',
  '썸을 타다가 마음이 딱 식었던 한마디는?',
  '차마 보내지 못하고 지운 메시지, 첫마디가 뭐였어요?',
  '다시 연락하고 싶은 사람이 있다면 첫 메시지를 뭐라고 보낼래요?',
  '내가 했던 플러팅 중 지금 생각하면 제일 민망한 건?',
  '친구의 연애에 참견하고 싶었지만 꾹 참았던 순간은?',
  '데이트 중 들킨다면 가장 민망할 내 습관은?',
  '서운했는데 괜찮다고 말했던 적이 있어요? 그때 듣고 싶었던 말은?',
  '호감 있는 사람 앞에서 괜히 부풀려 말한 적이 있다면?',
  '친구에게 한 거짓말 중 지금은 웃으며 털어놓을 수 있는 건?',
  '고백받았던 말 중 아직도 기억나는 한마디는?',
  '좋아하는 사람의 SNS를 보다가 깜짝 놀란 순간은?',
  '두 사람이 동시에 고백한다면 마음을 정하게 할 한 가지는?'
];

  const original = {mild:mildQuestions,spicy:spicyQuestions};
  const labels = {mild:'순한맛',spicy:'빨간맛'};
  const defaults = Object.entries(original).flatMap(([flavor,questions]) => questions.map(question => ({flavor,question})));
  const storageKey = 'oj.party.live.truth.edits.v1';
  const $ = selector => document.querySelector(selector);
  let edits, selected = '', draft = null, expanded = false;
  function valid(card) {
    return card && Object.hasOwn(labels,card.flavor) && typeof card.question === 'string' &&
      card.question.trim().length > 0 && card.question.length <= 240;
  }
  function read() {
    if (edits) return edits;
    let stored;
    try {stored = JSON.parse(localStorage.getItem(storageKey));} catch {}
    edits = new Map();
    if (Array.isArray(stored)) {
      for (const item of stored) {
        if (Array.isArray(item) && typeof item[0] === 'string' && valid(item[1])) edits.set(item[0],item[1]);
      }
    }
    return edits;
  }
  function cards() {
    const saved = read();
    const rows = defaults.map((base,i) => ({key:'b'+i,base,...(saved.get('b'+i) || base)}));
    for (const [key,card] of saved) if (key.startsWith('c')) rows.push({key,base:null,...card});
    return rows;
  }
  function deck() {
    const questions = {mild:[],spicy:[]};
    for (const card of cards()) {
      if (!questions[card.flavor].includes(card.question)) questions[card.flavor].push(card.question);
    }
    return questions;
  }
  function fieldContent(ui) {
    const rows = cards(), current = rows.find(card => card.key === selected), card = draft || current || {flavor:'mild',question:''};
    const options = rows.map(row=>'<option value="'+ui.esc(row.key)+'"'+(row.key===selected?' selected':'')+'>'+
      (row.base?'기본':'직접 등록')+' · '+labels[row.flavor]+' · '+ui.esc(row.question)+'</option>').join('');
    return '<label>편집할 카드<select id="truth-list"><option value="">새 카드 등록</option>'+options+'</select></label>'+
      '<label>카드 맛<select id="truth-flavor"><option value="mild"'+(card.flavor==='mild'?' selected':'')+'>순한맛</option>'+
      '<option value="spicy"'+(card.flavor==='spicy'?' selected':'')+'>빨간맛</option></select></label>'+
      '<label>질문<textarea id="truth-question" maxlength="240" rows="3">'+ui.esc(card.question)+'</textarea></label>'+
      '<div class="actions"><button type="button" id="truth-save">'+(current?'수정 저장':'카드 등록')+'</button>'+
      (current && (!current.base || read().has(current.key)) ? '<button type="button" id="truth-reset">'+
         (current.base?'원래대로':'카드 삭제')+'</button>':'')+'</div>';
  }
  function view(s,ui) {
    if (s.phase === 'setup') {
      if (s.me !== 0) return '<h1>방장이 카드를 준비하고 있어요</h1><p>내 차례에 카드 한 장을 골라 질문에 답해요.</p>';
      return '<h1>진실게임을 시작할까요?</h1><p>순한맛과 빨간맛을 한 장씩 섞어요. 카드를 고를 때까지 어느 맛인지 알 수 없어요.</p>'+
        '<details class="truth-edit" id="truth-editor"'+(expanded?' open':'')+'><summary>질문 카드 등록·수정</summary>'+
        '<p>방장의 이 브라우저에 저장한 카드를 함께 사용해요.</p><div id="truth-fields">'+fieldContent(ui)+'</div></details>'+
        '<p role="status" id="truth-message"></p><button type="button" class="action" id="truth-begin">이 카드로 시작</button>';
    }
    if (s.phase === 'done') return '<h1>모두 한 번씩 마쳤어요!</h1><p>다음 판에는 어떤 질문이 나올까요?</p>';
    const myTurn = s.me === s.game.turn, name = ui.esc(s.players[s.game.turn]);
    if (s.phase === 'pick') {
      if (!myTurn) return '<h1>'+name+'님이 카드를 고르고 있어요</h1><p>카드를 고르면 질문이 공개돼요.</p>';
      return '<h1>카드 한 장을 골라요</h1><p>순한맛 한 장, 빨간맛 한 장. 어떤 질문이 나올까요?</p><div class="truth-hand">'+
        '<button type="button" data-truth-side="0" aria-label="왼쪽 카드 뒤집기"></button>'+
        '<button type="button" data-truth-side="1" aria-label="오른쪽 카드 뒤집기"></button></div>';
    }
    const flavor = s.game.flavor === 'spicy' ? 'spicy' : 'mild';
    return '<h1>'+name+'님의 질문</h1><div class="truth-face '+flavor+'"><span>'+labels[flavor]+'</span><strong>'+
      ui.esc(s.game.question)+'</strong></div>'+(myTurn?'<div class="actions">'+
      '<button type="button" class="action" data-game-action="truth_answer">답했어요</button>'+
      '<button type="button" data-game-action="truth_pass">패스</button></div>':'<p>답하거나 패스하면 다음 차례로 넘어가요.</p>');
  }
  function mount(s,ui) {
    if (s.phase === 'pick' && s.me === s.game.turn) {
      document.querySelectorAll('[data-truth-side]').forEach(button => {
        button.onclick=()=>ui.send('truth_pick',{side:Number(button.dataset.truthSide)});
      });
      return;
    }
    if (s.phase !== 'setup' || s.me !== 0) return;
    const msg = $('#truth-message');
    function updateFields() {
      $('#truth-fields').innerHTML = fieldContent(ui);
      bindFields();
    }
    function rememberDraft() {draft={flavor:$('#truth-flavor').value,question:$('#truth-question').value};}
    function store(key,value) {
      const next = new Map(read());
      if (value) next.set(key,value); else next.delete(key);
      try { localStorage.setItem(storageKey,JSON.stringify([...next])); }
      catch { msg.textContent='카드를 저장할 수 없어요. 브라우저의 저장 설정을 확인해 주세요.';return false; }
      edits=next;return true;
    }
    function bindFields() {
      $('#truth-list').onchange = e => {selected=e.target.value;draft=null;msg.textContent='';updateFields();$('#truth-question').focus();};
      $('#truth-question').oninput = rememberDraft;$('#truth-flavor').onchange = rememberDraft;
      $('#truth-save').onclick = () => {
        const question=$('#truth-question').value.trim(), flavor=$('#truth-flavor').value, card={flavor,question};
        if (!valid(card)) {msg.textContent='질문을 1~240자로 적어 주세요.';$('#truth-question').focus();return;}
        const rows=cards(), current=rows.find(c=>c.key===selected);
        if (rows.some(c=>c.key!==selected && c.flavor===flavor && c.question===question)) {
          msg.textContent='같은 맛에 이미 있는 질문이에요.';return;
        }
        if (rows.filter(c=>c.key!==selected && c.flavor===flavor).length>=256) {
          msg.textContent='이 맛에는 256장까지 등록할 수 있어요.';return;
        }
        const unchanged=current?.base && current.base.flavor===flavor && current.base.question===question;
        if (!store(selected || 'c'+crypto.randomUUID(),unchanged?null:card)) return;
        if (!selected) draft={flavor,question:''}; else draft=null;
        updateFields();msg.textContent=selected?'수정했어요.':'등록했어요.';$('#truth-question').focus();
      };
      const reset=$('#truth-reset');
      if (reset) reset.onclick = () => {
        const isBase=selected.startsWith('b');
        if (!store(selected,null)) return;
        if (!isBase) selected='';
        draft=null;updateFields();
        msg.textContent=isBase?'원래 질문과 맛으로 되돌렸어요.':'카드를 삭제했어요.';
        $('#truth-list').focus();
      };
    }
    $('#truth-editor').ontoggle=e=>{expanded=e.target.open;};
    bindFields();
    $('#truth-begin').onclick=()=>{
      const chosen=deck();
      if (!chosen.mild.length || !chosen.spicy.length) {msg.textContent='두 맛 모두 카드가 한 장 이상 필요해요.';return;}
      ui.send('truth_begin',{deck:chosen});
    };
  }
  window.PartyLiveGame={view,mount};
})();
