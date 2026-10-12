/* Fifty targets, unlocked ten at a time. Family weights keep rare recovery
   crystals rare even as more crystal variants become available. */
(() => {
  'use strict';
  const families = {
    rock:{label:'운석',detail:'빛을 남기는 바위',sides:9,mark:'craters'},
    ice:{label:'시간 결정',detail:'남은 시간을 조금 회복',ice:1,sides:4,mark:'facets'},
    iron:{label:'금속 운석',detail:'단단한 외피 · 금속 수확',metal:1,armor:.65,sides:6,mark:'plates'},
    gas:{label:'가스',detail:'터지면 주변에 연쇄 피해',gas:1,lobes:3,mark:'cloud'},
    comet:{label:'혜성',detail:'빠르게 지나감 · 많은 빛',fast:1,tail:1,mark:'trail'},
    star:{label:'별',detail:'빛과 질량을 남기는 항성',mass:1,rays:4,mark:'rays'},
    mem:{label:'기억',detail:'이 단계의 기억을 하나 발견',mem:1,mark:'orbit'}
  };
  const define = (id,name,kind,stage,hp,r,light,color,extra={}) => Object.freeze({
    id,name,kind,stage,hp,r,light,color,speed:1,motion:'drift',weight:1,
    ...families[kind],...extra
  });
  const catalog = [
    // 잿불: 10종
    define('rock','잿빛 운석','rock',0,10,9,1,'#8c8496',{weight:3}),
    define('dust','먼지 운석','rock',0,4,6,.6,'#b4a695',{sides:5,speed:1.5,mark:'dust'}),
    define('pumice','구멍 운석','rock',0,8,11,1.2,'#a9a69d',{sides:10,craters:6}),
    define('pebble','조약돌 운석','rock',0,12,7,1.5,'#92acb0',{sides:12,mark:'bands',speed:.8}),
    define('shard','칼날 운석','rock',0,16,10,2,'#b4c0d8',{sides:3,mark:'crack',motion:'zigzag',speed:1.2}),
    define('twin','쌍둥이 운석','rock',0,22,12,3,'#be9e82',{sides:7,mark:'twin',speed:.7}),
    define('ice','얼음 조각','ice',0,6,8,1,'#9fd6f5',{weight:2}),
    define('frost','서리 결정','ice',0,8,10,1.5,'#b3eaf0',{sides:6,ice:.9,mark:'snow',motion:'wave'}),
    define('comet','푸른 혜성','comet',0,30,8,15,'#8cc8ff',{weight:2}),
    define('mem','기억 조각','mem',0,20,10,0,'#8fc0ff'),
    // 원시별: 10종 추가
    define('basalt','현무암 운석','rock',1,20,11,3,'#645e79',{sides:7,mark:'crack',speed:.6}),
    define('amber','호박빛 운석','rock',1,26,12,4,'#dea55d',{sides:8,mark:'core',motion:'pulse'}),
    define('ice_moon','달얼음 결정','ice',1,9,10,2,'#bdc8ff',{sides:5,ice:.95,mark:'ring'}),
    define('snowflake','눈꽃 결정','ice',1,10,11,2.4,'#e4f7ff',{sides:8,ice:1.1,mark:'snow',speed:.65}),
    define('iron','철 운석','iron',1,40,11,0,'#7d8296',{weight:2}),
    define('copper','구리 운석','iron',1,34,10,1,'#c28668',{metal:1.2,armor:.5,sides:5,mark:'bands'}),
    define('silver','은빛 운석','iron',1,48,12,0,'#c3ccdf',{metal:1.5,armor:.55,sides:8,mark:'spokes',speed:.8}),
    define('gas','분홍 가스','gas',1,14,13,2,'#e59bd0',{weight:2}),
    define('helium','헬륨 구름','gas',1,12,15,2,'#f0ce7c',{gas:.8,lobes:5,motion:'wave'}),
    define('gold_comet','황금 혜성','comet',1,38,9,20,'#ffd577',{tail:2,speed:1.05}),
    // 주계열성: 10종 추가
    define('crystal_rock','수정 운석','rock',2,32,13,5,'#c7a0df',{sides:5,mark:'facets'}),
    define('ice_prism','빙하 프리즘','ice',2,14,12,3,'#87d2e9',{sides:3,ice:1.15,mark:'facets',motion:'zigzag'}),
    define('nickel','니켈 운석','iron',2,50,12,1,'#a7b38c',{metal:1.6,armor:.7,sides:7,mark:'plates'}),
    define('magnet','자석 운석','iron',2,44,13,1,'#bd7f98',{metal:1.8,armor:.6,sides:4,mark:'ring',motion:'orbit'}),
    define('ion','이온 구름','gas',2,20,15,3,'#74d9eb',{gas:1.1,lobes:2,mark:'ring',motion:'pulse'}),
    define('plasma','플라스마 구름','gas',2,28,16,5,'#ff9a72',{gas:1.25,lobes:4,mark:'spokes',motion:'pulse'}),
    define('violet','보랏빛 성운','gas',2,24,17,4,'#a98ee8',{gas:1.2,lobes:5,mark:'orbit',motion:'wave'}),
    define('red_comet','붉은 혜성','comet',2,40,9,22,'#ff787b',{speed:1.2,motion:'wave'}),
    define('twin_comet','쌍꼬리 혜성','comet',2,44,10,25,'#c4a4ff',{tail:2,mark:'twin'}),
    define('spiral_comet','나선 혜성','comet',2,48,10,28,'#89dfc7',{tail:3,motion:'wave',mark:'orbit'}),
    // 적색거성: 10종 추가
    define('volcanic','용암 운석','rock',3,42,14,8,'#d45f51',{sides:6,mark:'lava',motion:'pulse'}),
    define('ice_core','서리핵 결정','ice',3,20,13,4,'#89b7ff',{sides:7,ice:1.2,mark:'core',motion:'orbit'}),
    define('gold','금 운석','iron',3,54,12,4,'#e6ba5f',{metal:2,armor:.5,sides:5,mark:'facets'}),
    define('titanium','티타늄 운석','iron',3,70,14,2,'#8d9faa',{metal:2.4,armor:.75,sides:8,mark:'bands',speed:.6}),
    define('dark_iron','흑철 운석','iron',3,85,16,3,'#746c8e',{metal:3,armor:.8,sides:4,mark:'core',speed:.5}),
    define('solar_wind','태양풍 구름','gas',3,30,19,6,'#ffc28a',{gas:1.35,lobes:4,mark:'bands',motion:'wave',speed:1.5}),
    define('electric','번개 성운','gas',3,36,17,7,'#d9b7ff',{gas:1.45,lobes:3,mark:'crack',motion:'zigzag'}),
    define('green_comet','녹색 혜성','comet',3,54,11,32,'#adf79a',{tail:2,speed:1.25,mark:'core'}),
    define('meteor_shower','유성 무리','comet',3,60,13,38,'#ffcea8',{tail:3,mark:'cluster',speed:.9}),
    define('dark_comet','그림자 혜성','comet',3,70,12,45,'#9287d2',{tail:1,speed:1.4,mark:'ring'}),
    // 블랙홀: 10종 추가
    define('time_crystal','시간 결정','ice',4,26,14,5,'#aae7dd',{sides:8,ice:1.25,mark:'clock',motion:'pulse'}),
    define('cosmic_dust','우주먼지 성운','gas',4,44,20,9,'#b4a1cf',{gas:1.5,lobes:6,mark:'dust',motion:'orbit'}),
    define('star','작은 별','star',4,60,12,5,'#ffe9ad',{weight:2}),
    define('red_dwarf','적색왜성','star',4,48,10,4,'#ff8b86',{mass:.8,rays:5,mark:'core',speed:.7}),
    define('white_dwarf','백색왜성','star',4,86,10,8,'#e7efff',{mass:1.3,armor:.2,rays:6,mark:'ring'}),
    define('blue_star','청색별','star',4,100,14,10,'#80caff',{mass:1.6,rays:7,mark:'spokes'}),
    define('binary_star','쌍성','star',4,125,16,12,'#ffc4d8',{mass:2,rays:4,mark:'twin',motion:'orbit'}),
    define('variable_star','맥동별','star',4,80,14,8,'#ffe18a',{mass:1.5,rays:5,mark:'pulse',motion:'pulse'}),
    define('neutron_star','중성자별','star',4,140,9,15,'#b8abff',{mass:2.5,armor:.5,rays:8,mark:'orbit',speed:.5}),
    define('pulsar','펄서','star',4,170,15,18,'#a3f3ee',{mass:3,rays:6,mark:'beam',motion:'pulse'})
  ];
  const types=Object.freeze(Object.fromEntries(catalog.map(type=>[type.id,type])));
  const pools=[
    {rock:92,ice:4,comet:4},
    {rock:54,ice:4,iron:22,gas:16,comet:4},
    {rock:42,ice:3,iron:25,gas:24,comet:6},
    {rock:36,ice:3,iron:25,gas:28,comet:8},
    {star:30,rock:23,ice:3,iron:18,gas:18,comet:8}
  ];
  const unlocked=pools.map((_,stage)=>Object.fromEntries(Object.keys(families).map(kind=>[
    kind,catalog.filter(type=>type.kind===kind&&type.stage<=stage)
  ])));
  const limits=Object.freeze({firstHeatAt:4,heatSpawnGap:12,heatBonusSeconds:8,maxPickupSeconds:1});
  function weighted(entries,random){
    let value=random()*entries.reduce((sum,[,weight])=>sum+weight,0);
    for(const [id,weight] of entries){value-=weight;if(value<0)return id;}
    return entries.at(-1)[0];
  }
  function pick(stage,cometMultiplier,allowHeat,random=Math.random){
    const entries=Object.entries(pools[stage]).filter(([kind])=>kind!=='ice'||allowHeat)
      .map(([kind,weight])=>[kind,weight*(kind==='comet'?cometMultiplier:1)]);
    const kind=weighted(entries,random);
    return weighted(unlocked[stage][kind].map(type=>[type.id,type.weight]),random);
  }
  function canSpawnHeat(run){
    return run.time>=run.nextHeatAt&&run.bonusSeconds<limits.heatBonusSeconds-1e-9&&
      !run.nodes.some(node=>!node.dead&&types[node.t].ice);
  }
  function recoverHeat(run,stats,type){
    if(!type.ice||run.heat<=0)return 0;
    const seconds=Math.max(0,Math.min(limits.maxPickupSeconds,stats.iceHeat*type.ice,
      limits.heatBonusSeconds-run.bonusSeconds,(stats.maxHeat-run.heat)/stats.decay));
    run.heat+=seconds*stats.decay;
    run.bonusSeconds+=seconds;
    return seconds;
  }
  window.OjjudaSaetbyeolEncounters=Object.freeze({catalog:Object.freeze(catalog),types,families,pools,limits,pick,canSpawnHeat,recoverHeat});
})();
