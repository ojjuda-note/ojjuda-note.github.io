-- Initial internal infrastructure; starts DISABLED.
-- Apply auto_daily_note_cards_v2_2026_09_28.sql before activation. V2 removes
-- the original public provenance tags and requires fresh daily staged copy.

CREATE TABLE IF NOT EXISTS ojjuda_note_internal.auto_card_copy (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  body text NOT NULL UNIQUE CHECK (ojjuda_note_internal.valid_note_body(body))
);

CREATE TABLE IF NOT EXISTS ojjuda_note_internal.auto_card_sites (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sido text NOT NULL,
  district text NOT NULL,
  public_place text NOT NULL,
  lat double precision NOT NULL CHECK (lat BETWEEN 33 AND 39),
  lon double precision NOT NULL CHECK (lon BETWEEN 124 AND 132),
  UNIQUE (sido, district, public_place)
);

CREATE TABLE IF NOT EXISTS ojjuda_note_internal.auto_card_config (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  author_id uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  enabled boolean NOT NULL DEFAULT false,
  starts_on date NOT NULL DEFAULT ((now() AT TIME ZONE 'Asia/Seoul')::date),
  CHECK (NOT enabled OR author_id IS NOT NULL)
);

INSERT INTO ojjuda_note_internal.auto_card_config(singleton)
VALUES (true) ON CONFLICT (singleton) DO NOTHING;

CREATE TABLE IF NOT EXISTS ojjuda_note_internal.auto_card_schedule (
  local_day date NOT NULL,
  slot smallint NOT NULL CHECK (slot BETWEEN 1 AND 10),
  planned_at timestamptz NOT NULL,
  copy_id bigint NOT NULL REFERENCES ojjuda_note_internal.auto_card_copy(id),
  site_id bigint NOT NULL REFERENCES ojjuda_note_internal.auto_card_sites(id),
  gender text NOT NULL CHECK (gender IN ('male','female')),
  request_id uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  card_id uuid UNIQUE REFERENCES ojjuda_note.cards(id) ON DELETE SET NULL,
  posted_at timestamptz,
  PRIMARY KEY (local_day, slot),
  UNIQUE (local_day, copy_id),
  UNIQUE (local_day, site_id),
  CHECK ((posted_at IS NULL AND card_id IS NULL) OR posted_at IS NOT NULL)
);

-- Internal schema is not exposed to the Data API. RLS and grants add defense in depth.
ALTER TABLE ojjuda_note_internal.auto_card_copy ENABLE ROW LEVEL SECURITY;
ALTER TABLE ojjuda_note_internal.auto_card_sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE ojjuda_note_internal.auto_card_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE ojjuda_note_internal.auto_card_schedule ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE ojjuda_note_internal.auto_card_copy,
  ojjuda_note_internal.auto_card_sites,
  ojjuda_note_internal.auto_card_config,
  ojjuda_note_internal.auto_card_schedule FROM PUBLIC, anon, authenticated;

