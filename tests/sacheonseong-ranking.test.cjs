const assert=require('node:assert/strict');
const R=require('../games/sacheonseong/ranking.js');
for(let stage=1;stage<=15;stage++){assert.equal(R.game(stage),'sacheonseong_'+stage);assert(R.isGame(R.game(stage)));}
for(const stage of [0,16,-1,1.5,'1',null,undefined])assert.equal(R.game(stage),null);
for(const id of ['sacheonseong','sacheonseong_01','sacheonseong_0','sacheonseong_16','sacheonseong_1_extra'])assert(!R.isGame(id));
for(const ms of [1,10,990,1000,12345,60000,3600123,86400000]){
 const score=R.score(ms);assert(Number.isInteger(score)&&score>=0&&score<R.BASE);
 assert.equal(R.duration(score),Math.max(10,Math.floor(ms/10)*10));
}
assert(R.score(2000)>R.score(3000),'Faster times must rank higher in the existing score system');
assert.equal(R.format(R.score(61230)),'01:01.23');
assert.equal(R.format(R.score(3600000)),'60:00.00');
assert.equal(R.format(R.BASE),'—');
for(const ms of [0,-1,NaN,Infinity,'1000',R.BASE*10+10])assert.equal(R.score(ms),null);
for(const score of [-1,R.BASE,NaN,Infinity,1.5,'1999999000',null])assert.equal(R.duration(score),null);
assert.notEqual(R.game(1),R.game(2),'Stages must have independent rankings');
console.log('PASS: 15 separate stage keys, fastest-first ranking, time formatting and invalid-score boundaries.');
