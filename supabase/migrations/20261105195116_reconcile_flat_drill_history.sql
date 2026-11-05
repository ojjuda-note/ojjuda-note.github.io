-- November's flat game recorded 10 points per fallen plate and 10 × stage
-- on a clear. Match every intermediate score and two consecutive completed
-- stages before extending an account's verified historical progress.
alter table ojjuda_shop_internal.flat_drill_legacy_evidence
 add column confirmed_stage integer not null default 0 check(confirmed_stage between 0 and 1000),
 add column device_claim integer not null default 0 check(device_claim between 0 and 1000);

create temporary table flat_score_clears on commit drop as
with e as (
 select user_id,created_at,id,score,row_number() over(partition by user_id order by created_at,id) as seq,lag(score) over(partition by user_id order by created_at,id) as prior from public.game_scores
 where game='screw_flat' and created_at>='2026-11-01' and created_at<'2026-11-05 19:38:18+00'
), jump as (
 select *, (score-prior)/10-1 as stage from e where score-prior>=20 and (score-prior)%10=0
), parts as(
 select *,case when stage<11 then 1+stage/2 when stage<160 then 7+(stage>=20)::int+(stage>=35)::int+(stage>=55)::int+(stage>=80)::int+(stage>=115)::int else 13+(stage-160)*37/840 end as pieces from jump where stage between 1 and 1000
), full_runs as (
 select r.* from parts r where score>=10*(stage+pieces)
 and not exists(select 1 from generate_series(1,r.pieces-1) k where not exists(
 select 1 from e s where s.user_id=r.user_id and s.seq=r.seq-k and s.score=r.score-10*(r.stage+k) and s.created_at>=r.created_at-interval '3 hours'))
 and (r.score=10*(r.stage+r.pieces) or exists(select 1 from e base where base.user_id=r.user_id and base.seq=r.seq-r.pieces and base.score=r.score-10*(r.stage+r.pieces)))
) select * from full_runs;

with consecutive as (
 select b.user_id,b.stage from flat_score_clears a join flat_score_clears b
 on b.user_id=a.user_id and b.stage=a.stage+1 and b.seq=a.seq+b.pieces
 and b.score=a.score+10*(b.stage+b.pieces)
), evidence as (
 select user_id,max(stage) as highest from (
   select user_id,stage from consecutive union all
   select user_id,stage-1 from ojjuda_shop_internal.flat_drill_legacy_items
 ) sources group by user_id
)
insert into ojjuda_shop_internal.flat_drill_legacy_evidence(user_id,max_score,confirmed_stage)
 select user_id,10*highest,highest from evidence
 on conflict(user_id) do update set confirmed_stage=greatest(ojjuda_shop_internal.flat_drill_legacy_evidence.confirmed_stage,excluded.confirmed_stage);

insert into ojjuda_shop_internal.flat_drill_awards(user_id,stage,origin)
 select x.user_id,s,'legacy' from ojjuda_shop_internal.flat_drill_legacy_evidence x
 cross join lateral generate_series(1,x.confirmed_stage)s
 where not exists(select 1 from ojjuda_shop_internal.flat_drill_legacy_items i where i.user_id=x.user_id and i.stage=s)
 or exists(select 1 from flat_score_clears win where win.user_id=x.user_id and win.stage=s and not exists(
   select 1 from ojjuda_note_internal.spend_requests t where t.user_id=x.user_id
   and t.kind in('screw_flat_hole','screw_flat_moves') and t.result->>'stage'=s::text and t.created_at<=win.created_at))
 on conflict do nothing;

-- Older devices used unsigned local storage. Preserve a higher claim for
-- reconciliation, but only mint legacy inventory backed by server evidence.
create function ojjuda_shop_internal.flat_drill_check_legacy() returns trigger
 language plpgsql set search_path='' as $$
declare verified integer;
begin
 select confirmed_stage into verified from ojjuda_shop_internal.flat_drill_legacy_evidence where user_id=new.user_id;
 if new.stage<=coalesce(verified,0) then return new; end if;
 update ojjuda_shop_internal.flat_drill_legacy_evidence set device_claim=new.stage
  where user_id=new.user_id and device_claim<new.stage;
 return null;
end;
$$;
revoke all on function ojjuda_shop_internal.flat_drill_check_legacy() from public,anon,authenticated;
create trigger flat_drill_guard_legacy before insert on ojjuda_shop_internal.flat_drill_awards
 for each row when(new.origin='legacy') execute function ojjuda_shop_internal.flat_drill_check_legacy();
