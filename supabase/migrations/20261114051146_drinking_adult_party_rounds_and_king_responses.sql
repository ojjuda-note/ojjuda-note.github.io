-- Add an adult party selection to the existing admin-managed catalogs.
select pg_advisory_xact_lock(24613,911);
alter table ojjuda_arcade_internal.drinking_content_items add column party_pick boolean not null default false;
alter table ojjuda_arcade_internal.drinking_truth_cards add column party_pick boolean not null default false;

with new_picks as (
 select bank.key as kind, case jsonb_typeof(v) when 'array' then v->>0 else v#>>'{}' end as body, v->>1 as second
 from jsonb_each($picks${
 "bomb": [
  "키스 직전에 하면 분위기가 깨지는 말",
  "전 애인에게 새벽에 연락하는 핑계",
  "첫 데이트 끝에 더 있고 싶을 때 하는 말",
  "호감 있는 사람 옆자리를 차지하는 방법",
  "사귀는 사이인지 헷갈리게 하는 행동",
  "친구 사이에 하면 썸으로 오해받는 행동",
  "첫눈에 끌리는 사람의 특징",
  "스킨십 전에 마음을 확인하는 한마디",
  "소개팅 사진에서 나도 모르게 보는 것",
  "질투하는데 쿨한 척할 때 나오는 말",
  "애인 앞에서 전 애인 이름이 나왔을 때 할 말",
  "좋아하는 사람한테만 달라지는 말버릇",
  "썸이 끝났음을 알려 주는 문자",
  "하룻밤이 지난 뒤 먼저 연락할 핑계",
  "연인이 둘만 있을 때 부를 법한 애칭",
  "친구에게 들킨 비밀 연애의 단서",
  "집 데이트 전에 급히 치우게 되는 물건",
  "첫 키스 뒤 정적을 깨는 한마디",
  "잘 보이려고 아는 척하기 쉬운 취미",
  "읽고도 일부러 답장을 늦추는 이유",
  "키스 타이밍을 놓치게 하는 방해물",
  "호감 없는 소개팅을 일찍 끝내는 핑계",
  "옛 썸을 마주쳤을 때 먼저 살피는 것",
  "플러팅인지 친절인지 애매한 칭찬",
  "비 오는 날 한 우산을 쓰자는 구실",
  "데이트 상대에게 빌려주면 설레는 물건",
  "이별 뒤 서로 돌려줘야 할 물건",
  "연애 예능에서 자막으로 뜰 법한 말",
  "둘만의 여행을 제안하는 첫마디",
  "내가 보낸 뒤 바로 지우고 싶은 문자",
  "설레는 목소리를 묘사하는 말",
  "데이트 내내 신경 쓰이게 하는 향",
  "키스 직전에 괜히 한 번 더 확인하는 것",
  "연인과 잠자리 취향을 이야기하기 좋은 때",
  "몸에 닿는 감촉이 좋은 소재",
  "매력적으로 느껴지는 신체 부위",
  "침실 조명을 바꿀 때 고를 만한 색",
  "각자의 스킨십 취향을 물어보는 말",
  "둘만의 밤을 방해하는 뜻밖의 소리",
  "첫날밤에 침대 옆에 있으면 편한 물건"
 ],
 "liar": [
  "첫 키스",
  "키스 자국",
  "입술 사이의 사탕",
  "목덜미의 향수",
  "엉킨 셔츠 단추",
  "와인잔에 남은 립스틱",
  "새벽 두 시의 부재중 전화",
  "커플 잠옷",
  "더블베드",
  "호텔 키 카드",
  "립밤",
  "침대 옆 무드등",
  "커플 마사지 오일",
  "실크 가운",
  "향이 밴 베갯잇",
  "상대 집의 여분 칫솔",
  "피임약",
  "콘돔 자판기",
  "레이스 속옷",
  "샤워 가운",
  "데이트 앱 매칭",
  "소개팅 애프터",
  "썸 타는 동료",
  "비밀 연애",
  "환승 연애",
  "재회 문자",
  "옛 애인의 후드티",
  "공개 연애 선언",
  "기념일 호캉스",
  "이별 플레이리스트",
  "둘만의 애칭",
  "손깍지",
  "우산 속 어깨",
  "귓속말",
  "영화관 커플석",
  "커플 타투",
  "비밀 채팅방",
  "커플 사진의 잘린 손",
  "첫날밤",
  "속궁합",
  "스킨십 취향",
  "피임 도구",
  "모닝 키스",
  "오픈 릴레이션십",
  "셔츠에 남은 키스 마크",
  "호텔 조식 룸서비스",
  "이불 속 발장난"
 ],
 "minority": [
  [
   "첫 데이트에 키스하기",
   "사귀기로 한 뒤 첫 키스하기"
  ],
  [
   "키스 전에 물어보는 사람",
   "눈을 맞추고 대답을 기다리는 사람"
  ],
  [
   "내가 먼저 손잡기",
   "상대가 손 내밀 때까지 기다리기"
  ],
  [
   "연락은 뜸해도 만날 때 불같은 사람",
   "매일 다정하지만 좀처럼 안 만나는 사람"
  ],
  [
   "스킨십 취향을 첫 달에 이야기하기",
   "자연스럽게 하나씩 알아가기"
  ],
  [
   "키스 궁합이 좋은데 대화가 어색한 사람",
   "대화는 찰떡인데 키스가 어색한 사람"
  ],
  [
   "전 애인과 찍은 사진 남기기",
   "사진은 지우고 편지는 간직하기"
  ],
  [
   "짝사랑 상대에게 취중 고백한 다음 날",
   "친구에게 썸 타는 걸 들킨 다음 날"
  ],
  [
   "휴대폰에 내 이름을 본명으로 저장",
   "나만 아는 애칭으로 저장"
  ],
  [
   "첫 여행에서 방 하나 예약",
   "첫 여행에서 각자 방 예약"
  ],
  [
   "10년 친구와 딱 한 번의 데이트",
   "소개팅 상대와 일주일 연속 데이트"
  ],
  [
   "밤에는 설레는데 낮에는 어색한 사이",
   "낮에는 다정한데 밤에는 친구 같은 사이"
  ],
  [
   "직접 듣는 사랑한다는 말",
   "귓속말로 듣는 보고 싶었다는 말"
  ],
  [
   "썸 상대에게 내가 보낸 장문이 읽씹",
   "전 애인에게 보낼 문자를 썸 상대에게 전송"
  ],
  [
   "내가 차인 이유를 정확히 듣기",
   "좋았던 기억만 남기고 헤어지기"
  ],
  [
   "친구처럼 편한 동거",
   "만날 때마다 꾸미는 주말 연애"
  ],
  [
   "데이트 앱 프로필을 친구가 대신 쓰기",
   "내 첫 소개팅을 친구가 옆 테이블에서 보기"
  ],
  [
   "자주 안아 주는 연인",
   "매일 진심 어린 칭찬을 하는 연인"
  ],
  [
   "내 질투가 얼굴로 다 드러나기",
   "내 플러팅이 농담으로만 들리기"
  ],
  [
   "선물은 서툴지만 키스는 잘하는 연인",
   "키스는 서툴지만 선물은 기막히게 고르는 연인"
  ],
  [
   "최고의 데이트 직후 갑작스러운 이별",
   "별로였던 첫 데이트 뒤 최고의 애프터"
  ],
  [
   "첫날부터 잠버릇 공개",
   "첫날부터 노래방 애창곡 공개"
  ],
  [
   "애인의 첫사랑 이야기 듣기",
   "내 첫사랑 이야기 들려주기"
  ],
  [
   "내 친구들이 전부 좋아하는 애인",
   "내 취향을 귀신같이 아는 애인"
  ],
  [
   "다툰 날 밤새 대화하기",
   "각자 자고 아침에 먼저 안아 주기"
  ],
  [
   "끌리는 사람에게 번호 물어보기",
   "내 번호를 쪽지에 적어 주기"
  ],
  [
   "여행에서 침대 하나에 이불 두 개",
   "침대 두 개에 나란히 눕기"
  ],
  [
   "고백을 먼저 하고 차일 가능성 감수",
   "친구 사이로 남고 혼자 마음 정리"
  ],
  [
   "서로 좋아하는 스킨십 세 가지 말하기",
   "서로 싫어하는 스킨십 한 가지 말하기"
  ],
  [
   "은근한 향이 기억나는 사람",
   "낮은 웃음소리가 기억나는 사람"
  ],
  [
   "같이 산 뒤 결혼 고민하기",
   "결혼을 정한 뒤 같이 살기"
  ],
  [
   "연인에게 내 연애 흑역사 들려주기",
   "같이 옛날 소개팅 프로필 읽기"
  ],
  [
   "성적 끌림이 먼저 생기는 연애",
   "푹 빠지고 나서야 성적 끌림이 생기는 연애"
  ],
  [
   "서로의 잠자리 취향을 솔직하게 적어 교환하기",
   "둘이 누워서 한 가지씩 말하기"
  ],
  [
   "아침에 눈 뜨자마자 키스",
   "잠들기 직전 오래 안아 주기"
  ],
  [
   "잠자리 취향은 비슷하지만 생활 리듬은 정반대",
   "생활 리듬은 같지만 스킨십 속도는 정반대"
  ],
  [
   "첫 키스 뒤 ‘한 번 더?’라고 묻기",
   "첫 키스 뒤 ‘사실 아까부터 하고 싶었어’라고 말하기"
  ],
  [
   "모르는 건 많지만 내 말을 잘 듣는 연인",
   "경험은 많지만 취향이 뚜렷한 연인"
  ],
  [
   "연인과 각방 쓰고 데이트처럼 만나기",
   "한 방 쓰되 한 침대에서 각자 이불 쓰기"
  ]
 ],
 "mission": [
  [
   "키스 직전 립밤 바르기",
   "첫 데이트 직전 향수 뿌리기"
  ],
  [
   "옛 애인을 보고 메뉴판 뒤로 숨기",
   "썸 상대를 보고 거울로 머리 정리하기"
  ],
  [
   "둘이 쓰는 우산 슬쩍 기울이기",
   "같은 담요 끝자락 슬쩍 건네기"
  ],
  [
   "보낸 고백 문자 취소하기",
   "읽은 고백 문자에 답 썼다 지우기"
  ],
  [
   "영화관에서 빈 팔걸이에 손 내밀기",
   "택시에서 안전벨트를 찾다 손 거두기"
  ],
  [
   "첫 키스 각도 혼자 연습하기",
   "고백하는 표정 거울 앞에서 연습하기"
  ],
  [
   "키스 자국을 목도리로 가리기",
   "셔츠에 묻은 립스틱을 소매로 닦기"
  ],
  [
   "몰래 커플링 돌려 빼기",
   "몰래 커플 팔찌를 소매 안에 숨기기"
  ],
  [
   "소개팅 상대를 찾으며 두리번거리기",
   "친구와 온 척하며 썸 상대 쪽 힐끔거리기"
  ],
  [
   "휴대폰에 온 하트 알림 가리기",
   "배경 화면 속 커플 사진 가리기"
  ],
  [
   "집 데이트 전에 바닥의 양말 줍기",
   "집 데이트 전에 소파의 인형 치우기"
  ],
  [
   "마주 앉은 상대에게 윙크하기",
   "마주 앉은 상대에게 눈썹으로 인사하기"
  ],
  [
   "둘이 찍은 사진에서 하트 반쪽 만들기",
   "혼자 찍는 사진에서 커플인 척하기"
  ],
  [
   "호텔 키 카드를 거꾸로 대기",
   "호텔 방 번호를 몰라 문 앞에서 서성이기"
  ],
  [
   "애인에게 몰래 꽃 숨기기",
   "옛 애인의 편지를 서랍 깊이 밀어 넣기"
  ],
  [
   "연락을 기다리며 폰을 뒤집기",
   "답장을 기다리며 새로고침하기"
  ],
  [
   "썸 상대의 옷깃을 정리하는 시늉",
   "내 셔츠 단추가 풀린 걸 뒤늦게 발견하기"
  ],
  [
   "잠든 척하다 메시지 소리에 실눈 뜨기",
   "읽씹한 척하다 미리 보기로 문자 읽기"
  ],
  [
   "엘리베이터 문 닫히기 전에 손하트 보내기",
   "막차 문 닫히기 전에 입 모양으로 고백하기"
  ],
  [
   "소파에서 한 뼘 가까이 옮겨 앉는 시늉",
   "사진에 같이 나오려 옆으로 바짝 기우는 시늉"
  ],
  [
   "데이트 앱 프로필 사진 백 장 찍기",
   "데킬라 한 모금 마신 척하고 사진 찍기"
  ],
  [
   "주머니에서 커플링 상자를 못 찾아 당황하기",
   "기념일 케이크 초에 불이 안 붙어 당황하기"
  ],
  [
   "내 향수를 시향지에 뿌려 건네는 시늉",
   "내 후드티를 벗어 건네는 시늉"
  ],
  [
   "예상 못 한 고백에 빨대를 잘근거리기",
   "예상 못 한 플러팅에 물을 마시다 멈추기"
  ],
  [
   "전 애인과 눈 마주쳐 급히 선글라스 쓰기",
   "소개팅 사진과 달라서 안경 닦고 다시 보기"
  ],
  [
   "옆자리의 가상 상대에게 귓속말하는 시늉",
   "맞은편의 가상 상대에게 입 모양으로 말하기"
  ],
  [
   "기념일을 잊고 달력을 몰래 확인하기",
   "이름을 잘못 불러 헛기침으로 덮기"
  ],
  [
   "데이트 끝에 빈 택시를 슬쩍 보내기",
   "데이트 끝에 신발끈을 천천히 다시 묶기"
  ],
  [
   "포토 부스 마지막 컷에 혼자 입술 내밀기",
   "포토 부스 마지막 컷에 혼자 꽃받침하기"
  ],
  [
   "가상의 상대에게 손잡아도 되냐고 눈빛으로 묻기",
   "가상의 상대에게 춤추자고 손 내밀기"
  ],
  [
   "일어나 보니 가운 허리끈이 풀려 황급히 묶기",
   "잠에서 깨 보니 수면 안대가 턱에 걸려 올리기"
  ],
  [
   "키스하려다 안경이 부딪혀 안경부터 벗는 시늉",
   "손을 잡으려다 정전기에 놀라 움찔하는 시늉"
  ],
  [
   "키스신이 나오자 리모컨을 찾는 척하기",
   "키스신이 끝나자 괜히 팝콘 통만 들여다보기"
  ],
  [
   "가방에서 립밤을 찾다 콘돔이 나와 도로 넣는 시늉",
   "가방에서 호텔 키 대신 집 열쇠를 꺼내는 시늉"
  ],
  [
   "셔츠 단추를 한 칸 밀려 잠근 걸 발견하기",
   "다른 사람 가운을 입은 걸 뒤늦게 발견하기"
  ],
  [
   "침대 한쪽에 누울 자리를 손으로 톡톡 두드리는 시늉",
   "침대 위 베개 두 개를 슬쩍 붙여 놓는 시늉"
  ]
 ],
 "king": [
  "가상의 소개팅 상대에게 애프터를 신청하세요. ‘다음에’라는 말은 금지예요.",
  "첫 키스 3초 전 주인공의 속마음을 영화 예고편처럼 말해 주세요.",
  "‘자니?’를 보낸 사람과 받은 사람의 목소리를 바꿔 가며 읽어 주세요.",
  "데이트 끝에 딱 10분 더 있고 싶다는 말을 핑계 없이 해 보세요.",
  "옛 애인이 ‘잘 지내?’라고 했어요. 가장 쿨한 답과 진짜 속마음을 차례로 말하세요.",
  "키스를 부르는 분위기를 조명, 음악, 대사 한 가지씩으로 연출해 주세요.",
  "‘오늘 좀 섹시한데?’라는 칭찬을 들은 척, 가장 태연한 표정을 지어 주세요.",
  "가상의 연인에게 좋아하는 스킨십을 한 문장으로 주문해 보세요.",
  "립밤 광고를 찍듯 입술에는 손대지 않고 목소리만으로 5초를 채워 주세요.",
  "연애 예능 출연자처럼 첫인상 1위에게 보낼 익명 쪽지를 낭독하세요.",
  "두 배역을 맡아 ‘우리 친구 맞지?’로 시작하는 대화를 세 줄 연기하세요.",
  "하룻밤을 함께한 다음 날 아침, 보내고 싶은 문자 한 줄을 지어내세요.",
  "호텔 프런트 직원처럼 ‘예약하신 더블룸입니다’를 사극 말투로 말하세요.",
  "‘라면 먹고 갈래?’를 대신할 나만의 한마디를 만들어 보세요.",
  "거울 속 자신에게 번호를 물어보는 장면을 연기해 주세요.",
  "내가 소개팅 앱이라면 첫 화면에 걸 내 매력 포인트를 열 글자로 파세요.",
  "‘질투 안 해’라는 대사를 누가 봐도 질투 난 목소리로 말하세요.",
  "가상의 전 애인과 엘리베이터에 단둘이 탔어요. 세 층 동안의 표정만 보여 주세요.",
  "친구에게 썸이 들킨 날의 변명을 세상에서 제일 수상하게 해 주세요.",
  "부끄러워서 못 쓰는 애칭 하나를 골라 내비게이션 음성으로 읽어 주세요.",
  "‘먼저 손잡아도 돼?’를 내 말투로 자연스럽게 연기해 주세요.",
  "나쁜 플러팅 하나를 발명하고, 바로 통할 만한 버전으로 고쳐 주세요.",
  "썸 상대가 보낸 마침표 하나의 의미를 연애 상담가처럼 과몰입해서 해석해 주세요.",
  "휴대폰을 귀에 댄 척 ‘아까 나 왜 안 잡았어?’로 통화를 시작하세요.",
  "레드카펫 인터뷰처럼 ‘마지막 키스신의 비결’을 능청스럽게 대답해 주세요.",
  "초인종이 울린 순간 집 데이트 준비가 안 끝난 사람을 5초 동안 연기하세요.",
  "둘만의 여행에 초대하는 음성 메시지를 한 번도 더듬지 않고 말하세요.",
  "썸이 끝난 사람에게 돌려줄 후드티에 붙일 쪽지를 한 줄 읽어 주세요.",
  "‘내일 아침 뭐 먹을래?’를 야식 광고 말투와 플러팅 말투로 한 번씩 해 보세요.",
  "달달한 멘트를 하다 마지막 한 단어로 분위기를 깨 보세요.",
  "가상의 연인에게 ‘오늘은 내가 먼저 키스하고 싶어’를 자기 말투로 바꿔 말하세요.",
  "서로 끌리는 두 사람이 피임 얘기를 자연스럽게 시작하는 대사를 만들어 보세요.",
  "‘우리 속궁합이 궁금해’라는 고백에 설렜을 때와 당황했을 때의 답을 한 번씩 해 보세요.",
  "호텔에서 침대가 하나뿐이라는 말을 들은 로맨틱 코미디 주인공의 독백을 해 보세요.",
  "잠자리 취향을 묻는 가상의 연인에게 가장 부끄럽지 않게 대화를 여는 한마디를 하세요.",
  "청불 로맨스 예고편을 목소리로만 만들어 보세요. 마지막 대사는 ‘불 끌까?’예요.",
  "둘이 손깍지를 끼고 눈을 맞추며 셋까지 세어 보세요.",
  "둘이 각자 편한 쪽 볼을 골라 가볍게 볼 뽀뽀를 한 번씩 해 보세요.",
  "둘이 서로 팔을 벌려 짧게 포옹해 보세요.",
  "둘이 손등을 내밀고 번갈아 손등에 가볍게 뽀뽀해 보세요.",
  "둘이 어깨를 맞대고 상대에게 듣고 싶은 칭찬을 하나씩 주고받으세요.",
  "둘이 팔짱을 끼고 첫 데이트 사진을 찍는 것처럼 포즈를 잡으세요.",
  "둘이 손을 포개고 누가 먼저 웃을지 눈을 맞춰 보세요.",
  "둘이 손을 잡고 한 사람씩 상대에게 ‘오늘 좀 설렌다’고 속삭여 보세요.",
  "둘이 이마를 가볍게 맞대고 눈을 바라보며 셋까지 세어 보세요.",
  "둘이 뺨을 살짝 맞대고 손으로 커다란 하트 하나를 만들어 보세요.",
  "둘이 한 손씩 맞잡고 느린 음악이 흐르는 것처럼 한 바퀴 돌아 보세요.",
  "둘이 엄지손가락을 걸고 서로에게 해 보고 싶은 데이트를 하나씩 말하세요.",
  "둘이 어깨에 기대어 영화 엔딩 같은 포즈를 3초 동안 잡아 보세요.",
  "둘이 서로의 손바닥에 손가락으로 하트를 그리고 상대가 맞혀 보세요.",
  "둘이 눈을 맞추고 가볍게 입술 뽀뽀를 한 번 해 보세요.",
  "둘이 서로 손을 잡고 누가 먼저 얼굴이 빨개지나 셋까지 세어 보세요."
 ],
 "fingers": [
  "상대 입술을 보다가 무슨 말이었는지 놓친 적 있는 사람",
  "첫 데이트에 키스해 본 사람",
  "‘나 원래 이러지 않아’라고 해 놓고 자주 그랬던 사람",
  "스킨십을 기대하고 향수 뿌릴 위치까지 고민한 사람",
  "썸 상대와의 키스 장면을 혼자 상상해 본 사람",
  "애인 집에 내 칫솔을 슬쩍 두고 온 적 있는 사람",
  "다음 날 뭐라고 연락할지 밤에 미리 연습해 본 사람",
  "친구에게 말한 첫 키스 이야기에서 한 장면을 각색한 사람",
  "좋아하는 사람 향이 밴 옷을 늦게 돌려준 사람",
  "질투하면서 ‘둘이 잘 어울리네’라고 말한 사람",
  "‘자니?’를 썼다가 아침까지 보내지 않은 사람",
  "잠든 척하다 마음에 드는 사람 연락에 바로 깬 사람",
  "데이트 끝낼 시간이 아쉬워 막차 시간을 알고도 모른 척한 사람",
  "누군가의 목소리만 듣고 섹시하다고 생각한 적 있는 사람",
  "데이트할 때 속옷 색까지 맞춰 입어 본 사람",
  "전 애인이 잘 사는지 궁금해서 검색창에 이름을 쳐 본 사람",
  "연락 안 한다고 큰소리친 날 먼저 연락한 사람",
  "고백을 듣고 싶어서 일부러 모르는 척한 사람",
  "사랑보다 외로움 때문에 소개팅에 나간 적 있는 사람",
  "썸 상대가 올린 노래를 내 얘기라고 믿어 본 사람",
  "데이트가 너무 좋아 다음 날 친구에게 자랑할 말을 미리 연습한 사람",
  "친구 사이에 어디까지 스킨십이 가능한지 진지하게 고민해 본 사람",
  "소개팅 상대보다 같은 테이블 다른 사람에게 눈이 간 적 있는 사람",
  "반지를 빼고 난 자국을 보고 연애 중인지 추리해 본 사람",
  "사진을 보내기 전에 똑같은 표정으로 열 장 넘게 찍은 사람",
  "상대가 손잡기 좋게 주머니에서 손을 빼놓은 사람",
  "쿨한 척하느라 받고 싶은 기념일 선물을 말 못 한 사람",
  "애인의 전 연애가 궁금한데 대답을 듣고 후회한 사람",
  "아무 사이 아니라면서 친구들에게 그 사람 얘기를 매번 한 사람",
  "플러팅이라고 자신했는데 나중에 보니 영업 멘트였던 사람",
  "키스하기 좋은 타이밍 같아서 일부러 말을 멈춘 적 있는 사람",
  "연인과 스킨십 취향을 터놓고 이야기해 본 사람",
  "몸에 끌리는 마음과 연애하고 싶은 마음이 달랐던 적 있는 사람",
  "첫 여행을 앞두고 잠자리보다 내 잠버릇이 더 걱정됐던 사람",
  "내가 먼저 피임 이야기를 꺼낸 적 있는 사람",
  "친구에게 속궁합이 얼마나 중요한지 물어본 적 있는 사람",
  "연인과 단둘이 있을 때 평소와 완전히 다른 애칭을 써 본 사람"
 ],
 "imagevote": [
  "연애 예능 첫날, 말도 많이 안 하고 표를 제일 많이 받을 사람은?",
  "‘집에 잘 들어갔어?’ 여섯 글자도 플러팅처럼 들리게 할 사람은?",
  "첫 키스 전에 ‘해도 돼?’를 가장 설레게 물어볼 사람은?",
  "첫 데이트가 끝나기 전에 애프터 날짜까지 잡아 놓을 사람은?",
  "좋아하는 사람 앞에서만 갑자기 말수가 줄 것 같은 사람은?",
  "비밀 연애를 시작한 첫날부터 입꼬리 때문에 들킬 사람은?",
  "목소리만 나오는 소개팅에서 가장 유리할 사람은?",
  "데이트 코스는 엉망인데 분위기 하나로 만회할 사람은?",
  "‘자니?’라는 새벽 문자에 아침 아홉 시 정각에 답할 사람은?",
  "커플 사진에 손만 나와도 친구들이 누구인지 맞힐 사람은?",
  "와인잔 대신 종이컵을 들어도 데이트 분위기를 낼 사람은?",
  "가장 무심한 얼굴로 가장 대담한 칭찬을 할 사람은?",
  "전 애인과 우연히 마주쳐도 먼저 눈웃음으로 인사할 사람은?",
  "같은 우산을 쓰면 자기 어깨부터 젖을 사람은?",
  "소개팅에서 한 시간 만에 서로의 연애관까지 물어볼 사람은?",
  "섹시하다는 말보다 귀엽다는 말에 더 당황할 사람은?",
  "장난처럼 시작한 고백을 마지막 한마디로 진심처럼 만들 사람은?",
  "연인과 다투다가도 말 한마디로 화를 풀어 줄 사람은?",
  "‘아무한테도 안 말했어’라고 해도 얼굴에 연애 중이라고 쓰일 사람은?",
  "카메라가 꺼진 연애 예능에서 더 인기 많을 사람은?",
  "키스신에 어울리는 노래를 바로 골라 낼 사람은?",
  "플러팅을 눈치채고도 상대가 한 번 더 말하게 기다릴 사람은?",
  "친구의 실패한 소개팅을 라디오 사연처럼 맛깔나게 읽을 사람은?",
  "하루짜리 커플 여행도 한 달 전부터 숙소를 찾아볼 사람은?",
  "손깍지 하나로 오늘부터 1일이라는 분위기를 만들 사람은?",
  "밤에 쓴 고백 문자를 아침에 읽고도 그대로 보낼 사람은?",
  "연인에게 부르는 애칭을 실수로 사람들 앞에서 말할 사람은?",
  "자기소개 한 줄로 소개팅 앱 프로필을 완성할 사람은?",
  "한 번 헤어졌다가 재회하는 영화의 주인공이 잘 어울릴 사람은?",
  "‘하고 싶은 말 없어요?’를 듣자마자 망설임 없이 고백할 사람은?",
  "키스하고 나서 ‘또 해도 돼?’라고 묻는 말이 가장 잘 어울리는 사람은?",
  "연인과 스킨십 취향 이야기를 꺼내도 어색하지 않게 분위기를 풀 사람은?",
  "청불 로맨스의 목소리 출연 제안을 받으면 제일 찰떡일 사람은?",
  "손도 안 잡고 눈빛만으로 키스신 같은 분위기를 만들 사람은?",
  "‘섹시하다’는 칭찬을 듣고 ‘어떤 점이?’라고 당당하게 되물을 사람은?",
  "단둘이 있는 밤에 먼저 재생할 음악이 이미 정해져 있을 것 같은 사람은?"
 ],
 "initial": [
  "ㅋㅅ",
  "ㅍㅍ",
  "ㅇㅇ",
  "ㅅㅋ",
  "ㅁㄹ",
  "ㅎㅅ",
  "ㅁㅎ",
  "ㅈㅌ",
  "ㅅㄲ",
  "ㅅㅎ",
  "ㄱㅂ",
  "ㅇㅁ"
 ]
}$picks$::jsonb) bank cross join lateral jsonb_array_elements(bank.value) v
)
insert into ojjuda_arcade_internal.drinking_content_items(kind,body,second,party_pick)
 select n.kind,n.body,n.second,true from new_picks n
 where not exists (
  select 1 from ojjuda_arcade_internal.drinking_content_items c
  where c.kind=n.kind and least(lower(c.body),lower(c.second))=least(lower(n.body),lower(n.second))
    and greatest(lower(c.body),lower(c.second))=greatest(lower(n.body),lower(n.second))
 ) and not exists (
  select 1 from ojjuda_arcade_internal.drinking_prompt_baseline b
  where n.kind in ('king','fingers','imagevote')
    and b.fingerprint=ojjuda_arcade_internal.drinking_prompt_fingerprint(n.kind,'',n.body)
 ) and not exists (
  select 1 from ojjuda_arcade_internal.drinking_prompt_queue q
  where n.kind in ('king','fingers','imagevote') and q.fingerprint=ojjuda_arcade_internal.drinking_prompt_fingerprint(n.kind,'',n.body)
 ) on conflict do nothing;

