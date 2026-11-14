-- Replace the initial catalog completely. Current room snapshots remain untouched.
begin;
select pg_advisory_xact_lock(24613,911);
delete from ojjuda_arcade_internal.drinking_prompts where kind='initial';
delete from ojjuda_arcade_internal.drinking_content_items where kind='initial';
insert into ojjuda_arcade_internal.drinking_content_items(kind,body,second,party_pick)
select 'initial',entry#>>'{}',null,true
from jsonb_array_elements($cards$[
  "ㄱㅅ",
  "ㄱㅁ",
  "ㄱㅂ",
  "ㄱㅈ",
  "ㄱㄷ",
  "ㄴㅅ",
  "ㄷㅅ",
  "ㄷㅈ",
  "ㅁㅅ",
  "ㅁㅈ",
  "ㅂㅅ",
  "ㅂㄱ",
  "ㅂㅈ",
  "ㅅㄱ",
  "ㅅㅂ",
  "ㅅㅅ",
  "ㅅㅇ",
  "ㅅㅈ",
  "ㅇㄱ",
  "ㅇㅅ",
  "ㅇㅈ",
  "ㅈㄱ",
  "ㅈㅅ",
  "ㅊㄱ"
]$cards$::jsonb) entry;
commit;
