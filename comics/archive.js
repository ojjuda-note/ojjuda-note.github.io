/* Read one original image at a time; ZIP bytes never enter public storage. */
(()=>{
'use strict';
const MAX_FILE=20*1024*1024,MAX_ARCHIVE=1024*1024*1024,MAX_ENTRIES=5000;
const mime={png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp'};
let loading;
function fail(message){const error=new Error(message);error.comicArchive=true;return error;}
function check(signal){if(signal?.aborted)throw new DOMException('작업을 취소했어요.','AbortError');}
function isArchive(file){return /\.(zip|cbz)$/i.test(file.name);}
function load(){
 if(window.zip?.ZipReader)return Promise.resolve(window.zip);
 if(!loading)loading=new Promise((resolve,reject)=>{
  const script=document.createElement('script');script.src='/vendor/zip-2.23.0.min.js';
  script.onload=()=>window.zip?.ZipReader?resolve(window.zip):failed();
  function failed(){script.remove();loading=null;reject(fail('압축파일 기능을 불러오지 못했어요. 연결을 확인하고 다시 선택해 주세요.'));}
  script.onerror=failed;document.head.append(script);
 });
 return loading;
}
function legacyName(bytes,encoding){
 if(encoding.toLowerCase()==='utf-8')return;
 try{return new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{}
 try{return new TextDecoder('euc-kr',{fatal:true}).decode(bytes);}catch{}
}
function archiveError(error){
 if(error.comicArchive||error.name==='AbortError')return error;
 if(/encrypt|password/i.test(error.message))return fail('암호가 걸린 ZIP은 올릴 수 없어요. 암호 없이 다시 압축해 주세요.');
 return fail('압축파일이 손상되었거나 지원하지 않는 방식이에요. 이미지를 ZIP으로 다시 압축해 주세요.');
}
async function open(file,{compare,signal,onProgress=()=>{},maxPages=500}={}){
 check(signal);
 if(!isArchive(file))throw fail('ZIP 또는 CBZ 압축파일을 선택해 주세요.');
 if(!file.size||file.size>MAX_ARCHIVE)throw fail('ZIP 파일은 1GB 이하로 올려 주세요.');
 const zip=await load();check(signal);
 const control=new AbortController(),abort=()=>control.abort();signal?.addEventListener('abort',abort,{once:true});
 const reader=new zip.ZipReader(new zip.BlobReader(file),{useWebWorkers:false,checkCrc32:true,checkOverlappingEntry:true,strictness:'strict',filenameValidation:'balanced',decodeText:legacyName,signal:control.signal});
 let closed=false;
 const close=async()=>{if(closed)return;closed=true;control.abort();await reader.close();};
 try{
  const entries=[];let count=0,total=0,ignored=0;
  for await(const entry of reader.getEntriesGenerator()){
   check(signal);if(++count>MAX_ENTRIES)throw fail('ZIP 안의 파일이 너무 많아요. 만화 이미지만 담아 다시 압축해 주세요.');
   const path=entry.filename.replace(/\\/g,'/').split('/').filter(part=>part!=='.').join('/'),parts=path.split('/');
   if(entry.directory||parts.some(p=>p==='__MACOSX'||p.startsWith('.'))){ignored++;continue;}
   const name=parts.at(-1),ext=name.split('.').at(-1).toLowerCase();
   if(!mime[ext]){ignored++;continue;}
   if(entry.encrypted)throw fail('암호가 걸린 ZIP은 올릴 수 없어요. 암호 없이 다시 압축해 주세요.');
   if(!Number.isSafeInteger(entry.uncompressedSize)||entry.uncompressedSize<=0||entry.uncompressedSize>MAX_FILE)throw fail('한 장의 용량은 20MB 이하여야 해요: '+name);
   if([...name].length>255)throw fail('이미지 파일 이름이 너무 길어요. 짧게 바꿔 주세요.');
   if((total+=entry.uncompressedSize)>MAX_ARCHIVE)throw fail('압축을 푼 이미지의 전체 용량은 1GB 이하여야 해요.');
   entries.push({entry,path,name,mime:mime[ext]});
   if(entries.length>maxPages)throw fail('한 만화에는 최대 500장까지 넣을 수 있어요.');
   onProgress(entries.length);
  }
  if(!entries.length)throw fail('ZIP 안에 PNG, JPG, WEBP 만화 이미지가 없어요.');
  entries.sort((a,b)=>compare?compare({name:a.path},{name:b.path}):a.path.localeCompare(b.path,'ko',{numeric:true}));
  const pages=entries.map(({entry,path,name,mime})=>({name,orderName:path,size:entry.uncompressedSize,async read({signal:readSignal}={}){
   check(readSignal);if(closed)throw fail('압축파일을 다시 선택해 주세요.');
   const stop=()=>control.abort();readSignal?.addEventListener('abort',stop,{once:true});
   let size=0;const chunks=[];
   try{
    await entry.getData(new WritableStream({write(chunk){
     size+=chunk.byteLength;
     if(size>entry.uncompressedSize||size>MAX_FILE)throw fail('압축 안의 이미지 용량이 올바르지 않아요: '+name);
     chunks.push(chunk);
    }}),{signal:control.signal});
    check(readSignal);if(size!==entry.uncompressedSize)throw fail('압축 안의 이미지가 손상되었어요: '+name);
    return new File(chunks,name,{type:mime,lastModified:entry.lastModDate?.getTime()||file.lastModified});
   }catch(error){throw archiveError(error);}
   finally{chunks.length=0;readSignal?.removeEventListener('abort',stop);}
  }}));
  return {pages,ignored,title:file.name.replace(/\.(zip|cbz)$/i,'').trim().slice(0,120),close};
 }catch(error){await close();throw archiveError(error);}
 finally{signal?.removeEventListener('abort',abort);}
}
window.OjjudaComicArchive={isArchive,open,materialize:(page,options)=>page.read?page.read(options):Promise.resolve(page)};
})();
