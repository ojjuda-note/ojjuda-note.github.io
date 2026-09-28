-- Retire the doll claw machine. Preserve the existing play record, purchased
-- and won items in user_private.owned, and all current wallet balances.
-- Both functions were public SECURITY DEFINER RPCs; remove them together so
-- cached clients cannot spend coins or mint prize/duplicate rewards.
BEGIN;

DROP FUNCTION IF EXISTS public.claw_win(bigint, text) RESTRICT;
DROP FUNCTION IF EXISTS public.claw_play() RESTRICT;

-- Keep the one historical play for audit, but close the table's broad direct
-- API grants. Server-side backups/admin access remain available.
REVOKE ALL PRIVILEGES ON TABLE public.claw_plays FROM anon, authenticated;

COMMIT;
