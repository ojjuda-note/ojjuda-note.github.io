const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const fixture=require('./fixtures/house-album.cjs'),source=fs.readFileSync(path.join(__dirname,'../note/preview.js'),'utf8');
(async()=>{
 const f=fixture(),messages=[],photo=new Blob(['original photo'],{type:'image/jpeg'});
 const c={client:f.client,crypto,console:{warn(){}},WORLD_BUCKET:'media',WORLD_ALBUM_FOLDER:'익명카드',identityEpoch:1,session:{user:{id:f.owner}},makeAlbumThumb:async()=>new Blob(['thumb'],{type:'image/jpeg'}),flashMessage:message=>messages.push(message)};
 c.sameWorldUser=(id,epoch)=>c.identityEpoch===epoch&&c.session?.user?.id===id;
 vm.createContext(c);vm.runInContext(source.slice(source.indexOf('async function worldAlbumFolderId'),source.indexOf('let worldPicker =')),c);
 // Existing private Note folder is reused; album records stay private.
 await c.saveToWorldAlbum(photo,f.owner,1);let saved=f.db.media.at(-1);assert.equal(saved.folder_id,'note-folder');assert.equal(saved.visibility,'me');assert.equal(saved.caption,'오쭈다노트에 올린 사진');assert(f.files.has(saved.path)&&f.files.has(saved.thumb_path));assert.equal(f.db.media_folders.length,2);
 // A same-named public folder must never receive a newly attached Note photo.
 f.db.media_folders.find(row=>row.id==='note-folder').visibility='all';await c.saveToWorldAlbum(photo,f.owner,1);saved=f.db.media.at(-1);const privateFolder=f.db.media_folders.find(row=>row.id===saved.folder_id);assert.notEqual(privateFolder.id,'note-folder');assert.equal(privateFolder.visibility,'me');assert.equal(privateFolder.allowed.length,0);
 const count=f.db.media.length,files=f.files.size;f.state.fail='insert';await assert.rejects(c.saveToWorldAlbum(photo,f.owner,1));assert.equal(f.db.media.length,count);assert.equal(f.files.size,files);f.state.fail=null;
 c.session.user.id='member-b';await c.saveToWorldAlbum(photo,f.owner,1);assert.equal(f.db.media.length,count,'account change cannot save the previous member’s photo');
 // Exercise the actual publish-success attachment block, including photo edits.
 const start=source.indexOf("  if (publishKind === 'event' && selectedEventPhoto && eventPhotoPath && !selectedEventFromWorld)"),end=source.indexOf('  if (session?.user?.id !== actionUserId) return;',start);assert(start>0&&end>start);
 const publish=source.slice(start,end);
 async function savedByPublish({fromWorld=false,event=false,edit=false,fail=false,withPhoto=true}={}){
  let saves=0;const context={publishKind:event?'event':'memo',selectedEventPhoto:withPhoto?photo:null,eventPhotoPath:'path',selectedEventFromWorld:fromWorld,selectedFromWorld:fromWorld,selectedCardPhoto:!event&&withPhoto?photo:null,cardPhotoUploadPath:withPhoto?'path':null,editId:edit?'card':null,publishedId:'card',actionUserId:f.owner,actionEpoch:1,selectedCardPhotoExpectedPath:'old',cardPhotoCache:new Map(),keepInWorldAlbum:()=>saves++,replacePublishedCardPhoto:async()=>{if(fail)throw new Error('save failed');},console:{warn(){}}};vm.createContext(context);await vm.runInContext('(async()=>{'+publish+'})()',context);return saves;
 }
 assert.equal(await savedByPublish(),1);assert.equal(await savedByPublish({edit:true}),1);assert.equal(await savedByPublish({event:true}),1);assert.equal(await savedByPublish({fromWorld:true}),0);assert.equal(await savedByPublish({withPhoto:false}),0);assert.equal(await savedByPublish({edit:true,fail:true}),0);
 console.log('PASS: Note attachment auto-save, private folder reuse, shared-folder isolation, publish/edit/event hooks, no duplicate album picks, failure and account guards');
})().catch(error=>{console.error(error);process.exitCode=1;});
