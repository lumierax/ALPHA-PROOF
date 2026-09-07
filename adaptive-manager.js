'use strict';
const ResearchGovernance=require('./research-governance.js');
const SPOT_ROUND_TRIP_FEE_PCT=ResearchGovernance.SPOT_ROUND_TRIP_FEE_PCT;
// Shadow-only adaptive trade manager. No fixed TP/SL and no real orders.
const SCHEMA='alpha-proof-adaptive-manager/1',MODEL_VERSION='ADAPTIVE-MANAGER-001',FEATURE_SCHEMA='MANAGEMENT-V1';
const FEATURES=['net','giveback','flowRelative','pressure','persistence','speed','acceleration','radar','age','entryConfidence'];
const OBS_RAM_MAX=20,DECISION_RAM_MAX=24,CLOSED_RAM_MAX=120,RECENT_RAM_MAX=120;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,Number.isFinite(Number(x))?Number(x):0));
const sigmoid=z=>1/(1+Math.exp(-clamp(z,-12,12)));
const round=(x,d=5)=>Number.isFinite(Number(x))?Number(Number(x).toFixed(d)):null;
function initialState(now=Date.now()){return {schema:SCHEMA,modelVersion:MODEL_VERSION,featureSchema:FEATURE_SCHEMA,startedAt:now,samples:0,bias:0,weights:Object.fromEntries(FEATURES.map(k=>[k,0])),positions:{},closed:[],recent:[],lastTrainedAt:null}}
function normalizeState(raw={},now=Date.now()){if(!validateCaptureState(raw))throw Error('Invalid profit capture memory; verified recovery required');let b=initialState(now),s={...b,...(raw||{})};s.schema=SCHEMA;s.modelVersion=MODEL_VERSION;s.featureSchema=FEATURE_SCHEMA;s.samples=Math.max(0,Number(s.samples)||0);s.bias=Number(s.bias)||0;s.weights={...b.weights,...(s.weights||{})};s.positions=s.positions&&typeof s.positions==='object'?s.positions:{};s.closed=Array.isArray(s.closed)?s.closed.slice(-CLOSED_RAM_MAX):[];s.recent=Array.isArray(s.recent)?s.recent.slice(-RECENT_RAM_MAX):[];for(const p of Object.values(s.positions)){if(!p||typeof p!=='object')continue;p.observations=Array.isArray(p.observations)?p.observations.slice(-OBS_RAM_MAX):[];p.pending=Array.isArray(p.pending)?p.pending.slice(-13):[];p.decisions=Array.isArray(p.decisions)?p.decisions.slice(-DECISION_RAM_MAX):[]}return s}
function gross(dir,entry,price){return (dir==='SHORT'?-1:1)*(Number(price)/Number(entry)-1)*100}
function features(pos,w,price,now){let g=gross(pos.dir,pos.entryPrice,price),net=g-SPOT_ROUND_TRIP_FEE_PCT,peak=Math.max(Number(pos.peakNetPct??net),net),f=w?.flow||{};return {net:clamp(net/5,-1,1),giveback:clamp((peak-net)/5,0,1),flowRelative:clamp((Number(f.relative)||0)/5,0,1),pressure:clamp(((Number(f.pressure)||50)-50)/50,-1,1),persistence:clamp((Number(f.persistence)||0)/100,0,1),speed:clamp((Number(f.speed)||0)/2,-1,1),acceleration:clamp((Number(f.acceleration)||0)/.5,-1,1),radar:clamp((Number(w?.radarScore)||0)/100,0,1),age:clamp((now-pos.entryAt)/(24*3600000),0,1),entryConfidence:clamp(Number(pos.entryConfidence)||0,0,1)}}
function probability(s,x){let z=s.bias;for(const k of FEATURES)z+=(Number(s.weights[k])||0)*(Number(x[k])||0);return sigmoid(z)}
function train(s,x,y,weight=1){let p=probability(s,x),err=(y-p)*clamp(weight,.25,4),lr=.035/Math.sqrt(1+s.samples/250);s.bias=clamp(s.bias+lr*err,-6,6);for(const k of FEATURES)s.weights[k]=clamp((Number(s.weights[k])||0)+lr*err*(Number(x[k])||0),-6,6);s.samples++;s.lastTrainedAt=Date.now();return p}
function open(state,shadow,w,now=Date.now()){state=normalizeState(state,now);if(!ResearchGovernance.eligible(state,shadow,w,now))return state;if(shadow?.executionPolicy===CAPTURE_POLICY&&w?.dir==='LONG')return registerCapture(state,shadow,w,now);let freeDecision=shadow?.modelDecision||shadow?.finalDecision,entry=Number(shadow?.fillPrice??w?.livePrice??w?.lastPrice??w?.entryPrice);if(!shadow||freeDecision!=='ENTER'||!w?.cycleId||state.positions[w.cycleId]||!Number.isFinite(entry)||entry<=0)return state;state.positions[w.cycleId]={id:w.cycleId,symbol:w.symbol,dir:w.dir,tf:w.tf,entryAt:now,entryPrice:entry,entryConfidence:Number(shadow.confidence??shadow.baseConfidence)||0,entryMode:'FREE_MODEL',baselineDecision:shadow.finalDecision||null,baselineDecisionReason:shadow.decisionReason||null,status:'OPEN',peakNetPct:-Infinity,lastPrice:entry,observations:[],pending:[],decisions:[]};return state}
function observe(state,w,price,now=Date.now()){state=normalizeState(state,now);let id=w?.cycleId,pos=state.positions[id];if(pos?.policy===CAPTURE_POLICY)return observeCapture(state,w,Number(price),now);if(!pos||pos.status!=='OPEN'||!Number.isFinite(Number(price)))return {state,action:null};let g=gross(pos.dir,pos.entryPrice,price),net=g-SPOT_ROUND_TRIP_FEE_PCT;pos.peakNetPct=Math.max(Number.isFinite(pos.peakNetPct)?pos.peakNetPct:net,net);let x=features(pos,w,price,now),pExit=probability(state,x),action=state.samples>=40&&pExit>=.62?'EXIT':'HOLD';let obs={t:now,price:Number(price),netPct:round(net),x,pExit:round(pExit),action};pos.observations.push(obs);pos.observations=pos.observations.slice(-OBS_RAM_MAX);pos.pending.push(obs);
 // Prospective decisions; labels mature only after 12 later observations. No future data enters the original decision.
 while(pos.pending.length>12){let old=pos.pending.shift(),future=pos.observations.filter(z=>z.t>old.t).slice(0,12);if(future.length<12){pos.pending.unshift(old);break}let bestFuture=Math.max(...future.map(z=>Number(z.netPct))),y=Number(old.netPct)>=bestFuture?1:0;train(state,old.x,y,Math.min(3,.5+Math.abs(Number(old.netPct)-bestFuture)));}
 pos.lastPrice=Number(price);pos.lastAt=now;pos.lastContext={radarScore:Number(w?.radarScore)||0,flow:w?.flow?{relative:Number(w.flow.relative)||0,pressure:Number(w.flow.pressure)||50,persistence:Number(w.flow.persistence)||0,speed:Number(w.flow.speed)||0,acceleration:Number(w.flow.acceleration)||0}:null};pos.decisions.push({t:now,action,pExit:round(pExit),price:Number(price),netPct:round(net)});pos.decisions=pos.decisions.slice(-DECISION_RAM_MAX);state.recent.push({t:now,id,symbol:pos.symbol,action,pExit:round(pExit),price:Number(price),netPct:round(net),samples:state.samples});state.recent=state.recent.slice(-RECENT_RAM_MAX);
 if(action==='EXIT'){pos.status='CLOSED';pos.exitAt=now;pos.exitPrice=Number(price);pos.netPnlPct=round(net);pos.reason='AI_EXIT';state.closed.push({...pos,observations:undefined,pending:undefined});state.closed=state.closed.slice(-CLOSED_RAM_MAX);delete state.positions[id];return {state,action:'EXIT',position:pos}}
 return {state,action:'HOLD',position:pos}}
