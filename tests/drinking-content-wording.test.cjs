'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {randomUUID}=require('node:crypto');
const test=require('node:test');
const {fixture}=require('./drinking-room-fixture.cjs');
const {screen,until,rpcArgs}=require('./helpers/drinking-ui-fixture.cjs');

const root=path.join(__dirname,'..');
const directory=path.join(root,'games/drinking/content/corrections/natural1');
const kinds=['king','fingers','truth','minority','mission','imagevote','bomb','liar','initial'];
const sorted=values=>Array.from(values,value=>JSON.stringify(value)).sort();
const entryOf=(kind,row)=>kind==='truth'?{flavor:row.flavor,body:row.body}:row.second===null?row.body:[row.body,row.second];
const tableOf=kind=>'ojjuda_arcade_internal.'+(kind==='truth'?'drinking_truth_cards':'drinking_content_items');
const rowsOf=async(db,kind)=>(await db.query(`select to_jsonb(c) value from ${tableOf(kind)} c ${kind==='truth'?'':'where kind=$1'} order by id`,kind==='truth'?[]:[kind])).rows.map(row=>row.value);
const historyOf=async db=>(await db.query("select encode(fingerprint,'hex') fingerprint,card_id from ojjuda_arcade_internal.drinking_truth_history order by fingerprint")).rows;
const baselineOf=async db=>(await db.query("select encode(fingerprint,'hex') fingerprint from ojjuda_arcade_internal.drinking_prompt_baseline order by fingerprint")).rows.map(row=>row.fingerprint);

async function otherData(db,kind){
  return (await db.query(`select jsonb_build_object(
    'managed',(select coalesce(jsonb_agg(to_jsonb(c) order by id),'[]'::jsonb)
      from ojjuda_arcade_internal.drinking_content_items c where kind<>$1),
    'truth',case when $1='truth' then '[]'::jsonb else (select jsonb_agg(to_jsonb(c) order by id) from ojjuda_arcade_internal.drinking_truth_cards c) end,
    'truth_history',case when $1='truth' then '[]'::jsonb else (select jsonb_agg(jsonb_build_array(encode(fingerprint,'hex'),card_id) order by fingerprint) from ojjuda_arcade_internal.drinking_truth_history) end,
    'legacy',(select coalesce(jsonb_agg(to_jsonb(p) order by kind,slot),'[]'::jsonb) from ojjuda_arcade_internal.drinking_prompts p),
    'queue',(select coalesce(jsonb_agg(to_jsonb(q) order by id),'[]'::jsonb) from ojjuda_arcade_internal.drinking_prompt_queue q)
  ) value`,[kind])).rows[0].value;
}

async function freezeRoomClock(db){
  await db.exec(`create schema wording_clock;
    create table wording_clock.value(ms bigint not null);
    insert into wording_clock.value select floor(extract(epoch from clock_timestamp())*1000)::bigint;
    create function wording_clock.now() returns timestamptz language sql stable as
      $$select to_timestamp(ms/1000.0) from wording_clock.value$$;`);
  const definition=(await db.query(`select pg_get_functiondef('ojjuda_arcade_internal.party_vote_multiplayer(text,text,text,jsonb)'::regprocedure) value`)).rows[0].value;
  assert.match(definition,/clock_timestamp\(\)/);
  await db.exec(definition.replace(/\bclock_timestamp\(\)/g,'wording_clock.now()'));
}

