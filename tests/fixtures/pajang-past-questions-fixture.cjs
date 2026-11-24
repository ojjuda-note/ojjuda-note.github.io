const fs=require('node:fs/promises');
const path=require('node:path');
const {fixture:likesFixture}=require('./pajang-answer-likes-fixture.cjs');

const directory=path.join(__dirname,'../../supabase/migrations');
const read=name=>fs.readFile(path.join(directory,name),'utf8');
const clock=sql=>sql.replaceAll('clock_timestamp()','public.answer_edit_test_now()');
const signatures=[
  'public.pajang_answer_feed(jsonb)',
  'public.pajang_discovery_feed(jsonb,text,text,text)',
  'public.pajang_member(text,jsonb)',
  'pajang_private.read_public_profile_preferences(uuid)',
  'public.pajang_answer_like(uuid,date,text,boolean,uuid)'
];

async function fixture(t,migration){
  const files=await fs.readdir(directory);
  const likes=await read(files.find(name=>name.endsWith('_pajang_answer_likes.sql')));
  const f=await likesFixture(t,likes);
  const {db,value,as,seed}=f;
  await db.exec(clock(await fs.readFile(path.join(__dirname,'pajang-before-past-questions.sql'),'utf8')));

  // Use the actual delivery calendar and both deployed question catalogs.
  await db.exec(await read('20261117090000_pajang_question_catalog.sql'));
  for(const name of files.filter(name=>/^202611170901\d\d_pajang_/.test(name)).sort()){
    await db.exec(await read(name));
  }
  const delivery=await read('20261117090200_pajang_question_delivery.sql');
  await db.exec(delivery.slice(0,delivery.indexOf('create function pajang_private.question_for_window')));
  await db.exec(await read('20261119160744_pajang_natural_question_copy.sql'));
  await db.exec(await read('20261121152306_pajang_personality_questions.sql'));

  // Reuse the deployed normalizer/trigger and effective character constraint.
  const words=await read('20261119051724_all_service_word_rules.sql');
  await db.exec('create schema ojjuda_note_internal');
  await db.exec(words.slice(words.indexOf('create function public.mask_banned'),words.indexOf('-- BEGIN shared scalar trigger')));
  const triggerStart=words.indexOf('create function ojjuda_note_internal.mask_member_text()');
  const triggerEnd=words.indexOf('create trigger shared_word_mask before insert or update of name,region');
  await db.exec(words.slice(triggerStart,triggerEnd));
  await db.exec(`
    create trigger shared_word_mask before insert or update of body on pajang_private.answers
      for each row execute function ojjuda_note_internal.mask_member_text('person,day,slot','body');
    alter table pajang_private.answers drop constraint answers_body_check,
      add constraint answers_body_check check(char_length(replace(body,'❤️❤️','♥')) between 1 and 220);
  `);
  const setNow=instant=>db.query("select set_config('pajang.test_now',$1,false)",[instant]);
  const source=signature=>value('select pg_get_functiondef($1::regprocedure) as value',[signature]);
  const definitions=async()=>{
    const output={};
    for(const signature of signatures){
      output[signature]=(await db.query(`select pg_get_functiondef(p.oid) as definition,
        p.proacl,p.proowner,p.prosecdef,p.proconfig from pg_proc p where p.oid=$1::regprocedure`,[signature])).rows[0];
    }
    return output;
  };
  const question=(day,slot)=>value(`select coalesce(
    pajang_private.question_for_window($1::date,$2) #>> '{q,0}',
    pajang_private.legacy_prompt($1::date,$2)) as value`,[day,slot]);
  const row=(actor,item)=>value(`select to_jsonb(a) as value from pajang_private.answers a
    where (a.person,a.day,a.slot)=($1,$2,$3)`,[actor.person,item.day,item.slot]);
  const originalAnswer=async(actor,day,slot,body,options={})=>{
    const prompt=options.question===undefined?await question(day,slot):options.question;
    await db.query(`insert into pajang_private.answers(person,day,slot,body,at,question_prompt,archived,publication_window_days)
      values($1,$2,$3,$4,$5,$6,$7,$8)`,[actor.person,day,slot,body,
      options.at??Date.parse(day+'T01:00:00Z'),prompt,options.archived??true,options.window??365]);
    if(options.hidden)await db.query('insert into ojjuda_admin_internal.pajang_answer_moderation values($1,$2,$3)',[actor.person,day,slot]);
    return {peer:actor.person,day,slot,question:prompt,body};
  };
  const legacyActor=await seed();
  const legacyItem=await originalAnswer(legacyActor,'2026-11-17','pm','원래 답변 그대로',{archived:false,window:30,at:Date.parse('2026-11-17T03:05:00Z')});
  const beforeRow=await row(legacyActor,legacyItem);
  const beforeDefinitions=await definitions();
  const oldVisibility=await source('pajang_private.answer_is_visible(date,text,boolean,date,text,smallint)');
  await db.exec(clock(migration));
  const beforeCorrectionDefinitions=await definitions();
  const lateActor=await seed();
  const lateItem=await originalAnswer(lateActor,'2026-11-18','am','정정 전에 뒤늦게 작성한 답변',{
    at:Date.parse('2026-11-22T01:00:00Z')
  });
  const beforeCorrectionRow=await row(lateActor,lateItem);
  const correction=await read(files.find(name=>name.endsWith('_pajang_publication_from_question_date.sql')));
  await db.exec(correction);
  const afterDefinitions=await definitions();
  const list=(actor,cursor=null,role='authenticated',claims={})=>as(actor,()=>value(
    'select public.pajang_past_questions($1) as value',[cursor]),role,claims);
  const save=(actor,item,body='내가 남긴 지난 답변',options={})=>as(actor,()=>value(
    'select public.pajang_answer_past_question($1,$2,$3,$4,$5) as value',
    [item.day,item.slot,item.question,body,Object.hasOwn(options,'expectedPerson')?options.expectedPerson:actor?.person]),
    options.role||'authenticated',options.claims||{});
  const all=async actor=>{
    const output=[];let cursor=null;
    do{
      const page=await list(actor,cursor);
      output.push(...page.items);cursor=page.nextCursor;
    }while(cursor);
    return output;
  };
  await setNow('2026-11-22T01:00:00Z');
  return {...f,list,save,all,setNow,source,definitions,question,originalAnswer,row,
    legacyActor,legacyItem,beforeRow,beforeDefinitions,afterDefinitions,oldVisibility,
    correction,beforeCorrectionDefinitions,lateActor,lateItem,beforeCorrectionRow};
}

module.exports={fixture,clock,signatures};
