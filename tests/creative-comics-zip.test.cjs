const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom'),zip=require('../vendor/zip-2.23.0.min.js');
const root=path.join(__dirname,'..'),read=file=>fs.readFileSync(path.join(root,file),'utf8');
const png=Uint8Array.from([137,80,78,71,13,10,26,10,0,0,0,0]);
const wait=()=>new Promise(resolve=>setTimeout(resolve,5));
async function until(fn){for(let n=0;n<250;n++){if(fn())return;await wait();}throw Error('condition timed out');}
async function pack(items,name='악진 1화.zip',options={}){
 const writer=new zip.ZipWriter(new zip.BlobWriter('application/zip'),{useWebWorkers:false});
 for(const item of items){const [filename,bytes=png]=Array.isArray(item)?item:[item];await writer.add(filename,new zip.Uint8ArrayReader(bytes),{level:6,...options});}
 return new File([await writer.close()],name,{type:'application/zip'});
}
function setup({admin=true,allowed=true}={}){
 const dom=new JSDOM(read('comics/index.html'),{url:'https://test.local/comics/',runScripts:'outside-only'}),w=dom.window;
 for(const [key,value] of Object.entries({File,Blob,WritableStream,TextDecoder,AbortController,zip}))w[key]=value;
 w.URL.createObjectURL=()=> 'blob:test';w.URL.revokeObjectURL=()=>{};
 w.Image=class{naturalWidth=80;naturalHeight=120;async decode(){if(state.onDecode)await state.onDecode();}};
 w.ResizeObserver=class{observe(){}};w.IntersectionObserver=class{observe(){}disconnect(){}};
 w.HTMLElement.prototype.scrollTo=function(){};w.HTMLElement.prototype.scrollIntoView=function(){};w.confirm=()=>true;
 const state={admin,allowed,books:[],pages:[],uploads:[],events:[],user:{id:'00000000-0000-4000-8000-000000000001'}};
 const client={auth:{getUser:async()=>({data:{user:state.user}}),onAuthStateChange:fn=>{state.auth=fn;}},
  rpc:async(name,payload)=>{
   if(name==='comics_save_edit'){state.edited=payload;return{data:1};}
   return{data:{allowed:state.allowed,admin:state.admin}};
  },from(table){
   let action='select',value,one=false,filters=[];
   const q={select(){return q;},eq(k,v){filters.push([k,v]);return q;},single(){one=true;return q;},order(){return q;},insert(v){action='insert';value=v;return q;},update(v){action='update';value=v;return q;},delete(){action='delete';return q;},then(done){
    const list=table==='creative_comics'?state.books:state.pages;let rows=list.filter(x=>filters.every(([k,v])=>x[k]===v));
    if(action!=='select')state.events.push({table,action,value});
    if(action==='insert'){const row={id:w.crypto.randomUUID(),published:false,...value};list.push(row);rows=[row];}
    if(action==='update')for(const row of rows)Object.assign(row,value);
    if(action==='delete')for(const row of rows){list.splice(list.indexOf(row),1);if(table==='creative_comics')state.pages=state.pages.filter(p=>p.comic_id!==row.id);}
    return Promise.resolve({data:one?rows[0]:rows}).then(done);
   }};return q;
  },storage:{from(){return{
   async upload(p,file,options){
    assert.equal(state.books.some(b=>b.published),false,'all pages upload before first publication');
    if(state.failUpload===file.name){state.failUpload=null;return{error:Error('offline')};}
    state.uploads.push({name:file.name,bytes:new Uint8Array(await file.arrayBuffer()),options,path:p});return{data:{path:p}};
   },remove:async paths=>{state.removed=paths;return{data:[]};},download:async()=>({data:new Blob([png])})
  };}}};
 w.OJJUDA_CONFIG={supabaseUrl:'https://test.local',supabaseKey:'test'};w.supabase={createClient:()=>client};
 for(const file of ['comics/archive.js','comics/edit.js','comics/app.js'])w.eval(read(file));
 const $=id=>w.document.getElementById(id);
 function select(input,files){Object.defineProperty(input,'files',{value:files,configurable:true});input.dispatchEvent(new w.Event('change'));}
 return{dom,w,state,$,client,select,close:()=>w.close()};
}
function changeSize(bytes,size){const data=Buffer.from(bytes);for(let i=0;i<data.length-46;i++){const sig=data.readUInt32LE(i);if(sig===0x04034b50)data.writeUInt32LE(size,i+22);if(sig===0x02014b50)data.writeUInt32LE(size,i+24);}return data;}
function stored(name,data=png){
 let crc=0xffffffff;for(const byte of data){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}crc=(crc^0xffffffff)>>>0;
 const local=Buffer.alloc(30),central=Buffer.alloc(46),end=Buffer.alloc(22);
 local.writeUInt32LE(0x04034b50);local.writeUInt16LE(20,4);local.writeUInt32LE(crc,14);local.writeUInt32LE(data.length,18);local.writeUInt32LE(data.length,22);local.writeUInt16LE(name.length,26);
 central.writeUInt32LE(0x02014b50);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt32LE(crc,16);central.writeUInt32LE(data.length,20);central.writeUInt32LE(data.length,24);central.writeUInt16LE(name.length,28);
 end.writeUInt32LE(0x06054b50);end.writeUInt16LE(1,8);end.writeUInt16LE(1,10);end.writeUInt32LE(central.length+name.length,12);end.writeUInt32LE(local.length+name.length+data.length,16);
 return new File([local,name,data,central,name,end],'legacy.zip');
}