INSERT INTO ojjuda_note_internal.auto_card_copy(body)
SELECT value FROM jsonb_array_elements_text($auto_copy_seed$["서두르지 않은 하루에도 작은 진전은 있다. 오늘의 한 걸음이 내일의 발을 가볍게 한다.","마음을 정리하는 데 꼭 정답이 필요한 건 아니다. 잠깐 숨을 고르는 것만으로도 길이 보인다.","잘한 일이 하나도 떠오르지 않는 날엔 무사히 지나온 순간을 세어 본다.","손에서 놓은 걱정 하나만큼 오늘의 주머니가 가벼워졌다.","새로운 시작은 큰 결심보다 책상 위의 작은 자리 하나에서 시작되기도 한다.","계획이 조금 어긋나도 하루 전체가 실패한 건 아니다. 다른 길을 발견한 셈이다.","멈춰 선 시간에도 마음은 천천히 자라고 있다.","오늘 다 못한 일은 내일의 나에게 친절한 순서로 남겨 두자.","숨을 길게 내쉬는 동안 마음의 모서리도 조금 둥글어진다.","작은 약속 하나를 지킨 날은 남에게 보이지 않아도 단단하다.","반가운 연락은 짧은 문장이어도 오래 따뜻하다.","서로의 하루를 다 알 수 없어서, 인사 한마디가 더 소중해진다.","가까운 사람에게 다정한 말을 아끼지 않는 연습을 해 본다.","기다려 준 사람의 마음은 느리게 도착해도 분명히 전해진다.","같이 웃었던 작은 장면이 긴 하루의 균형을 잡아 준다.","안부를 묻는 일은 멀리 있는 마음에 작은 불을 켜는 일 같다.","서로 다른 속도로 걷더라도 같은 방향을 바라볼 수 있다.","누군가의 편이 되어 주는 일은 거창한 문장보다 귀 기울이는 시간에 가깝다.","오래 못 본 얼굴이 떠오르면 짧은 안부 하나를 보내도 좋겠다.","다정함은 대개 특별한 날보다 평범한 순간에 더 선명하다.","컵에 남은 온기처럼 사소한 친절은 생각보다 오래 간다.","창가에 놓인 빛 한 조각이 방의 분위기를 바꾸었다.","문득 좋아하는 노래가 들리면 같은 길도 조금 새로워진다.","평소처럼 걷던 길에 처음 보는 색이 하나 있었다.","식탁 위의 작은 여백이 오늘은 유난히 편안하다.","접어 둔 옷의 가지런함에서 뜻밖의 평온을 발견한다.","익숙한 향기 하나가 마음속 오래된 서랍을 열었다.","가방 속에 넣어 둔 간식 하나가 하루의 쉼표가 된다.","창문을 열고 들어온 공기만큼 생각도 새로 고쳐 본다.","불을 켜는 순간 방 안에 돌아올 자리가 생긴다.","천천히 먹은 한 끼가 바쁜 생각까지 잠깐 앉혀 준다.","조용한 틈을 발견하면 아무 말도 하지 않고 그 자리에 머물러 본다.","몸이 먼저 쉬어야 마음도 편히 앉을 자리를 찾는다.","빈 종이를 앞에 두고 아무것도 적지 않아도 괜찮은 시간.","속도를 늦추자 지나치던 것들이 제 크기를 되찾았다.","해야 할 일을 잠깐 내려놓고 좋아하는 일을 한 숟갈 곁들인다.","쉬어 가는 시간은 멈춘 시간이 아니라 돌아올 힘을 모으는 시간이다.","가끔은 답을 찾는 대신 따뜻한 물을 한 잔 마신다.","정리가 안 된 마음에도 앉을 자리 하나쯤은 남겨 두자.","오늘의 쉼은 다음 장을 넘기기 전에 끼워 둔 책갈피 같다.","조용함이 필요할 때는 알림을 잠시 접어 두어도 된다.","시작하기 전의 떨림도 시작한 뒤의 이야기에 들어간다.","잘 모르겠다는 말은 배우려는 마음의 첫 문장일 수 있다.","어제보다 한 번 더 해 본 것만으로도 방향이 달라진다.","새 길에 발을 올려놓기까지 걸린 시간도 여정에 포함된다.","실수의 자리에 다시 시도해 본 흔적이 쌓인다.","완벽한 때를 기다리다 놓친 것보다 서툴게 시작한 것이 오래 남기도 한다.","한 번의 용기는 늘 커다란 소리로 나타나지 않는다.","모르는 길 앞에서 지도를 펴는 것도 충분히 용감한 일이다.","조금 느려도 스스로 고른 걸음에는 다른 힘이 있다.","고민 끝에 내린 작은 결정이 오늘의 풍경을 바꾼다.","돌아보면 사소했던 선택들이 지금의 나를 조용히 데려왔다.","기억은 사진처럼 멈춰 있지 않고 오늘의 마음에 따라 색을 바꾼다.","오래된 메모를 다시 읽으니 그때의 나도 꽤 열심히 살았다.","지나간 날을 떠올릴 때는 부족했던 것보다 애쓴 마음을 먼저 본다.","잊은 줄 알았던 멜로디가 익숙한 장면을 데려왔다.","한때 소중했던 것을 떠올리는 일이 지금의 하루도 따뜻하게 한다.","그리움은 돌아갈 수 없다는 뜻보다 잘 간직했다는 뜻에 가깝다.","예전의 나에게 건네고 싶은 말을 오늘의 나에게 먼저 해 준다.","문득 떠오른 웃음소리를 마음속 작은 상자에 담아 둔다.","시간이 흐른 뒤에도 남는 것은 대개 함께 보낸 평범한 오후다.","익숙한 길 끝에 아직 모르는 장면이 기다리고 있다.","지도의 빈 공간을 볼 때면 발보다 마음이 먼저 걸어간다.","낯선 풍경이 꼭 멀리 있어야 하는 것은 아니다.","길을 조금 돌아가면 서두를 때 놓쳤던 표정이 보인다.","어느 동네든 처음 보는 골목에는 새로운 리듬이 있다.","창밖 풍경이 바뀌는 동안 마음의 매듭도 느슨해진다.","발걸음의 목적지가 없어도 돌아오는 길에 이야기가 하나 생긴다.","멀리 가지 않아도 하루의 모양을 바꾸는 산책이 있다.","길 위에서는 알지 못한 것을 만나는 기쁨이 있다.","오늘의 풍경을 오래 기억하지 못해도 걸었던 감각은 남는다.","꽃이 피는 때가 서로 다르듯 마음이 활짝 열리는 때도 다르다.","바람의 방향이 바뀌면 같은 나무도 새 소리를 낸다.","구름이 지나간 자리에 하늘의 넓이가 다시 보인다.","푸른 잎 하나에도 여러 빛이 섞여 있다는 걸 가만히 들여다본다.","계절이 바뀔 때마다 자주 걷던 길에 다른 표정이 생긴다.","땅에 닿은 빗방울처럼 작은 생각이 둥근 파문을 만든다.","햇살이 닿는 각도만 달라져도 같은 벽이 다르게 보인다.","나무 그림자가 길어지면 걸음도 따라 느긋해진다.","공기가 달라졌다는 느낌 하나로 새 장을 넘긴 듯하다.","흐린 날에도 빛은 어딘가를 돌아 천천히 도착한다.","오늘은 스스로에게도 고맙다는 말을 건네 본다.","애쓴 흔적은 눈에 잘 띄지 않아도 몸과 마음이 알고 있다.","나에게 너그러워지는 연습은 하루에 한 번이면 충분하다.","모든 일을 잘하지 않아도 좋아하는 것을 좋아할 자격은 그대로다.","비교를 잠시 접으니 내 걸음의 소리가 들린다.","마음에 여유가 없는 날에도 한 가지 기쁜 일을 찾을 수 있다.","오늘의 나는 지난날들이 모여 만든 꽤 성실한 결과다.","대답을 미뤄도 되는 질문이 있고, 천천히 풀어도 되는 마음이 있다.","나를 기다리는 일에도 작은 다정함이 필요하다.","내가 좋아하는 것들을 하나씩 기억하는 시간이 나를 더 또렷하게 한다.","새로운 페이지가 비어 있는 건 채울 수 있는 자리가 남았다는 뜻이다.","희망은 멀리서 번쩍이기보다 가까운 곳에서 조용히 켜질 때가 있다.","지금은 보이지 않아도 씨앗 아래에서는 다음 장면이 준비된다.","잘 풀리지 않던 매듭도 한쪽 끝을 찾으면 조금씩 느슨해진다.","작은 웃음 하나가 예상하지 못한 곳에서 하루를 바꾼다.","가장 멀어 보이던 일이 어느 날 손 닿는 거리에 온다.","마음에 빈자리가 생기면 좋은 것이 들어올 틈도 생긴다.","오늘의 작은 기쁨을 내일의 나에게 건네줄 수 있으면 좋겠다.","계속 걷다 보면 처음의 걱정이 작은 점처럼 보일 때가 있다.","아직 쓰이지 않은 좋은 순간이 앞으로의 날들에 남아 있다."]$auto_copy_seed$::jsonb)
ON CONFLICT (body) DO NOTHING;

