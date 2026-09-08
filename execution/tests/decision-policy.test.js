'use strict';
const test=require('node:test');
const A=require('node:assert/strict');
const P=require('../decision-policy');
const G=require('../../research-governance');

test('direction and venue are independent: SHORT uses Futures, LONG explores Spot and Futures',()=>{
  let l=P.initialLearning();
  let short=P.select(l,{dir:'SHORT'},{leverageMode:'AUTO'}).profile;
  A.equal(short.direction,'SHORT'); A.equal(short.venue,'FUTURES');
  let long1=P.select(l,{dir:'LONG'},{leverageMode:'AUTO'}).profile;
  A.equal(long1.direction,'LONG'); A.equal(long1.venue,'SPOT');
  l.venue.LONG.SPOT.n=1;
  let long2=P.select(l,{dir:'LONG'},{leverageMode:'AUTO'}).profile;
  A.equal(long2.venue,'FUTURES');
});

test('MANUAL leverage uses the exact user value without a strategy ceiling',()=>{
  const p=P.select(P.initialLearning(),{dir:'SHORT'},{leverageMode:'MANUAL',manualLeverage:137.25}).profile;
  A.equal(p.venue,'FUTURES'); A.equal(p.leverageMode,'MANUAL'); A.equal(p.leverage,137.25);
});

test('AUTO leverage has no strategy max and can expand beyond prior preference',()=>{
  let l=P.initialLearning(); l.leverage.LONG.preferred=1000;
  const candidates=P.candidateLeverages(l.leverage.LONG.preferred);
  A(candidates.includes(2000));
  const p=P.select({...l,venue:{...l.venue,LONG:{SPOT:{n:10,sumNetPct:0,wins:5,losses:5,liquidations:0},FUTURES:{n:10,sumNetPct:100,wins:8,losses:2,liquidations:0}}}},{dir:'LONG'},{leverageMode:'AUTO'}).profile;
  A.equal(p.venue,'FUTURES'); A(p.leverage>=1);
});

test('losses and liquidation become leverage learning evidence',()=>{
  let l=P.initialLearning(); l.leverage.SHORT.preferred=40;
  const profile={venue:'FUTURES',direction:'SHORT',leverage:40};
  let after=P.update(l,profile,{executionValid:true,netPnlPct:-35,liquidated:true},1000);
  A(after.leverage.SHORT.preferred<40);
  A.equal(after.leverage.SHORT.arms['40'].liquidations,1);
  const low=after.leverage.SHORT.preferred;
  after=P.update(after,{...profile,leverage:low},{executionValid:true,netPnlPct:12,liquidated:false},2000);
  A(after.leverage.SHORT.preferred>low);
});

test('research governance accepts valid Futures economics and rejects forged arithmetic',()=>{
  const shadow={finalDecision:'ENTER',executionProfile:{venue:'FUTURES',direction:'SHORT',leverage:5},outcome:{executionValid:true,executionProfile:{venue:'FUTURES',direction:'SHORT',leverage:5},grossMovePct:10,totalFeesPct:.5,executionCostPct:.25,fundingPct:.1,netPnlPct:9.35,feePolicy:'BINANCE_USDM_CONFIGURABLE',winLabel:1,liquidated:false}};
  A.equal(G.validOutcome(shadow),true);
  A.equal(G.validOutcome({...shadow,outcome:{...shadow.outcome,netPnlPct:99}}),false);
});
