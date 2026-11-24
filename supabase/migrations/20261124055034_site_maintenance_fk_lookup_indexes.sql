-- Small-table foreign-key lookup indexes; preserve all existing data, RLS and RPC behavior.
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '10s';
CREATE INDEX IF NOT EXISTS qa_pajang_answer_hidden_by_idx ON ojjuda_admin_internal.pajang_answer_moderation (hidden_by);
CREATE INDEX IF NOT EXISTS qa_pajang_message_hidden_by_idx ON ojjuda_admin_internal.pajang_message_moderation (hidden_by);
CREATE INDEX IF NOT EXISTS qa_drinking_truth_history_card_idx ON ojjuda_arcade_internal.drinking_truth_history (card_id);
CREATE INDEX IF NOT EXISTS qa_group_reports_reporter_idx ON ojjuda_groups_internal.reports (reporter_id);
CREATE INDEX IF NOT EXISTS qa_group_reports_resolver_idx ON ojjuda_groups_internal.reports (resolved_by);
CREATE INDEX IF NOT EXISTS qa_round_records_user_idx ON ojjuda_guest_internal.round_records (user_id);
CREATE INDEX IF NOT EXISTS qa_card_locations_author_idx ON ojjuda_note_internal.card_locations (author_id);
CREATE INDEX IF NOT EXISTS qa_card_photos_author_idx ON ojjuda_note_internal.card_photos (author_id);
CREATE INDEX IF NOT EXISTS qa_park_post_v2_history_content_idx ON ojjuda_note_internal.park_post_v2_history (content_id);
