export const WHEEL_ORDER = Object.freeze([0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26]);
export const REDS = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
export const MAX_BET = 50000;
export const START_BALANCE = 10000;
export const MIN_SPIN_MS = 20000;
export const MAX_SPIN_MS = 30000;
export const COLOR = n => n === 0 ? 'green' : REDS.has(n) ? 'red' : 'black';
export const BETS = {};
for (let n=0;n<=36;n++) BETS[`n${n}`] = {label:String(n),numbers:[n],multiplier:36};
for(let n=1;n<=36;n++){
  if((n-1)%3<2)BETS[`split-${n}-${n+1}`]={label:`${n}·${n+1} 두 숫자`,numbers:[n,n+1],multiplier:18,type:'split'};
  if(n<=33)BETS[`split-${n}-${n+3}`]={label:`${n}·${n+3} 두 숫자`,numbers:[n,n+3],multiplier:18,type:'split'};
  if(n<=32&&(n-1)%3<2){const numbers=[n,n+1,n+3,n+4];BETS[`corner-${numbers.join('-')}`]={label:`${numbers.join('·')} 네 숫자`,numbers,multiplier:9,type:'corner'}}
}
for(let n=1;n<=3;n++)BETS[`split-0-${n}`]={label:`0·${n} 두 숫자`,numbers:[0,n],multiplier:18,type:'split'};
for(let c=1;c<=3;c++) BETS[`col${c}`]={label:`${c}열`,numbers:Array.from({length:12},(_,i)=>c+i*3),multiplier:3};
for(let d=1;d<=3;d++) BETS[`dozen${d}`]={label:`${(d-1)*12+1}–${d*12}`,numbers:Array.from({length:12},(_,i)=>(d-1)*12+1+i),multiplier:3};
for(const [id,label,predicate] of [
  ['red','빨강',n=>REDS.has(n)],['black','검정',n=>!REDS.has(n)],
  ['odd','홀수',n=>n%2===1],['even','짝수',n=>n%2===0],
  ['low','1–18',n=>n<=18],['high','19–36',n=>n>=19]
]) BETS[id]={label,numbers:Array.from({length:36},(_,i)=>i+1).filter(predicate),multiplier:2};
export function totalBets(bets){return Object.values(bets).reduce((sum,v)=>sum+v,0)}
export function cleanBets(input){
  const result={};
  if(!input || typeof input!=='object') return result;
  for(const [id,value] of Object.entries(input)) if(BETS[id] && Number.isSafeInteger(value) && value>0 && value%100===0 && value<=MAX_BET) result[id]=value;
  return totalBets(result)<=MAX_BET?result:{};
}
export function cleanChips(input,bets){
  const stacks={};
  for(const [id,amount]of Object.entries(bets)){
    const list=input?.[id];
    if(Array.isArray(list)&&list.length<=500&&list.every(n=>[100,500,1000,5000].includes(n))&&list.reduce((a,b)=>a+b,0)===amount){stacks[id]=[...list];continue}
    let left=amount;stacks[id]=[];for(const chip of [5000,1000,500,100])while(left>=chip){stacks[id].push(chip);left-=chip}
  }
  return stacks;
}
export function payout(bets,number){
  if(!Number.isInteger(number)||number<0||number>36) throw new Error('Invalid roulette result');
  const wins=Object.entries(cleanBets(bets)).filter(([id])=>BETS[id].numbers.includes(number)).map(([id,amount])=>({id,stake:amount,return:amount*BETS[id].multiplier}));
  const gross=wins.reduce((sum,w)=>sum+w.return,0),fee=Math.round(gross*.01);
  return {gross,fee,total:gross-fee,wins,stake:totalBets(bets)};
}
export function randomInt(max,source=globalThis.crypto){
  if(!Number.isSafeInteger(max)||max<1||max>0x100000000) throw new Error('Invalid range');
  const limit=Math.floor(0x100000000/max)*max;
  const buffer=new Uint32Array(1);let value;
  do{source.getRandomValues(buffer);value=buffer[0]}while(value>=limit);
  return value%max;
}
export function newSpin(bets,balance,previousDuration=null){
  const clean=cleanBets(bets),total=totalBets(clean);
  if(total===0||total>balance||total>MAX_BET) throw new Error('Invalid bet');
  const id=Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join('');
  let duration;do{duration=MIN_SPIN_MS+randomInt(MAX_SPIN_MS-MIN_SPIN_MS+1)}while(duration===previousDuration);
  return {id,number:randomInt(37),duration,bets:clean,startedAt:Date.now(),variation:randomInt(1000000)/1000000};
}
export function initialState(){return {version:1,balance:START_BALANCE,bets:{},betChips:{},lastBets:{},lastChips:{},history:[],rounds:0,pending:null,lastSettled:null,lastDuration:null,selectedChip:100,sound:true,reduced:false};}
export function normalizeState(raw){
  const s=initialState();if(!raw||raw.version!==1)return s;
  if(Number.isSafeInteger(raw.balance)&&raw.balance>=0&&raw.balance<=1e12)s.balance=raw.balance;
  s.bets=cleanBets(raw.bets);if(totalBets(s.bets)>s.balance)s.bets={};
  s.lastBets=cleanBets(raw.lastBets);
  s.betChips=cleanChips(raw.betChips,s.bets);s.lastChips=cleanChips(raw.lastChips,s.lastBets);
  s.history=Array.isArray(raw.history)?raw.history.filter(n=>Number.isInteger(n)&&n>=0&&n<=36).slice(0,30):[];
  s.rounds=Number.isSafeInteger(raw.rounds)&&raw.rounds>=0?raw.rounds:0;
  s.lastSettled=typeof raw.lastSettled==='string'?raw.lastSettled:null;
  s.lastDuration=Number.isInteger(raw.lastDuration)&&raw.lastDuration>=MIN_SPIN_MS&&raw.lastDuration<=MAX_SPIN_MS?raw.lastDuration:null;
  s.selectedChip=[100,500,1000,5000].includes(raw.selectedChip)?raw.selectedChip:100;
  s.sound=raw.sound!==false;s.reduced=raw.reduced===true;
  const p=raw.pending;
  // Already charged rounds from the previous 10–15 second version must still settle.
  const validDuration=p&&Number.isInteger(p.duration)&&((p.duration>=MIN_SPIN_MS&&p.duration<=MAX_SPIN_MS)||(p.duration>=10000&&p.duration<=15000));
  if(p&&validDuration&&typeof p.id==='string'&&p.id!==s.lastSettled&&Number.isInteger(p.number)&&p.number>=0&&p.number<=36&&Number.isFinite(p.startedAt)&&totalBets(cleanBets(p.bets))>0){
    s.pending={id:p.id,number:p.number,duration:p.duration,startedAt:p.startedAt,bets:cleanBets(p.bets),variation:Number.isFinite(p.variation)?Math.max(0,Math.min(1,p.variation)):0.5};s.pending.chips=cleanChips(p.chips,s.pending.bets);s.bets={};s.betChips={};

  }
  return s;
}
export function settleState(state,spinId){
  if(!state.pending||state.pending.id!==spinId||state.lastSettled===spinId)return null;
  const spin=state.pending,result=payout(spin.bets,spin.number);
  state.balance=Math.min(1e12,state.balance+result.total);
  state.lastSettled=spin.id;state.history.unshift(spin.number);state.history=state.history.slice(0,30);state.rounds++;state.pending=null;state.bets={};state.betChips={};
  return {...result,number:spin.number,net:result.total-result.stake,bets:spin.bets};
}

// Looking at a stopped round never changes the wallet. Acknowledgement is a
// separate action, so refresh/background tabs cannot silently pay it out.
export function pendingResult(state,spinId,now=Date.now()){
  const spin=state.pending;
  if(!spin||spin.id!==spinId||state.lastSettled===spinId||now<spin.startedAt+spin.duration)return null;
  const result=payout(spin.bets,spin.number);
  return {...result,number:spin.number,net:result.total-result.stake,bets:spin.bets};
}
export function confirmSpinResult(state,spinId,now=Date.now()){
  return pendingResult(state,spinId,now)?settleState(state,spinId):null;
}
