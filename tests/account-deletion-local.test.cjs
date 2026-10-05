// Real Auth, Storage HTTP and PostgreSQL; refuses to run against a remote project.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {Client}=require(process.env.ACCOUNT_DELETION_PG_MODULE||'pg');
const cleanup=require('../account-deletion.js');
const env=JSON.parse(fs.readFileSync(process.env.ACCOUNT_DELETION_LOCAL_ENV,'utf8'));
const api=env.API_URL,dbURL=env.DB_URL,service=env.SERVICE_ROLE_KEY,anon=env.ANON_KEY;
for(const url of [api,dbURL])assert.ok(['localhost','127.0.0.1','::1'].includes(new URL(url).hostname),'Only a disposable local Supabase project is allowed');
assert.ok(service&&anon,'Local CLI status must provide test-only keys');
const db=new Client({connectionString:dbURL});
async function http(route,token,{method='GET',body,raw=false,upsert=false}={}){
 const response=await fetch(api+route,{method,headers:{apikey:anon,Authorization:'Bearer '+token,
  ...(body!==undefined?{'Content-Type':raw?'image/jpeg':'application/json'}:{}),...(upsert?{'x-upsert':'true'}:{})},
  body:body===undefined?undefined:raw?body:JSON.stringify(body)});
 const text=await response.text();let data;try{data=JSON.parse(text);}catch{data=text;}
 return{ok:response.ok,status:response.status,data};
}
async function account(){
 const email='deletion-'+crypto.randomUUID()+'@example.invalid',password=crypto.randomUUID()+'aA1!';
 const made=await http('/auth/v1/admin/users',service,{method:'POST',body:{email,password,email_confirm:true}});
 assert.equal(made.ok,true,'create disposable local Auth user');
 const signed=await http('/auth/v1/token?grant_type=password',anon,{method:'POST',body:{email,password}});
 assert.equal(signed.ok,true,'sign in disposable local Auth user');
 const user={id:made.data.id,token:signed.data.access_token};
 await db.query('insert into public.profiles(id,nickname) values($1,$2)',[user.id,'fixture']);
 return user;
}
const rpc=(user,name,args={})=>http('/rest/v1/rpc/'+name,user.token,{method:'POST',body:{p_expected_user_id:user.id,...args}});
const upload=(user,bucket,name,body='fixture-photo',upsert=false)=>http('/storage/v1/object/'+bucket+'/'+name,user.token,{method:'POST',body,raw:true,upsert});
const remove=(token,bucket,paths)=>http('/storage/v1/object/'+bucket,token,{method:'DELETE',body:{prefixes:paths}});
const count=async(query,args=[])=>Number((await db.query(query,args)).rows[0].n);
function client(user){return{rpc:async(name,args)=>{const r=await rpc(user,name,args);return{data:r.data,error:r.ok?null:Error(r.data.message||r.data.error||'rpc failed')};},storage:{from:bucket=>({remove:async paths=>{const r=await remove(user.token,bucket,paths);return{data:r.data,error:r.ok?null:Error('storage failed')};}})}};}
const finish=user=>cleanup.run({client:client(user),userId:user.id});
async function waiters(user,minimum){
 for(let i=0;i<100;i++){
  const n=await count('select count(*) as n from pg_locks where locktype=\'advisory\' and classid=127247341::oid and objid=(hashtext($1)::bigint & 4294967295)::oid and not granted',[user.id]);
  if(n>=minimum)return;
  await new Promise(resolve=>setTimeout(resolve,50));
 }
 throw Error('Concurrent test requests did not reach the transaction barrier');
}
(async()=>{
 await db.connect();
 const root=path.join(__dirname,'..');
 await db.query(fs.readFileSync(path.join(__dirname,'account-deletion-fixture.sql'),'utf8'));
 await db.query(fs.readFileSync(path.join(root,'supabase/migrations/20260928155858_retain_withdrawn_member_accounts_one_month.sql'),'utf8'));
 const migration=fs.readdirSync(path.join(root,'supabase/migrations')).find(file=>file.endsWith('_account_deletion_owned_storage_guard.sql'));
 await db.query(fs.readFileSync(path.join(root,'supabase/migrations',migration),'utf8'));
 await db.query("notify pgrst,'reload schema'");
 await new Promise(resolve=>setTimeout(resolve,1000));
 const a=await account(),b=await account();
 const files=[['media',a.id+'/nested/original.jpg'],['media',a.id+'/profile-source/original.jpg'],
  ['note-card-photos',a.id+'/card.jpg'],['note-event-photos',a.id+'/event.jpg']];
 for(const [bucket,name] of files)assert.equal((await upload(a,bucket,name)).ok,true,'upload real local fixture');
 assert.equal((await upload(b,'media',b.id+'/keep.jpg')).ok,true);
 await db.query('insert into ojjuda_note_internal.fixture_linked_photos(path,author_id) values($1,$3),($2,$3)',[files[2][1],files[3][1],a.id]);
 await db.query('insert into public.guestbook(author_id,author_nick) values($1,$2)',[a.id,'before']);
 await db.query('insert into public.media_comments(author_id,author_nick) values($1,$2)',[a.id,'before']);
 await remove(a.token,'note-card-photos',[files[2][1]]);
 assert.equal(await count('select count(*) as n from storage.objects where bucket_id=$1 and name=$2',files[2]),1,'linked Note photos cannot be deleted before consent');
 assert.equal((await rpc(a,'delete_my_account')).ok,false,'finalization refuses remaining files');
 assert.equal((await rpc(b,'prepare_my_account_deletion',{p_expected_user_id:a.id})).ok,false,'cannot prepare another account');
 assert.equal((await rpc(a,'prepare_my_account_deletion')).ok,true);
 assert.equal((await upload(a,'media',files[0][1],'replacement',true)).ok,false,'pending account cannot overwrite files');
 const initial=(await rpc(a,'my_account_deletion_files',{p_limit:100}));assert.equal(initial.ok,true);assert.equal(initial.data.length,4);
 const partial=client(a),realRemove=partial.storage.from;
 partial.storage.from=bucket=>bucket==='note-card-photos'?{remove:async()=>({error:Error('injected transport failure')})}:realRemove(bucket);
 await assert.rejects(cleanup.run({client:partial,userId:a.id}),/injected transport failure/);
 assert.equal(await count('select count(*) as n from auth.users where id=$1',[a.id]),1,'partial cleanup keeps Auth and permits retry');
 assert.equal(await count('select count(*) as n from storage.objects where owner_id=$1',[a.id]),2);
 await finish(a);
 assert.equal(await count('select count(*) as n from auth.users where id=$1',[a.id]),0);
 assert.equal(await count('select count(*) as n from storage.objects where owner_id=$1',[a.id]),0);
 assert.equal(await count('select count(*) as n from storage.objects where owner_id=$1',[b.id]),1,'other account files remain');
 assert.equal(await count('select count(*) as n from ojjuda_account_deletion.requests where user_id=$1',[a.id]),0,'no permanent cleanup marker');
 assert.equal(await count('select count(*) as n from ojjuda_account_internal.withdrawn_member_accounts where user_id=$1 and expires_at>withdrawn_at',[a.id]),1,'existing contact retention still runs');
 assert.equal((await db.query('select author_nick from public.guestbook')).rows[0].author_nick,'탈퇴한 사용자');
 assert.equal((await upload(a,'media',a.id+'/stale.jpg')).ok,false,'old access JWT cannot upload after Auth deletion');
 assert.equal((await http('/storage/v1/object/authenticated/media/'+b.id+'/keep.jpg',b.token)).ok,true,'another account can still read its file');
 console.log('PASS: real Storage deletion across World, profile originals and linked Note buckets; retry, cross-account isolation, archive trigger and old JWT rejection.');

 const legacy=await account(),legacyPath=legacy.id+'/legacy.jpg';assert.equal((await upload(legacy,'media',legacyPath)).ok,true);
 await db.query('update storage.objects set owner=$1,owner_id=null where bucket_id=$2 and name=$3',[legacy.id,'media',legacyPath]);
 await finish(legacy);assert.equal(await count('select count(*) as n from storage.objects where name=$1',[legacyPath]),0,'legacy owner-only object removed by Storage API');
 const odd=await account(),oddPath=odd.id+'/odd.jpg';assert.equal((await upload(odd,'media',oddPath)).ok,true);
 await db.query('update storage.objects set owner=$1 where bucket_id=$2 and name=$3',[b.id,'media',oddPath]);
 assert.equal((await rpc(odd,'prepare_my_account_deletion')).ok,false,'conflicting ownership blocks cleanup');
 assert.equal(await count('select count(*) as n from auth.users where id=$1',[odd.id]),1);
 await db.query('update storage.objects set owner=$1 where bucket_id=$2 and name=$3',[odd.id,'media',oddPath]);
 assert.equal((await upload(odd,'fixture-other',odd.id+'/unknown.jpg')).ok,true);
 assert.equal((await rpc(odd,'prepare_my_account_deletion')).ok,false,'unknown owned bucket requires review');
 assert.equal((await remove(service,'fixture-other',[odd.id+'/unknown.jpg'])).ok,true);await finish(odd);
 console.log('PASS: legacy owner metadata, conflicting owner fields and unknown buckets are handled without deleting unrelated objects.');

 for(const first of ['upload','prepare']){
  const user=await account(),gate=new Client({connectionString:dbURL});await gate.connect();
  try{
   await gate.query('begin');await gate.query('select pg_advisory_xact_lock(127247341,hashtext($1))',[user.id]);
   const name=user.id+'/concurrent.jpg';
   const one=first==='upload'?upload(user,'media',name):rpc(user,'prepare_my_account_deletion');await waiters(user,1);
   const two=first==='upload'?rpc(user,'prepare_my_account_deletion'):upload(user,'media',name);await waiters(user,2);
   await gate.query('commit');const results=await Promise.all([one,two]);
   const uploading=results[first==='upload'?0:1],preparing=results[first==='upload'?1:0];
   assert.equal(preparing.ok,true);assert.equal(uploading.ok,first==='upload','the transaction barrier orders '+first+' first');
   const inventory=await rpc(user,'my_account_deletion_files',{p_limit:100});assert.equal(inventory.data.length,first==='upload'?1:0);
   await finish(user);
  }finally{await gate.query('rollback').catch(()=>{});await gate.end();}
 }
 await finish(b);
 assert.equal(await count('select count(*) as n from storage.objects'),0);
 assert.equal(await count('select count(*) as n from ojjuda_account_deletion.requests'),0);
 console.log('PASS: actual concurrent Storage uploads and deletion preparation serialize in both orders; all temporary accounts and files cleaned.');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>db.end());
