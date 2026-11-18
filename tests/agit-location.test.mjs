import test from 'node:test';
import assert from 'node:assert/strict';
import {warmLocationOnAgit} from '../features/home/location-warmup.mjs';

test('Agit warms only the signed-in account and stops on off, logout, hiding or departure',async()=>{
  const surface=new EventTarget();surface.document=new EventTarget();surface.document.hidden=false;
  let session={user:{id:'guest',is_anonymous:true}},changed,choice;
  const reads=[],forgotten=[];let unsubscribed=false;
  const db={auth:{getSession:async()=>({data:{session}}),onAuthStateChange:callback=>{
    changed=callback;return {data:{subscription:{unsubscribe(){unsubscribed=true;}}}};
  }}};
  const service={
    readPosition:options=>{reads.push(options);return new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(options.signal.reason)));},
    subscribe:(_account,callback)=>{choice=callback;return()=>{choice=null;};},
    forget:account=>forgotten.push(account)
  };
  const settle=()=>new Promise(resolve=>setTimeout(resolve,5));
  const login=async user=>{session=user?{user}:null;changed('SIGNED_IN',session);await settle();};
  const dispose=warmLocationOnAgit(db,{surface,service});
  try{
    await settle();assert.equal(reads.length,0,'anonymous sessions never request GPS');
    await login({id:'member'});assert.equal(reads.length,1);assert.equal(reads[0].accountId,'member');
    await login({id:'member'});assert.equal(reads.length,1,'token refresh does not start another request');
    choice({enabled:false,version:1});assert.ok(reads[0].signal.aborted);
    choice({enabled:true,version:2});assert.equal(reads.length,2);
    await login({id:'other'});assert.ok(reads[1].signal.aborted);assert.deepEqual(forgotten,['member']);assert.equal(reads[2].accountId,'other');
    surface.document.hidden=true;surface.document.dispatchEvent(new Event('visibilitychange'));
    assert.ok(reads[2].signal.aborted);
    await login(null);assert.deepEqual(forgotten,['member','other']);
    surface.document.hidden=false;await login({id:'member'});assert.equal(reads.length,4);
    surface.dispatchEvent(new Event('pagehide'));assert.ok(reads[3].signal.aborted);assert.ok(unsubscribed);
    await login({id:'later'});assert.equal(reads.length,4);
  }finally{dispose();}
});
