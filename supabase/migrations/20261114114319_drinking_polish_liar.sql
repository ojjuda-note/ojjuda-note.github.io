-- Polish liar wording in place; preserve IDs, flags, queues and live room snapshots.
begin;
select pg_advisory_xact_lock(24613,911);
do $polish$
declare
 edits constant jsonb:=$wording$[
  {
    "from": "목의 키스마크",
    "to": "키스마크"
  },
  {
    "from": "옷깃의 립스틱 자국",
    "to": "립스틱 자국"
  },
  {
    "from": "슬립",
    "to": "슬립 잠옷"
  },
  {
    "from": "패션 테이프",
    "to": "옷 고정용 양면테이프"
  },
  {
    "from": "성적 궁합",
    "to": "속궁합"
  },
  {
    "from": "워터 침대",
    "to": "물침대"
  },
  {
    "from": "침대 헤드보드",
    "to": "침대 머리판"
  },
  {
    "from": "치아 사이 고춧가루",
    "to": "이에 낀 고춧가루"
  },
  {
    "from": "레이트 체크아웃",
    "to": "체크아웃 연장"
  },
  {
    "from": "게스트 리스트",
    "to": "초대 명단"
  },
  {
    "from": "파티 가랜드",
    "to": "파티 장식 깃발"
  },
  {
    "from": "아이스 버킷",
    "to": "얼음통"
  },
  {
    "from": "레몬 슬라이스",
    "to": "레몬 조각"
  },
  {
    "from": "치즈 플래터",
    "to": "모둠 치즈"
  },
  {
    "from": "커플 문답지",
    "to": "커플 질문지"
  }
]$wording$::jsonb;
 corrected integer;
begin
 -- Every source must identify exactly one row, including archived rows. A missing
 -- source and a duplicate source must not cancel out in a total row-count check.
 if exists(select 1 from jsonb_array_elements(edits) entry
  where (select count(*) from ojjuda_arcade_internal.drinking_content_items c where c.kind='liar' and c.body=(entry->'from')#>>'{}' and c.second is not distinct from null::text)<>1) then
  raise exception 'liar_wording_source_changed';
 end if;
 -- The existing remember trigger adds new king/fingers/imagevote fingerprints;
 -- older fingerprints and moderation records remain intact.
 update ojjuda_arcade_internal.drinking_content_items c set body=(entry->'to')#>>'{}',revision=c.revision+1
 from jsonb_array_elements(edits) entry where c.kind='liar' and c.body=(entry->'from')#>>'{}' and c.second is not distinct from null::text;
 get diagnostics corrected=row_count;
 if corrected<>15 then raise exception 'liar_wording_row_count_changed'; end if;
end;
$polish$;
commit;
