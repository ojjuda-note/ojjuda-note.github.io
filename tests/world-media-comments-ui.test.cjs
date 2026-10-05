const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.join(__dirname, '..');
let world = fs.readFileSync(path.join(root, 'world.html'), 'utf8')
  .replace(/<script\b[^>]*\bsrc=[^>]*>\s*<\/script>/g, '')
  .replace('import { screw3d as screwGame } from "./screw3d.js";', 'const screwGame={};');
const boot = world.indexOf('j1(()=>H());gm(');
assert.ok(boot > 0);
world = world.slice(0, boot) + `
const commentJobs = [], commentToasts = []; let commentJobId = 0;
const commentRequest = (kind, mediaId) => new Promise((resolve,reject) => commentJobs.push({id:++commentJobId,kind,mediaId,resolve,reject}));
S = { from(table) {
 if(table!=='media_comments') throw new Error('Unexpected data request: '+table);
 let mediaId; const q = {select(){return q;},eq(key,value){if(key!=='media_id')throw new Error('Unexpected query key');mediaId=value;return q;},order(){return commentRequest('read',mediaId);},insert(values){return commentRequest('insert',values.media_id);}}; return q;
} };
M = text => commentToasts.push(text);
D.online = true; D.user = {id:'owner'}; D.foldersReady = true;
$.album = ['A','B'].map(id=>({id,type:'image',remote:true,caption:'사진 '+id,vis:'me',comments:[]}));
$.folders = []; g.visiting = null;
window.commentTest = {open:nm,close:dt,auth:D,model:$,toasts:commentToasts,
 pending:()=>commentJobs.map(({id,kind,mediaId})=>({id,kind,mediaId})),
 async finish(id, body, failure=false) {
  const index=commentJobs.findIndex(job=>job.id===id); if(index<0)throw new Error('Missing request '+id);
  const job=commentJobs.splice(index,1)[0];
  if(failure==='reject')job.reject(new Error('fixture network failure'));
  else job.resolve({error:failure?new Error('fixture failure'):null,data:job.kind==='read'?[{id:'comment-'+id,author_nick:'작성자',body,created_at:new Date().toISOString(),author_id:'owner'}]:null});
  await new Promise(resolve=>setTimeout(resolve,0));
 }
};
` + world.slice(world.indexOf('</script>', boot));

