const samples = [
  {name:'바늘소리',bearing:0, radius:24,range:'약 1~3km',answer:'작은 음반 가게에서 서로를 닮은 노래를 한 곡씩 골라주고 싶어요.'},
  {name:'초록걸음',bearing:315,radius:31,range:'약 3~7km',answer:'한강을 따라 느긋하게 걸어요. 해 질 때쯤 아이스크림 하나씩 들고요.'},
  {name:'오후의 모카',bearing:90,radius:30,range:'약 3~7km',answer:'창가 자리가 있는 카페에서 커피가 식는 줄도 모르고 이야기하고 싶어요.'}
];
const $ = selector => document.querySelector(selector);
const rose = $('.rose'), compass = $('#compass'), direction = $('#direction'), note = $('#sensor-note');
const names=['북','북동','동','남동','남','남서','서','북서'];
names.forEach((name,index)=>{
  const label=document.createElement('b');
  const angle=index*Math.PI/4;
  label.textContent=name;
  label.style.left=(50+45*Math.sin(angle))+'%';
  label.style.top=(50-45*Math.cos(angle))+'%';
  rose.append(label);
});
const embedded = window.parent !== window && new URLSearchParams(location.search).get('embed') === '1';
document.documentElement.classList.toggle('embedded',embedded);
const radarPanel=$('.sample-radar');
let attempt=0;
let active = false, permissionPending = false, timer = 0, last = null, frame = 0;

export function select(index) {
  const sample=samples[index];
  $('#reply').textContent='“'+sample.answer+'”';
  $('#by').textContent=sample.name+' · '+sample.range+' · 예시 답변';
  dots.forEach((dot,i)=>dot.setAttribute('aria-pressed',String(index===i)));
}
const dots=samples.map((sample,index)=>{
  const button=document.createElement('button');
  button.type='button';button.className='dot';button.textContent=sample.name[0];
  button.setAttribute('aria-label',sample.name+'의 예시 답변 보기');
  button.addEventListener('click',()=>select(index));$('#marks').append(button);return button;
});
function draw(heading) {
  rose.style.setProperty('--heading',heading+'deg');
  dots.forEach((dot,i)=>{
    const s=samples[i],angle=(s.bearing-heading)*Math.PI/180;
    dot.style.left=(50+Math.sin(angle)*s.radius)+'%';
    dot.style.top=(50-Math.cos(angle)*s.radius)+'%';
  });
}
function screenHeading(sample){
  const rad=Math.PI/180, angle=(window.screen.orientation?.angle??window.orientation??0)*rad;
  const beta=(sample.beta??0)*rad, gamma=(sample.gamma??0)*rad;
  const x=Math.sin(angle)*Math.cos(gamma);
  const y=Math.cos(angle)*Math.cos(beta)+Math.sin(angle)*Math.sin(beta)*Math.sin(gamma);
  if(Math.hypot(x,y)<.05)return null;
  const projected=Math.atan2(x,y)/rad, apple=sample.webkitCompassHeading;
  if(Number.isFinite(apple)&&apple>=0&&apple<=360) return sample.webkitCompassAccuracy<0?null:apple+projected-(Math.cos(beta)<0?180:0);
  if((sample.absolute||sample.type==='deviceorientationabsolute')&&Number.isFinite(sample.alpha))return projected-sample.alpha;
  return null;
}
function update(){
  frame=0;if(!last||!active||document.hidden)return;
  const heading=screenHeading(last);
  if(heading===null){direction.textContent='북쪽 고정';note.textContent='휴대폰을 조금 더 수평으로 들어 주세요.';draw(0);return;}
  clearTimeout(timer);note.textContent='';draw(heading);
  direction.textContent='휴대폰 위쪽 · '+names[Math.round(((heading%360+360)%360)/45)%8]+'쪽';
}
function redraw(){if(!frame)frame=requestAnimationFrame(update);}
function receive(event){
  if(!event.absolute&&event.type!=='deviceorientationabsolute'&&event.webkitCompassHeading==null)return;
  last=event;redraw();
}
function stop(message=''){
  attempt++;active=false;last=null;clearTimeout(timer);cancelAnimationFrame(frame);frame=0;
  window.removeEventListener('deviceorientation',receive);window.removeEventListener('deviceorientationabsolute',receive);
  window.removeEventListener('orientationchange',redraw);window.screen.orientation?.removeEventListener?.('change',redraw);
  compass.textContent='휴대폰 방향 켜기';direction.textContent='북쪽 고정';note.textContent=message;draw(0);
}
compass.addEventListener('click',async()=>{
  if(active){stop();return;}
  if(permissionPending)return;
  const api=window.DeviceOrientationEvent;
  if(!api){stop('방향 센서를 사용할 수 없어 북쪽을 위로 표시해요.');return;}
  permissionPending=true;
  const current=++attempt;
  try{
    const granted=!api.requestPermission || await api.requestPermission(true)==='granted';
    if(current!==attempt||document.hidden||!radarPanel.open||document.getElementById('welcome').hidden)return;
    if(!granted){stop('방향 권한이 꺼져 있어 북쪽을 위로 표시해요.');return;}
    active=true;compass.textContent='북쪽 고정하기';note.textContent='휴대폰을 수평에 가깝게 들고 살짝 돌려주세요.';
    window.addEventListener('deviceorientation',receive);window.addEventListener('deviceorientationabsolute',receive);
    window.addEventListener('orientationchange',redraw);window.screen.orientation?.addEventListener?.('change',redraw);
    timer=setTimeout(()=>stop('센서 값을 받지 못했어요. 북쪽 고정으로 계속 체험할 수 있어요.'),9000);
  }catch{if(current===attempt)stop('방향 권한을 사용할 수 없어 북쪽을 위로 표시해요.');}
  finally{permissionPending=false;}
});
radarPanel.addEventListener('toggle',()=>{if(!radarPanel.open&&(active||permissionPending))stop();});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&(active||permissionPending))stop();});
window.addEventListener('pagehide',()=>stop());
window.addEventListener('pajang-entry-exit',()=>stop(),{once:true});
draw(0);select(0);


export function setQuestion(theme){
  document.getElementById("entry-question").textContent=theme.q.join(" ");
  [0,2,1].forEach((feed,index)=>samples[index].answer=theme.answers[feed]);
  select(0);
}
