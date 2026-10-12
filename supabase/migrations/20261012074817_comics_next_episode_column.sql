-- Links are chosen explicitly by an adult administrator; no automatic series inference.
alter table public.creative_comics add column next_comic_id uuid
 references public.creative_comics(id) on delete set null,
 add constraint comic_next_not_self check(next_comic_id is null or next_comic_id<>id);
create index creative_comics_next_idx on public.creative_comics(next_comic_id) where next_comic_id is not null;
-- Keep the eight-argument RPC for cached clients. It preserves existing links.
-- This overload saves the link and page manifest in the same revision/transaction.
