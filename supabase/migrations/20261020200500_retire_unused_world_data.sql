-- Retire world features other than arcade, park and account settings.
-- Shared accounts, coins, friendships, game records and park cards are retained.
-- Storage bytes are removed separately through the authenticated S3 API.
begin;
set local lock_timeout = '5s';
do $$
declare t text; before_games bigint; before_cards bigint; before_profiles bigint;
begin
 select count(*) into before_games from public.game_scores;
 select count(*) into before_cards from ojjuda_note.cards;
 select count(*) into before_profiles from public.profiles;
 update ojjuda_house_note_internal.config set enabled=false;
 update ojjuda_media_internal.config set enabled=false;
 for t in select jobname from cron.job where jobname in ('ojjuda_house_media_every_2h','ojjuda_house_notes_every_2h') loop
  perform cron.unschedule(t);
 end loop;
 foreach t in array array[
  'public.world_board_comments','public.world_board_likes',
  'public.media_comments','public.house_media_trash','public.media','public.media_folders',
  'public.diary_likes','public.diaries','public.guestbook','public.intros',
  'public.house_posts','public.house_rooms','public.house_friend_groups','public.profile_visits',
  'public.life_schedule_events','public.life_ledger_entries','public.life_donflow_snapshots',
  'public.quiz_winners','public.quiz_slots','public.quiz_bank','public.quiz_words',
  'public.creative_comic_pages','public.creative_comics',
  'public.shop_items','public.shop_sets',
  'ojjuda_house_note_internal.queue','ojjuda_media_internal.items',
  'ojjuda_house_admin.review_ack','ojjuda_comics_internal.revisions',
  'ojjuda_world_private.media_cleanup_queue'
 ] loop
  execute format('delete from %s',t);
 end loop;
 delete from public.place_messages where room !~ '^(arcade|park)(-|$)';
 delete from ojjuda_world_private.content_archive where kind in ('guestbook','diary','intro','media','image','video','post','house_post','comment','media_comment','board_comment');
 update public.profiles set room='{}'::jsonb,tv_media=null,door_closed=false,
   visits_today=0,visits_total=0,visits_day=null;
 update public.user_private set data=data-array['album','tvMedia','petBank'];
 update public.user_private set data=data#-'{settings,defaultVis}'#-'{settings,notify,guestbook}'#-'{settings,notify,comment}';
 if before_games<>(select count(*) from public.game_scores)
    or before_cards<>(select count(*) from ojjuda_note.cards)
    or before_profiles<>(select count(*) from public.profiles) then
  raise exception 'Protected game, park or account data changed';
 end if;
end $$;
-- Stop retired clients from repopulating removed features. Keep read compatibility
-- for older account loaders until all open browser sessions have refreshed.
revoke insert,update,delete on public.world_board_comments,public.world_board_likes,
 public.media_comments,public.house_media_trash,public.media,public.media_folders,
 public.diary_likes,public.diaries,public.guestbook,public.intros,
 public.house_posts,public.house_rooms,public.house_friend_groups,public.profile_visits,
 public.life_schedule_events,public.life_ledger_entries,public.life_donflow_snapshots,
 public.quiz_winners,public.quiz_slots,public.quiz_bank,public.quiz_words,
 public.creative_comic_pages,public.creative_comics,public.shop_items,public.shop_sets
 from public,anon,authenticated;
do $$
declare f record;
begin
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname in (
  'house_delete_friend_group','house_delete_media_folder','house_manage_records',
  'house_move_media','house_room_save','house_save_friend_group','house_save_post',
  'life_donflow_save','comics_save_edit','quiz_current','quiz_make',
  'admin_quiz_add','admin_quiz_toggle'
 ) loop
  execute format('revoke execute on function %s from public,anon,authenticated',f.signature);
 end loop;
end $$;
commit;
