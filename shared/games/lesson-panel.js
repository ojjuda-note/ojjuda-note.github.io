/* One practice board, shared by the arcade guide and the private party-room guide. */
(() => {
  'use strict';
  if (window.OjjudaLessonPanel) return;
  function el(tag, cls, text) {
    const node=document.createElement(tag);
    node.className=cls;
    if (text) node.textContent=text;
    if (tag==='button') node.type='button';
    return node;
  }
  function step(label, cue, prompt, tiles, path, success, hint, options={}) {
    return {label,cue,prompt,tiles:tiles.split(';'),path,success,hint,...options};
  }
  // Small game positions illustrate geometry; the controls below remain usable
  // by touch, keyboard and screen readers without interpreting the picture.
  function diagram(game, index, stage){
    const link='<rect x="49" y="26" width="42" height="32" rx="7"/><rect x="129" y="26" width="42" height="32" rx="7" class="ink"/><rect x="209" y="26" width="42" height="32" rx="7"/><path class="route" d="M70 30V12H230V30"/><g class="symbol"><text x="70" y="49">✿</text><text x="230" y="49">✿</text></g>';
    const region='<path class="land" d="M24 12H80V54H255V68H24Z"/><path class="closed" d="M80 26H180V54H80Z"/><path class="route" d="M80 26H180V54"/><circle cx="80" cy="26" r="5"/><circle cx="180" cy="54" r="4"/>';
    const race='<path class="road" d="M60 71L100 3H200L240 71Z"/><path class="lane" d="M108 71L134 3M193 71L168 3"/><rect class="block" x="143" y="13" width="14" height="19" rx="4"/><rect class="block" x="'+(index===2?183:107)+'" y="30" width="18" height="21" rx="4"/><rect class="driver" x="'+(index===2?185:144)+'" y="48" width="19" height="22" rx="5"/>';
    const jump='<path class="land" d="M12 60H119V72H12ZM185 '+(index===1?'36':'57')+'H287V72H185Z"/><circle cx="83" cy="50" r="7"/><path class="route" d="'+(index===2?'M85 45Q145 17 212 53':index===1?'M86 46Q112 10 140 27Q164 -2 208 27':'M86 46Q146 0 209 48')+'"/>';
    const paddle='<g class="brick"><rect x="65" y="10" width="45" height="11" rx="3"/><rect x="116" y="10" width="45" height="11" rx="3"/><rect x="167" y="10" width="45" height="11" rx="3"/></g><circle cx="172" cy="37" r="5"/><path class="route" d="M149 24L204 57"/><rect x="179" y="60" width="54" height="6" rx="3"/>';
    const map=stage.scene==='link'?link:game==='runner'?jump:game==='chacha_rush'&&index===0?race:game==='breakout'&&index===0?paddle:['ttang','photo_ttang'].includes(game)?region:null;
    if(!map)return null;
    const frame=el('div','lesson-diagram');
    frame.setAttribute('aria-hidden','true');
    frame.innerHTML='<svg viewBox="0 0 300 76" focusable="false">'+map+'</svg>';
    return frame;
  }
  function board(root, lesson, options) {
    let index=0;
    const stages=lesson.steps;
    const progress=stages.map(()=>({picked:[],done:false}));
    root.classList.add('lesson-view');
    root.dataset.theme=lesson.theme;
    const header=el('header','lesson-head');
    const art=el('img','lesson-cover');art.src=lesson.art;art.alt='';art.width=82;art.height=82;
    const identity=el('div','lesson-identity');
    const heading=el('h2','ap-title',lesson.name);heading.id='lesson-title';
    const goal=el('p','lesson-goal dp-guide-goal',lesson.goal);
    identity.append(heading,goal);header.append(art,identity);
    const steps=el('nav','lesson-steps');steps.setAttribute('aria-label','연습 단계');
    const body=el('section','lesson-body');
    const actions=el('footer','lesson-actions');
    const close=el('button','ap-skip',options.closeLabel || '건너뛰기');
    const next=el('button','ap-done');
    close.onclick=options.close;
    if (options.party) {
      close.dataset.drinkingClose='';
      close.dataset.drinkingPrimary='';
    }
    const tabs=stages.map((s,i)=>{
      const b=el('button','lesson-tab');
      const number=el('span','lesson-number',String(i+1));number.setAttribute('aria-hidden','true');
      b.append(number,el('span','',s.label));
      b.onclick=()=>go(i);steps.append(b);return b;
    });
    actions.append(close,next);
    root.append(header);
    if (lesson.caution) root.append(el('p','lesson-caution',lesson.caution));
    if(options.modeControl)root.append(options.modeControl);
    root.append(steps,body);
    if(options.settings)root.append(options.settings);
    root.append(actions);
    function go(i, focus=true) {
      index=i;
      const s=stages[i], record=progress[i];
      tabs.forEach((b,j)=>{
        if (i===j)b.setAttribute('aria-current','step');else b.removeAttribute('aria-current');
        b.dataset.done=String(progress[j].done);
        b.firstChild.textContent=progress[j].done?'✓':String(j+1);
        b.setAttribute('aria-label',(j+1)+'단계 '+stages[j].label+(progress[j].done?' 완료':''));
      });
      body.replaceChildren();
      const prompt=el('h3','lesson-prompt ap-prompt',s.prompt);prompt.tabIndex=-1;
      const surface=el('div','lesson-board');surface.dataset.layout=s.layout||lesson.layout||'pieces';
      const cue=el('p','lesson-cue',s.cue);
      const choices=el('div','ap-choices');
      if (s.columns) choices.style.setProperty('--columns',s.columns);
      const hint=el('button','lesson-hint','힌트 보기');hint.setAttribute('aria-expanded','false');
      const feedback=el('p','ap-feedback');feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');
      const retry=el('button','lesson-hint','다시 연습');retry.hidden=true;
      retry.onclick=()=>{progress[i]={picked:[],done:false};go(i);};
      const feedbackRow=el('div','lesson-response');feedbackRow.append(feedback,hint,retry);
      const report=(message,kind)=>{feedback.textContent=message;feedback.dataset.state=kind;};
      hint.onclick=()=>{const open=hint.getAttribute('aria-expanded')==='true';hint.setAttribute('aria-expanded',String(!open));hint.textContent=open?'힌트 보기':'힌트 접기';report(open?'':s.hint,open?'':'hint');};
      let moving,base;
      surface.append(cue);
      const drawing=diagram(lesson.id,index,s);if(drawing)surface.append(drawing);
      if (s.timing) {
        const track=el('div',s.narrow?'ap-track narrow':'ap-track');track.setAttribute('aria-hidden','true');
        moving=el('i','ap-moving');base=el('i','ap-base');track.append(moving,base);surface.append(track);
        if(record.done)moving.style.animationPlayState='paused';
      }
      if(s.reference){
        const ref=el('div','lesson-reference');
        ref.setAttribute('aria-label','비교할 그림 '+s.reference.join(' '));
        s.reference.forEach(word=>ref.append(el('span','',word)));surface.append(ref);
      }
      const buttons=s.tiles.map((tile,j)=>{
        const button=el('button','ap-tile');
        const [mark,label]=tile.includes('|')?tile.split('|'):[null,tile];
        if (mark){const icon=el('span','lesson-mark',mark);icon.setAttribute('aria-hidden','true');button.append(icon);}
        button.append(el('span','lesson-tile-label',label));
        if(s.hold===j){
          let since=null,held=false;
          button.oncontextmenu=e=>e.preventDefault();
          button.onpointerdown=()=>{since=performance.now();held=false;};
          button.onpointercancel=()=>{since=null;held=false;};
          button.onpointerup=()=>{held=since!==null && performance.now()-since>=350;since=null;};
          button.onclick=e=>{if(e.detail && !held){report('깃발을 꽂을 칸에 손을 조금 더 오래 대세요.','hint');return;}held=false;choose(j);};
        } else button.onclick=()=>choose(j);
        choices.append(button);return button;
      });
      function draw(){
        buttons.forEach((b,j)=>{
          b.disabled=record.done;
          b.setAttribute('aria-pressed',String(record.picked.includes(j)));
          if(record.done && s.move && lesson.layout==='board'){
            const mark=b.querySelector('.lesson-mark');
            if(j===s.path[0])mark.textContent='·';
            if(j===s.path[1])mark.textContent=s.tiles[s.path[0]].split('|')[0];
          }
          if(s.after && record.done && s.after[j]) b.querySelector('.lesson-tile-label').textContent=s.after[j];
        });
        next.textContent=i===stages.length-1?(options.finishLabel||'연습 마치기'):'다음 단계';
        next.disabled=!record.done;
        next.onclick=()=>{if(record.done){if(i===stages.length-1)options.finish();else go(i+1);}};
        hint.hidden=record.done;retry.hidden=!record.done;
        if(record.done){
          surface.dataset.complete='true';
          report(record.clockResult || s.success,'success');
          tabs[i].dataset.done='true';tabs[i].firstChild.textContent='✓';
          tabs[i].setAttribute('aria-label',(i+1)+'단계 '+s.label+' 완료');
        } else if(record.picked.length){report(s.follow || '이제 놓을 자리를 골라 보세요.','hint');}
      }
      function choose(j){
        if(record.done || index!==i)return;
        if(s.timing){
          const a=moving.getBoundingClientRect(), b=base.getBoundingClientRect();
          if(a.width && (a.right<=b.left || a.left>=b.right)){report(s.hint,'hint');return;}
          moving.style.animationPlayState='paused';
        }
        const ok=s.any?s.path.includes(j):s.pair?s.path.includes(j)&&!record.picked.includes(j):s.path[record.picked.length]===j;
        if(!ok){report(s.hint,'hint');return;}
        if(s.clock){
          if(!record.picked.length)record.start=performance.now();
          else {const seconds=(performance.now()-record.start)/1000;
            record.clockResult='내 기록 '+seconds.toFixed(2)+'초 · 목표 2초와 '+Math.abs(seconds-2).toFixed(2)+'초 차이예요.';}
        }
        record.picked.push(j);record.done=!!s.any || record.picked.length===s.path.length;draw();
        if(record.done)next.focus({preventScroll:true});
      }
      // Piece-and-destination exercises also accept a continuous touch or drag.
      if(s.move){
        let origin=null;
        choices.classList.add('lesson-drag');
        choices.addEventListener('pointerdown',e=>{
          const first=buttons.indexOf(e.target.closest('button'));
          if(first===s.path[0] && !record.done){origin={first,id:e.pointerId};}
        });
        choices.addEventListener('pointercancel',()=>{origin=null;});
        choices.addEventListener('pointerup',e=>{
          if(!origin || e.pointerId!==origin.id)return;
          const from=origin.first;origin=null;
          const target=document.elementFromPoint(e.clientX,e.clientY)?.closest('button');
          const to=buttons.indexOf(target);
          if(to<0 || to===from)return;
          if(!record.picked.length)choose(from);
          choose(to);
        });
      }
      surface.append(choices);body.append(prompt,surface,feedbackRow);
      if(s.rule){
        const more=el('details','lesson-rule');
        more.append(el('summary','','실전 규칙'),el('p','',s.rule));body.append(more);
      }
      draw();
      if(focus)prompt.focus({preventScroll:true});
    }
    go(0,false);
    // Load interactive practice only when a lesson is open. The three reference
    // chapters stay usable if the network drops or an older client lacks modules.
    const advancedBeforeLoad=()=>{referenceUsed=true;};
    let referenceUsed=false;
    body.addEventListener('click',advancedBeforeLoad,{once:true});
    steps.addEventListener('click',advancedBeforeLoad,{once:true});
    const catalog=options.party?'/games/drinking/rehearsals.mjs?v=20261127-firsthands1':'/shared/games/rounds/arcade.mjs?v=20261127-firsthands1';
    Promise.all([import('/shared/games/rounds/controls.mjs?v=20261127-firsthands1'),import(catalog)]).then(([controls,collection])=>{
      if(!header.isConnected||!collection.rounds[lesson.id])return;
      const switcher=el('nav','practice-views');switcher.setAttribute('aria-label','튜토리얼 보기');
      const play=el('button','','첫 판 연습'),reference=el('button','','동작별 도움말');
      switcher.append(play,reference);steps.before(switcher);
      const pane=el('section','round-pane');body.before(pane);pane.dataset.game=lesson.id;
      const finishRound=el('button','ap-done',options.finishLabel||'연습 마치기');
      finishRound.onclick=options.finish;actions.append(finishRound);
      const session=controls.mount(pane,collection.rounds[lesson.id],{local:!!options.local,onComplete:done=>{finishRound.disabled=!done;}});
      let playing=null;
      function switchTo(want,focus=false){
        if(playing===want)return;
        playing=want;root.dataset.practiceView=want?'round':'reference';
        play.setAttribute('aria-pressed',String(want));reference.setAttribute('aria-pressed',String(!want));
        pane.hidden=!want;steps.hidden=body.hidden=next.hidden=want;finishRound.hidden=!want;
        if(!want)session.pause();else session.resume();
        if(focus)(want?play:reference).focus({preventScroll:true});
      }
      play.onclick=()=>switchTo(true,true);reference.onclick=()=>switchTo(false,true);
      switchTo(!referenceUsed);
    }).catch(()=>{ /* The already-rendered chapter guide is the offline fallback. */ });
    return {heading,close,next};
  }
  window.OjjudaLessonPanel={el,step,board};
})();
