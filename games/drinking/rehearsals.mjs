import {round,tile,gap,element} from '../../shared/games/rounds/controls.mjs?v=20261127-coach1';
const names=['나','민지','준호'];
function players(u,items,pick,selected=-1){
  u.grid(items.length,items.map((v,i)=>tile(v,v,'seat',i===selected)),pick,'seats');
}
const croc=round('이빨을 누르고 다음 차례로',{pressed:[],turn:0},(u,s)=>{
  u.cue(s.turn===0?'윗니와 아랫니 가운데 하나를 골라 누르세요.':u.local?'무사히 넘겼어요. 다음 사람 역할로 남은 이빨을 하나 누르세요.':'다음 참가자의 연습 차례예요. 아직 올라온 이빨을 눌러 보세요.');
  u.display(s.done?'입이 닫혔어요':names[s.turn]+' 차례','legend');
  u.grid(4,Array.from({length:8},(_,i)=>s.pressed.includes(i)?gap():tile('▾',(i<4?'윗니 ':'아랫니 ')+(i%4+1),'tooth')),i=>{
    const pressed=[...s.pressed,i];
    if(s.turn)return u.finish('연습 두 번째 차례에 입이 닫혔어요. 실제 판에서는 아픈 이빨의 위치가 달라져요.',{pressed});
    u.change({pressed,turn:1},'이빨 한 개가 내려갔어요.');
  },'jaw'+(s.done?' closed':''));
});
const bottle=round('병 입구가 가리키는 자리 찾기',{phase:0,seat:0,angle:0},(u,s)=>{
  u.cue(['테이블에서 내 자리를 먼저 누르세요. 다른 두 사람의 자리는 정해져 있어요.','모두 앉았어요. '+(u.local?'병을 돌리세요.':'방장 역할로 병을 돌리세요.'),'원하는 순간에 멈추세요. 병의 입구가 향한 자리가 당첨이에요.','병이 멈춘 쪽의 자리를 누르세요.'][s.phase]);
  const table=element('div','round-compass');u.board.append(table);
  const needle=element('div','bottle-needle');table.append(needle);needle.style.transform='rotate('+s.angle+'deg)';
  if(s.phase===2&&!u.reduced())needle.classList.add('spin');
  const seats=['위쪽 자리','오른쪽 아래 자리','왼쪽 아래 자리'];
  const where=[[50,15],[82,75],[18,75]];
  seats.forEach((label,i)=>{const b=element('button','bottle-seat',s.phase&&i===s.seat?'나':String(i+1));b.setAttribute('aria-label',label);b.style.left=where[i][0]+'%';b.style.top=where[i][1]+'%';b.disabled=!!s.done||s.phase===1||s.phase===2;table.append(b);
    b.onclick=()=>{if(!s.phase)u.change({phase:1,seat:i});else if(i===s.target)u.finish(label+'가 당첨이에요. 병 밑면보다 좁은 입구를 보세요.');else u.say('병의 좁은 입구를 따라가 보세요.');};});
  if(s.phase===1)u.buttons([['술병 돌리기',()=>u.change({phase:2,start:u.now()})]]);
  if(s.phase===2)u.buttons([['멈추기',()=>{const target=Math.floor((u.now()-s.start)/320)%3;u.change({phase:3,target,angle:target*120});}]]);
});
const bomb=round('주제를 이어 말하고 넘기기',{phase:0,said:[]},(u,s)=>{
  const topics=['과일','동물'];u.cue(!s.phase?'이번 판에서 돌아가며 말할 주제를 고르세요.':'주제는 '+s.topic+'예요. 앞사람이 말하지 않은 '+s.topic+' 이름을 하나 적어 넘기세요.');
  if(!s.phase){players(u,topics,i=>u.change({phase:1,topic:topics[i]}));return;}
  u.display(names[(s.phase-1)%3]+' 차례 · '+(s.said.join(' → ')||'첫 번째 답'),'relay');
  if(!s.done)u.field('새 답',raw=>{
    const value=raw.trim().replace(/\s+/g,' ');if(!value)return;
    if(s.said.includes(value))return u.say('이미 나온 답이에요. 다른 이름으로 이어 보세요.');
    const said=[...s.said,value];if(said.length===2)return u.finish(said.join(' → ')+' 순서로 넘겼어요. 실제 판에서는 소리 내어 말하고 다음 사람 버튼을 눌러요.',{said,phase:3});
    u.change({said,phase:2},'다음 참가자 차례예요.');
  });
});
const stopwatch=round('숫자가 사라져도 박자 세기',{phase:0,goal:3},(u,s)=>{
  u.cue(s.phase===0?'목표를 정하고 시작하세요. 1초 뒤 숫자가 가려져요.':s.phase===1?'속으로 목표 시간까지 세고 멈추세요.':'내 기록과 목표의 차이를 확인하세요.');
  if(!s.phase)u.range('목표 초',s.goal,2,7,v=>s.goal=v);
  const clock=u.display(s.phase===2?s.result.toFixed(2):s.phase===1?'0.00':s.goal+'.00','digital');
  if(s.phase===1){const elapsed=u.now()-s.start;
    if(elapsed>=1000)clock.textContent='••.••';
    else {const update=()=>{const ms=u.now()-s.start;clock.textContent=ms>=1000?'••.••':(ms/1000).toFixed(2);if(ms<1000)u.later(70,update);};update();}
  }
  if(s.phase===0)u.buttons([['시작',()=>u.change({phase:1,start:u.now()})]]);
  if(s.phase===1)u.buttons([['멈추기',()=>{const result=(u.now()-s.start)/1000;u.finish('기록 '+result.toFixed(2)+'초 · 목표 '+s.goal+'초와 '+Math.abs(result-s.goal).toFixed(2)+'초 차이예요.',{phase:2,result});}]]);
});
const liar=round('제시어를 감추고 라이어 찾기',{phase:0},(u,s)=>{
  u.cue(['나만 볼 수 있게 카드를 여세요.','제시어를 기억한 뒤 카드를 가리세요.','정답과 초성을 쓰지 않고 특징을 한 가지 적어 보세요.','두 사람의 힌트를 보고 같은 제시어를 모르는 사람에게 투표하세요.'][s.phase]);
  if(s.phase<=1){u.display(s.phase?'바다':'?','secret-card');u.buttons([[s.phase?'카드 가리기':'내 카드 보기',()=>u.change({phase:s.phase+1})]]);return;}
  if(s.phase===2){u.field('내 힌트',v=>v.includes('바다')||v.includes('ㅂㄷ')?u.say('제시어와 초성은 감추고 특징만 적어 보세요.'):u.change({phase:3,hint:v}));return;}
  u.display('나 · '+s.hint+'\n민지 · 파도가 철썩거려요\n준호 · 새하얀 눈이 쌓여요','voices');
  players(u,['민지','준호'],i=>i===1?u.finish('준호의 카드는 라이어였어요. 혼자 다른 장소를 떠올릴 만한 힌트를 냈어요.'):u.say('민지의 파도는 바다에 어울려요. 두 힌트를 다시 읽으세요.'));
});
const king=round('왕의 번호 지목과 동의',{phase:0,pair:[]},(u,s)=>{
  u.cue(['내 역할 카드를 열어 보세요.','이번에는 왕이에요. 두 번호를 골라 함께 할 미션을 정하세요.','미션은 “서로 손 흔들기”예요. 명령을 전달하세요.','첫 참가자가 동의했어요. 두 번째 참가자 역할로 결정하세요.'][s.phase]);
  if(!s.phase){u.display('♛','secret-card');u.buttons([['역할 확인',()=>u.change({phase:1})]]);}
  else if(s.phase===1){u.grid(3,[1,2,3].map(n=>tile('№ '+n,n+'번','number-card',s.pair.includes(n))),i=>{const n=i+1,pair=s.pair.includes(n)?s.pair.filter(v=>v!==n):[...s.pair,n];u.change({pair,phase:pair.length===2?2:1});});}
  else{u.display(s.pair.join('번 · ')+'번\n서로 손 흔들기','mission-card');
    if(s.phase===2)u.buttons([['명령 내리기',()=>u.change({phase:3})]]);
    else u.buttons([['동의',()=>u.finish('두 사람 모두 동의해서 미션이 시작돼요.')],['패스',()=>u.finish('한 사람이 패스해서 미션을 넘겼어요. 벌칙은 없어요.')]]);
  }
});
const truth=round('내가 고른 질문 한 장',{phase:0,level:''},(u,s)=>{
  u.cue(['함께 답하기 편한 수위를 고르세요.','뒤집힌 카드 하나를 골라 질문을 확인하세요.','질문에 답하거나 패스로 차례를 넘기세요.'][s.phase]);
  if(!s.phase){players(u,['순한맛','반반 섞기'],i=>u.change({phase:1,level:i?'반반 섞기':'순한맛'}));return;}
  if(s.phase===1){u.grid(3,[1,2,3].map(n=>tile('✧',n+'번 질문 카드','back')),i=>u.change({phase:2,index:i}),'hand');return;}
  const qs=s.level==='순한맛'?['오늘 가장 웃었던 일은?','요즘 자주 듣는 노래는?','가고 싶은 여행지는?']:['요즘 가장 용기가 필요했던 일은?','칭찬받고 싶은 점은?','최근 새로 해 본 일은?'];
  u.display(qs[s.index],'question-card');u.buttons([['답했어요',()=>u.finish('답을 마쳤어요. 다음 사람이 질문 카드를 골라요.')],['패스',()=>u.finish('질문을 넘겼어요. 다음 사람 차례예요.')]]);
});
const initial=round('ㅅㄱ로 새 단어 이어 가기',{phase:0},(u,s)=>{
  const initialOf=c=>{const n=c.charCodeAt(0)-0xac00;return n<0||n>=11172?'':'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'[Math.floor(n/588)];};
  u.cue(s.phase===0?'앞사람은 “사과”를 말했어요. 시작을 누르고 5초 안에 ㅅㄱ로 시작하는 다른 두 글자 단어를 적으세요.':'연습판은 두 글자의 초성과 앞선 답의 중복을 확인해요.');
  u.display('ㅅ  ㄱ','digital');
  if(!s.phase){u.buttons([['5초 시작',()=>u.change({phase:1,until:u.now()+5000})]]);return;}
  if(s.done)return;
  u.later(s.until-u.now(),()=>u.change({phase:0},'5초가 지났어요. 수건, 시계 같은 단어로 다시 해 보세요.'));
  const f=u.field('두 글자 단어',v=>{
    if(u.now()>s.until)return u.change({phase:0},'시간이 끝났어요. 다시 시작하세요.');
    if(v==='사과')return u.say('사과는 이미 나왔어요. 다른 단어를 떠올리세요.');
    if([...v].map(initialOf).join('')!=='ㅅㄱ'||[...v].length!==2)return u.say('첫 글자는 ㅅ, 두 번째 글자는 ㄱ이어야 해요.');
    u.finish(v+' · 초성이 맞고 앞사람의 답과 달라요. 실전에서는 말한 뒤 “말했어요”를 눌러요.');
  });if(!u.demo&&s.phase===1&&!s.done)f.focus({preventScroll:true});
});
const minority=round('내 한 표로 달라지는 결과',{vote:null},(u,s)=>{
  u.cue(s.vote===null?'나머지 두 사람은 각자 다른 쪽에 투표했어요. 내가 좋아하는 쪽에 비밀 투표하세요.':'내 표까지 합친 뒤 더 적게 선택된 쪽이 소수파예요.');
  if(s.vote===null){players(u,['바다','산'],i=>u.change({vote:i},'내 표도 집계됐어요.'));return;}
  u.meter('바다',1+Number(s.vote===0),3);u.meter('산',1+Number(s.vote===1),3);
  u.buttons(['바다','산'].map((name,i)=>{
    const count=1+Number(s.vote===i);
    return [name+' '+count+'표',()=>count===1?u.finish(name+' 쪽이 한 표로 소수파예요. 내 표까지 합친 결과예요.'):u.say('두 표는 다수예요. 한 표를 받은 쪽을 찾아요.')];
  }));
});
const mission=round('서로 다른 몸짓 찾아내기',{phase:0},(u,s)=>{
  u.cue(['내 제시어를 혼자 확인하세요.','단어를 기억하고 가리세요.','말과 소품 없이 고양이 수염을 손으로 표현해 보세요.','민지와 준호의 몸짓을 보고 다른 단어를 받은 사람을 고르세요.'][s.phase]);
  if(s.phase<2){u.display(s.phase?'고양이':'?','secret-card');u.buttons([[s.phase?'가리기':'제시어 보기',()=>u.change({phase:s.phase+1})]]);return;}
  if(s.phase===2){u.buttons([['몸짓을 했어요',()=>u.change({phase:3})]]);return;}
  u.display('민지 · 손을 얼굴 옆에 대고 수염을 흉내 내요.\n준호 · 팔로 길게 코를 만들어요.','voices');
  players(u,['민지','준호'],i=>i===1?u.finish('준호의 제시어는 코끼리였어요. 민지는 나와 같은 고양이였어요.'):u.say('민지의 수염은 내 제시어와 같아요. 긴 코를 흉내 낸 사람을 보세요.'));
});
const fingers=round('내 손에 조건 두 번 표시하기',{fold:0,turn:0},(u,s)=>{
  u.cue(s.turn===0?'첫 조건은 “오늘 아침을 먹은 사람”. 먹었다고 가정하고 손가락 하나를 접으세요.':'다음 조건은 “빨간 양말을 신은 사람”. 오늘은 파란 양말이에요. 내 손을 어떻게 표시할까요?');
  u.grid(5,Array.from({length:5},(_,i)=>tile(i<s.fold?'○':'☝',(i+1)+'번째 손가락',i<s.fold?'folded':'finger')),()=>{
    if(s.turn)return u.say('파란 양말은 조건에 해당하지 않아요. 손을 그대로 두세요.');
    u.change({fold:1,turn:1},'다섯 개에서 네 개가 남았어요.');
  },'fingers');u.buttons([['그대로 두기',()=>s.turn?u.finish('조건에 해당할 때만 하나씩 접어요. 내 손가락은 네 개가 남았어요.'):u.say('첫 조건에는 해당하니 손가락을 하나 눌러 접으세요.')]]);
});
const imagevote=round('질문을 골라 한 사람에게 투표',{phase:0},(u,s)=>{
  const qs=['여행 계획을 잘 짤 사람','사진을 잘 찍을 사람'];u.cue(!s.phase?'이번 투표에 쓸 질문을 한 장 고르세요.':'세 명이 참여했어요. 질문에 어울리는 친구 한 명을 몰래 고르세요.');
  if(!s.phase){players(u,qs,i=>u.change({phase:1,question:qs[i]}));return;}
  u.display(s.question,'question-card');
  if(s.done){u.meter('민지',1+Number(s.vote===1),3);u.meter('준호',1+Number(s.vote===2),3);return;}
  players(u,names,i=>i===0?u.say('셋 이상이 참여했을 때는 나를 제외한 친구를 골라요.'):u.finish('연습 친구들의 표와 합쳐 '+names[i]+'가 두 표로 1위예요.',{vote:i}));
});
const updown=round('범위 안에서 숨은 수 찾기',{lo:1,hi:100,answer:59,history:[]},(u,s)=>{
  u.cue('1~100 연습판이에요. 수를 직접 입력하고 UP과 DOWN을 보며 범위를 좁히세요.');
  u.display(s.lo+' — '+s.hi,'digital');if(s.history.length)u.display(s.history.join('  ·  '),'legend');
  if(!s.done)u.field('다음 수',v=>{const n=Number(v);
    if(!Number.isInteger(n)||n<s.lo||n>s.hi)return u.say('표시된 범위 안의 정수를 입력하세요.');
    if(n===s.answer)return u.finish('숨은 수는 '+n+'! '+(s.history.length+1)+'번 만에 맞혔어요.',{lo:n,hi:n});
    const up=n<s.answer,t=up?'UP':'DOWN';u.change({lo:up?n+1:s.lo,hi:up?s.hi:n-1,history:[...s.history,n+' '+t]},t+'! 다음 수는 '+(up?'더 커야':'더 작아야')+' 해요.');
  },{type:'number',min:s.lo,max:s.hi});
});
const secretcount=round('내 버튼을 누르고 차례 넘기기',{phase:0,secret:4,total:0,turn:0,taps:0},(u,s)=>{
  u.cue(!s.phase?'연습 비밀 수를 정한 뒤 뚜껑을 닫으세요.':'한 차례에 한 번부터 세 번까지 눌러요. 한 번 이상 누르면 차례를 넘길 수 있어요.');
  if(!s.phase){u.range('비밀 수',s.secret,2,6,v=>s.secret=v);u.buttons([['설정 닫기',()=>u.change({phase:1})]]);return;}
  u.display(names[s.turn]+' 차례 · 이번 차례 '+s.taps+' / 3','digital');
  u.buttons([['누르기',()=>{const total=s.total+1,taps=s.taps+1;if(total===s.secret)return u.finish('비밀 수 '+s.secret+'에 닿았어요. 버튼을 누른 '+names[s.turn]+' 차례에서 끝났어요.',{total,taps});u.change({total,taps});},s.taps>=3],['턴 넘기기',()=>u.change({turn:(s.turn+1)%3,taps:0},'다음 참가자 차례예요.'),s.taps===0]]);
});
const partyroulette=round('화면 속 참가자와 차례 확인하기',{phase:0,seat:null},(u,s)=>{
  u.cue(u.local?['현재 표시된 참가자의 결과 카드를 여세요.','통과가 나왔어요. 연습폰을 다음 사람에게 넘기세요.','다음 참가자의 결과를 확인하세요.'][s.phase]:['연습 참가자 번호 하나를 고르세요.','내 선택을 확정하면 다른 참가자의 입력을 기다려요.','참가자 전원이 준비했어요. 같은 결과 카드를 여세요.'][s.phase]);
  if(!u.local&&s.phase===0){players(u,['2번 민지','3번 준호'],i=>u.change({seat:i+1,phase:1}));return;}
  u.display(s.done?'민지 · 당첨':u.local?(s.phase===1?'나 · 통과':s.phase?'민지 차례':'내 차례'):(s.phase===1?names[s.seat]+' 선택':'모두 준비'),'result-card');
  if(s.phase<2)u.buttons([[u.local?(s.phase?'다음 사람에게':'결과 열기'):'준비 완료',()=>u.change({phase:s.phase+1})]]);
  else u.buttons([['결과 확인',()=>u.finish('예시 결과 카드에는 민지가 표시됐어요. 실제 판의 결과는 매번 달라져요.')]]);
});
const shapematch=round('녹색 동그라미에만 반응하기',{phase:0},(u,s)=>{
  u.cue('초록 삼각형은 기다리고, 초록 동그라미가 보일 때 누르세요.');
  if(!s.phase){u.buttons([['연습 시작',()=>u.change({phase:1,since:u.now()})]]);return;}
  const signal=element('button','round-signal',s.phase===1?'▲':'●');signal.dataset.form=s.phase;signal.setAttribute('aria-label',s.phase===1?'초록 삼각형':'초록 동그라미');signal.disabled=!!s.done;u.board.append(signal);
  if(s.phase===1)u.later(1000-(u.now()-s.since),()=>u.change({phase:2,since:u.now()}));
  signal.onclick=()=>{if(s.phase===1){u.say('삼각형이에요. 손을 떼고 동그라미를 기다리세요.');return;}const ms=(u.now()-s.since)/1000;u.finish('녹색 동그라미가 나타난 뒤 '+ms.toFixed(2)+'초 만에 눌렀어요.');};
});
export const rounds={croc,bottle,bomb,stopwatch,liar,king,truth,initial,minority,mission,fingers,imagevote,updown,secretcount,partyroulette,shapematch};
export {coaches} from './practice-coaches.mjs?v=20261127-coach1';
