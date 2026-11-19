export type SignalOffer={id:string;quantity:number;price:number;revision:number};
export type SignalCounts={coins:number;freeRemaining:number;paidRemaining:number;remaining:number};
export type SignalWallet=SignalCounts&{purchasingEnabled:boolean;offers:SignalOffer[]};
export type PendingSignalPurchase={userId:string;requestId:string;pack:string;quantity:number;price:number;revision:number};
export type SignalReceipt=SignalCounts&{requestId:string;pack:string;quantity:number;price:number;revision:number;charged:number;replayed:boolean};

const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const packId=/^[a-z0-9_]{1,64}$/;
export const nonnegativeInteger=(value:unknown):value is number=>typeof value==="number"&&Number.isSafeInteger(value)&&value>=0;
const positiveInteger=(value:unknown):value is number=>nonnegativeInteger(value)&&value>0;
function counts(value:any):SignalCounts|null {
  if(!value||![value.coins,value.freeRemaining,value.paidRemaining,value.remaining].every(nonnegativeInteger)||
    value.freeRemaining>3||value.freeRemaining+value.paidRemaining!==value.remaining)return null;
  return {coins:value.coins,freeRemaining:value.freeRemaining,paidRemaining:value.paidRemaining,remaining:value.remaining};
}
function offer(value:any):value is SignalOffer {
  return !!value&&typeof value.id==="string"&&packId.test(value.id)&&
    positiveInteger(value.quantity)&&positiveInteger(value.price)&&positiveInteger(value.revision);
}
export function readSignalWallet(value:any):SignalWallet|null {
  const balance=counts(value);
  if(value?.ok!==true||!balance||typeof value.purchasingEnabled!=="boolean"||!Array.isArray(value.offers)||
    value.offers.length>30||!value.offers.every(offer)||new Set(value.offers.map((x:SignalOffer)=>x.id)).size!==value.offers.length)return null;
  return {...balance,purchasingEnabled:value.purchasingEnabled,
    offers:value.purchasingEnabled?value.offers.map(({id,quantity,price,revision}:SignalOffer)=>({id,quantity,price,revision})):[]};
}
export function readSignalReceipt(value:any,pending:PendingSignalPurchase):SignalReceipt|null {
  const balance=counts(value);
  if(value?.ok!==true||!balance||value.requestId!==pending.requestId||value.pack!==pending.pack||
    value.quantity!==pending.quantity||value.price!==pending.price||value.revision!==pending.revision||typeof value.replayed!=="boolean"||
    value.charged!==(value.replayed?0:pending.price))return null;
  return {...balance,requestId:value.requestId,pack:value.pack,quantity:value.quantity,price:value.price,revision:value.revision,
    charged:value.charged,replayed:value.replayed};
}

const memory=new Map<string,PendingSignalPurchase|null>();
const key=(userId:string)=>"pajang:signal-purchase:"+userId;
function validPending(value:any,userId:string):value is PendingSignalPurchase {
  return value?.userId===userId&&typeof value.requestId==="string"&&uuid.test(value.requestId)&&
    offer({id:value.pack,quantity:value.quantity,price:value.price,revision:value.revision});
}
export function pendingSignalPurchase(userId:string):PendingSignalPurchase|null {
  // A failed storage write must not replace this page's newer request with an
  // older cached UUID. A cleared in-memory entry also acts as a tombstone.
  if(memory.has(userId))return memory.get(userId)??null;
  try {
    const saved=JSON.parse(sessionStorage.getItem(key(userId))||"null");
    if(validPending(saved,userId)){memory.set(userId,saved);return saved;}
  }catch{/* A blocked cache must not prevent read-only recovery in this page. */}
  return memory.get(userId)??null;
}
export function saveSignalPurchase(value:PendingSignalPurchase) {
  memory.set(value.userId,value);
  try{sessionStorage.setItem(key(value.userId),JSON.stringify(value));}catch{/* Memory still preserves this attempt. */}
}
export function clearSignalPurchase(value:PendingSignalPurchase) {
  if(pendingSignalPurchase(value.userId)?.requestId!==value.requestId)return;
  memory.set(value.userId,null);
  try{sessionStorage.removeItem(key(value.userId));}catch{/* The successful receipt can safely be read again. */}
}
