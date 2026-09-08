'use strict';
const assert=require('assert'),AI=require('./lab-ai.js'),M=require('./adaptive-manager.js');
const now=Date.now();
let state=AI.initialState(now);
const market={direction:'BULL',upPct:70,downPct:20,fearGreed:{value:55},updatedAt:now};
const w={cycleId:'FREE1',symbol:'FREEUSDT',dir:'LONG',tf:'1h',entryAt:now+1,entryPrice:100,livePrice:100,targetPrice:99.9,stopPrice:99,radarScore:95,flow:{minutes:5,relative:4,pressure:75,persistence:90,impact:5,move:1,speed:.5,acceleration:.05,score:95,eligible:true,alive:true,measuredAt:now},support:{}};
let r=AI.decide(state,w,market,now,100);
assert.notEqual(r.shadow.status,'REJECTED','new positions must ignore legacy fixed TP/SL geometry');
assert.equal(r.shadow.execution.policy,'AI_DYNAMIC');assert(['ENTER','SKIP'].includes(r.shadow.modelDecision));
// Force a strong learned prior so this case is definitely ENTER independent of legacy TP/SL.
state=AI.initialState(now);state.bias=6;
r=AI.decide(state,w,market,now+1,100);
assert.equal(r.shadow.modelDecision,'ENTER');assert.equal(r.shadow.finalDecision,'ENTER');
let am=M.open(M.initialState(now),r.shadow,w,now+1);
assert(am.positions.FREE1,'adaptive free path must open despite baseline geometry rejection');
assert.equal(am.positions.FREE1.baselineDecision,'ENTER');
assert(!('targetPrice' in am.positions.FREE1));assert(!('stopPrice' in am.positions.FREE1));
console.log('PASS: AI-managed entry/exit is independent from removed fixed TP/SL geometry');