async function activeRoom(f,kind,oldEntry,{personal}={}){
  const actors=f.users.slice(0,3);
  let priorActive=null;
  if(['liar','minority','mission','bomb','initial'].includes(kind)){
    const catalog=await rowsOf(f.db,kind);
    const target=catalog.find(row=>JSON.stringify(entryOf(kind,row))===JSON.stringify(oldEntry));
    assert.ok(target?.active,'the correction source is available for the existing round');
    priorActive=catalog.filter(row=>row.active).map(row=>row.id);
    // Restrict only this isolated fixture's candidate rows until the actual RPC
    // deals the correction source. Restore every active flag before the migration.
    await f.db.query('update ojjuda_arcade_internal.drinking_content_items set active=(id=$2) where kind=$1',[kind,target.id]);
  }
  const native=kind==='king'||kind==='liar';
  const rpcName=native?kind+'_multiplayer':['minority','mission'].includes(kind)?'party_vote_multiplayer':'party_live_multiplayer';
  const rpc=(actor,action,code='',options={})=>f.publicRpc(actor,rpcName,native?[action,code,options]:[kind,action,code,options]);
  const act=(actor,action,state,options={})=>rpc(actor,action,state.code,{
    round:state.round,revision:state.revision,request_id:randomUUID(),turn:state.game?.turn,...options
  });
  let state=await rpc(actors[0],'create','',{title:'문장 교정 중인 기존 방',capacity:3,password:'wording-test',request_id:randomUUID()});
  for(const actor of actors.slice(1))state=await rpc(actor,'join',state.code,{password:'wording-test'});
  const views=()=>Promise.all(actors.map(actor=>rpc(actor,'state',state.code)));
  const roomTable='ojjuda_arcade_internal.'+(native?kind+'_rooms':'party_vote_rooms');
  const stored=async()=>(await f.db.query(`select to_jsonb(r) value from ${roomTable} r where code=$1${native?'':' and kind=$2'}`,native?[state.code]:[state.code,kind])).rows[0].value;
  if(kind==='king'){
    const cards=await views();
    const byCard=new Map(cards.map((view,seat)=>[view.card,actors[seat]]));
    for(const actor of actors)state=await rpc(actor,'ready',state.code,{round:state.round});
    const pair=oldEntry.startsWith('둘이 ');
    state=await rpc(byCard.get(0),'order',state.code,{round:state.round,number:1,...(pair?{second:2}:{}),mission:oldEntry});
    if(pair)state=await rpc(byCard.get(1),'accept',state.code,{round:state.round});
  }else if(kind==='liar')state=await rpc(actors[0],'hint',state.code,{round:state.round,hint:'교정 전에 공유한 힌트'});
  else if(kind==='minority')state=await rpc(actors[0],'vote',state.code,{round:state.round,target:0});
  else if(kind==='mission')state=await rpc(actors[0],'ready',state.code,{round:state.round});
  else if(kind==='fingers'){
    state=await act(actors[0],'finger_prompt',state,{question:oldEntry});
    state=await act(actors[0],'finger_answer',state,{fold:true});
    state=await act(actors[1],'finger_answer',state,{fold:false});
  }else if(kind==='imagevote'){
    state=await act(actors[0],'image_prompt',state,{question:oldEntry});
    state=await act(actors[0],'image_vote',state,{target:1});
  }else if(kind==='truth'){
    const deck={mild:[],spicy:[]};deck[oldEntry.flavor]=[oldEntry.body];
    state=await act(actors[0],'truth_begin',state,{deck,mode:oldEntry.flavor,showFlavor:true,catalog_revision:'20261114-drinking-rebuild1'});
    state=await act(actors[0],'truth_pick',state,{side:0});
    assert.equal(state.game.question,oldEntry.body);
    if(personal)state=await act(actors[0],'truth_add',state,{flavor:personal.flavor,question:personal.body});
  }else{
    if(kind==='bomb')state=await act(actors[0],'configure',state,{random:false,baseSeconds:25});
    state=await act(actors[0],'start',state);
  }
  if(priorActive){
    const snapshot=await stored();
    if(kind==='liar')assert.equal(snapshot.secret_word,oldEntry);
    else if(['minority','mission'].includes(kind))assert.deepEqual(snapshot.pair,oldEntry);
    else if(kind==='bomb')assert.equal(snapshot.game_state.topic,oldEntry);
    else{
      const key=(await f.db.query('select ojjuda_arcade_internal.drinking_initial_key($1) value',[oldEntry])).rows[0].value;
      assert.equal(snapshot.game_state.initial,key);
      assert.equal(snapshot.game_state.endsAt,state.serverMs+5000);
    }
    await f.db.query('update ojjuda_arcade_internal.drinking_content_items set active=(id=any($2::int[])) where kind=$1',[kind,priorActive]);
  }
  return {actors,rpc,act,state,views,stored};
}

