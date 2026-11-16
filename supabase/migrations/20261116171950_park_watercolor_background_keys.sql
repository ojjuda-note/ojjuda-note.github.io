-- Extend built-in Park backgrounds without changing how cards are published or licensed.
-- The guest-only check still requires key 10. Photo rentals retain their existing term and price.
DO $migration$
DECLARE
  old_keys constant text := '^([1-9][0-9]|1[0-8][0-9])$';
  new_keys constant text := '^([1-9][0-9]|1[0-9]{2}|2[0-8][0-9]|29[0-7])$';
  old_roll constant text := '10 + floor(random() * 180)';
  new_roll constant text := '10 + floor(random() * 288)';
  target record;
  original_definition text;
  revised_definition text;
BEGIN
  -- Rebuild each check from its current definition to retain null, plain and inactive-draft rules.
  FOR target IN
    SELECT * FROM (VALUES
      ('ojjuda_note.cards'::regclass, 'cards_background_key_check'),
      ('ojjuda_note_internal.card_visuals'::regclass, 'card_visuals_photo_key_check'),
      ('ojjuda_note_internal.card_photo_entitlements'::regclass, 'card_photo_entitlements_photo_key_check'),
      ('ojjuda_note_internal.card_photo_refunds'::regclass, 'card_photo_refunds_photo_key_check'),
      ('ojjuda_note_internal.drafts'::regclass, 'note_draft_content')
    ) AS checks(table_oid, check_name)
  LOOP
    SELECT pg_get_constraintdef(oid) INTO STRICT original_definition
      FROM pg_constraint WHERE conrelid = target.table_oid AND conname = target.check_name;
    IF position(old_keys IN original_definition) = 0 THEN
      RAISE EXCEPTION 'Missing expected photo key range in %.%', target.table_oid, target.check_name;
    END IF;
    revised_definition := replace(original_definition, old_keys, new_keys);
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I, ADD CONSTRAINT %I %s',
      target.table_oid, target.check_name, target.check_name, revised_definition);
  END LOOP;

  -- Preserve the bodies, signatures, ACLs and security modes of each installed RPC/trigger.
  FOR target IN
    SELECT * FROM (VALUES
      ('ojjuda_note.admin_edit_card_visual(uuid,jsonb,text,timestamp with time zone,timestamp with time zone,text)'::regprocedure, false),
      ('ojjuda_note.apply_owned_card_photo(uuid,text,uuid)'::regprocedure, false),
      ('ojjuda_note.publish_event(uuid,text,text[],text,jsonb,double precision,double precision,integer,timestamp with time zone,integer,text)'::regprocedure, true),
      ('ojjuda_note.purchase_card_photo(uuid,text,uuid)'::regprocedure, false),
      ('ojjuda_note_internal.capture_paid_card_photo_entitlement()'::regprocedure, false),
      ('ojjuda_note_internal.card_visual_for(uuid)'::regprocedure, false),
      ('ojjuda_note_internal.publish_card_core(uuid,text,text,text[],text,jsonb,double precision,double precision,uuid,text)'::regprocedure, true),
      ('ojjuda_note_internal.save_draft(bigint,jsonb)'::regprocedure, false)
    ) AS routines(function_oid, has_free_roll)
  LOOP
    original_definition := pg_get_functiondef(target.function_oid);
    IF position(old_keys IN original_definition) = 0
        OR (target.has_free_roll AND position(old_roll IN original_definition) = 0) THEN
      RAISE EXCEPTION 'Missing expected Park background validation in %', target.function_oid;
    END IF;
    revised_definition := replace(original_definition, old_keys, new_keys);
    IF target.has_free_roll THEN
      revised_definition := replace(revised_definition, old_roll, new_roll);
    END IF;
    EXECUTE revised_definition;
  END LOOP;
END;
$migration$;

