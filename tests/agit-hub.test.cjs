const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const hub=require('../features/home/agit-hub.js');

const date='2026-11-10';
const plus=(value,days)=>new Date(Date.parse(value+'T00:00:00Z')+days*86400000).toISOString().slice(0,10);
const missionIds=['park','baseball','quiz','recommend','visit'];

test('Korean midnight chooses the correct visit day',()=>{
  assert.equal(hub.kstDate(new Date('2026-11-09T14:59:59Z')),'2026-11-09');
  assert.equal(hub.kstDate(new Date('2026-11-09T15:00:00Z')),'2026-11-10');
});

test('all five daily missions stay together; the page target rotates in order',()=>{
  for(let offset=0;offset<21;offset++){
    const day=plus(date,offset);
    assert.deepEqual(hub.missions(day),missionIds);
    assert.equal(hub.visitTarget(day).id,['festival','restaurants','fanpages','group'][offset%4]);
    assert.ok(['chosung','trivia'].includes(hub.quizMode(day)));
    if(offset)assert.notEqual(hub.quizMode(day),hub.quizMode(plus(day,-1)));
  }
});

test('stamp records at most once a day and saves mission progress separately by day',()=>{
  const settings={},tomorrow=plus(date,1);
  assert.equal(hub.stamp(settings,date),true);
  assert.equal(hub.stamp(settings,date),false);
  assert.deepEqual(settings.agitHub.stamps,[date]);
  assert.equal(hub.safeState(settings).stamps.includes(tomorrow),false);
  const task=hub.missions(date).find(id=>id!=='stamp');
  assert.equal(hub.complete(settings,task,date),true);
  assert.equal(hub.complete(settings,task,date),false);
  assert.equal(hub.isComplete(settings,task,date),true);
  assert.equal(hub.isComplete(settings,task,tomorrow),false);
  assert.equal(hub.stamp(settings,tomorrow),true);
  assert.equal(settings.agitHub.stamps.length,2);
});

test('a pending local completion merges with older cloud data without erasing either day',()=>{
  const yesterday=plus(date,-1);
  const server={stamps:[yesterday],completed:{[yesterday]:['park'],[date]:['quiz']},guesses:{}};
  const backup={stamps:[date],completed:{[date]:['park','baseball','quiz']},guesses:{}};
  const merged=hub.mergeProgress(server,backup,date);
  assert.deepEqual(merged.stamps,[yesterday,date]);
  assert.deepEqual(new Set(merged.completed[date]),new Set(['quiz','park','baseball']));
  assert.deepEqual(merged.completed[yesterday],['park']);
  assert.equal(hub.isComplete({agitHub:merged},'park',plus(date,1)),false,'tomorrow is a new mission day');
});

test('mission completion is backed up immediately and navigation waits for cloud save',async()=>{
  const world=fs.readFileSync(path.join(__dirname,'../world.html'),'utf8');
  const start=world.indexOf('function agitProgressKey('),end=world.indexOf('function agitMissionStillCurrent(');
  assert.ok(start>=0&&end>start,'mission save functions are present');
  const content=world.slice(start,end);
  const storage=new Map(),settings={agitHub:{}},model={settings},departures=[];
  let resolveSave,localWrites=0;
  const context={
    D:{online:true,user:{id:'member-a'}},
    window:{OjjudaAgitHub:{...hub,visitTarget:()=>({id:'group'}),complete:(state,id)=>hub.complete(state,id,date),mergeProgress:(a,b)=>hub.mergeProgress(a,b,date)}},
    localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},
    ua:'member-a',de:{priv:'old-cloud'},pi:model,pc:false,no:JSON.stringify,
    mi:current=>({priv:{settings:current.settings}}),
    Ti:()=>{localWrites++;},refreshAgitHub:()=>{},
    Wn:()=>new Promise(resolve=>{resolveSave=()=>{context.de.priv=JSON.stringify({settings:model.settings});resolve();};}),
    location:{assign:url=>departures.push(url)},console,setTimeout,clearTimeout
  };
  context.$=model;
  vm.runInNewContext(content,context);
  hub.complete(settings,'park',date);
  const pending=context.markAgitPageVisit('group');
  context.navigateAgitPage('/groups/',pending);
  assert.ok(localWrites>0,'a local write occurs before navigation');
  const backup=JSON.parse(storage.get('ojjuda-agit-progress-v1:member-a'));
  assert.equal(hub.isComplete({agitHub:backup},'park',date),true);
  assert.equal(hub.isComplete({agitHub:backup},'visit',date),true);
  assert.deepEqual(departures,[],'navigation waits while the remote save is pending');
  resolveSave();await pending;
  assert.deepEqual(departures,['/groups/']);
  model.settings={agitHub:{stamps:[],completed:{},guesses:{}}};
  context.restoreAgitProgress('member-a');
  assert.equal(hub.isComplete(model.settings,'park',date),true,'stale cloud state does not erase completion');
  assert.equal(hub.isComplete(model.settings,'visit',date),true);
  assert.equal(context.readAgitProgress('member-b'),null,'backups stay scoped to each account');
  resolveSave();
});

