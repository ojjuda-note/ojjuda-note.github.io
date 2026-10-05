const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const cleanup=require('../account-deletion.js');
const owner='00000000-0000-4000-8000-000000000001';
const buckets=['media','note-card-photos','note-event-photos'];
function fixture(files=[]){
 const state={files:files.slice(),calls:[],current:true,failBucket:null,noProgress:false,deleted:false};
 const client={
  async rpc(name,args){
   state.calls.push([name,args]);assert.equal(args.p_expected_user_id,owner);
   if(name==='my_account_deletion_files')return{data:state.files.slice(0,args.p_limit)};
   if(name==='delete_my_account'){assert.equal(state.files.length,0);state.deleted=true;}
   return{data:null};
  },storage:{from(bucket){return{async remove(paths){
   state.calls.push(['remove',bucket,paths]);
   if(state.failBucket===bucket)return{error:Error('storage unavailable')};
   if(!state.noProgress)state.files=state.files.filter(f=>f.bucket_id!==bucket||!paths.includes(f.photo_path));
   return{data:[]};
  }}}}
 };
 return{state,client,run:()=>cleanup.run({client,userId:owner,isCurrent:()=>state.current})};
}
(async()=>{
 const files=Array.from({length:205},(_,i)=>({bucket_id:buckets[i%3],photo_path:`${owner}/nested/${i}.jpg`}));
 const success=fixture(files);await success.run();assert.equal(success.state.deleted,true);
 assert.equal(success.state.calls.filter(c=>c[0]==='my_account_deletion_files').length,4,'re-query from the start as deleted objects disappear');
 const retry=fixture(files);retry.state.failBucket='note-card-photos';
 await assert.rejects(retry.run(),/storage unavailable/);assert.equal(retry.state.deleted,false);
 assert.ok(retry.state.files.length<files.length,'successful earlier bucket removals stay removed');
 retry.state.failBucket=null;await retry.run();assert.equal(retry.state.deleted,true,'retry drains remaining files before finalizing');
 const stuck=fixture(files.slice(0,1));stuck.state.noProgress=true;
 await assert.rejects(stuck.run(),/account_storage_remaining/);assert.equal(stuck.state.deleted,false,'silent Storage no-op cannot report withdrawal success');
 for(const file of [{bucket_id:'media',photo_path:'other/photo.jpg'},
  {bucket_id:'other-bucket',photo_path:owner+'/photo.jpg'},
  {bucket_id:'media',photo_path:owner+'/../other/photo.jpg'}]){
  const invalid=fixture([file]);await assert.rejects(invalid.run(),/account_storage_manual_review/);
  assert.equal(invalid.state.calls.some(c=>c[0]==='remove'),false);
 }
 for(const stage of ['prepare_my_account_deletion','my_account_deletion_files','remove']){
  const f=fixture(files.slice(0,1)),rpc=f.client.rpc;
  f.client.rpc=async(...args)=>{const result=await rpc(...args);if(args[0]===stage)f.state.current=false;return result;};
  if(stage==='remove'){const from=f.client.storage.from;f.client.storage.from=b=>{const storage=from(b),remove=storage.remove;storage.remove=async paths=>{const result=await remove(paths);f.state.current=false;return result;};return storage;};}
  await assert.rejects(f.run(),/account_changed/);assert.equal(f.state.deleted,false,'account change stops destructive continuation after '+stage);
 }
 // Execute the actual World withdrawal handler, including failure recovery and final UI.
 const world=fs.readFileSync(path.join(__dirname,'../world.html'),'utf8');
 const start=world.indexOf('async function ly(t){'),end=world.indexOf('\nvar mm=',start);
 assert.ok(start>0&&end>start);
 for(const mode of ['success','failure','switch']){
  const button={disabled:false},app={innerHTML:''},messages=[],removed=[];
  let signedOut=0,reset=0;
  const D={online:true,user:{id:owner}},context={D,$:{me:{nick:'닉네임'}},z:()=>({value:'닉네임'}),M:m=>messages.push(m),
   S:{auth:{signOut:async()=>{signedOut++;}}},window:{OjjudaAccountDeletion:{message:cleanup.message,run:async options=>{
    assert.equal(options.userId,owner);if(mode==='failure')throw Error('storage failed');if(mode==='switch')D.user={id:'another-user'};
   }}},console:{error(){}},localStorage:{removeItem:k=>removed.push(k)},gr:'world-state',dt:()=>reset++,Oo:()=>'',document:{getElementById:()=>app}};
  vm.createContext(context);vm.runInContext(world.slice(start,end)+'\nthis.withdraw=ly;',context);
  await context.withdraw(button);
  if(mode==='success'){assert.equal(signedOut,1);assert.equal(reset,1);assert.match(app.innerHTML,/탈퇴가 끝났어요/);}
  else{assert.equal(signedOut,0);assert.equal(reset,0);assert.deepEqual(removed,[]);assert.equal(app.innerHTML,'');}
  if(mode==='failure'){assert.equal(button.disabled,false);assert.match(messages.at(-1),/남은 사진 정리/);}
 }
 console.log('PASS: three buckets, nested paths, 205-file batches, partial failure and retry, no-progress rejection, foreign paths, account switches, and actual World completion/failure UI.');
})().catch(error=>{console.error(error);process.exitCode=1;});
