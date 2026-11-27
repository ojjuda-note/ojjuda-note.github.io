import {element,mount as boardSession} from './controls.mjs?v=20261127-coach1';

function control(board,action){
  if(action==null)return null;
  if(typeof action==='number')return board.querySelector('[data-cell="'+action+'"]');
  if(typeof action==='string')return [...board.querySelectorAll('button')].find(b=>(b.getAttribute('aria-label')||b.textContent)===action);
  if(action.field!==undefined)return board.querySelector('.round-input input');
  return [...board.querySelectorAll('input[type=range]')].find(b=>b.getAttribute('aria-label')===action.slider);
}
function perform(node,action){
  if(action.field!==undefined){node.value=action.field;node.form.requestSubmit();}
  else if(action.slider){node.value=action.value;node.dispatchEvent(new Event('input',{bubbles:true}));}
  else node.click();
}
function aligned(board){
  const moving=board.querySelector('.travelling'),base=[...board.querySelectorAll('.settled')].at(-1);
  if(!moving||!base)return true;
  const a=moving.getBoundingClientRect(),b=base.getBoundingClientRect();
  return Math.abs(a.left-b.left)<Math.max(1,b.width*.14);
}
export function mount(host,spec,{guide,local,onComplete}){
  const meta=element('div','coach-meta');
  const label=element('strong','coach-label');
  const progress=element('div','coach-progress');
  progress.setAttribute('aria-hidden','true');
  guide.chapters.forEach(()=>progress.append(element('i','')));
  meta.append(label,progress);
  const liveHost=element('div','coach-board'),demoHost=element('div','coach-board');
  const why=element('p','coach-why'),bar=element('div','coach-tools');
  const demoButton=element('button','coach-tool','시범 보기');
  const detail=element('button','coach-tool','원리 보기');
  const soloButton=element('button','coach-tool','혼자 해보기');
  const hint=element('button','coach-tool','힌트 보기');
  const pause=element('button','coach-tool','일시정지');
  const next=element('button','coach-tool','다음 동작');
  bar.append(demoButton,pause,next,soloButton,hint,detail);
  host.append(meta,liveHost,demoHost,why,bar);
  demoHost.hidden=why.hidden=true;

  let live,demo,solo=false,showHint=false,showWhy=false,watching=false,stopped=false,active=true;
  let timer=0,current=null,playerDone=false,demoDone=false;
  function clear(){clearTimeout(timer);timer=0;}
  function later(fn,ms){clear();timer=setTimeout(()=>{
    if(host.isConnected&&active&&watching&&!stopped)fn();
  },ms);}
  function advance(){
    if(!current?.node||!watching||demoDone)return;
    if(current.move.align&&!aligned(current.board)){later(advance,40);return;}
    perform(current.node,current.move.action);
  }
  function toolbar(){
    demoButton.textContent=watching?'직접 해보기':'시범 보기';
    hint.hidden=watching||!solo||playerDone;
    hint.textContent=showHint?'힌트 접기':'힌트 보기';hint.setAttribute('aria-pressed',String(showHint));
    pause.hidden=next.hidden=!watching||demoDone;pause.textContent=stopped?'계속 보기':'일시정지';
    soloButton.hidden=watching||!playerDone;
    soloButton.textContent=solo?'한 번 더 연습':'혼자 해보기';
    detail.hidden=(solo&&!watching&&!showHint)||(watching?demoDone:playerDone);
    detail.textContent=showWhy?'원리 접기':'원리 보기';detail.setAttribute('aria-expanded',String(showWhy&&!detail.hidden));
    why.hidden=detail.hidden||!showWhy;
    host.dataset.complete=String(playerDone&&!watching);
    onComplete(playerDone&&!watching);
  }
  function paint(state,board,prompt,time,isDemo){
    if(isDemo!==watching)return;
    const done=Boolean(state.done),guided=isDemo||!solo||showHint;
    const move=done?null:guide.read(state,local,time);
    const chapter=done?guide.chapters.length:move.chapter;
    const mode=isDemo?'시범':solo?'혼자 연습':'따라 하기';
    label.textContent=done?mode+' 완료':!guided?'혼자 연습':mode+' '+(chapter+1)+'/'+guide.chapters.length+' · '+guide.chapters[chapter];
    progress.hidden=!guided;
    [...progress.children].forEach((mark,i)=>{mark.dataset.at=i<chapter?'past':i===chapter?'now':'';});
    board.querySelectorAll('[data-coach-target]').forEach(b=>b.removeAttribute('data-coach-target'));
    if(guided&&move)for(const action of (!isDemo&&move.choices)||[move.action]){
      const b=control(board,action);if(b&&!b.disabled)b.dataset.coachTarget='';
    }
    const text=done?'':guided?move.copy:guide.solo;
    if(prompt.textContent!==text)prompt.textContent=text;
    prompt.hidden=done;why.textContent=move?.why||'';
    if(isDemo){
      demoDone=done;
      const node=move&&control(board,move.action);
      current=node?{node,move,board}:null;next.disabled=!current;
      // Leave the example visible before the simulator submits it.
      if(node&&move.action.field!==undefined)node.value=move.action.field;
      clear();if(active&&!stopped&&current)later(advance,move.delay??1150);
    }
    toolbar();
  }
  function openBoard(isDemo){
    const target=isDemo?demoHost:liveHost;
    target.replaceChildren();
    return boardSession(target,spec,{local,demo:isDemo,initial:!isDemo&&solo?{...spec.initial,...guide.practice}:spec.initial,
      onDraw:(state,b,p,time)=>paint(state,b,p,time,isDemo),
      onComplete:done=>{if(isDemo)demoDone=done;else playerDone=done;toolbar();}});
  }
  demoButton.onclick=()=>{
    clear();showWhy=false;
    if(watching){
      demo.pause();watching=false;current=null;demoHost.replaceChildren();demoHost.hidden=true;
      liveHost.hidden=false;live.resume();toolbar();
    }else{
      live.pause();liveHost.hidden=true;watching=true;stopped=demoDone=false;demoHost.hidden=false;
      demo=openBoard(true);demoHost.querySelector('.round-surface').inert=true;
      demoHost.querySelector('.round-restart').hidden=true;
    }
    demoButton.focus({preventScroll:true});
  };
  detail.onclick=()=>{showWhy=!showWhy;toolbar();};
  hint.onclick=()=>{showHint=!showHint;showWhy=false;live.refresh();};
  soloButton.onclick=()=>{
    live.pause();solo=true;playerDone=showHint=showWhy=false;live=openBoard(false);
    liveHost.querySelector('.round-cue').setAttribute('tabindex','-1');
    liveHost.querySelector('.round-cue').focus({preventScroll:true});
  };
  pause.onclick=()=>{stopped=!stopped;clear();if(stopped)demo.pause();else demo.resume();toolbar();};
  next.onclick=()=>{
    if(!watching||demoDone)return;
    // If paused, apply one real input with the board clock briefly resumed.
    clear();if(stopped)demo.resume();
    advance();if(stopped)demo.pause();
  };
  live=openBoard(false);
  return {pause(){active=false;clear();(watching?demo:live).pause();},
    resume(){active=true;if(watching){if(!stopped)demo.resume();}else live.resume();}};
}
