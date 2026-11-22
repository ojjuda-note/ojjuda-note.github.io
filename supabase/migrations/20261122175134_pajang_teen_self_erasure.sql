-- Allow a former teen to withdraw their own Pajang youth contributions after age 19
-- or while the community launch switch is off. This operation cannot read or
-- post youth content. Reported evidence remains restricted for review.
create function public.pajang_teen_erase_own()
returns jsonb language plpgsql security definer set search_path=''
as $erase$
declare
  actor uuid:=ojjuda_restaurants_internal.require_member();
  holds boolean;
  deleted_comments integer:=0;
  deleted_answers integer:=0;
  deleted_likes integer:=0;
begin
  if coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then
    raise exception '로그인한 회원만 이용할 수 있어요.' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(actor::text,125));
  -- Protect submitted reports against destruction through ON DELETE CASCADE.
  select
    exists(select from pajang_teen_private.reports r
      join pajang_teen_private.drafts d on d.id=r.draft_id where d.owner_id=actor)
    or exists(select from pajang_teen_private.comment_reports cr
      join pajang_teen_private.comments c on c.id=cr.comment_id
      join pajang_teen_private.drafts d on d.id=c.draft_id
      where c.author_id=actor or d.owner_id=actor)
    into holds;
  if holds then
    update pajang_teen_private.drafts
      set review_status='hidden' where owner_id=actor and review_status<>'hidden';
    update pajang_teen_private.comments
      set review_status='hidden' where author_id=actor and review_status<>'hidden';
    return jsonb_build_object('deleted',false,'reviewHold',true);
  end if;
  delete from pajang_teen_private.comments where author_id=actor;
  get diagnostics deleted_comments=row_count;
  delete from pajang_teen_private.drafts where owner_id=actor;
  get diagnostics deleted_answers=row_count;
  delete from pajang_teen_private.likes where owner_id=actor;
  get diagnostics deleted_likes=row_count;
  delete from pajang_teen_private.blocks where owner_id=actor;
  return jsonb_build_object('deleted',true,'reviewHold',false,
    'deletedAnswers',deleted_answers,'deletedComments',deleted_comments,'deletedLikes',deleted_likes);
end;
$erase$;

revoke all on function public.pajang_teen_erase_own() from public,anon,authenticated,service_role;
grant execute on function public.pajang_teen_erase_own() to authenticated;
comment on function public.pajang_teen_erase_own() is
  '본인 청소년 작성물 삭제. 현재 성인인 회원도 실행 가능. 신고 관련 원문은 비공개 보존 후 관리자 문의 필요.';
