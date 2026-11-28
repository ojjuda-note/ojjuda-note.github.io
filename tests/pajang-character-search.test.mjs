import assert from 'node:assert/strict';
import test from 'node:test';
import wardrobe from '../features/pajang/src/app/profile-character-wardrobe.json' with {type:'json'};
import {characterSearchIndex,characterSearchTerms,matchesCharacter} from '../features/pajang/src/app/profile-character-search.mjs';

test('every selectable outfit has searchable visual labels, with the disguise kept private',()=>{
  assert.deepEqual(Object.keys(wardrobe).map(Number),Array.from({length:207},(_,i)=>i+1).filter(id=>id!==201));
  for(const tags of Object.values(wardrobe))assert.ok(tags.split(' ').length>=4);
});

test('Korean mood, colour and clothing aliases can be combined in any order',()=>{
  const match=(id,query)=>matchesCharacter(characterSearchIndex({id,name:'',group:''}),characterSearchTerms(query));
  for(const [id,query] of [[4,'차분한 분위기 보라색 롱 스커트'],[4,'긴 치마 포근한'],[15,'시크한 블랙 자켓'],
    [18,'청순한 원피스'],[26,'화사한 블라우스'],[27,'캐주얼한 미니 스커트'],[45,'단정한 유니폼'],
    [83,'우아한 드레스'],[102,'바지 초록색 차분한'],[138,'핑크 정장 댄디한'],[198,'몽환적인 느낌'],
    [13,'수줍은 분위기'],[4,'감성적인 롱치마'],[115,'장난기 있는 힙한'],[109,'청량한 반바지'],[204,'시크 미니스커트'],[205,'검은색 재킷 모던한'],
    [206,'네이비 가디건 아이보리 미니 원피스'],[207,'회색 슬랙스 댄디한 코트']])assert.ok(match(id,query),query);
  assert.equal(matchesCharacter(characterSearchIndex({id:198,name:'몽환의 일루셔니스트',group:'드레스·판타지'}),characterSearchTerms('드레스')),false);
  for(const query of ['노란 롱스커트','흰색 블라우스','긴 치마 시크한','의미없는단어'])
    assert.equal(match(204,query),false,query);
});
