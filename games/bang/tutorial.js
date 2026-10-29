import {Game} from './engine.js';
import {makeDeck} from './data.js';

// A separate, deterministic practice table. Every card effect uses the real engine.
export class Tutorial {
 constructor(){
  this.game=new Game(null,()=>.42);
  this.game.create({count:4,role:'sheriff',character:'lucky'});
  const s=this.game.s;
  Object.assign(s,{deck:makeDeck(),discard:[],queue:[],pending:null,phase:'play',current:0,turn:1,bangs:0,logs:[],serial:0,visual:null,winner:null,store:null});
  const chars=['lucky','willy','bart','rose'],roles=['sheriff','outlaw','outlaw','renegade'];
  s.players.forEach((p,i)=>Object.assign(p,{char:chars[i],role:roles[i],hand:[],equipment:[],hp:i===0?5:4,maxHp:i===0?5:4,alive:true,suspicion:0}));
  const give=(id,type)=>{const index=s.deck.findIndex(c=>c.type===type);if(index<0)throw new Error(`Missing tutorial card: ${type}`);const card=s.deck.splice(index,1)[0];this.game.p(id).hand.push(card);return card.id;};
  this.cards={bang:give(0,'bang'),missed:give(0,'missed'),beer:give(0,'beer'),weapon:give(0,'schofield'),stage:give(0,'stagecoach'),cat:give(0,'cat'),secondBang:give(0,'bang')};
  this.enemyBangs=[give(1,'bang'),give(1,'bang')];give(1,'beer');give(1,'beer');
  for(const id of [2,3])this.game.draw(id,4);
  this.game.log('튜토리얼 · 정체와 카드가 미리 준비된 연습 테이블입니다.','system');
  this.step=0;this.selected=null;this.targeting=false;
 }
 get lesson(){return STEPS[this.step];}
 get done(){return this.step===STEPS.length-1;}
 expected(){const l=this.lesson;return {action:l.action,value:l.card?this.cards[l.card]:l.value};}
 accepts(action,value){const expected=this.expected();return action===expected.action&&(expected.value===undefined||Number(value)===expected.value);}
 focus(){const l=this.lesson,e=this.expected();if(l.focus)return l.focus;if(l.action==='tutorial-next')return null;return `[data-action="${e.action}"]${e.value===undefined?'':`[data-value="${e.value}"]`}`;}
 act(action,value){
  if(!this.accepts(action,value)||this.done)return false;
  const g=this.game;let ok=true;
  switch(this.step){
   case 1:case 6:case 12:case 15:case 18:this.selected=Number(value);break;
   case 2:case 19:this.targeting=true;break;
   case 3:case 20:
    ok=g.play(0,this.selected,Number(value));if(ok){g.choose('take');this.selected=null;this.targeting=false;}break;
   case 5:ok=g.endTurn(0);break;
   case 7:
    ok=g.discardCard(0,this.selected);this.selected=null;
    if(ok)ok=g.play(1,this.enemyBangs[0],0);break;
   case 8:ok=g.choose('card',Number(value));break;
   case 9:ok=g.play(1,this.enemyBangs[1],0);break;
   case 10:ok=g.choose('take');break;
   case 11:{
    // The remaining practice opponents pass. Real draw/discard rules still apply.
    let guard=0;
    while(g.s.current!==0&&guard++<30){
     const id=g.s.current;
     if(g.s.phase==='play')ok=g.endTurn(id);
     else if(g.s.phase==='discard')ok=g.discardCard(id,g.p(id).hand.at(-1).id);
     else throw new Error('Unexpected practice phase');
     if(!ok)break;
    }
    if(g.s.current!==0)throw new Error('Practice turn did not return to the player');break;
   }
   case 13:case 16:ok=g.play(0,this.selected);this.selected=null;break;
  }
  if(!ok)return false;
  this.step++;return true;
 }
}

