// unchanged production source at line 1
    advance:milliseconds=>{now+=milliseconds;},
    owner:value=>{owner=value;},submit:handler=>{submit=handler;}};
}

for(const blockedStorage of [false,true])test('Chacha sequential scores remain tied to their rounds'+(blockedStorage?' with storage blocked':''),async t=>{
  const f=fixture(t,{blockedStorage});
// unchanged production source at line 35