(async()=>{
 // The real vendored reader, including its JS decompression fallback.
 const x=setup();try{
  const file=await pack(['pages/41-1.png','pages/40-1.png','pages/41.png','pages/40.png','__MACOSX/._40.png',['README.txt',new Uint8Array([1])]]);
  await until(()=>!x.$('shelf').hidden);x.$('uploadOpen').click();
  x.select(x.$('zipInput'),[file]);x.select(x.$('zipInput'),[file]);
  await until(()=>x.state.books[0]?.published&&!x.$('publish').disabled);
  assert.equal(x.state.books.length,1,'a second selection while uploading cannot duplicate the comic');
  assert.equal(x.state.books[0].title,'악진 1화');
  assert.deepEqual(x.state.uploads.map(f=>f.name),['40.png','40-1.png','41.png','41-1.png']);
  assert.deepEqual(x.state.pages.map(p=>p.position),[1,2,3,4]);
  assert.ok(x.state.uploads.every(f=>Buffer.from(f.bytes).equals(Buffer.from(png))),'original bytes and quality are preserved');
  assert.ok(x.state.uploads.every(f=>f.options.contentType==='image/png'&&!f.path.endsWith('.zip')));
  assert.equal(x.state.events.filter(e=>e.value?.published===true).length,1);
  assert.equal(x.$('title').value,'');assert.equal(x.$('zipInput').disabled,false);
 }finally{x.close();}

 const helper=setup();try{
  const api=helper.w.OjjudaComicArchive;
  zip.configure({useCompressionStream:false,useWebWorkers:false});
  const file=await pack(['한글/2.png','한글/1.png'],'단편.cbz');
  const archive=await api.open(file);
  assert.deepEqual(Array.from(archive.pages,p=>p.name),['1.png','2.png']);
  for(let n=0;n<2;n++)assert.deepEqual(new Uint8Array(await (await archive.pages[0].read()).arrayBuffer()),png,'preview/retry can read the same entry again');
  await archive.close();await assert.rejects(()=>archive.pages[0].read(),/다시 선택/);
  zip.configure({useCompressionStream:true});
  const legacy=await api.open(stored(Buffer.from('b8b8c8ad2f312e706e67','hex')));assert.equal(legacy.pages[0].orderName,'만화/1.png');await legacy.close();
  const relative=await api.open(stored(Buffer.from('./pages/1.png')));assert.equal(relative.pages.length,1);await relative.close();
  await assert.rejects(()=>api.open(stored(Buffer.from('../1.png'))),/손상/);
  await assert.rejects(()=>api.open(new File(['broken'],'broken.zip')),/손상/);
  await assert.rejects(()=>api.open(awaitableRar()),/ZIP 또는 CBZ/);
  await assert.rejects(async()=>api.open(await pack([['notes.txt',png]])),/이미지가 없/);
  await assert.rejects(async()=>api.open(await pack(['1.png','2.png']),{maxPages:1}),/500장/);
  await assert.rejects(async()=>api.open(await pack(['1.png'],'locked.zip',{password:'secret'})),/암호/);
  const simple=await pack(['1.png']),bytes=new Uint8Array(await simple.arrayBuffer());
  await assert.rejects(()=>api.open(new File([changeSize(bytes,20971521)],'large.zip')),/20MB/);
  const bomb=await api.open(new File([changeSize(bytes,1)],'bad-size.zip'));
  await assert.rejects(()=>bomb.pages[0].read(),/손상|용량/);await bomb.close();
  const corrupt=Buffer.from(bytes);const local=corrupt.indexOf(Buffer.from([0x50,0x4b,0x03,0x04]));const start=local+30+corrupt.readUInt16LE(local+26)+corrupt.readUInt16LE(local+28);corrupt[start]^=255;
  const damaged=await api.open(new File([corrupt],'damaged.zip'));await assert.rejects(()=>damaged.pages[0].read(),/손상/);await damaged.close();
  const control=new AbortController();control.abort();await assert.rejects(()=>api.open(simple,{signal:control.signal}),e=>e.name==='AbortError');
 }finally{helper.close();}

 const loader=setup();try{
  delete loader.w.zip;
  for(const [key,value] of Object.entries({ReadableStream,TransformStream,CompressionStream,DecompressionStream,Response,TextEncoder}))loader.w[key]=value;
  let attempts=0;const append=loader.w.document.head.append.bind(loader.w.document.head);
  loader.w.document.head.append=node=>{append(node);if(node.tagName==='SCRIPT'){
   assert.equal(node.getAttribute('src'),'/vendor/zip-2.23.0.min.js');
   queueMicrotask(()=>{if(++attempts===1)node.onerror();else{loader.w.eval(read('vendor/zip-2.23.0.min.js'));node.onload();}});
  }};
  const file=await pack(['1.png']);
  await assert.rejects(()=>loader.w.OjjudaComicArchive.open(file),/불러오지 못/);
  const archive=await loader.w.OjjudaComicArchive.open(file);assert.equal((await archive.pages[0].read()).size,png.length);await archive.close();
  assert.equal(attempts,2,'the real lazy-loaded browser bundle can recover after a failed download');
 }finally{loader.close();}

 // A storage failure leaves no public half-comic; retry reuses the ZIP selection.
 const retry=setup();try{
  await until(()=>!retry.$('shelf').hidden);retry.$('uploadOpen').click();retry.$('title').value='내 제목';retry.$('description').value='설명';retry.state.failUpload='2.png';
  retry.select(retry.$('zipInput'),[await pack(['1.png','2.png'])]);
  await until(()=>retry.$('uploadStatus').textContent.includes('완료하지 못')&&!retry.$('publish').disabled);
  assert.equal(retry.state.books.length,0);assert.equal(retry.state.pages.length,0);assert.equal(retry.state.events.some(e=>e.value?.published===true),false);
  retry.$('uploadForm').dispatchEvent(new retry.w.Event('submit',{cancelable:true}));
  await until(()=>retry.state.books[0]?.published);assert.equal(retry.state.books[0].title,'내 제목');assert.equal(retry.state.books[0].description,'설명');
  assert.deepEqual(retry.state.pages.map(p=>p.filename),['1.png','2.png']);
 }finally{retry.close();}

 // Session changes during image validation must stop storage writes and clear files.
 const switched=setup();try{
  await until(()=>!switched.$('shelf').hidden);switched.$('uploadOpen').click();let release;
  switched.state.onDecode=()=>new Promise(resolve=>{release=resolve;});
  switched.select(switched.$('zipInput'),[await pack(['1.png','2.png'])]);await until(()=>!!release);
  switched.state.allowed=false;switched.state.admin=false;switched.state.auth('SIGNED_OUT',null);release();
  await until(()=>!switched.$('gate').hidden&&!switched.$('publish').disabled);
  assert.equal(switched.state.uploads.length,0);assert.equal(switched.state.books.some(b=>b.published),false);assert.equal(switched.$('fileList').children.length,0);
 }finally{switched.close();}
 const denied=setup({admin:false});try{
  await until(()=>!denied.$('shelf').hidden);denied.select(denied.$('zipInput'),[await pack(['1.png'])]);await wait();assert.equal(denied.state.events.length,0);
 }finally{denied.close();}

 // ZIP pages also append to an existing comic without changing it before Save.
 const edit=setup();try{
  edit.state.books.push({id:'book',title:'기존 만화',revision:1,series_order:1});edit.state.pages.push({id:'old',comic_id:'book',filename:'0.png',path:'old',width:80,height:120,position:1});
  await until(()=>edit.w.document.querySelector('.book'));
  [...edit.w.document.querySelectorAll('.book button')].find(b=>b.textContent==='수정').click();
  await until(()=>edit.w.document.querySelector('#editComic input[multiple]'));
  const picker=edit.w.document.querySelector('#editComic input[multiple]');edit.select(picker,[await pack(['2.png','1.png'])]);
  await until(()=>edit.w.document.querySelectorAll('.edit-page').length===3);
  assert.equal(edit.state.pages.length,1);assert.equal(edit.state.uploads.length,0);
  edit.w.document.querySelector('#editComic form').dispatchEvent(new edit.w.Event('submit',{cancelable:true}));
  await until(()=>!!edit.state.edited);
  assert.deepEqual(edit.state.uploads.map(f=>f.name),['1.png','2.png']);assert.equal(edit.state.edited.p_pages[0].id,'old');
 }finally{edit.close();}
 console.log('PASS: actual ZIP/CBZ auto-publication, original bytes, page order, metadata filtering, JS fallback, repeated reads, archive corruption/size/count/password limits, failed-upload cleanup/retry, logout/admin guards and ZIP editor append');
})().catch(error=>{console.error(error);process.exitCode=1;});
function awaitableRar(){return new File(['rar'],'comic.rar');}
