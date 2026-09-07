'use strict';
const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path');
const Cortex=require('./learning-forge.js'),Foundation=require('./learning-forge-foundation.js');
function feat(win,phase=0){let hi=win?.82:-.82;return {score:hi,relative:hi*.8,pressure:hi*.72,persistence:hi*.66,impact:hi*.52,move:hi*.46,speed:hi*.40,acceleration:hi*.32,market:phase%3===0?-.3:.3,fearGreed:phase%4===0?-.2:.2,marketForecast:phase%5===0?-.25:.25,marketForecastConfidence:.55,marketTurning:0,marketAgreement:win?.5:-.5,pa:win?.25:-.25,ce:win?.2:-.2,ema:win?.2:-.2,timeframe:.25,dirShort:0,net24h:phase%2?.12:-.08,dayVsHistory:phase%3?.10:-.05,profitBalance24h:win?.2:-.2};}
function resolved(i,win,{cortexCorrect=true,drift=false}={}){let f=feat(win,i);if(drift){for(const k of Object.keys(f))if(typeof f[k]==='number')f[k]=win?.95:-.95}
 // Base deliberately makes the opposite decision in the learnable score extremes:
 // high-score wins start just below ENTER threshold; low-score losses start just above it.
 const baseConfidence=win?.55:.65;
 const finalDecision=cortexCorrect?(win?'ENTER':'SKIP'):(baseConfidence>=.60?'ENTER':'SKIP');
 const confidence=cortexCorrect?(win?.78:.22):baseConfidence;
 const featureAblations=Object.fromEntries(Cortex.featureNames.map(k=>[k,.5]));
 return {decidedAt:i<60?1999+i:i<360?2999+i:199999+i,status:'CLOSED',caseId:`CASE-${i}`,baseConfidence,confidence,finalDecision,features:f,featureAblations,facts:{market:{direction:'UP',relation:i%5===0?'COUNTER':'WITH',marketAI:{regime:i%7===0?'TURNING_UP':'UP'}}},outcome:{winLabel:win?1:0,netPnlPct:win?1:-1}};
}
function w(i){return {cycleId:`CASE-${i}`,symbol:`C${i%40}USDT`,dir:'LONG',tf:i%6===0?'1h':'4h'};}
let s=Cortex.initialState(1000);assert.equal(s.observedCases,0);assert.equal(s.phase,'OBSERVE');
// Strict discovery floor: 59 complete VALID cases cannot create a hypothesis.
for(let i=0;i<Cortex.MIN_DISCOVERY-1;i++)s=Cortex.observeResolved(s,resolved(i,i%2===0),w(i),2000+i).state;
assert.equal(s.hypothesesGenerated,0,'CORTEX must not invent hypotheses before MIN_DISCOVERY');
// Case 60 unlocks discovery; winners/losses have strongly separable features.
let r=Cortex.observeResolved(s,resolved(59,false),w(59),2059);s=r.state;
assert(s.hypothesesGenerated>0,'CORTEX should auto-discover hypotheses');
assert((s.candidates||[]).some(x=>x.kind==='EDGE'),'must generate EDGE hypotheses');
assert((s.candidates||[]).every(x=>x.kind==='EDGE'),'only profit hypotheses may be generated');
const born=Math.min(...s.candidates.map(x=>x.bornAtSample));assert(born>=Cortex.MIN_DISCOVERY);
for(const c of s.candidates)assert.equal(c.eval.allN,0,'discovery data must not be reused as proof');
// Future-only arena: enough prospective cases to prove strong profit EDGE rules.
for(let i=60;i<360;i++){let win=i%2===0;s=Cortex.observeResolved(s,resolved(i,win),w(i),3000+i).state;}
let pub=Cortex.publicState(s);
assert(pub.validatedCount>0,'strong prospective rules should become PROVEN');
assert(pub.edgeProven>0,'at least one EDGE must prove itself on future cases');
assert.equal(pub.riskProven,0,'new research must not generate RISK hypotheses');
for(const c of s.validated){assert(c.eval.allN<=s.observedCases-c.bornAtSample,'no pre-birth case may enter proof');assert(c.eval.allN>=Cortex.MIN_PROSPECTIVE,'PROVEN requires future observation floor');assert(c.eval.blocks.length>=2,'PROVEN requires temporal blocks');assert(c.proof,'PROVEN must carry Statistical Firewall evidence');assert.equal(c.proof.prospectiveN%Cortex.PROOF_GATE_EVERY,0,'proof may occur only at scheduled future gates');assert(c.proof.adjustedLower>=.5,'multiple-testing-adjusted Wilson lower bound must clear proof floor');assert(c.proof.positiveBlocks>=3&&c.proof.positiveBlocks>c.proof.negativeBlocks*2,'proof requires repeated positive temporal blocks');}
assert(pub.statisticalFirewall?.enabled&&pub.statisticalFirewall?.multipleTestingAdjusted,'Statistical Firewall must be visible in public state');assert(Array.isArray(pub.ablation)&&pub.ablation.length===Cortex.featureNames.length,'Feature Tribunal must score frozen feature ablations');assert(pub.ablation.every(x=>x.n===s.observedCases),'every resolved clean case must contribute one prospective ablation score per feature');
assert(pub.arena.changed>0&&pub.arena.helped>pub.arena.hurt,'Arena must compare Base vs CORTEX decisions');
assert(pub.arena.deltaAvgUtility>0,'synthetic learnable world should improve utility');
assert(pub.calibration.base.samples===pub.calibration.mentored.samples&&pub.calibration.base.samples===s.observedCases,'Calibration Mirror must score both confidence streams on same cases');
assert(pub.calibration.deltaBrier>0,'better mentored confidence should improve Brier in synthetic world');
// Mentor uses only PROVEN profit EDGE rules. Each EDGE must pass its own paired future Shadow-Calibration trial before it may raise confidence.
let advice=Cortex.mentorAdvice(s,feat(true,999),99999,{contexts:['GLOBAL','DIR_LONG','TF_SWING','REL_WITH','DIR_LONG__REL_WITH','DIR_LONG__TF_SWING','REGIME_UP']});
assert(advice.active,'PROVEN matching EDGE should be available for Shadow Mentor testing');
assert(advice.shadowDelta>0,'matching EDGE must produce a counterfactual Shadow Mentor delta');
assert.equal(advice.delta,0,'newly PROVEN EDGE must not change live confidence before its own calibration trial');
assert.equal(advice.phase,'SHADOW_TESTING');
assert(advice.hits.every(h=>h.kind==='EDGE'&&!h.eligible),'Mentor must test profit EDGE only and keep unproven calibration effects shadow-only');
// Seed a scientifically paired per-EDGE calibration record: constant positive Brier gain, 100 prospective matches.
let mentorReady=JSON.parse(JSON.stringify(s));for(const c of mentorReady.validated.filter(x=>x.kind==='EDGE'))c.mentorTrial={n:100,wins:80,baseBrierSum:25,shadowBrierSum:20,deltaBrierSum:5,deltaBrierSqSum:.25,startedAt:90000,lastAt:99998,eligible:true,eligibleAt:99998};
let liveAdvice=Cortex.mentorAdvice(mentorReady,feat(true,999),99999,{contexts:['GLOBAL','DIR_LONG','TF_SWING','REL_WITH','DIR_LONG__REL_WITH','DIR_LONG__TF_SWING','REGIME_UP']});
assert(liveAdvice.active&&liveAdvice.delta>0,'matching EDGE may raise confidence only after its own paired Shadow-Calibration proof');
assert(Math.abs(liveAdvice.delta)<=.0800001,'Mentor hard cap must stay ±8%');
let riskAdvice=Cortex.mentorAdvice(s,feat(false,998),100000,{contexts:['GLOBAL','DIR_LONG','TF_SWING','REL_WITH','DIR_LONG__REL_WITH','DIR_LONG__TF_SWING','REGIME_UP']});
assert(!riskAdvice.active,'loss patterns are failure evidence, not Mentor RISK rules');
// Context isolation: a context-specific rule cannot leak when context hints exclude it.
let onlySpecific=JSON.parse(JSON.stringify(mentorReady));onlySpecific.validated=onlySpecific.validated.filter(c=>c.context!=='GLOBAL');let spec=onlySpecific.validated[0];if(spec){let noCtx=Cortex.mentorAdvice(onlySpecific,feat(true,1),100001,{contexts:['UNRELATED']});assert(!noCtx.active,'context-specific rule must not leak into unrelated context')}
// Drift Sentinel quarantine is a safety gate for both live and shadow deltas.
let shift=JSON.parse(JSON.stringify(mentorReady));shift.drift.status='SHIFT';let q=Cortex.mentorAdvice(shift,feat(true,2),100002,{contexts:['GLOBAL','DIR_LONG','TF_SWING','REL_WITH','DIR_LONG__REL_WITH','DIR_LONG__TF_SWING','REGIME_UP']});assert(q.active&&q.quarantined);assert.equal(q.delta,0,'SHIFT must quarantine live Mentor influence');assert.equal(q.shadowDelta,0,'SHIFT must not collect a misleading calibration trial for a delta that would never be applied');
let watch=JSON.parse(JSON.stringify(mentorReady));watch.drift.status='WATCH';let wa=Cortex.mentorAdvice(watch,feat(true,2),100003,{contexts:['GLOBAL','DIR_LONG','TF_SWING','REL_WITH','DIR_LONG__REL_WITH','DIR_LONG__TF_SWING','REGIME_UP']});assert(Math.abs(wa.delta)<=Math.abs(liveAdvice.delta)+1e-9,'WATCH must attenuate, never amplify Mentor');
// Duplicate and unfinished cases cannot teach CORTEX.
let before=s.observedCases,dup=Cortex.observeResolved(s,resolved(359,false),w(359),100010);assert(dup.duplicate&&dup.state.observedCases===before);let open=Cortex.observeResolved(s,{status:'OPEN',features:feat(true,1)},w(999),100011);assert.equal(open.state.observedCases,before);
// Six lightweight research tools: real journeys are captured, tools run only at discovery gates, and evidence stays future-only.
let toolState=Cortex.initialState(5000000);
for(let i=0;i<60;i++){
 const win=i%2===0,decidedAt=6000000+i*3600000,exitAt=decidedAt+45*60000;
 let sh=resolved(5000+i,win,{cortexCorrect:false});
 sh={...sh,caseId:`RCASE-${i}`,decidedAt,direction:'LONG',fillPrice:100,outcome:{...sh.outcome,at:exitAt,exitPrice:win?101.2:99.2,netPnlPct:win?1:-1,executionValid:true,totalFeesPct:.20,feePolicy:'SPOT_NO_BNB'}};
 let ww={...w(5000+i),cycleId:`RCASE-${i}`,dir:'LONG',tf:'4h',entryAt:decidedAt,entryPrice:100,breakTime:decidedAt-8*60000,breakBarsAgoAtEntry:0};
 let journey=[
  {t:decidedAt,price:100,movePct:0,flow:{acceleration:0,eligible:false}},
  {t:decidedAt+15*60000,price:win?100.35:99.8,movePct:win?.35:-.2,flow:{acceleration:win?.30:-.10,eligible:win}},
  {t:decidedAt+30*60000,price:win?100.8:99.4,movePct:win?.8:-.6,flow:{acceleration:win?.20:.25,eligible:true}}
 ];
 toolState=Cortex.observeResolved(toolState,sh,ww,exitAt,{journey}).state;
}
let tools=Cortex.publicState(toolState),rt=tools.researchTools;
assert.equal(rt.mode,'ON_DEMAND','research toolkit must never become an always-running second mind');
for(const k of ['similarityComparison','temporalMicroscope','decisionLab','variableIsolation','hypothesisLedger','validityMap'])assert(rt[k].runs>=1,`research tool did not run: ${k}`);
assert(rt.similarityComparison.lastSummary?.pairFound,'similar-case comparator must inspect opposite outcomes');
assert(rt.temporalMicroscope.lastSummary?.samples>0&&rt.temporalMicroscope.lastSummary?.flowBeforeMoveSamples>0,'temporal microscope must use stored real journeys');
assert(rt.decisionLab.lastSummary?.waitComparable>0&&rt.decisionLab.lastSummary?.continueComparable>0,'decision lab must compare predefined alternatives');
assert(toolState.researchCases.some(x=>x.decisionLab?.feePct===.20),'decision lab must charge the fixed 0.20% round-trip fee');
assert(rt.variableIsolation.lastSummary?.samples===toolState.observedCases,'variable isolation must reuse frozen feature ablations without retraining history');
assert(Array.isArray(tools.hypothesisLedger)&&tools.hypothesisLedger.length>0,'hypothesis ledger must expose frozen hypotheses');
assert(tools.hypothesisLedger.every(x=>x.expectation==='POSITIVE_NET_PNL_AFTER_0.20_FEES'),'ledger expectation must be economic and frozen before proof');
assert(Array.isArray(tools.validityMap)&&tools.validityMap.length>0,'knowledge validity map must expose rule/context scope');
assert((toolState.researchCases||[]).length<=Cortex.MAX_RESEARCH_CASES,'research case memory must remain bounded');
assert(tools.researchWorkforce?.jobsCompleted>0,'CORTEX must actually dispatch bounded research jobs to its assistants');
for(const k of ['evidenceHunter','falsifier','prospectiveExperimenter','generalizationTester'])assert(tools.researchWorkforce?.workers?.[k],`missing CORTEX research worker: ${k}`);
assert.equal(tools.researchWorkforce.guardrails.workersMayChangeTradeAI,false);assert.equal(tools.researchWorkforce.guardrails.workersMayApproveEdge,false);
assert.equal(tools.fatherGateway?.status,'DISABLED_UNTIL_VPS');assert.equal(tools.fatherGateway?.secretPresent,false);
assert.equal(Cortex.decisionLabSnapshot({decidedAt:1,fillPrice:100,outcome:{at:2,exitPrice:101}}, {dir:'LONG',tf:'4h'}, {journey:[]}).waitNetPct,null,'missing checkpoint must stay unknown, never be invented as zero');

