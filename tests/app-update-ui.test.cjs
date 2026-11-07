const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM} = require('jsdom');

const source = fs.readFileSync(path.join(__dirname, '../note/notifications.js'), 'utf8');
const world = fs.readFileSync(path.join(__dirname, '../world.html'), 'utf8');
const tick = async () => { for (let i = 0; i < 7; i++) await new Promise(resolve => setImmediate(resolve)); };

test('member inbox displays safe daily and monthly changes; old popup is not mounted', async () => {
  assert.doesNotMatch(world, /OjjudaDailyUpdates\.install\(/);
  const dom = new JSDOM('<!doctype html><body><div data-notifications-slot></div></body>',
    {url:'https://ojjuda.kr/world.html',runScripts:'outside-only',pretendToBeVisual:true});
  const w = dom.window;
  const items = [
    {id:'daily:2026-11-06',kind:'daily_update',source:'updates',summary:'솔리테어 게임 추가 · 장기 대국 개선',created_at:'2026-11-06T15:00:00Z',read_at:null,target_type:'update',target_id:'2026-11-06'},
    {id:'broadcast:month-2026-10-07',kind:'broadcast_update',source:'updates',summary:'게임·일정·맛집 개선 <img src=x>',created_at:'2026-11-06T14:55:00Z',read_at:null,target_type:'update',target_id:'month-2026-10-07'},
    {id:'broadcast:month-recap',kind:'broadcast_update',source:'updates',summary:'오쭈다 새 소식이에요 🌷 새 게임: 솔리테어! 맞고 타짜 8종도 추가됐어요. 일상에는 그룹도 생겼어요 💛',created_at:'2026-11-06T14:50:00Z',read_at:null,target_type:'update',target_id:'month-recap'}
  ];
  const requests = [];
  const client = {
    auth:{onAuthStateChange:()=>{}},
    schema:()=>({rpc:async()=>({data:[]})}),
    rpc:async(name,args)=>{
      requests.push({name,args});
      if(name==='app_notification_summary')return {data:{notifications:3,retention:0}};
      if(name==='list_app_notifications')return {data:{items,unread_count:3,has_more:false,next_cursor:null,as_of:'2026-11-06T15:01:00Z'}};
      if(name==='mark_app_notifications_read')return {data:1};
      return {data:[]};
    }
  };
  try {
    w.eval(source);
    const ui = w.OjjudaNotifications.install({client,getUserId:()=> '00000000-0000-4000-8000-000000000001'});
    ui.open(); await tick();
    const rendered = [...w.document.querySelectorAll('.nn-copy')].map(n=>n.textContent);
    assert.ok(rendered.includes('솔리테어 게임 추가장기 대국 개선'));
    assert.ok(rendered.includes('게임·일정·맛집 개선 <img src=x>'));
    assert.equal(w.document.querySelector('[data-notification-id="daily:2026-11-06"] .nn-copy').querySelectorAll('br').length,1,'daily changes get separate lines');
    assert.equal(w.document.querySelector('[data-notification-id="broadcast:month-recap"] .nn-copy').querySelectorAll('br').length,3,'monthly games, improvements and daily-life changes get separate lines');
    assert.equal(w.document.querySelector('.nn-item img'),null,'summary text is never HTML');
    assert.equal(w.document.querySelectorAll('.nn-source').length,3);
    assert.ok([...w.document.querySelectorAll('.nn-source')].every(n=>n.textContent==='오쭈다'));
    w.document.querySelector('[data-notification-read="daily:2026-11-06"]').click(); await tick();
    assert.ok(requests.some(r=>r.name==='mark_app_notifications_read' && r.args?.p_ids?.[0]==='daily:2026-11-06'));
  } finally {w.close();}
});
