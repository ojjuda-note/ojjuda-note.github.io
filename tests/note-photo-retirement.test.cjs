const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {JSDOM}=require('jsdom'),root=path.join(__dirname,'..');
const source=fs.readFileSync(path.join(root,'note/preview.js'),'utf8');
const dom=new JSDOM(fs.readFileSync(path.join(root,'park/index.html'),'utf8'));
try{
 const $=selector=>dom.window.document.querySelector(selector),calls=[];
 for(const id of ['card','event'])$('#'+id+'-photo-file').click=()=>calls.push(id);
 const context=vm.createContext({$});
 const a=source.indexOf('function selectDevicePhoto('),b=source.indexOf('function closePhotoLightbox()',a);
 assert.ok(a>=0&&b>a);vm.runInContext(source.slice(a,b),context);
 const anchor=$('#card-photo-attach');anchor.hidden=false;
 context.selectDevicePhoto('card',anchor);assert.deepEqual(calls,['card']);
 anchor.setAttribute('aria-disabled','true');context.selectDevicePhoto('card',anchor);assert.equal(calls.length,1);
 anchor.removeAttribute('aria-disabled');$('#card-photo-file').disabled=true;context.selectDevicePhoto('card',anchor);assert.equal(calls.length,1);
 $('#card-photo-file').disabled=false;anchor.hidden=true;context.selectDevicePhoto('card',anchor);assert.equal(calls.length,1);
 anchor.hidden=false;context.selectDevicePhoto('event',anchor);assert.deepEqual(calls,['card','event']);
 assert.equal($('#event-world-photo'),null,'retired photo source is absent');
 assert.doesNotMatch(source,/keepInWorldAlbum|saveToWorldAlbum|pickFromWorldAlbum|from\(['"]media(?:_folders)?['"]\)/,'publication never writes into the retired album');
 assert.match(source,/await replacePublishedCardPhoto\(publishedId/,'existing card photo replacement remains active');
 const integration=fs.readFileSync(path.join(root,'park/integration.js'),'utf8');
 assert.doesNotMatch(integration,/worldPicker|sourceMenu|closePhotoSourceMenu/,'navigation never references removed picker globals');
 console.log('PASS: device photo selection, disabled/hidden controls, card/event inputs, retained replacement and no retired album reads/writes');
}finally{dom.window.close();}
