-- Round registration, score validation and recovery use the released mission ID.
-- Rank both existing and new runs by the number shown in the distance picker.
create or replace function ojjuda_archery_internal.course_stage(record_id integer)
returns integer language sql immutable strict parallel safe set search_path = '' as $$
  select (array[
    1, 27, 53, 79, 2, 28, 54, 80, 4, 30, 56, 82, 3, 29, 55, 81, 5, 31, 57, 83,
    6, 32, 58, 84, 7, 33, 59, 85, 8, 34, 60, 86, 9, 35, 61, 87, 10, 36, 62, 88,
    11, 37, 63, 89, 12, 38, 64, 90, 13, 39, 65, 91, 14, 40, 66, 92, 15, 41, 67, 93,
    16, 42, 68, 94, 17, 43, 69, 95, 18, 44, 70, 96, 19, 45, 71, 97, 20, 46, 72, 98,
    21, 47, 73, 99, 22, 48, 74, 100, 23, 49, 75, 101, 24, 50, 76, 102, 123, 129, 133, 155,
    124, 130, 134, 156, 126, 131, 135, 158, 25, 51, 77, 103, 26, 52, 78, 104, 127, 132, 136, 159,
    105, 137, 161, 181, 201, 106, 138, 162, 182, 202, 108, 140, 164, 184, 204, 107, 139, 163, 183, 203,
    109, 141, 165, 185, 205, 110, 142, 166, 186, 206, 111, 143, 167, 187, 207, 112, 144, 168, 188, 208,
    113, 145, 169, 189, 209, 114, 146, 170, 190, 210, 115, 147, 171, 191, 211, 116, 148, 172, 192, 212,
    117, 149, 173, 193, 213, 118, 150, 174, 194, 214, 119, 151, 175, 195, 215, 120, 152, 176, 196, 216,
    121, 153, 177, 197, 217, 122, 154, 178, 198, 218, 125, 157, 179, 199, 219, 128, 160, 180, 200, 220
  ])[record_id];
$$;
revoke all on function ojjuda_archery_internal.course_stage(integer) from public, anon, authenticated;

do $ranking$
declare
  signature regprocedure := 'ojjuda_ranking_internal.candidates(text,timestamptz,timestamptz)'::regprocedure;
  definition text := pg_get_functiondef(signature);
  previous text;
  updated text;
begin
  -- Only change the archery branch of the shared leaderboard.
  previous := substring(definition from 'if p_game=''archery'' then.+?return;');
  if previous is null then raise exception 'Missing archery ranking branch'; end if;
  if position('ojjuda_archery_internal.course_stage(' in previous) > 0 then return; end if;
  if position('r.user_id,r.stage,r.score' in previous) = 0
    or position('order by r.user_id,r.stage desc' in previous) = 0 then
    raise exception 'Unexpected archery ranking definition';
  end if;
  updated := replace(previous, 'r.user_id,r.stage,r.score',
    'r.user_id,ojjuda_archery_internal.course_stage(r.stage) as stage,r.score');
  updated := replace(updated, 'order by r.user_id,r.stage desc',
    'order by r.user_id,ojjuda_archery_internal.course_stage(r.stage) desc');
  execute replace(definition, previous, updated);
end;
$ranking$;
