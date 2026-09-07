'use strict';
const assert=require('assert'),fs=require('fs');
const C=require('./learning-forge.js');
const src=fs.readFileSync(require.resolve('./learning-forge.js'),'utf8');
let m=src.match(/ function mentorAdvice\([\s\S]*?\n function noteMentorApplied/);assert(m,'mentorAdvice source not found');let body=m[0];
assert(body.includes("c.kind!=='EDGE'"),'Mentor must ignore legacy RISK hypotheses');
assert(body.includes('PER_EDGE_MARGINAL_PAIRED_SHADOW_BRIER_LCB'),'per-EDGE Shadow Calibration gate missing');
assert(body.includes('shadowDelta')&&body.includes('eligibleCount')&&body.includes('SHADOW_TESTING'),'Shadow Mentor states missing');
assert(!body.includes('mentCal.brier<baseCal.brier'),'old circular global Calibration lock must be removed');
assert(src.includes('function updateMentorTrials')&&src.includes('MENTOR_SHADOW_MIN=MIN_PROSPECTIVE'),'paired future trial updater/minimum missing');
let s=C.initialState(1);s.validated=[{id:'EDGE',kind:'EDGE',context:'GLOBAL',status:'PROVEN',createdAt:1,bornAtSample:0,rule:{terms:[{feature:'score',op:'GE',threshold:0}]},strength:.03,eval:{matchN:200,allN:200,allWins:150,matchWins:160,changedN:100,diffSum:20,diffSqSum:40,blocks:[{n:25,wins:18,matchN:20,matchWins:17},{n:25,wins:18,matchN:20,matchWins:17},{n:25,wins:18,matchN:20,matchWins:17}]},proof:{economicPolicy:'NET-EDGE-1',netDeltaLcb:.1}}];s.drift.status='STABLE';
// Even perfect-looking legacy/global calibration cannot unlock a new EDGE.
for(let i=0;i<100;i++){let b=s.calibration.base[Math.min(9,Math.floor(.55*10))],m=s.calibration.mentored[Math.min(9,Math.floor(.8*10))];b.n++;b.wins++;b.pSum+=.55;b.brier+=(.55-1)**2;m.n++;m.wins++;m.pSum+=.8;m.brier+=(.8-1)**2;}
let a=C.mentorAdvice(s,{score:.8},1000,{contexts:['GLOBAL']});assert(a.active&&a.shadowDelta>0);assert.equal(a.delta,0,'legacy/global Calibration must never unlock a per-EDGE Mentor');
console.log('PASS: circular Mentor/Calibration lock replaced by per-EDGE prospective Shadow Mentor; RISK remains excluded');
