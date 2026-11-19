import {maskedTextLength} from '../../../../shared/content/text-length.mjs';

// These are optional, self-selected profile details, not inferred personality types.
export const MAX_PROFILE_CUSTOM_LENGTH = 40;
export const MAX_PROFILE_GROUP_SELECTIONS = 32;

export const relationshipIntents = Object.freeze([
  {key:"conversation", label:"대화 상대", shortLabel:"대화", description:"일상과 생각을 편하게 나눌 사람을 찾아요."},
  {key:"casual", label:"편한 만남", shortLabel:"편한 만남", description:"부담 없이 만나며 서로 알아가고 싶어요."},
  {key:"friendship", label:"친구", shortLabel:"친구", description:"편하게 연락하고 함께할 친구를 만나고 싶어요."},
  {key:"dating", label:"연애 상대", shortLabel:"연애", description:"서로 알아가며 연애할 상대를 찾고 있어요."},
  {key:"marriage", label:"결혼 상대", shortLabel:"결혼", description:"결혼을 생각하며 진지하게 알아가고 싶어요."},
].map(intent=>Object.freeze(intent)));

function group(key, label, entries) {
  return Object.freeze({key, label,
    options:Object.freeze(entries.map(([key,label])=>Object.freeze({key,label}))),
  });
}

export const profilePreferenceGroups = Object.freeze([
  group("meeting_styles", "만남 스타일", [
    ["deep_talk", "차분한 대화"],
    ["playful_chat", "유쾌한 수다"],
    ["share_worries", "고민 나누기"],
    ["dine_together", "함께 식사"],
    ["cafe_talk", "카페에서 대화"],
    ["neighborhood_walk", "동네 산책"],
    ["park_picnic", "공원 피크닉"],
    ["food_exploration", "맛집 탐방"],
    ["new_experiences", "새로운 경험"],
    ["exhibitions", "전시·박물관"],
    ["films_performances", "영화·공연"],
    ["music_listening", "음악 감상"],
    ["book_talk", "책 이야기"],
    ["exercise_together", "함께 운동"],
    ["light_hiking", "가벼운 등산"],
    ["nature_seaside", "바다·자연"],
    ["scenic_drives", "드라이브"],
    ["day_trips", "근교 나들이"],
    ["short_travel", "짧은 여행"],
    ["cook_together", "함께 요리"],
    ["learn_hobbies", "취미 배우기"],
    ["games", "게임·보드게임"],
    ["relax_at_home", "집에서 쉬기"],
    ["everyday_company", "일상 함께하기"],
  ]),
  group("relationship_values", "관계에서 중요한 것", [
    ["trust", "신뢰"],
    ["honesty", "솔직한 마음"],
    ["mutual_respect", "상호 존중"],
    ["thoughtful_care", "세심한 배려"],
    ["humor", "웃음과 유머"],
    ["empathy", "공감과 위로"],
    ["deep_conversation", "대화의 깊이"],
    ["everyday_comfort", "일상의 편안함"],
    ["romance", "설렘과 낭만"],
    ["stability", "관계의 안정감"],
    ["alone_time", "독립적인 시간"],
    ["freedom", "서로의 자유"],
    ["respect_differences", "취향의 차이 인정"],
    ["shared_growth", "함께하는 성장"],
    ["reliability", "약속과 책임"],
    ["mutual_effort", "공평한 노력"],
    ["steady_affection", "꾸준한 애정"],
    ["resolve_conflicts", "갈등을 푸는 대화"],
    ["shared_challenges", "함께하는 도전"],
    ["family_harmony", "가족과의 조화"],
    ["financial_responsibility", "경제적 책임"],
    ["healthy_living", "건강한 생활"],
    ["shared_experiences", "같이하는 경험"],
    ["encouragement", "지지와 응원"],
  ]),
  group("affection_styles", "마음을 표현하는 방식", [
    ["check_in_first", "먼저 안부 묻기"],
    ["frequent_contact", "자주 연락하기"],
    ["long_conversations", "긴 이야기 나누기"],
    ["affectionate_words", "애정 표현하기"],
    ["compliments", "칭찬해 주기"],
    ["gratitude", "고마움 전하기"],
    ["heartfelt_letters", "진심 담은 편지"],
    ["little_messages", "작은 메시지 남기기"],
    ["attentive_listening", "이야기 들어주기"],
    ["solve_worries_together", "고민 함께 풀기"],
    ["emotional_attunement", "마음 알아주기"],
    ["make_time", "함께 시간 내기"],
    ["celebrate_dates", "기념일 챙기기"],
    ["remember_preferences", "취향 기억하기"],
    ["small_gifts", "작은 선물"],
    ["handmade_gifts", "직접 만든 선물"],
    ["cook_for_someone", "음식 만들어 주기"],
    ["practical_help", "필요할 때 돕기"],
    ["respect_personal_time", "서로의 시간 존중"],
    ["celebrate_success", "성공 함께 기뻐하기"],
    ["support_goals", "꿈과 목표 응원"],
    ["offer_rest", "편히 쉴 수 있게 하기"],
    ["holding_hands_hugs", "손잡기·포옹"],
    ["ask_and_care", "물어보고 배려하기"],
  ]),
  group("life_priorities", "생활에서 중요한 것", [
    ["family", "가족"],
    ["friends", "친구"],
    ["pets", "반려동물"],
    ["partner_time", "연인과의 시간"],
    ["career", "일과 커리어"],
    ["financial_comfort", "경제적 여유"],
    ["future_savings", "저축과 미래 준비"],
    ["physical_health", "몸 건강"],
    ["emotional_health", "마음 건강"],
    ["enough_sleep", "충분한 잠"],
    ["exercise_habit", "운동 습관"],
    ["good_food", "맛있는 식사"],
    ["learning", "배움과 공부"],
    ["creativity", "창작과 표현"],
    ["hobbies", "취미 생활"],
    ["travel_experience", "여행과 경험"],
    ["stable_routine", "안정된 일상"],
    ["free_time", "자유로운 시간"],
    ["personal_space", "나만의 공간"],
    ["life_balance", "균형 있는 생활"],
    ["new_challenges", "새로운 도전"],
    ["community", "지역·이웃 관계"],
    ["volunteering", "봉사와 나눔"],
    ["nature_environment", "자연과 환경"],
  ]),
]);