async function gameScreens(f,kind,actors,code,{random,personal,formerOfficial}={}){
  const scripts=kind==='king'?['/games/drinking/community-prompts.js','/games/drinking/prompt-submissions.js','/games/king/room.js']
    :['/games/drinking/community-prompts.js','/games/drinking/prompt-submissions.js',...(kind==='fingers'?['/games/party-live/prompt.js']:[]),`/games/party-live/${kind}.js`,'/games/party-live/room.js'];
  return Promise.all(actors.map(actor=>screen({
    url:`/games/${kind}/?room=${code}`,actor,scripts,
    prepare(w){
      w.document.getElementById('access-content').dataset.member=actor;
      if(random!==undefined)w.Math.random=()=>random;
      if(personal?.owner===actor){
        w.localStorage.setItem(`oj.party.${actor}.truth.v2.card.${personal.flavor}.${personal.body}`,'1');
        if(formerOfficial)w.localStorage.setItem(`oj.party.${actor}.truth.v2.card.${formerOfficial.flavor}.${formerOfficial.body}`,'1');
      }
    },
    rpc(name,args,call){
      return f.publicRpc(call.actor,name,['drinking_content','drinking_prompt_suggestions'].includes(name)
        ?[args.p_action,args.p_options||{}]:rpcArgs(name,args));
    }
  })));
}

async function showCorrectedKing(f,live,word,t){
  let state=live.state;
  if(state.phase==='response'){
    const views=await live.views();
    for(let seat=0;seat<views.length;seat++)if([1,2].includes(views[seat].card)&&!state.accepted.includes(views[seat].card)){
      state=await live.rpc(live.actors[seat],'accept',state.code,{round:state.round});
    }
  }
  state=await live.rpc(live.actors[0],'again',state.code,{round:state.round});
  const dealt=await live.views(),kingSeat=dealt.findIndex(view=>view.card===0);
  for(const actor of live.actors)state=await live.rpc(actor,'ready',state.code,{round:state.round});
  const pool=(await f.publicRpc(live.actors[kingSeat],'drinking_content',['pool',{kinds:['king'],round_mix:true}])).banks.king;
  const pair=word.startsWith('둘이 '),choices=pool.filter(line=>line.startsWith('둘이 ')===pair);
  const selected=choices.indexOf(word);assert.ok(selected>=0);
  // Control only the UI's random choice. It still fetches the real member pool,
  // filters solo/two-person missions and fills the actual form itself.
  const uis=await gameScreens(f,'king',live.actors,state.code,{random:(selected+.25)/choices.length});t.after(()=>uis.forEach(ui=>ui.close()));
  const ui=uis[kingSeat];
  await until(()=>ui.find('#order [name="mission"]')?.value,'current king recommendation');
  if(pair){
    const second=ui.find('#order [name="second"]');second.value='2';
    second.dispatchEvent(new ui.w.Event('change',{bubbles:true}));
    await until(()=>ui.find('#order [name="mission"]')?.value===word,'corrected two-person recommendation');
  }
  assert.equal(ui.find('#order [name="mission"]').value,word,'submit the automatically recommended corrected mission without replacing the input');
  ui.submit('#order');
  await until(()=>ui.find('.king-order h1')?.textContent===word,'corrected king mission reaches the server');
  for(const screen of uis){await screen.wake();await until(()=>screen.find('.king-order h1')?.textContent===word,'same corrected mission on every screen');assert.deepEqual(screen.errors,[]);}
  for(const view of await live.views())assert.equal(view.mission,word);
}