with added as (
 insert into ojjuda_arcade_internal.drinking_truth_cards(flavor,body,party_pick)
 select 'spicy',q,true from jsonb_array_elements_text($questions$[
 "첫 데이트에서 키스하고 싶을 때 먼저 말하는 편이에요, 상대가 알아차리길 기다려요?",
 "최근 누군가에게 성적으로 끌린 순간, 제일 먼저 눈에 들어온 건 뭐였어요?",
 "키스하고 나서 호감이 확 커지거나 식었던 적이 있어요? 뭐가 달랐어요?",
 "연인과 잠자리가 잘 맞는다는 건 나에게 어떤 뜻이에요?",
 "마음이 통하는데 잠자리 취향은 다를 때, 어떤 말로 대화를 시작할래요?",
 "연애 감정 없이도 하룻밤의 끌림만으로 만날 수 있어요?",
 "하룻밤을 함께한 다음 날, 받고 싶은 문자와 절대 받고 싶지 않은 문자는?",
 "나를 설레게 하는 스킨십 하나를 상대에게 직접 말한다면 어떻게 말할래요?",
 "키스하기 딱 좋은 순간이었는데 타이밍을 놓친 적 있어요? 그때 왜 망설였어요?",
 "내가 생각하는 가장 섹시한 칭찬은 뭐예요? 그 말을 먼저 해 본 적도 있어요?",
 "속옷을 고를 때 나만의 만족과 상대의 반응 중 어느 쪽을 더 의식해요?",
 "잠자리에 관해 솔직하게 말하기 쉬운 때는 만나기 전, 그날 밤, 다음 날 중 언제예요?",
 "‘오늘은 스킨십 없이 옆에만 있고 싶어’라는 말을 편하게 할 수 있는 사이였어요?",
 "마음에 드는 사람이 먼저 ‘키스해도 돼?’라고 묻는다면 어떤 대답을 해 보고 싶어요?",
 "좋아하는 사람이 풍기는 향 중에서 유독 가까이 가고 싶었던 향은?",
 "첫 키스의 장소와 상대가 한 말 중 지금도 생생한 쪽은 어느 쪽이에요?",
 "연인끼리만 아는 애칭 중 밖에서 들으면 얼굴이 빨개질 만한 게 있어요?",
 "소개팅에서 대화보다 몸이 먼저 끌렸다면 한 번 더 만나요?",
 "집에 초대하고 싶다는 뜻으로 내가 실제로 써 본 가장 뻔한 핑계는?",
 "누군가와 단둘이 밤을 보내고도 ‘우리 무슨 사이야?’를 못 물은 적 있어요?",
 "연인의 과거 성 경험이 궁금해요, 지금 둘의 취향만 알고 싶어요? 그 이유는?",
 "사귀기 전에 스킨십이 어디까지 편한지 어떻게 알려 주는 편이에요?",
 "피임 얘기를 먼저 꺼낸다면 덜 어색하게 시작할 나만의 한마디는?",
 "분위기는 완벽했는데 한마디에 확 식었던 적 있어요? 어떤 말이었어요?",
 "상대가 내게 반한 순간과 내가 상대에게 반한 순간, 어느 쪽이 더 뜨거웠어요?",
 "설레는 사람과 편한 사람 사이에서 솔직히 누구에게 더 자주 연락했어요?",
 "전 애인에게 새벽에 연락한 적 있다면, 안부 말고 진짜 궁금했던 건 뭐였어요?",
 "다 끝났다고 해 놓고 다시 만나고 싶었던 사람에게 가장 약해지는 말은?",
 "둘이 있는 밤에 사랑한다는 말이 더 좋아요, 보고 싶었다는 말이 더 좋아요?",
 "연인이 내게 더 자주 먼저 해 줬으면 하는 애정 표현은?",
 "남들 앞에선 쿨한 척하지만 단둘이면 유난히 부끄러워지는 순간은?",
 "친구인 줄 알았던 사람에게 갑자기 성적 매력을 느낀 건 어떤 계기였어요?",
 "서로 마음이 확실한 첫 여행이라면 침대 하나와 방 두 개 중 무엇을 직접 예약할래요?",
 "질투를 유발하려고 다른 사람 이야기를 살짝 부풀린 적 있어요?",
 "헤어진 뒤 물건을 돌려준다는 핑계로 한 번 더 본 적 있어요? 진짜 할 말은 뭐였어요?",
 "썸 상대와 한 이불을 덮고 영화 한 편만 보기, 자신 있어요? 끝나고 무슨 말을 할래요?",
 "지금까지 받아 본 플러팅 중 너무 대담해서 오히려 통했던 한마디는?",
 "데이트 상대에게 ‘나한테 관심 있어?’라는 질문을 받으면 어느 정도까지 솔직해질래요?",
 "입맞춤, 포옹, 손잡기 중 하나만 상대가 기억한다면 무엇이었으면 좋겠어요?",
 "끌리지만 사귀고 싶지는 않은 사람에게는 어떻게 선을 그어요?",
 "잠자리가 관계를 바꿀 것 같아서 오히려 천천히 가자고 한 적 있어요?",
 "말로 듣는 사랑과 몸으로 느끼는 애정이 다르다고 생각해요? 언제 그렇게 느꼈어요?",
 "누군가의 셔츠나 후드티를 입고 싶었던 건 옷이 좋아서였어요, 사람이 좋아서였어요?",
 "친구에게 연애 상담하면서 가장 결정적인 장면 하나를 빼고 얘기한 적 있어요?",
 "연인과 새로운 걸 해 보고 싶을 때, 먼저 제안하기 쉬운 분위기는 어떤 분위기예요?",
 "내가 그린 로맨틱한 밤이 예상 밖의 웃긴 기억으로 끝난 적 있어요?",
 "사귀기 전에 잔다는 것과 사귄 뒤에 잔다는 것, 내 선택을 가르는 기준은?",
 "잠자리 궁합이 잘 맞지만 연애관은 다른 사람을 계속 만날 수 있어요?",
 "연인에게 내가 먼저 ‘오늘 같이 자고 싶어’라고 말할 수 있어요? 실제로는 어떻게 말할래요?",
 "상대의 스킨십이 내 취향과 다를 때 그 순간에 말해요, 나중에 말해요?",
 "섹스에 대해 연인에게 물어보고 싶었는데 아직 말로 못 꺼낸 질문이 있다면?",
 "서로 다른 성욕 때문에 서운해졌을 때 가장 듣고 싶은 말은 뭐예요?",
 "처음 같이 자는 날, 분위기보다 먼저 서로 확인하고 싶은 게 있어요?",
 "나에게 가장 성적으로 매력적인 건 외모, 목소리, 자신감 중 어느 쪽이에요?"
]$questions$::jsonb) q
 where not exists (select 1 from ojjuda_arcade_internal.drinking_truth_history h
                   where h.fingerprint=ojjuda_arcade_internal.drinking_prompt_fingerprint('truth','spicy',q))
   and not exists (select 1 from ojjuda_arcade_internal.drinking_prompt_queue p
                   where p.fingerprint=ojjuda_arcade_internal.drinking_prompt_fingerprint('truth','spicy',q))
 on conflict do nothing returning id,flavor,body
)
insert into ojjuda_arcade_internal.drinking_truth_history(fingerprint,card_id)
 select ojjuda_arcade_internal.drinking_prompt_fingerprint('truth',flavor,body),id from added;

