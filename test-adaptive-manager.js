
'use strict';const assert=require('assert'),M=require('./adaptive-manager.js');let s=M.initialState(1),sh={finalDecision:'SKIP',modelDecision:'ENTER',decisionReason:'TARGET_DOES_NOT_COVER_SPOT_FEES',fillPrice:100,confidence:.8},w={cycleId:'A',symbol:'TESTUSDT',dir:'LONG',tf:'1h',radarScore:80,flow:{relative:2,pressure:60,persistence:70,speed:.2,acceleration:.01}};s=M.open(s,sh,w,1000);assert(s.positions.A,'free manager must be allowed to open from modelDecision even when baseline finalDecision is SKIP');assert.equal(s.positions.A.entryMode,'FREE_MODEL');assert.equal(s.positions.A.baselineDecision,'SKIP');for(let i=0;i<60;i++){let r=M.observe(s,w,100+i*.02,2000+i*30000);s=r.state}assert(s.samples>0,'management labels must mature only after later observations');assert.equal(M.publicState(s).roundTripFeePct,.20);assert(!require('fs').readFileSync('adaptive-manager.js','utf8').includes('targetPrice'),'free manager must not use fixed TP');assert(!require('fs').readFileSync('adaptive-manager.js','utf8').includes('stopPrice'),'free manager must not use fixed SL');console.log('PASS: adaptive Shadow manager has free entry vs baseline and learns HOLD/EXIT prospectively without fixed TP/SL');

// Profit capture regression tests use prospectively observed paths, never hindsight peaks.
const AI=require('./lab-ai.js'),t0=Date.UTC(2026,8,10),frame=4*3600000;
function captureRow(id,t,tf='4h'){return {cycleId:id,symbol:id+'USDT',dir:'LONG',tf,entryAt:t,entryPrice:100,radarScore:85,memoryEligible:true,flow:{relative:3,pressure:70,persistence:80,speed:.2,acceleration:.02,alive:true,measuredAt:t}};}
function captureShadow(t,decision='ENTER'){return {executionPolicy:AI.EXECUTION_POLICY,entryExecutionCostPct:.1,decidedAt:t,fillPrice:100,modelDecision:decision,baselineModelDecision:decision,finalDecision:decision,confidence:.8};}
function tick(st,w,price,t,weak=false){w={...w,flow:{...w.flow,measuredAt:t,...(weak?{relative:.5,pressure:40,persistence:20,speed:-.3,acceleration:-.05,alive:false}:{})}};return M.advanceCapture(st,new Map([[w.symbol,{lastPrice:price,bidPrice:price,askPrice:price}]]),{[w.symbol]:w},t);}
let cs=M.initialState(t0),cw=captureRow('TREND',t0);cs=M.open(cs,captureShadow(t0),cw,t0);
for(let i=1;i<=960;i++)cs=tick(cs,cw,100+3*i/960,t0+i*30000).state;
assert(cs.positions.TREND,'intact 4h trend must remain open through +3%, rather than taking a tiny green result');
assert(cs.positions.TREND.peakNetPct>2.6);assert(cs.capture.samples>0);assert(cs.capture.studies.TREND.entryMatured);assert.equal(cs.samples,0,'new policy must not overwrite legacy exit weights');
const loaded=M.normalizeState(JSON.parse(JSON.stringify(cs)),t0+frame*2);assert.equal(loaded.positions.TREND.frameMs,frame);assert.deepEqual(loaded.capture.entryCells,cs.capture.entryCells);
let loss=tick(loaded,cw,95,t0+frame*2+30000);assert.equal(loss.state.closed.at(-1).reason,'ADVERSE_MOVE');assert(loss.state.closed.at(-1).netPnlPct<-5);assert(loss.state.capture.studies.TREND.exit);
for(let i=2;i<=962;i++)loss=tick(loss.state,cw,104,t0+frame*2+i*30000);
let follow=loss.state.capture.completed.find(x=>x.id==='TREND');assert(follow&&follow.followupComplete);assert(follow.missedAfterExitPct>=9);assert.equal(Object.keys(loss.state.capture.studies).length,0);
let fast=M.initialState(t0),fw=captureRow('FAST',t0,'1d');fast=M.open(fast,captureShadow(t0),fw,t0);
for(let i=1;i<=100;i++)fast=tick(fast,fw,100.3,t0+i*100).state;
assert.equal(fast.capture.samples,0);assert(fast.positions.FAST);const pendingBefore=fast.positions.FAST.pending.length;fast=tick(fast,fw,101,t0+10000).state;assert.equal(fast.positions.FAST.pending.length,pendingBefore);
let gap=M.initialState(t0),gw=captureRow('GAP',t0,'5m');gap=M.open(gap,captureShadow(t0,'SKIP'),gw,t0);gap=tick(gap,gw,103,t0+11*60000).state;
assert.equal(Object.keys(gap.capture.entryCells).length,0,'missing path must not become clean evidence');assert(gap.capture.unresolved>0);
function evidence(negative){let st=M.initialState(t0);for(let i=0;i<48;i++){
 const at=t0+Math.floor(i/12)*86400000+(i%12)*1800000,w=captureRow('E'+i,at,'5m');st=M.open(st,captureShadow(at,'SKIP'),w,at);const move=negative?(i%6===0?-5:.6):2;
 for(let k=1;k<=20;k++)st=tick(st,w,100+move*k/20,at+k*30000).state;
 }return st;}
