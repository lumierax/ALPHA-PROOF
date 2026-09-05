'use strict';
const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path');
const Cortex=require('./learning-forge.js'),Foundation=require('./learning-forge-foundation.js');
function feat(win,phase=0){let hi=win?.82:-.82;return {score:hi,relative:hi*.8,pressure:hi*.72,persistence:hi*.66,impact:hi*.52,move:hi*.46,speed:hi*.40,acceleration:hi*.32,market:phase%3===0?-.3:.3,fearGreed:phase%4===0?-.2:.2,marketForecast:phase%5===0?-.25:.25,marketForecastConfidence:.55,marketTurning:0,marketAgreement:win?.5:-.5,pa:win?.25:-.25,ce:win?.2:-.2,ema:win?.2:-.2,timeframe:.25,dirShort:0};}
function resolved(i,win,{cortexCorrect=true,drift=false}={}){let f=feat(win,i);if(drift){for(const k of Object.keys(f))if(typeof f[k]==='number')f[k]=win?.95:-.95}
 // Base deliberately makes the opposite decision in the learnable score extremes:
 // high-score wins start just below ENTER threshold; low-score losses start just above it.
 const baseConfidence=win?.55:.65;
 const finalDecision=cortexCorrect?(win?'ENTER':'SKIP'):(baseConfidence>=.60?'ENTER':'SKIP');
 const confidence=cortexCorrect?(win?.78:.22):baseConfidence;
 const featureAblations=Object.fromEntries(Cortex.featureNames.map(k=>[k,.5]));
 return {status:'CLOSED',caseId:`CASE-${i}`,baseConfidence,confidence,finalDecision,features:f,featureAblations,facts:{market:{direction:'UP',relation:i%5===0?'COUNTER':'WITH',marketAI:{regime:i%7===0?'TURNING_UP':'UP'}}},outcome:{winLabel:win?1:0}};
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
assert((s.candidates||[]).some(x=>x.kind==='RISK'),'must generate RISK hypotheses');
const born=Math.min(...s.candidates.map(x=>x.bornAtSample));assert(born>=Cortex.MIN_DISCOVERY);
for(const c of s.candidates)assert.equal(c.eval.allN,0,'discovery data must not be reused as proof');
// Future-only arena: enough prospective cases to prove strong EDGE and RISK rules.
for(let i=60;i<360;i++){let win=i%2===0;s=Cortex.observeResolved(s,resolved(i,win),w(i),3000+i).state;}
let pub=Cortex.publicState(s);
assert(pub.validatedCount>0,'strong prospective rules should become PROVEN');
assert(pub.edgeProven>0,'at least one EDGE must prove itself on future cases');
assert(pub.riskProven>0,'at least one RISK must prove itself on future cases');
for(const c of s.validated){assert(c.eval.allN<=s.observedCases-c.bornAtSample,'no pre-birth case may enter proof');assert(c.eval.allN>=Cortex.MIN_PROSPECTIVE,'PROVEN requires future observation floor');assert(c.eval.blocks.length>=2,'PROVEN requires temporal blocks');assert(c.proof,'PROVEN must carry Statistical Firewall evidence');assert.equal(c.proof.prospectiveN%Cortex.PROOF_GATE_EVERY,0,'proof may occur only at scheduled future gates');assert(c.proof.adjustedLower>=.5,'multiple-testing-adjusted Wilson lower bound must clear proof floor');assert(c.proof.positiveBlocks>=3&&c.proof.positiveBlocks>c.proof.negativeBlocks*2,'proof requires repeated positive temporal blocks');}
assert(pub.statisticalFirewall?.enabled&&pub.statisticalFirewall?.multipleTestingAdjusted,'Statistical Firewall must be visible in public state');assert(Array.isArray(pub.ablation)&&pub.ablation.length===Cortex.featureNames.length,'Feature Tribunal must score frozen feature ablations');assert(pub.ablation.every(x=>x.n===s.observedCases),'every resolved clean case must contribute one prospective ablation score per feature');
assert(pub.arena.changed>0&&pub.arena.helped>pub.arena.hurt,'Arena must compare Base vs CORTEX decisions');
assert(pub.arena.deltaAvgUtility>0,'synthetic learnable world should improve utility');
assert(pub.calibration.base.samples===pub.calibration.mentored.samples&&pub.calibration.base.samples===s.observedCases,'Calibration Mirror must score both confidence streams on same cases');
assert(pub.calibration.deltaBrier>0,'better mentored confidence should improve Brier in synthetic world');
// Mentor uses only PROVEN rules, respects context, and is hard-bounded.
let advice=Cortex.mentorAdvice(s,feat(true,999),99999,{contexts:['GLOBAL','DIR_LONG','TF_SWING','REL_WITH','DIR_LONG__REL_WITH','DIR_LONG__TF_SWING','REGIME_UP']});
assert(advice.active,'PROVEN matching rule should be available as Mentor');assert(advice.delta>0,'matching EDGE should add confidence');assert(Math.abs(advice.delta)<=.0800001,'Mentor hard cap must stay ±8%');
let riskAdvice=Cortex.mentorAdvice(s,feat(false,998),100000,{contexts:['GLOBAL','DIR_LONG','TF_SWING','REL_WITH','DIR_LONG__REL_WITH','DIR_LONG__TF_SWING','REGIME_UP']});
assert(riskAdvice.active,'matching RISK should be available');assert(riskAdvice.delta<0,'matching RISK should subtract confidence');
// Context isolation: a context-specific rule cannot leak when context hints exclude it.
let onlySpecific=JSON.parse(JSON.stringify(s));onlySpecific.validated=onlySpecific.validated.filter(c=>c.context!=='GLOBAL');let spec=onlySpecific.validated[0];if(spec){let noCtx=Cortex.mentorAdvice(onlySpecific,feat(spec.kind==='EDGE',1),100001,{contexts:['UNRELATED']});assert(!noCtx.active,'context-specific rule must not leak into unrelated context')}
// Drift Sentinel quarantine is a safety gate, not just a warning label.
let shift=JSON.parse(JSON.stringify(s));shift.drift.status='SHIFT';let q=Cortex.mentorAdvice(shift,feat(true,2),100002,{contexts:['GLOBAL','DIR_LONG','TF_SWING','REL_WITH','DIR_LONG__REL_WITH','DIR_LONG__TF_SWING','REGIME_UP']});assert(q.active&&q.quarantined);assert.equal(q.delta,0,'SHIFT must quarantine Mentor influence');
let watch=JSON.parse(JSON.stringify(s));watch.drift.status='WATCH';let wa=Cortex.mentorAdvice(watch,feat(true,2),100003,{contexts:['GLOBAL','DIR_LONG','TF_SWING','REL_WITH','DIR_LONG__REL_WITH','DIR_LONG__TF_SWING','REGIME_UP']});assert(Math.abs(wa.delta)<=Math.abs(advice.delta)+1e-9,'WATCH must attenuate, never amplify Mentor');
// Duplicate and unfinished cases cannot teach CORTEX.
let before=s.observedCases,dup=Cortex.observeResolved(s,resolved(359,false),w(359),100010);assert(dup.duplicate&&dup.state.observedCases===before);let open=Cortex.observeResolved(s,{status:'OPEN',features:feat(true,1)},w(999),100011);assert.equal(open.state.observedCases,before);
// Long-running brain remains bounded: histories, hypotheses, contexts and segments have caps.
for(let i=360;i<3360;i++){let win=i%3!==0;s=Cortex.observeResolved(s,resolved(i,win,{cortexCorrect:false}),w(i),200000+i).state;}
assert((s.recent||[]).length<=100);assert((s.recentLabels||[]).length<=200);assert((s.candidates||[]).length<=Cortex.MAX_CANDIDATES);assert((s.validated||[]).length<=Cortex.MAX_VALIDATED);assert(Object.keys(s.segments||{}).length<=160);assert(Buffer.byteLength(JSON.stringify(s))<750000,'CORTEX brain must stay bounded instead of storing the dataset in RAM');
// Durable foundation is physically separate from runtime and appends sparse research events/checkpoints.
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'omega-cortex-foundation-')),f=Foundation.createFoundation({dataDir:dir,LearningForge:Cortex,appVersion:'TEST'});let b=f.load();b=Cortex.normalizeState({...b,observedCases:100});f.persist(b,'CASE_100',{events:[{type:'CORTEX_TEST_EVENT',t:Date.now(),id:'H1'}],forceCheckpoint:true});let st=f.status(b);assert.equal(st.schema,'alpha-proof-omega-cortex-foundation/3');assert(fs.existsSync(f.brainFile)&&fs.existsSync(f.eventsFile));assert(f.brainFile.includes('omega-cortex'));assert(st.brainBytes>0&&st.eventsBytes>0&&st.checkpointCount>=1);assert.equal(st.checkpointEvery,100);fs.rmSync(dir,{recursive:true,force:true});
console.log('PASS: Ω CORTEX V3 discovers EDGE/RISK, forbids hindsight proof, uses Statistical Firewall + Feature Tribunal, calibrates confidence, detects drift, quarantines SHIFT and stays bounded');
