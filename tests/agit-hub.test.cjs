const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const hub=require('../features/home/agit-hub.js');

const date='2026-11-10';
const plus=(value,days)=>new Date(Date.parse(value+'T00:00:00Z')+days*86400000).toISOString().slice(0,10);
const puzzles=new Set(['trivia','baseball','chosung']);

test('Korean midnight chooses the correct visit day',()=>{
  assert.equal(hub.kstDate(new Date('2026-11-09T14:59:59Z')),'2026-11-09');
  assert.equal(hub.kstDate(new Date('2026-11-09T15:00:00Z')),'2026-11-10');
});

test('daily missions change and always include one playable puzzle',()=>{
  const signatures=new Set(),seen=new Set();
  for(let offset=0;offset<21;offset++){
    const tasks=hub.missions(plus(date,offset));
    assert.equal(tasks.length,3);
    assert.equal(new Set(tasks).size,3);
    assert.equal(tasks.filter(id=>puzzles.has(id)).length,1);
    signatures.add(tasks.join(','));
    for(const id of tasks)seen.add(id);
  }
  assert.ok(signatures.size>=9);
  for(const id of [...puzzles,'stamp','recommend','daily','arcade'])assert.ok(seen.has(id),id+' must appear');
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

test('Agit markup contains recommended game, stamp, rotating missions and Daily fan content',()=>{
  const games={spot:{name:'틀린그림찾기'},festival:{name:'축제일정',test:true},group:{name:'그룹',test:true,memberOnly:true},poker:{name:'세븐포커',test:true,age:19}};
  const settings={};
  const html=hub.markup(settings,games,date);
  for(const label of ['아지트','오늘의 추천게임','방문 도장','오늘의 미션','일상','팬페이지','축제일정'])assert.ok(html.includes(label),label);
  assert.ok(!html.includes('세븐포커'),'adult games stay out of Daily');
  assert.ok(html.includes('data-act="agit-stamp"'));
  assert.ok(html.includes('data-act="agit-play"'));
  assert.equal((html.match(/class="agit-mission(?:\s|"|$)/g)||[]).length,3);
  assert.ok(fs.readFileSync(path.join(__dirname,'../world.html'),'utf8').includes('/features/home/agit-hub.js?v=20261110-agit-hub1'));
});
