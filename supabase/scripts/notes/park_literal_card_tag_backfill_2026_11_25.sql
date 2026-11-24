BEGIN;

-- Only untouched, never-published bot drafts are eligible for this copy edit.
UPDATE ojjuda_note_internal.park_post_v2_contents AS c SET body = v.new_body
FROM (VALUES
  ('요즘은 ''조금만 더 버텨''보다 ''오늘은 쉬어''라는 말이 더 듣고 싶다.', '요즘은 ‘조금만 더 버텨’보다 ‘오늘은 쉬어’라는 말이 더 위로가 된다.'),
  ('보고 싶다고 쓰려다가 ''잘 지내?''만 보냈다.', '보고 싶다고 썼다가 지웠다. 결국 ‘잘 지내?’ 하고 안부만 물었다.'),
  ('못하는 게 하나 있으면 그것만 눈에 띈다. 오늘은 잘한 것도 좀 떠올려야지.', '못하는 것만 눈에 띄는 날이다. 오늘 잘한 일도 하나쯤은 칭찬해 주고 싶다.'),
  ('오늘은 나한테 심한 말 하지 않기로 했는데 점심때 벌써 한 번 했다.', '점심 먹다 또 나한테 심한 말을 했다. 혼잣말도 남한테 하듯 좀 다정하게 해 봐야겠다.'),
  ('앞으로 어떻게 살아야 할지 물으면 아직 모르겠다. 그냥 잘 지내고 싶다.', '앞날을 어떻게 그리고 있냐고 물으면 아직 할 말이 없다. 그냥 잘 지내고 싶다.'),
  ('모르는 걸 물어보는 데 한참 망설였다. 물어보니 1분 만에 풀렸다.', '질문 하나 하는 데 한참 망설였다. 막상 물어보니 1분 만에 풀렸다.')
) AS v(old_body, new_body)
WHERE c.active AND c.posted_count=0 AND c.body=v.old_body
  AND NOT EXISTS (SELECT 1 FROM ojjuda_note_internal.park_post_v2_history h WHERE h.content_id=c.id);

-- Use the same dedicated author as the scheduled publisher. Keep the claim transaction-local.
DO $bot$
DECLARE bot_id uuid;
BEGIN
  SELECT cfg.author_id INTO STRICT bot_id FROM ojjuda_note_internal.park_post_v2_config cfg
  JOIN auth.users u ON u.id=cfg.author_id AND u.raw_app_meta_data->>'ojjuda_note_auto_card_bot'='true'
  WHERE cfg.singleton FOR UPDATE OF cfg;
  PERFORM set_config('request.jwt.claim.sub',bot_id::text,true);
END
$bot$;

-- Keep member-authored and manually edited cards out of the historical correction.
WITH previous(body,tags) AS (VALUES
  ('집에 오니 아무도 없어서 TV부터 켰다. 별 얘기라도 나눌 사람이 있었으면 싶다.', ARRAY['얘기','집']::text[]),
  ('면접 떨어졌다는 연락을 받고 한참 멍했다. 그래도 지원한 걸 후회하진 않는다.', ARRAY['면접','연락']::text[]),
  ('돈 걱정 없이 잠드는 밤이 좀 많았으면 좋겠다.', ARRAY['걱정','밤','돈']::text[]),
  ('화분에 물 주는 날을 정해 두니 안 까먹는다. 새잎 하나 나면 유난히 기쁘다.', ARRAY['새잎','화분','물']::text[]),
  ('퇴근길에 빵집 들렀다. 아침에 먹으려고 샀는데 지금 벌써 반 먹었다.', ARRAY['빵집','퇴근길','아침']::text[]),
  ('어릴 땐 서른이 되면 뭐든 알 줄 알았다. 여전히 모르겠는 게 더 많네.', ARRAY['서른']::text[]),
  ('하늘이 예뻐서 찍었는데 사진엔 색이 안 담긴다. 역시 눈으로 보는 게 낫다.', ARRAY['사진','하늘','색']::text[]),
  ('고백할 생각은 아직 없다. 그냥 조금 더 친해지고 싶다.', ARRAY['고백']::text[]),
  ('싸우고 나서 먼저 연락할까 몇 번이나 고민했다. 마음은 풀고 싶은데 말을 잘 못 고르겠다.', ARRAY['연락','고민','말']::text[]),
  ('집에 들어오니 TV 소리도 없고 집이 조용하다. 괜히 음악부터 틀었다.', ARRAY['음악','집','소리']::text[]),
  ('통장 잔고 보기가 겁나서 미뤘다가 결국 확인했다. 생각보다 더 적네.', ARRAY['통장','국','미뤘']::text[])
), revised AS MATERIALIZED (
  SELECT c.id, c.body, c.tags AS old_tags, ojjuda_note_internal.park_card_context_tags(c.body) AS tags
  FROM ojjuda_note_internal.park_post_v2_history h
  JOIN ojjuda_note_internal.park_post_v2_contents src ON src.id = h.content_id
  JOIN ojjuda_note.cards c ON c.id = h.card_id AND c.body=src.body
  JOIN previous ON previous.body=c.body AND previous.tags=c.tags
  JOIN ojjuda_note_internal.park_post_v2_config cfg ON cfg.singleton AND c.author_id=cfg.author_id
  WHERE c.kind='memo' AND c.archived_at IS NULL
)
UPDATE ojjuda_note.cards c SET tags=r.tags FROM revised r
WHERE c.id=r.id AND c.body=r.body AND c.tags=r.old_tags AND cardinality(r.tags)>0 AND c.tags IS DISTINCT FROM r.tags;

COMMIT;
