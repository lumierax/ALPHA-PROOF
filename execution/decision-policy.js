'use strict';

// Direction, venue and leverage are deliberately separate decisions.
// Strategy learning is not given a hard leverage ceiling here. PAPER can explore
// freely; a future exchange adapter must still validate the exchange's actual
// symbol/account capabilities before TESTNET/LIVE placement.
const SCHEMA='alpha-proof-execution-choice/1';
const POLICY_VERSION='EXECUTION-CHOICE-001';
const MAX_LEVERAGE_ARMS=48;
const AUTO='AUTO',MANUAL='MANUAL';
const SPOT='SPOT',FUTURES='FUTURES';
const LONG='LONG',SHORT='SHORT';
const round=(v,d=6)=>Number.isFinite(Number(v))?Number(Number(v).toFixed(d)):null;
const positive=(v,d=1)=>Number.isFinite(Number(v))&&Number(v)>=1?Number(v):d;
const blankArm=()=>({n:0,sumNetPct:0,wins:0,losses:0,liquidations:0,lastAt:null});
function initialLearning(){return {schema:SCHEMA,policyVersion:POLICY_VERSION,venue:{LONG:{SPOT:blankArm(),FUTURES:blankArm()},SHORT:{FUTURES:blankArm()}},leverage:{LONG:{preferred:1,arms:{}},SHORT:{preferred:1,arms:{}}},updatedAt:null};}
function arm(raw={}){let x={...blankArm(),...(raw||{})};for(const k of ['n','wins','losses','liquidations'])x[k]=Math.max(0,Math.round(Number(x[k])||0));x.sumNetPct=Number.isFinite(Number(x.sumNetPct))?Number(x.sumNetPct):0;x.lastAt=Number.isFinite(Number(x.lastAt))?Number(x.lastAt):null;return x;}
function pruneLeverageArms(book){book=book&&typeof book==='object'?book:{preferred:1,arms:{}};let entries=Object.entries(book.arms||{});if(entries.length<=MAX_LEVERAGE_ARMS)return book;const pref=positive(book.preferred,1),mean=([,a])=>{a=arm(a);return a.n?a.sumNetPct/a.n:-Infinity},recent=[...entries].sort((a,b)=>(arm(b[1]).lastAt||0)-(arm(a[1]).lastAt||0)).slice(0,16),best=[...entries].sort((a,b)=>mean(b)-mean(a)).slice(0,16),near=[...entries].sort((a,b)=>Math.abs(Number(a[0])-pref)-Math.abs(Number(b[0])-pref)).slice(0,16),keep=new Set([...recent,...best,...near].map(([k])=>k));for(const [k] of entries)if(!keep.has(k))delete book.arms[k];return book;}
function normalizeLearning(raw={}){
 const b=initialLearning(),x=raw&&typeof raw==='object'?raw:{};
 const out={...b,...x,schema:SCHEMA,policyVersion:POLICY_VERSION,venue:{LONG:{SPOT:arm(x?.venue?.LONG?.SPOT),FUTURES:arm(x?.venue?.LONG?.FUTURES)},SHORT:{FUTURES:arm(x?.venue?.SHORT?.FUTURES)}},leverage:{LONG:{preferred:positive(x?.leverage?.LONG?.preferred,1),arms:{}},SHORT:{preferred:positive(x?.leverage?.SHORT?.preferred,1),arms:{}}},updatedAt:Number.isFinite(Number(x.updatedAt))?Number(x.updatedAt):null};
 for(const dir of [LONG,SHORT]){for(const [k,v] of Object.entries(x?.leverage?.[dir]?.arms||{}))out.leverage[dir].arms[String(k)]=arm(v);pruneLeverageArms(out.leverage[dir]);}
 return out;
}
function normalizeSettings(raw={}){let mode=String(raw?.leverageMode||AUTO).toUpperCase();if(![AUTO,MANUAL].includes(mode))mode=AUTO;let fee=Number(raw?.futuresTakerFeePct);if(!Number.isFinite(fee)||fee<0)fee=.05;return {leverageMode:mode,manualLeverage:positive(raw?.manualLeverage,1),futuresTakerFeePct:fee};}
function ucb(a,total){a=arm(a);if(a.n===0)return Infinity;return a.sumNetPct/a.n+Math.sqrt(2*Math.log(Math.max(2,total+1))/a.n);}
function chooseVenue(learning,dir){
 if(dir===SHORT)return {venue:FUTURES,reason:'SHORT_REQUIRES_FUTURES'};
 const row=learning.venue.LONG,total=row.SPOT.n+row.FUTURES.n;
 if(row.SPOT.n<4||row.FUTURES.n<4){const venue=row.SPOT.n<=row.FUTURES.n?SPOT:FUTURES;return {venue,reason:'VENUE_EXPLORATION'};}
 const spot=ucb(row.SPOT,total),futures=ucb(row.FUTURES,total),venue=futures>spot?FUTURES:SPOT;
 return {venue,reason:'VENUE_LEARNED_UCB',scores:{SPOT:round(spot),FUTURES:round(futures)}};
}
function leverageKey(v){return String(round(positive(v,1),4));}
function candidateLeverages(pref){
 pref=positive(pref,1);
 const raw=[1,pref/2,pref,pref*1.5,pref*2];
 return [...new Set(raw.map(v=>positive(round(Math.max(1,v),4),1)))].sort((a,b)=>a-b);
}
function chooseLeverage(learning,dir,settings){
 if(settings.leverageMode===MANUAL)return {leverage:settings.manualLeverage,reason:'MANUAL_SETTING'};
 const book=learning.leverage[dir],candidates=candidateLeverages(book.preferred),total=Object.values(book.arms).reduce((s,a)=>s+arm(a).n,0);
 let best=null,bestScore=-Infinity;
 for(const value of candidates){let a=book.arms[leverageKey(value)]||blankArm(),score=ucb(a,total);if(score>bestScore){bestScore=score;best=value;}}
 return {leverage:positive(best,1),reason:Number.isFinite(bestScore)?'AUTO_LEARNED_UCB':'AUTO_EXPLORATION',preferred:round(book.preferred,4),candidates};
}
function select(rawLearning,w={},rawSettings={}){
 const learning=normalizeLearning(rawLearning),settings=normalizeSettings(rawSettings),direction=w?.dir===SHORT?SHORT:LONG,venueChoice=chooseVenue(learning,direction);
 if(venueChoice.venue===SPOT)return {learning,profile:{schema:SCHEMA,policyVersion:POLICY_VERSION,direction,venue:SPOT,leverage:1,leverageMode:'NONE',selectionReason:venueChoice.reason,selectedAt:Date.now()}};
 const lev=chooseLeverage(learning,direction,settings);
 return {learning,profile:{schema:SCHEMA,policyVersion:POLICY_VERSION,direction,venue:FUTURES,leverage:lev.leverage,leverageMode:settings.leverageMode,selectionReason:`${venueChoice.reason}|${lev.reason}`,venueScores:venueChoice.scores||null,leveragePreferred:lev.preferred??null,leverageCandidates:lev.candidates||null,commissionPct:settings.futuresTakerFeePct,commissionLiquidity:'TAKER_FALLBACK',selectedAt:Date.now()}};
}
function update(rawLearning,profile,outcome,now=Date.now()){
 let l=normalizeLearning(rawLearning);if(!profile||!outcome||outcome.executionValid===false)return l;
 const dir=profile.direction===SHORT?SHORT:LONG,venue=profile.venue===FUTURES?FUTURES:SPOT,net=Number(outcome.netPnlPct);if(!Number.isFinite(net))return l;
 const a=l.venue[dir][venue]||(l.venue[dir][venue]=blankArm());a.n++;a.sumNetPct+=net;if(net>0)a.wins++;else a.losses++;if(outcome.liquidated)a.liquidations++;a.lastAt=now;
 if(venue===FUTURES){const leverage=positive(profile.leverage,1),key=leverageKey(leverage),la=l.leverage[dir].arms[key]||(l.leverage[dir].arms[key]=blankArm());la.n++;la.sumNetPct+=net;if(net>0)la.wins++;else la.losses++;if(outcome.liquidated)la.liquidations++;la.lastAt=now;
  // No strategy ceiling: successful leverage can expand; losses/liquidations pull
  // the preferred point down. The only floor is 1x because <1x is not leverage.
  let p=positive(l.leverage[dir].preferred,1);
  if(net>0&&!outcome.liquidated)p=p*(1+Math.min(.35,Math.max(.02,net/100)));
  else p=Math.max(1,p/(1+Math.min(.65,Math.max(.05,Math.abs(net)/50+(outcome.liquidated?.35:0)))));
  l.leverage[dir].preferred=round(p,6);
 }
 if(venue===FUTURES)pruneLeverageArms(l.leverage[dir]);l.updatedAt=now;return l;
}
function publicState(raw){const l=normalizeLearning(raw);return {schema:SCHEMA,policyVersion:POLICY_VERSION,venue:l.venue,leverage:l.leverage,updatedAt:l.updatedAt,note:'AUTO leverage has no strategy max; exchange capabilities must be validated by any future external adapter.'};}
module.exports={SCHEMA,POLICY_VERSION,MAX_LEVERAGE_ARMS,AUTO,MANUAL,SPOT,FUTURES,LONG,SHORT,initialLearning,normalizeLearning,normalizeSettings,select,update,publicState,candidateLeverages};
