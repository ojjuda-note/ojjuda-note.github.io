const test=require('node:test'),assert=require('node:assert/strict');
const G=require('../games/screw/screw-flat.js'),A=require('../games/screw/screw-flat-pictures.js');
const values=new Map();global.localStorage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,String(value))};
const tap=(g,x,y)=>{g.onDown(x,y);g.onUp(x,y);};
test('album visits all pages, selects global picture IDs and does not award unopened pictures',()=>{
 values.clear();values.set(A.COLLECTION_KEY,JSON.stringify([A.PICTURES[6].id,A.PICTURES[105].id]));
 const g=G.flat({setScore(){},end(){}}),st=g.state;
 try{g.onKey('a');assert.equal(st.albumPage,0);tap(g,290,463);assert.equal(st.albumPage,1);
 tap(g,90,125);assert.equal(st.albumPicture,6);g.onKey('Escape');assert.equal(st.albumPage,1);assert.equal(st.albumPicture,null);
 g.onKey('End');assert.equal(st.albumPage,17);tap(g,290,463);assert.equal(st.albumPage,17);
 tap(g,255,230);assert.equal(st.albumPicture,105);g.onKey('Escape');assert.equal(st.albumPage,17);
 tap(g,90,360);assert.equal(st.albumPicture,null,'empty slots on the final page are not clickable');
 g.onKey('Home');assert.equal(st.albumPage,0);g.onKey('PageDown');assert.equal(st.albumPage,1);g.onKey('ArrowRight');assert.equal(st.albumFocus,6);g.onKey('Enter');assert.equal(st.albumPicture,6);
 assert.equal(st.collection.size,2);assert.equal(st.moves,0);assert.equal(st.complete,false);
 }finally{g.destroy();}
});
test('opening an earned album loads only the visible page and image cache evicts old pages',()=>{
 values.clear();values.set(A.COLLECTION_KEY,JSON.stringify(A.PICTURES.map(p=>p.id)));
 const original=A.preload,seen=[];A.preload=(index)=>{seen.push(index);return null;};
 const g=G.flat({setScore(){},end(){}});
 try{seen.length=0;g.onKey('a');assert.deepEqual(seen,[0,1,2,3,4,5]);seen.length=0;g.onKey('End');assert.deepEqual(seen,[102,103,104,105]);}
 finally{g.destroy();A.preload=original;}
 let made=0;const oldImage=global.Image;global.Image=class{constructor(){made++;}};
 try{for(let i=0;i<A.PICTURES.length;i++)A.preload(i);const before=made;A.preload(105);assert.equal(made,before);A.preload(0);assert.equal(made,before+1,'earlier pages are not retained indefinitely');}
 finally{global.Image=oldImage;}
});
