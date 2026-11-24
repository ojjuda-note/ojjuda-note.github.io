-- 1단계: 가입 시 확인한 생년월일로 파장 이용 연령대를 판별한다.
-- 기존 19세 이상 입장/교류 RPC는 변경하지 않는다. 청소년 기능은 별도 보호 장치 후 활성화한다.
create or replace function public.pajang_age_group()
returns text
language sql stable security definer set search_path = ''
as $age$
  select case
    when auth.uid() is null
      or coalesce((auth.jwt()->>'is_anonymous')::boolean,false)
      or not ojjuda_restaurants_internal.member_allowed()
      then 'blocked'
    else coalesce((
      select case
        when i.birth_date is null
          or i.birth_date > (now() at time zone 'Asia/Seoul')::date then 'blocked'
        when extract(year from age((now() at time zone 'Asia/Seoul')::date,i.birth_date)) >= 19 then 'adult'
        when extract(year from age((now() at time zone 'Asia/Seoul')::date,i.birth_date)) >= 14 then 'teen'
        else 'blocked'
      end
      from ojjuda_account_internal.member_identity i
      where i.user_id = auth.uid()
    ),'blocked')
  end;
$age$;

revoke all on function public.pajang_age_group() from public,anon,authenticated,service_role;
grant execute on function public.pajang_age_group() to authenticated;
comment on function public.pajang_age_group() is
  '파장 연령대 판별(본인 계정만): adult=만19세 이상, teen=만14~18세, blocked=미확인/제한. 기존 파장 이용 허가가 아님.';
