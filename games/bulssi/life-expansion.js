/* The next thousand growth nodes continue the original game after its ending.
   All extension resources and evolution choices live in the existing save. */
(() => {
  'use strict';
  const chapters = [
    {name:'차원의 씨앗',pal:['255,213,155','146,224,255','236,172,255','139,235,197','250,239,186'],color:'#ffd59b',ink:'#261304',rgb:'255,213,155',bg:['#23142f','#080b23'],rock:'#ad91b5',boss:'차원문 수호자',bossObj:'차원문 수호자를'},
    {name:'루미별의 바다',pal:['120,226,239','120,165,255','162,246,221','255,175,217','224,249,255'],color:'#78e2ef',ink:'#05232b',rgb:'120,226,239',bg:['#092f45','#061322'],rock:'#75bdc3',boss:'심해의 파동',bossObj:'심해의 파동을'},
    {name:'수정의 숲',pal:['157,235,176','227,210,121','184,156,255','132,229,212','255,201,212'],color:'#9debb0',ink:'#0a2412',rgb:'157,235,176',bg:['#102d25','#08131d'],rock:'#79b59d',boss:'태고의 뿌리',bossObj:'태고의 뿌리를'},
    {name:'진화의 하늘',pal:['192,180,255','146,220,255','255,182,218','180,245,231','255,221,174'],color:'#c0b4ff',ink:'#1b1431',rgb:'192,180,255',bg:['#241d4e','#080e2a'],rock:'#a09ccf',boss:'폭풍의 날개',bossObj:'폭풍의 날개를'},
    {name:'생명의 별',pal:['255,210,135','255,157,193','143,231,233','194,247,175','238,185,255'],color:'#ffd287',ink:'#301809',rgb:'255,210,135',bg:['#321b36','#090a20'],rock:'#c4a2b7',boss:'생명의 심장',bossObj:'생명의 심장을'}
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
      ['결정 반응','시간 결정 피해 +0.8%',(s,l)=>{s.iceDamage*=1+.008*l}],
      ['따뜻한 핵','열 최대치 +0.1',(s,l)=>{s.maxHeat+=.1*l}],
      ['숨결 보관','식는 속도 -0.1%',(s,l)=>{s.decay*=Math.pow(.999,l)}]
    ],
    [
      ['생명 발화','모든 피해 +0.8%',(s,l)=>{s.dmg*=1+.008*l}],
      ['정밀 공명','치명타 확률 +0.1%p',(s,l)=>{s.crit+=.001*l}],
      ['광자 흡수','항성 피해 +1%',(s,l)=>{s.starDamage*=1+.01*l}],
      ['핵의 심장','치명타 배율 +0.012',(s,l)=>{s.critPower+=.012*l}],
      ['성운 진동','가스 피해 +1%',(s,l)=>{s.gasDamage*=1+.01*l}]
    ],
    [
      ['작은 발걸음','태우는 범위 +0.12',(s,l)=>{s.radius+=.12*l}],
      ['끌림의 감각','끌어당기는 힘 +0.018',(s,l)=>{s.pull+=.018*l}],
      ['넓은 눈','끌어당기는 거리 +0.6%',(s,l)=>{s.pullReach*=1+.006*l}],
      ['가장자리 감응','외곽 피해 +0.8%',(s,l)=>{s.edgeDamage*=1+.008*l}],
      ['유영 본능','혜성 속도 -0.3%p',(s,l)=>{s.cometSlow+=.003*l}]
    ],
    [
      ['영양 흡수','생명력 수확 +0.35%',(s,l)=>{s.life+=.0035*l}],
      ['별빛 광합성','빛 수확 +0.6%',(s,l)=>{s.light*=1+.006*l}],
      ['광물 순환','금속 수확 +0.6%',(s,l)=>{s.metal*=1+.006*l}],
      ['천체 유인','천체 등장 +0.5%',(s,l)=>{s.spawn*=1+.005*l}],
      ['생명의 저장','생명력 수확 +0.3%',(s,l)=>{s.life+=.003*l}]
    ],
    [
      ['세포 분화','보조 위성 피해 +0.5%',(s,l)=>{s.satDamage+=.005*l}],
      ['유전자 결합','연쇄 폭발 피해 +0.8%',(s,l)=>{s.chain*=1+.008*l}],
      ['진화의 돌기','운석 피해 +0.8%',(s,l)=>{s.rockDamage*=1+.008*l}],
      ['보호막 감각','외피 관통 +0.1%p',(s,l)=>{s.pierce+=.001*l}],
      ['생명 공명','위성 공격 범위 +0.08',(s,l)=>{s.satRadius+=.08*l}]
    ]
  ];
  function upgrades(){
    const result=[];
    for(let chapter=0;chapter<chapters.length;chapter++){
      for(let branch=0;branch<5;branch++){
        for(let index=0;index<40;index++){
          const [name,description,effect]=effects[branch][index%5];
          result.push({
            id:`life_${chapter}_${branch}_${index}`,r:chapter+5,b:branch,
            n:`${chapters[chapter].name} · ${name} ${Math.floor(index/5)+1}`,
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
    const chapter=Math.max(0,Math.min(4,stage-5)),colors=chapters[chapter].pal;
    ctx.save();ctx.lineCap='round';
    if(chapter===0){
      for(let i=0;i<7;i++){
        const r=Math.min(w,h)*(.11+i*.065);
        ctx.beginPath();ctx.ellipse(w*.5,h*.37,r,r*.7,-.33,-Math.PI*.78,Math.PI*.93);
        ctx.strokeStyle=`rgba(${colors[i%5]},${.24-i*.023})`;ctx.lineWidth=1+i*.28;ctx.stroke();
      }
    }else if(chapter===1){
      for(let i=0;i<13;i++){
        const y=h*(.15+i*.055),amp=8+i*2;
        ctx.beginPath();ctx.moveTo(-20,y);
        for(let x=-20;x<w+80;x+=80)ctx.quadraticCurveTo(x+40,y+amp*(i%2?1:-1),x+80,y);
        ctx.strokeStyle=`rgba(${colors[i%5]},${.08+i*.004})`;ctx.lineWidth=1.5+(i%3);ctx.stroke();
      }
    }else if(chapter===2){
      for(let i=0;i<42;i++){
        const x=random()*w,y=h*(.15+random()*.65),r=8+random()*26;
        ctx.beginPath();ctx.moveTo(x-r*.55,y+r*.6);ctx.lineTo(x-r*.3,y-r*.35);ctx.lineTo(x,y-r*(1.2+random()));ctx.lineTo(x+r*.4,y-r*.25);ctx.lineTo(x+r*.55,y+r*.6);ctx.closePath();
        ctx.fillStyle=`rgba(${colors[i%5]},${.045+random()*.065})`;ctx.fill();
        ctx.strokeStyle=`rgba(${colors[(i+1)%5]},.12)`;ctx.lineWidth=1;ctx.stroke();
      }
    }else if(chapter===3){
      for(let i=0;i<26;i++){
        const x=random()*w,y=h*(.1+random()*.7),r=18+random()*64;
        ctx.beginPath();ctx.ellipse(x,y,r,r*.3,-.25,0,Math.PI*2);
        ctx.fillStyle=`rgba(${colors[i%5]},${.03+random()*.06})`;ctx.fill();
      }
    }else{
      for(let i=0;i<46;i++){
        const x=random()*w,y=h*(.12+random()*.7),r=3+random()*10;
        ctx.strokeStyle=`rgba(${colors[i%5]},${.08+random()*.12})`;ctx.lineWidth=1;
        ctx.beginPath();for(let j=0;j<8;j++){
          const a=j*Math.PI/4,rr=j%2?r*.45:r;
          const px=x+Math.cos(a)*rr,py=y+Math.sin(a)*rr;
          j?ctx.lineTo(px,py):ctx.moveTo(px,py);
        }ctx.closePath();ctx.stroke();
      }
    }
    ctx.restore();
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
    const colors=chapters[chapter].pal,phase=time*.45;
    ctx.save();ctx.translate(b.x,b.y);ctx.rotate(Math.sin(phase)*.12);
    for(let i=0;i<8;i++){
      const a=i*Math.PI/4+phase,rr=b.r*(1.15+.12*Math.sin(time+i));
      ctx.strokeStyle=`rgba(${colors[i%5]},.65)`;ctx.lineWidth=4;
      ctx.beginPath();ctx.moveTo(Math.cos(a)*b.r*.7,Math.sin(a)*b.r*.7);ctx.lineTo(Math.cos(a)*rr,Math.sin(a)*rr);ctx.stroke();
    }
    const glow=ctx.createRadialGradient(-b.r*.25,-b.r*.3,4,0,0,b.r);
    glow.addColorStop(0,'#ffffff');glow.addColorStop(.35,chapters[chapter].color);glow.addColorStop(1,'#1b1c45');
    ctx.fillStyle=glow;ctx.beginPath();ctx.arc(0,0,b.r*.8,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#1e2340';for(const side of [-1,1]){ctx.beginPath();ctx.ellipse(side*b.r*.22,-b.r*.06,b.r*.09,b.r*.13,0,0,Math.PI*2);ctx.fill();}
    ctx.strokeStyle='#ffffff';ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,b.r*.19,b.r*.18,.1,Math.PI-.1);ctx.stroke();
    ctx.restore();
  }
  window.OjjudaSaetbyeolLife=Object.freeze({chapters,memories,transitions,journal,kinds,keys,choose,upgrades,drawWorld,drawMagic,drawCreature,drawBoss,
    portal:['은하 핵 너머에서 아주 작은 목소리가 들렸다.','그 목소리는 별의 이름도, 빛의 법칙도 알지 못했다.','다만 따뜻한 곳을 찾아 아주 천천히 움직이고 있었다.','나는 다시 한번 빛나기로 했다. 이번에는 무언가를 삼키기 위해서가 아니라 지켜 주기 위해서.','차원의 문 너머에서 첫 생명의 씨앗이 잠들어 있었다.'],
    portalReturned:['푸른 세계를 되돌려준 자리에는 작고 다정한 빛이 남아 있었다.','그 빛은 오래전 내가 놓아준 조각 하나를 품고 있었다.','돌려주었던 마음이 새로운 생명의 씨앗이 되어 돌아온 것이다.'],
    portalConsumed:['모든 빛을 삼켜 태어난 새 우주에는 아직 아무 이름도 없었다.','그 넓은 침묵의 한가운데에서, 작고 투명한 생명이 천천히 숨을 쉬었다.','커다란 힘의 끝에서 가장 여린 존재를 만난 것이다.'],
    finale:['아주 작은 세포가 생명의 별에 도착했다.','빛 하나를 품던 아이는 이제 수많은 빛을 나눌 줄 알게 되었다.','서로 다른 친구들이 자신만의 속도로 자라고, 넘어지면 쉬고, 다시 손을 잡았다.','우리가 키운 것은 가장 밝은 별 하나가 아니었다.','어두운 밤에도 서로의 길을 비춰 줄 수 있는, 오래도록 따뜻한 세상이었다.']
  });
})();
