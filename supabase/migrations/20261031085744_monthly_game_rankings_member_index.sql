-- Account removal can clear its raw monthly picture records without scanning
-- every other member. Archived winner labels remain in their separate snapshot.
begin;
set local lock_timeout='5s';
create index ranking_picture_member on ojjuda_ranking_internal.picture_clears(user_id);
commit;
