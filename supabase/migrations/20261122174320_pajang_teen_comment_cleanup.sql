-- Teen safety follow-up: allow users to delete their own comments and keep the review queue actionable.
-- Public teen app remains locked (release_control.enabled=false).
do $patch$
declare
  signature text;
  definition text;
  old_text text;
  new_text text;
  count_matches integer;
begin
  signature := 'public.pajang_teen_interact(text,uuid,jsonb)';
  definition := pg_get_functiondef(signature::regprocedure);
  old_text := '  if p_action=''report-comment'' then';
  new_text := $fragment$
  -- An author may withdraw a comment at any stage, including after approval.
  -- No peer identifier or arbitrary row update is accepted.
  if p_action='delete-comment' then
    if p_data <> '{}'::jsonb then
      raise exception '댓글 삭제 요청을 확인해 주세요.' using errcode='22023';
    end if;
    delete from pajang_teen_private.comments c
      where c.id=p_target and c.author_id=viewer;
    get diagnostics affected=row_count;
    return jsonb_build_object('deleted',affected>0);
  end if;
  if p_action='report-comment' then$fragment$;
  count_matches := (length(definition)-length(replace(definition,old_text,'')))/length(old_text);
  if count_matches<>1 then
    raise exception 'Teen comment access guard changed: %',signature;
  end if;
  definition := replace(definition,old_text,new_text);

  old_text := '''id'',c.id,''authorId'',c.author_id,''authorName'',c.author_name,';
  new_text := '''id'',c.id,''authorId'',c.author_id,''authorName'',c.author_name,''mine'',c.author_id=viewer,';
  count_matches := (length(definition)-length(replace(definition,old_text,'')))/length(old_text);
  if count_matches<>1 then
    raise exception 'Teen comment projection changed: %',signature;
  end if;
  execute replace(definition,old_text,new_text);

  -- Pending answers must never be omitted because 50 newer approved/hidden posts
  -- filled the default review list. Always review the oldest pending first.
  signature := 'public.admin_pajang_teen_moderation(text,uuid,uuid)';
  definition := pg_get_functiondef(signature::regprocedure);
  old_text := 'select * from pajang_teen_private.drafts order by updated_at desc limit 50';
  new_text := 'select * from pajang_teen_private.drafts where review_status=''pending'' order by updated_at asc,id asc limit 50';
  count_matches := (length(definition)-length(replace(definition,old_text,'')))/length(old_text);
  if count_matches<>1 then
    raise exception 'Teen administrator review selection changed: %',signature;
  end if;
  execute replace(definition,old_text,new_text);
end;
$patch$;
