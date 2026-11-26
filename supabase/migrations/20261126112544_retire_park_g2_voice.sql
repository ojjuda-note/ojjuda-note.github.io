-- Retire the dedicated glasses voice API, including access from older installations.
-- Keep existing records and migration history intact.
revoke all on function public.park_g2_voice_code(), public.park_g2_voice_redeem(text),
  public.park_g2_voice_claim(text), public.park_g2_voice_approve(text,bigint),
  public.park_g2_voice_complete(text,bigint) from public, anon, authenticated, service_role;