test('visit stamps display the current Monday-to-Sunday week',()=>{
  const settings={agitHub:{stamps:['2026-11-08','2026-11-09']}};
  const html=hub.markup(settings,{},'2026-11-10');
  const labels=[...html.matchAll(/class="agit-stamp-day[^"]*" aria-label="([^"]+)"/g)].map(match=>match[1]);
  assert.equal(labels.length,7);
  assert.match(labels[0],/^2026-11-09 방문 완료$/);
  assert.match(labels[1],/^2026-11-10 미방문$/);
  assert.match(labels[6],/^2026-11-15 방문 예정$/);
  assert.match(html,/이번 주 1\/7/,'a prior Sunday does not count toward this week');
  assert.equal((html.match(/is-upcoming/g)||[]).length,5);
  const nextWeek=hub.markup(settings,{},'2026-11-16');
  assert.match(nextWeek,/2026-11-16 미방문/);
  assert.match(nextWeek,/2026-11-22 방문 예정/);
  assert.match(nextWeek,/이번 주 0\/7/);
});

test('number baseball validates guesses and records strikes and balls',()=>{
  const settings={};
  let day=date;
  while(!hub.missions(day).includes('baseball'))day=plus(day,1);
  const target=hub.baseballAnswer(day);
  assert.match(target,/^[1-9]{3}$/);
  assert.equal(new Set(target).size,3);
  assert.equal(hub.guessBaseball(settings,'111',day).valid,false);
  const wrong=hub.guessBaseball(settings,target.slice(1)+target[0],day);
  assert.deepEqual({strike:wrong.strike,ball:wrong.ball,won:wrong.won},{strike:0,ball:3,won:false});
  assert.equal(hub.isComplete(settings,'baseball',day),false);
  const win=hub.guessBaseball(settings,target,day);
  assert.equal(win.won,true);
  assert.equal(hub.isComplete(settings,'baseball',day),true);
  assert.equal(settings.agitHub.guesses[day].length,2);
  hub.guessBaseball(settings,target,day);
  assert.equal(settings.agitHub.guesses[day].length,2,'duplicate guesses do not grow history');
});

test('number baseball shows three tapped digits in order with colored S/B/OUT',()=>{
  let selected='';
  for(const digit of ['5','2','9'])selected=hub.appendBaseballDigit(selected,digit);
  assert.equal(selected,'529');
  assert.equal(hub.appendBaseballDigit(selected,'1'),'529','only three digits are accepted');
  assert.equal(hub.appendBaseballDigit('52','5'),'52','duplicate digit is ignored');
  assert.equal(hub.appendBaseballDigit('52','0'),'52','zero is not allowed');
  const puzzle=hub.puzzleMarkup({},'baseball',date);
  assert.equal((puzzle.match(/data-baseball-slot=/g)||[]).length,3);
  assert.equal((puzzle.match(/data-act="agit-baseball-digit"/g)||[]).length,9);
  assert.ok(puzzle.includes('data-act="agit-baseball-backspace"'));
  assert.ok(puzzle.includes('data-act="agit-baseball-clear"'));
  assert.match(hub.baseballResultMarkup(2,1),/2 스트라이크.*1 볼/);
  assert.match(hub.baseballResultMarkup(0,0),/OUT · 아웃/);
});

test('trivia and consonant questions give answerable puzzles',()=>{
  for(let offset=0;offset<12;offset++){
    const day=plus(date,offset);
    const [question,choices,index]=hub.trivia(day);
    assert.ok(question.length>3);
    assert.ok(index>=0&&index<choices.length);
    assert.equal(new Set(choices).size,choices.length);
    const [answer,hint]=hub.chosung(day);
    assert.ok(hint.length>0);
    assert.ok(hub.initials(answer).length>0);
    assert.notEqual(hub.initials(answer),answer);
  }
});

test('Agit markup contains one five-mission panel and Daily fan content',()=>{
  const games={spot:{name:'틀린그림찾기'},festival:{name:'축제일정',test:true},group:{name:'그룹',test:true,memberOnly:true},poker:{name:'세븐포커',test:true,age:19}};
  const settings={};
  const html=hub.markup(settings,games,date);
  for(const label of ['아지트','오늘의 추천게임','방문 도장','오늘의 미션','일상','팬페이지','축제일정'])assert.ok(html.includes(label),label);
  assert.ok(!html.includes('세븐포커'),'adult games stay out of Daily');
  assert.ok(html.includes('data-act="agit-stamp"'));
  assert.ok(html.includes('data-act="agit-play"'));
  assert.equal((html.match(/class="agit-quest-card /g)||[]).length,5);
  assert.match(html,/축제 페이지 들어가기/);
  assert.doesNotMatch(html,/5번 페이지는|agit-quest-next|agit-quest-label-short/,'no redundant instructions below the missions');
  for(const section of ['agit-hero','agit-checkin','agit-quest-grid','agit-life-grid','agit-footer'])assert.ok(html.includes(section),section);
  for(const theme of ['classic','spring','summer','autumn','winter','newyear','seollal','valentine','white','children','parents','teachers','buddha','liberation','chuseok','hangeul','halloween','pepero','christmas'])assert.ok(fs.existsSync(path.join(__dirname,'../features/home/theme-illustrations',theme+'.webp')),theme+' illustrated hero exists');
  assert.match(html,/theme-illustrations\/autumn\.webp/);
  assert.doesNotMatch(html,/agit-hero-event-art|agit-hero-season-art|theme-scenes/,'the illustration must be one standalone theme scene');
  assert.ok(html.includes('data-act="feedback-open"'));
  assert.match(fs.readFileSync(path.join(__dirname,'../world.html'),'utf8'),/\/features\/home\/agit-hub\.js\?v=[\w-]+/);
  assert.ok(fs.readFileSync(path.join(__dirname,'../index.html'),'utf8').includes("url.searchParams.set('tab', 'hub')"),'the main entry must open the Agit first');
});

test('occasion headline and Ojjuda copy replace the everyday greeting',()=>{
  const previous=global.OjjudaThemes;
  try{
    global.OjjudaThemes={
      seasonFor:()=> 'autumn',resolve:()=> 'pepero',
      catalog:{pepero:{name:'빼빼로데이',headline:['달콤한','안부 하나.'],copy:'빼빼로 하나, 마음 한 조각. 오쭈다에서 나눠요.'}}
    };
    const html=hub.markup({}, {}, '2026-11-10');
    assert.match(html,/<h1><span class="agit-hero-highlight">달콤한 <em>안부 하나\.<\/em><\/span><\/h1>/);
    assert.match(html,/빼빼로 하나, 마음 한 조각\. 오쭈다에서 나눠요\./);
    assert.match(html,/data-agit-theme="pepero"/);
    assert.doesNotMatch(html,/오늘도 <em>잘 왔어!<\/em>/);
  }finally{
    if(previous)global.OjjudaThemes=previous;
    else delete global.OjjudaThemes;
  }
});

test('mobile missions use one compact panel instead of oversized cards',()=>{
  const css=fs.readFileSync(path.join(__dirname,'../features/home/agit-hub.css'),'utf8');
  const mobile=css.slice(css.indexOf('@media(max-width:740px)'));
  assert.match(css,/\.agit-quest-grid\{display:grid;grid-template-columns:minmax\(0,1fr\)/);
  assert.match(mobile,/\.agit-quest-card\{grid-template-columns:23px 36px minmax\(0,1fr\) 18px/);
});

test('themed hero uses narrow inline white highlights without masking the artwork',()=>{
  const css=fs.readFileSync(path.join(__dirname,'../features/home/agit-hub.css'),'utf8');
  const js=fs.readFileSync(path.join(__dirname,'../features/home/agit-hub.js'),'utf8');
  const world=fs.readFileSync(path.join(__dirname,'../world.html'),'utf8');
  assert.doesNotMatch(css,/\.agit-hero-story::before\{/);
  assert.match(css,/\.agit-hero-story \.agit-hero-highlight\{[^}]*padding:0 \.04em/);
  assert.match(css,/box-decoration-break:clone/);
  assert.match(js,/class="agit-hero-highlight"/);
  assert.match(js,/class="agit-hero-highlight agit-hero-highlight--copy"/);
  assert.match(world,/agit-hub\.css\?v=[\w-]+/);
  assert.match(world,/agit-hub\.js\?v=[\w-]+/);
  assert.match(world,/updateAgitProgress\(hub\.complete\(\$\.settings,id==='baseball'\?'baseball':'quiz'\)\|\|id==='baseball'\)/,'baseball wins also trigger an immediate save');
});

test('visit streak continues through yesterday but resets after a missed day',()=>{
  const yesterday=plus(date,-1),twoDaysAgo=plus(date,-2);
  const settings={agitHub:{stamps:[twoDaysAgo,yesterday]}};
  assert.equal(hub.visitStreak(settings,date),2);
  hub.stamp(settings,date);
  assert.equal(hub.visitStreak(settings,date),3);
  assert.equal(hub.visitStreak(settings,plus(date,2)),0);
});