create or replace function ojjuda_arcade_internal.drinking_content(p_action text,p_options jsonb default '{}')
returns jsonb language plpgsql volatile security definer set search_path='' as $catalog$
declare
 allowed constant text[]:=array['bomb','liar','minority','mission','king','fingers','imagevote','truth','initial'];
 requested text:=p_options->>'kind';
 tier text:=nullif(p_options->>'flavor','');
 wording text;
 other_wording text;
 fingerprint_in bytea;
 key_id integer;
 prior_revision integer;
 item ojjuda_arcade_internal.drinking_content_items%rowtype;
 card ojjuda_arcade_internal.drinking_truth_cards%rowtype;
 query_text text;
 before_id integer;
 next_id integer;
 result jsonb:='{}';
 lines jsonb;
 favor_party boolean;
begin
 perform ojjuda_poker_internal.check_member(auth.uid());
 if p_action='pool' then
  if jsonb_typeof(p_options->'kinds') is distinct from 'array' then raise exception 'invalid_kind'; end if;
  if jsonb_array_length(p_options->'kinds')>cardinality(allowed)
   or exists(select 1 from jsonb_array_elements_text(p_options->'kinds') k where k is null or not k=any(allowed))
   then raise exception 'invalid_kind'; end if;
  for requested in select distinct k from jsonb_array_elements_text(p_options->'kinds') k loop
   favor_party:=p_options->'round_mix'='true'::jsonb and random()<0.68;
   if requested='truth' then
    if favor_party then
     select exists(select 1 from ojjuda_arcade_internal.drinking_truth_cards where active and flavor='spicy' and party_pick) into favor_party;
    end if;
    select jsonb_build_object(
      'mild',coalesce(jsonb_agg(body order by id) filter(where flavor='mild'),'[]'::jsonb),
      'spicy',coalesce(jsonb_agg(body order by id) filter(where flavor='spicy' and (not coalesce(favor_party,false) or party_pick)),'[]'::jsonb))
     into lines from ojjuda_arcade_internal.drinking_truth_cards where active;
   else
    if favor_party then
     select exists(select 1 from ojjuda_arcade_internal.drinking_content_items where active and kind=requested and party_pick) into favor_party;
    end if;
    select coalesce(jsonb_agg(case when second is null then to_jsonb(body) else jsonb_build_array(body,second) end order by id),'[]'::jsonb)
     into lines from ojjuda_arcade_internal.drinking_content_items where active and kind=requested and (not coalesce(favor_party,false) or party_pick);
   end if;
   result:=jsonb_set(result,array[requested],lines);
  end loop;
  return jsonb_build_object('banks',result);
 end if;
 if public.is_admin() is not true then raise exception 'not_admin' using errcode='42501'; end if;
 if requested is null or not requested=any(allowed) then raise exception 'invalid_kind'; end if;
 if tier is not null and (requested<>'truth' or tier not in ('mild','spicy')) then raise exception 'invalid_flavor'; end if;
 if p_action='list' then
  if p_options->>'before' is not null then
   if (p_options->>'before') !~ '^[1-9][0-9]{0,9}$' or (p_options->>'before')::numeric>2147483647 then raise exception 'invalid_id'; end if;
   before_id:=(p_options->>'before')::int;
  end if;
  query_text:=lower(ojjuda_arcade_internal.drinking_prompt_clean(coalesce(p_options->>'q','')));
  if char_length(query_text)>240 then raise exception 'invalid_prompt'; end if;
  with page as (
   select r.* from ojjuda_arcade_internal.drinking_content_rows r
    where r.kind=requested and (tier is null or r.flavor=tier) and (before_id is null or r.id<before_id)
     and (strpos(lower(r.body),query_text)>0 or strpos(lower(r.second),query_text)>0)
    order by r.id desc limit 51
  ), shown as (select * from page order by id desc limit 50)
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'id',id,'kind',kind,'text',body,'second',second,'flavor',flavor,'revision',revision)) order by id desc),'[]'::jsonb),
   case when (select count(*) from page)>50 then min(id) end into lines,next_id from shown;
  return jsonb_build_object('items',lines,'next',next_id);
 end if;
 if p_action is null or p_action not in ('edit','delete','add') then raise exception 'invalid_action'; end if;
 if p_action in ('edit','delete') then
  if coalesce(p_options->>'id','') !~ '^[1-9][0-9]{0,9}$' or (p_options->>'id')::numeric>2147483647 then raise exception 'invalid_id'; end if;
  if coalesce(p_options->>'revision','') !~ '^[1-9][0-9]{0,8}$' then raise exception 'stale_revision'; end if;
  key_id:=(p_options->>'id')::int;
  prior_revision:=(p_options->>'revision')::int;
 end if;
 if p_action in ('edit','add') then
  if jsonb_typeof(p_options->'text') is distinct from 'string' or octet_length(p_options->>'text')>3000 then raise exception 'invalid_prompt'; end if;
  wording:=ojjuda_arcade_internal.drinking_prompt_clean(p_options->>'text');
  if char_length(wording) not between 1 and (case requested when 'king' then 80 when 'truth' then 240 else 120 end)
    or (requested='initial' and wording !~ '^[ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ]{2}$') then raise exception 'invalid_prompt'; end if;
  if requested in ('minority','mission') then
   if jsonb_typeof(p_options->'second') is distinct from 'string' or octet_length(p_options->>'second')>3000 then raise exception 'invalid_prompt'; end if;
   other_wording:=ojjuda_arcade_internal.drinking_prompt_clean(p_options->>'second');
   if char_length(other_wording) not between 1 and 120 or lower(other_wording)=lower(wording) then raise exception 'invalid_prompt'; end if;
  elsif nullif(p_options->>'second','') is not null then raise exception 'invalid_prompt';
  end if;
  if requested='truth' and tier is null then raise exception 'invalid_flavor'; end if;
 end if;

 -- The existing truth and moderation paths use this same transaction lock.
 perform pg_advisory_xact_lock(24613,911);
 if requested='truth' then
  if p_action in ('edit','delete') then
   return ojjuda_arcade_internal.drinking_prompt_suggestions('truth_'||p_action,p_options);
  end if;
  fingerprint_in:=ojjuda_arcade_internal.drinking_prompt_fingerprint('truth',tier,wording);
  select t.* into card from ojjuda_arcade_internal.drinking_truth_history h
   join ojjuda_arcade_internal.drinking_truth_cards t on t.id=h.card_id where h.fingerprint=fingerprint_in for update of t;
  if found then
   if card.active then raise exception 'duplicate_prompt'; end if;
   update ojjuda_arcade_internal.drinking_truth_cards set active=true,body=wording,flavor=tier,revision=revision+1 where id=card.id;
  else
   insert into ojjuda_arcade_internal.drinking_truth_cards(flavor,body) values(tier,wording) returning id into key_id;
   insert into ojjuda_arcade_internal.drinking_truth_history(fingerprint,card_id) values(fingerprint_in,key_id);
  end if;
 elsif p_action='add' then
  insert into ojjuda_arcade_internal.drinking_content_items(kind,body,second) values(requested,wording,other_wording);
 else
  select * into item from ojjuda_arcade_internal.drinking_content_items where kind=requested and id=key_id for update;
  if not found then raise exception 'invalid_id'; end if;
  if not item.active then
   if p_action='delete' then return jsonb_build_object('ok',true); end if;
   raise exception 'card_removed';
  end if;
  if p_action='edit' and item.body=wording and item.second is not distinct from other_wording then return jsonb_build_object('ok',true); end if;
  if item.revision<>prior_revision then raise exception 'stale_revision'; end if;
  if p_action='delete' then
   if not exists(select 1 from ojjuda_arcade_internal.drinking_content_items where kind=requested and active and id<>key_id)
    then raise exception 'last_prompt'; end if;
   update ojjuda_arcade_internal.drinking_content_items set active=false,revision=revision+1 where id=key_id;
  else
   update ojjuda_arcade_internal.drinking_content_items set body=wording,second=other_wording,revision=revision+1 where id=key_id;
  end if;
 end if;
 return jsonb_build_object('ok',true);
