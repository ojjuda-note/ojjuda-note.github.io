const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../games/ttang.html'),'utf8');
const source=html.slice(html.indexOf('function handleEvents(){'),html.indexOf('// ---------- 그리기 ----------'));
function fixture(){
 const timers=[],p={id:1,color:0,x:2,y:3,alive:false},world={players:[p],events:[{t:'death',p}]};let shown=0;
 const c=vm.createContext({mode:'solo',roundId:'original',world,me:p,p2:null,over:false,shake:0,PAL:[{c:'#fff'}],navigator:{},burst(){},sfx:{death(){}},setTimeout(fn,delay){assert.equal(delay,900);timers.push(fn);},showEnd(){assert.ok(c.me&&c.world);shown++;}});
 vm.runInContext(source+';handleEvents();',c);assert.equal(timers.length,1);
 return{c,fire:timers[0],shown:()=>shown};
}
{
 const f=fixture();f.fire();assert.equal(f.shown(),1,'the current round still shows its result');
}
for(const mode of ['attract','closed']){
 const f=fixture();f.c.mode=mode;f.c.world=f.c.me=null;
 assert.doesNotThrow(f.fire);assert.equal(f.shown(),0,'leaving cancels the old result callback');
}
{
 const f=fixture();f.c.roundId='new-round';f.c.me={alive:false};f.c.world={};f.fire();assert.equal(f.shown(),0,'an old timer cannot report the next round');
}
{
 const f=fixture();f.c.world={};f.fire();assert.equal(f.shown(),0,'replacing the world invalidates its pending result');
}
console.log('PASS: delayed Ttang results never read a disposed player or report a replacement round.');
