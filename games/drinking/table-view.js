'use strict';
(() => {
  const games=[
    ['croc','악어 이빨','운과 감각','아픈 이빨은 딱 하나','#b7dab0',2,'24개의 이빨 중 하나를 골라 돌아가며 눌러요. 아픈 이빨을 건드리면 악어 입이 닫혀요.'],
    ['bottle','술병 나침반','운과 감각','병 끝이 가리키는 사람','#b7d9d7',2,'2~12명이 함께해요. 테이블 모양과 방향을 고르고 각자 자리를 정해요. 돌아가는 병을 터치하면 10~20초 동안 서서히 멈춰요. 가끔은 잠깐 멈췄다가 한 칸이나 두 칸 뒤로 아주 천천히 돌아가요.'],
    ['bomb','시간폭탄','순발력','터지기 전에 넘겨요','#f5bba7',2,'나라 이름, 음식 이름처럼 주제에 맞는 답을 바로 말하고 폰을 넘겨요. 이미 나온 답은 다시 말할 수 없어요. 폭탄이 터지면 그때 화면에 표시된 사람이 당첨이에요.'],
    ['stopwatch','감각 스톱워치','운과 감각','목표 시간에 멈추기','#c8d9ce',2,'첫 1초가 지나면 숫자가 사라져요. 목표 시간에 가장 가깝게 멈춘 사람이 이겨요.'],
    ['liar','라이어 찾기','추리와 대화','힌트만 듣고 라이어 찾기','#d0c2e1',3,'한 명만 제시어를 몰라요. 돌아가며 힌트를 말한 뒤, 라이어로 의심되는 사람에게 몰래 투표해요.'],
    ['king','왕게임','추리와 대화','고백부터 둘만의 스킨십까지','#f0d790',2,'왕을 뽑고 나머지는 번호 카드를 받아요. 왕이 한두 개 번호를 골라 미션을 내려요. 둘이 하는 미션은 두 사람 모두 동의하면 시작해요. 원하지 않으면 벌칙 없이 패스해요.'],
    ['truth','진실게임','추리와 대화','솔직한 질문 카드','#f0c6c4',2,'차례가 오면 카드 한 장을 골라 모두 앞에서 솔직하게 답해요. 답하기 어려우면 패스해도 돼요.'],
    ['initial','초성 대결','순발력','두 글자 단어를 5초 안에','#b8cfe1',2,'초성에 맞는 두 글자 단어를 5초 안에 말해요. 이미 나온 단어는 다시 말할 수 없어요. 시간이 다 되거나 틀리면 탈락하고, 마지막 한 명이 이겨요.'],
    ['minority','소수파 찾기','추리와 대화','우리의 선택은 몇 대 몇?','#bfd5bb',3,'두 선택지 중 하나를 몰래 골라요. 모두 투표하면 결과가 공개돼요. 고른 사람이 적은 쪽이 소수파예요.'],
    ['mission','한 명만 다른 미션','추리와 대화','비슷한 제시어, 다른 몸짓','#e5bdac',3,'한 명만 다른 제시어를 받아요. 말이나 소품 없이 동시에 몸짓으로 표현하고, 다른 동작을 한 사람을 찾아 투표해요. 다른 사람에게 닿지 않고 혼자 흉내 내세요.'],
    ['fingers','손병호 게임','추리와 대화','해당하면 손가락 하나 접기','#e1bd95',2,'다섯 손가락을 펴고 시작해요. 조건에 해당하면 하나씩 접어요. 다섯 개를 먼저 접으면 걸려요. 답하기 싫은 조건은 패스해도 돼요.'],
    ['imagevote','이미지 게임','추리와 대화','이 질문에 딱 맞는 사람은?','#b9c9e4',2,'질문을 읽고 가장 잘 어울리는 사람에게 몰래 한 표를 주세요. 모두 투표하면 가장 많이 지목된 사람이 공개돼요.'],
    ['updown','업앤다운','운과 감각','숫자를 부르면, 업 또는 다운!','#c9d8ea',2,'1부터 100 사이에 숨은 숫자를 돌아가며 맞혀요. 업이면 더 큰 수, 다운이면 더 작은 수예요. 정확히 맞힌 사람이 이겨요.'],
    ['secretcount','시크릿 카운트','운과 감각','비밀 숫자에서 버튼을 누르면 당첨','#ccd9ce',2,'한 차례에 버튼을 한 번에서 세 번 누르고 다음 사람에게 넘겨요.'],
    ['partyroulette','러시안 룰렛','운과 감각','상대를 지목하고 너 마셔!','#28231f',2,'서로 한 사람을 지목하고 함께 눌러요. 팡!이 뜬 휴대폰이 가리킨 사람이 당첨이에요.']
  ].map(([id,title,category,short,color,min,rule],i)=>({id,title,category,short,color,min,rule,num:String(i+1).padStart(2,'0')}));

  function artwork(kind) {
    const mark = document.createElement('span');
    mark.className = 'table-mark';
    mark.setAttribute('aria-hidden', 'true');
    if (['stopwatch','secretcount'].includes(kind)) {
      mark.classList.add('table-mark-' + kind);
    } else {
      const image = document.createElement('img');
      image.alt = '';
      image.src = kind === 'croc' ? '/games/croc/art/croc.webp' : '/games/drinking/local/art/' + kind + '.webp';
      mark.append(image);
    }
    return mark;
  }
  function card(game) {
    const tile=document.createElement('button');
    tile.type='button';tile.className='game-card table-card';
    const art=document.createElement('span');
    art.className='card-art';art.style.backgroundColor=game.color;
    art.append(artwork(game.id));
    const copy=document.createElement('span');
    copy.className='card-copy';
    const title=document.createElement('strong');
    title.className='card-title';title.textContent=game.title;
    const subtitle=document.createElement('span');
    subtitle.className='card-sub';subtitle.textContent=game.short;
    copy.append(title,subtitle);tile.append(art,copy);
    return tile;
  }
  function heading(kind, title, count) {
    const header = document.createElement('header');
    header.className = 'round-head table-heading';
    const name = document.createElement('h1');
    name.append(artwork(kind), title);
    const seats = document.createElement('span');
    seats.textContent = count + '명 플레이';
    header.append(name, seats);
    return header;
  }
  function result(root, name) {
    if (!root || !name) return;
    let label = root.querySelector('.table-host');
    if (!label) {
      label = document.createElement('p');
      label.className = 'table-host';
      const title = root.querySelector('[data-result],h2,h1');
      if (title) title.after(label);
      else root.append(label);
    }
    label.textContent = '다음 방장 · ' + name;
  }
  window.DrinkingTableView = Object.freeze({games,artwork,card,heading,result});
})();
