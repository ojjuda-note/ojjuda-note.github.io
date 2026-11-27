"use strict";

// Constant force of mortality between consecutive published survivor counts.
// The last open-ended band uses its published mean remaining lifetime.
function hazardAt(curve,age) {
  const index=curve.findIndex(row=>row[0]>age);
  if(index===-1) return 1/curve[curve.length-1][2];
  const a=curve[index-1],b=curve[index];
  return Math.log(a[1]/b[1])/(b[0]-a[0]);
}

function makeSchedule(age,sex,region,factors) {
  const national=population.national[sex];
  const until=Math.max(0,100-age,...factors.map(f=>Number.isFinite(f.horizon)?f.horizon:0));
  const cuts=new Set([0,until]);
  for(let a=Math.floor(age)+1;a<age+until;a++) cuts.add(a-age);
  for(const f of factors) if(f.horizon<until) cuts.add(f.horizon);
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

function survivalArea(schedule,{geography=false,factors=[],multiplier=1}={}) {
  let survival=1,area=0;
  for(const band of schedule) {
    let rate=band.hazard*multiplier*(geography?band.regional:1);
    for(const f of factors) if(band.t<f.horizon) rate*=f.ratio;
    if(!Number.isFinite(band.duration)) return area+survival/rate;
    const exposure=band.duration*rate;
    area+=survival*(rate>0?-Math.expm1(-exposure)/rate:band.duration);
    survival*=Math.exp(-exposure);
  }
  return area;
}

// Invert a remaining-life comparison on the same national curve and units.
function factorForYears(schedule,years,baseline,nationalArea) {
  const target=nationalArea*years/baseline;
  let low=0,high=1;
  while(survivalArea(schedule,{multiplier:high})>target) high*=2;
  for(let i=0;i<40;i++){
    const mid=(low+high)/2;
    if(survivalArea(schedule,{multiplier:mid})>target) low=mid;
    else high=mid;
  }
  return (low+high)/2;
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

function combinedPath(age,sex,region,rows) {
  const baseline=tableValue(population.national[sex],age,2);
  const factors=rows.map(({result})=>({ratio:1,horizon:result.risk?.horizon??Infinity}));
  const schedule=makeSchedule(age,sex,region,factors);
  const nationalArea=survivalArea(schedule);
  for(const [i,{result}] of rows.entries()){
    factors[i].ratio=result.risk
      ? Math.log1p(-result.risk.selected)/Math.log1p(-result.risk.base)
      : factorForYears(schedule,result.years,baseline,nationalArea);
  }
  return baseline*survivalArea(schedule,{geography:true,factors})/nationalArea;
}

// Calculate complete trajectories separately for the two sex-specific life tables.
// With sex unspecified, choose the mixture that reproduces the published pooled e(x).
function combinedEstimate(age,fields) {
  const f=cleanConditions(fields),region=f.region||"전국",sex=f.basis||"all";
  const national=tableValue(population.national[sex],age,2);
  const strata=sex==="all"?["men","women"]:[sex];
  const paths=strata.map(s=>{
    const {rows,skipped,covered}=conditionEvidence(age,s,f);
    return {rows,skipped,covered,years:combinedPath(age,s,region,rows),base:tableValue(population.national[s],age,2)};
  });
  let years=paths[0].years;
  if(paths.length===2){
    const [m,w]=paths,share=Math.max(0,Math.min(1,w.base===m.base?.5:(w.base-national)/(w.base-m.base)));
    years=national*(share*m.years+(1-share)*w.years)/(share*m.base+(1-share)*w.base);
  }
  const rows=[...new Map(paths.flatMap(p=>p.rows).map(row=>[row.key,row])).values()];
  const skipped=[...new Map(paths.flatMap(p=>p.skipped).map(row=>[row.join(" "),row])).values()];
  const covered=[...new Set(paths.flatMap(p=>p.covered))];
  return {years,rows,skipped,covered,region,sex,national};
}