(async () => {
 const browser = await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage']});
 try {
  const page = await browser.newPage({viewport:{width:390,height:844}}), errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>new URL(route.request().url()).pathname==='/world.html'
   ?route.fulfill({contentType:'text/html',body:world}):route.abort());
  const reset = async () => { await page.goto('https://fixture.test/world.html'); await page.waitForFunction(()=>window.commentTest); };
  const jobs = () => page.evaluate(()=>commentTest.pending());
  const open = async id => { await page.evaluate(id=>commentTest.open(id),id); return (await jobs()).at(-1).id; };
  const finish = (id,body='',failure=false) => page.evaluate(({id,body,failure})=>commentTest.finish(id,body,failure),{id,body,failure});
  const comments = () => page.locator('#m-cms').textContent();
  const post = async body => { await page.locator('#m-cm').fill(body); await page.locator('[data-act="m-comment"]').click(); return (await jobs()).at(-1).id; };
  const displayedId = () => page.locator('[data-act="m-comment"]').getAttribute('data-id');

  await reset();
  const a = await open('A'), b = await open('B');
  await finish(b,'B 댓글'); await finish(a,'늦게 도착한 A 댓글');
  assert.equal(await displayedId(),'B');
  assert.match(await comments(),/B 댓글/,'an old photo lookup cannot replace another viewer');
  assert.doesNotMatch(await comments(),/A 댓글/);

  // Checking the media ID alone is insufficient when that same photo is reopened.
  const oldA = await open('A'); await page.evaluate(()=>commentTest.close());
  const newA = await open('A'); await finish(newA,'다시 연 A 댓글'); await finish(oldA,'이전 창 A 댓글');
  assert.match(await comments(),/다시 연 A 댓글/);
  assert.deepEqual(await page.evaluate(()=>commentTest.model.album[0].comments.map(row=>row.text)),['다시 연 A 댓글'],'stale responses cannot contaminate the record cache either');

  const failA = await open('A'), goodB = await open('B');
  await finish(goodB,'오류와 관계없는 B 댓글'); await finish(failA,'',true);
  assert.match(await comments(),/오류와 관계없는 B 댓글/,'stale lookup failures cannot replace current comments');
  assert.doesNotMatch(await comments(),/불러오지 못/);

  await reset();
  await finish(await open('A'),'등록 전 A 댓글');
  const insertA = await post('A에 남길 댓글');
  await finish(await open('B'),'B에 남아야 하는 댓글');
  await page.locator('#m-cm').fill('B 작성 중인 댓글');
  await finish(insertA);
  assert.equal((await jobs()).length,0,'a completed insert from a discarded viewer cannot launch a stale reload');
  assert.match(await comments(),/B에 남아야 하는 댓글/);
  assert.equal(await page.locator('#m-cm').inputValue(),'B 작성 중인 댓글');
  assert.equal(await page.locator('[data-act="m-comment"]').isEnabled(),true);

  await finish(await open('A'),'A 댓글');
  const failedInsert = await post('이전 A 등록');
  await finish(await open('B'),'B 댓글 유지');
  await finish(failedInsert,'',true);
  assert.deepEqual(await page.evaluate(()=>commentTest.toasts),[],'a discarded viewer failure must not show an unrelated error toast');
  assert.match(await comments(),/B 댓글 유지/);

  await reset();
  const initial = await open('A'), insert = await post('새 댓글');
  await finish(insert);
  const reload = (await jobs()).find(job=>job.kind==='read'&&job.id!==initial).id;
  await finish(reload,'등록 후 새 댓글'); await finish(initial,'등록 전 오래된 댓글');
  assert.match(await comments(),/등록 후 새 댓글/,'initial loading cannot overwrite the newer post-submit reload');
  assert.equal(await page.locator('#m-cm').inputValue(),'');
  assert.equal(await page.locator('[data-act="m-comment"]').isEnabled(),true);
  assert.deepEqual(await page.evaluate(()=>commentTest.model.album[0].comments.map(row=>row.text)),['등록 후 새 댓글']);

  // While a comment saves, its completion must not erase the next draft.
  await reset(); await finish(await open('A'),'기존 댓글');
  const queuedInsert = await post('  먼저 등록할 댓글  ');
  await page.locator('#m-cm').fill('다음에 등록할 댓글');
  await finish(queuedInsert); await finish((await jobs()).at(-1).id,'먼저 등록한 댓글');
  assert.match(await comments(),/먼저 등록한 댓글/,'the submitted comment still refreshes the current viewer');
  assert.equal(await page.locator('#m-cm').inputValue(),'다음에 등록할 댓글','success preserves input edited after submission');
  assert.equal(await page.locator('[data-act="m-comment"]').isEnabled(),true);

  await reset();
  const staleError = await open('A'), freshInsert = await post('오류보다 최신 댓글');
  await finish(freshInsert);
  const freshReload = (await jobs()).find(job=>job.kind==='read'&&job.id!==staleError).id;
  await finish(freshReload,'최신 댓글 유지'); await finish(staleError,'','reject');
  assert.match(await comments(),/최신 댓글 유지/,'an older failure cannot replace a newer successful reload in the same viewer');

  // A current failure is visible and leaves a usable retry path.
  await reset(); await finish(await open('A'),'',true);
  assert.match(await comments(),/댓글을 불러오지 못했어요/);
  await finish(await open('A'),'다시 불러온 댓글');
  assert.match(await comments(),/다시 불러온 댓글/);
  const retryInsert = await post('재시도할 댓글'); await finish(retryInsert,'',true);
  assert.equal(await page.locator('#m-cm').inputValue(),'재시도할 댓글');
  assert.equal(await page.locator('[data-act="m-comment"]').isEnabled(),true);
  assert.deepEqual(await page.evaluate(()=>commentTest.toasts),['댓글을 남기지 못했어요']);
  await page.locator('[data-act="m-comment"]').click(); await finish((await jobs()).at(-1).id);
  await finish((await jobs()).at(-1).id,'재시도 성공 댓글');
  assert.match(await comments(),/재시도 성공 댓글/);
  assert.equal(await page.locator('#m-cm').inputValue(),'');

  // Identity checks are required even if an account transition has not replaced the DOM yet.
  await reset(); const priorOwner = await open('A');
  await page.evaluate(()=>commentTest.auth.user={id:'different-owner'}); await finish(priorOwner,'이전 계정 댓글');
  assert.doesNotMatch(await comments(),/이전 계정 댓글/);
  assert.deepEqual(await page.evaluate(()=>commentTest.model.album[0].comments),[]);
  await reset(); await finish(await open('A'),'기존 댓글');
  const priorOwnerInsert = await post('이전 계정 작성 중');
  await page.evaluate(()=>commentTest.auth.user={id:'different-owner'}); await finish(priorOwnerInsert,'',true);
  assert.deepEqual(await page.evaluate(()=>commentTest.toasts),[]);
  assert.equal(await page.locator('#m-cm').inputValue(),'이전 계정 작성 중');
  assert.deepEqual(errors,[]);
  console.log('PASS: media comment viewer and account isolation, same-photo reopen, response ordering, stale errors, post navigation, current failure and retry.');
 } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
