'use strict';
const assert=require('assert');
const Workforce=require('./cortex-workforce.js');
const LearningForge=require('./learning-forge.js');
let state=LearningForge.initialState(1);
state.observedCases=100;
state.researchCases=[
 {caseId:'W1',symbol:'AAAUSDT',dir:'LONG',tf:'4h',tfGroup:'SWING',win:1,netPnlPct:1.1,contexts:['GLOBAL','DIR_LONG'],features:{score:.7,relative:.6,pressure:.5,persistence:.6,impact:.3,move:.2,speed:.4,acceleration:.6,marketAgreement:.5,pa:.4,ce:.3,ema:.4},temporal:{journeyPoints:3,flowBeforeMove:true,accelerationLeadToMoveMin:8,signalAgeMin:20},decisionLab:{waitVsNowPct:.2,continueVsExitEarlyPct:.3}},
 {caseId:'L1',symbol:'BBBUSDT',dir:'LONG',tf:'4h',tfGroup:'SWING',win:0,netPnlPct:-1.4,contexts:['GLOBAL','DIR_LONG'],features:{score:.68,relative:.59,pressure:.49,persistence:.61,impact:.31,move:.21,speed:.39,acceleration:.59,marketAgreement:.49,pa:.39,ce:.31,ema:.41},temporal:{journeyPoints:3,flowBeforeMove:false,accelerationLeadToMoveMin:-4,signalAgeMin:28},decisionLab:{waitVsNowPct:-.3,continueVsExitEarlyPct:-.2}}
];
state.candidates=[{id:'H1',kind:'EDGE',status:'TESTING',context:'GLOBAL',createdAt:2,bornAtSample:60,rule:{type:'SINGLE',terms:[{feature:'score',op:'GE',threshold:.5}]},eval:{allN:0,allWins:0,matchN:0,matchWins:0,changedN:0,helped:0,hurt:0,diffSum:0,diffSqSum:0,blocks:[],block:{n:0,wins:0,matchN:0,matchWins:0,changedN:0,diffSum:0}},ledger:{frozenAt:2,frozenRule:'score >= 0.5'}}];
let snapshot=JSON.stringify({candidates:state.candidates,validated:state.validated,researchCases:state.researchCases,mentor:state.mentor});
const tools={
 similarityComparison:LearningForge.similarityComparison,
 temporalMicroscope:LearningForge.temporalToolSummary,
 decisionLab:LearningForge.decisionToolSummary,
 variableIsolation:LearningForge.variableIsolationSummary,
 hypothesisLedger:LearningForge.hypothesisLedgerView,
 validityMap:LearningForge.knowledgeValidityMap
};
let out=Workforce.runRouted(Workforce.initialState(),state,tools,1000,'TEST_REVIEW');
assert(out.jobs.length>=3,'workers should be routed on a meaningful research state');
assert.strictEqual(JSON.stringify({candidates:state.candidates,validated:state.validated,researchCases:state.researchCases,mentor:state.mentor}),snapshot,'workers must not mutate CORTEX knowledge/trading state');
let pub=Workforce.publicState(out.workforce);
assert.strictEqual(pub.guardrails.workersMayTrade,false);
assert.strictEqual(pub.guardrails.workersMayChangeTradeAI,false);
assert.strictEqual(pub.guardrails.workersMayChangeConfidence,false);
assert.strictEqual(pub.guardrails.workersMayApproveEdge,false);
assert(pub.workers.falsifier.lastResult.summary.includes('حالة مضادة'),'falsifier should surface counter evidence');
assert(pub.workers.falsifier.lastResult.solution,'falsifier must return a concrete solution path, not objection-only');
assert(pub.workers.falsifier.lastResult.proposal?.action==='FUTURES_SHORT','a LONG counterexample should produce a FUTURES SHORT hypothesis proposal');
assert(pub.recentJobs.length<=Workforce.MAX_JOBS,'job history must stay bounded');
let lf=LearningForge.publicState({...state,researchWorkforce:out.workforce});
assert(lf.researchWorkforce&&lf.researchWorkforce.workers.evidenceHunter,'CORTEX public state must expose workforce');
console.log('PASS: CORTEX keeps thinking while four bounded on-demand workers dig, report counter-evidence and cannot mutate Trade AI/confidence/EDGE');
