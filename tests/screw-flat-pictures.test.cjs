const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const G=require('../screw-flat.js'),A=require('../screw-flat-pictures.js');
const storage=new Map();global.localStorage={getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,String(value))};
const tap=(g,x,y)=>{g.onDown(x,y);g.onUp(x,y);};
const finish=g=>{g.state.level.plates.forEach(p=>p.state='gone');g.update(.05);};
assert.equal(A.PICTURES.length,6);assert.equal(new Set(A.PICTURES.map(p=>p.id)).size,6);
for(let i=0;i<A.PICTURES.length;i++){
 const picture=A.PICTURES[i],bytes=fs.readFileSync(path.join(__dirname,'../assets/screw-flat',picture.id+'-v1.webp'));
 assert.equal(bytes.toString('ascii',0,4),'RIFF');assert.equal(bytes.toString('ascii',8,12),'WEBP');assert.ok(bytes.length<200000,'mobile artwork stays small');
 assert.equal(G.makeFlatLevel(i+1).name,picture.name);assert.equal(G.makeFlatLevel(i+1+A.PICTURES.length).picture,i);
}
for(const bad of ['invalid','{}','null','[null,123,"unknown"]']){storage.set(A.COLLECTION_KEY,bad);assert.equal(A.readCollection().size,0);}
storage.clear();let score=0;const api={setScore:n=>score=n,end(){}};
const game=G.flat(api),st=game.state;
assert.equal(st.collection.size,0,'starting a stage does not earn its picture');
// Opening the album must pause an in-flight screw without discarding the puzzle.
const screw=st.level.screws[st.level.order[0]],target=st.level.holes[0];tap(game,screw.hole.x,screw.hole.y);tap(game,target.x,target.y);
assert.ok(st.pending);game.onKey('a');const paused=JSON.stringify({pending:st.pending,moves:st.moves,plates:st.level.plates});
for(let i=0;i<60;i++)game.update(.05);
assert.equal(JSON.stringify({pending:st.pending,moves:st.moves,plates:st.level.plates}),paused);
tap(game,90,130);assert.equal(st.albumPicture,null,'unfinished artwork is locked');
game.onKey('Escape');assert.equal(st.albumOpen,false);for(let i=0;i<20;i++)game.update(.05);assert.equal(st.moves,1,'closing the album resumes the screw');
finish(game);assert.equal(st.complete,true);assert.deepEqual([...st.collection],['window-cat']);assert.equal(storage.get(G.STAGE_KEY),'2');
const earnedScore=score;game.update(.05);assert.equal(score,earnedScore,'completion is awarded once');
game.onKey('A');game.onKey('ArrowRight');game.onKey('Enter');assert.equal(st.albumPicture,0);
game.onKey('Escape');assert.equal(st.albumOpen,true);assert.equal(st.albumPicture,null);game.onKey('Escape');assert.equal(st.albumOpen,false);
game.destroy();const reopened=G.flat(api);assert.equal(reopened.state.L,2);assert.ok(reopened.state.collection.has('window-cat'));reopened.destroy();
// Persist stable picture IDs, merge another tab's collection, and avoid duplicates.
storage.set(A.COLLECTION_KEY,JSON.stringify(['puppy-beach','unknown','puppy-beach']));
const merged=A.collect(0,new Set(['rabbit-tea']));assert.deepEqual([...merged].sort(),['puppy-beach','rabbit-tea','window-cat']);
assert.equal(A.collect(0,merged).size,3);
storage.set(G.STAGE_KEY,'999');const advanced=G.flat(api);assert.equal(advanced.state.L,999);assert.equal(advanced.state.collection.size,3,'old progress is not reset or treated as new artwork completions');advanced.destroy();
// Disabled storage never prevents playing or collecting within the current session.
global.localStorage={getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}};
const blocked=G.flat(api);finish(blocked);assert.ok(blocked.state.collection.has('window-cat'));blocked.destroy();
console.log('PASS: six small artwork assets, stage rotation, earned-only album, pause/resume, keyboard navigation, persistent collection, duplicate protection and unavailable storage.');
