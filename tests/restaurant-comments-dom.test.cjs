const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {JSDOM,VirtualConsole}=require('jsdom');
const source=fs.readFileSync(path.join(__dirname,'../games/certified-restaurants/restaurant-comments.js'),'utf8');
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
const id='40000000-0000-4000-8000-000000000001';
const owner='00000000-0000-4000-8000-000000000001';
const photo=`${owner}/${id}/30000000-0000-4000-8000-000000000001.jpg`;
function fixture(){
 const errors=[],virtualConsole=new VirtualConsole();virtualConsole.on('jsdomError',e=>errors.push(e.message));
 const dom=new JSDOM('<section id="comments"></section>',{url:'https://fixture.test/world.html',runScripts:'outside-only',virtualConsole});
 const w=dom.window;Object.defineProperty(w.crypto,'randomUUID',{value:()=>id,configurable:true});w.eval(source);
 const calls=[],events=[],users={user:{id:owner}};
 const client={supabaseUrl:'https://db.example.supabase.co',auth:{onAuthStateChange(fn){events.push(fn);return {data:{subscription:{unsubscribe(){}}}};}},storage:{from(bucket){assert.equal(bucket,'restaurant-comment-photos');return {getPublicUrl(path){return {data:{publicUrl:'https://db.example.supabase.co/storage/v1/object/public/restaurant-comment-photos/'+path}};},remove:async(paths)=>{calls.push({action:'remove',paths});return {error:null};}};}},
  rpc:async(name,args)=>{calls.push({name,args});if(name==='list_restaurant_comments')return {data:[{id,author_name:'테스트 <img src=x>',body:'맛있어요 <script>alert(1)</script>',photo_path:photo,created_at:'2026-11-09T00:00:00Z',mine:true}],error:null};if(name==='save_restaurant_comment')return {data:{saved:true,id:args.p_comment_id},error:null};return {data:{deleted:true,photo_path:null},error:null};}};
 const api=w.OjjudaRestaurantComments,root=w.document.querySelector('#comments');
 return {w,dom,root,calls,client,users,api,done(){dom.window.close();assert.deepEqual(errors,[]);}};
}
(async()=>{
 const f=fixture();
 try{
  const service=f.api.create({client:f.client,getUser:()=>f.users.user});
  assert.deepEqual((await service.list('certified','test-restaurant')).map(row=>row.body),['맛있어요 <script>alert(1)</script>']);
  const ownerRows=await service.list('certified','test-restaurant');assert.ok(ownerRows[0].photo_url.includes('restaurant-comment-photos'));
  await assert.rejects(()=>service.list('certified','../secret'),/invalid_input/);
  const editor=f.api.mountEditor(f.root,{name:'테스트 맛집',canPost:true,load:offset=>service.list('certified','test-restaurant',offset),save:(body,file)=>service.save('certified','test-restaurant',body,file),remove:commentId=>service.remove(commentId),isCurrent:()=>true});
  await tick();await tick();
  assert.equal(f.root.querySelectorAll('.orc-comment').length,1);
  assert.equal(f.root.querySelector('script'),null,'untrusted text is never parsed as markup');
  assert.equal(f.root.querySelector('.orc-author').textContent,'테스트 <img src=x>');
  assert.equal(f.root.querySelector('.orc-image').getAttribute('src'),ownerRows[0].photo_url);
  f.root.querySelector('.orc-input').value='새 댓글';
  f.root.querySelector('.orc-form').dispatchEvent(new f.w.Event('submit',{bubbles:true,cancelable:true}));
  await tick();await tick();await tick();
  assert.ok(f.calls.some(call=>call.name==='save_restaurant_comment'&&call.args.p_body==='새 댓글'));
  editor.dispose();service.destroy();
  f.root.replaceChildren();f.users.user=null;
  const guest=f.api.create({client:f.client,getUser:()=>null});
  const guestEditor=f.api.mountEditor(f.root,{name:'테스트 맛집',canPost:false,load:offset=>guest.list('certified','test-restaurant',offset)});
  await tick();await tick();
  assert.equal(f.root.querySelector('textarea'),null,'guests cannot post');
  assert.ok(f.root.querySelector('.orc-login'));
  await assert.rejects(()=>guest.save('certified','test-restaurant','글',null),/sign_in_required/);
  guestEditor.dispose();guest.destroy();
  console.log('Restaurant comment editor and guest/member service OK');
 }finally{f.done();}
})().catch(error=>{console.error(error);process.exitCode=1;});
