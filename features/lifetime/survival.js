"use strict";

// Constant force of mortality between consecutive published survivor counts.
// The last open-ended band uses its published mean remaining lifetime.
function hazardAt(curve,age) {
  const index=curve.findIndex(row=>row[0]>age);
  if(index===-1) return 1/curve[curve.length-1][2];
  const a=curve[index-1],b=curve[index];
  return Math.log(a[1]/b[1])/(b[0]-a[0]);
}

function makeSchedule(age,sex,region,horizon) {
  const national=population.national[sex];
  const until=Math.max(0,100-age,horizon);
  const cuts=new Set([0,until]);
  for(let a=Math.floor(age)+1;a<age+until;a++) cuts.add(a-age);
  cuts.add(horizon);
  const sorted=[...cuts].sort((a,b)=>a-b);
  return sorted.map((t,i)=>{
    const a=age+t, duration=i+1<sorted.length?sorted[i+1]-t:Infinity;
    const hazard=hazardAt(national,a);
    let regional=1;
    if(region!=="전국"){
      const peer=hazardAt(population.regions["전국"][sex],a);
      if(peer>0) regional=hazardAt(population.regions[region][sex],a)/peer;
    }
    return {t,duration,hazard,regional};
  });
}

function survivalArea(schedule,{geography=false,ratio=1,horizon=0}={}) {
  let survival=1,area=0;
  for(const band of schedule) {
    const rate=band.hazard*(geography?band.regional:1)*(band.t<horizon?ratio:1);
    if(!Number.isFinite(band.duration)) return area+survival/rate;
    const exposure=band.duration*rate;
    area+=survival*(rate>0?-Math.expm1(-exposure)/rate:band.duration);
    survival*=Math.exp(-exposure);
  }
  return area;
}

// KIHASA research report 2024-44, appendix 1: log odds for death within one year,
// adjusted for age, sex and insurance type, relative to insurance-premium decile 10.
function incomeRisk(curve,age,quintile) {
  const logOdds=[.587,.472,.353,.354,.320,.244,.141,.104,-.005,0];
  const last=curve[curve.length-1];
  const baseline=age>=last[0] ? -Math.expm1(-1/last[2]) : 1-survivorCount(curve,age+1)/survivorCount(curve,age);
  const risk=(intercept,coef)=>1/(1+Math.exp(-intercept-coef));
  let lo=Math.log(baseline/(1-baseline))-.587,hi=lo+.592;
  for(let i=0;i<36;i++){
    const mid=(lo+hi)/2;
    const mean=logOdds.reduce((sum,coef)=>sum+risk(mid,coef),0)/10;
    if(mean<baseline) lo=mid;else hi=mid;
  }
  const b=(lo+hi)/2, index=2*Number(quintile);
  return {base:baseline,selected:(risk(b,logOdds[index])+risk(b,logOdds[index+1]))/2,horizon:1};
}

// Convert each applicable source to a change from the same national life table.
function separateEffects(age,sex,region,rows) {
  const base=tableValue(population.national[sex],age,2);
  function areaShift(options) {
    const schedule=makeSchedule(age,sex,options.geography?region:"전국",options.horizon??0);
    return base*(survivalArea(schedule,options)/survivalArea(schedule)-1);
  }
  const effects={};
  if(region!=="전국") effects.region=areaShift({geography:true});
  for(const {key,result} of rows) {
    const risk=result.risk;
    if(risk) {
      const ratio=Math.log1p(-risk.selected)/Math.log1p(-risk.base);
      effects[key]=areaShift({ratio,horizon:risk.horizon});
    } else {
      effects[key]=result.years-base;
    }
  }
  return {base,effects};
}

function combinedEstimate(age,fields) {
  const f=cleanConditions(fields),region=f.region||"전국",sex=f.basis||"all";
  const national=tableValue(population.national[sex],age,2);
  const strata=sex==="all"?["men","women"]:[sex];
  const paths=strata.map(s=>{
    const evidence=conditionEvidence(age,s,f);
    return {...evidence,...separateEffects(age,s,region,evidence.rows)};
  });
  let effects=paths[0].effects;
  if(paths.length===2){
    const [m,w]=paths;
    const share=w.base===m.base?.5:Math.max(0,Math.min(1,(w.base-national)/(w.base-m.base)));
    const scale=national/(share*m.base+(1-share)*w.base);
    effects={};
    for(const key of new Set([...Object.keys(m.effects),...Object.keys(w.effects)])){
      effects[key]=scale*(share*(m.effects[key]??0)+(1-share)*(w.effects[key]??0));
    }
  }
  const years=national+Object.values(effects).reduce((sum,shift)=>sum+shift,0);
  const rows=[...new Map(paths.flatMap(p=>p.rows).map(row=>[row.key,row])).values()];
  const skipped=[...new Map(paths.flatMap(p=>p.skipped).map(row=>[row.join(" "),row])).values()];
  const covered=[...new Set(paths.flatMap(p=>p.covered))];
  return {effects,years,rows,skipped,covered,region,sex,national};
}
