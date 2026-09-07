'use strict';
const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path');
const V10=require('./v10-research-engine.js');
const Foundation=require('./v10-research-foundation.js');
const now=Date.parse('2026-09-07T10:00:00+03:00');
let s=V10.initialState(now);
assert.strictEqual(V10.CAPABILITIES.length,14);
assert.strictEqual(V10.publicState(s,now).authority,'NO_LIVE_AUTHORITY');
assert.strictEqual(V10.publicState(s,now).principles.noRiskHypothesisGeneration,true);
let w={cycleId:'V10-CASE-1',symbol:'TESTUSDT',tf:'4h',dir:'LONG',entryAt:now,memoryEligible:true,quality:'VALID',quoteVol24h:25e6,radarScore:81,relativeVolume:2.2,alignedPressure:66,flow:{relative:2.2,pressure:66,persistence:74,impact:.45,speed:2.1,net:180000,measuredAt:now},profitEntryAdvice:{ready:true,decision:'ENTER'}};
let sh={finalDecision:'ENTER',modelDecision:'ENTER',decidedAt:now,fillPrice:100};
let market={direction:'UP',upPct:62,downPct:28,medianChangePct:1.1,fearGreed:{value:61},marketAI:{regime:'UP',forecast60:{direction:'UP',confidence:.66}}};
let r=V10.registerOpportunity(s,sh,w,market,now);assert(r.created);s=r.state;assert.strictEqual(Object.keys(s.studies).length,1);assert.strictEqual(s.studies[w.cycleId].horizons.length,5);assert.deepStrictEqual(Object.keys(s.studies[w.cycleId].policyDecisions).sort(),[...V10.POLICY_IDS].sort());
let book={lastUpdateId:12,bids:[[99.95,20],[99.9,50]],asks:[[100.05,20],[100.1,50]]};s=V10.attachDepthSnapshot(s,w.symbol,book,now+1000);let ex=V10.simulateExecution(s,w.symbol,'BUY',1000,100,now+1000);assert.strictEqual(ex.source,'BINANCE_DEPTH_SNAPSHOT_PLUS_LATENCY_SCENARIO');assert(ex.complete);assert(ex.slippagePct>0);assert(ex.latencyRiskPct>0&&ex.totalCostPct>ex.slippagePct);
let fm=V10.frameMinutes('4h')*60000,ratios=[.25,.5,1,2,4],prices=[100.4,100.8,101.3,102.4,103.1];
for(let i=0;i<ratios.length;i++){
 let t=now+fm*ratios[i];w.flow={...w.flow,net:180000+50000*(i+1),measuredAt:t,relative:2.2+.1*i,pressure:66-i};
 let ticker=new Map([[w.symbol,{lastPrice:String(prices[i]),bidPrice:String(prices[i]-.02),askPrice:String(prices[i]+.02),quoteVolume:'25000000'}]]);
 let adv=V10.advance(s,ticker,{[w.symbol]:w},market,t);s=adv.state;
}
let pub=V10.publicState(s,now+4*fm);assert.strictEqual(pub.summary.opportunities,1);assert.strictEqual(pub.summary.labelsMatured,5);assert.strictEqual(pub.summary.completed,1);assert(pub.summary.replayTrainingUpdates>=1);assert.strictEqual(pub.summary.independentEvidence,1);assert(pub.teacher.samples>=2);assert(pub.representation.samples>=1);assert(pub.representation.selfSupervisedSamples>=1);assert(pub.pathCells>=1);assert(pub.execution.snapshots>=1);assert(pub.policies.V10_COMBINED);assert(pub.policies.ECONOMIC_CONTINUATION);assert(pub.policies.LIQUIDITY_AWARE);assert(pub.capabilities.every(x=>x.status==='SHADOW'||x.status==='PROMISING'||x.status==='PROVEN'));
let cv=V10.continuationValue(s,{id:'none',tf:'4h',contextKey:'x',regimeAtEntry:'TREND_UP',features:Array(9).fill(0),symbol:'TESTUSDT',quoteVol24h:25e6,flowRelative:2.2},w,0,now+4*fm);assert(cv.actionValues&&['EXIT','HOLD','WAIT','PARTIAL_EXIT'].every(k=>Object.hasOwn(cv.actionValues,k)));
let h=V10.hierarchicalEstimate(s,{tf:'4h',symbol:'TESTUSDT',quoteVol24h:25e6,flow:{relative:2.2}},s.completed[0].regimeAtEntry,'2F');assert(h.effectiveN>0);
assert(Number.isFinite(V10.informationPriority(s,w,market)));
// Recovery A/B is part of v10 from day one.
let tmp=fs.mkdtempSync(path.join(os.tmpdir(),'alpha-v10-'));let f=Foundation.createFoundation({dataDir:tmp,V10,appVersion:'10.0.0',cohortId:'C10'});let b=f.load();b.researchCohort={id:'C10'};b.counters.opportunities=7;f.persist(b,'ONE');b.counters.opportunities=8;f.persist(b,'TWO');assert(f.recovery.validSlots().length===2);fs.writeFileSync(f.brainFile,'{broken');let f2=Foundation.createFoundation({dataDir:tmp,V10,appVersion:'10.0.0',cohortId:'C10'});let recovered=f2.load();assert.strictEqual(recovered.counters.opportunities,8);assert(f2.recovery.status().lastRecovery);fs.rmSync(tmp,{recursive:true,force:true});
console.log('PASS: ALPHA PROOF v10 wires all 14 research capabilities prospectively, keeps them shadow-governed, compares policies on common futures, separates replay updates from independent evidence, simulates depth-aware execution, and recovers its own research brain with verified A/B');
