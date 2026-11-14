-- Polish bomb wording in place; preserve IDs, flags, queues and live room snapshots.
begin;
select pg_advisory_xact_lock(24613,911);
do $polish$
declare
 edits constant jsonb:=$wording$[
  {
    "from": "샤부샤부에 넣는 재료 이름 대기",
    "to": "샤브샤브에 넣는 재료 이름 대기"
  },
  {
    "from": "빵집 브랜드 이름 대기",
    "to": "빵집 이름 대기"
  },
  {
    "from": "말려서 보관하는 식재료 이름 대기",
    "to": "말린 식재료 이름 대기"
  },
  {
    "from": "버튼을 누르는 물건 말하기",
    "to": "버튼을 눌러 쓰는 물건 말하기"
  },
  {
    "from": "가족 관계를 나타내는 말 대기",
    "to": "가족을 부르는 말 대기"
  },
  {
    "from": "대한민국 산 이름 대기",
    "to": "우리나라 산 이름 대기"
  },
  {
    "from": "대한민국 강 이름 대기",
    "to": "우리나라 강 이름 대기"
  },
  {
    "from": "대한민국 섬 이름 대기",
    "to": "우리나라 섬 이름 대기"
  },
  {
    "from": "대한민국 관광명소 이름 대기",
    "to": "우리나라 관광지 이름 대기"
  },
  {
    "from": "세계 관광명소 이름 대기",
    "to": "세계 관광지 이름 대기"
  },
  {
    "from": "자연에서 볼 수 있는 지형 이름 대기",
    "to": "자연 지형 이름 대기"
  },
  {
    "from": "동물의 몸에 있는 부분 말하기",
    "to": "동물의 몸에 있는 것 말하기"
  },
  {
    "from": "옷에 쓰는 무늬 이름 대기",
    "to": "옷 무늬 이름 대기"
  },
  {
    "from": "옷에 달린 부분 말하기",
    "to": "옷에 달린 것 말하기"
  }
]$wording$::jsonb;
 corrected integer;
begin
 -- Every source must identify exactly one row, including archived rows. A missing
 -- source and a duplicate source must not cancel out in a total row-count check.
 if exists(select 1 from jsonb_array_elements(edits) entry
  where (select count(*) from ojjuda_arcade_internal.drinking_content_items c where c.kind='bomb' and c.body=(entry->'from')#>>'{}' and c.second is not distinct from null::text)<>1) then
  raise exception 'bomb_wording_source_changed';
 end if;
 -- The existing remember trigger adds new king/fingers/imagevote fingerprints;
 -- older fingerprints and moderation records remain intact.
 update ojjuda_arcade_internal.drinking_content_items c set body=(entry->'to')#>>'{}',revision=c.revision+1
 from jsonb_array_elements(edits) entry where c.kind='bomb' and c.body=(entry->'from')#>>'{}' and c.second is not distinct from null::text;
 get diagnostics corrected=row_count;
 if corrected<>14 then raise exception 'bomb_wording_row_count_changed'; end if;
end;
$polish$;
commit;
