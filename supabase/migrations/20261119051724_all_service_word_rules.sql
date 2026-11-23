-- Save member-authored text after replacing shared prohibited phrases with two hearts.
-- The common catalog, allowlist, account/consent rules and existing saved rows stay intact.
set local lock_timeout = '4s';

-- Canonical read-only normalizer. Keep public.has_banned unchanged for moderation tools.
-- Work in PostgreSQL character positions, including text outside the matching alphabet.
create function public.mask_banned(t text) returns text
language plpgsql stable security definer set search_path='' as $function$
declare
  original_length integer := char_length(t);
  masked boolean[];
  protected boolean[];
  positions integer[];
  normalized text;
  unit text;
  phrase text;
  allowed text[];
  prohibited text[];
  position_in_text integer;
  position_in_phrase integer;
  occurrence integer;
  search_from integer;
  start_at integer;
  end_at integer;
  changed boolean;
  result text := '';
begin
  if t is null or not public.has_banned(t) then return t; end if;
  select coalesce(array_agg(public.norm_text(a.phrase)) filter(where public.norm_text(a.phrase)<>''),'{}')
    into allowed from public.banned_allow a;
  select coalesce(array_agg(terms.word),'{}') into prohibited from (
    select public.norm_text(b.word) as word from public.banned_base b where b.active
    union select public.norm_text(w.word) from public.banned_words w
  ) terms where terms.word<>'';
  masked := array_fill(false,array[original_length]);
  loop
    normalized := ''; positions := '{}';
    protected := array_fill(false,array[original_length]);
    for position_in_text in 1..original_length loop
      if masked[position_in_text] then continue; end if;
      unit := public.norm_text(substr(t,position_in_text,1));
      normalized := normalized || unit;
      for position_in_phrase in 1..char_length(unit) loop
        positions := array_append(positions,position_in_text);
      end loop;
    end loop;
    -- Match the existing allowlist-removal semantics while protecting its original
    -- characters. A prohibited match across an allowed phrase must not erase it.
    foreach phrase in array allowed loop
      loop
        occurrence := strpos(normalized,phrase);
        exit when occurrence=0;
        start_at := positions[occurrence];
        end_at := positions[occurrence+char_length(phrase)-1];
        for position_in_text in start_at..end_at loop protected[position_in_text] := true; end loop;
        normalized := left(normalized,occurrence-1) || substr(normalized,occurrence+char_length(phrase));
        positions := coalesce(positions[1:occurrence-1],'{}'::integer[])
          || coalesce(positions[occurrence+char_length(phrase):cardinality(positions)],'{}'::integer[]);
      end loop;
    end loop;
    changed := false;
    foreach phrase in array prohibited loop
      search_from := 1;
      loop
        occurrence := strpos(substr(normalized,search_from),phrase);
        exit when occurrence=0;
        occurrence := occurrence+search_from-1;
        start_at := positions[occurrence];
        end_at := positions[occurrence+char_length(phrase)-1];
        for position_in_text in start_at..end_at loop
          if not protected[position_in_text] and not masked[position_in_text] then
            masked[position_in_text] := true; changed := true;
          end if;
        end loop;
        search_from := occurrence+1;
      end loop;
    end loop;
    -- A replacement can join previously separated letters (e.g. 씨fuck발).
    -- Reach the fixed point in this call, so retries and repeated triggers agree.
    exit when not changed;
  end loop;
  for position_in_text in 1..original_length loop
    if masked[position_in_text] then
      if position_in_text=1 or not masked[position_in_text-1] then result:=result||'❤️❤️'; end if;
    else result := result||substr(t,position_in_text,1);
    end if;
  end loop;
  return result;
end;
$function$;
revoke all on function public.mask_banned(text) from public,anon,authenticated,service_role;
grant execute on function public.mask_banned(text) to anon,authenticated,service_role;

-- BEGIN shared scalar trigger
create or replace function public.check_banned_cols() returns trigger
language plpgsql security invoker set search_path='pg_catalog' as $function$
declare col text; submitted text; previous text;
begin
  foreach col in array tg_argv loop
    execute format('select ($1).%I::text',col) into submitted using new;
    if tg_op='UPDATE' then
      execute format('select ($1).%I::text',col) into previous using old;
      if submitted is not distinct from previous then continue; end if;
    end if;
    if submitted is not null then
      new := jsonb_populate_record(new,jsonb_build_object(col,public.mask_banned(submitted)));
    end if;
  end loop;
  return new;
end;
$function$;
-- END shared scalar trigger

-- BEGIN park trigger
create or replace function ojjuda_note_internal.enforce_note_blocked_words() returns trigger
language plpgsql security definer set search_path='' as $function$
declare submitted text; cleaned text; tags text[] := '{}';
begin
  if auth.uid() is null and (tg_op<>'INSERT' or new.author_id is not null) then
    raise exception 'Sign in required' using errcode='42501';
  end if;
  if tg_op='INSERT' or new.body is distinct from old.body then
    new.body := public.mask_banned(new.body);
  end if;
  if (tg_op='INSERT' or new.tags is distinct from old.tags) and new.tags is not null then
    foreach submitted in array new.tags loop
      cleaned := public.mask_banned(submitted);
      -- A pair of different tags may become the same marker. Preserve order and
      -- collapse only this display collision, retaining the existing tag set model.
      if not coalesce(cleaned=any(tags),false) or strpos(coalesce(cleaned,''),'❤️❤️')=0 then
        tags:=array_append(tags,cleaned);
      end if;
    end loop;
    new.tags:=tags;
  end if;
  return new;
end;
$function$;
-- END park trigger

-- BEGIN changed member text trigger
-- TG_ARGV[0] is an existing-row key for UPSERT paths, or '' for plain inserts.
-- Following arguments are authored text/JSON paths, never technical metadata.
create function ojjuda_note_internal.mask_member_text() returns trigger
language plpgsql security invoker set search_path='' as $function$
declare
  previous_row jsonb;
  incoming_row jsonb:=to_jsonb(new);
  key_column text;key_predicate text:='';field_index integer;
  pending jsonb:='[]';cursor_index integer:=0;
  current_new jsonb;current_old jsonb;current_path text[];
  old_items jsonb;old_used boolean[];new_matched boolean[];old_index integer;
  item record;cleaned text;
