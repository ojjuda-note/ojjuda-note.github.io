CREATE OR REPLACE FUNCTION ojjuda_note_internal.auto_card_tags(
  p_slot integer, p_day date, p_body text
)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SECURITY INVOKER
SET search_path = ''
AS $function$
  WITH tokens AS (
    SELECT part, position
    FROM pg_catalog.regexp_split_to_table(
      coalesce(p_body, ''), '[^가-힣A-Za-z0-9]+'
    ) WITH ORDINALITY AS token(part, position)
  ), normalized AS (
    SELECT part, position,
      CASE
        -- These nouns really end in 이; do not remove it as a particle.
        WHEN part = ANY (ARRAY['살림살이','어린이','고양이','놀이','나들이','아이','종이','치이카와','오키나와']) THEN part
        ELSE pg_catalog.regexp_replace(part,
          '(당했다니|했다니|됐다니|한다니|이라는|이라니|이라며|이라서|이어서|였지만|했지만|하면서|하니까|합니다|했어요|하는|했던|하고|하며|해서|하다|에서도|으로부터|에서부터|으로는|에서는|까지|부터|에게도|에게|한테|으로|이라|라고|라며|처럼|보다|만큼|한지|되네|돼|에도|에서|로|[은는이가을를에와과도만의랑])$', '')
      END AS tag
    FROM tokens
  ), meaningful AS (
    SELECT tag, pg_catalog.min(position) AS first_position
    FROM normalized
    WHERE (pg_catalog.char_length(tag) >= 2
      OR tag = ANY (ARRAY['칩','책','꽃','비','눈','달','별','꿈','돈','집','밥','맛']))
      AND pg_catalog.char_length(tag) <= 20
      AND tag !~ '^[0-9]+(년|월|일|명|개|번)?$'
      AND tag NOT IN (
        '19금','오늘','어제','내일','지금','요즘','이제','다시','아직','정말','진짜','너무','그냥',
        '많이','조금','같이','함께','가끔','계속','우리','저는','제가','나는','내가','너는',
        '너랑','나랑','우리','그대','그런','이런','저런','어떤','무슨','모든','아무',
        '하나','둘','셋','한번','이번','다음','먼저','처음','마지막','오래','벌써','제일',
        '바로','일단','괜히','한참','잠깐','그때','그날','그동안','여기','거기','저기',
        '언제','어디','얼마나','어떻게','그렇게','이렇게','그것','이것','저것','그건',
        '이건','그걸','이걸','사람','사람들','모두','때문','것','거','걸','건','땐',
        '시간','하루','순간','정도','사실','생각','느낌','기분','마음','말','얘기',
        '이야기','소식','분','뿐','수','참','또','더','잘','꼭','좀','왜','뭐',
        '국산','소형','가짜','오랜','예쁜','좋은','작은','새로','새로운','달콤한',
        '돌릴','고를','기다린','지나가','보이면','쓰는','먹고','보고','앉아','자신',
        '좋아','좋겠네','싶어','어때','이제야','나왔','나오니','이번엔','있','없','같','되어','빠르',
        '무사히','종일','오래전','넘어가','보면','자고','난감','팍팍','익숙',
        '관련','다듬','꿈꾸게','신기','내린','버텼네','크게','다음엔',
        '놀라워','꾸준히','쓰느냐','중요해','거의','작은','옛날','실제'
      )
      AND (tag !~ '(다|면|까|히|할|갈|볼|쓸)$' OR tag IN ('바다','캐나다','라면'))
      -- Skip conjugated predicates rather than making awkward hashtag fragments.
      AND tag !~ '(겠[가-힣]*|었[가-힣]*|았[가-힣]*|였[가-힣]*|하는데|했는데|는데|다니|구나|더라|을까|할까|볼까|나요|네요|어요|아요|습니다|었음|으면|다면|하면|거든|잖아|하겠|좋겠|싶어|보이|늘어나|흔들리|바뀌|귀찮|모르|궁금하|난감하|팍팍하|익숙하|돌릴|고를|지나가|기다린|볼래|갈래)$'
    GROUP BY tag
  )
  SELECT ARRAY(
    SELECT tag FROM meaningful
    ORDER BY first_position, tag
    LIMIT 5
  );
$function$;

REVOKE ALL ON FUNCTION ojjuda_note_internal.auto_card_tags(integer,date,text)
  FROM PUBLIC, anon, authenticated;
