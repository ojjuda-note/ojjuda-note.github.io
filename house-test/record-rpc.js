export function createRecordRPC(port){
 let next=0,disposed=false;const pending=new Map();
 const receive=event=>{const data=event.data;if(data?.type!=='records-result')return;const wait=pending.get(data.id);if(!wait)return;pending.delete(data.id);clearTimeout(wait.timer);data.error?wait.reject(new Error(data.error)):wait.resolve(data.result);};
 port.addEventListener('message',receive);port.start();
 return {request(action,args={}){if(disposed)return Promise.reject(new DOMException('Closed','AbortError'));return new Promise((resolve,reject)=>{const id=++next,timer=setTimeout(()=>{pending.delete(id);reject(new Error('응답이 늦어지고 있어요. 앨범을 새로고침해 주세요.'));},120000);pending.set(id,{resolve,reject,timer});port.postMessage({type:'records-request',id,action,args});});},dispose(){disposed=true;port.removeEventListener('message',receive);for(const wait of pending.values()){clearTimeout(wait.timer);wait.reject(new DOMException('Closed','AbortError'));}pending.clear();}};
}
