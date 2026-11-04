-- Apply after deploying the new function and verifying dispatch(true).
-- Existing jobs for unrelated features are not modified.
select cron.schedule('byeolcheonji-vacancies-every-two-minutes', '*/2 * * * *',
  'select byeolcheonji_internal.dispatch(false);');
