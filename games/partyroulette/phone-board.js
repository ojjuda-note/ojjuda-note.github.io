(() => {
  'use strict';
  const full = Math.PI * 2;
  const art = () => window.PartyRouletteArt;
  const model = n => ({n, loaded:Math.floor(Math.random()*n), angle:0, step:'load', target:null,
    side:0, turn:1, slot:0, message:''});

  function markup() {
    return '<section class="roulette-table"><div class="roulette-scene">'+
      '<div class="pr-wheel" aria-hidden="true"></div>'+art().markup()+'</div>'+
      '<div class="roulette-panel"><button type="button" class="quiet pr-menu" aria-expanded="false" hidden>메뉴</button>'+
      '<div class="pr-caption"><h2></h2><p class="pr-status" role="status" aria-live="polite"></p></div>'+
      '<label class="pr-target" hidden>누구를 쏘실건가요?<select aria-label="누구를 쏘실건가요?"></select></label>'+
      '<button class="action pr-next" type="button"></button>'+
      '<button type="button" class="quiet pr-flip" hidden>방향 전환</button></div></section>';
  }
  function pulse(hit) {
    try {
      if(window.PartyFX?.prefs.vibration===false || localStorage.getItem('oj.party.vibration')==='off')return;
      navigator.vibrate?.(hit?[42,60,42,60,42]:32);
    } catch {}
  }
  function mount(root,m,options) {
    const room=options.room, multi=!!room, g=room?.game, host=document.getElementById('access-content');
    const prop=root.querySelector('.pr-prop'), wheel=root.querySelector('.pr-wheel');
    const swipe=root.querySelector('.pr-swipe'),trigger=root.querySelector('.pr-trigger');
    const next=root.querySelector('.pr-next'), flip=root.querySelector('.pr-flip'), label=root.querySelector('.pr-target');
    const menu=root.querySelector('.pr-menu');
    const select=label.querySelector('select'),status=root.querySelector('.pr-status'),title=root.querySelector('h2');
    const events=new AbortController(),listen=(el,event,fn)=>el?.addEventListener(event,fn,{signal:events.signal});
    let drag=null,frame=0,timer=0,tick=0,busy=false,alive=true,rotation=0,lastScreenAngle;
    if(multi) {
      if(Number.isInteger(g.myTarget))m.target=g.myTarget;
      if(room.phase==='together')m.step='play';
      else if(g.mine)m.step='wait';
      select.add(new Option('상대를 선택하세요',''));
      room.players.forEach((name,i)=>{if(i!==room.me)select.add(new Option(name,String(i)));});
      select.value=m.target===null?'':String(m.target);
    }
    if(!multi)label.remove();
    for(let i=0;i<m.n;i++){
      const hole=document.createElement('i');
      const a=full*i/m.n-Math.PI/2;
      hole.style.left=(50+34*Math.cos(a))+'%';hole.style.top=(50+34*Math.sin(a))+'%';
      hole.style.width=Math.min(25,133/m.n)+'%';
      if(i===m.loaded)hole.className='loaded';
      wheel.append(hole);
    }
    function paint() {
      wheel.style.transform='rotate('+m.angle+'rad)';
      if(m.step==='spin')art().rotate(prop,m.angle);
    }
    function orient() {
      if(!alive)return;
      if(m.step==='load'){delete host.dataset.rouletteAngle;return;}
      const wide=innerWidth>innerHeight;
      const angle=((screen.orientation?.angle??window.orientation??90)+360)%360;
      const nativeSide=angle===270?-1:1;
      if(wide && (angle===90||angle===270) && lastScreenAngle!==angle)m.side=nativeSide;
      lastScreenAngle=angle;
      const side=m.side||1;
      rotation=wide?(side===nativeSide?0:180):side*(angle===180?-90:90);
      m.rotation=rotation;
      host.dataset.rouletteAngle=String(rotation);
      prop.dataset.mirror=String(side===1);
    }
    function tilt(e) {
      if(m.step==='load'||!Number.isFinite(e.beta)||!Number.isFinite(e.gamma))return;
      const side=-Math.cos(e.beta*Math.PI/180)*Math.sin(e.gamma*Math.PI/180);
      if(Math.abs(side)>.45 && m.side!==Math.sign(side)){m.side=Math.sign(side);orient();}
    }
    function permitTilt() {
      const sensor=window.DeviceOrientationEvent;
      if(typeof sensor?.requestPermission==='function'){
        try{Promise.resolve(sensor.requestPermission()).catch(()=>{});}catch{}
      }
    }
    function render() {
      if(!alive)return;
      const load=m.step==='load',spin=m.step==='spin',wait=m.step==='wait';
      const waiting=multi && g.mine && room.phase==='together';
      const countdown=multi&&room.phase==='together'?Math.max(0,Math.ceil((g.opensAt-options.now())/1000)):0;
      root.dataset.step=m.step;wheel.hidden=!load;prop.hidden=load;
      root.classList.toggle('pr-immersive',!load&&!m.menuOpen);
      menu.hidden=load;
      menu.setAttribute('aria-expanded',String(!!m.menuOpen));
      menu.textContent=m.menuOpen?'게임으로':'메뉴';
      label.hidden=!(multi && (load || (room.phase==='together'&&m.target===null&&!waiting)));
      title.textContent=load?'탄창 장전':spin?'탄창을 돌려요':wait?'준비 완료':waiting?'모두 누르면 공개돼요':countdown?countdown+'초 후 함께 눌러요':'방아쇠를 눌러요';
      status.textContent=load?(multi?'내 번호는 '+room.players[room.me]+' · ':'')+m.n+'칸 중 한 칸에 한 발이 들어가요.':
        spin?'위에서 아래로 쓸어 보세요. 원하는 만큼 돌릴 수 있어요.':
        wait?'준비한 사람 '+g.count+' / '+m.n+'명':
        multi?(waiting?'누른 사람 '+g.count+' / '+m.n+'명':m.target!==null?'내가 가리킨 상대 · '+room.players[m.target]:'상대를 선택해 주세요.'):
        (m.message||'한 사람을 가리키고 화면의 방아쇠를 누르세요.');
      next.hidden=!(load||spin);
      next.disabled=busy||(load&&multi&&m.target===null);
      next.textContent=load?'장전하기':'시작';
      swipe.hidden=!spin;trigger.hidden=m.step!=='play'||waiting;
      trigger.disabled=busy||countdown>0||(multi&&m.target===null);
      flip.hidden=load;
      orient();
    }
    function halt(){cancelAnimationFrame(frame);frame=0;drag=null;}
    function coast(speed) {
      let last=performance.now();
      function move(now){
        if(!alive||m.step!=='spin')return;
        const dt=Math.min(35,now-last);last=now;m.angle+=speed*dt;paint();
        speed*=Math.exp(-dt/210);
        if(Math.abs(speed)>.00025)frame=requestAnimationFrame(move);
      }
      frame=requestAnimationFrame(move);
    }
    function move(e) {
      if(!drag||e.pointerId!==drag.id)return;
      const dx=e.clientX-drag.x,dy=e.clientY-drag.y;
      if(!drag.axis){
        if(Math.max(Math.abs(dx),Math.abs(dy))<2)return;
        drag.axis=Math.abs(rotation)===90&&Math.abs(dx)>Math.abs(dy)?'x':'y';
      }
      const delta=drag.axis==='x'?dx*(rotation===90?-1:1):dy*(rotation===180?-1:1);
      const angle=delta*.035;
      drag.speed=Math.max(-.03,Math.min(.03,angle/Math.max(8,e.timeStamp-drag.t)));
      drag.t=e.timeStamp;drag.x=e.clientX;drag.y=e.clientY;m.angle+=angle;paint();
    }
    listen(swipe,'pointerdown',e=>{
      if(m.step!=='spin'||e.button!==0||drag)return;
      halt();drag={id:e.pointerId,x:e.clientX,y:e.clientY,t:e.timeStamp,speed:0};
      swipe.setPointerCapture(e.pointerId);
    });
    listen(swipe,'pointermove',move);
    listen(swipe,'pointerup',e=>{
      if(!drag||drag.id!==e.pointerId)return;
      if(e.clientX!==drag.x||e.clientY!==drag.y)move(e);
      const speed=e.timeStamp-drag.t<100?drag.speed:0;halt();
      if(Math.abs(speed)>.00025)coast(speed);
    });
    listen(swipe,'pointercancel',halt);
    listen(swipe,'click',e=>{if(m.step==='spin'&&e.detail===0){halt();coast(.017);}});
    listen(select,'change',()=>{m.target=select.value===''?null:Number(select.value);render();});
    listen(menu,'click',()=>{m.menuOpen=!m.menuOpen;render();});
    listen(flip,'click',()=>{m.side=-(m.side||1);orient();});
    listen(next,'click',async()=>{
      if(busy||next.disabled)return;
      if(m.step==='load'){permitTilt();m.step='spin';render();paint();swipe.focus();return;}
      if(m.step!=='spin')return;
      halt();m.slot=((Math.round(-m.angle*m.n/full)%m.n)+m.n)%m.n;
      if(multi){busy=true;render();await options.send('roulette_ready',{target:m.target});busy=false;if(alive)render();}
      else{m.step='play';render();trigger.focus();}
    });
    listen(trigger,'click',async()=>{
      if(m.step!=='play'||trigger.disabled||busy)return;
      busy=true;render();
      if(multi){
        await options.send('roulette_press',Number.isInteger(g.myTarget)?{}:{target:m.target});busy=false;if(alive)render();return;
      }
      const hit=m.slot===m.loaded;pulse(hit);
      if(hit){art().flash(prop);status.textContent='팡!';timer=setTimeout(options.finish,380);return;}
      m.slot=(m.slot+1)%m.n;m.turn++;m.message='불발! 가리킨 사람에게 휴대폰을 넘기세요.';
      render();timer=setTimeout(()=>{busy=false;render();},650);
    });
    listen(wheel,'pointerdown',e=>{
      if(m.step!=='load'||e.button!==0)return;
      const box=wheel.getBoundingClientRect();
      const x=box.left+box.width/2,y=box.top+box.height/2;
      const direction=event=>Math.atan2(event.clientY-y,event.clientX-x);
      let previous=direction(e);
      wheel.setPointerCapture(e.pointerId);
      function rotate(event){
        if(event.pointerId!==e.pointerId)return;
        const angle=direction(event);
        m.angle+=Math.atan2(Math.sin(angle-previous),Math.cos(angle-previous));previous=angle;paint();
      }
      wheel.addEventListener('pointermove',rotate,{signal:events.signal});
      wheel.addEventListener('lostpointercapture',()=>wheel.removeEventListener('pointermove',rotate),{once:true,signal:events.signal});
    });
    listen(window,'deviceorientation',tilt);listen(window,'resize',orient);
    listen(window,'orientationchange',orient);listen(window.screen.orientation,'change',orient);
    if(room?.phase==='together')tick=setInterval(()=>{if(!busy)render();},150);
    render();paint();
    return {destroy(){
      alive=false;halt();events.abort();clearTimeout(timer);clearInterval(tick);
      delete host.dataset.rouletteAngle;
    }};
  }
  window.PartyRouletteBoard=Object.freeze({markup,mount,model,pulse});
})();
