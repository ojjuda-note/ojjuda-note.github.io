// unchanged production source at line 1
    advance:milliseconds=>{now+=milliseconds;},
    owner:value=>{owner=value;},submit:handler=>{submit=handler;}};
}

test('only the active Chacha game can exit to the arcade',t=>{
  const f=fixture(t);
  f.send({action:'exit',nonce:'other-session'});assert.ok(f.w.document.querySelector('iframe'));
  f.send({action:'exit'});assert.equal(f.w.document.querySelector('iframe'),null);
  assert.deepEqual(f.calls,[]);
});

for(const blockedStorage of [false,true])test('Chacha sequential scores remain tied to their rounds'+(blockedStorage?' with storage blocked':''),async t=>{
  const f=fixture(t,{blockedStorage});
// unchanged production source at line 35