const at=t0+4*86400000,ew=captureRow('QUERY',at,'5m');let positive=evidence(false),positiveAdvice=M.entryAdvice(positive,ew,at);
assert(positiveAdvice.ready&&positiveAdvice.lowerNetPct>0);assert.equal(positiveAdvice.winProbability,1);assert.equal(positiveAdvice.samples,48);
let negative=evidence(true),negativeAdvice=M.entryAdvice(negative,ew,at);assert(negativeAdvice.ready&&negativeAdvice.winProbability>.8&&negativeAdvice.lowerNetPct<0,'rare large losses must outweigh frequent small wins');
let dr=AI.decide(AI.initialState(at),{...ew,targetPrice:103,stopPrice:99,profitEntryAdvice:negativeAdvice},{},at,100);
assert.equal(dr.shadow.modelDecision,'SKIP');assert.equal(dr.shadow.baselineModelDecision,'ENTER');assert.equal(dr.shadow.returnAdvice.winProbability,negativeAdvice.winProbability);
let cold=M.entryAdvice(M.initialState(at),ew,at);assert.equal(cold.ready,false);assert.equal(cold.meanNetPct,null);
assert.throws(()=>M.normalizeState({...positive,capture:{...positive.capture,policy:'UNKNOWN'}}),/recovery/);assert(!M.validateCaptureState({...positive,capture:{...positive.capture,samples:'invalid'}}));
console.log('PASS: frame-based capture holds intact +3% trend, protects against adverse moves, follows exits, persists evidence, rejects gaps, and separates win rate from expected return');

// A radar timeframe change is not a new management timeframe or an exit signal.
let fixed=M.initialState(t0),fixedRow=captureRow('FIXED',t0,'4h');fixed=M.open(fixed,captureShadow(t0),fixedRow,t0);
let changed={...fixedRow,tf:'5m',oppositeConfirmed:true,flow:{relative:.1,pressure:10,alive:false,measuredAt:t0+60000}};
fixed=M.advanceCapture(fixed,new Map([[fixedRow.symbol,{lastPrice:100.5,bidPrice:100.5,askPrice:100.5}]]),{[fixedRow.symbol]:changed},t0+60000).state;
assert(fixed.positions.FIXED);assert.equal(fixed.positions.FIXED.tf,'4h');
// Tracking persists after the radar removes the coin (empty active map).
fixed=M.advanceCapture(fixed,new Map([[fixedRow.symbol,{lastPrice:100.6,bidPrice:100.6,askPrice:100.6}]]),{},t0+90000).state;
assert.equal(fixed.positions.FIXED.lastPrice,100.6);
console.log('PASS: management timeframe stays frozen and observations continue beyond radar removal');