INSERT INTO ojjuda_note_internal.auto_card_sites(sido,district,public_place,lat,lon)
SELECT sitio.sido,sitio.district,sitio.public_place,sitio.lat,sitio.lng
FROM jsonb_to_recordset($auto_site_seed$[{"sido":"서울특별시","district":"중구","public_place":"서울시청 광장","lat":37.5663,"lng":126.978},{"sido":"서울특별시","district":"종로구","public_place":"광화문광장","lat":37.5729,"lng":126.9769},{"sido":"부산광역시","district":"연제구","public_place":"부산시청","lat":35.1798,"lng":129.0751},{"sido":"부산광역시","district":"동구","public_place":"부산역 광장","lat":35.1152,"lng":129.0422},{"sido":"대구광역시","district":"중구","public_place":"대구시청 동인청사","lat":35.8714,"lng":128.6014},{"sido":"대구광역시","district":"동구","public_place":"동대구역 광장","lat":35.8792,"lng":128.6298},{"sido":"인천광역시","district":"남동구","public_place":"인천시청","lat":37.4563,"lng":126.7052},{"sido":"인천광역시","district":"중구","public_place":"인천역 광장","lat":37.476,"lng":126.616},{"sido":"광주광역시","district":"서구","public_place":"광주시청","lat":35.1601,"lng":126.8515},{"sido":"광주광역시","district":"광산구","public_place":"광주송정역 광장","lat":35.1378,"lng":126.791},{"sido":"대전광역시","district":"서구","public_place":"대전시청","lat":36.3504,"lng":127.3845},{"sido":"대전광역시","district":"동구","public_place":"대전역 광장","lat":36.3324,"lng":127.4348},{"sido":"울산광역시","district":"남구","public_place":"울산시청","lat":35.5391,"lng":129.3114},{"sido":"울산광역시","district":"울주군","public_place":"울산역 광장","lat":35.5514,"lng":129.1384},{"sido":"세종특별자치시","district":"보람동","public_place":"세종시청","lat":36.48,"lng":127.289},{"sido":"세종특별자치시","district":"도담동","public_place":"정부세종청사 주변","lat":36.504,"lng":127.265},{"sido":"경기도","district":"수원시","public_place":"수원시청","lat":37.2636,"lng":127.0286},{"sido":"경기도","district":"고양시","public_place":"고양시청","lat":37.6584,"lng":126.832},{"sido":"강원특별자치도","district":"춘천시","public_place":"춘천시청","lat":37.8813,"lng":127.7298},{"sido":"강원특별자치도","district":"강릉시","public_place":"강릉시청","lat":37.7519,"lng":128.8761},{"sido":"충청북도","district":"청주시","public_place":"청주시청","lat":36.6424,"lng":127.489},{"sido":"충청북도","district":"충주시","public_place":"충주시청","lat":36.9911,"lng":127.926},{"sido":"충청남도","district":"홍성군","public_place":"충남도청","lat":36.6588,"lng":126.673},{"sido":"충청남도","district":"천안시","public_place":"천안시청","lat":36.8151,"lng":127.1139},{"sido":"전북특별자치도","district":"전주시","public_place":"전주시청","lat":35.8242,"lng":127.1479},{"sido":"전북특별자치도","district":"군산시","public_place":"군산시청","lat":35.9677,"lng":126.7369},{"sido":"전라남도","district":"무안군","public_place":"전남도청","lat":34.8173,"lng":126.4629},{"sido":"전라남도","district":"순천시","public_place":"순천시청","lat":34.9506,"lng":127.4873},{"sido":"경상북도","district":"안동시","public_place":"경북도청","lat":36.5678,"lng":128.7272},{"sido":"경상북도","district":"포항시","public_place":"포항시청","lat":36.019,"lng":129.3435},{"sido":"경상남도","district":"창원시","public_place":"창원시청","lat":35.228,"lng":128.681},{"sido":"경상남도","district":"진주시","public_place":"진주시청","lat":35.1802,"lng":128.1076},{"sido":"제주특별자치도","district":"제주시","public_place":"제주시청","lat":33.4996,"lng":126.5312},{"sido":"제주특별자치도","district":"서귀포시","public_place":"서귀포시청 제1청사","lat":33.2539,"lng":126.5596}]$auto_site_seed$::jsonb)
  AS sitio(sido text,district text,public_place text,lat double precision,lng double precision)
