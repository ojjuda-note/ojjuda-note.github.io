/* Coupon images stay in this browser. Only pinned OCR/barcode runtimes and
 * language models are downloaded; no image, coupon number, or OCR text is sent. */
(() => {
 'use strict';
 const TESSERACT_WORKER='https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/worker.min.js';
 const TESSERACT_CORE='https://cdn.jsdelivr.net/npm/tesseract.js-core@7.0.0';
 const TESSERACT_LANG='https://tessdata.projectnaptha.com/4.0.0_fast';
 const ZXING_SCRIPT='https://cdn.jsdelivr.net/npm/zxing-wasm@3.1.6/dist/iife/reader/index.js';
 const ZXING_WASM='https://cdn.jsdelivr.net/npm/zxing-wasm@3.1.6/dist/reader/zxing_reader.wasm';
 const MAX_BYTES=5*1024*1024,MAX_PIXELS=4000000,MAX_SIDE=3000,TIMEOUT=90000;
 const NATIVE_FORMATS=['code_128','code_39','code_93','itf','codabar','ean_13','ean_8','upc_a','upc_e','qr_code','data_matrix','pdf417','aztec'];
 let nextJob=0;
 const failure=(code,name='Error')=>Object.assign(new Error(code),{code,name});
 const abortReason=signal=>signal.reason?.name==='TimeoutError'?failure('reader_timeout','TimeoutError'):failure('reader_aborted','AbortError');
 function check(signal){if(signal.aborted)throw abortReason(signal);}
 function abortable(promise,signal){
  if(signal.aborted){Promise.resolve(promise).catch(()=>{});return Promise.reject(abortReason(signal));}
  return new Promise((resolve,reject)=>{
   const abort=()=>{cleanup();reject(abortReason(signal));};
   const cleanup=()=>signal.removeEventListener('abort',abort);
   signal.addEventListener('abort',abort,{once:true});
   Promise.resolve(promise).then(value=>{cleanup();resolve(value);},error=>{cleanup();reject(error);});
  });
 }
 function deadline(promise,ms,signal){
  let timer;
  return abortable(Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(failure('stage_timeout')),ms);})]),signal).finally(()=>clearTimeout(timer));
 }
 function report(callback,text,signal){if(!signal.aborted&&typeof callback==='function')callback(text);}
 function codes(results){
  return [...new Set((results||[]).map(result=>String(result?.rawValue??result?.text??'').trim())
   .filter(value=>/^[A-Z0-9][A-Z0-9\s-]{5,99}$/i.test(value))
   .map(value=>value.replace(/[\s-]/g,'').toUpperCase()).filter(value=>/^[A-Z0-9]{6,80}$/.test(value)))];
 }
 async function canvasFor(file,signal){
  if(!file||!['image/png','image/jpeg','image/webp'].includes(file.type)||!file.size||file.size>MAX_BYTES)throw failure('invalid_image');
  const header=new Uint8Array(await abortable(file.slice(0,16).arrayBuffer(),signal));
  const png=header[0]===137&&header[1]===80&&header[2]===78&&header[3]===71;
  const jpeg=header[0]===255&&header[1]===216&&header[2]===255;
  const webp=String.fromCharCode(...header.slice(0,4))==='RIFF'&&String.fromCharCode(...header.slice(8,12))==='WEBP';
  if(!png&&!jpeg&&!webp)throw failure('invalid_image');
  if(png&&header.length>=16){
   const dimensions=new DataView(await abortable(file.slice(16,24).arrayBuffer(),signal));
   if(dimensions.byteLength<8||dimensions.getUint32(0)*dimensions.getUint32(4)>60000000)throw failure('image_too_large');
  }
  const url=URL.createObjectURL(file),image=new Image();
  try{
   await abortable(new Promise((resolve,reject)=>{
    image.onload=resolve;image.onerror=()=>reject(failure('invalid_image'));image.src=url;
   }),signal);
   check(signal);
   const width=image.naturalWidth,height=image.naturalHeight;
   if(!width||!height||width*height>60000000)throw failure('image_too_large');
   const scale=Math.min(2,Math.max(1,1400/width),MAX_SIDE/Math.max(width,height),Math.sqrt(MAX_PIXELS/(width*height)));
   const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));
   const context=canvas.getContext('2d',{willReadFrequently:true});
   if(!context)throw failure('reader_unavailable');
   context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);
   context.drawImage(image,0,0,canvas.width,canvas.height);
   return canvas;
  }finally{image.onload=null;image.onerror=null;image.src='';URL.revokeObjectURL(url);}
 }
 function workerClient(source,signal,onProgress){
  check(signal);
  const url=URL.createObjectURL(new Blob([source],{type:'application/javascript'}));
  let worker;
  try{worker=new Worker(url);}catch{URL.revokeObjectURL(url);throw failure('reader_unavailable');}
  const pending=new Map();let closed=null;
  const close=(reason=failure('reader_aborted','AbortError'))=>{
   if(closed)return;closed=reason;signal.removeEventListener('abort',abort);
   worker.terminate();URL.revokeObjectURL(url);
   for(const job of pending.values())job.reject(reason);pending.clear();
  };
  const abort=()=>close(abortReason(signal));
  signal.addEventListener('abort',abort,{once:true});
  worker.onerror=event=>{event.preventDefault?.();close(failure('reader_unavailable'));};
  worker.onmessage=({data})=>{
   if(closed||signal.aborted)return;
   if(data?.status==='progress'){onProgress?.(data.data);return;}
   const job=pending.get(data?.jobId);if(!job)return;
   pending.delete(data.jobId);
   if(data.status==='resolve')job.resolve(data.data);else job.reject(failure('recognition_failed'));
  };
  return {close,call(action,payload,transfer=[]){
   if(closed)return Promise.reject(closed);check(signal);
   const jobId='coupon-'+(++nextJob);
   return new Promise((resolve,reject)=>{
    pending.set(jobId,{resolve,reject});
    try{worker.postMessage({workerId:'coupon-reader',jobId,action,payload},transfer);}
    catch{pending.delete(jobId);reject(failure('recognition_failed'));}
   });
  }};
 }
 async function nativeCodes(canvas,signal){
  if(typeof window.BarcodeDetector!=='function')return [];
  try{
   return await deadline((async()=>{
    const supported=await BarcodeDetector.getSupportedFormats();
    check(signal);const formats=NATIVE_FORMATS.filter(format=>supported.includes(format));
    if(!formats.length)return [];
    return codes(await new BarcodeDetector({formats}).detect(canvas));
   })(),4000,signal);
  }catch(error){check(signal);return [];}
 }
 async function wasmCodes(canvas,signal){
  const source=`importScripts(${JSON.stringify(ZXING_SCRIPT)});
ZXingWASM.prepareZXingModule({overrides:{locateFile:path=>{if(path.endsWith('.wasm'))return ${JSON.stringify(ZXING_WASM)};throw Error('unexpected_runtime_file');},print:()=>{},printErr:()=>{}}});
self.onmessage=async({data})=>{try{const results=await ZXingWASM.readBarcodes(data.payload.image,{formats:['AllLinear','QRCode','DataMatrix','PDF417','Aztec'],tryHarder:true,tryRotate:true,tryInvert:true,maxNumberOfSymbols:8});self.postMessage({jobId:data.jobId,status:'resolve',data:results.map(x=>({text:x.text,format:x.format}))});}catch{self.postMessage({jobId:data.jobId,status:'reject'});}};`;
  const worker=workerClient(source,signal);
  try{
   const image=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height);
   return codes(await deadline(worker.call('read',{image},[image.data.buffer]),18000,signal));
  }finally{worker.close();}
 }
 async function ocrText(canvas,signal,onProgress){
  // Use the pinned worker's message protocol (the same actions/payloads as
  // Tesseract.js 7.0.0 createWorker). Holding the native Worker immediately is
  // essential: cancellation must stop downloads/initialization as well as OCR.
  const worker=workerClient(`importScripts(${JSON.stringify(TESSERACT_WORKER)});`,signal,data=>{
   if(data?.status==='recognizing text')report(onProgress,'사용기한을 읽고 있어요. '+Math.round(Math.max(0,Math.min(1,Number(data.progress)||0))*100)+'%',signal);
  });
  try{
   report(onProgress,'문자 인식을 준비하고 있어요. 처음에는 조금 걸릴 수 있어요.',signal);
   await worker.call('load',{options:{lstmOnly:true,corePath:TESSERACT_CORE,logging:false}});
   await worker.call('loadLanguage',{langs:'kor+eng',options:{langPath:TESSERACT_LANG,cachePath:'ojjuda-coupon-ocr-v1',cacheMethod:'write',gzip:true,lstmOnly:true}});
   await worker.call('initialize',{langs:'kor+eng',oem:1,config:{}});
   await worker.call('setParameters',{params:{tessedit_pageseg_mode:'11',preserve_interword_spaces:'1',user_defined_dpi:'300'}});
   check(signal);
   const blob=await abortable(new Promise(resolve=>canvas.toBlob(resolve,'image/png')),signal);
   if(!blob)throw failure('invalid_image');
   const bytes=new Uint8Array(await abortable(blob.arrayBuffer(),signal));
   report(onProgress,'사용기한을 읽고 있어요.',signal);
   const result=await worker.call('recognize',{image:bytes,options:{rotateAuto:true},output:{text:true}},[bytes.buffer]);
   return String(result?.text||'');
  }finally{worker.close();}
 }
 async function read(file,{signal:external,onProgress}={}){
  const controller=new AbortController(),signal=controller.signal;
  const forward=()=>controller.abort(external?.reason?.name==='TimeoutError'?failure('reader_timeout','TimeoutError'):failure('reader_aborted','AbortError'));
  if(external?.aborted)forward();else external?.addEventListener('abort',forward,{once:true});
  const timer=setTimeout(()=>controller.abort(failure('reader_timeout','TimeoutError')),TIMEOUT);
  let canvas;
  try{
   check(signal);report(onProgress,'상품권 이미지를 확인하고 있어요.',signal);
   canvas=await canvasFor(file,signal);
   report(onProgress,'바코드를 읽고 있어요.',signal);
   let detected=await nativeCodes(canvas,signal),text='',ocrFailed=false;
   const warnings=[];
   if(!detected.length){try{detected=await wasmCodes(canvas,signal);}catch{check(signal);warnings.push('barcode_unavailable');}}
   try{text=await ocrText(canvas,signal,onProgress);}catch{check(signal);ocrFailed=true;warnings.push('text_unavailable');}
   check(signal);
   const parse=window.OjjudaCouponParser?.parseCouponText;
   if(typeof parse!=='function')throw failure('reader_unavailable');
   const parsed=parse(text)||{},parsedCode=String(parsed.code||'');
   let code='';
   if(detected.length===1){code=detected[0];if(parsedCode&&parsedCode!==code)warnings.push('barcode_text_mismatch');}
   else if(detected.length>1){if(parsedCode&&detected.includes(parsedCode))code=parsedCode;else warnings.push('multiple_barcodes');}
   else code=parsedCode;
   if(!code&&ocrFailed)throw failure('reader_unavailable');
   return {code,expires:String(parsed.expires||''),warnings:[...new Set([...warnings,...(Array.isArray(parsed.warnings)?parsed.warnings:[])])]};
  }finally{
   clearTimeout(timer);external?.removeEventListener('abort',forward);
   controller.abort();if(canvas){canvas.width=1;canvas.height=1;}
  }
 }
 window.OjjudaCouponReader=Object.freeze({read});
})();
