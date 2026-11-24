-- Foreign-key lookup indexes for game records, notifications, board comments, moderation and account cleanup.
-- These small-table additions preserve rows, policies and existing indexes.
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '10s';
CREATE INDEX IF NOT EXISTS qa_spot_clears_user_idx ON ojjuda_guest_internal.spot_clears (user_id);
CREATE INDEX IF NOT EXISTS qa_tank_wins_user_idx ON ojjuda_tank_internal.wins (user_id);
CREATE INDEX IF NOT EXISTS qa_broadcast_reads_notice_idx ON ojjuda_updates_internal.broadcast_reads (notice_id);
CREATE INDEX IF NOT EXISTS qa_pajang_blocks_dst_idx ON pajang_private.blocks (dst);
CREATE INDEX IF NOT EXISTS qa_pajang_messages_dst_idx ON pajang_private.messages (dst);
CREATE INDEX IF NOT EXISTS qa_world_blocks_blocked_idx ON public.blocks (blocked);
CREATE INDEX IF NOT EXISTS qa_world_board_comments_author_idx ON public.world_board_comments (author_id);
CREATE INDEX IF NOT EXISTS qa_world_board_comments_diary_idx ON public.world_board_comments (diary_id);
CREATE INDEX IF NOT EXISTS qa_world_board_comments_post_idx ON public.world_board_comments (post_id);
CREATE INDEX IF NOT EXISTS qa_media_comments_author_idx ON public.media_comments (author_id);
CREATE INDEX IF NOT EXISTS qa_client_errors_user_idx ON public.client_errors (user_id);
CREATE INDEX IF NOT EXISTS qa_feedback_user_idx ON public.feedback (user_id);
