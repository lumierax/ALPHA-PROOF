'use strict';
const assert=require('assert');
const C=require('./learning-forge.js'),AI=require('./lab-ai.js');
function proven(id='EDGE-1'){return {id,kind:'EDGE',context:'GLOBAL',status:'PROVEN',createdAt:10,bornAtSample:0,rule:{terms:[{feature:'score',op:'GE',threshold:0}]},strength:.03,eval:{matchN:200,allN:200,allWins:150,matchWins:160,changedN:100,diffSum:20,diffSqSum:40,blocks:[{n:25,wins:18,matchN:20,matchWins:17},{n:25,wins:18,matchN:20,matchWins:17},{n:25,wins:18,matchN:20,matchWins:17}]},proof:{economicPolicy:'NET-EDGE-1',netDeltaLcb:.1}}}
let s=C.initialState(1);s.observedCases=500;s.validated=[proven()];s.drift.status='STABLE';
let a=C.mentorAdvice(s,{score:.8},1000,{contexts:['GLOBAL']});assert(a.active&&a.shadowDelta>0&&a.delta===0&&a.phase==='SHADOW_TESTING');
// Trade AI must keep the real decision confidence unchanged while storing the counterfactual Shadow confidence.
let ai=AI.initialState(1),w={cycleId:'D0',symbol:'TESTUSDT',dir:'LONG',tf:'1h',entryAt:1000,entryPrice:100,targetPrice:102,stopPrice:99,flow:{relative:2,pressure:.5,persistence:.5,impact:.2,move:.1,speed:.1,acceleration:.1,score:70,eligible:true,alive:true}};
let d=AI.decide(ai,w,{},1001,100,a);assert(d.created);assert(Math.abs(d.shadow.confidence-d.shadow.baseConfidence)<1e-9,'Shadow testing changed real confidence');assert(d.shadow.shadowMentorConfidence>d.shadow.baseConfidence,'counterfactual Shadow confidence not stored');assert(d.shadow.mentor?.phase==='SHADOW_TESTING');
// 100 future matched outcomes where the higher Shadow probability is consistently better unlock only this EDGE.
for(let i=0;i<C.MENTOR_SHADOW_MIN;i++){
  let ad=C.mentorAdvice(s,{score:.8},2000+i*10,{contexts:['GLOBAL']});
  assert(ad.shadowDelta>0);if(i<C.MENTOR_SHADOW_MIN-1)assert.equal(ad.delta,0);
  let base=.55,sh={status:'CLOSED',caseId:'M'+i,decidedAt:2000+i*10,baseConfidence:base,confidence:base,finalDecision:'SKIP',features:{score:.8},facts:{},mentor:{phase:ad.phase,delta:ad.delta,shadowDelta:ad.shadowDelta,hits:ad.hits},outcome:{winLabel:1,netPnlPct:1}};
  s=C.observeResolved(s,sh,{cycleId:'M'+i,dir:'LONG',tf:'1h'},2001+i*10).state;
}
let pub=C.publicState(s);assert.equal(pub.mentorCalibration.eligibleEdges,1);assert(pub.mentorCalibration.pairedSamples>=C.MENTOR_SHADOW_MIN);let live=C.mentorAdvice(s,{score:.8},4000,{contexts:['GLOBAL']});assert(live.delta>0&&live.phase==='LIVE','EDGE did not unlock after its own future paired calibration proof');
// A newly PROVEN EDGE cannot piggyback on the older EDGE's calibration proof.
s.validated.push(proven('EDGE-NEW'));s=C.normalizeState(s);let partial=C.mentorAdvice(s,{score:.8},4001,{contexts:['GLOBAL']});assert(partial.delta>0&&partial.shadowDelta>=partial.delta);assert(partial.hits.some(h=>h.id==='EDGE-NEW'&&!h.eligible),'new EDGE illegally inherited another EDGE calibration proof');assert(partial.phase==='LIVE_PARTIAL');

// A testing EDGE is evaluated marginally on top of already-LIVE EDGE contributions, never against raw Base alone.
let marginal=C.initialState(1);marginal.observedCases=500;let liveEdge=proven('EDGE-LIVE'),testEdge=proven('EDGE-TEST');liveEdge.mentorTrial={n:100,wins:80,baseBrierSum:25,shadowBrierSum:20,deltaBrierSum:5,deltaBrierSqSum:.25,startedAt:1,lastAt:2,eligible:true,eligibleAt:2};marginal.validated=[liveEdge,testEdge];marginal.drift.status='STABLE';marginal=C.normalizeState(marginal);let ma=C.mentorAdvice(marginal,{score:.8},5000,{contexts:['GLOBAL']});let hLive=ma.hits.find(h=>h.id==='EDGE-LIVE'),hTest=ma.hits.find(h=>h.id==='EDGE-TEST');assert(hLive?.eligible&&hTest&&!hTest.eligible);let ms={status:'CLOSED',caseId:'MARGINAL-1',decidedAt:5000,baseConfidence:.50,confidence:.50+ma.delta,finalDecision:'SKIP',features:{score:.8},facts:{},mentor:{phase:ma.phase,delta:ma.delta,shadowDelta:ma.shadowDelta,hits:ma.hits},outcome:{winLabel:0,netPnlPct:-1}};marginal=C.observeResolved(marginal,ms,{cycleId:'MARGINAL-1',dir:'LONG',tf:'1h'},5001).state;let mt=marginal.validated.find(x=>x.id==='EDGE-TEST').mentorTrial,expectedBase=.50+Number(hLive.shadowDelta),expectedLoss=expectedBase*expectedBase;assert(Math.abs(mt.baseBrierSum-expectedLoss)<1e-9,'testing EDGE was not scored against the already-LIVE Mentor baseline');
// Profit First remains one-way: no RISK Mentor exists or is synthesized.
assert.equal(C.publicState(s).riskProven,0);assert(s.validated.every(x=>x.kind==='EDGE'));
console.log('PASS: per-EDGE Shadow Mentor learns counterfactual calibration prospectively, cannot change live confidence early, and never creates RISK research');