export const profilePreferenceKeys = Object.freeze(Object.fromEntries(
  profilePreferenceGroups.map(group=>[group.key,Object.freeze(group.options.map(option=>option.key))]),
));

const intentKeys = new Set(relationshipIntents.map(intent=>intent.key));
const allowedKeys = Object.fromEntries(profilePreferenceGroups.map(group=>[group.key,new Set(profilePreferenceKeys[group.key])]));

export function emptyProfilePreferences() {
  return {
    relationship_intents:[],
    meeting_styles:[], relationship_values:[], affection_styles:[], life_priorities:[],
    custom:{meeting_styles:[], relationship_values:[], affection_styles:[], life_priorities:[]},
  };
}

function record(value) {
  return value!==null && typeof value==="object" && !Array.isArray(value) ? value : {};
}

const own = (object,key) => Object.hasOwn(object,key) ? object[key] : undefined;

function knownValues(value, allowed) {
  return Array.isArray(value) ? [...new Set(value.filter(item=>typeof item==="string"&&allowed.has(item)))] : [];
}

function customValues(value, limit) {
  const result=[], seen=new Set();
  if(!Array.isArray(value))return result;
  for(const item of value){
    if(result.length>=limit)break;
    if(typeof item!=="string")continue;
    const label=item.trim();
    if(!label||maskedTextLength(label)>MAX_PROFILE_CUSTOM_LENGTH||seen.has(label))continue;
    seen.add(label);result.push(label);
  }
  return result;
}

// A complete, defensive value for rendering/editing. This is not a PATCH merger:
// callers must preserve an omitted preferences field when saving other profile data.
export function normalizeProfilePreferences(value) {
  const source=record(value), custom=record(own(source,"custom")), result=emptyProfilePreferences();
  result.relationship_intents=knownValues(own(source,"relationship_intents"),intentKeys);
  for(const group of profilePreferenceGroups){
    const selected=knownValues(own(source,group.key),allowedKeys[group.key]).slice(0,MAX_PROFILE_GROUP_SELECTIONS);
    result[group.key]=selected;
    result.custom[group.key]=customValues(own(custom,group.key),MAX_PROFILE_GROUP_SELECTIONS-selected.length);
  }
  return result;
}
