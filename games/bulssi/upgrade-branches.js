/* Five roots, forty nodes per root. Small improvements accumulate along
   successive forks; old upgrade IDs retain their saved levels. */
(() => {
  'use strict';
  const stages=['잿불','원시별','주계열성','적색거성','블랙홀'];
  const add=(key,amount)=>(stats,level)=>{stats[key]+=amount*level;};
  const multiply=(key,amount)=>(stats,level)=>{stats[key]*=1+amount*level;};
  const cool=(stats,level)=>{stats.decay*=Math.pow(.998,level);};
  function recipes(stage){return [
    [
      ['열 저장','열 최대치 +0.15',add('maxHeat',.15)],
      ['냉각 억제','식는 속도 -0.2%',cool],
      ['결정 감응','시간 결정에 주는 피해 +3%',multiply('iceDamage',.03)],
      ['잔열 저장','열 최대치 +0.2',add('maxHeat',.2)],
      ['심지 안정','식는 속도 -0.2%',cool],
      ['열 밀도','열 최대치 +0.15',add('maxHeat',.15)]
    ],
    [
      ['불꽃 단련','모든 피해 +2.5%',multiply('dmg',.025)],
      ['정밀 점화','치명타 확률 +0.3%p',add('crit',.003)],
      ['불꽃 응축','모든 피해 +2.5%',multiply('dmg',.025)],
      ['핵 연마','치명타 피해 배율 +0.04',add('critPower',.04)],
      ['혜성 추격','혜성에 주는 피해 +4%',multiply('cometDamage',.04)],
      ['냉기 파쇄','시간 결정에 주는 피해 +3%',multiply('iceDamage',.03)]
    ],
    [
      ['불꽃 가장자리','태우는 범위 +0.4',add('radius',.4)],
      ['인력의 싹','끌어당기는 힘 +0.03',add('pull',.03)],
      ['인력 확장','끌어당기는 거리 +3%',multiply('pullReach',.03)],
      ['외곽 연소','불꽃 가장자리의 피해 +3%',multiply('edgeDamage',.03)],
      ['혜성 붙잡기','불꽃 안에서 혜성 속도 -1%p',add('cometSlow',.01)],
      stage?['파동 확장','가스 폭발 범위 +3%',multiply('blastRadius',.03)]:['불꽃 너비','태우는 범위 +0.4',add('radius',.4)]
    ],
    [
      ['빛 모으기','빛 획득 +3%',multiply('light',.03)],
      stage?['금속 모으기','금속 획득 +3%',multiply('metal',.03)]:['돌빛 찾기','바위 운석의 빛 +4%',multiply('rockLight',.04)],
      ['운석 채집','바위 운석의 빛 +4%',multiply('rockLight',.04)],
      ['꼬리빛 채집','혜성의 빛 +4%',multiply('cometLight',.04)],
      ['천체 유인','천체 생성 +2%',multiply('spawn',.02)],
      stage===4?['질량 응축','질량 획득 +3%',multiply('mass',.03)]:['결정 채집','시간 결정의 빛 +5%',multiply('iceLight',.05)]
    ],
    [
      ['바위 침투','바위 운석에 주는 피해 +3%',multiply('rockDamage',.03)],
      ['결정 융해','시간 결정에 주는 피해 +3%',multiply('iceDamage',.03)],
      stage?['외피 틈새','단단한 외피 관통 +1%p',add('pierce',.01)]:['혜성 감각','혜성에 주는 피해 +3%',multiply('cometDamage',.03)],
      stage?['연쇄 연결','가스 연쇄 피해 +3%',multiply('chain',.03)]:['불꽃 감각','치명타 확률 +0.2%p',add('crit',.002)],
      stage>=2?['위성 조율','보조 위성의 피해 배율 +0.015',add('satDamage',.015)]:['잔광 채집','빛 획득 +2%',multiply('light',.02)],
      stage>=3?['잔해 흡수','즉시 흡수 체력 기준 +0.3%p',add('execute',.003)]:['불꽃 공명','모든 피해 +2%',multiply('dmg',.02)]
    ]
  ];}
  function extend(base){
    const result=[...base];
    for(let stage=0;stage<5;stage++){
      const groups=recipes(stage);
      for(let branch=0;branch<5;branch++)groups[branch].forEach(([name,description,effect],index)=>{
        const metal=stage>0&&stage<4&&branch===4&&index%2===1;
        const currency=stage===4?'mass':metal?'metal':'light';
        const price=(metal?[0,6,24,90,0]:[4,70,1200,25000,4])[stage];
        result.push({id:`branch_${stage}_${branch}_${index}`,r:stage,b:branch,
          n:`${stages[stage]} · ${name}`,d:description,mx:3,
          c:Math.ceil(price*(1+index*.12)),m:1.65,k:currency,f:effect});
      });
    }
    return result.sort((a,b)=>a.r-b.r||a.b-b.b);
  }
  function tree(upgrades){
    const parents={},positions={},lanes=[-26,-9,9,26],groups=[];
    for(let branch=0;branch<5;branch++){
      groups[branch]=[];
      for(let stage=0;stage<5;stage++){
        const nodes=upgrades.filter(item=>item.b===branch&&item.r===stage);
        if(nodes.length!==8)throw Error('Each growth tier must have eight nodes per branch');
        groups[branch][stage]=nodes;
        nodes.forEach((node,index)=>{
          let parent,depth,offset;
          if(stage===0){
            parent=[null,0,0,0,1,1,2,3][index];
            parent=parent===null?null:nodes[parent].id;
            depth=index===0?1:index<4?2:3;
            offset=index===0?0:index<4?[-20,0,20][index-1]:lanes[index-4];
          }else{
            parent=index<4?groups[branch][stage-1][index+4].id:nodes[index<6?0:3].id;
            depth=stage*2+(index<4?2:3);offset=lanes[index%4];
          }
          const angle=-Math.PI/2+branch*Math.PI*2/5+offset*Math.PI/180;
          parents[node.id]=parent;
          positions[node.id]={x:Math.cos(angle)*depth,y:Math.sin(angle)*depth,a:angle,depth,bend:offset/90};
        });
      }
    }
    return {parents,positions};
  }
  window.OjjudaSaetbyeolBranches=Object.freeze({extend,tree});
})();
