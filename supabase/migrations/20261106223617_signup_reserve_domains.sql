-- Reserved test and non-routable domains must not pass account signup validation.
create or replace function ojjuda_account_internal.signup_email_valid(p_email text)
returns boolean language plpgsql immutable set search_path = pg_catalog as $email_fn$
declare
  v_email text := lower(btrim(coalesce(p_email,'')));
  v_local text := split_part(v_email,'@',1);
  v_domain text := split_part(v_email,'@',2);
  v_tld text := reverse(split_part(reverse(v_domain),'.',1));
begin
  if length(v_email) < 6 or length(v_email) > 254
      or length(v_local) > 64 or left(v_local,1) = '.' or right(v_local,1) = '.'
      or position('..' in v_local) > 0
      or v_email !~ $rx$^[a-z0-9!#$%&'*+/=?^_`{|}~.-]+@([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?[.])+[a-z]{2,63}$$rx$
      or v_tld in ('invalid','test','example','localhost','local') then
    return false;
  end if;
  if exists (
    select 1 from unnest(array[
      'example.com','example.net','example.org',
      'mailinator.com','yopmail.com','tempmail.com','temp-mail.org',
      '10minutemail.com','guerrillamail.com','sharklasers.com',
      'trashmail.com','getnada.com','maildrop.cc','dispostable.com'
    ]::text[]) as denied(domain)
    where v_domain = denied.domain or right(v_domain,length(denied.domain)+1) = '.'||denied.domain
  ) then return false; end if;
  return true;
end;
$email_fn$;

revoke all on function ojjuda_account_internal.signup_email_valid(text) from public,anon,authenticated;
