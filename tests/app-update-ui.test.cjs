const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM} = require('jsdom');

const source = fs.readFileSync(path.join(__dirname, '../note/notifications.js'), 'utf8');
const styles = fs.readFileSync(path.join(__dirname, '../note/notifications.css'), 'utf8');
const world = fs.readFileSync(path.join(__dirname, '../world.html'), 'utf8');
const tick = async () => { for (let i = 0; i < 7; i++) await new Promise(resolve => setImmediate(resolve)); };

test('member inbox displays safe daily and monthly changes; old popup is not mounted', async () => {
  assert.doesNotMatch(world, /OjjudaDailyUpdates\.install\(/);
  const dom = new JSDOM('<!doctype html><body><div data-notifications-slot></div></body>',
    {url:'https://ojjuda.kr/world.html',runScripts:'outside-only',pretendToBeVisual:true});
  const w = dom.window;
  const items = [
    {id:'daily:2026-11-06',kind:'daily_update',source:'updates',summary:'솔리테어 게임 추가 · 장기 대국 개선',created_at:'2026-11-06T15:00:00Z',read_at:null,target_type:'update',target_id:'2026-11-06'},
    {id:'daily:2026-11-07',kind:'daily_update',source:'updates',summary:'🎮 게임 — 벽돌깨기 속도·충돌 개선! 솔리테어·나사풀기·틀린그림 조작도 더 편해졌어요. · 🗺️ 지도·나들이 — 지도 확대·내 주변 찾기 개선! 포항·영주 축제, 충남 백년가게 4곳도 추가됐어요. · ⚡ 더 가볍게 — 화면의 반복 갱신과 공원 재로딩을 줄이고, 그룹 사진도 더 빠르게 불러와요.',created_at:'2026-11-07T15:00:00Z',read_at:null,target_type:'update',target_id:'2026-11-07'},
    {id:'broadcast:month-2026-10-07',kind:'broadcast_update',source:'updates',summary:'게임·일정·맛집 개선 <img src=x>',created_at:'2026-11-06T14:55:00Z',read_at:null,target_type:'update',target_id:'month-2026-10-07'},
    {id:'broadcast:month-recap',kind:'broadcast_update',source:'updates',summary:'오쭈다 새 소식이에요 🌷 새 게임: 오쭈다 마블·샛별키우기·지뢰찾기·탱크·세븐포커·사천성·뱅·룰렛·바람의 궁수·솔리테어! 맞고 타짜 8종도 추가됐어요. 일상에는 그룹도 생겼어요 💛',created_at:'2026-11-06T14:50:00Z',read_at:null,target_type:'update',target_id:'month-recap'}
  ];
  const requests = [];
  const client = {
    auth:{onAuthStateChange:()=>{}},
    schema:()=>({rpc:async()=>({data:[]})}),
    rpc:async(name,args)=>{
      requests.push({name,args});
      if(name==='app_notification_summary')return {data:{notifications:4,retention:0}};
      if(name==='list_app_notifications')return {data:{items,unread_count:4,has_more:false,next_cursor:null,as_of:'2026-11-07T15:01:00Z'}};
      if(name==='mark_app_notifications_read')return {data:1};
      return {data:[]};
    }
  };
  try {
    w.eval(source);
    const ui = w.OjjudaNotifications.install({client,getUserId:()=> '00000000-0000-4000-8000-000000000001'});
    ui.open(); await tick();
    const daily = w.document.querySelector('[data-notification-id="daily:2026-11-06"] .nn-copy');
    const monthly = w.document.querySelector('[data-notification-id="broadcast:month-recap"] .nn-copy');
    const structured = w.document.querySelector('[data-notification-id="daily:2026-11-07"] .nn-copy');
    assert.deepEqual([...structured.querySelectorAll('.nn-update-daily-section .nn-update-label')].map(n=>n.textContent),
      ['🎮 게임','🗺️ 지도·나들이','⚡ 더 가볍게'],'each daily title sits on its own line');
    assert.equal(structured.querySelectorAll('.nn-update-daily-section .nn-update-detail').length,3,
      'each daily description sits below its title');
    assert.equal(structured.querySelectorAll('.nn-update-daily-item').length,0,
      'structured updates do not become inline bullet paragraphs');
    assert.deepEqual([...daily.querySelectorAll('.nn-update-daily-item')].map(n=>n.textContent), ['솔리테어 게임 추가','장기 대국 개선']);
    assert.equal(monthly.querySelector('.nn-update-intro').textContent,'오쭈다 새 소식이에요 🌷');
    assert.deepEqual([...monthly.querySelectorAll('.nn-update-label')].map(n=>n.textContent), ['🎮 새 게임 10종','✨ 기존 게임 개선','🌷 일상 소식']);
    assert.equal(monthly.querySelectorAll('.nn-update-section').length,3,'monthly changes are grouped by topic');
    assert.equal(monthly.querySelector('.nn-update-section').querySelectorAll('.nn-update-detail').length,2,'long game names are shown in two shorter rows');
    assert.ok(w.document.querySelector('[data-notification-id="broadcast:month-2026-10-07"] .nn-copy').textContent.includes('<img src=x>'));
    assert.equal(w.document.querySelector('.nn-item img'),null,'summary text is never HTML');
    assert.match(styles,/\.nn-update-intro\{[^}]*font-size:18px/,'intro has its own larger font size');
    assert.match(styles,/\.nn-update-label\{[^}]*font-size:15px/,'section headings have a middle font size');
    assert.match(styles,/\.nn-update-detail,[^}]*font-size:14px/,'detail text is smaller and readable');
    assert.match(styles,/\.nn-unread \.nn-update-copy\{font-weight:400\}/,'unread summaries are not entirely bold');
    assert.match(styles,/\.nn-update-daily-section\{[^}]*border-bottom:1px solid var\(--line\)/,
      'daily headings and descriptions are grouped with visual separation');
    assert.match(world,/note\/notifications\.js\?v=20261108-daily-sections1/,
      'world loads the latest notice renderer');
    assert.equal(w.document.querySelectorAll('.nn-source').length,4);
    assert.ok([...w.document.querySelectorAll('.nn-source')].every(n=>n.textContent==='오쭈다'));
    w.document.querySelector('[data-notification-read="daily:2026-11-06"]').click(); await tick();
    assert.ok(requests.some(r=>r.name==='mark_app_notifications_read' && r.args?.p_ids?.[0]==='daily:2026-11-06'));
  } finally {w.close();}
});
