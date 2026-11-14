/* Both play modes use the same member-approved list. Keep unpublished drafts in this turn only. */
(() => {
  'use strict';
  const topics = [
    ['연애·데이트', /연인|연애|애인|데이트|소개팅|고백|사귀|결혼|커플|프러포즈|헤어지|스킨십|키스|원나잇|성인용품|성적 취향|피임|대시|애프터|짝사랑|썸/],
    ['옷·액세서리', /입은|걸친|신은|속옷|양말|운동화|신발|안경|렌즈|목걸이|귀걸이|팔찌|반지 낀|발찌|피어싱|시계 찬|모자 쓴|머리띠|머리핀|머리끈|벨트|넥타이|스카프|목도리|장갑 낀|마스크 쓴|배지|브로치|맨발/],
    ['외모·특징', /머리|가르마|삭발|염색|금발|파마|수염|매니큐어|가발|속눈썹|립스틱|향수|왼손잡이|키가 |교정기|문신|귀 뚫|혈액형|생일인|여자 접어|남자 접어/],
    ['음식·술자리', /먹|마시|마신|술|맥주|소주|와인|막걸리|커피|잔에|안주|건배|식사|음식|배달|맛집|요리|카페/],
    ['취미·여행', /여행|비행기|등산|놀이공원|공연|영화|운동|헬스|수영|캠핑|도서관|책 읽|전시|박물관|자전거|콘서트|축구|야구|게임|노래방|낚시|볼링|달리기|산책/],
    ['일상·경험', null],
  ];
  const topicOf = line => topics.find(([,pattern]) => !pattern || pattern.test(line))[0];
  function draft() {return {mode:'list',topic:'전체',selected:'',written:''};}
  function markup() {
    return '<div class="finger-modes" role="group" aria-label="지시 정하는 방법">'+
      '<button type="button" data-finger-mode="list">기존 지시</button><button type="button" data-finger-mode="write">직접 입력</button></div>'+
      '<div data-finger-panel="list"><label>주제<select data-finger-topic></select></label>'+
      '<label>지시 선택<select data-finger-choice></select></label><button type="button" data-finger-random>다른 지시 추천</button>'+
      '<p data-finger-status role="status"></p><button type="button" data-finger-retry hidden>다시 불러오기</button></div>'+
      '<div data-finger-panel="write" hidden><label>내 지시<textarea rows="2" maxlength="120" placeholder="예: 오늘 운동한 사람 접어"></textarea></label>'+
      '<small>직접 쓴 지시는 관리자 검토 후 공용 목록에 등록될 수 있어요.</small></div>';
  }
  function mount(form,state,load,publish) {
    const get=selector=>form.querySelector(selector);
    const category=get('[data-finger-topic]'),choice=get('[data-finger-choice]'),field=get('textarea');
    const random=get('[data-finger-random]'),retry=get('[data-finger-retry]'),status=get('[data-finger-status]');
    const confirm=get('[type="submit"]');
    let bank=[],filtered=[],loading=true;
    function options(select,values){select.replaceChildren(...values.map(line=>new Option(line,line)));}
    function sync(){
      const manual=state.mode==='write';
      for(const button of form.querySelectorAll('[data-finger-mode]'))button.setAttribute('aria-pressed',String(button.dataset.fingerMode===state.mode));
      for(const panel of form.querySelectorAll('[data-finger-panel]'))panel.hidden=panel.dataset.fingerPanel!==state.mode;
      field.disabled=!manual;category.disabled=!bank.length;choice.disabled=!filtered.length;
      random.hidden=filtered.length<2;retry.hidden=loading||bank.length>0;
      status.textContent=loading?'지시를 불러오는 중…':bank.length?'':'지시를 불러오지 못했어요. 직접 입력할 수도 있어요.';
      status.hidden=!status.textContent;
      confirm.disabled=manual?!field.value.trim():!filtered.includes(state.selected);
    }
    function selectTopic(){
      filtered=state.topic==='전체'?bank:bank.filter(line=>topicOf(line)===state.topic);
      options(choice,filtered);
      if(!filtered.includes(state.selected))state.selected=filtered[Math.floor(Math.random()*filtered.length)]||'';
      choice.value=state.selected;sync();
    }
    async function populate(){
      loading=true;sync();
      try {bank=[...new Set(await load())];} catch {bank=[];}
      if(!form.isConnected)return;
      loading=false;
      const available=new Set(bank.map(topicOf));
      const names=['전체',...topics.map(([name])=>name).filter(name=>available.has(name))];
      options(category,names);
      if(!names.includes(state.topic))state.topic='전체';
      category.value=state.topic;selectTopic();
    }
    for(const button of form.querySelectorAll('[data-finger-mode]'))button.onclick=()=>{
      state.mode=button.dataset.fingerMode;sync();if(state.mode==='write')field.focus();
    };
    category.onchange=()=>{state.topic=category.value;selectTopic();};
    choice.onchange=()=>{state.selected=choice.value;sync();};
    random.onclick=()=>{
      const rest=filtered.filter(line=>line!==state.selected);
      if(rest.length)choice.value=state.selected=rest[Math.floor(Math.random()*rest.length)];
    };
    field.value=state.written;field.oninput=()=>{state.written=field.value;sync();};
    retry.onclick=populate;
    form.onsubmit=event=>{
      event.preventDefault();
      const manual=state.mode==='write',value=manual?field.value.trim():state.selected;
      if(!value||value.length>120||(!manual&&!filtered.includes(value)))return;
      publish(value,manual);
    };
    void populate();
  }
  window.FingerConditions={draft,markup,mount};
})();
