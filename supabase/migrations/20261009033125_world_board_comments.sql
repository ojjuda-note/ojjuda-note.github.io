-- Board text/diary comments inherit visibility from the original public post.
CREATE TABLE public.world_board_comments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 post_id text REFERENCES public.house_posts(id) ON DELETE CASCADE,
 diary_id text REFERENCES public.diaries(id) ON DELETE CASCADE,
 source text GENERATED ALWAYS AS (CASE WHEN post_id IS NOT NULL THEN 'post' ELSE 'diary' END) STORED,
 record_id text GENERATED ALWAYS AS (coalesce(post_id,diary_id)) STORED,
 author_id uuid DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE SET NULL,
 body text NOT NULL CHECK (body ~ '[^[:space:]]'),
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK (num_nonnulls(post_id,diary_id)=1)
);
CREATE INDEX world_board_comments_record ON public.world_board_comments(source,record_id,created_at DESC,id DESC);
ALTER TABLE public.world_board_comments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.world_board_comments FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,DELETE ON public.world_board_comments TO authenticated;
CREATE POLICY world_board_comments_read ON public.world_board_comments FOR SELECT TO authenticated USING (
 (author_id IS NULL OR NOT public.blocked_between(author_id,(SELECT auth.uid())))
 AND EXISTS (SELECT 1 FROM public.world_board_posts p WHERE p.source=world_board_comments.source AND p.id=world_board_comments.record_id)
);
CREATE POLICY world_board_comments_add ON public.world_board_comments FOR INSERT TO authenticated WITH CHECK (
 author_id=(SELECT auth.uid()) AND NOT public.is_banned((SELECT auth.uid()))
 AND NOT public.has_banned(body)
 AND EXISTS (SELECT 1 FROM public.world_board_posts p WHERE p.source=world_board_comments.source AND p.id=world_board_comments.record_id)
);
CREATE POLICY world_board_comments_remove ON public.world_board_comments FOR DELETE TO authenticated USING (
 author_id=(SELECT auth.uid()) OR EXISTS (
 SELECT 1 FROM public.world_board_posts p WHERE p.source=world_board_comments.source AND p.id=world_board_comments.record_id AND p.user_id=(SELECT auth.uid()))
);
-- Reuse album comments in the board so both places show the same conversation.
ALTER TABLE public.media_comments DROP CONSTRAINT media_comments_body_check;
ALTER TABLE public.media_comments ADD CONSTRAINT media_comments_body_check CHECK (char_length(body)>=1);
NOTIFY pgrst,'reload schema';