begin
  if tg_nargs<2 then raise exception 'missing_member_text_columns';end if;
  if tg_op='UPDATE' then previous_row:=to_jsonb(old);
  elsif tg_argv[0]<>'' then
    -- BEFORE INSERT fires for UPSERT too. Lock a comparison row until conflict
    -- handling, so a concurrent delete cannot turn a legacy edit into a new copy.
    -- The later UPDATE trigger compares the actual row again.
    foreach key_column in array string_to_array(tg_argv[0],',') loop
      key_predicate:=key_predicate||case when key_predicate='' then '' else ' and ' end
        ||format('existing.%I = ($1).%I',key_column,key_column);
    end loop;
    execute format('select to_jsonb(existing) from %I.%I existing where %s for key share',
      tg_table_schema,tg_table_name,key_predicate) into previous_row using new;
  end if;
  for field_index in 1..tg_nargs-1 loop
    pending:=pending||jsonb_build_array(jsonb_build_array(
      incoming_row #> string_to_array(tg_argv[field_index],'.'),
      previous_row #> string_to_array(tg_argv[field_index],'.'),
      to_jsonb(string_to_array(tg_argv[field_index],'.'))));
  end loop;
  while cursor_index<jsonb_array_length(pending) loop
    current_new:=pending->cursor_index->0;current_old:=pending->cursor_index->1;
    select array_agg(value order by ordinality) into current_path
      from jsonb_array_elements_text(pending->cursor_index->2) with ordinality;
    cursor_index:=cursor_index+1;
    if current_new is not distinct from current_old then continue;end if;
    case jsonb_typeof(current_new)
      when 'string' then
        cleaned:=public.mask_banned(current_new #>> '{}');
        incoming_row:=jsonb_set(incoming_row,current_path,to_jsonb(cleaned),false);
      when 'object' then
        for item in select key,value from jsonb_each(current_new) loop
          pending:=pending||jsonb_build_array(jsonb_build_array(item.value,
            case when jsonb_typeof(current_old)='object' then current_old->item.key end,
            to_jsonb(array_append(current_path,item.key))));
        end loop;
      when 'array' then
        old_items:=case when jsonb_typeof(current_old)='array' then current_old else '[]'::jsonb end;
        old_used:=array_fill(false,array[jsonb_array_length(old_items)]);
        new_matched:=array_fill(false,array[jsonb_array_length(current_new)]);
        -- Reserve unchanged choices before examining inserted/moved choices.
        for item in select value,ordinality::integer as position
          from jsonb_array_elements(current_new) with ordinality loop
          select old_item.ordinality::integer into old_index
          from jsonb_array_elements(old_items) with ordinality as old_item(value,ordinality)
          where old_item.value=item.value and not coalesce(old_used[old_item.ordinality::integer],false)
          order by old_item.ordinality limit 1;
          if found then old_used[old_index]:=true;new_matched[item.position]:=true;end if;
        end loop;
        for item in select value,ordinality::integer as position
          from jsonb_array_elements(current_new) with ordinality loop
          if new_matched[item.position] then continue;end if;
          current_old:=null;
          if item.position<=jsonb_array_length(old_items) and not coalesce(old_used[item.position],false) then
            old_used[item.position]:=true;current_old:=old_items->(item.position-1);
          end if;
          pending:=pending||jsonb_build_array(jsonb_build_array(item.value,current_old,
            to_jsonb(array_append(current_path,(item.position-1)::text))));
        end loop;
      else null; -- JSON keys, numbers, booleans and nulls are not prose.
    end case;
  end loop;
  new:=jsonb_populate_record(new,incoming_row);
  return new;
end;
$function$;
revoke all on function ojjuda_note_internal.mask_member_text() from public,anon,authenticated,service_role;

create trigger shared_word_mask before insert or update of name,region on pajang_private.people
  for each row execute function ojjuda_note_internal.mask_member_text('owner_id','name','region');
create trigger shared_word_mask before insert or update of body on pajang_private.answers
  for each row execute function ojjuda_note_internal.mask_member_text('person,day,slot','body');
create trigger shared_word_mask before insert or update of note on pajang_private.signals
  for each row execute function ojjuda_note_internal.mask_member_text('src,dst','note');
create trigger shared_word_mask before insert or update of body on pajang_private.messages
  for each row execute function ojjuda_note_internal.mask_member_text('id','body');
create trigger shared_word_mask before insert or update of preferences on pajang_private.public_profile_preferences
  for each row execute function ojjuda_note_internal.mask_member_text('person','preferences.custom');
create trigger shared_word_mask before insert or update of fields on pajang_private.exchange_profiles
  for each row execute function ojjuda_note_internal.mask_member_text('person','fields');
create trigger shared_word_mask before insert or update of body on public.house_posts
  for each row execute function ojjuda_note_internal.mask_member_text('id,user_id','body');
create trigger shared_word_mask before insert or update of name on public.house_friend_groups
  for each row execute function ojjuda_note_internal.mask_member_text('id,user_id','name');
create trigger shared_word_mask before insert or update of body on ojjuda_note_internal.friend_messages
  for each row execute function ojjuda_note_internal.mask_member_text('','body');
create trigger shared_word_mask before insert or update of body,reply on ojjuda_note_internal.inquiries
  for each row execute function ojjuda_note_internal.mask_member_text('','body','reply');
create trigger shared_word_mask before insert or update of body on public.feedback
  for each row execute function ojjuda_note_internal.mask_member_text('','body');
create trigger shared_word_mask before insert or update of body on public.world_board_comments
  for each row execute function ojjuda_note_internal.mask_member_text('','body');
create trigger shared_word_mask before insert or update of caption on public.media
  for each row execute function ojjuda_note_internal.mask_member_text('','caption');
-- END changed member text trigger

-- Preserve all unrelated RPC logic and ACLs. Stop if an audited source anchor changes.

-- BEGIN patch ojjuda_groups_internal.activity_labels(jsonb,boolean)
do $patch$
declare
  definition text:=pg_get_functiondef(to_regprocedure('ojjuda_groups_internal.activity_labels(jsonb,boolean)'));
  change record; occurrences integer;
begin
  for change in select * from (values
    ($old$declare item jsonb; label text; labels jsonb:='[]';$old$,$new$declare item jsonb; label text; labels jsonb:='[]'; original_labels jsonb:='[]';$new$,1),
    ($old$length(label)$old$,$new$length(replace(label,'❤️❤️','♥'))$new$,1),
    ($old$require_unique and labels ? label$old$,$new$require_unique and original_labels ? label and strpos(label,'❤️❤️')=0$new$,1),
    ($old$if public.has_banned(label) then raise exception 'banned_word'; end if;$old$,$new$original_labels:=original_labels||jsonb_build_array(label);
    label:=public.mask_banned(label);$new$,1)
  ) changes(old_text,new_text,expected) loop
    occurrences:=(length(definition)-length(replace(definition,change.old_text,'')))/length(change.old_text);
    if occurrences is distinct from change.expected then
      raise exception 'Changed word-mask function anchor: ojjuda_groups_internal.activity_labels(jsonb,boolean)';
    end if;
    definition:=replace(definition,change.old_text,change.new_text);
  end loop;
  execute definition;
end;
$patch$;
-- END patch ojjuda_groups_internal.activity_labels(jsonb,boolean)

-- BEGIN patch ojjuda_house_admin.change_content(text,text,text,text,text)
do $patch$
declare
  definition text:=pg_get_functiondef(to_regprocedure('ojjuda_house_admin.change_content(text,text,text,text,text)'));
  change record; occurrences integer;
begin
  for change in select * from (values
    ($old$IF public.has_banned(v_body) THEN RAISE EXCEPTION 'banned_word' USING ERRCODE='22023'; END IF;$old$,$new$v_body:=public.mask_banned(v_body);$new$,2)
  ) changes(old_text,new_text,expected) loop
    occurrences:=(length(definition)-length(replace(definition,change.old_text,'')))/length(change.old_text);
    if occurrences is distinct from change.expected then
      raise exception 'Changed word-mask function anchor: ojjuda_house_admin.change_content(text,text,text,text,text)';
    end if;
    definition:=replace(definition,change.old_text,change.new_text);
  end loop;
  execute definition;
end;
$patch$;
-- END patch ojjuda_house_admin.change_content(text,text,text,text,text)

-- BEGIN patch ojjuda_house_note_internal.run_house_notes()
do $patch$
declare
  definition text:=pg_get_functiondef(to_regprocedure('ojjuda_house_note_internal.run_house_notes()'));
  change record; occurrences integer;
begin
  for change in select * from (values
    ($old$IF public.has_banned(item.body) THEN RAISE EXCEPTION 'Note failed content validation'; END IF;$old$,$new$item.body:=public.mask_banned(item.body);$new$,1)
  ) changes(old_text,new_text,expected) loop
    occurrences:=(length(definition)-length(replace(definition,change.old_text,'')))/length(change.old_text);
    if occurrences is distinct from change.expected then
      raise exception 'Changed word-mask function anchor: ojjuda_house_note_internal.run_house_notes()';
    end if;
    definition:=replace(definition,change.old_text,change.new_text);
  end loop;
  execute definition;
end;
$patch$;
-- END patch ojjuda_house_note_internal.run_house_notes()

-- BEGIN patch ojjuda_media_internal.reject_similar_image()
do $patch$
declare
  definition text:=pg_get_functiondef(to_regprocedure('ojjuda_media_internal.reject_similar_image()'));
  change record; occurrences integer;
begin
  for change in select * from (values
    ($old$if public.has_banned(new.caption) then raise exception 'invalid_caption'; end if;$old$,$new$new.caption:=public.mask_banned(new.caption);$new$,1)
  ) changes(old_text,new_text,expected) loop
    occurrences:=(length(definition)-length(replace(definition,change.old_text,'')))/length(change.old_text);
    if occurrences is distinct from change.expected then
      raise exception 'Changed word-mask function anchor: ojjuda_media_internal.reject_similar_image()';
    end if;
    definition:=replace(definition,change.old_text,change.new_text);
  end loop;
  execute definition;
end;
$patch$;
-- END patch ojjuda_media_internal.reject_similar_image()

-- BEGIN patch ojjuda_note_internal.stage_auto_cards(date,text[],text)
do $patch$
declare
  definition text:=pg_get_functiondef(to_regprocedure('ojjuda_note_internal.stage_auto_cards(date,text[],text)'));
  change record; occurrences integer;
begin
  for change in select * from (values
    ($old$  IF EXISTS (
    SELECT 1 FROM pg_catalog.unnest(p_bodies)$old$,$new$  SELECT array_agg(public.mask_banned(body) ORDER BY ordinality) INTO p_bodies
    FROM pg_catalog.unnest(p_bodies) WITH ORDINALITY AS source(body,ordinality);
  IF EXISTS (
    SELECT 1 FROM pg_catalog.unnest(p_bodies)$new$,1),
    ($old$      OR public.has_banned(body)
$old$,$new$$new$,1)
  ) changes(old_text,new_text,expected) loop
    occurrences:=(length(definition)-length(replace(definition,change.old_text,'')))/length(change.old_text);
    if occurrences is distinct from change.expected then
      raise exception 'Changed word-mask function anchor: ojjuda_note_internal.stage_auto_cards(date,text[],text)';
    end if;
    definition:=replace(definition,change.old_text,change.new_text);
  end loop;
  execute definition;
end;
$patch$;
-- END patch ojjuda_note_internal.stage_auto_cards(date,text[],text)

-- BEGIN patch ojjuda_note_internal.valid_note_body(text)
do $patch$
declare
  definition text:=pg_get_functiondef(to_regprocedure('ojjuda_note_internal.valid_note_body(text)'));
  change record; occurrences integer;
begin
  for change in select * from (values
    ($old$char_length(p_body)$old$,$new$char_length(replace(p_body,'❤️❤️','♥'))$new$,1)
  ) changes(old_text,new_text,expected) loop
    occurrences:=(length(definition)-length(replace(definition,change.old_text,'')))/length(change.old_text);
    if occurrences is distinct from change.expected then
      raise exception 'Changed word-mask function anchor: ojjuda_note_internal.valid_note_body(text)';
    end if;
    definition:=replace(definition,change.old_text,change.new_text);
  end loop;
  execute definition;
end;
$patch$;
-- END patch ojjuda_note_internal.valid_note_body(text)

-- BEGIN patch ojjuda_note.valid_tags(text[])
do $patch$
declare
  definition text:=pg_get_functiondef(to_regprocedure('ojjuda_note.valid_tags(text[])'));
  change record; occurrences integer;
begin
  for change in select * from (values
    ($old$char_length(t.tag)$old$,$new$char_length(replace(t.tag,'❤️❤️','♥'))$new$,1)
  ) changes(old_text,new_text,expected) loop
    occurrences:=(length(definition)-length(replace(definition,change.old_text,'')))/length(change.old_text);
    if occurrences is distinct from change.expected then
      raise exception 'Changed word-mask function anchor: ojjuda_note.valid_tags(text[])';
    end if;
    definition:=replace(definition,change.old_text,change.new_text);
  end loop;
  execute definition;
end;
$patch$;
-- END patch ojjuda_note.valid_tags(text[])

-- BEGIN patch ojjuda_note_internal.send_friend_message(uuid,text,uuid)
do $patch$
declare
  definition text:=pg_get_functiondef(to_regprocedure('ojjuda_note_internal.send_friend_message(uuid,text,uuid)'));
  change record; occurrences integer;
begin
  for change in select * from (values
    ($old$length(clean)$old$,$new$length(replace(clean,'❤️❤️','♥'))$new$,2),
    ($old$octet_length(replace(clean,'❤️❤️','♥'))$old$,$new$octet_length(replace(clean,'❤️❤️','x'))$new$,1),
    ($old$item.body<>clean$old$,$new$(item.body<>clean AND item.body<>public.mask_banned(clean))$new$,1)
  ) changes(old_text,new_text,expected) loop
    occurrences:=(length(definition)-length(replace(definition,change.old_text,'')))/length(change.old_text);
    if occurrences is distinct from change.expected then
      raise exception 'Changed word-mask function anchor: ojjuda_note_internal.send_friend_message(uuid,text,uuid)';
    end if;
    definition:=replace(definition,change.old_text,change.new_text);
  end loop;
  execute definition;
end;
$patch$;
-- END patch ojjuda_note_internal.send_friend_message(uuid,text,uuid)

-- BEGIN patch ojjuda_note_internal.submit_inquiry(uuid,text)
do $patch$
declare
  definition text:=pg_get_functiondef(to_regprocedure('ojjuda_note_internal.submit_inquiry(uuid,text)'));
  change record; occurrences integer;
begin
  for change in select * from (values
    ($old$char_length(btrim(p_body))$old$,$new$char_length(replace(btrim(p_body),'❤️❤️','♥'))$new$,1)
  ) changes(old_text,new_text,expected) loop
    occurrences:=(length(definition)-length(replace(definition,change.old_text,'')))/length(change.old_text);
    if occurrences is distinct from change.expected then
      raise exception 'Changed word-mask function anchor: ojjuda_note_internal.submit_inquiry(uuid,text)';
    end if;
    definition:=replace(definition,change.old_text,change.new_text);
  end loop;
  execute definition;
end;
$patch$;
-- END patch ojjuda_note_internal.submit_inquiry(uuid,text)

-- BEGIN patch ojjuda_note_internal.admin_reply_inquiry(uuid,text,timestamp with time zone)
do $patch$
declare
  definition text:=pg_get_functiondef(to_regprocedure('ojjuda_note_internal.admin_reply_inquiry(uuid,text,timestamp with time zone)'));
  change record; occurrences integer;
begin
  for change in select * from (values
    ($old$char_length(btrim(p_reply))$old$,$new$char_length(replace(btrim(p_reply),'❤️❤️','♥'))$new$,1)
  ) changes(old_text,new_text,expected) loop
    occurrences:=(length(definition)-length(replace(definition,change.old_text,'')))/length(change.old_text);
    if occurrences is distinct from change.expected then
      raise exception 'Changed word-mask function anchor: ojjuda_note_internal.admin_reply_inquiry(uuid,text,timestamp with time zone)';
    end if;
    definition:=replace(definition,change.old_text,change.new_text);
  end loop;
  execute definition;
end;
$patch$;
-- END patch ojjuda_note_internal.admin_reply_inquiry(uuid,text,timestamp with time zone)

-- BEGIN patch public.house_save_friend_group(uuid,text,uuid[],boolean)
do $patch$
declare
  definition text:=pg_get_functiondef(to_regprocedure('public.house_save_friend_group(uuid,text,uuid[],boolean)'));
  change record; occurrences integer;
begin
  for change in select * from (values
    ($old$char_length(btrim(p_name))$old$,$new$char_length(replace(btrim(p_name),'❤️❤️','♥'))$new$,1)
  ) changes(old_text,new_text,expected) loop
    occurrences:=(length(definition)-length(replace(definition,change.old_text,'')))/length(change.old_text);
    if occurrences is distinct from change.expected then
      raise exception 'Changed word-mask function anchor: public.house_save_friend_group(uuid,text,uuid[],boolean)';
    end if;
    definition:=replace(definition,change.old_text,change.new_text);
  end loop;
  execute definition;
end;
$patch$;
-- END patch public.house_save_friend_group(uuid,text,uuid[],boolean)

-- BEGIN patch pajang_private.exchange_fields(jsonb)
do $patch$
declare
  definition text:=pg_get_functiondef(to_regprocedure('pajang_private.exchange_fields(jsonb)'));
  change record; occurrences integer;
begin
  for change in select * from (values
    ($old$char_length(txt)$old$,$new$char_length(replace(txt,'❤️❤️','♥'))$new$,1)
  ) changes(old_text,new_text,expected) loop
    occurrences:=(length(definition)-length(replace(definition,change.old_text,'')))/length(change.old_text);
    if occurrences is distinct from change.expected then
      raise exception 'Changed word-mask function anchor: pajang_private.exchange_fields(jsonb)';
    end if;
    definition:=replace(definition,change.old_text,change.new_text);
  end loop;
  execute definition;
end;
$patch$;
-- END patch pajang_private.exchange_fields(jsonb)

-- BEGIN patch pajang_private.normalize_public_profile_preferences(jsonb)
do $patch$
declare
  definition text:=pg_get_functiondef(to_regprocedure('pajang_private.normalize_public_profile_preferences(jsonb)'));
  change record; occurrences integer;
begin
  for change in select * from (values
    ($old$char_length(label)$old$,$new$char_length(replace(label,'❤️❤️','♥'))$new$,1)
  ) changes(old_text,new_text,expected) loop
    occurrences:=(length(definition)-length(replace(definition,change.old_text,'')))/length(change.old_text);
    if occurrences is distinct from change.expected then
      raise exception 'Changed word-mask function anchor: pajang_private.normalize_public_profile_preferences(jsonb)';
    end if;
    definition:=replace(definition,change.old_text,change.new_text);
  end loop;
  execute definition;
end;
$patch$;
-- END patch pajang_private.normalize_public_profile_preferences(jsonb)

-- BEGIN patch public.pajang_member(text,jsonb)
do $patch$
declare
  definition text:=pg_get_functiondef(to_regprocedure('public.pajang_member(text,jsonb)'));
  change record; occurrences integer;
begin
  for change in select * from (values
    ($old$select left(nickname,12) into display_name$old$,$new$select nickname into display_name$new$,1),
    ($old$char_length(cleanname)$old$,$new$char_length(replace(cleanname,'❤️❤️','♥'))$new$,1),
    ($old$char_length(val)$old$,$new$char_length(replace(val,'❤️❤️','♥'))$new$,2),
    ($old$(history_body is distinct from p_data->>'previousBody' and history_body is distinct from val)$old$,$new$(history_body is distinct from p_data->>'previousBody' and history_body is distinct from val
         and history_body is distinct from public.mask_banned(val))$new$,1),
    ($old$if history_body is distinct from val and public.has_banned(val) then
       raise exception 'banned_word' using errcode='P0001', hint='욕설, 음란, 마약 관련 표현은 쓸 수 없어요';
     end if;$old$,$new$if history_body is distinct from val then val:=public.mask_banned(val);end if;$new$,1),
    ($old$or a.body=val);$old$,$new$or a.body=val or a.body=public.mask_banned(val));$new$,1),
    ($old$and body=val)$old$,$new$and (body=val or body=public.mask_banned(val)))$new$,1)
  ) changes(old_text,new_text,expected) loop
    occurrences:=(length(definition)-length(replace(definition,change.old_text,'')))/length(change.old_text);
    if occurrences is distinct from change.expected then
      raise exception 'Changed word-mask function anchor: public.pajang_member(text,jsonb)';
    end if;
    definition:=replace(definition,change.old_text,change.new_text);
  end loop;
  execute definition;