exception when unique_violation then raise exception 'duplicate_prompt';
end;
$catalog$;

-- Native room RPCs store the selected words in the round state. Consult the
-- current catalog only when dealing a new prompt.
create or replace function ojjuda_arcade_internal.drinking_draw_prompt(p_kind text,p_previous text[])
returns text[] language plpgsql volatile security invoker set search_path='' as $draw$
declare
 result text[];
 favor_party boolean:=random()<0.68;
begin
 select case when c.second is null then array[c.body] else array[c.body,c.second] end
 into result
 from ojjuda_arcade_internal.drinking_content_items c
 where c.kind=p_kind and c.active
 order by case when c.body is distinct from p_previous[1] then 0
               when c.second is distinct from p_previous[2] then 1 else 2 end,
          case when favor_party and c.party_pick then 0 else 1 end, random()
 limit 1;
 if not found then raise exception 'invalid_game'; end if;
 return result;
end;
$draw$;
revoke all on function ojjuda_arcade_internal.drinking_draw_prompt(text,text[]) from public,anon,authenticated;


notify pgrst,'reload schema';
-- The selected card numbers respond independently. Keep prior single-person orders and old completed rounds readable.
alter table ojjuda_arcade_internal.king_rooms
 add column accepted_numbers int[] not null default '{}',
 add column declined_number int;