async function showCorrectedLive(f,kind,entry,t){
  const actors=f.users.slice(3,6);
  const rpc=(actor,action,code='',options={})=>f.publicRpc(actor,'party_live_multiplayer',[kind,action,code,options]);
  const act=(actor,action,state,options={})=>rpc(actor,action,state.code,{round:state.round,revision:state.revision,request_id:randomUUID(),turn:state.game?.turn,...options});
  let state=await rpc(actors[0],'create','',{title:'교정한 문장 표시 검증',capacity:3,password:'wording-test',request_id:randomUUID()});
  for(const actor of actors.slice(1))state=await rpc(actor,'join',state.code,{password:'wording-test'});
  const screenOptions={};
  if(kind==='truth'){
    const deck={mild:[],spicy:[]};deck[entry.flavor]=[entry.body];
    state=await act(actors[0],'truth_begin',state,{deck,mode:entry.flavor,catalog_revision:'20261114-drinking-rebuild1'});
  }else{
    const pool=(await f.publicRpc(actors[0],'drinking_content',['pool',{kinds:[kind],round_mix:true}])).banks[kind];
    const selected=pool.indexOf(entry);assert.ok(selected>=0);
    screenOptions.random=(selected+.25)/pool.length;
  }
  const uis=await gameScreens(f,kind,actors,state.code,screenOptions);t.after(()=>uis.forEach(ui=>ui.close()));
  if(kind==='truth'){
    await until(()=>uis[0].find('[data-truth-side="0"]'),'truth card ready');
    uis[0].click('[data-truth-side="0"]');
  }else{
    await until(()=>uis[0].find('#pair-question')?.value===entry,'the current pool automatically recommends the corrected condition');
    uis[0].submit('#pair-form');
  }
  const selector=kind==='truth'?'.truth-face strong':'#game h1',expected=kind==='truth'?entry.body:entry;
  for(const ui of uis){await ui.wake();await until(()=>ui.find(selector)?.textContent===expected,'corrected wording on all three screens');assert.deepEqual(ui.errors,[]);}
  if(kind==='fingers'){
    for(const [index,ui] of uis.entries()){
      ui.click(index===1?'[data-fold="no"]':'[data-fold="yes"]');
      await until(()=>ui.find('[data-submitted]')||!ui.find('[data-fold]'),'finger response accepted');
    }
    const current=await rpc(actors[0],'state',state.code);
    assert.deepEqual(current.game.fingers,[4,5,4],'wording still leaves each player to choose whether to fold');
  }
}

