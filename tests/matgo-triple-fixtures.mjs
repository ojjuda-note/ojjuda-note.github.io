export const tripleScenarios = [
  {id:'self-hand',event:'ppukget',owner:'self',hand:[3,16],floor:[[0,1,2],[8]],deck:[12]},
  {id:'other-hand',event:'ppukget',owner:'other',hand:[3,16],floor:[[0,1,2],[8]],deck:[12]},
  {id:'self-flip',event:'ppukget',owner:'self',hand:[4,16],floor:[[0,1,2],[8]],deck:[3]},
  {id:'other-flip',event:'ppukget',owner:'other',hand:[4,16],floor:[[0,1,2],[8]],deck:[3]},
  {id:'jjok',event:'jjok',hand:[0,16],floor:[[8]],deck:[1]},
  {id:'ttadak',event:'ttadak',hand:[2,16],floor:[[0],[1],[8]],deck:[3],choose:true},
  {id:'sweep',event:'sweep',hand:[1,16],floor:[[0],[4]],deck:[5,12]},
  {id:'bomb',event:'bomb',hand:[1,2,3,16],floor:[[0],[8]],deck:[12],bomb:[2,3]}
];

export function setupTripleScenario(g,CARDS,scenario,p=0){
  g.deal();
  const pool=new Map(CARDS.map(c=>[c.id,{...c}]));
  const take=id=>{const c=pool.get(id);if(!c)throw Error('duplicate fixture card');pool.delete(id);return c;};
  g.hand=[[],[]];g.hand[p]=scenario.hand.map(take);g.hand[1-p]=[44].map(take);
  g.floor=scenario.floor.map(ids=>ids.map(take));
  if(scenario.owner){g.floor[0].ppuk=true;g.floor[0].ppukOwner=scenario.owner==='self'?p:1-p;}
  // Other captured cards are not pi: the triple bonus is the only payable card.
  g.caps=[[],[]];g.caps[1-p]=[49,20,32].map(take);
  g.deck=scenario.deck.map(take).concat([...pool.values()]);
  g.turn=p;g.normalPlays=[1,1];g.endTurn=async()=>{};
  return {card:g.hand[p][0],bomb:scenario.bomb?.map(id=>g.hand[p].find(c=>c.id===id))};
}