function noteBaseline(state,id,reason,price,now=Date.now(),economics=null){state=normalizeState(state,now);let study=state.capture?.studies?.[id];if(study&&!study.baseline)study.baseline={at:now,reason,price:Number(price),netPnlPct:Number.isFinite(economics?.netPnlPct)?economics.netPnlPct:round(captureNet(study,{},Number(price),now))};let p=state.positions[id];if(p){p.baseline=p.baseline||{at:now,reason,price:Number(price),netPnlPct:Number.isFinite(economics?.netPnlPct)?economics.netPnlPct:round(p.policy===CAPTURE_POLICY?captureNet(p,{},Number(price),now):gross(p.dir,p.entryPrice,price)-SPOT_ROUND_TRIP_FEE_PCT)}}return state}

function compactForPersistence(state){
 state=normalizeState(state);
 let positions={};
 for(const [id,p] of Object.entries(state.positions||{}))positions[id]={...p,observations:(p.observations||[]).slice(-OBS_RAM_MAX),pending:(p.pending||[]).slice(-13),decisions:(p.decisions||[]).slice(-DECISION_RAM_MAX)};
 return {...state,positions,closed:(state.closed||[]).slice(-CLOSED_RAM_MAX).map(p=>({...p,observations:undefined,pending:undefined,decisions:Array.isArray(p.decisions)?p.decisions.slice(-12):[]})),recent:(state.recent||[]).slice(-RECENT_RAM_MAX)}
}
function publicState(state){state=normalizeState(state);return {schema:SCHEMA,modelVersion:MODEL_VERSION,featureSchema:FEATURE_SCHEMA,mode:'SHADOW_ONLY',capture:capturePublic(state),samples:state.samples,weights:state.weights,bias:state.bias,open:Object.values(state.positions).map(p=>({id:p.id,symbol:p.symbol,dir:p.dir,tf:p.tf,entryAt:p.entryAt,entryPrice:p.entryPrice,entryMode:p.entryMode||'FREE_MODEL',baselineDecision:p.baselineDecision||null,baselineDecisionReason:p.baselineDecisionReason||null,lastPrice:p.lastPrice,peakNetPct:round(p.peakNetPct),policy:p.policy||'LEGACY',frameMinutes:p.frameMs?p.frameMs/60000:null,entryAdvice:p.entryAdvice||null,lastDecision:p.decisions?.at(-1)||null,baseline:p.baseline||null})),closed:state.closed.slice(-40).reverse(),recent:state.recent.slice(-60).reverse(),feePolicy:'SPOT_NO_BNB',roundTripFeePct:SPOT_ROUND_TRIP_FEE_PCT,integrity:'PROSPECTIVE_DECISIONS_FUTURE_LABELS_ONLY'}}

