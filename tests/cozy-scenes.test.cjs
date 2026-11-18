const test=require('node:test'),assert=require('node:assert/strict');
const Art=require('../shared/art/cozy-scenes.js');
const room={id:'10000000-0000-4000-8000-000000000001',name:'우리 모임',created_at:'2026-01-01T00:00:00Z'};
test('shared artwork adds 100 unique pictures after the six existing collection IDs',()=>{
 assert.equal(Art.PICTURES.length,106);
 assert.deepEqual(Art.PICTURES.slice(0,6).map(p=>p.id),['window-cat','rabbit-tea','bear-picnic','puppy-beach','sky-whale','cozy-room']);
 assert.equal(new Set(Art.PICTURES.map(p=>p.id)).size,106);assert.equal(new Set(Art.PICTURES.map(p=>p.src)).size,106);
 for(const p of Art.PICTURES){assert.match(p.src,/^\/assets\/(screw-flat|cozy-scenes)\/[a-z0-9-]+\.webp$/);assert.ok(p.name);assert.ok(['picnic','lounge','seaside','teatime','starlight','sunbeam'].includes(p.theme));}
});
test('existing rooms keep their covers and new rooms receive stable expanded artwork',()=>{
 assert.equal(Art.forGroup(room).id,'rabbit-tea');assert.equal(Art.forGroup({id:room.id}).id,'rabbit-tea');
 const current={...room,created_at:new Date(Date.parse(Art.GROUP_NEW_SINCE)+1000).toISOString()};
 const picture=Art.forGroup(current);assert.ok(Art.PICTURES.includes(picture));
 assert.equal(Art.forGroup({...current,name:'바뀐 이름',member_count:90}),picture);
 assert.equal(Art.forGroup({...current,id:current.id.toUpperCase()}),picture);
 const choices=new Set(Array.from({length:1000},(_,n)=>Art.forGroup({...current,id:'10000000-0000-4000-8000-'+String(n).padStart(12,'0')}).id));
 assert.ok(choices.size>90,'new rooms use the expanded collection');
});
