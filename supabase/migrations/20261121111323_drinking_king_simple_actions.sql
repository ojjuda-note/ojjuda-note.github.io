-- Replace king recommendations with short actions that need no props or travel.
-- Archive prior wording; retain moderation records and already-dealt room snapshots.
begin;
select pg_advisory_xact_lock(24613,911);
lock table ojjuda_arcade_internal.drinking_content_items in share row exclusive mode;
do $migration$
declare
 actions constant jsonb := $actions$[
  {
    "body": "양손으로 머리 위에 하트를 만들고 3초 있기.",
    "flavor": "mild"
  },
  {
    "body": "왼손과 오른손으로 번갈아 손가락 하트 세 번 만들기.",
    "flavor": "mild"
  },
  {
    "body": "손가락으로 안경을 만들어 눈 앞에 대고 3초 있기.",
    "flavor": "mild"
  },
  {
    "body": "양손으로 턱을 받치고 꽃받침 포즈 3초 하기.",
    "flavor": "mild"
  },
  {
    "body": "양쪽 엄지를 세우고 활짝 웃으며 3초 있기.",
    "flavor": "mild"
  },
  {
    "body": "양손으로 브이를 만들어 얼굴 옆에 대고 3초 있기.",
    "flavor": "mild"
  },
  {
    "body": "얼굴 양옆에서 두 손을 활짝 펴고 손가락을 5초 동안 흔들기.",
    "flavor": "mild"
  },
  {
    "body": "한 손은 주먹, 다른 손은 손바닥으로 만들고 세 번 맞바꾸기.",
    "flavor": "mild"
  },
  {
    "body": "한 손으로 동그라미, 다른 손으로 세모를 허공에 동시에 그려 보기.",
    "flavor": "mild"
  },
  {
    "body": "왼쪽 눈과 오른쪽 눈으로 번갈아 윙크 한 번씩 하기.",
    "flavor": "mild"
  },
  {
    "body": "검지로 허공에 자기 이름을 큼직하게 한 번 쓰기.",
    "flavor": "mild"
  },
  {
    "body": "양손으로 얼굴을 가렸다가 활짝 웃는 얼굴을 보여 주기.",
    "flavor": "mild"
  },
  {
    "body": "손을 이마에 대고 씩씩하게 경례한 채 3초 있기.",
    "flavor": "mild"
  },
  {
    "body": "손가락을 펼쳐 머리 위에 왕관 모양을 만들고 3초 있기.",
    "flavor": "mild"
  },
  {
    "body": "검지를 입 앞에 대고 쉿 하는 포즈로 3초 있기.",
    "flavor": "mild"
  },
  {
    "body": "박수 두 번, 자기 무릎 한 번을 두드리는 동작 두 번 하기.",
    "flavor": "mild"
  },
  {
    "body": "가슴 앞에 두 손을 모으고 정중하게 고개 숙여 인사하기.",
    "flavor": "mild"
  },
  {
    "body": "입을 다문 채 최대한 환하게 웃으며 3초 있기.",
    "flavor": "mild"
  },
  {
    "body": "두 주먹을 들어 올리고 우승한 듯 만세 포즈 3초 하기.",
    "flavor": "mild"
  },
  {
    "body": "양손의 엄지와 검지로 얼굴 앞에 네모 틀을 만들고 3초 있기.",
    "flavor": "mild"
  },
  {
    "body": "둘이 가위바위보 세 판 하기.",
    "flavor": "mild"
  },
  {
    "body": "둘이 동시에 손가락을 펴서 두 사람의 숫자 합이 다섯이 되게 하기. 세 번 도전하기.",
    "flavor": "mild"
  },
  {
    "body": "둘이 마주 보고 눈싸움 5초 하기.",
    "flavor": "mild"
  },
  {
    "body": "둘이 번갈아 박수를 한 번씩 쳐서 총 여섯 번 이어 가기.",
    "flavor": "mild"
  },
  {
    "body": "둘이 먼저 뽑힌 사람은 손가락 하트, 나중에 뽑힌 사람은 엄지를 들고 서로 맞바꾸기.",
    "flavor": "mild"
  },
  {
    "body": "둘이 먼저 뽑힌 사람이 손 모양 세 개를 보여 주고 나중에 뽑힌 사람이 따라 하기.",
    "flavor": "mild"
  },
  {
    "body": "둘이 먼저 뽑힌 사람이 짧게 박수로 박자를 만들고 나중에 뽑힌 사람이 그대로 따라 하기.",
    "flavor": "mild"
  },
  {
    "body": "둘이 같은 박자로 자기 무릎 두 번, 박수 한 번을 두 차례 하기.",
    "flavor": "mild"
  },
  {
    "body": "둘이 먼저 뽑힌 사람은 왼손, 나중에 뽑힌 사람은 오른손으로 동시에 3초 동안 인사하기.",
    "flavor": "mild"
  },
  {
    "body": "둘이 손바닥이나 손등을 골라 셋에 내밀기. 같은 쪽 맞히기에 세 번 도전하기.",
    "flavor": "mild"
  },
  {
    "body": "둘이 먼저 뽑힌 사람은 동그라미, 나중에 뽑힌 사람은 세모를 허공에 그려 보여 주기.",
    "flavor": "mild"
  },
  {
    "body": "둘이 먼저 뽑힌 사람은 박수 한 번, 나중에 뽑힌 사람은 두 번 치기. 두 차례 하기.",
    "flavor": "mild"
  },
  {
    "body": "둘이 먼저 뽑힌 사람은 손을 위로, 나중에 뽑힌 사람은 아래로 내밀고 동시에 세 번 맞바꾸기.",
    "flavor": "mild"
  },
  {
    "body": "둘이 먼저 뽑힌 사람이 웃는 표정을 짓고 나중에 뽑힌 사람이 똑같이 따라 3초 있기.",
    "flavor": "mild"
  },
  {
    "body": "둘이 양손을 들었다가 말없이 같은 속도로 천천히 내리기. 5초 동안 맞춰 보기.",
    "flavor": "mild"
  },
  {
    "body": "둘이 눈을 감고 마음속으로 5초를 센 뒤 동시에 눈 뜨기.",
    "flavor": "mild"
  },
  {
    "body": "둘이 서로를 보며 손을 모으고 동시에 고개 숙여 인사하기.",
    "flavor": "mild"
  },
  {
    "body": "둘이 먼저 뽑힌 사람이 고개를 끄덕일 때마다 나중에 뽑힌 사람이 엄지 들기. 세 번 하기.",
    "flavor": "mild"
  },
  {
    "body": "둘이 먼저 뽑힌 사람은 주먹, 나중에 뽑힌 사람은 손바닥을 내고 셋에 동시에 브이로 바꾸기.",
    "flavor": "mild"
  },
  {
    "body": "둘이 각자 한 손으로 손가락 하나부터 다섯까지 같은 속도로 펼치기. 5초 안에 맞추기.",
    "flavor": "mild"
  },
  {
    "body": "양 볼에 바람을 빵빵하게 넣고 3초 있기.",
    "flavor": "spicy"
  },
  {
    "body": "혀를 살짝 내밀어 메롱하는 표정으로 3초 있기.",
    "flavor": "spicy"
  },
  {
    "body": "입술을 쭉 내밀어 오리 입 모양으로 3초 있기.",
    "flavor": "spicy"
  },
  {
    "body": "눈과 입을 크게 벌리고 깜짝 놀란 표정으로 3초 있기.",
    "flavor": "spicy"
  },
  {
    "body": "코를 찡그리고 눈을 가늘게 뜬 표정으로 3초 있기.",
    "flavor": "spicy"
  },
  {
    "body": "울상을 짓고 손등으로 눈물을 훔치는 동작 3초 하기.",
    "flavor": "spicy"
  },
  {
    "body": "양손 검지를 눈 밑에 대고 입을 삐죽 내민 채 3초 있기.",
    "flavor": "spicy"
  },
  {
    "body": "눈썹을 올렸다 내렸다 하며 우스운 표정 세 번 짓기.",
    "flavor": "spicy"
  },
  {
    "body": "입꼬리 한쪽만 올리고 얄미운 미소로 3초 있기.",
    "flavor": "spicy"
  },
  {
    "body": "볼을 손가락으로 살짝 누르고 물고기 입 모양 3초 만들기.",
    "flavor": "spicy"
  },
  {
    "body": "양손을 고양이 앞발처럼 오므리고 얼굴 옆에서 5초 동안 까딱이기.",
    "flavor": "spicy"
  },
  {
    "body": "손을 머리 위에 올려 토끼 귀를 만들고 5초 동안 쫑긋거리기.",
    "flavor": "spicy"
  },
  {
    "body": "앉은 채로 팔꿈치를 닭 날개처럼 5초 동안 퍼덕이기.",
    "flavor": "spicy"
  },
  {
    "body": "앉은 채로 어깨를 좌우로 들썩이며 5초 동안 춤추기.",
    "flavor": "spicy"
  },
  {
    "body": "로봇처럼 팔을 딱딱 끊어서 5초 동안 움직이기.",
    "flavor": "spicy"
  },
  {
    "body": "앉은 채로 검지를 위아래로 찌르며 디스코 춤 5초 추기.",
    "flavor": "spicy"
  },
  {
    "body": "앉은 채로 두 팔을 앞으로 교차하고 말춤 5초 추기.",
    "flavor": "spicy"
  },
  {
    "body": "한 손끝에서 반대 손끝까지 팔로 물결을 보내는 동작 한 번 하기.",
    "flavor": "spicy"
  },
  {
    "body": "한 팔을 옆으로 펴고 다른 팔꿈치에 얼굴을 가리는 댑 포즈 3초 하기.",
    "flavor": "spicy"
  },
  {
    "body": "한 손은 머리 뒤, 다른 손은 허리에 대고 자신 있는 표정으로 3초 있기.",
    "flavor": "spicy"
  },
  {
    "body": "둘이 먼저 뽑힌 사람이 웃긴 표정을 짓고 나중에 뽑힌 사람은 5초 동안 웃음 참기.",
    "flavor": "spicy"
  },
  {
    "body": "둘이 먼저 뽑힌 사람은 어깨춤을 추고 나중에 뽑힌 사람은 박수로 5초 동안 박자 맞추기.",
    "flavor": "spicy"
  },
  {
    "body": "둘이 먼저 뽑힌 사람이 로봇처럼 팔을 움직이고 나중에 뽑힌 사람이 5초 동안 따라 하기.",
    "flavor": "spicy"
  },
  {
    "body": "둘이 먼저 뽑힌 사람은 위로, 나중에 뽑힌 사람은 아래로 손가락을 찌르며 디스코 춤 5초 추기.",
    "flavor": "spicy"
  },
  {
    "body": "둘이 먼저 뽑힌 사람은 고양이 앞발, 나중에 뽑힌 사람은 토끼 귀 포즈를 하고 서로 보며 3초 있기.",
    "flavor": "spicy"
  },
  {
    "body": "둘이 먼저 뽑힌 사람이 엄지를 들면 나중에 뽑힌 사람은 어깨춤, 내리면 멈추기. 5초 하기.",
    "flavor": "spicy"
  },
  {
    "body": "둘이 먼저 뽑힌 사람은 웃는 얼굴, 나중에 뽑힌 사람은 울상을 짓고 서로 표정을 바꿔 3초 있기.",
    "flavor": "spicy"
  },
  {
    "body": "둘이 먼저 뽑힌 사람은 볼을 빵빵하게, 나중에 뽑힌 사람은 오리 입으로 만들고 서로 보며 3초 있기.",
    "flavor": "spicy"
  },
  {
    "body": "둘이 먼저 뽑힌 사람이 손을 펴면 상대는 메롱, 주먹을 쥐면 무표정 짓기. 5초 하기.",
    "flavor": "spicy"
  },
  {
    "body": "둘이 서로를 보며 이를 보이지 않게 5초 동안 웃기.",
    "flavor": "spicy"
  },
  {
    "body": "둘이 눈썹만 움직여 서로를 웃겨 보기. 5초 동안 하기.",
    "flavor": "spicy"
  },
  {
    "body": "둘이 웃긴 포즈를 하나씩 보여 주고 상대 포즈로 바꿔 3초 있기.",
    "flavor": "spicy"
  },
  {
    "body": "둘이 먼저 뽑힌 사람이 손으로 얼굴을 가렸다 펼 때마다 상대는 윙크하기. 세 번 하기.",
    "flavor": "spicy"
  },
  {
    "body": "둘이 먼저 뽑힌 사람은 팔꿈치를 닭 날개처럼, 나중에 뽑힌 사람은 손을 펭귄 날개처럼 5초 흔들기.",
    "flavor": "spicy"
  },
  {
    "body": "둘이 먼저 뽑힌 사람은 만세 포즈, 나중에 뽑힌 사람은 머리를 감싸고 놀란 표정으로 3초 있기.",
    "flavor": "spicy"
  },
  {
    "body": "둘이 먼저 뽑힌 사람부터 한 명씩 번갈아 3초 동안 앉아서 춤추기. 자기 차례가 아니면 가만히 있기.",
    "flavor": "spicy"
  },
  {
    "body": "둘이 먼저 뽑힌 사람이 손을 올리면 상대는 놀란 표정, 내리면 졸린 표정 짓기. 5초 하기.",
    "flavor": "spicy"
  },
  {
    "body": "둘이 손가락 안경을 만들고 코를 찡그린 채 서로 보며 3초 있기.",
    "flavor": "spicy"
  },
  {
    "body": "둘이 먼저 뽑힌 사람은 팔을 굽혀 근육 자랑, 나중에 뽑힌 사람은 꽃받침 포즈를 하고 서로 맞바꾸기.",
    "flavor": "spicy"
  },
  {
    "body": "둘이 한쪽 볼만 번갈아 부풀리며 상대와 같은 쪽 맞추기. 5초 동안 하기.",
    "flavor": "spicy"
  }
]$actions$::jsonb;
 action jsonb;
 existing_id integer;
