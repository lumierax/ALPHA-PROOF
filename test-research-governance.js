'use strict';
const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path');
const G=require('./research-governance'),AI=require('./lab-ai'),C=require('./learning-forge'),A=require('./adaptive-manager');
const t=G.ORIGINAL_CUTOFF+100000,cohort={id:'test-cohort',policy:G.POLICY,startedAt:t};
let s={...AI.initialState(t),researchCohort:cohort};
const w={cycleId:'NEW',symbol:'TESTUSDT',dir:'LONG',tf:'1h',entryAt:t+1,entryPrice:100,targetPrice:103,stopPrice:99,flow:{relative:3}};
let d=AI.decide(s,w,{},t+2,100);d.shadow.researchCohort=cohort;
const closed=AI.resolveShadow(d.shadow,w,'TP',103,t+100).shadow;
assert(AI.trainResolved(d.state,closed,w,t+101).updated);
for(const [sh,ww] of [[{...closed,researchCohort:{id:'old'}},w],[closed,{...w,entryAt:t-1}],[{...closed,decidedAt:t-1},w],[{...closed,outcome:{...closed.outcome,integrityReplay:true}},w],[closed,{...w,memoryEligible:false}],[closed,{...w,quality:'REJECTED'}]]){assert(!AI.trainResolved(s,sh,ww,t+101).updated);assert(!C.observeResolved({...C.initialState(t),researchCohort:cohort},sh,ww,t+101).updated);}
let am={...A.initialState(t),researchCohort:cohort},free={...d.shadow,modelDecision:'ENTER',status:'REJECTED',finalDecision:'IGNORE'};
assert(A.open(am,free,w,t+3).positions.NEW,'free model still independent from baseline TP/SL');
assert(!A.open({...A.initialState(t),researchCohort:cohort},{...free,researchCohort:{id:'old'}},w,t+3).positions.NEW);
assert(!AI.trainResolved(s,{...closed,outcome:{...closed.outcome,winLabel:0}},w,t+101).updated,'mislabeled net outcomes must not teach');
// A position opened before a hypothesis but resolved afterwards cannot prove it.
let c=C.initialState(t);c.observedCases=100;c.candidates=[{id:'H',kind:'EDGE',context:'GLOBAL',status:'TESTING',createdAt:t+50,bornAtSample:60,rule:{terms:[{feature:'score',op:'GE',threshold:0}]},eval:{}}];
let r=C.observeResolved(c,closed,w,t+101);assert.equal(r.state.candidates[0].eval.allN,0);
let fresh={...closed,decidedAt:t+60};r=C.observeResolved(c,fresh,w,t+101);assert.equal(r.state.candidates[0].eval.allN,1);
// Good classification with rare large losses does not establish economic edge.
let bad=C.initialState(1);
for(let i=0;i<1200;i++){const match=i%2===0,win=match?(i%20!==0):(i%20===1),net=match?(win?.1:-10):(win?10:-.1);let shadow={status:'CLOSED',caseId:String(i),decidedAt:1000+i*2,baseConfidence:match?.55:.65,confidence:match?.8:.2,finalDecision:match?'ENTER':'SKIP',features:{score:match?.8:-.8},outcome:{winLabel:+win,netPnlPct:net}};bad=C.observeResolved(bad,shadow,{cycleId:String(i),dir:'LONG',tf:'1h'},1001+i*2).state;}
assert.equal(bad.validated.length,0,'accuracy gains with negative economic value cannot be PROVEN');
// Missing/corrupt current brains fail closed, never silently reset the cohort.
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cohort-'));const f=G.createCohort(dir,t);f.ready();assert.throws(()=>G.createCohort(dir,t+1),/Missing cohort brain/);fs.rmSync(dir,{recursive:true,force:true});
console.log('PASS: clean cohort rejects old/invalid decisions, blocks hindsight proof and economically harmful high-accuracy rules');

// Profit hypotheses may fail: record that result without inventing a proven risk rule.
let failed=C.initialState(1);failed.observedCases=100;failed.candidates=[{id:'PROFIT-ATTEMPT',kind:'EDGE',context:'GLOBAL',status:'TESTING',createdAt:10,bornAtSample:60,rule:{terms:[{feature:'score',op:'GE',threshold:0}]},eval:{}}];
for(let i=0;i<60;i++){let sh={status:'CLOSED',caseId:'LOSS-'+i,decidedAt:20+i*2,baseConfidence:.55,confidence:.7,finalDecision:'ENTER',features:{score:.8},outcome:{winLabel:0,netPnlPct:-1}};failed=C.observeResolved(failed,sh,{cycleId:sh.caseId,dir:'LONG',tf:'1h'},21+i*2).state;}
const failure=C.publicState(failed).failedProfitHypotheses.find(x=>x.id==='PROFIT-ATTEMPT');assert(failure);assert.equal(failure.failureEvidence.conclusion,'OBSERVED_NET_LOSS');assert.equal(failure.failureEvidence.inverseRuleProven,false);assert.equal(failure.kind,'EDGE');
console.log('PASS: a proposed profitable rule can fail and retain measured loss evidence without becoming an assumed RISK rule');
