// Product scope stays visible even when calculation records are hidden.
export const READING_SCOPES=Object.freeze({
  saju:Object.freeze({title:'풀이의 범위',paragraphs:Object.freeze([
    '확인된 출생 정보로 성향과 관계를 읽고, 선택한 시기의 주제를 생활에 연결해 드려요.',
    '사주 전체의 강약이나 나에게 이로운 기운을 정밀하게 판정하는 내용은 포함하지 않아요.',
    '같은 특징에는 공통 설명을 사용해요. 실제 사건이 일어날지, 언제 일어날지를 정하는 내용은 아니에요.',
  ])}),
  compatibility:Object.freeze({title:'궁합 풀이의 범위',paragraphs:Object.freeze([
    '두 사람의 성향과 확인된 글자 사이의 닮은 점·다른 점을 비교해요.',
    '개인의 기운이 강한지 약한지, 서로에게 어떤 기운이 이로운지를 정밀하게 판정하거나 결혼·이별의 시기를 정하는 내용은 포함하지 않아요.',
    '같은 특징에는 공통 설명을 사용해요. 점수는 서로 잘 지낼 확률이나 관계의 결과를 뜻하지 않아요.',
  ])}),
});

export function readingScopeText(scope) {
  return scope?['',scope.title,...scope.paragraphs]:[];
}