CREATE OR REPLACE FUNCTION public.king_multiplayer(p_action text, p_code text DEFAULT ''::text, p_options jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 parent_row ojjuda_arcade_internal.drinking_rooms%rowtype;
 actor uuid:=auth.uid(); nick text; r ojjuda_arcade_internal.king_rooms%rowtype;
 pw text:=coalesce(p_options->>'password',''); title_in text; cap int; req uuid;
 me int; number_in int; second_in int; mission_in text; rooms jsonb; changed boolean:=false; deal boolean:=false;
begin
 select p.nickname into nick from public.profiles p join auth.users u on u.id=p.id
 where p.id=actor and not coalesce(u.is_anonymous,false);
 if not found then raise exception 'not_signed_in'; end if;
 if public.is_banned(actor) then raise exception 'banned'; end if;
 perform ojjuda_poker_internal.check_member(actor);
 if p_action='list' then
  select coalesce(jsonb_agg(item order by mine desc,expiry desc),'[]') into rooms from (
   select actor=any(c.members) mine,c.expires_at expiry,jsonb_build_object(
    'room_no','K-'||c.code,'kind','king','native',true,'title',c.title,
    'status',case when c.phase='waiting' then 'waiting' else 'playing' end,'host_name',c.names[1],
    'players',cardinality(c.members),'capacity',c.capacity,'is_host',actor=c.members[1],
    'is_member',actor=any(c.members),'match_id',c.code,'code',c.code) item
   from ojjuda_arcade_internal.king_rooms c where c.drinking_code is null and (actor=any(c.members) or c.members=ojjuda_arcade_internal.drinking_adult_members(c.members)) and c.expires_at>now()
    and (c.phase='waiting' or actor=any(c.members))
    and (actor=any(c.members) or not exists(select 1 from unnest(c.members) m where public.blocked_between(actor,m)))
   order by mine desc,expiry desc limit 100) listed;
  return jsonb_build_object('rooms',rooms);
 end if;
 if p_action in ('create','join') then perform pg_advisory_xact_lock(hashtextextended(actor::text,835)); end if;
 if p_action='create' then
  req:=(p_options->>'request_id')::uuid; cap:=(p_options->>'capacity')::int; title_in:=trim(p_options->>'title');
  if req is null or cap is null or cap not between 3 and 12 or title_in is null or length(title_in) not between 1 and 40 then raise exception 'invalid_title'; end if;
  if length(pw) not between 4 and 32 or octet_length(pw)>72 then raise exception 'invalid_password'; end if;
  delete from ojjuda_arcade_internal.king_rooms where expires_at<=now();
  delete from ojjuda_arcade_internal.king_attempts where since<now()-interval '10 minutes';
  select * into r from ojjuda_arcade_internal.king_rooms where drinking_code is null and creator=actor and request_id=req for update;
  if not found then
   if exists(select 1 from ojjuda_arcade_internal.king_rooms where drinking_code is null and actor=any(members)) then raise exception 'room_in_progress'; end if;
   loop
    insert into ojjuda_arcade_internal.king_rooms(code,title,password_hash,capacity,creator,request_id,members,names)
    values(upper(encode(extensions.gen_random_bytes(3),'hex')),title_in,extensions.crypt(pw,extensions.gen_salt('bf',8)),cap,actor,req,array[actor],array[nick])
    on conflict(code) do nothing returning * into r;
    exit when found;
   end loop;
  end if;
 elsif p_action='state' then
  select * into r from ojjuda_arcade_internal.king_rooms where code=upper(p_code) and expires_at>now();
  if not found then raise exception 'room_unavailable'; end if;
 else
  select * into r from ojjuda_arcade_internal.king_rooms where code=upper(p_code) and expires_at>now() for update;
  if not found then raise exception 'room_unavailable'; end if;
 end if;
 if r.members<>ojjuda_arcade_internal.drinking_adult_members(r.members) then
  if not(actor=any(r.members)) then raise exception 'room_unavailable'; end if;
  if r.drinking_code is not null then raise exception 'member_unavailable'; end if;
  perform ojjuda_arcade_internal.drinking_restore_standalone('king',r.code);
  select * into strict r from ojjuda_arcade_internal.king_rooms where code=r.code;
  p_action:='state';
 end if;

 me:=array_position(r.members,actor)-1;

 if r.drinking_code is not null then
  select * into parent_row from ojjuda_arcade_internal.drinking_rooms h where h.code=r.drinking_code
   and h.phase='playing' and h.child=r.code and h.kind='king' and h.expires_at>now();
  if not found or not(actor=any(parent_row.members)) then raise exception 'not_room_member'; end if;
  if p_action in ('leave','cancel','again') then raise exception 'managed_room'; end if;
  if p_action='hub_bootstrap' and (r.phase<>'waiting' or r.creator<>actor or parent_row.creator<>actor
       or r.members<>parent_row.members[2:cardinality(parent_row.members)]) then raise exception 'managed_room'; end if;
 elsif p_action='hub_bootstrap' then raise exception 'invalid_action';
 end if;

 if p_action='hub_bootstrap' then
  r.members:=parent_row.members; r.names:=parent_row.names; me:=0;
  deal:=true; changed:=true;
 elsif p_action='join' and me is null then
  if exists(select 1 from unnest(r.members) m where public.blocked_between(actor,m)) then raise exception 'room_unavailable'; end if;
  if r.phase<>'waiting' or cardinality(r.members)>=r.capacity then raise exception 'room_full'; end if;
  if exists(select 1 from ojjuda_arcade_internal.king_rooms where drinking_code is null and actor=any(members) and expires_at>now()) then raise exception 'room_in_progress'; end if;
  if exists(select 1 from ojjuda_arcade_internal.king_attempts c where c.actor=auth.uid() and c.attempts>=10 and c.since>now()-interval '1 minute') then
   return jsonb_build_object('error','join_rate_limit');
  end if;
  if length(pw) not between 4 and 32 or octet_length(pw)>72 or extensions.crypt(pw,r.password_hash)<>r.password_hash then
   insert into ojjuda_arcade_internal.king_attempts as c values(actor,now(),1)
    on conflict on constraint king_attempts_pkey do update set
    attempts=case when c.since>now()-interval '1 minute' then c.attempts+1 else 1 end,
    since=case when c.since>now()-interval '1 minute' then c.since else now() end;
   return jsonb_build_object('error','wrong_password');
  end if;
  delete from ojjuda_arcade_internal.king_attempts c where c.actor=auth.uid();
  changed:=true; r.members:=array_append(r.members,actor); r.names:=array_append(r.names,nick); me:=cardinality(r.members)-1;
  deal:=cardinality(r.members)=r.capacity;
 elsif me is null then raise exception 'not_room_member';
 elsif p_action in ('create','join','state') then null;
 elsif p_action in ('leave','cancel') then
  if p_action='cancel' and (me<>0 or r.phase<>'waiting') then raise exception 'room_already_started'; end if;
  if p_action='leave' and
     ((p_options ? 'round' and p_options->'round' is distinct from to_jsonb(r.round))
      or (p_options ? 'waiting' and p_options->'waiting' is distinct from to_jsonb(r.phase='waiting'))
      or (p_options ? 'host' and p_options->'host' is distinct from to_jsonb(me=0))) then
   raise exception 'stale_round';
  end if;
  if p_action='leave' and me=0 and cardinality(r.members)>1 then
   declare n int:=cardinality(r.members); successor int:=2+floor(random()*(n-1))::int;
   begin
    -- The normal action path holds this row FOR UPDATE. Move only the new host
    -- to the first seat; awaiting players retain their relative order.
    update ojjuda_arcade_internal.king_rooms
     set members=array[r.members[successor]]||r.members[2:successor-1]||r.members[successor+1:n],
         names=array[r.names[successor]]||r.names[2:successor-1]||r.names[successor+1:n],
         creator=r.members[successor],request_id=gen_random_uuid(),phase='waiting',
         round=r.round+1,revision=r.revision+1,expires_at=now()+interval '1 day',
         cards='{}',confirmed='{}',chosen=null,chosen_second=null,mission=null,accepted_numbers='{}',declined_number=null
     where code=r.code;
   end;
   return jsonb_build_object('left',true);
  end if;
  if me=0 or r.phase<>'waiting' then
   delete from ojjuda_arcade_internal.king_rooms where code=r.code;
   return jsonb_build_object('left',true);
  end if;
  changed:=true; r.members:=array_remove(r.members,actor); r.names:=r.names[1:me]||r.names[me+2:cardinality(r.names)];


 elsif p_action in ('ready','order','again','accept','decline') then
  if (p_options->>'round')::int is distinct from r.round then raise exception 'stale_round'; end if;
  if p_action in ('accept','decline') then
   if r.chosen_second is null or r.cards[me+1] not in (r.chosen,r.chosen_second) then raise exception 'recipient_only'; end if;
   if r.phase='response' then
    if p_action='decline' then
     r.declined_number:=r.cards[me+1]; r.phase:='done'; changed:=true;
    elsif not r.cards[me+1]=any(r.accepted_numbers) then
     r.accepted_numbers:=array_append(r.accepted_numbers,r.cards[me+1]); changed:=true;
     if cardinality(r.accepted_numbers)=2 then r.phase:='done'; end if;
    end if;
   elsif r.phase<>'done' then raise exception 'unavailable'; end if;
  elsif p_action='again' then
   if me<>0 or r.phase<>'done' then raise exception 'unavailable'; end if;
   r.round:=r.round+1; deal:=true;
  elsif p_action='ready' then
   if r.confirmed[me+1] then null;
   elsif r.phase<>'cards' then raise exception 'unavailable';
   else
    r.confirmed[me+1]:=true; changed:=true;
    if not (false=any(r.confirmed)) then r.phase:='order'; end if;
   end if;
  else
   if r.cards[me+1] is distinct from 0 then raise exception 'king_only'; end if;
   number_in:=(p_options->>'number')::int; second_in:=(p_options->>'second')::int; mission_in:=btrim(p_options->>'mission');
   if number_in is null or number_in not between 1 and r.capacity-1 then raise exception 'invalid_number'; end if;
   if second_in=number_in or second_in not between 1 and r.capacity-1 then raise exception 'invalid_number'; end if;
   if mission_in is null or length(mission_in) not between 1 and 80 then raise exception 'invalid_mission'; end if;
   if r.phase in ('response','done') and r.chosen=number_in and r.chosen_second is not distinct from second_in and r.mission=mission_in then null;
   elsif r.phase<>'order' then raise exception 'order_closed';
   else r.chosen:=number_in; r.chosen_second:=second_in; r.mission:=mission_in; r.phase:=case when second_in is null then 'done' else 'response' end; changed:=true;
   end if;
  end if;
 else raise exception 'invalid_action';
 end if;
 if deal then
  select array_agg(n order by random()) into r.cards from generate_series(0,r.capacity-1) n;
  r.phase:='cards'; r.accepted_numbers:='{}'; r.declined_number:=null; r.chosen:=null; r.chosen_second:=null; r.mission:=null; r.confirmed:=array_fill(false,array[r.capacity::int]); changed:=true;
 end if;
 if changed then
  update ojjuda_arcade_internal.king_rooms set members=r.members,names=r.names,phase=r.phase,
   accepted_numbers=r.accepted_numbers,declined_number=r.declined_number,cards=r.cards,confirmed=r.confirmed,chosen=r.chosen,chosen_second=r.chosen_second,mission=r.mission,round=r.round,revision=revision+1,expires_at=now()+interval '1 day'
   where code=r.code returning * into r;
 end if;
 if p_action='leave' then return jsonb_build_object('left',true); end if;
 return jsonb_strip_nulls(jsonb_build_object('code',r.code,'title',r.title,'capacity',r.capacity,'players',r.names,
  'phase',r.phase,'me',me,'revision',r.revision,'round',r.round,'card',r.cards[me+1],'ready',r.confirmed[me+1],
  'readyCount',cardinality(array_positions(r.confirmed,true)),
  'king',case when r.phase in ('order','response','done') then array_position(r.cards,0)-1 end,
  'accepted',case when r.phase in ('response','done') and r.chosen_second is not null then r.accepted_numbers end,
  'declined',case when r.phase='done' and r.declined_number is not null then array_position(r.cards,r.declined_number)-1 end,
  'number',r.chosen,'mission',r.mission,'recipient',case when r.phase in ('response','done') then array_position(r.cards,r.chosen)-1 end,
  'second',case when r.phase in ('response','done') then r.chosen_second end,
  'secondRecipient',case when r.phase in ('response','done') and r.chosen_second is not null then array_position(r.cards,r.chosen_second)-1 end));
end;
$function$;