export const CHAPTERS=['목표','공격','턴 종료','방어','회복','무기'];
export const STEPS=[
 {chapter:0,title:'당신은 마을을 지키는 보안관!',body:'무법자와 배신자를 모두 쓰러뜨리면 이겨요. 총알 모양 5개는 내 체력이에요. 연습에서는 상대의 정체를 미리 보여드릴게요.',action:'tutorial-next',button:'좋아요, 해볼게요',focus:'.player-strip',tip:'실전에서는 보안관만 정체를 공개해요.'},
 {chapter:1,title:'① 뱅! 카드를 눌러보세요',body:'화면에 보이는 카드가 내 손패예요. 뱅!은 상대의 체력을 1 줄이는 공격 카드예요.',action:'card',card:'bang',tip:'금색으로 빛나는 뱅! 카드를 누르세요.'},
 {chapter:1,title:'② 이제 공격할 상대를 정해요',body:'카드를 고르면 아래에 사용 버튼이 나타나요. 「상대 선택」을 눌러보세요.',action:'use',tip:'카드 선택 → 상대 선택 → 상대 누르기'},
 {chapter:1,title:'③ 윌리 더 키드를 누르세요',body:'윌리는 거리 1에 있어요. 기본 총의 사정거리도 1이라 공격할 수 있어요.',action:'player',value:1,tip:'윌리 더 키드의 테두리가 빛나고 있어요.'},
 {chapter:1,title:'명중! 상대의 체력이 줄었어요',body:'윌리의 체력이 4에서 3으로 줄었어요. 보통 뱅! 카드는 한 턴에 1번만 사용할 수 있어요.',action:'tutorial-next',button:'턴 마치는 법 배우기',focus:'[data-action="player"][data-value="1"]',tip:'윌리나 볼캐닉처럼 여러 번 쏘는 예외도 있어요.'},
 {chapter:2,title:'할 일을 마쳤다면 「턴 종료」',body:'카드를 전부 쓸 필요는 없어요. 이번에는 턴을 끝내고 상대의 차례로 넘겨볼게요.',action:'end',tip:'아래의 「턴 종료 →」 버튼을 누르세요.'},
 {chapter:2,title:'손패가 많으면 골라서 버려요',body:'손패는 6장, 내 체력은 5예요. 1장을 버려야 해요. 이번에는 캣 벌루를 골라보세요.',action:'card',card:'cat',tip:'턴이 끝날 때 손패는 현재 체력 수까지만!'},
 {chapter:2,title:'선택한 카드를 버리세요',body:'「선택한 카드 버리기」를 누르면 턴이 끝나요. 곧 윌리가 공격해 올 거예요.',action:'discard',tip:'버리는 카드는 효과가 발동하지 않아요.'},
 {chapter:3,title:'공격이 왔어요! 빗나감!으로 방어',body:'방어 창의 빗나감! 카드를 누르면 총격을 피할 수 있어요. 방어는 내 턴이 아니어도 할 수 있어요.',action:'respond',card:'missed',tip:'방어 창 안의 빗나감! 카드를 누르세요.'},
 {chapter:3,title:'잘 피했어요. 체력은 그대로!',body:'빗나감! 1장을 쓰고 체력 5를 지켰어요. 이번에는 방어 카드가 없을 때도 연습해 볼게요.',action:'tutorial-next',button:'다음 공격 연습',focus:'.my-health',tip:'윌리는 여러 번 뱅!을 쏠 수 있는 캐릭터예요.'},
 {chapter:3,title:'방어 카드가 없으면 체력 1 감소',body:'이번에는 빗나감!이 없어요. 「확인하고 생명 1 잃기」를 눌러 결과를 확인하세요.',action:'take',tip:'체력이 0이 되면 탈락하므로 방어 카드를 아껴두세요.'},
 {chapter:3,title:'체력이 5 → 4로 줄었어요',body:'상대의 공격을 막지 못하면 이렇게 체력이 줄어요. 다른 연습 상대는 쉬고, 내 다음 턴으로 갈게요.',action:'tutorial-next',button:'내 다음 턴으로',focus:'.my-health',tip:'새 턴이 오면 카드 2장은 자동으로 받아요.'},
 {chapter:4,title:'새 턴! 이번에는 맥주를 골라요',body:'카드 2장을 자동으로 받았어요. 이제 맥주를 마셔 잃어버린 체력을 회복해 볼게요.',action:'card',card:'beer',tip:'맥주는 내 체력을 1 회복해요.'},
 {chapter:4,title:'「카드 사용」으로 맥주 마시기',body:'맥주는 나에게 쓰는 카드예요. 상대를 고를 필요 없이 「카드 사용」을 누르면 돼요.',action:'use',tip:'상대에게 쓰는 카드와 나에게 쓰는 카드를 구분해요.'},
 {chapter:4,title:'체력이 4 → 5로 회복됐어요',body:'시작할 때의 최대 체력을 넘길 수는 없어요. 마지막 두 명만 남으면 맥주가 효과를 내지 않는 것도 기억하세요.',action:'tutorial-next',button:'무기 바꾸기 배우기',focus:'.my-health',tip:'내 차례에는 회복·장착 등 여러 카드를 쓸 수 있어요.'},
 {chapter:5,title:'더 멀리 쏘려면 총을 바꿔요',body:'위쪽 바트는 거리 2라 기본 총으로는 닿지 않아요. 스코필드 카드를 골라보세요.',action:'card',card:'weapon',tip:'스코필드의 사정거리는 2예요.'},
 {chapter:5,title:'스코필드를 장착하세요',body:'「카드 사용」을 누르면 총이 장착돼요. 무기는 손에서 없어져도 내 앞에 남아 계속 효과를 내요.',action:'use',tip:'내 캐릭터 옆에 장착한 무기가 표시돼요.'},
 {chapter:5,title:'사정거리 1 → 2!',body:'이제 거리 2인 바트까지 닿아요. 새 턴이므로 뱅!도 다시 한 번 쓸 수 있어요.',action:'tutorial-next',button:'멀리 있는 상대 공격하기',focus:'.my-equip',tip:'공격하려면 상대의 거리 ≤ 내 총의 사정거리'},
 {chapter:5,title:'남아 있는 뱅!을 고르세요',body:'조금 전과 같은 방법이에요. 뱅! 카드부터 누르세요.',action:'card',card:'secondBang',tip:'카드 선택 → 상대 선택 → 바트 누르기'},
 {chapter:5,title:'다시 「상대 선택」',body:'공격할 수 있는 상대가 빛나요. 이번에는 거리 2의 바트를 고를 거예요.',action:'use',tip:'무기를 바꾸면 공격 가능한 상대가 늘어나요.'},
 {chapter:5,title:'위쪽 바트 캐시디를 누르세요',body:'스코필드의 사정거리 안에 들어왔어요. 바트를 눌러 마지막 연습 공격을 해보세요.',action:'player',value:2,tip:'빛나는 바트 캐시디를 누르세요.'},
 {chapter:5,title:'이제 첫 판을 시작할 수 있어요!',body:'공격, 턴 종료, 카드 버리기, 방어, 회복, 무기 장착까지 직접 해봤어요.',action:'done',focus:'.player-strip',tip:'실전에서도 카드에 적힌 한국어 설명을 읽을 수 있어요.'}
];