ON CONFLICT (sido,district,public_place) DO NOTHING;

CREATE OR REPLACE FUNCTION ojjuda_note_internal.plan_auto_cards(p_day date)
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
DECLARE v_count integer;
BEGIN
  IF p_day IS NULL THEN
    RAISE EXCEPTION 'Date required' USING ERRCODE='22023';
  END IF;
  IF (SELECT count(*) FROM ojjuda_note_internal.auto_card_copy) < 10
     OR (SELECT count(*) FROM ojjuda_note_internal.auto_card_sites) < 10 THEN
    RAISE EXCEPTION 'Automatic card seed pool needs at least ten copies and sites';
  END IF;
  -- 780 minutes in 08:00-20:59 KST, ten 78-minute sections.
  -- The chosen text and public backdrop are stored once per date for retries.
  WITH selected_copy AS MATERIALIZED (
    SELECT c.id, row_number() OVER (ORDER BY pg_catalog.random())::smallint AS slot
    FROM (SELECT id FROM ojjuda_note_internal.auto_card_copy ORDER BY pg_catalog.random() LIMIT 10) c
  ), selected_site AS MATERIALIZED (
    SELECT s.id, row_number() OVER (ORDER BY pg_catalog.random())::smallint AS slot
    FROM (SELECT id FROM ojjuda_note_internal.auto_card_sites ORDER BY pg_catalog.random() LIMIT 10) s
  )
  INSERT INTO ojjuda_note_internal.auto_card_schedule
    (local_day,slot,planned_at,copy_id,site_id,gender)
  SELECT p_day,c.slot,
    (p_day::timestamp + interval '8 hours'
      + (((c.slot::integer-1)*78 + floor(pg_catalog.random()*78)::integer)
        * interval '1 minute')) AT TIME ZONE 'Asia/Seoul',
    c.id,s.id,CASE WHEN pg_catalog.random() < 0.5 THEN 'male' ELSE 'female' END
  FROM selected_copy c JOIN selected_site s USING (slot)
  ON CONFLICT (local_day,slot) DO NOTHING;
  SELECT count(*) INTO v_count
  FROM ojjuda_note_internal.auto_card_schedule WHERE local_day=p_day;
  IF v_count<>10 THEN
    RAISE EXCEPTION 'Automatic card schedule must contain exactly ten entries';
  END IF;
  RETURN v_count;
