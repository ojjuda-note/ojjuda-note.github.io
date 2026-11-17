-- Auth can write signup metadata a second time after the insert trigger has
-- recorded the private identity. Keep both email-auth metadata copies clean.
SET LOCAL lock_timeout = '4s';

CREATE FUNCTION ojjuda_account_internal.strip_captured_signup_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  private_keys CONSTANT text[] := ARRAY['birth_yymmdd','gender_code','phone_number','birth_date','gender'];
BEGIN
  IF TG_RELID = 'auth.users'::regclass THEN
    IF EXISTS (SELECT FROM ojjuda_account_internal.member_identity WHERE user_id = NEW.id) THEN
      NEW.raw_user_meta_data := NEW.raw_user_meta_data - private_keys;
    END IF;
  ELSIF TG_RELID = 'auth.identities'::regclass THEN
    IF EXISTS (SELECT FROM ojjuda_account_internal.member_identity WHERE user_id = NEW.user_id) THEN
      NEW.identity_data := NEW.identity_data - private_keys;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION ojjuda_account_internal.strip_captured_signup_fields() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER strip_captured_signup_fields BEFORE UPDATE OF raw_user_meta_data ON auth.users
  FOR EACH ROW WHEN (NEW.raw_user_meta_data ?| ARRAY['birth_yymmdd','gender_code','phone_number','birth_date','gender'])
  EXECUTE FUNCTION ojjuda_account_internal.strip_captured_signup_fields();
CREATE TRIGGER strip_captured_signup_fields BEFORE INSERT OR UPDATE OF identity_data, provider ON auth.identities
  FOR EACH ROW WHEN (NEW.provider = 'email' AND NEW.identity_data ?| ARRAY['birth_yymmdd','gender_code','phone_number','birth_date','gender'])
  EXECUTE FUNCTION ojjuda_account_internal.strip_captured_signup_fields();

-- Apply the same redaction to existing members only after their private row exists.
UPDATE auth.users u SET raw_user_meta_data = u.raw_user_meta_data - ARRAY['birth_yymmdd','gender_code','phone_number','birth_date','gender']
FROM ojjuda_account_internal.member_identity i
WHERE u.id = i.user_id AND u.raw_user_meta_data ?| ARRAY['birth_yymmdd','gender_code','phone_number','birth_date','gender'];
UPDATE auth.identities e SET identity_data = e.identity_data - ARRAY['birth_yymmdd','gender_code','phone_number','birth_date','gender']
FROM ojjuda_account_internal.member_identity i
WHERE e.provider = 'email' AND e.user_id = i.user_id AND e.identity_data ?| ARRAY['birth_yymmdd','gender_code','phone_number','birth_date','gender'];