end;
$patch$;
-- END patch public.pajang_member(text,jsonb)

-- BEGIN patch pajang_private.save_public_profile_preferences(jsonb,boolean)
do $patch$
declare
  definition text:=pg_get_functiondef(to_regprocedure('pajang_private.save_public_profile_preferences(jsonb,boolean)'));
  change record; occurrences integer;
begin
  for change in select * from (values
    ($old$on conflict(person) do update set preferences = excluded.preferences,version = excluded.version;$old$,$new$on conflict(person) do update set preferences = excluded.preferences,version = excluded.version
      returning public_profile_preferences.preferences into next_preferences;$new$,1)
  ) changes(old_text,new_text,expected) loop
    occurrences:=(length(definition)-length(replace(definition,change.old_text,'')))/length(change.old_text);
    if occurrences is distinct from change.expected then
      raise exception 'Changed word-mask function anchor: pajang_private.save_public_profile_preferences(jsonb,boolean)';
    end if;
    definition:=replace(definition,change.old_text,change.new_text);
  end loop;
  execute definition;
end;
$patch$;
-- END patch pajang_private.save_public_profile_preferences(jsonb,boolean)

-- BEGIN patch public.pajang_exchange(text,uuid,text,jsonb)
do $patch$
declare
  definition text:=pg_get_functiondef(to_regprocedure('public.pajang_exchange(text,uuid,text,jsonb)'));
  change record; occurrences integer;
