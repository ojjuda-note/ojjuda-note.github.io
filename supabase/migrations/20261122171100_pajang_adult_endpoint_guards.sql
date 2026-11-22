-- 파장 2단계(서버 안전장치): 성인 전용 기능에 검증된 성인 연령만 허용.
-- 청소년 기능이 아직 없으므로 기존 파장 화면과 사용자 데이터는 변경하지 않는다.
-- 모든 기존 호출 경로의 공통 시작점에 guard를 삽입하며 원본 로직과 권한은 유지한다.

do $patch$
declare
  previous text;
  source text;
  signature text;
  old_guard text;
  new_guard text;
begin
  signature := 'public.pajang_member(text,jsonb)';
  source := pg_get_functiondef(signature::regprocedure);
  old_guard := 'if known_age is not null and known_age<19 then';
  new_guard := 'if public.pajang_age_group() <> ''adult'' then';
  if source is null or (length(source)-length(replace(source,old_guard,'')))<>length(old_guard) then
    raise exception '파장 회원 서버의 성인 확인 코드가 예상과 달라요: %',signature;
  end if;
  execute replace(source,old_guard,new_guard);

  signature := 'pajang_private.exchange_actor()';
  source := pg_get_functiondef(signature::regprocedure);
  old_guard := E'begin\n  select p.id into actor';
  new_guard := E'begin\n  if public.pajang_age_group() <> ''adult'' then\n    raise exception ''성인 파장 회원만 이용할 수 있어요.'' using errcode=''42501'';\n  end if;\n  select p.id into actor';
  if source is null or (length(source)-length(replace(source,old_guard,'')))<>length(old_guard) then
    raise exception '파장 교환 서버의 성인 확인 코드가 예상과 달라요: %',signature;
  end if;
  execute replace(source,old_guard,new_guard);

  signature := 'pajang_private.require_signal_member()';
  source := pg_get_functiondef(signature::regprocedure);
  old_guard := E'begin\n  if coalesce((auth.jwt()->>''is_anonymous'')::boolean,false) then';
  new_guard := E'begin\n  if public.pajang_age_group() <> ''adult'' then\n    raise exception ''파장은 만 19세 이상 회원만 이용할 수 있어요.'' using errcode=''42501'';\n  end if;\n  if coalesce((auth.jwt()->>''is_anonymous'')::boolean,false) then';
  if source is null or (length(source)-length(replace(source,old_guard,'')))<>length(old_guard) then
    raise exception '파장 신호 서버의 성인 확인 코드가 예상과 달라요: %',signature;
  end if;
  execute replace(source,old_guard,new_guard);
end;
$patch$;

-- 콘텐츠 저장소 정책이 호출하는 기존 함수도 생년월일 누락을 허용하지 않는다.
create or replace function public.pajang_art_allowed()
returns boolean language sql stable security definer set search_path=''
as $adult$
  select public.pajang_age_group()='adult';
$adult$;
revoke all on function public.pajang_art_allowed() from public,anon,authenticated,service_role;
grant execute on function public.pajang_art_allowed() to authenticated;
comment on function public.pajang_art_allowed() is
  '성인 파장 자산만 읽기 허용. 미성년자 및 출생정보 미확인 회원은 차단한다.';

-- 기존 파장 profile/exchange/photo/signal/answer RPC는 모두
-- pajang_member, exchange_actor 또는 require_signal_member를 거치므로
-- 별도 teen 공개 서비스 전까지 모든 성인 전용 데이터를 보호한다.