END;
$function$;

CREATE OR REPLACE FUNCTION ojjuda_note_internal.run_auto_cards()
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
DECLARE
  v_now timestamptz := pg_catalog.statement_timestamp();
  v_day date := (v_now AT TIME ZONE 'Asia/Seoul')::date;
  v_time time := (v_now AT TIME ZONE 'Asia/Seoul')::time;
  v_author uuid;
  v_enabled boolean;
  v_starts_on date;
  v_old_claim text;
  v_item record;
  v_result jsonb;
  v_card_id uuid;
  v_posted integer := 0;
BEGIN
  IF v_time < time '08:00' OR v_time > time '21:00' THEN RETURN 0; END IF;
  SELECT author_id,enabled,starts_on INTO v_author,v_enabled,v_starts_on
  FROM ojjuda_note_internal.auto_card_config WHERE singleton;
  IF NOT coalesce(v_enabled,false) OR v_day<v_starts_on THEN RETURN 0; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM auth.users u WHERE u.id=v_author
      AND u.raw_app_meta_data->>'ojjuda_note_auto_card_bot'='true'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.profiles p
    JOIN public.user_private up ON up.user_id=p.id WHERE p.id=v_author
  ) THEN
    RAISE EXCEPTION 'Dedicated system bot Auth user and membership are required';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM ojjuda_note_internal.settings s WHERE s.singleton AND s.posting_enabled
  ) THEN RETURN 0; END IF;

  -- A single day's planner and publisher cannot race another worker invocation.
  PERFORM pg_catalog.pg_advisory_xact_lock(284726, (v_day-date '2000-01-01')::integer);
  PERFORM ojjuda_note_internal.plan_auto_cards(v_day);
  v_old_claim := pg_catalog.current_setting('request.jwt.claim.sub',true);
  -- Only the postgres-owned, non-exposed cron job invokes this function.
  -- It uses an actual, marked system Auth account for the existing Note RPC.
  PERFORM pg_catalog.set_config('request.jwt.claim.sub',v_author::text,true);
  FOR v_item IN
    SELECT q.local_day,q.slot,q.request_id,q.gender,t.body,s.lat,s.lon
    FROM ojjuda_note_internal.auto_card_schedule q
    JOIN ojjuda_note_internal.auto_card_copy t ON t.id=q.copy_id
    JOIN ojjuda_note_internal.auto_card_sites s ON s.id=q.site_id
    WHERE q.local_day=v_day AND q.posted_at IS NULL AND q.planned_at<=v_now
    ORDER BY q.slot FOR UPDATE OF q
  LOOP
    v_result := ojjuda_note.publish_card(
      v_item.request_id,v_item.body,
      ARRAY[]::text[],
      'anonymous','{}'::jsonb,v_item.lat,v_item.lon,NULL::uuid);
    v_card_id := (v_result->>'card_id')::uuid;
    IF v_card_id IS NULL THEN RAISE EXCEPTION 'Card was not published'; END IF;
    -- The normal AFTER INSERT trigger copies the bot's private gender first.
    -- This overwrite is an explicitly fictional display marker on system content.
    UPDATE ojjuda_note_internal.card_gender SET gender=v_item.gender
    WHERE card_id=v_card_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Card gender marker missing'; END IF;
    UPDATE ojjuda_note_internal.auto_card_schedule
      SET card_id=v_card_id,posted_at=v_now
      WHERE local_day=v_item.local_day AND slot=v_item.slot AND posted_at IS NULL;
    v_posted := v_posted+1;
  END LOOP;
  PERFORM pg_catalog.set_config('request.jwt.claim.sub',coalesce(v_old_claim,''),true);
  RETURN v_posted;
EXCEPTION WHEN OTHERS THEN
  PERFORM pg_catalog.set_config('request.jwt.claim.sub',coalesce(v_old_claim,''),true);
  RAISE;
END;
$function$;

REVOKE ALL ON FUNCTION ojjuda_note_internal.plan_auto_cards(date),
  ojjuda_note_internal.run_auto_cards() FROM PUBLIC, anon, authenticated;

-- No pg_cron job here: activation is atomic after the marked Auth bot exists.