begin
  for change in select * from (values
    ($old$  states jsonb;$old$,$new$  states jsonb; submitted_fields jsonb; saved_profile jsonb; masking jsonb;$new$,1),
    ($old$      insert into pajang_private.exchange_profiles(person,fields,show_age,show_gender)$old$,$new$      submitted_fields:=pajang_private.exchange_fields(p_data->'fields');
      insert into pajang_private.exchange_profiles(person,fields,show_age,show_gender)$new$,1),
    ($old$values(actor,pajang_private.exchange_fields(p_data->'fields'),$old$,$new$values(actor,submitted_fields,$new$,1),
    ($old$    return pajang_private.exchange_profile(actor,true);$old$,$new$    saved_profile:=pajang_private.exchange_profile(actor,true);
    if p_action='save' then
      -- A receipt covers only the canonical transformation of a submitted string.
      -- Missing fields or any other unexpected change cannot receive this receipt.
      select coalesce(jsonb_object_agg(item.key,jsonb_build_object(
        'submitted',item.value,'saved',saved_profile->'fields'->item.key)),'{}'::jsonb)
        into masking from jsonb_each(submitted_fields) item
        where jsonb_typeof(item.value)='string'
          and saved_profile->'fields'->item.key is distinct from item.value
          and saved_profile->'fields'->item.key=to_jsonb(public.mask_banned(item.value #>> '{}'));
      return saved_profile||jsonb_build_object('masking',masking);
    end if;
    return saved_profile;$new$,1)
  ) changes(old_text,new_text,expected) loop
    occurrences:=(length(definition)-length(replace(definition,change.old_text,'')))/length(change.old_text);
    if occurrences is distinct from change.expected then
      raise exception 'Changed word-mask function anchor: public.pajang_exchange(text,uuid,text,jsonb)';
    end if;
    definition:=replace(definition,change.old_text,change.new_text);
  end loop;
  execute definition;
end;
$patch$;
-- END patch public.pajang_exchange(text,uuid,text,jsonb)

-- BEGIN masked length constraints
-- Count the exact generated marker as one unit. All other text keeps its existing
-- length and byte limits, so a valid near-limit input is never truncated by masking.
do $constraint$
declare current_definition text;
begin
  select pg_get_constraintdef(oid) into current_definition from pg_constraint
    where conrelid='ojjuda_groups_internal.comments'::regclass and conname='comments_body_check';
  if current_definition is distinct from $old$CHECK (((length(TRIM(BOTH FROM body)) >= 1) AND (length(TRIM(BOTH FROM body)) <= 2000)))$old$ then
    raise exception 'Changed word-mask length constraint: ojjuda_groups_internal.comments.comments_body_check';
  end if;
  alter table ojjuda_groups_internal.comments drop constraint comments_body_check,
    add constraint comments_body_check CHECK (((length(replace(TRIM(BOTH FROM body),'❤️❤️','♥')) >= 1) AND (length(replace(TRIM(BOTH FROM body),'❤️❤️','♥')) <= 2000)));
end;
$constraint$;

do $constraint$
declare current_definition text;
begin
  select pg_get_constraintdef(oid) into current_definition from pg_constraint
    where conrelid='ojjuda_groups_internal.entries'::regclass and conname='entries_body_check';
  if current_definition is distinct from $old$CHECK ((length(body) <= 10000))$old$ then
    raise exception 'Changed word-mask length constraint: ojjuda_groups_internal.entries.entries_body_check';
  end if;
  alter table ojjuda_groups_internal.entries drop constraint entries_body_check,
    add constraint entries_body_check CHECK ((length(replace(body,'❤️❤️','♥')) <= 10000));
end;
$constraint$;

do $constraint$
declare current_definition text;
begin
  select pg_get_constraintdef(oid) into current_definition from pg_constraint
    where conrelid='ojjuda_groups_internal.entries'::regclass and conname='entries_check1';
  if current_definition is distinct from $old$CHECK ((((length(TRIM(BOTH FROM title)) + length(TRIM(BOTH FROM body))) > 0) OR (jsonb_array_length(media) > 0)))$old$ then
    raise exception 'Changed word-mask length constraint: ojjuda_groups_internal.entries.entries_check1';
  end if;
  alter table ojjuda_groups_internal.entries drop constraint entries_check1,
    add constraint entries_check1 CHECK ((((length(replace(TRIM(BOTH FROM title),'❤️❤️','♥')) + length(replace(TRIM(BOTH FROM body),'❤️❤️','♥'))) > 0) OR (jsonb_array_length(media) > 0)));
end;
$constraint$;

do $constraint$
declare current_definition text;
begin
  select pg_get_constraintdef(oid) into current_definition from pg_constraint
    where conrelid='ojjuda_groups_internal.entries'::regclass and conname='entries_location_check';
  if current_definition is distinct from $old$CHECK ((length(location) <= 200))$old$ then
    raise exception 'Changed word-mask length constraint: ojjuda_groups_internal.entries.entries_location_check';
  end if;
  alter table ojjuda_groups_internal.entries drop constraint entries_location_check,
    add constraint entries_location_check CHECK ((length(replace(location,'❤️❤️','♥')) <= 200));
end;
$constraint$;

do $constraint$
declare current_definition text;
begin
  select pg_get_constraintdef(oid) into current_definition from pg_constraint
    where conrelid='ojjuda_groups_internal.entries'::regclass and conname='entries_title_check';
  if current_definition is distinct from $old$CHECK ((length(title) <= 120))$old$ then
    raise exception 'Changed word-mask length constraint: ojjuda_groups_internal.entries.entries_title_check';
  end if;
  alter table ojjuda_groups_internal.entries drop constraint entries_title_check,
    add constraint entries_title_check CHECK ((length(replace(title,'❤️❤️','♥')) <= 120));
end;
$constraint$;

do $constraint$
declare current_definition text;
begin
  select pg_get_constraintdef(oid) into current_definition from pg_constraint
    where conrelid='ojjuda_groups_internal.entries'::regclass and conname='group_activity_is_post';
  if current_definition is distinct from $old$CHECK (((activity IS NULL) OR ((kind = 'post'::text) AND (length(btrim(title)) > 0))))$old$ then
    raise exception 'Changed word-mask length constraint: ojjuda_groups_internal.entries.group_activity_is_post';
  end if;
  alter table ojjuda_groups_internal.entries drop constraint group_activity_is_post,
    add constraint group_activity_is_post CHECK (((activity IS NULL) OR ((kind = 'post'::text) AND (length(replace(btrim(title),'❤️❤️','♥')) > 0))));
end;
$constraint$;

do $constraint$
declare current_definition text;
begin
  select pg_get_constraintdef(oid) into current_definition from pg_constraint
    where conrelid='ojjuda_groups_internal.rooms'::regclass and conname='rooms_description_check';
  if current_definition is distinct from $old$CHECK ((length(description) <= 300))$old$ then
    raise exception 'Changed word-mask length constraint: ojjuda_groups_internal.rooms.rooms_description_check';
  end if;
  alter table ojjuda_groups_internal.rooms drop constraint rooms_description_check,
    add constraint rooms_description_check CHECK ((length(replace(description,'❤️❤️','♥')) <= 300));
end;
$constraint$;

do $constraint$
declare current_definition text;
begin
  select pg_get_constraintdef(oid) into current_definition from pg_constraint
    where conrelid='ojjuda_groups_internal.rooms'::regclass and conname='rooms_name_check';
  if current_definition is distinct from $old$CHECK (((length(name) >= 1) AND (length(name) <= 60)))$old$ then
    raise exception 'Changed word-mask length constraint: ojjuda_groups_internal.rooms.rooms_name_check';
  end if;
  alter table ojjuda_groups_internal.rooms drop constraint rooms_name_check,
    add constraint rooms_name_check CHECK (((length(replace(name,'❤️❤️','♥')) >= 1) AND (length(replace(name,'❤️❤️','♥')) <= 60)));
end;
$constraint$;

do $constraint$
declare current_definition text;
begin
  select pg_get_constraintdef(oid) into current_definition from pg_constraint
    where conrelid='ojjuda_note_internal.friend_messages'::regclass and conname='friend_messages_body_check';
  if current_definition is distinct from $old$CHECK ((((length(body) >= 1) AND (length(body) <= 1000)) AND (octet_length(body) <= 4000)))$old$ then
    raise exception 'Changed word-mask length constraint: ojjuda_note_internal.friend_messages.friend_messages_body_check';
  end if;
  alter table ojjuda_note_internal.friend_messages drop constraint friend_messages_body_check,
    add constraint friend_messages_body_check CHECK ((((length(replace(body,'❤️❤️','♥')) >= 1) AND (length(replace(body,'❤️❤️','♥')) <= 1000)) AND (octet_length(replace(body,'❤️❤️','x')) <= 4000)));
end;
$constraint$;

do $constraint$
declare current_definition text;
begin
  select pg_get_constraintdef(oid) into current_definition from pg_constraint
    where conrelid='ojjuda_note_internal.inquiries'::regclass and conname='inquiries_body_check';
  if current_definition is distinct from $old$CHECK (((char_length(btrim(body)) >= 1) AND (char_length(btrim(body)) <= 2000)))$old$ then
    raise exception 'Changed word-mask length constraint: ojjuda_note_internal.inquiries.inquiries_body_check';
  end if;
  alter table ojjuda_note_internal.inquiries drop constraint inquiries_body_check,
    add constraint inquiries_body_check CHECK (((char_length(replace(btrim(body),'❤️❤️','♥')) >= 1) AND (char_length(replace(btrim(body),'❤️❤️','♥')) <= 2000)));
end;
$constraint$;

do $constraint$
declare current_definition text;
begin
  select pg_get_constraintdef(oid) into current_definition from pg_constraint
    where conrelid='ojjuda_note_internal.inquiries'::regclass and conname='inquiries_reply_check';
  if current_definition is distinct from $old$CHECK ((char_length(reply) <= 2000))$old$ then
    raise exception 'Changed word-mask length constraint: ojjuda_note_internal.inquiries.inquiries_reply_check';
  end if;
  alter table ojjuda_note_internal.inquiries drop constraint inquiries_reply_check,
    add constraint inquiries_reply_check CHECK ((char_length(replace(reply,'❤️❤️','♥')) <= 2000));
end;
$constraint$;

do $constraint$
declare current_definition text;
begin
  select pg_get_constraintdef(oid) into current_definition from pg_constraint
    where conrelid='pajang_private.answers'::regclass and conname='answers_body_check';
  if current_definition is distinct from $old$CHECK (((char_length(body) >= 1) AND (char_length(body) <= 220)))$old$ then
    raise exception 'Changed word-mask length constraint: pajang_private.answers.answers_body_check';
  end if;
  alter table pajang_private.answers drop constraint answers_body_check,
    add constraint answers_body_check CHECK (((char_length(replace(body,'❤️❤️','♥')) >= 1) AND (char_length(replace(body,'❤️❤️','♥')) <= 220)));
end;
$constraint$;

do $constraint$
declare current_definition text;
begin
  select pg_get_constraintdef(oid) into current_definition from pg_constraint
    where conrelid='pajang_private.messages'::regclass and conname='messages_body_check';
  if current_definition is distinct from $old$CHECK (((char_length(body) >= 1) AND (char_length(body) <= 500)))$old$ then
    raise exception 'Changed word-mask length constraint: pajang_private.messages.messages_body_check';
  end if;
  alter table pajang_private.messages drop constraint messages_body_check,
    add constraint messages_body_check CHECK (((char_length(replace(body,'❤️❤️','♥')) >= 1) AND (char_length(replace(body,'❤️❤️','♥')) <= 500)));
end;
$constraint$;

do $constraint$
declare current_definition text;
begin
  select pg_get_constraintdef(oid) into current_definition from pg_constraint
    where conrelid='pajang_private.people'::regclass and conname='people_name_check';
  if current_definition is distinct from $old$CHECK (((char_length(name) >= 1) AND (char_length(name) <= 12)))$old$ then
    raise exception 'Changed word-mask length constraint: pajang_private.people.people_name_check';
  end if;
  alter table pajang_private.people drop constraint people_name_check,
    add constraint people_name_check CHECK (((char_length(replace(name,'❤️❤️','♥')) >= 1) AND (char_length(replace(name,'❤️❤️','♥')) <= 12)));
end;
$constraint$;

do $constraint$
declare current_definition text;
begin
  select pg_get_constraintdef(oid) into current_definition from pg_constraint
    where conrelid='pajang_private.signals'::regclass and conname='signals_note_check';
  if current_definition is distinct from $old$CHECK ((char_length(note) <= 120))$old$ then
    raise exception 'Changed word-mask length constraint: pajang_private.signals.signals_note_check';
  end if;
  alter table pajang_private.signals drop constraint signals_note_check,
    add constraint signals_note_check CHECK ((char_length(replace(note,'❤️❤️','♥')) <= 120));
end;
$constraint$;

do $constraint$
declare current_definition text;
begin
  select pg_get_constraintdef(oid) into current_definition from pg_constraint
    where conrelid='public.diaries'::regclass and conname='diaries_body_check';
  if current_definition is distinct from $old$CHECK ((char_length(body) <= 2000))$old$ then
    raise exception 'Changed word-mask length constraint: public.diaries.diaries_body_check';
  end if;
  alter table public.diaries drop constraint diaries_body_check,
    add constraint diaries_body_check CHECK ((char_length(replace(body,'❤️❤️','♥')) <= 2000));
end;
$constraint$;

do $constraint$
declare current_definition text;
begin
  select pg_get_constraintdef(oid) into current_definition from pg_constraint
    where conrelid='public.diaries'::regclass and conname='diaries_title_check';
  if current_definition is distinct from $old$CHECK ((char_length(title) <= 60))$old$ then
    raise exception 'Changed word-mask length constraint: public.diaries.diaries_title_check';
  end if;
  alter table public.diaries drop constraint diaries_title_check,
    add constraint diaries_title_check CHECK ((char_length(replace(title,'❤️❤️','♥')) <= 60));
end;
$constraint$;

do $constraint$
declare current_definition text;
begin
  select pg_get_constraintdef(oid) into current_definition from pg_constraint
    where conrelid='public.feedback'::regclass and conname='feedback_body_check';
  if current_definition is distinct from $old$CHECK (((char_length(body) >= 1) AND (char_length(body) <= 2000)))$old$ then
    raise exception 'Changed word-mask length constraint: public.feedback.feedback_body_check';
  end if;
  alter table public.feedback drop constraint feedback_body_check,
    add constraint feedback_body_check CHECK (((char_length(replace(body,'❤️❤️','♥')) >= 1) AND (char_length(replace(body,'❤️❤️','♥')) <= 2000)));
end;
$constraint$;

do $constraint$
declare current_definition text;
begin
  select pg_get_constraintdef(oid) into current_definition from pg_constraint
    where conrelid='public.guestbook'::regclass and conname='guestbook_body_check';
  if current_definition is distinct from $old$CHECK (((char_length(body) >= 1) AND (char_length(body) <= 500)))$old$ then
    raise exception 'Changed word-mask length constraint: public.guestbook.guestbook_body_check';
  end if;
  alter table public.guestbook drop constraint guestbook_body_check,
    add constraint guestbook_body_check CHECK (((char_length(replace(body,'❤️❤️','♥')) >= 1) AND (char_length(replace(body,'❤️❤️','♥')) <= 500)));
end;
$constraint$;

do $constraint$
declare current_definition text;
begin
  select pg_get_constraintdef(oid) into current_definition from pg_constraint
    where conrelid='public.guestbook'::regclass and conname='guestbook_reply_check';
  if current_definition is distinct from $old$CHECK ((char_length(reply) <= 300))$old$ then
    raise exception 'Changed word-mask length constraint: public.guestbook.guestbook_reply_check';
  end if;
  alter table public.guestbook drop constraint guestbook_reply_check,
    add constraint guestbook_reply_check CHECK ((char_length(replace(reply,'❤️❤️','♥')) <= 300));
end;
$constraint$;

do $constraint$
declare current_definition text;
begin
  select pg_get_constraintdef(oid) into current_definition from pg_constraint
    where conrelid='public.house_friend_groups'::regclass and conname='house_friend_groups_name_check';
  if current_definition is distinct from $old$CHECK (((name = btrim(name)) AND ((char_length(name) >= 1) AND (char_length(name) <= 20))))$old$ then
    raise exception 'Changed word-mask length constraint: public.house_friend_groups.house_friend_groups_name_check';
  end if;
  alter table public.house_friend_groups drop constraint house_friend_groups_name_check,
    add constraint house_friend_groups_name_check CHECK (((name = btrim(name)) AND ((char_length(replace(name,'❤️❤️','♥')) >= 1) AND (char_length(replace(name,'❤️❤️','♥')) <= 20))));
end;
$constraint$;

do $constraint$
declare current_definition text;
begin
  select pg_get_constraintdef(oid) into current_definition from pg_constraint
    where conrelid='public.intros'::regclass and conname='intros_body_check';
  if current_definition is distinct from $old$CHECK (((char_length(body) >= 1) AND (char_length(body) <= 40)))$old$ then
    raise exception 'Changed word-mask length constraint: public.intros.intros_body_check';
  end if;
  alter table public.intros drop constraint intros_body_check,
    add constraint intros_body_check CHECK (((char_length(replace(body,'❤️❤️','♥')) >= 1) AND (char_length(replace(body,'❤️❤️','♥')) <= 40)));
end;
$constraint$;

do $constraint$
declare current_definition text;
begin
  select pg_get_constraintdef(oid) into current_definition from pg_constraint
    where conrelid='public.media'::regclass and conname='media_caption_check';
  if current_definition is distinct from $old$CHECK ((char_length(caption) <= 100))$old$ then
    raise exception 'Changed word-mask length constraint: public.media.media_caption_check';
  end if;
  alter table public.media drop constraint media_caption_check,
    add constraint media_caption_check CHECK ((char_length(replace(caption,'❤️❤️','♥')) <= 100));
end;
$constraint$;

do $constraint$
declare current_definition text;
begin
  select pg_get_constraintdef(oid) into current_definition from pg_constraint
    where conrelid='public.media_folders'::regclass and conname='media_folders_name_check';
  if current_definition is distinct from $old$CHECK (((char_length(name) >= 1) AND (char_length(name) <= 20)))$old$ then
    raise exception 'Changed word-mask length constraint: public.media_folders.media_folders_name_check';
  end if;
  alter table public.media_folders drop constraint media_folders_name_check,
    add constraint media_folders_name_check CHECK (((char_length(replace(name,'❤️❤️','♥')) >= 1) AND (char_length(replace(name,'❤️❤️','♥')) <= 20)));
end;
$constraint$;

do $constraint$
declare current_definition text;
begin
  select pg_get_constraintdef(oid) into current_definition from pg_constraint
    where conrelid='public.place_messages'::regclass and conname='place_messages_body_check';
  if current_definition is distinct from $old$CHECK (((char_length(body) >= 1) AND (char_length(body) <= 60)))$old$ then
    raise exception 'Changed word-mask length constraint: public.place_messages.place_messages_body_check';
  end if;
  alter table public.place_messages drop constraint place_messages_body_check,
    add constraint place_messages_body_check CHECK (((char_length(replace(body,'❤️❤️','♥')) >= 1) AND (char_length(replace(body,'❤️❤️','♥')) <= 60)));
end;
$constraint$;

do $constraint$
declare current_definition text;
begin
  select pg_get_constraintdef(oid) into current_definition from pg_constraint
    where conrelid='public.profiles'::regclass and conname='profiles_bio_check';
  if current_definition is distinct from $old$CHECK ((char_length(bio) <= 40))$old$ then
    raise exception 'Changed word-mask length constraint: public.profiles.profiles_bio_check';
  end if;
  alter table public.profiles drop constraint profiles_bio_check,
    add constraint profiles_bio_check CHECK ((char_length(replace(bio,'❤️❤️','♥')) <= 40));
end;
$constraint$;

do $constraint$
declare current_definition text;
begin
  select pg_get_constraintdef(oid) into current_definition from pg_constraint
    where conrelid='public.profiles'::regclass and conname='profiles_mood_text_check';
  if current_definition is distinct from $old$CHECK ((char_length(mood_text) <= 16))$old$ then
    raise exception 'Changed word-mask length constraint: public.profiles.profiles_mood_text_check';
  end if;
  alter table public.profiles drop constraint profiles_mood_text_check,
    add constraint profiles_mood_text_check CHECK ((char_length(replace(mood_text,'❤️❤️','♥')) <= 16));
end;
$constraint$;

do $constraint$
declare current_definition text;
begin
  select pg_get_constraintdef(oid) into current_definition from pg_constraint
    where conrelid='public.profiles'::regclass and conname='profiles_nickname_check';
  if current_definition is distinct from $old$CHECK (((char_length(nickname) >= 1) AND (char_length(nickname) <= 12)))$old$ then
    raise exception 'Changed word-mask length constraint: public.profiles.profiles_nickname_check';
  end if;
  alter table public.profiles drop constraint profiles_nickname_check,
    add constraint profiles_nickname_check CHECK (((char_length(replace(nickname,'❤️❤️','♥')) >= 1) AND (char_length(replace(nickname,'❤️❤️','♥')) <= 12)));
end;
$constraint$;

-- END masked length constraints

-- BEGIN patch public.ensure_member_for_note(text)
do $patch$
declare definition text:=pg_get_functiondef(to_regprocedure('public.ensure_member_for_note(text)'));old_text text:='pg_catalog.char_length(v_name)';
begin
  if (length(definition)-length(replace(definition,old_text,'')))/length(old_text) is distinct from 1 then
    raise exception 'Changed word-mask function anchor: public.ensure_member_for_note(text)';
  end if;
  execute replace(definition,old_text,$new$pg_catalog.char_length(replace(v_name,'❤️❤️','♥'))$new$);
end;
$patch$;
-- END patch public.ensure_member_for_note(text)

-- BEGIN patch public.admin_rename_user(uuid,text)
do $patch$
declare definition text:=pg_get_functiondef(to_regprocedure('public.admin_rename_user(uuid,text)'));old_text text:='char_length(v_nick)';
begin
  if (length(definition)-length(replace(definition,old_text,'')))/length(old_text) is distinct from 2 then
    raise exception 'Changed word-mask function anchor: public.admin_rename_user(uuid,text)';
  end if;
  execute replace(definition,old_text,$new$char_length(replace(v_nick,'❤️❤️','♥'))$new$);
end;
$patch$;
-- END patch public.admin_rename_user(uuid,text)