// Versioned additive experiment. Existing brain/positions remain under their original policy.
const CAPTURE_POLICY='SPOT-CAPTURE-1';
const CAPTURE_LIMIT=256, CAPTURE_TAIL=120;
const frameMinutes=tf=>({'5m':5,'15m':15,'30m':30,'1h':60,'4h':240,'6h':360,'12h':720,'1d':1440,'3d':4320}[String(tf).toLowerCase()]||60);
function validateCaptureState(s){
 const c=s?.capture;if(c==null)return true;
 if(c.policy!==CAPTURE_POLICY||!Number.isFinite(c.startedAt)||!Number.isFinite(c.samples)||!Array.isArray(c.completed)||!c.studies||!c.entryCells||!c.holdCells)return false;
 for(const cells of [c.entryCells,c.holdCells])for(const v of Object.values(cells)){if(!v||![v.n,v.sum,v.sq,v.wins,v.lastAt].every(Number.isFinite)||!v.blocks)return false;}
 for(const p of Object.values(c.studies)){if(!p||![p.entryAt,p.entryPrice,p.entryCostPct,p.endAt,p.frameMs,p.lastAt].every(Number.isFinite)||p.entryPrice<=0||p.frameMs<=0)return false;}
 for(const p of Object.values(s.positions||{})){if(p?.policy===CAPTURE_POLICY&&(![p.frameMs,p.entryPrice,p.entryCostPct,p.minReviewAt,p.maxReviewAt,p.lastAt].every(Number.isFinite)||p.frameMs<=0||p.entryPrice<=0))return false;}
 return true;
}
function captureState(s,now){
 if(!s.capture)s.capture={policy:CAPTURE_POLICY,startedAt:now,entryCells:{},holdCells:{},studies:{},completed:[],samples:0,unresolved:0,capacitySkips:0,staleStudiesPurged:0};
 if(s.capture.policy!==CAPTURE_POLICY)throw Error('Unsupported profit capture policy; restore compatible brain');
 return s.capture;
}
function flowState(w,now){
 const f=w?.flow||{},at=Number(f.measuredAt),fresh=!w?.dataStale&&Number.isFinite(at)&&now>=at&&now-at<=120000;
 const weak=fresh&&(f.alive===false||Number(f.pressure)<48&&Number(f.relative)<1||Number(f.speed)<0&&Number(f.acceleration)<0&&Number(f.persistence)<40);
 return {fresh,weak,key:fresh?(weak?'WEAK':'INTACT'):'STALE'};
}
function cellKey(tf,w,now){return `${frameMinutes(tf)}|${flowState(w,now).key}`}
function newMoments(){return {n:0,sum:0,sq:0,wins:0,winSum:0,lossSum:0,blocks:{},lastAt:0}}
function addMoment(cells,key,value,at,blockMs){
 if(!Number.isFinite(value))return;
 const c=cells[key]||(cells[key]=newMoments());c.n++;c.sum+=value;c.sq+=value*value;c.lastAt=at;
 if(value>0){c.wins++;c.winSum+=value}else c.lossSum+=-value;
 // Independent time blocks, not the count of correlated observations, determine uncertainty.
 const block=String(Math.floor(at/blockMs)),b=c.blocks[block]||(c.blocks[block]={n:0,sum:0,wins:0,winSum:0,lossSum:0});b.n++;b.sum+=value;if(value>0){b.wins++;b.winSum+=value}else b.lossSum-=value;
 const keys=Object.keys(c.blocks).sort((a,b)=>Number(a)-Number(b));for(const k of keys.slice(0,Math.max(0,keys.length-96)))delete c.blocks[k];
}
function estimate(c,now,blockMs){
 if(!c)return {ready:false,samples:0,blocks:0,meanNetPct:null,lowerNetPct:null,upperNetPct:null,winProbability:null,averageWinPct:null,averageLossPct:null};
 const blocks=Object.entries(c.blocks).filter(([k])=>Number(k)*blockMs<now&&now-Number(k)*blockMs<=Math.max(14*86400000,blockMs*40));
 const values=blocks.map(([,b])=>b.sum/b.n),n=values.length,mean=n?values.reduce((a,b)=>a+b,0)/n:0;
 const variance=n>1?values.reduce((a,b)=>a+(b-mean)**2,0)/(n-1):Infinity;
 const margin=2.58*Math.sqrt(variance/Math.max(1,n));
 const count=blocks.reduce((s,[,b])=>s+b.n,0),wins=blocks.reduce((s,[,b])=>s+b.wins,0),winSum=blocks.reduce((s,[,b])=>s+b.winSum,0),lossSum=blocks.reduce((s,[,b])=>s+b.lossSum,0);
 const days=new Set(blocks.map(([k])=>Math.floor(Number(k)*blockMs/86400000))).size;
 return {ready:count>=40&&n>=12&&days>=3&&now>=c.lastAt&&now-c.lastAt<=Math.max(3*86400000,blockMs*4),samples:count,blocks:n,days,meanNetPct:n?round(mean):null,lowerNetPct:Number.isFinite(margin)?round(mean-margin):null,upperNetPct:Number.isFinite(margin)?round(mean+margin):null,winProbability:count?round(wins/count):null,averageWinPct:wins?round(winSum/wins):null,averageLossPct:count>wins?round(lossSum/(count-wins)):null};
}
function entryAdvice(state,w,now=Date.now()){
 const c=captureState(state,now),minutes=frameMinutes(w?.tf),key=cellKey(w?.tf,w,now),e=estimate(c.entryCells[key],now,minutes*2*60000);
 return {...e,policy:CAPTURE_POLICY,key,horizonMinutes:minutes*2,decision:w?.dir==='LONG'&&e.ready?(e.lowerNetPct>0?'ENTER':'SKIP'):'COLLECTING',ready:w?.dir==='LONG'&&e.ready,meaning:'FORWARD_NET_RETURN_NOT_MODEL_CONFIDENCE'};
}
function quoteCost(w,price,side,now){
 const q=w?.executionQuote,p=Number(price),bid=Number(q?.bid),ask=Number(q?.ask);
 const ok=[p,bid,ask].every(Number.isFinite)&&p>0&&bid>0&&ask>=bid&&Number.isFinite(q?.at)&&now>=q.at&&now-q.at<=60000;
 return (ok?Math.max(0,(side==='BUY'?ask/p-1:1-bid/p)*100):.05)+.05;
}
function captureNet(pos,w,price,now){return gross('LONG',pos.entryPrice,price)-SPOT_ROUND_TRIP_FEE_PCT-pos.entryCostPct-quoteCost(w,price,'SELL',now)*(price/pos.entryPrice)}
function registerCapture(state,shadow,w,now){
 const c=captureState(state,now),id=w.cycleId;
 if(w.memoryEligible===false||w.quality==='REJECTED'||w.dir!=='LONG'||c.studies[id]||state.positions[id]||c.completed.some(x=>x.id===id))return state;
 if(Object.keys(c.studies).length>=CAPTURE_LIMIT||Object.values(state.positions).filter(p=>p.policy===CAPTURE_POLICY).length>=CAPTURE_LIMIT){c.capacitySkips++;return state;}
 const entry=Number(shadow.fillPrice),minutes=frameMinutes(w.tf),frameMs=minutes*60000;
 if(!Number.isFinite(entry)||!(entry>0)||!Number.isFinite(now))return state;
 const cost=Number.isFinite(shadow.entryExecutionCostPct)?shadow.entryExecutionCostPct:quoteCost(w,entry,'BUY',now);
 const study={id,symbol:w.symbol,tf:w.tf,entryAt:now,entryPrice:entry,entryCostPct:cost,endAt:now+frameMs*2,frameMs,key:cellKey(w.tf,w,now),lastAt:now,lastPrice:entry,maxPrice:entry,minPrice:entry,entryMatured:false,entered:shadow.modelDecision==='ENTER',baselineDecision:shadow.finalDecision,baselineModelDecision:shadow.baselineModelDecision||shadow.modelDecision,baseline:null,observations:0};
 c.studies[id]=study;
 if(!study.entered)return state;
 state.positions[id]={id,symbol:w.symbol,dir:'LONG',tf:w.tf,entryAt:now,entryPrice:entry,entryConfidence:shadow.confidence,entryMode:'FRAME_NET_RETURN',policy:CAPTURE_POLICY,entryCostPct:cost,frameMs,minReviewAt:now+frameMs/4,maxReviewAt:now+frameMs*8,baselineDecision:shadow.finalDecision,status:'OPEN',peakNetPct:-SPOT_ROUND_TRIP_FEE_PCT-cost,lastPrice:entry,lastAt:now,noisePct:.1,weakSince:null,pending:[],observations:[],decisions:[],nextSampleAt:now,entryAdvice:shadow.returnAdvice||null};
 return state;
}
function observeCapture(state,w,price,now){
 const c=captureState(state,now),p=state.positions[w?.cycleId];
 if(!p||p.policy!==CAPTURE_POLICY||!Number.isFinite(price)||!(price>0)||!Number.isFinite(now)||now<=p.lastAt)return {state,action:null};
 if(frameMinutes(w.tf)!==p.frameMs/60000)w={...w,flow:null,dataStale:true,oppositeConfirmed:false};
 const previousAt=p.lastAt, gap=now-previousAt, maxGap=Math.max(120000,p.frameMs/8),net=captureNet(p,w,price,now),f=flowState(w,now);
 // Freeze the forecast before maturing any label from this observation.
 const key=cellKey(p.tf,w,now),forecast=estimate(c.holdCells[key],now,p.frameMs/2);
 const priorNoise=p.noisePct,step=Math.abs((price/p.lastPrice-1)*100);if(gap<=maxGap)p.noisePct=.9*p.noisePct+.1*Math.min(step*Math.sqrt(Math.max(1,p.frameMs/Math.max(1,gap))/4),Math.max(.2,p.noisePct*3));
 const gapDetected=gap>maxGap;
 if(gapDetected)p.pending=[];
 for(const old of p.pending){old.minNet=Math.min(old.minNet,net);}
 const remain=[];
 for(const old of p.pending){
  if(now<old.dueAt){remain.push(old);continue;}
  if(now-old.dueAt>maxGap)continue;
  // Predetermined HOLD until the frame-based horizon, with a drawdown penalty.
  const utility=net-old.net-.25*Math.max(0,old.net-old.minNet);
  addMoment(c.holdCells,old.key,utility,old.at,p.frameMs/2);c.samples++;
 }
 p.pending=remain;
 if(f.fresh&&now>=p.nextSampleAt){p.pending.push({at:now,dueAt:now+p.frameMs/2,net,minNet:net,key});p.nextSampleAt=now+p.frameMs/4;}
 p.pending=p.pending.slice(-4);
 p.peakNetPct=Math.max(Number.isFinite(p.peakNetPct)?p.peakNetPct:net,net);
 if(gapDetected||!f.fresh||!f.weak)p.weakSince=null;else if(p.weakSince==null)p.weakSince=now;
 const weakLong=p.weakSince!=null&&now-p.weakSince>=Math.max(60000,p.frameMs/8);
 const allowance=Math.min(2,Math.max(.35,priorNoise*3)),giveback=p.peakNetPct-net;
 let reason=null;
 if(w.oppositeConfirmed===true)reason='THESIS_INVALIDATED';
 else if(net<=-Math.max(2,allowance*2))reason='ADVERSE_MOVE';
 else if(weakLong&&now>=p.minReviewAt&&(!forecast.ready||forecast.upperNetPct<=0))reason='FLOW_INVALIDATED';
 else if(now>=p.minReviewAt&&p.peakNetPct>allowance*2&&giveback>=allowance&&f.fresh&&f.weak)reason='PROFIT_PROTECTION';
 else if(now>=p.minReviewAt&&forecast.ready&&forecast.upperNetPct<-.05)reason='NEGATIVE_CONTINUATION';
 else if(now>=p.maxReviewAt)reason='HORIZON_EXPIRED';
 const action=reason?'EXIT':'HOLD';
 p.lastPrice=price;p.lastAt=now;
 const decision={t:now,price,netPct:round(net),action,reason:reason||(gapDetected?'DATA_GAP':!f.fresh?'WAIT_FRESH_CONTEXT':'FRAME_CONTINUATION'),expectedHoldPct:forecast.meanNetPct,holdLowerPct:forecast.lowerNetPct,holdUpperPct:forecast.upperNetPct,holdReady:forecast.ready,frameMinutes:p.frameMs/60000};
 p.decisions.push(decision);p.decisions=p.decisions.slice(-DECISION_RAM_MAX);
 state.recent.push({id:p.id,symbol:p.symbol,policy:CAPTURE_POLICY,...decision});state.recent=state.recent.slice(-RECENT_RAM_MAX);
 if(action==='HOLD')return {state,action,position:p};
 p.status='CLOSED';p.exitAt=now;p.exitPrice=price;p.netPnlPct=round(net);p.reason=reason;
 state.closed.push({...p,pending:[],observations:[]});state.closed=state.closed.slice(-CLOSED_RAM_MAX);
 const study=c.studies[p.id];if(study){study.exit={at:now,price,netPct:round(net),reason};study.followUntil=now+p.frameMs*2;study.postMaxPrice=price;study.postMinPrice=price;study.holdPending=p.pending.map(x=>({...x}));}
 delete state.positions[p.id];
 return {state,action:'EXIT',position:p};
}
function advanceCapture(state,tickerMap,active={},now=Date.now()){
 state=normalizeState(state,now);const c=captureState(state,now),events=[];
 for(const study of Object.values(c.studies)){const hardExpiry=Math.max(Number(study.endAt)||0,Number(study.followUntil)||Number(study.entryAt||0)+Number(study.frameMs||0)*10)+Math.max(120000,Number(study.frameMs)||0);if(Number.isFinite(now)&&hardExpiry>0&&now>hardExpiry){c.unresolved++;c.staleStudiesPurged=(Number(c.staleStudiesPurged)||0)+1;delete c.studies[study.id];}}
 for(const p of Object.values(state.positions)){
  if(p.policy!==CAPTURE_POLICY)continue;
  const q=tickerMap.get(p.symbol);if(!q)continue;
  const a=active[p.id]||active[p.symbol],same=a?.cycleId===p.id&&frameMinutes(a.tf)===p.frameMs/60000;
  const w={...(same?a:{}),cycleId:p.id,symbol:p.symbol,dir:'LONG',tf:p.tf,executionQuote:{bid:Number(q.bidPrice),ask:Number(q.askPrice),at:now},dataStale:!same||!!a.dataStale};
  const r=observeCapture(state,w,Number(q.lastPrice),now);state=r.state;
  if(r.action==='EXIT')events.push({type:'EXIT',t:now,id:p.id,symbol:p.symbol,price:r.position.exitPrice,netPnlPct:r.position.netPnlPct,reason:r.position.reason,policy:CAPTURE_POLICY});
 }
 for(const study of Object.values(c.studies)){
  const q=tickerMap.get(study.symbol),price=Number(q?.lastPrice);
  const expiry=Math.max(study.endAt,study.followUntil||study.entryAt+study.frameMs*10);
  if(!Number.isFinite(price)||!(price>0)||now<=study.lastAt){if(now>expiry+study.frameMs){c.unresolved++;delete c.studies[study.id];}continue;}
  const maxGap=Math.max(120000,study.frameMs/8),gap=now-study.lastAt;
  if(gap>maxGap)study.gapped=true;
  study.lastAt=now;study.lastPrice=price;study.observations++;
  study.maxPrice=Math.max(study.maxPrice,price);study.minPrice=Math.min(study.minPrice,price);
  const w={executionQuote:{bid:Number(q.bidPrice),ask:Number(q.askPrice),at:now}},net=captureNet(study,w,price,now);
  if(study.holdPending){const remaining=[];for(const old of study.holdPending){old.minNet=Math.min(old.minNet,net);if(gap>maxGap)continue;if(now<old.dueAt){remaining.push(old);continue;}if(now-old.dueAt<=maxGap){addMoment(c.holdCells,old.key,net-old.net-.25*Math.max(0,old.net-old.minNet),old.at,study.frameMs/2);c.samples++;}}study.holdPending=remaining;}

  if(!study.entryMatured&&now>=study.endAt){
   study.entryMatured=true;study.forwardNetPct=round(net);
   study.labelValid=!study.gapped&&now-study.endAt<=maxGap;
   if(study.labelValid)addMoment(c.entryCells,study.key,net,study.entryAt,study.frameMs*2);else c.unresolved++;
   events.push({type:'FORWARD_RETURN',t:now,id:study.id,policy:CAPTURE_POLICY,netPnlPct:round(net),labelValid:study.labelValid});
  }
  if(study.exit){study.postMaxPrice=Math.max(study.postMaxPrice,price);study.postMinPrice=Math.min(study.postMinPrice,price);}
  const complete=study.exit?now>=study.followUntil:!study.entered&&study.entryMatured||now>=expiry;
  if(!complete)continue;
  const summary={id:study.id,symbol:study.symbol,tf:study.tf,policy:CAPTURE_POLICY,entryAt:study.entryAt,entryPrice:study.entryPrice,entered:study.entered,baselineDecision:study.baselineDecision,baseline:study.baseline,forwardNetPct:study.forwardNetPct??null,exit:study.exit||null,afterExitNetPct:study.exit?round(net):null,missedAfterExitPct:study.exit?round(Math.max(0,(study.postMaxPrice-study.exit.price)/study.entryPrice*100)):null,avoidedAfterExitPct:study.exit?round(Math.max(0,(study.exit.price-study.postMinPrice)/study.entryPrice*100)):null,observedMfePct:round((study.maxPrice/study.entryPrice-1)*100),observedMaePct:round((study.minPrice/study.entryPrice-1)*100),labelValid:study.labelValid===true,followupComplete:!!study.exit&&!study.gapped&&now-study.followUntil<=maxGap,completedAt:now};
  c.completed.push(summary);c.completed=c.completed.slice(-CAPTURE_TAIL);events.push({type:'CAPTURE_REVIEW',...summary});delete c.studies[study.id];
 }
 return {state,events};
}
function capturePublic(state,now=Date.now()){
 const c=state.capture;if(!c)return {policy:CAPTURE_POLICY,status:'WAIT_NEW_DECISIONS',samples:0};
 const entries=Object.entries(c.entryCells).map(([key,v])=>({key,...estimate(v,now,Number(key.split('|')[0])*2*60000)}));
 return {policy:c.policy,status:'PROSPECTIVE_SHADOW',startedAt:c.startedAt,samples:c.samples,studies:Object.keys(c.studies).length,unresolved:c.unresolved,capacitySkips:c.capacitySkips,staleStudiesPurged:c.staleStudiesPurged||0,entryEvidence:entries,completed:c.completed.slice(-40).reverse(),costPolicy:'OBSERVED_SPREAD_PLUS_IMPACT_SCENARIO',comparisonScope:'PAIRED_PER_TRADE_NOT_PORTFOLIO_ROI'};
}

module.exports={validateCaptureState,CAPTURE_POLICY,entryAdvice,advanceCapture,capturePublic,frameMinutes,SCHEMA,MODEL_VERSION,FEATURE_SCHEMA,FEATURES,OBS_RAM_MAX,DECISION_RAM_MAX,CLOSED_RAM_MAX,RECENT_RAM_MAX,initialState,normalizeState,open,observe,noteBaseline,compactForPersistence,publicState};
