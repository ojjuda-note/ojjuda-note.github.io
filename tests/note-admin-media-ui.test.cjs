const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const source = fs.readFileSync(path.join(__dirname, '../note/admin.js'), 'utf8');
const ORIGIN = 'https://fixture.supabase.co';
const id = number => `10000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
const actor = id(99);
const settle = async () => { for (let i = 0; i < 6; i++) await new Promise(resolve => setImmediate(resolve)); };
const card = (number, extra = {}) => ({ id: id(number), author_id: actor, kind: 'memo',
  body: `합성 미디어 검사 카드 ${number}`, tags: [], hidden: false, total_count: 4,
  created_at: '2026-11-21T00:00:00Z', ...extra });
const media = (number, kind = 'photo') => ({ card_id: id(number),
  photo_bucket: kind === 'event' ? 'note-event-photos' : 'note-card-photos',
  photo_path: `${actor}/${id(number)}.jpg`, video_bucket: kind === 'video' ? 'note-card-videos' : null,
  video_path: kind === 'video' ? `${actor}/${id(number)}.mp4` : null,
  duration: kind === 'video' ? 1.5 : null, width: kind === 'video' ? 160 : null, height: kind === 'video' ? 90 : null });
const signed = (bucket, value) => `${ORIGIN}/storage/v1/object/sign/${bucket}/${value}?token=synthetic-test`;

function fixture(t, options = {}) {
  const dom = new JSDOM('<!doctype html><main id="host"></main>', {
    url: 'https://ojjuda.kr/world.html?admin=cards&from=park', runScripts: 'outside-only', pretendToBeVisual: true
  });
  const w = dom.window, host = w.document.getElementById('host');
  if (options.now) w.Date.now = options.now;
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new w.Event('close')); };
  const calls = [], signatures = [], pauses = [], loads = [];
  w.HTMLMediaElement.prototype.pause = function () { pauses.push(this); Object.defineProperty(this, 'paused', { configurable: true, value: true }); };
  w.HTMLMediaElement.prototype.load = function () { loads.push(this); };
  w.HTMLMediaElement.prototype.play = function () { Object.defineProperty(this, 'paused', { configurable: true, value: false }); return Promise.resolve(); };
  w.confirm = () => true;
  w.OJJUDA_CONFIG = { supabaseUrl: ORIGIN, supabaseKey: 'public-fixture-key' };
  const state = {
    cards: options.cards || [card(1), card(2), card(3, {kind:'event'}), card(4)],
    archive: [card(10, {total_count:1, archived_at:'2026-11-20T00:00:00Z', purge_after:'2099-12-31T00:00:00Z', archive_reason:'admin', reply_count:1})],
    thread: [card(10, {total_count:2}), card(11, {kind:'comment', parent_id:id(10), total_count:2})],
    media: options.media || [media(1), media(2,'video'), media(3,'event'), media(10), media(11,'video')],
    actor, mediaHandler: options.mediaHandler, signer: options.signer, authChange: null, allowed: options.allowed !== false
  };
  const sign = async (bucket, paths, expiresIn, single) => {
    signatures.push({bucket, paths:[...paths], expiresIn, single});
    if (state.signer) return state.signer(bucket, paths, expiresIn, single);
    return single ? {data:{signedUrl:signed(bucket, paths[0])}, error:null}
      : {data:paths.map(value => ({path:value, signedUrl:signed(bucket,value)})), error:null};
  };
  const client = {
    schema(schema) { assert.equal(schema, 'ojjuda_note'); return this; },
    auth: {
      getSession: async () => ({data:{session:state.actor ? {user:{id:state.actor}} : null}, error:null}),
      onAuthStateChange(handler) { state.authChange = handler; return {data:{subscription:{unsubscribe(){}}}}; }
    },
    storage: {from(bucket) { return {
      createSignedUrls: (paths, expiresIn) => sign(bucket, paths, expiresIn, false),
      createSignedUrl: (value, expiresIn) => sign(bucket, [value], expiresIn, true)
    }; }},
    async rpc(name, args = {}) {
      calls.push({name,args:JSON.parse(JSON.stringify(args))});
      if (name === 'is_note_moderator') return {data:state.allowed};
      if (name === 'admin_cards') return {data:state.cards.map(row => ({...row,hidden:args.p_state==='hidden'}))};
      if (name === 'admin_risk_cards') return {data:[]};
      if (name === 'admin_risk_passed_ids') return {data:[]};
      if (name === 'admin_archived_cards') return {data:state.archive};
      if (name === 'admin_archived_thread') return {data:state.thread};
      if (['admin_expired_archive_queue','admin_pending_photo_cleanup','admin_actions'].includes(name)) return {data:[]};
      if (name === 'admin_card_media_paths') return state.mediaHandler ? state.mediaHandler(args)
        : {data:state.media.filter(row => args.p_ids.includes(row.card_id))};
      throw Error('Unexpected fixture RPC: '+name);
    }
  };
  w.eval(source);
  const api = w.OjjudaNoteAdmin;
  const ready = api.mount(host, {client,initialTab:options.tab || 'cards'});
  t.after(() => { api.unmount(); w.close(); });
  return {w,host,api,state,calls,signatures,pauses,loads,ready,
    q: selector => w.document.querySelector(selector), qa: selector => [...w.document.querySelectorAll(selector)],
    button: (text, parent = w.document) => [...parent.querySelectorAll('button')].find(node => node.textContent.trim() === text),
    signOut() { state.actor=null; state.authChange('SIGNED_OUT',null); }
  };
}

async function mounted(t, options) { const f=fixture(t,options); await f.ready; await settle(); return f; }
function clickRequired(node, label) { assert.ok(node, label+' exists'); node.click(); }

// Each test mounts the actual admin module. Only database/storage responses and
// browser-only media primitives are replaced; no member upload is read.
test('card lists batch photo/poster metadata and signing while video bytes wait for a click', async t => {
  const f = await mounted(t);
  const lookups=f.calls.filter(call=>call.name==='admin_card_media_paths');
  assert.equal(lookups.length,1);
  assert.deepEqual(lookups[0].args,{p_ids:[id(1),id(2),id(3),id(4)]});
  assert.equal(f.qa('.na-card-media img').length,3);
  assert.ok(f.qa('.na-card-media img').every(image=>image.loading==='lazy'));
  assert.equal(f.signatures.filter(call=>call.bucket==='note-card-videos').length,0);
  assert.deepEqual(f.signatures.map(call=>[call.bucket,call.paths.length]).sort(),
    [['note-card-photos',2],['note-event-photos',1]]);
  assert.ok(f.signatures.every(call=>call.expiresIn>0 && call.expiresIn<=300));
  assert.ok(f.q(`.na-card-media[data-card-id="${id(1)}"] [aria-label="업로드 사진 크게 보기"]`));
  assert.ok(f.q(`.na-card-media[data-card-id="${id(2)}"] [aria-label="동영상 보기"]`));
  assert.equal(f.q(`.na-card-media[data-card-id="${id(4)}"] button`),null,'text-only cards do not invent an attachment');
  assert.ok(f.host.textContent.includes(card(4).body));
});

test('hidden cards and archived originals/replies use the moderator media lookup', async t => {
  const f = await mounted(t);
  f.q('.na-search select').value='hidden';
  f.q('.na-search').dispatchEvent(new f.w.Event('submit',{bubbles:true,cancelable:true}));
  await settle();
  assert.equal(f.calls.filter(call=>call.name==='admin_cards').at(-1).args.p_state,'hidden');
  assert.ok(f.q(`.na-card-media[data-card-id="${id(2)}"] [aria-label="동영상 보기"]`));
  await f.api.selectTab('archive'); await settle();
  assert.ok(f.q(`.na-card-media[data-card-id="${id(10)}"] img`),'unexpired archived photo is visible');
  clickRequired(f.button('원문·답글 보기'),'archived thread'); await settle();
  assert.deepEqual(f.calls.filter(call=>call.name==='admin_card_media_paths').at(-1).args.p_ids,[id(10),id(11)]);
  assert.ok(f.q(`.na-card-media[data-card-id="${id(11)}"] [aria-label="동영상 보기"]`),'archived reply retains its video attachment');
  assert.equal(f.calls.some(call=>call.name==='card_media_paths'),false,'ordinary member lookup cannot replace moderator visibility');
});

test('metadata failure leaves card text usable and an explicit retry restores previews', async t => {
  const f = await mounted(t,{mediaHandler:async()=>({error:{message:'fixture metadata offline'}})});
  assert.equal(f.signatures.length,0);
  assert.ok(f.host.textContent.includes(card(1).body));
  const error=f.q('.na-media-error'); assert.ok(error,'media has its own recoverable error');
  f.state.mediaHandler=undefined;
  clickRequired(f.button('다시 불러오기',error),'metadata retry'); await settle();
  assert.ok(f.q(`.na-card-media[data-card-id="${id(1)}"] img`));
  assert.equal(f.calls.filter(call=>call.name==='admin_card_media_paths').length,2);
});

test('failed photo signing can be retried without hiding the surrounding card', async t => {
  const f = await mounted(t,{cards:[card(1,{total_count:1})],media:[media(1)],
    signer:async()=>({error:{message:'fixture signing unavailable'}})});
  assert.ok(f.host.textContent.includes(card(1).body));
  const error=f.q('.na-media-error');assert.ok(error);
  f.state.signer=undefined;
  clickRequired(f.button('다시 불러오기',error),'photo signing retry');await settle();
  assert.ok(f.q('.na-card-media img')?.src.startsWith(ORIGIN));
});

test('an expired lazy thumbnail refreshes its signature once and repeated fresh-image failure stays manual', async t => {
  let now=Date.parse('2026-11-21T06:00:00Z'),sequence=0;
  const f=await mounted(t,{cards:[card(1,{total_count:1})],media:[media(1)],now:()=>now,
    signer:async(bucket,paths)=>({data:paths.map(value=>({path:value,
      signedUrl:signed(bucket,value)+'&revision='+ ++sequence}))})});
  const oldImage=f.q('.na-media-thumbnail'),oldUrl=oldImage.src;
  assert.equal(f.signatures.length,1);
  now+=120001;
  oldImage.dispatchEvent(new f.w.Event('error'));
  await settle();
  const refreshed=f.q('.na-media-thumbnail');
  assert.equal(f.signatures.length,2,'scrolling to a thumbnail after the 120-second expiry signs once again');
  assert.ok(refreshed);assert.notEqual(refreshed,oldImage);assert.notEqual(refreshed.src,oldUrl);
  assert.equal(f.q('.na-media-error'),null,'expired image recovers automatically');
  refreshed.dispatchEvent(new f.w.Event('error'));
  refreshed.dispatchEvent(new f.w.Event('error'));
  await settle();
  assert.equal(f.signatures.length,2,'fresh-image errors cannot loop through automatic signing');
  const error=f.q('.na-media-error');assert.ok(error);
  assert.ok(f.button('다시 불러오기',error),'a persistent failure offers an explicit retry');
  now+=120001;
  refreshed.dispatchEvent(new f.w.Event('error'));await settle();
  assert.equal(f.signatures.length,2,'the same view still has only one automatic recovery allowance');
});

test('unsafe signed media URLs are never assigned to an image or player', async t => {
  for (const unsafe of ['javascript:alert(1)','data:text/html,<script>alert(1)</script>',
    'https://other.example/storage/v1/object/sign/note-card-photos/foreign.jpg',
    ORIGIN+'/storage/v1/object/sign/note-card-photos/another-object.jpg?token=synthetic']) {
    const f=await mounted(t,{cards:[card(1,{total_count:1})],media:[media(1)],
      signer:async(_bucket,paths,_expires,single)=>single?{data:{signedUrl:unsafe}}
        :{data:paths.map(value=>({path:value,signedUrl:unsafe}))}});
    assert.equal(f.qa('img,video').some(node=>node.getAttribute('src')===unsafe),false);
    assert.ok(f.q('.na-media-error'),'an invalid URL is a recoverable media failure');
  }
});

test('late metadata after tab changes or unmount cannot sign or attach old media', async t => {
  for (const leave of ['tab','unmount']) {
    let release;
    const f=fixture(t,{mediaHandler:()=>new Promise(resolve=>{release=resolve;})});
    await settle(); assert.equal(typeof release,'function');
    if(leave==='tab')await f.api.selectTab('actions');else f.api.unmount();
    release({data:[media(1),media(2,'video')]});await f.ready;await settle();
    assert.equal(f.signatures.length,0,leave+' cancels obsolete signing');
    assert.equal(f.qa('.na-card-media img,.na-media-dialog[open]').length,0);
  }
});

test('video signing is lazy and leaving or signing out pauses and clears the player', async t => {
  for(const leave of ['close','tab','signout']) {
    const f=await mounted(t,{cards:[card(2,{total_count:1})],media:[media(2,'video')]});
    clickRequired(f.q('[aria-label="동영상 보기"]'),'video preview');await settle();
    const player=f.q('.na-media-video');assert.ok(player);
    assert.equal(player.controls,true);assert.equal(player.playsInline,true);
    assert.ok(player.src.startsWith(ORIGIN));
    const videoSigns=f.signatures.filter(call=>call.bucket==='note-card-videos');
    assert.equal(videoSigns.length,1);assert.deepEqual(videoSigns[0].paths,[media(2,'video').video_path]);
    if(leave==='close')f.api.close();
    else if(leave==='tab')await f.api.selectTab('actions');
    else f.signOut();
    await settle();
    assert.ok(f.pauses.includes(player),leave+' pauses playback');
    assert.equal(player.getAttribute('src'),null,leave+' clears its signed URL');
    assert.equal(player.getAttribute('poster'),null,leave+' clears the poster');
    assert.equal(f.qa('video[src]').length,0);
  }
});


test('photo dialog close and Escape remove the image URL and return focus to its thumbnail', async t => {
  for(const leave of ['close','escape']) {
    const f=await mounted(t,{cards:[card(1,{total_count:1})],media:[media(1)]});
    const thumbnail=f.q('[aria-label="업로드 사진 크게 보기"]');
    clickRequired(thumbnail,'photo enlargement');await settle();
    const dialog=f.q('.na-media-dialog'),image=f.q('.na-media-full-photo');
    assert.ok(dialog?.open);assert.ok(image?.src.startsWith(ORIGIN));
    assert.equal(f.w.document.activeElement,f.button('닫기',dialog));
    if(leave==='close')clickRequired(f.button('닫기',dialog),'photo close');
    else dialog.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
    await settle();
    assert.equal(f.q('.na-media-dialog'),null);assert.equal(image.getAttribute('src'),null);
    assert.equal(f.w.document.activeElement,thumbnail);
  }
});

test('video signing failure has an explicit retry and never falls back to an unsigned URL', async t => {
  const f=await mounted(t,{cards:[card(2,{total_count:1})],media:[media(2,'video')]});
  f.state.signer=async()=>({error:{message:'fixture video signing failed'}});
  clickRequired(f.q('[aria-label="동영상 보기"]'),'video preview');await settle();
  assert.equal(f.qa('video[src]').length,0);
  const error=f.q('.na-media-error');assert.ok(error);
  f.state.signer=undefined;
  clickRequired(f.button('다시 불러오기',error),'video signing retry');await settle();
  assert.ok(f.q('.na-media-video')?.src.startsWith(ORIGIN));
  assert.equal(f.signatures.filter(call=>call.bucket==='note-card-videos').length,2);
});

test('a non-administrator cannot reach media metadata or storage signing', async t => {
  const f=await mounted(t,{allowed:false});
  assert.equal(f.calls.some(call=>call.name==='admin_card_media_paths'),false);
  assert.equal(f.signatures.length,0);
  assert.equal(f.qa('.na-card-media').length,0);
});

test('late video signing after unmount cannot reopen or restore a player URL', async t => {
  let release;
  const f=await mounted(t,{cards:[card(2,{total_count:1})],media:[media(2,'video')]});
  f.state.signer=(bucket,paths,_expires,single)=>bucket==='note-card-videos'
    ?new Promise(resolve=>{release=()=>resolve(single?{data:{signedUrl:signed(bucket,paths[0])}}
      :{data:paths.map(value=>({path:value,signedUrl:signed(bucket,value)}))});})
    :Promise.resolve({data:paths.map(value=>({path:value,signedUrl:signed(bucket,value)}))});
  clickRequired(f.q('[aria-label="동영상 보기"]'),'video preview');await settle();
  assert.equal(typeof release,'function');
  f.api.unmount();release();await settle();
  assert.equal(f.qa('.na-media-dialog[open]').length,0);
  assert.equal(f.qa('video[src]').length,0);
});
