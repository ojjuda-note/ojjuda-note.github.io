export const ROLES = {
 sheriff: {name:'보안관',en:'SHERIFF',image:'sceriffo',goal:'무법자와 배신자를 모두 제거하세요.',color:'#d4b66c'},
 deputy: {name:'부관',en:'DEPUTY',image:'vice',goal:'보안관을 지키고 무법자와 배신자를 제거하세요.',color:'#8ebac6'},
 outlaw: {name:'무법자',en:'OUTLAW',image:'fuorilegge',goal:'보안관을 쓰러뜨리면 승리합니다.',color:'#d8947c'},
 renegade: {name:'배신자',en:'RENEGADE',image:'rinnegato',goal:'다른 모두를 제거하고 보안관과의 마지막 결투에서 승리하세요.',color:'#b8a0c4'}
};
export const CARDS = {
 bang:{name:'뱅!',en:'BANG!',image:'bang',kind:'action',target:true,desc:'사정거리 안의 한 명을 공격합니다. 한 턴에 한 번 사용할 수 있습니다.'},
 missed:{name:'빗나감!',en:'MISSED!',image:'mancato',kind:'response',desc:'나를 향한 총격을 피합니다. 공격받았을 때 사용하세요.'},
 beer:{name:'맥주',en:'BEER',image:'birra',kind:'action',desc:'생명을 1 회복합니다. 두 명만 남았을 때는 사용할 수 없습니다.'},
 cat:{name:'캣 벌루',en:'CAT BALOU',image:'catbalou',kind:'action',target:true,desc:'거리와 관계없이 한 명의 손패 1장 또는 원하는 장착 카드 1장을 버립니다.'},
 panic:{name:'강탈!',en:'PANIC!',image:'panico',kind:'action',target:true,desc:'거리 1의 상대에게서 손패 1장 또는 원하는 장착 카드 1장을 가져옵니다.'},
 duel:{name:'결투',en:'DUEL',image:'duello',kind:'action',target:true,desc:'상대부터 번갈아 뱅!을 냅니다. 먼저 포기한 쪽이 생명 1을 잃습니다.'},
 indians:{name:'인디언!',en:'INDIANS!',image:'indiani',kind:'action',desc:'모든 상대는 뱅! 1장을 버리거나 생명 1을 잃습니다.'},
 gatling:{name:'개틀링',en:'GATLING',image:'gatling',kind:'action',desc:'거리와 관계없이 모든 상대를 한 번씩 공격합니다.'},
 store:{name:'잡화점',en:'GENERAL STORE',image:'emporio',kind:'action',desc:'생존자 수만큼 공개한 카드에서, 나부터 차례대로 한 장씩 가져갑니다.'},
 saloon:{name:'주점',en:'SALOON',image:'saloon',kind:'action',desc:'살아 있는 모든 사람이 생명 1을 회복합니다.'},
 stagecoach:{name:'역마차',en:'STAGECOACH',image:'diligenza',kind:'action',desc:'카드 2장을 더 가져옵니다.'},
 wells:{name:'웰스 파고',en:'WELLS FARGO',image:'wellsfargo',kind:'action',desc:'카드 3장을 더 가져옵니다.'},
 barrel:{name:'술통',en:'BARREL',image:'barile',kind:'equipment',desc:'총격마다 판정합니다. 하트가 나오면 빗나감! 한 장의 효과를 얻습니다.'},
 mustang:{name:'야생마',en:'MUSTANG',image:'mustang',kind:'equipment',desc:'다른 사람이 나를 보는 거리가 1 늘어납니다.'},
 scope:{name:'조준경',en:'SCOPE',image:'mirino',kind:'equipment',desc:'내가 다른 사람을 보는 거리가 1 줄어듭니다. 최소 거리는 1입니다.'},
 jail:{name:'감옥',en:'JAIL',image:'prigione',kind:'equipment',target:true,desc:'상대의 다음 턴에 하트가 나오지 않으면 턴을 건너뜁니다. 보안관에게는 사용할 수 없습니다.'},
 dynamite:{name:'다이너마이트',en:'DYNAMITE',image:'dinamite',kind:'equipment',desc:'내 앞에 놓습니다. 턴 시작에 스페이드 2~9가 나오면 생명 3을 잃고, 아니면 다음 사람에게 넘깁니다.'},
 volcanic:{name:'볼캐닉',en:'VOLCANIC',image:'volcanic',kind:'weapon',range:1,desc:'사정거리 1. 내 턴에 뱅!을 여러 번 사용할 수 있습니다.'},
 schofield:{name:'스코필드',en:'SCHOFIELD',image:'schofield',kind:'weapon',range:2,desc:'총의 사정거리가 2가 됩니다.'},
 remington:{name:'레밍턴',en:'REMINGTON',image:'remington',kind:'weapon',range:3,desc:'총의 사정거리가 3이 됩니다.'},
 carabine:{name:'리볼버 카빈',en:'REV. CARABINE',image:'carabine',kind:'weapon',range:4,desc:'총의 사정거리가 4가 됩니다.'},
 winchester:{name:'윈체스터',en:'WINCHESTER',image:'winchester',kind:'weapon',range:5,desc:'총의 사정거리가 5가 됩니다.'}
};
export const CHARACTERS = [
 {id:'bart',name:'바트 캐시디',en:'Bart Cassidy',image:'bartcassidy',hp:4,ability:'생명을 잃을 때마다 카드 1장을 가져옵니다.'},
 {id:'blackjack',name:'블랙 잭',en:'Black Jack',image:'blackjack',hp:4,ability:'턴 시작에 두 번째 카드가 하트나 다이아면 한 장 더 가져옵니다.'},
 {id:'janet',name:'칼라미티 자넷',en:'Calamity Janet',image:'calamityjanet',hp:4,ability:'뱅!과 빗나감!을 서로 바꾸어 사용할 수 있습니다.'},
 {id:'gringo',name:'엘 그링고',en:'El Gringo',image:'elgringo',hp:3,ability:'상대 때문에 생명을 잃으면 상대 손패에서 무작위 카드를 가져옵니다.'},
 {id:'jesse',name:'제시 존스',en:'Jesse Jones',image:'jessejones',hp:4,ability:'턴 시작의 첫 카드를 다른 사람의 손패에서 가져올 수 있습니다.'},
 {id:'jourdonnais',name:'주르도네',en:'Jourdonnais',image:'jourdonnais',hp:4,ability:'항상 술통 능력을 지닙니다. 술통을 장착하면 두 번 판정합니다.'},
 {id:'kit',name:'키트 칼슨',en:'Kit Carlson',image:'kitcarlson',hp:4,ability:'턴 시작에 카드 3장을 보고 2장을 골라 가져옵니다.'},
 {id:'lucky',name:'럭키 듀크',en:'Lucky Duke',image:'luckyduke',hp:4,ability:'판정 카드를 2장 공개하고 유리한 결과를 적용합니다.'},
 {id:'paul',name:'폴 리그레트',en:'Paul Regret',image:'paulregret',hp:3,ability:'다른 사람이 나를 보는 거리가 항상 1 늘어납니다.'},
 {id:'pedro',name:'페드로 라미레즈',en:'Pedro Ramirez',image:'pedroramirez',hp:4,ability:'턴 시작의 첫 카드로 버린 더미의 맨 위 카드를 가져올 수 있습니다.'},
 {id:'rose',name:'로즈 둘란',en:'Rose Doolan',image:'rosedoolan',hp:4,ability:'내가 다른 사람을 보는 거리가 항상 1 줄어듭니다.'},
 {id:'sid',name:'시드 케첨',en:'Sid Ketchum',image:'sidketchum',hp:4,ability:'언제든 손패 2장을 버려 생명 1을 회복할 수 있습니다.'},
 {id:'slab',name:'슬랩 더 킬러',en:'Slab the Killer',image:'slab',hp:4,ability:'내가 낸 뱅!을 막으려면 빗나감! 효과가 2번 필요합니다.'},
 {id:'suzy',name:'수지 라파예트',en:'Suzy Lafayette',image:'suzylafayette',hp:4,ability:'손패가 없어지면 카드 1장을 가져옵니다. 결투 중에는 결투가 끝난 뒤 적용됩니다.'},
 {id:'vulture',name:'벌처 샘',en:'Vulture Sam',image:'vulturesam',hp:4,ability:'누군가 탈락하면 그 사람의 손패와 장착 카드를 모두 가져옵니다.'},
 {id:'willy',name:'윌리 더 키드',en:'Willy the Kid',image:'willythekid',hp:4,ability:'내 턴에 뱅!을 여러 번 사용할 수 있습니다.'}
];
export const art = image => `assets/01_${image}.png`;
export const suitSymbol = {S:'♠',H:'♥',D:'♦',C:'♣'};
export const rankName = n => ({11:'J',12:'Q',13:'K',14:'A'}[n]||String(n));
export function makeDeck(){
 let id=1; const deck=[];
 const add=(type,suit,ranks)=>ranks.forEach(rank=>deck.push({id:id++,type,suit,rank}));
 const seq=(a,b)=>Array.from({length:b-a+1},(_,i)=>a+i);
 add('barrel','S',[12,13]); add('dynamite','H',[2]); add('jail','S',[11,10]);add('jail','H',[4]);
 add('mustang','H',[8,9]);add('remington','C',[13]);add('carabine','C',[14]);
 add('schofield','C',[11,12]);add('schofield','S',[13]);add('scope','S',[14]);
 add('volcanic','S',[10]);add('volcanic','C',[10]);add('winchester','S',[8]);
 add('bang','S',[14]);add('bang','D',seq(2,14));add('bang','C',seq(2,9));add('bang','H',seq(12,14));
 add('beer','H',seq(6,11));add('cat','H',[13]);add('cat','D',[9,10,11]);
 add('duel','D',[12]);add('duel','S',[11]);add('duel','C',[8]);add('gatling','H',[10]);
 add('store','C',[9]);add('store','S',[12]);add('indians','D',[13,14]);
 add('missed','C',seq(10,14));add('missed','S',seq(2,8));
 add('panic','H',[11,12,14]);add('panic','D',[8]);add('saloon','H',[5]);
 add('stagecoach','S',[9,9]);add('wells','H',[3]); return deck;
}
