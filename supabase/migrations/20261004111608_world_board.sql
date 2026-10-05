-- Public board projections retain the source tables' row-level access checks.
CREATE VIEW public.world_board_posts WITH (security_invoker=true) AS
 SELECT p.id, 'post'::text AS source, 'text'::text AS kind, p.user_id,
 ''::text AS title, p.body, NULL::text AS path, p.created_at, 0::bigint AS base_likes
 FROM public.house_posts p LEFT JOIN public.media_folders f ON f.id=p.folder_id
 WHERE p.deleted_at IS NULL AND public.door_open(p.user_id) AND NOT public.blocked_between(p.user_id,(SELECT auth.uid()))
 AND CASE WHEN p.folder_id IS NULL THEN p.visibility='all' ELSE f.visibility='all' END
 UNION ALL
 SELECT m.id, 'media', m.type, m.user_id, ''::text, m.caption, m.path, m.created_at, 0::bigint
 FROM public.media m LEFT JOIN public.media_folders f ON f.id=m.folder_id
 WHERE public.door_open(m.user_id) AND NOT public.blocked_between(m.user_id,(SELECT auth.uid()))
 AND CASE WHEN m.folder_id IS NULL THEN m.visibility='all' ELSE f.visibility='all' END
 UNION ALL
 SELECT d.id, 'diary', 'text', d.user_id, d.title, d.body, NULL::text, d.created_at, d.likes::bigint
 FROM public.diaries d WHERE d.visibility='all' AND public.door_open(d.user_id) AND NOT public.blocked_between(d.user_id,(SELECT auth.uid()));
REVOKE ALL ON public.world_board_posts FROM PUBLIC,anon;
GRANT SELECT ON public.world_board_posts TO authenticated;

CREATE TABLE public.world_board_likes (
 user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
 source text NOT NULL CHECK (source IN ('post','media','diary')),
 record_id text NOT NULL CHECK (char_length(record_id) BETWEEN 1 AND 128),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (user_id,source,record_id)
);
CREATE INDEX world_board_likes_record ON public.world_board_likes(source,record_id);
ALTER TABLE public.world_board_likes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.world_board_likes FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,DELETE ON public.world_board_likes TO authenticated;
CREATE POLICY world_board_likes_read ON public.world_board_likes FOR SELECT TO authenticated
 USING (EXISTS (SELECT 1 FROM public.world_board_posts p WHERE p.source=world_board_likes.source AND p.id=world_board_likes.record_id));
CREATE POLICY world_board_likes_add ON public.world_board_likes FOR INSERT TO authenticated
 WITH CHECK (user_id=(SELECT auth.uid()) AND NOT public.is_banned((SELECT auth.uid())) AND
 EXISTS (SELECT 1 FROM public.world_board_posts p WHERE p.source=world_board_likes.source AND p.id=world_board_likes.record_id));
CREATE POLICY world_board_likes_remove ON public.world_board_likes FOR DELETE TO authenticated USING (user_id=(SELECT auth.uid()));
CREATE VIEW public.world_board_feed WITH (security_invoker=true) AS
 SELECT p.*, p.base_likes+(SELECT count(*) FROM public.world_board_likes l WHERE l.source=p.source AND l.record_id=p.id) AS like_count,
 EXISTS (SELECT 1 FROM public.world_board_likes l WHERE l.source=p.source AND l.record_id=p.id AND l.user_id=(SELECT auth.uid())) AS is_liked
 FROM public.world_board_posts p;
REVOKE ALL ON public.world_board_feed FROM PUBLIC,anon;
GRANT SELECT ON public.world_board_feed TO authenticated;
CREATE INDEX house_posts_public_latest ON public.house_posts(created_at DESC,id DESC) WHERE deleted_at IS NULL;
CREATE INDEX media_board_latest ON public.media(type,created_at DESC,id DESC);