// Long-running brain remains bounded: histories, hypotheses, contexts and segments have caps.
for(let i=360;i<3360;i++){let win=i%3!==0;s=Cortex.observeResolved(s,resolved(i,win,{cortexCorrect:false}),w(i),200000+i).state;}
assert((s.recent||[]).length<=100);assert((s.recentLabels||[]).length<=200);assert((s.researchCases||[]).length<=Cortex.MAX_RESEARCH_CASES);assert((s.candidates||[]).length<=Cortex.MAX_CANDIDATES);assert((s.validated||[]).length<=Cortex.MAX_VALIDATED);assert(Object.keys(s.segments||{}).length<=160);assert(Buffer.byteLength(JSON.stringify(s))<750000,'CORTEX brain must stay bounded instead of storing the dataset in RAM');
// Durable foundation is physically separate from runtime and appends sparse research events/checkpoints.
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'omega-cortex-foundation-')),f=Foundation.createFoundation({dataDir:dir,LearningForge:Cortex,appVersion:'TEST'});let b=f.load();b=Cortex.normalizeState({...b,observedCases:100});f.persist(b,'CASE_100',{events:[{type:'CORTEX_TEST_EVENT',t:Date.now(),id:'H1'}],forceCheckpoint:true});let st=f.status(b);assert.equal(st.schema,'alpha-proof-omega-cortex-foundation/4');assert(fs.existsSync(f.brainFile)&&fs.existsSync(f.eventsFile));assert(f.brainFile.includes('omega-cortex'));assert(st.brainBytes>0&&st.eventsBytes>0&&st.checkpointCount>=1);assert.equal(st.checkpointEvery,100);fs.rmSync(dir,{recursive:true,force:true});
console.log('PASS: Ω CORTEX V4 NET-PNL discovers profit-first EDGE hypotheses, runs six bounded on-demand research tools, forbids hindsight proof, applies Statistical Firewall + Feature Tribunal and stays bounded');
