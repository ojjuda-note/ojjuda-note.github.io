/* The next thousand growth nodes continue the original game after its ending.
   All extension resources and evolution choices live in the existing save. */
(() => {
  'use strict';
  const chapters = [
    {name:'차원의 씨앗',pal:['255,213,155','146,224,255','236,172,255','139,235,197','250,239,186'],color:'#ffd59b',ink:'#261304',rgb:'255,213,155',bg:['#23142f','#080b23'],rock:'#ad91b5',boss:'차원문 수호자',bossObj:'차원문 수호자를'},
    {name:'루미별의 바다',pal:['120,226,239','120,165,255','162,246,221','255,175,217','224,249,255'],color:'#78e2ef',ink:'#05232b',rgb:'120,226,239',bg:['#092f45','#061322'],rock:'#75bdc3',boss:'심해 그림자 고래',bossObj:'심해 그림자 고래를'},
    {name:'수정의 숲',pal:['157,235,176','227,210,121','184,156,255','132,229,212','255,201,212'],color:'#9debb0',ink:'#0a2412',rgb:'157,235,176',bg:['#102d25','#08131d'],rock:'#79b59d',boss:'수정 골렘',bossObj:'수정 골렘을'},
    {name:'진화의 하늘',pal:['192,180,255','146,220,255','255,182,218','180,245,231','255,221,174'],color:'#c0b4ff',ink:'#1b1431',rgb:'192,180,255',bg:['#241d4e','#080e2a'],rock:'#a09ccf',boss:'폭풍의 천공 드래곤',bossObj:'폭풍의 천공 드래곤을'},
    {name:'생명의 별',pal:['255,210,135','255,157,193','143,231,233','194,247,175','238,185,255'],color:'#ffd287',ink:'#301809',rgb:'255,210,135',bg:['#321b36','#090a20'],rock:'#c4a2b7',boss:'우주의 공허한 심장',bossObj:'우주의 공허한 심장을'}
  ];
  const memories = [
    ['끝이라고 생각했던 곳에 문이 있었다.','그 문 너머에서는 아주 작은 빛이 떨고 있었다.','이제는 삼키는 대신, 지켜 보자.'],
    ['물결 속에서 작은 몸이 둘로 나뉘었다.','세포가 서로를 기다리는 법을 배웠다.','그것이 첫 번째 친구였다.'],
    ['작은 눈이 나를 바라본다.','빛과 물과 바람을 기억하는 눈이다.','어떤 모습이 되어도 너는 너일 거야.'],
    ['이제 두 발로 걷고, 때로는 하늘을 난다.','별은 혼자가 아니었다.','수많은 생명이 서로를 발견했다.'],
    ['이 우주는 더 이상 조용하지 않다.','작은 심장들이 별처럼 빛난다.','우리가 키운 것은 생명, 그리고 내일이었다.']
  ];
  // Each page opens through play. The whole story is never forced on screen.
  const journal = [
    [
      ['문 너머의 숨','모든 빛을 삼키고 난 뒤에도, 아주 작은 떨림 하나는 사라지지 않았다. 나는 그것을 별이라 부르지 않았다. 아직 이름을 붙이기에는 너무 여리고 따뜻했으니까.'],
      ['유리처럼 맑은 집','아이는 투명한 막을 둥글게 말아 자기만의 방을 만들었다. 그 방에는 벽도 문도 없었다. 다만 작은 온기가 밖으로 흩어지지 않도록 감싸 줄 뿐이었다.'],
      ['첫 번째 박동','반짝, 쉬고, 또 반짝. 아이는 누구에게 배운 적 없는 리듬을 만들었다. 나는 그 리듬에 맞추어 천천히 빛났고, 우주는 잠시 우리 둘만의 노래가 되었다.'],
      ['조금 더 넓은 세상','동그란 몸이 어제보다 아주 조금 커졌다. 눈으로 보면 놓칠 만큼 작은 변화였다. 하지만 아이는 분명 어제 닿지 못했던 빛의 가장자리에 손을 뻗고 있었다.'],
      ['빛의 맛','아이는 처음으로 햇살을 삼켰다. 빛은 배를 채우는 음식이 아니라 마음을 데우는 기억이 되었다. 따뜻한 것은 언제나 커다란 불꽃일 필요가 없었다.'],
      ['기다려 주는 법','아이가 하루 종일 꼼짝하지 않는 날도 있었다. 나는 서두르지 않았다. 자란다는 것은 매일 앞으로 달리는 일이 아니라, 가끔 아주 깊이 숨을 쉬는 일이기도 하니까.'],
      ['작은 무늬','투명한 몸 안에 별가루 같은 점이 생겼다. 하나씩 세어 보니 어제보다 셋이 늘었다. 아이는 그걸 자랑하고 싶었는지 빙글빙글 돌다가 스르르 잠들었다.'],
      ['나의 첫 인사','아이가 조그만 파동을 내게 보냈다. 말은 없었지만 나는 알아들을 수 있었다. 여기 있어 줘서 고마워, 하고. 나는 빛을 한 번 깜박여 대답했다.'],
      ['혼자가 아닌 밤','멀리서 또 하나의 반짝임이 다가왔다. 아이는 낯선 빛을 두려워하지 않았다. 둘은 잠시 나란히 떠 있었고, 우주의 어둠은 그만큼 부드러워졌다.'],
      ['한 방울의 내일','투명한 방에 처음으로 물 한 방울이 맺혔다. 아이는 물방울에 비친 자기 모습을 보며 오래도록 놀았다. 새로운 별로 가는 길은 바로 그 작은 웃음에서 시작되었다.']
    ],
    [
      ['루미별의 푸른 아침','차원문을 지나자 발아래로 끝없는 물결이 펼쳐졌다. 아이는 빛을 머금은 바닷물에 살짝 몸을 담갔다. 물은 차갑지 않았고, 오래된 친구의 손처럼 조용했다.'],
      ['물결이 가르쳐 준 것','파도는 앞으로 나아가다가도 뒤로 물러섰다. 아이는 몇 번이고 밀려왔다 돌아가는 물결을 바라보았다. 돌아오는 것도 여행의 한 부분이라는 사실을 배운 날이었다.'],
      ['거품 학교','작고 동그란 거품들이 아이 주변을 떠다녔다. 하나를 쫓아가면 두 개가 나타났고, 두 개를 껴안으면 네 개로 흩어졌다. 오늘의 공부는 깔깔 웃는 법이었다.'],
      ['서로 다른 속도','빠른 물고기는 멀리 갔고 느린 산호는 제자리에서 자랐다. 아이는 둘 다 멋지다고 생각했다. 바다에서는 누구도 남의 속도로 헤엄칠 필요가 없었다.'],
      ['둘이 된 마음','어느 날 작은 세포 하나가 두 개로 나뉘었다. 두 아이는 잠시 서로를 바라보더니 같은 방향으로 헤엄쳤다. 나누어진 것은 몸뿐, 함께하고 싶은 마음은 두 배로 커졌다.'],
      ['반짝이는 눈','아이는 물결 속에서 처음으로 눈을 떴다. 맑은 두 눈에 깊고 푸른 세상이 들어왔다. 바다는 그 눈을 위해 수천 개의 작은 별을 띄워 주었다.'],
      ['바다가 흐린 날','파도가 높고 물빛이 탁한 날이 찾아왔다. 아이는 잠깐 웅크렸지만, 따뜻했던 어제의 박동을 기억했다. 두려운 날에도 자기 곁을 떠나지 않는 마음이 생긴 것이다.'],
      ['첫 번째 약속','아이는 조그만 산호에게 인사를 건넸다. 산호는 아주 느리게 가지 하나를 흔들었다. 서로의 말을 다 알아듣지 못해도 곁에 머무를 수 있다는 약속이었다.'],
      ['깊은 물의 노래','밤바다 아래에서 낮고 포근한 소리가 들려왔다. 아이는 그 소리를 따라 천천히 헤엄쳤다. 소리의 끝에는 수많은 생명들이 한 박자로 숨 쉬고 있었다.'],
      ['새벽의 해안','수평선 너머로 물이 얕아지고 은빛 모래가 나타났다. 아이는 한 번도 밟아 본 적 없는 땅을 바라보았다. 처음인 일이 무서우면서도 설렐 수 있다는 걸 알게 되었다.']
    ],
    [
      ['숲의 첫 발자국','발을 뻗자 발아래에서 포근한 이끼가 살짝 눌렸다. 아이는 자기가 남긴 동그란 자국을 신기하게 바라보았다. 바다가 아닌 곳에도 자기 자리를 만들 수 있었다.'],
      ['수정나무의 인사','투명한 나무가 가지를 흔들자 작은 종소리가 났다. 바람은 가지마다 다른 음을 만들었다. 아이는 처음으로 발을 구르며 그 음악에 춤을 추었다.'],
      ['그늘의 선물','햇살이 강한 한낮, 큰 잎이 아이 위로 내려왔다. 아무 말 없이 내어 준 그늘은 오래 기억할 선물이었다. 아이도 언젠가 누군가에게 그런 그늘이 되고 싶었다.'],
      ['첫 번째 발','조그만 몸 아래 발 하나가 자라났다. 아이는 세 발짝을 걷고 툭 주저앉았다. 그러고는 자신이 넘어졌다는 사실보다 세 발짝이나 걸었다는 사실에 더 크게 웃었다.'],
      ['반짝이는 이웃','밤이 되면 수정나무 사이에서 작은 빛들이 켜졌다. 모두 다른 모양, 다른 색, 다른 속도로 반짝였다. 숲은 그 차이 덕분에 더욱 아름다웠다.'],
      ['느리게 자라는 날','가장 오래된 나무는 하루에 손톱만큼도 자라지 않았다. 그래도 어제 없던 새잎 하나를 조용히 펼쳤다. 아이는 그 앞에 앉아 자기 몸의 작은 변화를 사랑하는 법을 배웠다.'],
      ['잃어버린 꽃가루','바람이 꽃가루를 먼 곳으로 실어 보냈다. 아이는 처음엔 아쉬웠지만 이내 알게 되었다. 떠난 것들은 어딘가에 또 다른 꽃을 피울 수 있다는 것을.'],
      ['나무가 된 마음','아이는 쓰러진 나뭇가지를 세워 주었다. 다음 날 그 자리에 아주 작은 잎이 올라왔다. 누군가를 도운 기억은 가끔 눈에 보이는 초록빛으로 돌아왔다.'],
      ['서로의 이름','아이에게도 친구가 생겼다. 친구들은 아이를 부르는 소리를 저마다 다르게 만들었다. 어느 이름으로 불려도 아이는 모두 자기 이야기처럼 기뻐했다.'],
      ['숲의 끝에서','높은 나무 꼭대기에 올라가자 구름 위의 하늘이 보였다. 아직 닿아 보지 못한 세계가 저곳에 있었다. 아이는 무서운 마음까지 품은 채 천천히 팔을 펼쳤다.']
    ],
    [
      ['하늘이 건넨 질문','구름은 아이에게 어떤 모습이 되고 싶으냐고 물었다. 아이는 한참 생각하다 웃었다. 아직 모르겠지만, 답을 찾는 시간도 좋아. 하늘은 그 대답에 환하게 빛났다.'],
      ['햇빛의 길','빛을 따라가고 싶은 아이는 따뜻한 방향으로 몸을 기울였다. 작은 반짝임들이 어깨 위에 내려앉았다. 걸어온 길을 비추는 것만으로도 누군가에게 등불이 될 수 있었다.'],
      ['물의 길','물소리를 좋아하는 아이는 구름 아래 흐르는 강을 바라보았다. 강은 한 번도 같은 모양이 아니었다. 변하는 것을 두려워하지 않는 마음이 아이 안에서 자라났다.'],
      ['바람의 길','바람을 따라가고 싶은 아이는 작은 날개를 펼쳤다. 첫 비행은 멀지 않았지만 충분히 즐거웠다. 지금까지 걸어온 땅도 하늘에서 보니 새로운 풍경이었다.'],
      ['서로 다른 재능','어떤 친구는 빛을 잘 모았고, 어떤 친구는 물결을 잘 읽었다. 또 다른 친구는 바람의 방향을 먼저 알아차렸다. 아이는 모두를 부러워하기보다 하나씩 응원하기로 했다.'],
      ['함께 나는 방법','하늘에서 혼자 빠르게 나는 것보다 나란히 천천히 나는 것이 더 따뜻한 날도 있었다. 아이는 친구의 속도에 맞추어 날개를 접었다 펴 보았다. 그 순간 구름 사이로 길 하나가 열렸다.'],
      ['그대로도 괜찮아','눈부시게 빛나는 친구를 보아도 아이는 자신의 작은 빛을 숨기지 않았다. 모두가 같은 모습이 되면 하늘은 너무 조용할 테니까. 아이의 고유한 색이 더욱 선명해졌다.'],
      ['비가 지나간 자리','갑작스러운 비가 날개를 적셨다. 아이는 쉬어 갈 구름을 찾았다. 비가 그치자 하늘에는 몇 겹의 무지개가 생겼고, 쉬어 간 시간마저 아름다운 기억이 되었다.'],
      ['내가 선택한 모습','아이는 빛과 물과 바람이 남긴 흔적을 바라보았다. 어느 것도 잘못된 길은 없었다. 그동안 스스로 고른 작은 선택들이 지금의 모습을 만들고 있었다.'],
      ['멀리 보이는 별','구름 위에 올라서자 아직 이름 없는 별 하나가 보였다. 그 별은 생명들이 함께 쉬어 갈 집을 기다리는 듯했다. 아이는 작은 손을 흔들며 그곳을 향했다.']
    ],
    [
      ['새로운 이웃','작은 별에 도착하자 서로 다른 모습의 친구들이 하나둘 모여들었다. 어떤 친구는 둥글고, 어떤 친구는 길쭉하고, 어떤 친구는 날개가 있었다. 서로 달라서 더 많은 이야기를 나눌 수 있었다.'],
      ['첫 번째 정원','아이와 친구들은 텅 빈 땅에 작은 씨앗을 심었다. 아무것도 없는 듯했던 곳에서 작은 초록빛이 올라왔다. 별은 그날부터 단순한 돌덩이가 아니라 집이 되었다.'],
      ['느린 오후','해야 할 일이 없는 오후, 친구들은 나란히 누워 하늘을 보았다. 누군가 별을 세다가 잠이 들자 다른 친구들이 조용히 웃었다. 쉬는 시간도 별을 키우는 시간이었다.'],
      ['기억의 씨앗','아이는 첫 박동을, 바다의 물결을, 숲의 그늘을 기억했다. 그 기억을 모아 반짝이는 씨앗 하나를 만들었다. 친구들은 씨앗 주위에 둘러앉아 자기 이야기를 하나씩 보탰다.'],
      ['함께 만드는 집','한 친구는 돌을 옮기고, 다른 친구는 물을 길었고, 또 다른 친구는 빛을 모았다. 누구도 모든 일을 잘할 필요가 없었다. 서로 다른 재능이 하나의 따뜻한 집을 만들었다.'],
      ['밤을 밝히는 마음','해가 지자 정원 곳곳에 작은 빛들이 켜졌다. 커다란 태양보다 약했지만 길을 찾기에는 충분했다. 아이는 마침내 자기의 작은 빛이 누군가에게 도움이 된다는 걸 알았다.'],
      ['멀리서 온 손님','차원문 너머에서 길을 잃은 작은 생명이 찾아왔다. 아이는 오래전 자신이 그랬던 것처럼 손님에게 먼저 자리를 내어 주었다. 낯선 세계는 친절한 인사 하나로 집이 될 수 있었다.'],
      ['서로를 기다리는 별','어떤 날은 정원이 빠르게 자랐고 어떤 날은 아무 변화도 보이지 않았다. 그래도 친구들은 매일 물을 주고 이름을 불렀다. 보이지 않는 성장도 여전히 일어나고 있었다.'],
      ['생명의 합창','별의 곳곳에서 서로 다른 리듬이 들려왔다. 세포의 박동과 나뭇잎의 떨림과 친구들의 웃음이 하나의 노래가 되었다. 별은 그 노래를 품고 아주 천천히 빛났다.'],
      ['끝이 아닌 시작','아이는 처음 깨어났던 작은 점을 떠올렸다. 거기서 여기까지, 아주 많은 오늘이 쌓였다. 이제 별에는 새로운 생명들이 태어나고 있었다. 아이가 이룬 것은 끝이 아니라 함께 살아갈 내일이었다.']
    ]
  ];
  const transitions = [
    ['차원의 수호자가 천천히 몸을 낮추었다.','그 너머에 무엇이 있는지 아무도 알려주지 않았다.','작은 세포는 처음으로 자기 힘으로 앞으로 나아갔다.','투명한 몸 안에서 바다가 출렁이기 시작했다.','루미별의 푸른 아침이 우리를 기다리고 있었다.'],
    ['깊은 바다에서 아이는 처음으로 땅을 바라보았다.','떠오르는 것이 꼭 떠나보내는 일은 아니었다.','아이는 물결에 고맙다고 인사했다.','발끝에 닿은 작은 이끼가 부드럽게 흔들렸다.','수정의 숲은 그 발자국을 오래 기억할 것이다.'],
    ['수정 숲에 바람이 불고, 가지마다 맑은 소리가 났다.','아이는 자기가 걸어온 길을 하나씩 떠올렸다.','빛이 좋았던 순간, 물이 위로했던 순간, 바람이 등을 밀어 주었던 순간.','이제 아이는 스스로의 모습을 선택할 수 있었다.','넓은 하늘이 조용히 두 팔을 펼쳤다.'],
    ['구름 위에서 서로 다른 모습의 친구들이 만났다.','누구도 같은 색으로 빛나지 않았고, 누구도 같은 속도로 날지 않았다.','그런데도 함께 바라보는 방향은 같았다.','아이들은 빈 별 하나를 발견하고 작은 집을 지어 보기로 했다.','마침내 생명의 별이 열렸다.']
  ];
  const kinds = Object.freeze({
    light:{name:'루루',color:'#ffe4a1',ability:'별빛 수확 +8%',epilogue:'루루는 작은 등불이 되어 밤길을 걸었다. 늦게 돌아오는 친구들이 길을 잃지 않도록, 자기의 따뜻한 빛을 오래도록 켜 두었다.'},
    water:{name:'몽몽',color:'#9de8ff',ability:'시간 결정 회복량 +0.15초',epilogue:'몽몽은 별의 가장자리에서 맑은 호수를 만들었다. 지친 친구들이 잠시 쉬어 갈 때면, 잔잔한 물결이 오늘도 수고했다고 속삭였다.'},
    wind:{name:'포포',color:'#e3c4ff',ability:'불꽃 범위 +5',epilogue:'포포는 바람을 타고 멀리 떨어진 친구들에게 편지를 전했다. 서로 다른 곳에 살아도 마음은 금세 닿을 수 있다는 걸 별 전체가 알게 되었다.'},
    balance:{name:'별콩',color:'#b9f3d7',ability:'빛·금속·생명력 수확 +3%',epilogue:'별콩은 정원 한가운데 작은 나무를 심었다. 빛과 물과 바람이 고르게 머문 그곳에는 누구에게나 편안한 그늘이 생겼다.'}
  });
  const keys=['light','water','wind'];
  function choose(genes,last='light'){
    const values=keys.map(key=>Math.max(0,Math.floor(Number(genes?.[key])||0)));
    const max=Math.max(...values),min=Math.min(...values);
    if(values.reduce((sum,n)=>sum+n,0)===0)return null;
    if(min>=3&&max-min<=2)return 'balance';
    const tied=keys.filter((key,i)=>values[i]===max);
    return tied.includes(last)?last:tied[0];
  }
  const effects = [
    [
      ['온기 저장','열 최대치 +0.12',(s,l)=>{s.maxHeat+=.12*l}],
      ['고른 숨','식는 속도 -0.12%',(s,l)=>{s.decay*=Math.pow(.9988,l)}],
      ['이슬 감응','시간 방울 반응 +0.8%',(s,l)=>{s.iceDamage*=1+.008*l}],
      ['따뜻한 핵','열 최대치 +0.1',(s,l)=>{s.maxHeat+=.1*l}],
      ['숨결 보관','식는 속도 -0.1%',(s,l)=>{s.decay*=Math.pow(.999,l)}]
    ],
    [
      ['생명 감응','모든 먹이 반응 +0.8%',(s,l)=>{s.dmg*=1+.008*l}],
      ['정밀 공명','치명타 확률 +0.1%p',(s,l)=>{s.crit+=.001*l}],
      ['큰 빛 수확','커다란 먹이 반응 +1%',(s,l)=>{s.starDamage*=1+.01*l}],
      ['핵의 심장','치명타 배율 +0.012',(s,l)=>{s.critPower+=.012*l}],
      ['부드러운 울림','여린 먹이 반응 +1%',(s,l)=>{s.gasDamage*=1+.01*l}]
    ],
    [
      ['작은 발걸음','생명빛 수집 범위 +0.12',(s,l)=>{s.radius+=.12*l}],
      ['끌림의 감각','끌어당기는 힘 +0.018',(s,l)=>{s.pull+=.018*l}],
      ['넓은 눈','끌어당기는 거리 +0.6%',(s,l)=>{s.pullReach*=1+.006*l}],
      ['가장자리 감응','빛의 가장자리 반응 +0.8%',(s,l)=>{s.edgeDamage*=1+.008*l}],
      ['유영 본능','빠른 먹이 속도 -0.3%p',(s,l)=>{s.cometSlow+=.003*l}]
    ],
    [
      ['영양 흡수','생명력 수확 +0.35%',(s,l)=>{s.life+=.0035*l}],
      ['별빛 광합성','생명력 수확 +0.6%',(s,l)=>{s.life*=1+.006*l}],
      ['물결 순환','시간 방울 회복 +0.006초',(s,l)=>{s.iceHeat+=.006*l}],
      ['새 친구의 발걸음','먹이 등장 +0.5%',(s,l)=>{s.spawn*=1+.005*l}],
      ['생명의 저장','생명력 수확 +0.3%',(s,l)=>{s.life+=.003*l}]
    ],
    [
      ['세포 분화','곁을 도는 빛 반응 +0.5%',(s,l)=>{s.satDamage+=.005*l}],
      ['유전자 결합','생명빛 연쇄 반응 +0.8%',(s,l)=>{s.chain*=1+.008*l}],
      ['진화의 돌기','작은 먹이 반응 +0.8%',(s,l)=>{s.rockDamage*=1+.008*l}],
      ['보호막 감각','단단한 껍질 관통 +0.1%p',(s,l)=>{s.pierce+=.001*l}],
      ['생명 공명','보조 빛의 반응 범위 +0.08',(s,l)=>{s.satRadius+=.08*l}]
    ]
  ];
  const growthPhases=[
    ['투명한 막','첫 번째 박동','별빛의 맛','꼬물거리는 감각','생명의 분열','나선의 무늬','조그만 손짓','새로운 세포'],
    ['푸른 첫숨','물결의 인사','진주의 온기','고요한 산호','해류의 춤','깊은 바다의 눈','아가미의 노래','새벽의 물길'],
    ['이끼 발자국','햇살 잎사귀','이슬의 소리','튼튼한 뿌리','수정의 결','포자의 여행','나무의 심장','숲의 합창'],
    ['첫 상승 기류','구름 위 걸음','작은 날개싹','바람의 방향','무지개의 끝','높은 둥지','하늘의 약속','빛나는 비행'],
    ['정원의 씨앗','다정한 마음','첫 번째 집','서로의 손길','별의 계절','오래된 약속','생명의 합창','끝없는 내일']
  ];
  function upgrades(){
    const result=[];
    for(let chapter=0;chapter<chapters.length;chapter++){
      for(let branch=0;branch<5;branch++){
        for(let index=0;index<40;index++){
          const [name,description,effect]=effects[branch][index%5];
          result.push({
            id:`life_${chapter}_${branch}_${index}`,r:chapter+5,b:branch,
            n:`${growthPhases[chapter][Math.floor(index/5)]} · ${name}`,
            d:description,mx:3,
            c:Math.ceil(Math.pow(6,chapter)*(18+index*2.5+branch*2)),m:1.65,
            k:'life',f:effect
          });
        }
      }
    }
    return result;
  }
  function drawWorld(ctx,w,h,stage,random){
    const chapter=Math.max(0,Math.min(4,stage-5));
    const palettes=[['#0a0e2b','#24133c','#0b0b26'],['#073d5c','#0c3650','#071523'],['#153b29','#12382e','#071b20'],['#31275b','#4e477a','#0b2145'],['#43344b','#23504a','#0c2337']];
    const pal=palettes[chapter];
    ctx.save();ctx.lineCap='round';ctx.lineJoin='round';
    const base=ctx.createLinearGradient(0,0,w*.27,h);
    base.addColorStop(0,pal[0]);base.addColorStop(.55,pal[1]);base.addColorStop(1,pal[2]);
    ctx.fillStyle=base;ctx.fillRect(0,0,w,h);
    const haze=(x,y,r,rgb,alpha)=>{
      const glow=ctx.createRadialGradient(x,y,0,x,y,r);
      glow.addColorStop(0,`rgba(${rgb},${alpha})`);
      glow.addColorStop(.55,`rgba(${rgb},${alpha*.26})`);
      glow.addColorStop(1,`rgba(${rgb},0)`);
      ctx.fillStyle=glow;ctx.fillRect(x-r,y-r,2*r,2*r);
    };
    const spark=(x,y,r,color)=>{
      ctx.fillStyle=color;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();
      ctx.lineWidth=Math.max(.6,r*.25);ctx.strokeStyle=color;
      ctx.beginPath();ctx.moveTo(x-r*2.4,y);ctx.lineTo(x+r*2.4,y);ctx.moveTo(x,y-r*2.4);ctx.lineTo(x,y+r*2.4);ctx.stroke();
    };
    if(chapter===0){ // A gigantic dimensional sanctuary, not another star field.
      haze(w*.52,h*.41,Math.min(w,h)*.7,'184,130,247',.33);
      const cx=w*.52,cy=h*.39,rr=Math.min(w,h)*.3;
      ctx.save();ctx.translate(cx,cy);ctx.rotate(-.3);
      const inner=ctx.createRadialGradient(0,0,rr*.06,0,0,rr);
      inner.addColorStop(0,'#fee3da');inner.addColorStop(.2,'#d4b9ff');inner.addColorStop(.57,'#7569bc');inner.addColorStop(.83,'#271e57');inner.addColorStop(1,'rgba(39,30,87,0)');
      ctx.fillStyle=inner;ctx.beginPath();ctx.ellipse(0,0,rr*.92,rr*1.27,0,0,Math.PI*2);ctx.fill();
      for(let i=0;i<12;i++){
        ctx.strokeStyle=`rgba(${i%2?'255,222,193':'186,207,255'},${.41-i*.026})`;
        ctx.lineWidth=4.2-i*.25;ctx.beginPath();ctx.ellipse(0,0,rr*(1.06+i*.075),rr*(1.31+i*.068),i*.04,-Math.PI*.84,Math.PI*.95);ctx.stroke();
      }
      ctx.restore();
      for(let i=0;i<15;i++){
        const x=random()*w,y=h*(.12+random()*.75),r=9+random()*30;
        ctx.save();ctx.translate(x,y);ctx.rotate(random()*Math.PI);
        ctx.fillStyle=`rgba(170,185,245,${.07+random()*.13})`;
        ctx.strokeStyle='rgba(239,219,255,.24)';ctx.lineWidth=1.4;
        ctx.beginPath();ctx.moveTo(0,-r);ctx.lineTo(r*.61,-r*.24);ctx.lineTo(r*.35,r*.72);ctx.lineTo(-r*.36,r*.89);ctx.lineTo(-r*.68,-r*.2);ctx.closePath();ctx.fill();ctx.stroke();
        ctx.beginPath();ctx.moveTo(0,-r);ctx.lineTo(0,r*.65);ctx.moveTo(-r*.68,-r*.2);ctx.lineTo(r*.35,r*.72);ctx.stroke();ctx.restore();
      }
      for(let i=0;i<23;i++)spark(random()*w,random()*h,1+random()*1.8,'rgba(255,228,210,.42)');
    }else if(chapter===1){ // A sea with real depth, sunlight, coral, and living water.
      haze(w*.53,h*.12,w*.67,'111,234,243',.42);
      ctx.strokeStyle='rgba(181,252,255,.5)';ctx.lineWidth=2;
      ctx.beginPath();ctx.moveTo(0,h*.13);
      for(let x=0;x<=w+25;x+=25)ctx.quadraticCurveTo(x+12,h*(.12+.012*Math.sin(x*.03)),x+25,h*.13);
      ctx.stroke();
      for(let i=0;i<13;i++){
        const x=(i-.5)*w/11,spread=w*(.09+random()*.16);
        ctx.fillStyle=`rgba(150,245,253,${.035+random()*.045})`;
        ctx.beginPath();ctx.moveTo(x,h*.13);ctx.lineTo(x-spread,h);ctx.lineTo(x+spread*.43,h);ctx.closePath();ctx.fill();
      }
      for(let layer=0;layer<3;layer++){
        const yy=h*(.66+layer*.14);ctx.fillStyle=['rgba(11,80,108,.2)','rgba(10,67,85,.42)','rgba(2,34,48,.73)'][layer];
        ctx.beginPath();ctx.moveTo(0,h);
        for(let x=0;x<=w+30;x+=30)ctx.lineTo(x,yy+Math.sin(x*.013+layer)*h*.034);
        ctx.lineTo(w,h);ctx.closePath();ctx.fill();
      }
      for(let i=0;i<26;i++){
        const x=(i%2? w*(.69+random()*.3):w*(.02+random()*.28)),y=h*(.76+random()*.28),len=h*(.08+random()*.25),side=i%2?-1:1;
        ctx.strokeStyle=`rgba(${i%3?'90,198,181':'232,153,188'},${.15+random()*.2})`;ctx.lineWidth=2+random()*5;
        ctx.beginPath();ctx.moveTo(x,y);ctx.quadraticCurveTo(x+side*len*.19,y-len*.52,x+side*len*.24,y-len);ctx.stroke();
        for(let j=1;j<=3;j++){
          const xx=x+side*len*.24*j/3,ry=y-len*j/3;
          ctx.beginPath();ctx.moveTo(xx,ry);ctx.quadraticCurveTo(xx+side*len*.13,ry-len*.11,xx+side*len*.22,ry-len*.05);ctx.stroke();
        }
      }
      for(let i=0;i<16;i++){
        const x=random()*w,y=random()*h,r=2+random()*7;
        ctx.strokeStyle='rgba(193,246,255,.22)';ctx.lineWidth=1;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.stroke();
      }
    }else if(chapter===2){ // Crystal forest: trunks, glowing canopy, fern floor.
      haze(w*.43,h*.29,w*.62,'139,235,167',.3);
      for(let i=0;i<23;i++){
        const x=random()*w,depth=.33+random()*.65,trunk=w*(.008+random()*.021)*depth;
        const top=h*(.05+random()*.23),bottom=h*(.85+random()*.18);
        ctx.fillStyle=`rgba(13,43,49,${.15+.56*depth})`;
        ctx.beginPath();ctx.moveTo(x-trunk,bottom);ctx.lineTo(x-trunk*.45,top);ctx.lineTo(x+trunk*.55,top);ctx.lineTo(x+trunk*1.4,bottom);ctx.closePath();ctx.fill();
        ctx.strokeStyle=`rgba(${i%2?'118,232,193':'188,154,244'},${.13+.2*depth})`;
        ctx.lineWidth=Math.max(1,trunk*.14);ctx.beginPath();ctx.moveTo(x,top);ctx.lineTo(x,bottom);ctx.stroke();
        for(let j=0;j<5;j++){
          const side=j%2?1:-1,y=top+(bottom-top)*(.12+j*.16);
          ctx.strokeStyle=`rgba(106,184,155,${.15+depth*.22})`;ctx.lineWidth=1.5+depth*2;
          ctx.beginPath();ctx.moveTo(x,y);ctx.quadraticCurveTo(x+side*w*.09,y-h*.14,x+side*w*.17,y-h*.06);ctx.stroke();
        }
        haze(x,top,w*(.055+depth*.085),i%3?'73,173,129':'171,125,207',.12);
        const crown=w*(.034+depth*.07);
        for(let leaf=0;leaf<7;leaf++){
          const a=leaf*Math.PI*2/7,xx=x+Math.cos(a)*crown*.63,yy=top+Math.sin(a)*crown*.32;
          const green=i%4===0?'135,139,186':i%3===0?'107,188,151':'59,143,108';
          ctx.fillStyle=`rgba(${green},${.1+depth*.2})`;
          ctx.beginPath();ctx.ellipse(xx,yy,crown*(.56+random()*.17),crown*(.33+random()*.13),a*.28,0,Math.PI*2);ctx.fill();
          if(leaf%3===0)spark(xx,yy,1.1+depth*1.4,'rgba(211,252,211,.31)');
        }
      }
      for(let layer=0;layer<3;layer++){
        ctx.fillStyle=['rgba(18,71,58,.3)','rgba(11,58,47,.54)','rgba(5,38,36,.9)'][layer];
        ctx.beginPath();ctx.moveTo(0,h);
        for(let x=0;x<=w+22;x+=22){const yy=h*(.78+layer*.082)+Math.sin(x*.018+layer*2)*h*.023;ctx.lineTo(x,yy)}
        ctx.lineTo(w,h);ctx.closePath();ctx.fill();
      }
      for(let i=0;i<52;i++){
        const x=random()*w,y=h*(.76+random()*.24),len=h*(.025+random()*.07);
        ctx.strokeStyle=`rgba(${i%4===0?'244,190,221':'120,231,162'},${.17+random()*.32})`;
        ctx.lineWidth=1+random()*2;ctx.beginPath();ctx.moveTo(x,y);ctx.quadraticCurveTo(x-len*.34,y-len*.65,x-len*.8,y-len);ctx.moveTo(x,y);ctx.quadraticCurveTo(x+len*.34,y-len*.65,x+len*.78,y-len);ctx.stroke();
      }
      for(let i=0;i<17;i++)spark(random()*w,random()*h,1+random()*2,'rgba(190,255,198,.48)');
    }else if(chapter===3){ // A high sky with vast clouds, floating islands and aurora.
      haze(w*.53,h*.53,w*.7,'244,173,228',.26);
      const sun=ctx.createRadialGradient(w*.7,h*.64,0,w*.7,h*.64,h*.43);
      sun.addColorStop(0,'rgba(255,219,177,.34)');sun.addColorStop(1,'rgba(255,219,177,0)');
      ctx.fillStyle=sun;ctx.fillRect(0,h*.15,w,h*.82);
      for(let band=0;band<4;band++){
        ctx.beginPath();ctx.moveTo(-w*.15,h*(.2+band*.08));
        for(let i=0;i<7;i++)ctx.bezierCurveTo(w*(i/7+.06),h*(.1+band*.08),w*(i/7+.1),h*(.4+band*.06),w*((i+1)/7+.07),h*(.22+band*.08));
        ctx.strokeStyle=`rgba(${band%2?'123,240,244':'210,155,255'},${.19-band*.027})`;ctx.lineWidth=4+band*2;ctx.stroke();
      }
      for(let layer=0;layer<4;layer++)for(let i=0;i<9;i++){
        const x=random()*w,y=h*(.18+random()*.67),r=w*(.036+random()*.08)*(1+layer*.12);
        ctx.fillStyle=`rgba(${layer<2?'221,207,248':'112,140,188'},${.035+layer*.035})`;
        ctx.beginPath();ctx.ellipse(x,y,r,r*.22,random()*.15,0,Math.PI*2);ctx.fill();
        ctx.beginPath();ctx.ellipse(x-r*.2,y-r*.12,r*.62,r*.24,0,0,Math.PI*2);ctx.fill();
      }
      for(let i=0;i<8;i++){
        const x=random()*w,y=h*(.42+random()*.38),r=w*(.03+random()*.07);
        ctx.fillStyle='rgba(21,32,64,.45)';ctx.beginPath();ctx.ellipse(x,y,r,r*.18,0,0,Math.PI*2);ctx.fill();
        ctx.fillStyle='rgba(114,208,188,.25)';ctx.beginPath();ctx.ellipse(x,y-r*.12,r*.75,r*.11,0,0,Math.PI*2);ctx.fill();
        ctx.strokeStyle='rgba(222,218,255,.2)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x-r*.5,y+r*.1);ctx.lineTo(x-r*.2,y+r*.42);ctx.moveTo(x+r*.4,y+r*.1);ctx.lineTo(x+r*.2,y+r*.32);ctx.stroke();
      }
    }else{ // The living planet: warm horizon, flower valleys and tree of life.
      haze(w*.5,h*.52,w*.72,'255,205,148',.36);
      const moon=ctx.createRadialGradient(w*.73,h*.3,0,w*.73,h*.3,Math.min(w,h)*.25);
      moon.addColorStop(0,'#fff9e5');moon.addColorStop(.38,'#f2e5b7');moon.addColorStop(.85,'rgba(255,218,158,.28)');moon.addColorStop(1,'rgba(255,218,158,0)');
      ctx.fillStyle=moon;ctx.beginPath();ctx.arc(w*.73,h*.3,Math.min(w,h)*.25,0,Math.PI*2);ctx.fill();
      for(let layer=0;layer<4;layer++){
        const yy=h*(.67+layer*.083);
        ctx.fillStyle=['rgba(90,145,123,.26)','rgba(48,114,108,.42)','rgba(35,84,95,.68)','rgba(13,48,61,.95)'][layer];
        ctx.beginPath();ctx.moveTo(0,h);
        for(let x=0;x<=w+25;x+=25)ctx.lineTo(x,yy+Math.sin(x*.01+layer*1.2)*h*.035);
        ctx.lineTo(w,h);ctx.closePath();ctx.fill();
      }
      const tx=w*.25,ty=h*.57,tr=Math.min(w,h)*.26;
      ctx.strokeStyle='rgba(234,202,172,.28)';ctx.lineWidth=tr*.22;ctx.beginPath();ctx.moveTo(tx,h*.87);ctx.bezierCurveTo(tx-tr*.12,ty+tr*.3,tx+tr*.08,ty+tr*.03,tx,ty-tr*.58);ctx.stroke();
      for(let i=0;i<11;i++){
        const angle=-Math.PI+i*Math.PI/10,r=tr*(.72+.24*random());
        ctx.strokeStyle='rgba(221,196,157,.32)';ctx.lineWidth=tr*.038;
        ctx.beginPath();ctx.moveTo(tx,ty-tr*.22);ctx.quadraticCurveTo(tx+Math.cos(angle)*r*.5,ty+Math.sin(angle)*r*.48,tx+Math.cos(angle)*r,ty+Math.sin(angle)*r);ctx.stroke();
        haze(tx+Math.cos(angle)*r,ty+Math.sin(angle)*r,tr*.28,i%3?'147,231,170':'255,202,187',.15);
      }
      for(let i=0;i<70;i++){
        const a=random()*Math.PI*2,r=Math.sqrt(random()),xx=tx+Math.cos(a)*tr*.95*r,yy=ty-tr*.62+Math.sin(a)*tr*.56*r;
        ctx.save();ctx.translate(xx,yy);ctx.rotate(a);
        ctx.fillStyle=`rgba(${['142,226,174','255,204,197','181,248,209','218,186,243'][i%4]},${.12+random()*.21})`;
        ctx.beginPath();ctx.ellipse(0,0,tr*(.055+random()*.045),tr*(.027+random()*.019),0,0,Math.PI*2);ctx.fill();ctx.restore();
        if(i%9===0)spark(xx,yy,1.5+random()*1.4,'rgba(255,243,199,.52)');
      }
      for(let i=0;i<42;i++){
        const x=random()*w,y=h*(.77+random()*.22),r=2+random()*6;
        ctx.fillStyle=`rgba(${i%3?'246,204,174':'174,255,212'},${.18+random()*.35})`;
        for(let p=0;p<5;p++){
          const a=p*Math.PI*2/5;ctx.beginPath();ctx.ellipse(x+Math.cos(a)*r*.65,y+Math.sin(a)*r*.65,r*.48,r*.27,a,0,Math.PI*2);ctx.fill();
        }
        spark(x,y,r*.24,'rgba(255,249,202,.58)');
      }
    }
    ctx.restore();
  }
  // A living world responds to growth. The permanent scenery stays cached;
  // these lightweight discoveries bloom over it as each chapter advances.
  function drawGrowingWorld(ctx,w,h,stage,progress,time,reduced=false){
    const growth=Math.max(0,Math.min(1,Number(progress)||0));
    const revealed=Math.floor(growth*12);
    if(!revealed)return;
    const chapter=Math.max(0,Math.min(4,stage-5)),small=Math.min(w,h),t=reduced?0:time;
    const TAU=Math.PI*2,pal=chapters[chapter].pal;
    ctx.save();ctx.globalCompositeOperation='screen';ctx.lineCap='round';
    for(let i=0;i<revealed;i++){
      const drift=reduced?0:Math.sin(t*.43+i*2.4)*small*.009;
      const shimmer=.37+.21*Math.sin(t*.7+i*1.87);
      if(chapter===0){ // Portal embryos learn to orbit together.
        const a=i*2.39996+t*.09,rr=small*(.15+.055*(i%3));
        const x=w*.52+Math.cos(a)*rr+drift,y=h*.4+Math.sin(a)*rr*1.3;
        ctx.strokeStyle=`rgba(${pal[i%5]},${.14+shimmer*.23})`;ctx.lineWidth=1.6;
        ctx.beginPath();ctx.moveTo(w*.52,h*.4);ctx.quadraticCurveTo(x+drift*2,y-small*.08,x,y);ctx.stroke();
        ctx.fillStyle=`rgba(${pal[i%5]},${.3+shimmer*.36})`;
        ctx.beginPath();ctx.ellipse(x,y,small*.009,small*.012,.3,0,TAU);ctx.fill();
      }else if(chapter===1){ // Bioluminescent coral slowly covers the reef.
        const side=i%2?-1:1,x=w*(side<0?.08:.92)+side*small*.018*Math.floor(i/2),y=h*(.9-.017*(i%4));
        const height=small*(.035+.012*(i%3)+growth*.038);
        ctx.strokeStyle=`rgba(${pal[i%5]},${.24+shimmer*.42})`;ctx.lineWidth=2.4+(i%3);
        ctx.beginPath();ctx.moveTo(x,y);ctx.quadraticCurveTo(x-side*height*.3,y-height*.7,x+drift,y-height);ctx.stroke();
        for(let arm=-1;arm<=1;arm+=2){
          ctx.beginPath();ctx.moveTo(x+drift*.5,y-height*.56);
          ctx.quadraticCurveTo(x+arm*height*.65,y-height*.65,x+arm*height*.72,y-height*.82);ctx.stroke();
        }
        ctx.fillStyle=`rgba(200,255,244,${.3+shimmer*.45})`;
        ctx.beginPath();ctx.arc(x+drift,y-height,1.3+growth*2,0,TAU);ctx.fill();
      }else if(chapter===2){ // Little mushrooms and crystal buds light up the undergrowth.
        const x=w*(.12+.76*((i*7%13)/12)),y=h*(.82+.12*((i*3%7)/6));
        const size=small*(.012+.011*(i%3)+growth*.008);
        ctx.fillStyle=`rgba(${pal[i%5]},${.24+shimmer*.32})`;
        ctx.beginPath();ctx.ellipse(x+drift,y,size*1.05,size*.42,0,Math.PI,TAU);ctx.fill();
        ctx.strokeStyle=`rgba(190,255,218,${.25+shimmer*.32})`;ctx.lineWidth=1.8;
        ctx.beginPath();ctx.moveTo(x+drift,y);ctx.lineTo(x+drift,y+size*.95);ctx.stroke();
        ctx.fillStyle=`rgba(255,255,221,${.24+shimmer*.28})`;
        ctx.beginPath();ctx.arc(x+drift-size*.36,y-size*.14,1.4,0,TAU);ctx.fill();
      }else if(chapter===3){ // Higher growth paints deeper aurora ribbons in the sky.
        const yy=h*(.1+.034*i),wave=small*(.02+.006*i);
        ctx.strokeStyle=`rgba(${pal[i%5]},${.11+shimmer*.26})`;ctx.lineWidth=2+(i%4)*1.2;
        ctx.beginPath();ctx.moveTo(-w*.12,yy);
        ctx.bezierCurveTo(w*.23,yy-wave+drift,w*.44,yy+wave,w*.7,yy-wave*.4);
        ctx.quadraticCurveTo(w*.87,yy-wave,w*1.12,yy+wave*.4);ctx.stroke();
        const x=w*(.14+.72*((i*5%11)/10));
        ctx.fillStyle=`rgba(255,249,232,${.13+shimmer*.3})`;
        ctx.beginPath();ctx.ellipse(x,yy+wave*.6,small*.007,small*.002,-.4,0,TAU);ctx.fill();
      }else{ // The final tree slowly gathers the lights of its new friends.
        const a=i*2.39996+t*.035,rr=small*(.07+.014*i),x=w*.25+Math.cos(a)*rr+drift;
        const y=h*.57-small*.16+Math.sin(a)*rr*.76;
        ctx.strokeStyle=`rgba(${pal[i%5]},${.13+shimmer*.25})`;ctx.lineWidth=1.8;
        ctx.beginPath();ctx.moveTo(w*.25,h*.57-small*.16);ctx.lineTo(x,y);ctx.stroke();
        for(let p=0;p<5;p++){
          const aa=p*TAU/5+t*.08;
          ctx.fillStyle=`rgba(${pal[i%5]},${.19+shimmer*.38})`;
          ctx.beginPath();ctx.ellipse(x+Math.cos(aa)*small*.008,y+Math.sin(aa)*small*.008,small*.008,small*.004,aa,0,TAU);ctx.fill();
        }
        ctx.fillStyle='rgba(255,249,216,.76)';ctx.beginPath();ctx.arc(x,y,small*.0025,0,TAU);ctx.fill();
      }
    }
    ctx.restore();
  }
  function drawAtmosphere(ctx,stars,w,h,stage,time,px=0,py=0,reduced=false,progress=0){
    const chapter=Math.max(0,Math.min(4,stage-5));
    const colors=chapters[chapter].pal,TAU=Math.PI*2,t=reduced?0:time;
    const count=Math.min(stars.length,25+chapter*3+Math.round(Math.max(0,progress)*8));
    ctx.save();ctx.lineCap='round';
    for(let i=0;i<count;i++){
      const s=stars[i],speed=.6+chapter*.17+s.s*.13;
      const flow=(t*speed*9)%Math.max(1,h+30);
      const x=(s.x+px*.04+Math.sin(s.p+t*.38)*((chapter===3?9:4)+chapter*2)+w)%w;
      const y=chapter===1?(s.y-flow+h+30)%(h+30)-15:chapter===3?(s.y+flow*.24)%h:(s.y+py*.04+Math.sin(s.p+t*.32)*6+h)%h;
      const r=s.s*(chapter>=3?1.3:1),a=.24+.36*(.5+.5*Math.sin(s.p+t*1.5));
      if(chapter===1){
        ctx.strokeStyle=`rgba(${colors[i%5]},${a*.7})`;ctx.lineWidth=.8;
        ctx.beginPath();ctx.arc(x,y,r*(1.6+i%3),0,TAU);ctx.stroke();
        ctx.fillStyle=`rgba(235,255,255,${a*.42})`;ctx.beginPath();ctx.arc(x-r*.4,y-r*.5,Math.max(.35,r*.3),0,TAU);ctx.fill();
      }else if(chapter===2){
        ctx.fillStyle=`rgba(${colors[i%5]},${a})`;ctx.beginPath();ctx.ellipse(x,y,r*(.9+i%2*.2),r*2.3,s.p,0,TAU);ctx.fill();
        if(i%5===0){ctx.strokeStyle=`rgba(188,255,191,${a*.45})`;ctx.lineWidth=.8;ctx.beginPath();ctx.moveTo(x-r*4,y);ctx.lineTo(x+r*4,y);ctx.stroke();}
      }else if(chapter===3){
        ctx.strokeStyle=`rgba(${colors[i%5]},${a*.7})`;ctx.lineWidth=.8+r*.3;
        ctx.beginPath();ctx.moveTo(x-r*3,y+r);ctx.quadraticCurveTo(x,y-r*3,x+r*4,y-r*1.3);ctx.stroke();
        if(i%4===0){ctx.fillStyle=`rgba(255,248,239,${a*.6})`;ctx.beginPath();ctx.arc(x,y,r*.5,0,TAU);ctx.fill();}
      }else if(chapter===4){
        ctx.save();ctx.translate(x,y);ctx.rotate(s.p+t*.13);
        ctx.fillStyle=`rgba(${colors[i%5]},${a*.72})`;
        for(let p=0;p<4;p++){ctx.save();ctx.rotate(p*Math.PI/2);ctx.beginPath();ctx.ellipse(0,-r*2.5,r*.85,r*1.6,0,0,TAU);ctx.fill();ctx.restore();}
        ctx.fillStyle=`rgba(255,245,211,${a})`;ctx.beginPath();ctx.arc(0,0,r*.8,0,TAU);ctx.fill();ctx.restore();
      }else{
        ctx.strokeStyle=`rgba(${colors[i%5]},${a*.65})`;ctx.lineWidth=.8;
        ctx.beginPath();ctx.moveTo(x-r*3,y);ctx.lineTo(x+r*3,y);ctx.moveTo(x,y-r*3);ctx.lineTo(x,y+r*3);ctx.stroke();
        ctx.fillStyle=`rgba(255,235,237,${a})`;ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.fill();
      }
    }
    ctx.restore();
    drawGrowingWorld(ctx,w,h,stage,progress,time,reduced);
  }
  function drawFood(ctx,food,type,time=0,reduced=false,progress=0,currentStage=type.stage){
    const sceneStage=type.mem?currentStage:type.stage,form=type.mem?'bubble':type.form;
    if(sceneStage<5||!form)return false;
    const TAU=Math.PI*2,chapter=sceneStage-5;
    const color=type.mem?chapters[chapter].color:type.color;
    const r=food.r*(.34+.66*food.born)*(type.motion==='pulse'?(1+.07*Math.sin(time*2+food.seed)):1);
    const wiggle=reduced?0:Math.sin(time*1.8+food.seed),seed=food.seed||0;
    ctx.save();ctx.globalAlpha=Math.min(1,food.born);ctx.translate(food.x,food.y);
    ctx.rotate((food.rot||0)*.16+(form==='leaf'||form==='feather'||form==='fish'?.09*wiggle:0));
    ctx.lineCap='round';ctx.lineJoin='round';
    const glow=ctx.createRadialGradient(0,0,r*.12,0,0,r*2.3);
    glow.addColorStop(0,'rgba(255,250,242,.18)');
    glow.addColorStop(.38,`rgba(${chapters[chapter].rgb},${.16+.09*progress})`);
    glow.addColorStop(1,`rgba(${chapters[chapter].rgb},0)`);
    ctx.fillStyle=glow;ctx.beginPath();ctx.arc(0,0,r*2.3,0,TAU);ctx.fill();
    const fill=ctx.createRadialGradient(-r*.38,-r*.42,r*.06,0,0,r*1.45);
    fill.addColorStop(0,'#ffffff');fill.addColorStop(.37,color);fill.addColorStop(1,'#324568');
    const oval=(x,y,rx,ry,paint=fill)=>{ctx.fillStyle=paint;ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,TAU);ctx.fill();};
    const stroke=(paint='rgba(255,255,255,.68)',width=Math.max(1,r*.09))=>{ctx.strokeStyle=paint;ctx.lineWidth=width;ctx.stroke();};
    const eyes=(x1=-.27,x2=.27,y=-.12)=>{
      ctx.fillStyle='#29374b';for(const x of [x1,x2]){ctx.beginPath();ctx.ellipse(x*r,y*r,r*.085,r*.12,0,0,TAU);ctx.fill();}
      ctx.strokeStyle='#a36680';ctx.lineWidth=Math.max(.8,r*.055);ctx.beginPath();ctx.arc(0,r*.16,r*.12,.1,Math.PI-.1);ctx.stroke();
    };
    if(form==='cell'||form==='microbe'||form==='spore'||form==='egg'){
      if(form==='microbe'){
        ctx.strokeStyle=color;ctx.lineWidth=r*.28;ctx.beginPath();ctx.moveTo(-r*.55,r*.12);
        ctx.bezierCurveTo(-r*1.1,r*.06+wiggle*r*.2,-r*1.6,r*.7,-r*1.72,r*.2);ctx.stroke();
      }
      const size=form==='spore'?.63:form==='egg'?.82:.88;
      oval(0,0,r*size,r*(form==='egg'?1.12:.8));
      if(form==='cell'||form==='microbe'){
        oval(r*.15,r*.05,r*.27,r*.24,'rgba(246,174,211,.66)');
        oval(r*.18,-r*.02,r*.11,r*.11,'rgba(255,253,240,.9)');eyes();
        if(form==='cell')for(const side of [-1,1])oval(side*r*.82,r*.21,r*.19,r*.15,color);
      }else if(form==='spore'){
        for(let i=0;i<7;i++){const a=i*TAU/7;oval(Math.cos(a)*r*.95,Math.sin(a)*r*.84,r*.12,r*.12,i%2?'#dffaf4':'#fff4dc');}
        oval(0,-r*.16,r*.22,r*.2,'rgba(255,255,255,.68)');
      }else{
        for(let i=0;i<4;i++)oval(Math.sin(seed+i)*r*.37,Math.cos(seed+i*2)*r*.4,r*.09,r*.07,'rgba(255,250,233,.62)');
        eyes(-.22,.22,.03);
      }
    }else if(form==='helix'){
      for(let strand=0;strand<2;strand++){
        ctx.strokeStyle=strand?color:'#fff2dc';ctx.lineWidth=r*.2;ctx.beginPath();
        for(let i=0;i<=12;i++){const y=r*(i/6-1),x=Math.sin(i*.72+strand*Math.PI+time*.28)*r*.55;i?ctx.lineTo(x,y):ctx.moveTo(x,y);}
        ctx.stroke();
      }
      ctx.strokeStyle='rgba(255,255,255,.7)';ctx.lineWidth=r*.065;
      for(let i=1;i<12;i+=2){const y=r*(i/6-1),x=Math.sin(i*.72+time*.28)*r*.55;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(-x,y);ctx.stroke();}
    }else if(form==='droplet'){
      ctx.fillStyle=fill;ctx.beginPath();ctx.moveTo(0,-r*1.25);ctx.bezierCurveTo(-r*.25,-r*.55,-r*.86,-r*.12,-r*.77,r*.4);
      ctx.bezierCurveTo(-r*.62,r*1.3,r*.62,r*1.3,r*.77,r*.4);ctx.bezierCurveTo(r*.86,-r*.12,r*.25,-r*.55,0,-r*1.25);ctx.fill();stroke();
      oval(-r*.3,-r*.13,r*.13,r*.28,'rgba(255,255,255,.74)');
    }else if(form==='fish'||form==='seahorse'){
      ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(-r*.62,0);ctx.lineTo(-r*1.3,-r*.57);ctx.lineTo(-r*1.18,r*.57);ctx.closePath();ctx.fill();
      if(form==='fish'){
        oval(0,0,r*.9,r*.61);ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(-r*.18,-r*.34);ctx.lineTo(r*.18,-r*.98);ctx.lineTo(r*.45,-r*.28);ctx.closePath();ctx.fill();
        oval(r*.32,-r*.15,r*.085,r*.11,'#20384c');
        ctx.strokeStyle='rgba(255,255,255,.7)';ctx.lineWidth=r*.055;ctx.beginPath();ctx.arc(r*.68,r*.11,r*.17,.1,1.5);ctx.stroke();
      }else{
        oval(0,-r*.3,r*.58,r*.78);oval(r*.35,-r*.7,r*.5,r*.33);
        ctx.strokeStyle=color;ctx.lineWidth=r*.27;ctx.beginPath();ctx.moveTo(-r*.15,r*.2);ctx.bezierCurveTo(-r*.7,r*.8,-r*.3,r*1.6,r*.22,r*1.03);ctx.stroke();
        oval(r*.58,-r*.81,r*.08,r*.09,'#283b50');
      }
    }else if(form==='jelly'){
      for(let i=-2;i<=2;i++){
        ctx.strokeStyle=i%2?'#daf8ff':color;ctx.lineWidth=r*.11;ctx.beginPath();ctx.moveTo(i*r*.29,r*.04);
        ctx.bezierCurveTo(i*r*.36+wiggle*r*.18,r*.56,i*r*.25-wiggle*r*.19,r*.9,i*r*.3,r*1.24);ctx.stroke();
      }
      ctx.fillStyle=fill;ctx.beginPath();ctx.moveTo(-r*.94,r*.16);ctx.bezierCurveTo(-r*1.03,-r*1.1,r*.99,-r*1.1,r*.94,r*.16);
      ctx.quadraticCurveTo(0,r*.43,-r*.94,r*.16);ctx.closePath();ctx.fill();stroke();eyes(-.3,.3,-.2);
    }else if(form==='pearl'||form==='bubble'){
      oval(0,0,r*.87,r*.87,form==='bubble'?'rgba(166,237,255,.17)':fill);
      ctx.strokeStyle=form==='bubble'?'rgba(230,253,255,.76)':color;ctx.lineWidth=Math.max(1.2,r*.12);
      ctx.beginPath();ctx.arc(0,0,r*.84,0,TAU);ctx.stroke();
      oval(-r*.31,-r*.38,r*.18,r*.1,'rgba(255,255,255,.89)');
      if(form==='bubble'){for(let i=0;i<3;i++)oval((i-1)*r*.43,r*(i%2?.57:-.6),r*.1,r*.1,'rgba(220,247,255,.57)');}
    }else if(form==='shell'){
      ctx.fillStyle=fill;ctx.beginPath();ctx.moveTo(-r,r*.56);
      for(let i=0;i<6;i++)ctx.quadraticCurveTo((-1+i*.4)*r,-r*(.92+i%2*.17),(-.8+i*.32)*r,r*.15);
      ctx.lineTo(r*.92,r*.58);ctx.closePath();ctx.fill();stroke();
      ctx.strokeStyle='rgba(255,255,255,.66)';ctx.lineWidth=r*.05;
      for(let i=-2;i<=2;i++){ctx.beginPath();ctx.moveTo(0,r*.5);ctx.lineTo(i*r*.36,-r*.5);ctx.stroke();}
    }else if(form==='coral'){
      for(let b=-2;b<=2;b++){
        ctx.strokeStyle=b%2?'#ffc9d6':color;ctx.lineWidth=r*(.24-Math.abs(b)*.025);
        ctx.beginPath();ctx.moveTo(0,r*.9);ctx.quadraticCurveTo(b*r*.27,-r*.22,b*r*.35,-r*(.7+Math.abs(b)*.13));ctx.stroke();
        oval(b*r*.35,-r*(.7+Math.abs(b)*.13),r*.12,r*.13,'rgba(255,255,255,.6)');
      }
    }else if(form==='leaf'||form==='feather'){
      ctx.fillStyle=fill;ctx.beginPath();ctx.moveTo(-r*.85,r*.76);ctx.bezierCurveTo(-r*1.03,-r*.36,r*.18,-r*1.12,r*.92,-r*.92);
      ctx.bezierCurveTo(r*1.1,r*.1,r*.3,r*1.09,-r*.85,r*.76);ctx.fill();stroke();
      ctx.strokeStyle='rgba(255,255,255,.7)';ctx.lineWidth=r*.1;ctx.beginPath();ctx.moveTo(-r*.88,r*.84);ctx.quadraticCurveTo(0,-r*.05,r*.89,-r*.9);ctx.stroke();
      if(form==='feather')for(let i=0;i<5;i++){
        ctx.beginPath();ctx.moveTo(-r*.5+i*r*.22,r*.5-i*r*.26);ctx.lineTo(-r*.76+i*r*.18,-r*.2-i*r*.26);ctx.stroke();
      }
    }else if(form==='berry'||form==='acorn'){
      if(form==='berry'){
        for(const [x,y] of [[-.37,.17],[.37,.15],[0,-.35]])oval(x*r,y*r,r*.43,r*.44);
        ctx.fillStyle='#8de2ab';ctx.beginPath();ctx.ellipse(0,-r*.75,r*.5,r*.21,.4,0,TAU);ctx.fill();
        oval(-r*.16,-r*.45,r*.12,r*.11,'rgba(255,255,255,.8)');
      }else{
        oval(0,r*.15,r*.67,r*.83);
        ctx.fillStyle='#9b7758';ctx.beginPath();ctx.ellipse(0,-r*.56,r*.77,r*.38,0,0,TAU);ctx.fill();
        ctx.strokeStyle='#f0dfb6';ctx.lineWidth=r*.07;ctx.beginPath();ctx.moveTo(0,-r*.85);ctx.lineTo(r*.12,-r*1.1);ctx.stroke();
      }
    }else if(form==='mushroom'){
      oval(0,r*.33,r*.32,r*.67,'#e9e6da');
      ctx.fillStyle=fill;ctx.beginPath();ctx.moveTo(-r*.92,r*.03);ctx.quadraticCurveTo(-r*.62,-r*1.13,0,-r*1.13);
      ctx.quadraticCurveTo(r*.62,-r*1.13,r*.92,r*.03);ctx.closePath();ctx.fill();stroke();
      for(const x of [-.46,0,.46])oval(r*x,r*(x===0?-.62:-.3),r*.14,r*.12,'rgba(255,255,255,.75)');
    }else if(form==='butterfly'||form==='firefly'){
      for(const side of [-1,1]){
        oval(side*r*.53,-r*.35,r*(form==='firefly'?.42:.55),r*.53,form==='firefly'?'rgba(228,248,255,.48)':fill);
        oval(side*r*.46,r*.38,r*.38,r*.36,form==='firefly'?'rgba(255,237,219,.38)':color);
      }
      oval(0,0,r*.19,r*.67,form==='firefly'?'#fff9b8':'#304258');
      ctx.strokeStyle='rgba(255,255,255,.8)';ctx.lineWidth=r*.08;ctx.beginPath();ctx.moveTo(-r*.1,-r*.48);ctx.lineTo(-r*.33,-r*.9);ctx.moveTo(r*.1,-r*.48);ctx.lineTo(r*.33,-r*.9);ctx.stroke();
    }else if(form==='pollen'){
      for(let i=0;i<9;i++){
        const a=i*TAU/9+seed,d=r*(i%2?.63:.94);
        oval(Math.cos(a)*d,Math.sin(a)*d,r*(.17+i%3*.035),r*(.17+i%3*.035),i%2?'#fff4c3':color);
      }
      oval(0,0,r*.3,r*.32);
    }else if(form==='flower'){
      for(let i=0;i<6;i++){
        const a=i*TAU/6+wiggle*.08;
        ctx.save();ctx.rotate(a);oval(0,-r*.67,r*.38,r*.55,color);ctx.restore();
      }
      oval(0,0,r*.48,r*.48,'#fff4b8');eyes(-.15,.15,0);
    }else if(form==='cloud'){
      oval(-r*.43,r*.18,r*.59,r*.45);
      oval(r*.45,r*.14,r*.59,r*.49);
      oval(0,-r*.21,r*.72,r*.68);
      ctx.strokeStyle='rgba(255,255,255,.55)';ctx.lineWidth=r*.08;ctx.beginPath();ctx.arc(-r*.22,-r*.29,r*.31,-Math.PI*.8,-.2);ctx.stroke();
    }else if(form==='bird'){
      ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(-r*.52,r*.16);ctx.lineTo(-r*1.25,r*.04);ctx.lineTo(-r*.75,r*.6);ctx.closePath();ctx.fill();
      oval(0,0,r*.77,r*.58);oval(r*.56,-r*.3,r*.36,r*.37);
      ctx.fillStyle='rgba(255,255,255,.75)';ctx.beginPath();ctx.ellipse(-r*.16,r*.05,r*.51,r*.23,-.42,0,TAU);ctx.fill();
      ctx.fillStyle='#ffe7a4';ctx.beginPath();ctx.moveTo(r*.87,-r*.27);ctx.lineTo(r*1.27,-r*.12);ctx.lineTo(r*.89,0);ctx.closePath();ctx.fill();
      oval(r*.68,-r*.42,r*.075,r*.082,'#28374c');
    }else if(form==='wind'){
      ctx.strokeStyle=color;ctx.lineWidth=r*.2;
      for(let i=0;i<3;i++){
        ctx.beginPath();ctx.arc(0,0,r*(.42+i*.28),seed+i*.25+time*.1,seed+i*.25+time*.1+Math.PI*1.45);ctx.stroke();
      }
      oval(0,0,r*.24,r*.24,'#f0ffff');
    }else if(form==='heart'){
      ctx.fillStyle=fill;ctx.beginPath();ctx.moveTo(0,r*1.03);
      ctx.bezierCurveTo(-r*1.32,r*.18,-r*1.17,-r*.83,-r*.44,-r*.82);
      ctx.bezierCurveTo(-r*.04,-r*.79,0,-r*.43,0,-r*.43);
      ctx.bezierCurveTo(0,-r*.43,r*.21,-r*.94,r*.7,-r*.82);
      ctx.bezierCurveTo(r*1.35,-r*.58,r*1.02,r*.35,0,r*1.03);ctx.closePath();ctx.fill();stroke();
      oval(-r*.4,-r*.38,r*.16,r*.1,'rgba(255,255,255,.8)');
    }else if(form==='sprite'||form==='sprout'){
      if(form==='sprout'){
        ctx.strokeStyle='#80d9a3';ctx.lineWidth=r*.13;ctx.beginPath();ctx.moveTo(0,-r*.23);ctx.lineTo(0,-r*1.24);ctx.stroke();
        for(const side of [-1,1]){ctx.fillStyle=side===1?'#a3efc0':'#b6e2a0';ctx.beginPath();ctx.ellipse(side*r*.4,-r*.96,r*.44,r*.22,side*.45,0,TAU);ctx.fill();}
      }else for(const side of [-1,1])oval(side*r*.56,-r*.67,r*.3,r*.42,color);
      oval(0,0,r*.76,r*.69);eyes(-.27,.27,-.07);
      for(const side of [-1,1])oval(side*r*.4,r*.58,r*.2,r*.15,color);
    }
    if(food.hit>0){ctx.fillStyle=`rgba(255,255,255,${Math.min(.65,food.hit*4)})`;ctx.beginPath();ctx.arc(0,0,r,0,TAU);ctx.fill();}
    if(food.hp<food.max&&food.hp>0){
      ctx.strokeStyle='rgba(255,248,228,.85)';ctx.lineWidth=Math.max(1.3,r*.14);
      ctx.beginPath();ctx.arc(0,0,r*1.34,-Math.PI/2,-Math.PI/2+TAU*food.hp/food.max);ctx.stroke();
    }
    ctx.restore();return true;
  }
  function drawMagic(ctx,x,y,r,stage,progress,time,reduced=false){
    const chapter=Math.max(0,Math.min(4,stage-5)),power=chapter+Math.max(0,Math.min(1,progress));
    const colors=chapters[chapter].pal,t=reduced?0:time*.32;
    ctx.save();ctx.globalCompositeOperation='lighter';ctx.lineCap='round';
    const rings=Math.min(5,1+Math.floor(power));
    for(let i=0;i<rings;i++){
      const rr=r*(1+i*.24),angle=t*(i%2?-.6:1)+(i*.67);
      ctx.strokeStyle=`rgba(${colors[i%5]},${.21+i*.035})`;ctx.lineWidth=1.2+i*.35;
      ctx.beginPath();ctx.ellipse(x,y,rr,rr*(.45+.04*i),angle,0,Math.PI*1.7);ctx.stroke();
    }
    const motes=Math.min(32,5+Math.floor(power*5.4));
    for(let i=0;i<motes;i++){
      const a=i*2.39996+t*(i%2?-.8:1)+power*.14;
      const rr=r*(.68+Math.sqrt((i+1)/motes)*(1.15+.12*power));
      const xx=x+Math.cos(a)*rr,yy=y+Math.sin(a)*rr*.72;
      const size=(1.1+i%3*.45)*(1+.12*power);
      ctx.fillStyle=`rgba(${colors[i%5]},${.36+.4*(.5+.5*Math.sin(t*3+i))})`;
      ctx.beginPath();ctx.arc(xx,yy,size,0,Math.PI*2);ctx.fill();
      if(chapter>=2&&i%4===0){ctx.strokeStyle=`rgba(${colors[(i+2)%5]},.38)`;ctx.lineWidth=.8;ctx.beginPath();ctx.moveTo(xx-size*2,yy);ctx.lineTo(xx+size*2,yy);ctx.moveTo(xx,yy-size*2);ctx.lineTo(xx,yy+size*2);ctx.stroke();}
    }
    if(chapter>=3){
      for(let i=0;i<3+Math.floor(power);i++){
        const a=i*Math.PI*2/(3+Math.floor(power))+t*.45,rr=r*(1.24+.12*i);
        ctx.beginPath();ctx.moveTo(x+Math.cos(a)*rr,y+Math.sin(a)*rr*.55);
        ctx.quadraticCurveTo(x+Math.cos(a+.7)*rr*1.4,y+Math.sin(a+.7)*rr*.9,x+Math.cos(a+1.2)*rr,y+Math.sin(a+1.2)*rr*.55);
        ctx.strokeStyle=`rgba(${colors[(i+1)%5]},${.14+.04*progress})`;ctx.lineWidth=1.3;ctx.stroke();
      }
    }
    ctx.restore();
  }
  function drawCreature(ctx,x,y,r,stage,kind,time,progress=0){
    r*=1+.08*(Math.max(0,Math.min(4,stage-5))+Math.max(0,Math.min(1,progress)));
    const color=kinds[kind]?.color||'#d4f6ed';
    const age=Math.max(0,Math.min(4,stage-5)),bob=Math.sin(time*2)*r*.06;
    ctx.save();ctx.globalCompositeOperation='source-over';ctx.translate(x,y+bob);
    ctx.shadowColor=color;ctx.shadowBlur=r*.7;
    const light=ctx.createRadialGradient(-r*.35,-r*.45,r*.05,0,0,r*1.3);
    light.addColorStop(0,'#ffffff');light.addColorStop(.45,color);light.addColorStop(1,'#667ba5');
    ctx.fillStyle=light;
    if(age>=2){
      ctx.strokeStyle=color;ctx.lineWidth=r*.23;ctx.lineCap='round';
      for(const direction of [-1,1]){
        ctx.beginPath();ctx.moveTo(direction*r*.52,r*.35);ctx.quadraticCurveTo(direction*r*.95,r*.78,direction*r*.78,r*1.05);ctx.stroke();
        if(age>=3){ctx.beginPath();ctx.moveTo(direction*r*.64,-r*.15);ctx.quadraticCurveTo(direction*r*1.2,-r*.2,direction*r*1.18,-r*.5);ctx.stroke();}
      }
    }
    if(age>=3){
      ctx.fillStyle=color;
      if(kind==='wind'){
        for(const direction of [-1,1]){ctx.beginPath();ctx.ellipse(direction*r*1.1,-r*.05,r*.55,r*.25,direction*.45,0,Math.PI*2);ctx.fill();}
      }else if(kind==='water'){
        for(const direction of [-1,1]){
          ctx.beginPath();ctx.moveTo(direction*r*.55,-r*.2);ctx.quadraticCurveTo(direction*r*1.7,-r*.95,direction*r*1.35,r*.3);ctx.quadraticCurveTo(direction*r*.95,r*.6,direction*r*.55,r*.35);ctx.fill();
        }
      }else if(kind==='light'){
        ctx.strokeStyle='#ffe4a1';ctx.lineWidth=r*.12;ctx.beginPath();ctx.ellipse(0,-r*.96,r*.72,r*.21,0,0,Math.PI*2);ctx.stroke();
        for(const direction of [-1,1]){ctx.beginPath();ctx.moveTo(direction*r*.8,-r*.45);ctx.lineTo(direction*r*1.07,-r*.8);ctx.stroke();}
      }else{
        for(const direction of [-1,1]){ctx.beginPath();ctx.ellipse(direction*r*.45,-r*.95,r*.25,r*.52,direction*.3,0,Math.PI*2);ctx.fill();}
      }
    }
    ctx.beginPath();ctx.ellipse(0,0,r*(age>=2?1.08:.86),r*(age>=1?.9:.72),0,0,Math.PI*2);ctx.fillStyle=light;ctx.fill();
    ctx.shadowBlur=0;
    if(age>=1){
      ctx.fillStyle='#20344b';for(const direction of [-1,1]){ctx.beginPath();ctx.ellipse(direction*r*.29,-r*.12,r*.11,r*.17,0,0,Math.PI*2);ctx.fill();}
      ctx.strokeStyle='#c06c82';ctx.lineWidth=Math.max(1.5,r*.045);ctx.beginPath();ctx.arc(0,r*.19,r*.13,0,Math.PI);ctx.stroke();
      ctx.fillStyle='rgba(255,128,156,.48)';for(const direction of [-1,1]){ctx.beginPath();ctx.ellipse(direction*r*.56,r*.14,r*.15,r*.08,0,0,Math.PI*2);ctx.fill();}
    }
    if(age>=4){ctx.fillStyle='#fff6c6';ctx.beginPath();for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5,rr=i%2?r*.13:r*.3;const px=Math.cos(a)*rr,py=-r*.9+Math.sin(a)*rr;i?ctx.lineTo(px,py):ctx.moveTo(px,py);}ctx.closePath();ctx.fill();}
    const marks=Math.floor(Math.max(0,Math.min(1,progress))*9);
    ctx.fillStyle='rgba(255,255,255,.74)';
    for(let i=0;i<marks;i++){
      const a=(i+1)*2.39996,rr=r*(.2+.35*(i%3)/2);
      ctx.beginPath();ctx.arc(Math.cos(a)*rr,Math.sin(a)*rr*.6,r*.032,0,Math.PI*2);ctx.fill();
    }
    ctx.restore();
  }
  function drawBoss(ctx,b,chapter,time){
    const colors=chapters[chapter].pal,phase=time*.45,r=b.r;
    const strong=1+Math.min(.65,1-Math.max(0,b.hp)/Math.max(1,b.max));
    const TAU=Math.PI*2;
    ctx.save();ctx.translate(b.x,b.y);ctx.rotate(Math.sin(phase)*.075);
    ctx.globalCompositeOperation='lighter';
    for(let i=0;i<3+chapter*2;i++){
      const a=i*2.39996+phase*(i%2?-1:1),rr=r*(1.5+.16*chapter+.13*(i%3));
      ctx.strokeStyle=`rgba(${colors[i%5]},${.15+.04*strong})`;ctx.lineWidth=1.4+(i%3)*.5;
      ctx.beginPath();ctx.arc(Math.cos(a)*rr,Math.sin(a)*rr,r*(.075+.02*chapter),0,TAU);ctx.stroke();
      ctx.beginPath();ctx.moveTo(Math.cos(a)*rr-r*.1,Math.sin(a)*rr);ctx.lineTo(Math.cos(a)*rr+r*.1,Math.sin(a)*rr);ctx.stroke();
    }
    for(let i=0;i<2+chapter;i++){
      ctx.save();ctx.rotate(phase*(i%2?-.7:.85)+i*.9);
      ctx.strokeStyle=`rgba(${colors[(i+1)%5]},${.19+.035*chapter})`;ctx.lineWidth=1+i*.34;
      ctx.beginPath();ctx.ellipse(0,0,r*(1.26+i*.22),r*(.39+i*.12),.3,0,Math.PI*1.82);ctx.stroke();ctx.restore();
    }
    const aura=ctx.createRadialGradient(0,0,0,0,0,r*2.3);
    aura.addColorStop(0,`rgba(${colors[0]},.46)`);aura.addColorStop(1,`rgba(${colors[1]},0)`);
    ctx.fillStyle=aura;ctx.beginPath();ctx.arc(0,0,r*2.3,0,TAU);ctx.fill();
    ctx.globalCompositeOperation='source-over';ctx.lineJoin='round';ctx.lineCap='round';ctx.lineWidth=Math.max(2,r*.055);
    const soft=ctx.createLinearGradient(-r,-r,r,r);
    soft.addColorStop(0,'#ffffff');soft.addColorStop(.36,chapters[chapter].color);soft.addColorStop(1,'#2b2351');
    ctx.fillStyle=soft;ctx.strokeStyle=chapters[chapter].color;
    if(chapter===1){ // The deep-sea shadow whale, with bioluminescent fins and tail.
      ctx.beginPath();ctx.moveTo(-r*.75,-r*.14);ctx.quadraticCurveTo(-r*1.42,-r*1.23,-r*1.54,-r*.9);
      ctx.lineTo(-r*1.42,r*.08);ctx.lineTo(-r*1.62,r*.95);ctx.quadraticCurveTo(-r*.98,r*.64,-r*.75,r*.32);
      ctx.closePath();ctx.fill();ctx.stroke();
      ctx.beginPath();ctx.moveTo(-r*.5,-r*.4);ctx.quadraticCurveTo(-r*.12,-r*1.25,r*.34,-r*.94);
      ctx.quadraticCurveTo(r*1.36,-r*.85,r*1.2,r*.17);ctx.quadraticCurveTo(r*.98,r*.83,-r*.06,r*.75);
      ctx.quadraticCurveTo(-r*.82,r*.6,-r*.5,-r*.4);ctx.closePath();ctx.fill();ctx.stroke();
      ctx.fillStyle='rgba(220,251,255,.72)';ctx.beginPath();ctx.moveTo(-r*.16,r*.54);ctx.quadraticCurveTo(r*.25,r*1.46,r*.47,r*.77);ctx.closePath();ctx.fill();
      ctx.fillStyle='#17334e';ctx.beginPath();ctx.arc(r*.63,-r*.2,r*.11,0,TAU);ctx.fill();
      ctx.strokeStyle='#f0ffff';ctx.beginPath();ctx.arc(r*.74,r*.1,r*.19,.1,Math.PI*.78);ctx.stroke();
      ctx.fillStyle='#d8fcff';for(let i=0;i<7;i++){ctx.beginPath();ctx.arc(-r*.37+i*r*.16,-r*(.42+.13*Math.sin(i)),r*.045,0,TAU);ctx.fill();}
    }else if(chapter===2){ // Faceted crystal golem with glowing gem joints.
      const gem=points=>{ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x*r,y*r):ctx.moveTo(x*r,y*r));ctx.closePath();ctx.fill();ctx.stroke();};
      ctx.fillStyle='#659d9e';gem([[-1.38,-.16],[-.97,-.65],[-.55,-.35],[-.6,.53],[-1.19,.8]]);
      gem([[.6,-.35],[1.04,-.67],[1.38,-.12],[1.2,.82],[.64,.52]]);
      ctx.fillStyle=soft;gem([[-.72,-.71],[0,-1.24],[.75,-.68],[.82,.42],[0,.98],[-.8,.44]]);
      ctx.fillStyle='#f3f9df';gem([[-.4,-.75],[0,-1.03],[.42,-.73],[.35,-.21],[0,.05],[-.39,-.23]]);
      ctx.strokeStyle='rgba(255,255,255,.68)';ctx.beginPath();ctx.moveTo(0,-r*1.03);ctx.lineTo(0,r*.93);ctx.moveTo(0,r*.05);ctx.lineTo(r*.77,r*.42);ctx.moveTo(0,r*.05);ctx.lineTo(-r*.7,r*.39);ctx.stroke();
      ctx.fillStyle='#244a56';for(const side of [-1,1]){ctx.beginPath();ctx.arc(side*r*.31,-r*.17,r*.075,0,TAU);ctx.fill();}
    }else if(chapter===3){ // Sky dragon, cloud-wings and winding body.
      ctx.fillStyle='rgba(208,190,255,.82)';
      for(const side of [-1,1]){
        ctx.save();ctx.scale(side,1);ctx.beginPath();ctx.moveTo(r*.14,-r*.19);
        ctx.bezierCurveTo(r*.81,-r*1.32,r*1.43,-r*.68,r*1.69,-r*1.02);
        ctx.quadraticCurveTo(r*1.21,r*.36,r*.5,r*.47);ctx.closePath();ctx.fill();ctx.stroke();ctx.restore();
      }
      ctx.fillStyle=soft;ctx.beginPath();ctx.moveTo(-r*.83,r*.78);ctx.bezierCurveTo(-r*1.23,-r*.57,-r*.3,-r*1.04,r*.44,-r*.58);
      ctx.bezierCurveTo(r*1.03,-r*.2,r*.72,r*.48,r*.26,r*.54);ctx.quadraticCurveTo(-r*.2,r*.72,-r*.43,r*1.03);
      ctx.quadraticCurveTo(-r*1.02,r*1.12,-r*.83,r*.78);ctx.closePath();ctx.fill();ctx.stroke();
      ctx.beginPath();ctx.moveTo(r*.35,-r*.65);ctx.lineTo(r*.47,-r*1.12);ctx.lineTo(r*.78,-r*.67);
      ctx.moveTo(-r*.05,-r*.79);ctx.lineTo(-r*.2,-r*1.22);ctx.lineTo(r*.18,-r*.85);ctx.stroke();
      ctx.fillStyle='#302c62';ctx.beginPath();ctx.arc(r*.55,-r*.36,r*.095,0,TAU);ctx.fill();
      ctx.strokeStyle='#fff8d7';ctx.beginPath();ctx.arc(r*.58,-r*.09,r*.17,.1,2.4);ctx.stroke();
    }else if(chapter===4){ // The void heart cracks into warm life-light.
      ctx.fillStyle='#4b315d';ctx.beginPath();ctx.moveTo(0,r*1.12);
      ctx.bezierCurveTo(-r*1.48,r*.28,-r*1.12,-r*1.07,-r*.32,-r*.94);
      ctx.bezierCurveTo(0,-r*.83,0,-r*.55,0,-r*.55);
      ctx.bezierCurveTo(0,-r*.55,r*.2,-r*1.12,r*.72,-r*.98);
      ctx.bezierCurveTo(r*1.6,-r*.6,r*1.11,r*.42,0,r*1.12);ctx.closePath();ctx.fill();ctx.stroke();
      const core=ctx.createRadialGradient(0,-r*.1,0,0,0,r*.82);
      core.addColorStop(0,'#fffbe1');core.addColorStop(.45,'#ffbfa6');core.addColorStop(1,'rgba(249,133,222,0)');
      ctx.fillStyle=core;ctx.beginPath();ctx.arc(0,0,r*.82,0,TAU);ctx.fill();
      ctx.strokeStyle='#fff5c8';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-r*.2,-r*.66);ctx.lineTo(r*.14,-r*.18);ctx.lineTo(-r*.12,r*.12);ctx.lineTo(r*.2,r*.6);ctx.stroke();
      ctx.fillStyle='#211634';for(const side of [-1,1]){ctx.beginPath();ctx.arc(side*r*.48,-r*.3,r*.08,0,TAU);ctx.fill();}
    }else{ // Chapter 2's original small, gentle rift guardian.
      for(let i=0;i<8;i++){
        const a=i*TAU/8+phase,rr=r*(1.15+.12*Math.sin(time+i));
        ctx.beginPath();ctx.moveTo(Math.cos(a)*r*.7,Math.sin(a)*r*.7);ctx.lineTo(Math.cos(a)*rr,Math.sin(a)*rr);ctx.stroke();
      }
      ctx.beginPath();ctx.arc(0,0,r*.8,0,TAU);ctx.fill();ctx.stroke();
      ctx.fillStyle='#1e2340';for(const side of [-1,1]){ctx.beginPath();ctx.ellipse(side*r*.22,-r*.06,r*.09,r*.13,0,0,TAU);ctx.fill();}
      ctx.strokeStyle='#ffffff';ctx.beginPath();ctx.arc(0,r*.19,r*.18,.1,Math.PI-.1);ctx.stroke();
    }
    if(b.hit>0){ctx.globalCompositeOperation='lighter';ctx.fillStyle=`rgba(255,255,255,${Math.min(.65,b.hit*4)})`;ctx.beginPath();ctx.arc(0,0,r*.65,0,TAU);ctx.fill();}
    ctx.restore();
  }
  window.OjjudaSaetbyeolLife=Object.freeze({chapters,memories,transitions,journal,kinds,keys,choose,upgrades,drawWorld,drawAtmosphere,drawFood,drawMagic,drawCreature,drawBoss,
    portal:['은하 핵 너머에서 아주 작은 목소리가 들렸다.','그 목소리는 별의 이름도, 빛의 법칙도 알지 못했다.','다만 따뜻한 곳을 찾아 아주 천천히 움직이고 있었다.','나는 다시 한번 빛나기로 했다. 이번에는 무언가를 삼키기 위해서가 아니라 지켜 주기 위해서.','차원의 문 너머에서 첫 생명의 씨앗이 잠들어 있었다.'],
    portalReturned:['푸른 세계를 되돌려준 자리에는 작고 다정한 빛이 남아 있었다.','그 빛은 오래전 내가 놓아준 조각 하나를 품고 있었다.','돌려주었던 마음이 새로운 생명의 씨앗이 되어 돌아온 것이다.'],
    portalConsumed:['모든 빛을 삼켜 태어난 새 우주에는 아직 아무 이름도 없었다.','그 넓은 침묵의 한가운데에서, 작고 투명한 생명이 천천히 숨을 쉬었다.','커다란 힘의 끝에서 가장 여린 존재를 만난 것이다.'],
    finale:['아주 작은 세포가 생명의 별에 도착했다.','빛 하나를 품던 아이는 이제 수많은 빛을 나눌 줄 알게 되었다.','서로 다른 친구들이 자신만의 속도로 자라고, 넘어지면 쉬고, 다시 손을 잡았다.','우리가 키운 것은 가장 밝은 별 하나가 아니었다.','어두운 밤에도 서로의 길을 비춰 줄 수 있는, 오래도록 따뜻한 세상이었다.']
  });
})();
