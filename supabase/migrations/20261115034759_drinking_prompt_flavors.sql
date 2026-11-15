-- Older cards without an editorial label continue using the existing client classifier.
alter table ojjuda_arcade_internal.drinking_content_items
 add column prompt_flavor text check (prompt_flavor is null or (prompt_flavor in ('mild','spicy')
  and kind in ('king','fingers','imagevote','minority')));

do $migration$
declare
 definition text := pg_get_functiondef('ojjuda_arcade_internal.drinking_content(text,jsonb)'::regprocedure);
 needle text;
begin
 needle := ' favor_party boolean;';
 if strpos(definition,needle)=0 then raise exception 'pool_declaration_changed'; end if;
 definition := replace(definition,needle,needle||$new$
 flavor_banks jsonb := '{}';
 levels jsonb;
 include_flavors boolean := coalesce(p_options->'include_flavors'='true'::jsonb,false);$new$);
 needle := $old$     into lines from ojjuda_arcade_internal.drinking_content_items where active and kind=requested and (not coalesce(favor_party,false) or party_pick);$old$;
 if strpos(definition,needle)=0 then raise exception 'pool_items_query_changed'; end if;
 definition := replace(definition,needle,$new$     ,coalesce(jsonb_agg(prompt_flavor order by id) filter(where include_flavors),'[]'::jsonb)
     into lines,levels from ojjuda_arcade_internal.drinking_content_items where active and kind=requested and (not coalesce(favor_party,false) or party_pick);
    if include_flavors and requested in ('king','fingers','imagevote','minority') then
     flavor_banks:=jsonb_set(flavor_banks,array[requested],levels);
    end if;$new$);
 needle := $old$  return jsonb_build_object('banks',result);$old$;
 if strpos(definition,needle)=0 then raise exception 'pool_response_changed'; end if;
 execute replace(definition,needle,$new$  return jsonb_build_object('banks',result) ||
    case when flavor_banks='{}'::jsonb then '{}'::jsonb else jsonb_build_object('flavors',flavor_banks) end;$new$);
end;
$migration$;