begin
 update ojjuda_arcade_internal.drinking_content_items c
 set active=false,revision=c.revision+1
 where c.kind='king' and c.active and not exists(
  select 1 from jsonb_array_elements(actions) a
  where c.body=a->>'body' and c.second is null
 );

 for action in select value from jsonb_array_elements(actions) loop
  select id into existing_id from ojjuda_arcade_internal.drinking_content_items
  where kind='king' and body=action->>'body' and second is null
  order by active desc,id limit 1;
  if existing_id is null then
   insert into ojjuda_arcade_internal.drinking_content_items(kind,body,party_pick,prompt_flavor)
   values('king',action->>'body',true,action->>'flavor');
  else
   update ojjuda_arcade_internal.drinking_content_items
   set active=true,party_pick=true,prompt_flavor=action->>'flavor',revision=revision+1
   where id=existing_id and (active,party_pick,prompt_flavor)
    is distinct from (true,true,action->>'flavor');
  end if;
 end loop;

 if (select count(*) from ojjuda_arcade_internal.drinking_content_items where kind='king' and active)
    <>jsonb_array_length(actions) then
  raise exception 'king_action_catalog_count_mismatch';
 end if;
 if exists(
  select 1 from jsonb_array_elements(actions) a where not exists(
   select 1 from ojjuda_arcade_internal.drinking_content_items c
   where c.kind='king' and c.active and c.party_pick and c.second is null
    and c.body=a->>'body' and c.prompt_flavor=a->>'flavor'
  )
 ) then raise exception 'king_action_catalog_mismatch'; end if;
end;
$migration$;
commit;