for(const kind of kinds){
  const file=path.join(directory,kind+'.json');
  if(!fs.existsSync(file)||!JSON.parse(fs.readFileSync(file,'utf8')).entries?.length)continue;
  test(`${kind}: reviewed wording updates existing rows and future prompts while preserving a live round`,{timeout:120_000},async t=>{
    const {createPolishPlan}=await import('../scripts/build-drinking-polish.mjs');
    const {entryIdentity,initialKey}=await import('../scripts/lib/drinking-catalogs.mjs');
    const plan=createPolishPlan(kind);
    assert.equal(fs.readFileSync(plan.migrationPath,'utf8'),plan.sql,'the generated migration exactly matches the reviewed correction file');
    const f=await fixture({beforePolish:true});t.after(()=>f.close());
    assert.equal(f.migrations.some(name=>name.includes('_drinking_polish_')),false);
    const {db}=f;
    // Shared-room views include the response clock even for untimed games.
    // Hold that clock fixed while comparing complete pre/post-migration views.
    if(!['king','liar'].includes(kind))await freezeRoomClock(db);
    let original=await rowsOf(db,kind);
    assert.deepEqual(sorted(original.map(row=>entryOf(kind,row))),sorted(plan.original));
    const replacements=new Map(plan.correction.entries.map(edit=>[entryIdentity(kind,edit.from),edit.to]));
    // Exercise non-default flags and a moderation link on a corrected row, too.
    const marked=original.find(row=>entryIdentity(kind,entryOf(kind,row))===entryIdentity(kind,plan.correction.entries.at(-1).from));
    if(plan.correction.entries.length>1)await db.query(`update ${tableOf(kind)} set active=false,party_pick=false where id=$1`,[marked.id]);
    if(['king','fingers','imagevote'].includes(kind)){
      const queue=(await db.query(`insert into ojjuda_arcade_internal.drinking_prompt_queue(kind,flavor,body,fingerprint,status)
        values($1,'',$2,ojjuda_arcade_internal.drinking_prompt_fingerprint($1,'',$2),'approved') returning id`,[kind,marked.body])).rows[0];
      await db.query('update ojjuda_arcade_internal.drinking_content_items set queue_id=$1 where id=$2',[queue.id,marked.id]);
    }
    if(kind==='king'){
      const source=plan.correction.entries[0].from;
      await db.query("update ojjuda_arcade_internal.drinking_content_items set body='관리자가 먼저 수정한 검증용 문장' where kind='king' and body=$1",[source]);
      const drifted=await rowsOf(db,kind);
      await assert.rejects(db.exec(plan.sql),/king_wording_source_changed/);
      await db.exec('rollback;');
      assert.deepEqual(await rowsOf(db,kind),drifted,'a missing exact source rolls back the entire migration');
      await db.query("update ojjuda_arcade_internal.drinking_content_items set body=$1 where kind='king' and body='관리자가 먼저 수정한 검증용 문장'",[source]);
    }
    original=await rowsOf(db,kind);
    const beforeOther=await otherData(db,kind),beforeHistory=await historyOf(db),beforeBaseline=await baselineOf(db);
    const oldEntry=kind==='king'?(plan.correction.entries.find(edit=>edit.from.startsWith('둘이 '))||plan.correction.entries[0]).from:plan.correction.entries[0].from;
    const personal=kind==='truth'?{owner:f.users[0],flavor:oldEntry.flavor,body:'내가 직접 넣은 질문: 다음 모임에서 어떤 간식을 먹고 싶나요?'}:null;
    const live=await activeRoom(f,kind,oldEntry,{personal});
    let personalScreens=null;
    if(personal){
      personalScreens=await gameScreens(f,kind,live.actors,live.state.code,{personal,formerOfficial:oldEntry});
      t.after(()=>personalScreens.forEach(ui=>ui.close()));
      const host=personalScreens[0];
      await until(()=>host.find('.truth-face strong')?.textContent===oldEntry.body,'the existing corrected-source card is already visible');
      assert.equal(await host.w.DrinkingPrompts.refresh('truth'),true);
      assert.equal(host.w.PartyTruthCards.deck()[personal.flavor].filter(text=>text===personal.body).length,1);
      assert.deepEqual((await live.stored()).game_state.personal[personal.flavor],[personal.body]);
    }
    const roomBefore=await live.stored(),viewsBefore=await live.views();
    const definitions=async()=>(await db.query(`select oid::regprocedure::text signature,prosrc,proacl::text,prosecdef,proconfig from pg_proc
      where pronamespace='ojjuda_arcade_internal'::regnamespace order by oid`)).rows;
    const functionsBefore=await definitions();
    await db.exec(plan.sql);
    const current=await rowsOf(db,kind);
    const expected=original.map(row=>{
      const replacement=replacements.get(entryIdentity(kind,entryOf(kind,row)));
      if(replacement===undefined)return row;
      return {...row,body:kind==='truth'?replacement.body:Array.isArray(replacement)?replacement[0]:replacement,
        ...(Array.isArray(replacement)?{second:replacement[1]}:{}),revision:row.revision+1};
    });

    await t.test('exact rows change once while IDs, flags, links, other catalogs, functions and live snapshots survive',async()=>{
      assert.deepEqual(current,expected);
      assert.deepEqual(await otherData(db,kind),beforeOther);
      assert.deepEqual(await definitions(),functionsBefore);
      assert.deepEqual(await live.stored(),roomBefore);
      assert.deepEqual(await live.views(),viewsBefore);
      if(personal){
        const host=personalScreens[0],key=`oj.party.${personal.owner}.truth.v2.card.${personal.flavor}.${personal.body}`;
        assert.equal(await host.w.DrinkingPrompts.refresh('truth'),true);
        assert.equal(host.w.localStorage.getItem(key),'1','the existing member-owned personal card remains stored');
        const personalDeck=host.w.PartyTruthCards.deck();
        assert.equal(personalDeck[personal.flavor].filter(text=>text===personal.body).length,1,'refreshing corrected official cards keeps the personal card exactly once');
        assert.equal(host.w.localStorage.getItem(`oj.party.${personal.owner}.truth.v2.card.${oldEntry.flavor}.${oldEntry.body}`),'1','filtering a retired official copy does not delete member storage');
        assert.equal([...personalDeck.mild,...personalDeck.spicy].includes(oldEntry.body),false,'a retired official question saved as a v2 personal copy cannot return after the update');
        const replacement=replacements.get(entryIdentity(kind,oldEntry));
        assert.equal(personalDeck[replacement.flavor].filter(text=>text===replacement.body).length,1,'the corrected official question appears once beside the unique personal card');
        assert.equal(host.w.DrinkingPrompts.truth()[oldEntry.flavor].includes(oldEntry.body),false,'the official pool uses corrected wording');
        for(const ui of personalScreens){
          await ui.wake();
          await until(()=>ui.find('.truth-face strong')?.textContent===oldEntry.body,'the previously selected question remains on every screen');
          assert.deepEqual(ui.errors,[]);
        }
      }
      const baseline=await baselineOf(db);
      assert.ok(beforeBaseline.every(hash=>baseline.includes(hash)),'old moderated spellings remain blocked');
      if(['king','fingers','imagevote'].includes(kind)){
        for(const edit of plan.correction.entries){
          assert.equal((await db.query(`select exists(select 1 from ojjuda_arcade_internal.drinking_prompt_baseline
            where fingerprint=ojjuda_arcade_internal.drinking_prompt_fingerprint($1,'',$2)) value`,[kind,edit.to])).rows[0].value,true);
        }
      }else assert.deepEqual(baseline,beforeBaseline);
      if(kind==='truth'){
        const history=await historyOf(db),byHash=new Map(history.map(row=>[row.fingerprint,row.card_id]));
        for(const old of beforeHistory)assert.equal(byHash.get(old.fingerprint),old.card_id);
        for(const edit of plan.correction.entries){
          const old=original.find(row=>entryIdentity(kind,entryOf(kind,row))===entryIdentity(kind,edit.from));
          assert.equal((await db.query(`select card_id from ojjuda_arcade_internal.drinking_truth_history
            where fingerprint=ojjuda_arcade_internal.drinking_prompt_fingerprint('truth',$1,$2)`,[edit.to.flavor,edit.to.body])).rows[0].card_id,old.id);
        }
      }
    });

    await t.test('current static banks and member pools use the reviewed wording and new draws reach it',async()=>{
      if(plan.clientPath){
        const context={window:{}};vm.runInNewContext(fs.readFileSync(plan.clientPath,'utf8'),context);
        const bank=context.window.DrinkingPromptCatalog;
        if(kind==='truth'){
          for(const flavor of ['mild','spicy'])assert.deepEqual(sorted(bank[flavor]),sorted(plan.catalog.filter(entry=>entry.flavor===flavor).map(entry=>entry.body)));
          const currentText=new Set(plan.catalog.map(entry=>entry.body));
          assert.deepEqual(sorted(bank.retiredTruth),sorted(plan.original.map(entry=>entry.body).filter(body=>!currentText.has(body))),'the current client remembers every superseded official spelling');
        }else assert.deepEqual(sorted(bank[kind]),sorted(plan.catalog));
      }
      const active=current.filter(row=>row.active);
      for(const roundMix of [false,true]){
        const pool=(await f.publicRpc(f.users[0],'drinking_content',['pool',{kinds:[kind],round_mix:roundMix}])).banks[kind];
        if(kind==='truth')for(const flavor of ['mild','spicy'])assert.deepEqual(sorted(pool[flavor]),sorted(active.filter(row=>row.flavor===flavor).map(row=>row.body)));
        else assert.deepEqual(sorted(pool),sorted(kind==='initial'?[...new Set(active.map(row=>initialKey(row.body)))]:active.map(row=>entryOf(kind,row))));
      }
      if(kind!=='truth'){
        const target=current.find(row=>row.active&&replacements.has(entryIdentity(kind,entryOf(kind,original.find(old=>old.id===row.id)))));
        assert.ok(target);
        await db.exec('begin;');
        try{
          await db.query('update ojjuda_arcade_internal.drinking_content_items set active=(id=$2) where kind=$1',[kind,target.id]);
          const result=(await db.query('select ojjuda_arcade_internal.drinking_draw_prompt($1,null::text[]) value',[kind])).rows[0].value;
          assert.deepEqual(result,kind==='initial'?[initialKey(target.body)]:target.second===null?[target.body]:[target.body,target.second]);
        }finally{await db.exec('rollback;');}
      }
    });

    if(['king','truth','fingers'].includes(kind))await t.test('three actual game screens display the corrected wording through the unchanged game actions',async st=>{
      const eligible=current.find(row=>row.active&&replacements.has(entryIdentity(kind,entryOf(kind,original.find(old=>old.id===row.id)))));
      assert.ok(eligible);
      if(kind==='king')await showCorrectedKing(f,live,eligible.body,st);
      else await showCorrectedLive(f,kind,entryOf(kind,eligible),st);
    });
  });
}
