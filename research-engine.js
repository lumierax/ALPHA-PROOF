/* ALPHA PROOF consolidated research kernel. Exact research primitives, execution, runner and engine are co-located to reduce release files without removing behavior. */
'use strict';
const ResearchMath=(()=>{
'use strict';
const clamp=(x,a=-10,b=10)=>Math.max(a,Math.min(b,Number(x)||0));
const mean=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:0;
function quantile(a,p){if(!a.length)return null;let b=a.slice().sort((x,y)=>x-y),i=(b.length-1)*p,j=Math.floor(i);return b[j]+(b[Math.ceil(i)]-b[j])*(i-j)}
function model(d=8){return {w:Array(d).fill(0),updates:0,error:1}}
function predict(m,x){return m.w.reduce((s,w,i)=>s+w*(x[i]||0),0)}
function fit(m,x,y,rate=.015,weight=1){let e=predict(m,x)-y,den=1+x.reduce((s,v)=>s+v*v,0);m.w=m.w.map((w,i)=>clamp(w-rate*weight*(clamp(e,-20,20)*(x[i]||0)/den+.0001*w),-20,20));m.updates++;m.error=.99*m.error+.01*Math.abs(e);return e}
function correlation(a,b){let n=Math.min(a.length,b.length);if(n<12)return null;let aa=a.slice(-n),bb=b.slice(-n),ma=mean(aa),mb=mean(bb),xy=0,xx=0,yy=0;for(let i=0;i<n;i++){let x=aa[i]-ma,y=bb[i]-mb;xy+=x*y;xx+=x*x;yy+=y*y}return xx*yy>0?xy/Math.sqrt(xx*yy):null}
function distribution(rows){let a=rows.map(r=>r.y),paths=rows.filter(r=>r.pathValid!==false),hits=paths.filter(r=>r.hitMs!=null);return {n:a.length,pathN:paths.length,mean:mean(a),q10:quantile(a,.1),q50:quantile(a,.5),q90:quantile(a,.9),pPositive:mean(a.map(x=>+(x>0))),pTargetFirst:paths.length?mean(paths.map(r=>+(r.first==='TARGET'))):null,timeToTargetMs:quantile(hits.map(r=>r.hitMs),.5),mfe:paths.length?mean(paths.map(r=>r.mfe||0)):null,mae:paths.length?mean(paths.map(r=>r.mae||0)):null}}
// Empirical partial pooling: local -> frame/liquidity -> horizon population.
function pooled(rows,key){let global=rows.filter(r=>r.h===key.h),group=global.filter(r=>r.tf===key.tf&&r.liq===key.liq),local=group.filter(r=>r.symbol===key.symbol),g=distribution(global),wb=group.length/(group.length+32),wl=local.length/(local.length+24),weighted=[];
 for(let [set,mass] of [[global,(1-wb)*(1-wl)],[group,wb*(1-wl)],[local,wl]])for(let r of set)weighted.push({r,w:mass/set.length});
 let out={...g,globalN:global.length,groupN:group.length,localN:local.length};if(!weighted.length)return out;
 for(let k of ['mean','pPositive','pTargetFirst','mfe','mae']){let eligible=['pTargetFirst','mfe','mae'].includes(k)?weighted.filter(v=>v.r.pathValid!==false):weighted,total=eligible.reduce((sum,v)=>sum+v.w,0);out[k]=total?eligible.reduce((sum,{r,w})=>sum+w*(k==='mean'?r.y:k==='pPositive'?+(r.y>0):k==='pTargetFirst'?+(r.first==='TARGET'):(r[k]||0)),0)/total:null;}
 weighted.sort((a,b)=>a.r.y-b.r.y);for(let [k,p] of [['q10',.1],['q50',.5],['q90',.9]]){let total=0;out[k]=weighted[weighted.length-1].r.y;for(let v of weighted){total+=v.w;if(total>=p){out[k]=v.r.y;break}}}return out}
// Mixture: half uniform across regimes, half uniform across records; priority bounded.
function replay(rows,models,rng=Math.random,count=8){if(!rows.length)return [];let groups=[...new Set(rows.map(r=>r.regime))],sizes={};for(let r of rows)sizes[r.regime]=(sizes[r.regime]||0)+1;let weights=rows.map(r=>(.5/rows.length+.5/groups.length/sizes[r.regime])*Math.pow(.1+Math.min(5,Math.abs(predict(models[r.h],r.x)-r.y)),.6)),sum=weights.reduce((a,b)=>a+b,0),out=[];for(let k=0;k<Math.min(count,rows.length);k++){let u=rng()*sum,i=0;while(i<rows.length-1&&(u-=weights[i])>0)i++;let p=weights[i]/sum;out.push({row:rows[i],probability:p,importance:1/(rows.length*p)})}return out}
// Fixed mixture of predictable bets: Ville control across repeated looks, Bonferroni across 3 policies.
// Under H0 E[clipped block differential | past] <= 0, each factor has conditional mean <= 1.
const BETS=[.05,.1,.25,.5,.75,1],PROOF_BOUND=40;
function proofState(){return {schema:2,n:0,rawSum:0,clippedSum:0,tailClips:0,logWealth:BETS.map(()=>0),lastBlock:null}}
function updateProof(p,value,block){if(!Number.isFinite(value)||!Number.isSafeInteger(block)||block<0||p.lastBlock!=null&&block<=p.lastBlock)return false;let clipped=clamp(value,-PROOF_BOUND,PROOF_BOUND),z=clipped/PROOF_BOUND;p.n++;p.rawSum+=value;p.clippedSum+=clipped;p.tailClips+=+(value!==clipped);p.lastBlock=block;p.logWealth=p.logWealth.map((w,i)=>{let factor=1+BETS[i]*z;return w===null||factor<=0?null:w+Math.log1p(BETS[i]*z)});return true}
function proof(p,k=3,alpha=.05){
 if(Array.isArray(p)){let state=proofState();p.forEach((v,i)=>updateProof(state,v,i));p=state}
 let alive=p.logWealth.filter(x=>x!==null),max=alive.length?Math.max(...alive):null,logE=max===null?null:max+Math.log(alive.reduce((sum,v)=>sum+Math.exp(v-max),0))-Math.log(BETS.length),threshold=k/alpha;
 return {n:p.n,mean:p.n?p.clippedSum/p.n:0,rawMean:p.n?p.rawSum/p.n:0,lower:null,eValue:logE===null?0:Math.exp(Math.min(690,logE)),logEValue:logE,threshold,tailClips:p.tailClips,ready:logE!==null&&logE>=Math.log(threshold)&&p.n>=12&&p.rawSum>0&&p.tailClips===0,objective:'clipped daily portfolio differential; not a confidence percentage',assumption:'conditional non-positive bounded-utility null; no independence assumption; no automatic promotion'};
}
return {clamp,mean,quantile,model,predict,fit,correlation,distribution,pooled,replay,proof,proofState,updateProof,BETS,PROOF_BOUND};
})();
const ResearchExecution=(()=>{
'use strict';
const MAX_AGE_MS=5000,MAX_ROUNDTRIP_MS=3000;
function snapshot(raw,at,requestedAt=at){
 const side=(a,desc)=>Array.isArray(a)?a.map(x=>[+x[0],+x[1]]).filter(x=>Number.isFinite(x[0])&&Number.isFinite(x[1])&&x[0]>0&&x[1]>0).sort((a,b)=>desc?b[0]-a[0]:a[0]-b[0]).slice(0,100):[];
 let b={at,requestedAt,lastUpdateId:+raw?.lastUpdateId,bids:side(raw?.bids,true),asks:side(raw?.asks,false),valid:false};
 b.valid=Number.isFinite(at)&&Number.isFinite(requestedAt)&&at>=requestedAt&&at-requestedAt<=MAX_ROUNDTRIP_MS&&Number.isSafeInteger(b.lastUpdateId)&&b.lastUpdateId>=0&&b.bids.length>0&&b.asks.length>0&&b.bids[0][0]<b.asks[0][0];return b;
}
function delta(book,event,at){
 if(!book.valid)return book;
 if(!Number.isSafeInteger(+event.U)||!Number.isSafeInteger(+event.u)||+event.U>+event.u||at<book.at){book.valid=false;return book}
 if(+event.u<=book.lastUpdateId)return book;
 if(+event.U>book.lastUpdateId+1){book.valid=false;return book}
 for(let [field,k,desc] of [['bids','b',true],['asks','a',false]]){let m=new Map(book[field]);for(let x of event[k]||[]){let p=+x[0],q=+x[1];if(!(p>0)||!Number.isFinite(p)||q<0||!Number.isFinite(q)){book.valid=false;return book}if(q===0)m.delete(p);else m.set(p,q)}book[field]=[...m].sort((a,b)=>desc?b[0]-a[0]:a[0]-b[0]).slice(0,100)}
 book.at=at;book.requestedAt=at;book.lastUpdateId=+event.u;book.valid=book.bids.length>0&&book.asks.length>0&&book.bids[0][0]<book.asks[0][0];return book;
}
// A past book is never a future execution. The engine additionally enforces requestAt >= intentAt.
function fill(book,side,quantity,now,{fee=.001,latencyMs=0,volatilityPct=.05}={}){
 if(!['BUY','SELL'].includes(side)||!Number.isFinite(quantity)||!(quantity>0)||!book?.valid||now<book.at||now-book.at>MAX_AGE_MS)return {valid:false,reason:'MISSING_OR_STALE_DEPTH',filled:0};
 let levels=side==='BUY'?book.asks:book.bids,left=quantity,value=0,filled=0;
 for(let [p,q] of levels){let take=Math.min(left,q);value+=take*p;filled+=take;left-=take;if(left<=1e-12)break}
 if(!filled)return {valid:false,reason:'NO_LIQUIDITY',filled:0};
 let penalty=Math.max(0,volatilityPct)/100*Math.sqrt(Math.max(0,latencyMs)/1000),gross=value*(side==='BUY'?1+penalty:Math.max(0,1-penalty)),cash=side==='BUY'?gross*(1+fee):gross*(1-fee);
 return {valid:true,complete:left<=quantity*1e-9,filled,unfilled:Math.max(0,left),gross,fee:gross*fee,cash,average:gross/filled,latencyPenalty:Math.abs(gross-value),model:latencyMs?'DEPTH_PLUS_LATENCY_SCENARIO':'OBSERVED_POST_DECISION_DEPTH'};
}
function flow(trades,previous,mid,now){
 let last=previous?.lastId??-1,buy=0,sell=0,count=0,ordered=(trades||[]).slice().sort((a,b)=>+a.a-+b.a),firstNew=ordered.find(t=>+t.a>last&&+t.T<=now),gap=previous&&firstNew&&+firstNew.a>last+1;
 for(let t of ordered){if(+t.a<=last||+t.T>now||!Number.isFinite(+t.a))continue;let v=+t.p * +t.q;if(!(v>0)||!Number.isFinite(v)||typeof t.m!=='boolean')continue;last=+t.a;if(previous&&+t.T<previous.at)continue;if(t.m)sell+=v;else buy+=v;count++}
 let total=buy+sell,response=previous?.mid>0?(mid/previous.mid-1)*100:null,imbalance=total?(buy-sell)/total:0,coverage=gap?'GAP':previous?'OBSERVED_CONTIGUOUS':'INITIAL_PARTIAL';
 return {lastId:last,mid,at:now,buy,sell,count,imbalance,responsePct:response,impactPerMillion:total&&response!=null&&!gap?response/Math.max(total/1e6,.001):null,absorption:total&&response!=null&&!gap?Math.abs(imbalance)/(1+Math.abs(response)*100):null,coverage};
}
return {MAX_AGE_MS,MAX_ROUNDTRIP_MS,snapshot,delta,fill,flow};
})();
const ResearchRunner=(()=>{
'use strict';
function create({engine,getState,read,onSave=()=>{},onError=()=>{},isEnabled=()=>true,clock=Date.now,timers=globalThis}){
 let tokens=8,refillAt=clock(),active=new Map(),cooldown=new Map(),tickers=new Map(),timer=null,stopped=false,errors=0,completed=0,lastError=null;
 function save(critical){try{let job=onSave(getState(),{critical});if(job?.catch)job.catch(e=>{lastError=String(e.message||e);onError(e)})}catch(e){lastError=String(e.message||e);onError(e)}}
 function stats(){return {active:active.size,tokens,errors,completed,lastError,budgetRequestsPer30s:8,maxConcurrentSymbols:4}}
 async function request(path,signal){return read(path,{signal})}
 function launch(symbol,withTrades){let controller=new AbortController(),job={controller};active.set(symbol,job);let earliest=Math.max(0,...Object.values(getState().orders).filter(o=>o.symbol===symbol).map(o=>o.earliestAt)),delay=Math.max(0,earliest-clock());
  job.promise=(async()=>{if(delay)await new Promise(r=>{job.delay=timers.setTimeout(r,Math.min(delay,250))});if(controller.signal.aborted)return;let requestedAt=clock(),deadline=timers.setTimeout(()=>controller.abort(),3000),s=getState(),before=s.eventSeq;
   try{
    let depth=request('/api/v3/depth?symbol='+encodeURIComponent(symbol)+'&limit=100',controller.signal).then(raw=>{if(controller.signal.aborted||!isEnabled())return;let ok=engine.observeDepth(s,symbol,raw,null,clock(),requestedAt);if(!ok)throw Error('RESEARCH_DEPTH_REJECTED');save(s.events.some(e=>e.seq>before&&['SHADOW_BUY','SHADOW_SELL','PERIOD_CLOSED'].includes(e.type)))});
    let trades=withTrades?request('/api/v3/aggTrades?symbol='+encodeURIComponent(symbol)+'&limit=200',controller.signal).then(raw=>{if(!controller.signal.aborted&&isEnabled())engine.observeTrades(s,symbol,raw,clock())}):Promise.resolve();
    let result=await Promise.allSettled([depth,trades]);let failed=result.find(x=>x.status==='rejected');if(failed)throw failed.reason;
    completed++;cooldown.set(symbol,{until:clock()+10000,failures:0});save(false);
   }finally{timers.clearTimeout(deadline)}
  })().catch(e=>{if(stopped||!isEnabled())return;errors++;lastError=String(e.message||e);let failures=(cooldown.get(symbol)?.failures||0)+1;cooldown.set(symbol,{until:clock()+Math.min(300000,10000*Math.pow(2,Math.min(5,failures-1))),failures});onError(e)}).finally(()=>{active.delete(symbol);while(cooldown.size>200)cooldown.delete(cooldown.keys().next().value)});
 }
 function pump(currentTickers){if(currentTickers)tickers=currentTickers;if(stopped||!isEnabled())return stats();let now=clock();tokens=Math.min(8,tokens+Math.max(0,now-refillAt)*8/30000);refillAt=now;
  for(let symbol of engine.schedule(getState(),tickers,now)){if(active.size>=4)break;if(active.has(symbol)||(cooldown.get(symbol)?.until||0)>now)continue;let urgent=Object.values(getState().orders).some(o=>o.symbol===symbol),withTrades=!urgent&&tokens>=2,cost=withTrades?2:1;if(tokens<cost)break;tokens-=cost;launch(symbol,withTrades)}
  if(!timer){timer=timers.setInterval(()=>pump(),1000);if(timer?.unref)timer.unref()}return stats();
 }
 async function idle(){await Promise.allSettled([...active.values()].map(x=>x.promise))}
 function stop(){stopped=true;if(timer)timers.clearInterval(timer);timer=null;for(let job of active.values())job.controller.abort()}
 return {pump,stats,idle,stop};
}
return {create};
})();
const ResearchEngine=((M,E)=>{
'use strict';
const VERSION='RESEARCH-14-2',DAY=86400000,EPOCH=DAY,HORIZONS=[1,2,4],POLICIES=['HOLD','ECONOMIC','PARTIAL','STUDENT'];
const LIMITS={studies:64,labels:1200,markets:96,positions:16,events:1024,deepBudget:4,generations:8,orders:320,periods:32};
const copy=x=>JSON.parse(JSON.stringify(x));
const finite=x=>Number.isFinite(x);
function frame(tf){let m=/^(\d+)(m|h|d|w)$/.exec(String(tf||'').toLowerCase());return m?+m[1]*({m:60000,h:3600000,d:DAY,w:7*DAY}[m[2]]):3600000}
function newModels(){return Object.fromEntries(HORIZONS.map(h=>[h,M.model()]))}
function create(now=Date.now()){return {version:VERSION,startedAt:now,lastAt:now,studies:{},seen:[],labels:[],markets:{},models:newModels(),fast:newModels(),student:newModels(),ssl:M.model(),regime:{fast:0,slow:0,noise:.05,change:0,probabilities:[.25,.25,.25,.25]},uniqueEvidence:0,labelCount:0,replayUpdates:0,teacherUpdates:0,sslUpdates:0,rejected:0,capacityRejected:0,blocks:{},events:[],eventSeq:0,epoch:null,proof:Object.fromEntries(POLICIES.slice(1).map(k=>[k,M.proofState()])),epochs:0,lastEpoch:null,closedPeriods:[],scheduleCursor:0,orders:{},orderSeq:0,generations:{},generationSeq:0,currentGeneration:null,lastGenerationLabels:0,lastGenerationAt:0,migration:null}}
function validate(s){
 const obj=v=>!!v&&typeof v==='object'&&!Array.isArray(v),int=v=>Number.isSafeInteger(v)&&v>=0,vec=v=>Array.isArray(v)&&v.length===8&&v.every(finite),model=m=>obj(m)&&vec(m.w)&&int(m.updates)&&finite(m.error),models=m=>obj(m)&&HORIZONS.every(h=>model(m[h]));
 if(!obj(s)||s.version!==VERSION||!finite(s.startedAt)||s.startedAt<=0||!finite(s.lastAt)||s.lastAt<s.startedAt||!models(s.models)||!models(s.fast)||!models(s.student)||!model(s.ssl))return false;
 if(!['uniqueEvidence','labelCount','replayUpdates','teacherUpdates','sslUpdates','rejected','capacityRejected','eventSeq','scheduleCursor','epochs','orderSeq','generationSeq','lastGenerationLabels'].every(k=>int(s[k]))||!finite(s.lastGenerationAt))return false;
 for(let [key,limit] of [['studies',LIMITS.studies],['markets',LIMITS.markets],['blocks',366],['orders',LIMITS.orders],['generations',LIMITS.generations]])if(!obj(s[key])||Object.keys(s[key]).length>limit)return false;
 if(!Object.values(s.blocks).every(int)||!Array.isArray(s.seen)||s.seen.length>2048||!s.seen.every(x=>typeof x==='string')||!Array.isArray(s.events)||s.events.length>LIMITS.events||!s.events.every(e=>obj(e)&&int(e.seq)&&e.seq<=s.eventSeq&&finite(e.at)&&typeof e.type==='string'))return false;
 if(!Array.isArray(s.labels)||s.labels.length>LIMITS.labels||!s.labels.every(r=>vec(r.x)&&finite(r.y)&&HORIZONS.includes(r.h)&&r.featureAt>=s.startedAt&&r.due>r.featureAt&&r.observedAt>=r.due&&r.observedAt-r.due<=90000&&typeof r.pathValid==='boolean'))return false;
 if(!obj(s.regime)||!['fast','slow','noise','change'].every(k=>finite(s.regime[k]))||!Array.isArray(s.regime.probabilities)||s.regime.probabilities.length!==4||!s.regime.probabilities.every(x=>finite(x)&&x>=0&&x<=1)||Math.abs(s.regime.probabilities.reduce((a,b)=>a+b,0)-1)>1e-8)return false;
 if(!obj(s.proof)||!POLICIES.slice(1).every(k=>{let p=s.proof[k];return obj(p)&&p.schema===2&&int(p.n)&&finite(p.rawSum)&&finite(p.clippedSum)&&int(p.tailClips)&&Array.isArray(p.logWealth)&&p.logWealth.length===M.BETS.length&&p.logWealth.every(x=>x===null||finite(x))&&(p.lastBlock===null||int(p.lastBlock))}))return false;
 if(!Array.isArray(s.closedPeriods)||s.closedPeriods.length>LIMITS.periods)return false;
 for(let st of Object.values(s.studies))if(!obj(st)||!vec(st.x)||!finite(st.at)||st.at<s.startedAt||!(st.price>0)||!finite(st.ms)||st.ms<=0||!finite(st.lastAt)||typeof st.valid!=='boolean'||!Array.isArray(st.horizons)||st.horizons.length!==3||!st.horizons.every(h=>HORIZONS.includes(h.h)&&h.due===st.at+h.h*st.ms&&typeof h.done==='boolean'))return false;
 for(let m of Object.values(s.markets))if(!obj(m)||!Array.isArray(m.history)||m.history.length>96||!int(m.observations)||!m.history.every(h=>finite(h.t)&&finite(h.from)&&finite(h.r))||m.book&&(!Array.isArray(m.book.bids)||!Array.isArray(m.book.asks)||m.book.bids.length>100||m.book.asks.length>100))return false;
 for(let g of Object.values(s.generations))if(!obj(g)||!models(g.models)||!models(g.fast)||!models(g.student)||!model(g.ssl)||!finite(g.createdAt)||!Array.isArray(g.labels)||g.labels.length>LIMITS.labels||!g.labels.every(r=>finite(r.y)&&HORIZONS.includes(r.h)))return false;
 if(s.currentGeneration!==null&&!s.generations[s.currentGeneration])return false;
 if(s.epoch!==null){let e=s.epoch;if(!obj(e)||!int(e.id)||!finite(e.start)||!finite(e.end)||e.end<=e.start||typeof e.quality!=='boolean'||!obj(e.portfolios)||!obj(e.startEquities)||!int(e.admitted))return false;for(let k of POLICIES){let p=e.portfolios[k];if(!obj(p)||!finite(p.cash)||p.cash<-.000001||!finite(p.equity)||!finite(p.fees)||!finite(p.realized)||!obj(p.positions)||Object.keys(p.positions).length>LIMITS.positions||!finite(e.startEquities[k]))return false;for(let pos of Object.values(p.positions))if(!obj(pos)||!s.generations[pos.modelId]||!(pos.quantity>0)||!(pos.basis>=0)||!finite(pos.end)||!finite(pos.at)||!finite(pos.ms)||pos.end<=pos.at||!finite(pos.lastReview)||!int(pos.weak))return false}}
 for(let o of Object.values(s.orders))if(!obj(o)||!['BUY','SELL'].includes(o.side)||!finite(o.at)||!finite(o.earliestAt)||o.earliestAt<o.at||!s.generations[o.modelId]||o.side==='SELL'&&(!POLICIES.includes(o.policy)||!s.epoch?.portfolios[o.policy].positions[o.positionId]||!(o.remaining>0)))return false;
 function numbers(v){if(typeof v==='number')return finite(v);if(v&&typeof v==='object')return Object.values(v).every(numbers);return true}return numbers(s);
}
function validateLegacy(s){
 const vector=x=>Array.isArray(x)&&x.length===8&&x.every(finite),model=m=>m&&vector(m.w)&&finite(m.updates)&&finite(m.error),models=m=>m&&HORIZONS.every(h=>model(m[h]));
 if(!(s&&s.version==='RESEARCH-14-1'&&finite(s.startedAt)&&s.startedAt>0&&finite(s.lastAt)&&s.lastAt>=s.startedAt&&models(s.models)&&models(s.fast)&&models(s.student)&&model(s.ssl)&&Array.isArray(s.labels)&&s.labels.length<=LIMITS.labels&&Array.isArray(s.events)&&s.events.length<=LIMITS.events&&s.studies&&Object.keys(s.studies).length<=LIMITS.studies&&s.markets&&Object.keys(s.markets).length<=LIMITS.markets&&Array.isArray(s.seen)&&s.seen.length<=2048&&s.regime&&Array.isArray(s.regime.probabilities)&&s.regime.probabilities.length===4&&s.proof&&POLICIES.slice(1).every(k=>Array.isArray(s.proof[k])&&s.proof[k].length<=2048&&s.proof[k].every(finite))))return false;
 if(!['uniqueEvidence','labelCount','replayUpdates','teacherUpdates','sslUpdates','rejected','capacityRejected','eventSeq'].every(k=>finite(s[k])&&s[k]>=0))return false;
 if(!s.labels.every(r=>vector(r.x)&&finite(r.y)&&HORIZONS.includes(r.h)&&r.featureAt>=s.startedAt&&r.due>r.featureAt&&r.observedAt>=r.due))return false;
 if(!Object.values(s.studies).every(p=>vector(p.x)&&p.at>=s.startedAt&&p.price>0&&Array.isArray(p.horizons)&&p.horizons.length===3&&p.horizons.every(h=>HORIZONS.includes(h.h)&&h.due>p.at)))return false;
 if(s.epoch&&!(model(s.epoch.frozen?.ssl)&&models(s.epoch.frozen?.models)&&models(s.epoch.frozen?.fast)&&models(s.epoch.frozen?.student)&&Array.isArray(s.epoch.frozen?.labels)&&s.epoch.frozen.labels.length<=LIMITS.labels&&POLICIES.every(k=>s.epoch.portfolios?.[k]&&finite(s.epoch.portfolios[k].cash)&&Object.keys(s.epoch.portfolios[k].positions).length<=LIMITS.positions)))return false;
 function numbers(v){if(typeof v==='number')return finite(v);if(v&&typeof v==='object')return Object.values(v).every(numbers);return true}return !!(s.blocks&&typeof s.blocks==='object'&&!Array.isArray(s.blocks)&&Number.isSafeInteger(s.scheduleCursor)&&Number.isSafeInteger(s.epochs)&&s.events.every(e=>Number.isSafeInteger(e.seq))&&numbers(s));
}
function migrate(old,now=Date.now()){if(!validateLegacy(old))throw Error('RESEARCH14_LEGACY_INVALID');let s=create(now);s.migration={from:old.version,fromStartedAt:old.startedAt,at:now,legacyEvidence:old.uniqueEvidence,legacyLabels:old.labelCount,legacyOpenPositions:old.epoch?Object.values(old.epoch.portfolios).reduce((n,p)=>n+Object.keys(p.positions).length,0):0,archiveRequired:true,reason:'Execution and feature defects: preserve V1 as audit, start clean V2 evidence'};return s}
function event(s,type,now,data={}){s.events.push({seq:++s.eventSeq,type,at:now,...data});if(s.events.length>LIMITS.events)s.events.shift()}
function numeric(v,fallback){return v==null||v===''||!Number.isFinite(Number(v))?fallback:Number(v)}
function features(row,market,s,encoder=s.ssl){let flow=market?.flow,flowOK=flow?.coverage==='OBSERVED_CONTIGUOUS'&&s.lastAt-flow.at<=90000,x=[1,M.clamp(numeric(row.radarScore,50)/100,0,1),M.clamp(numeric(row.relativeVolume,1)/5,0,2),M.clamp(numeric(row.alignedPressure,50)/50-1,-1,1),flowOK?M.clamp(numeric(flow.imbalance,0)*(1-M.clamp(numeric(flow.absorption,0),0,.9)),-1,1):0,flowOK?M.clamp(numeric(flow.responsePct,0),-2,2):0,M.clamp(s.regime.fast,-2,2),M.clamp(s.regime.noise,0,2)];if(encoder)x[5]=M.clamp(M.predict(encoder,x),-2,2);return x}
function liquidity(q){return +q?.quoteVolume>=1e8?'HIGH':+q?.quoteVolume>=1e7?'MID':'LOW'}
function regime(s,returns){if(!returns.length)return;let r=M.mean(returns),g=s.regime;g.fast=.8*g.fast+.2*r;g.slow=.99*g.slow+.01*r;g.noise=Math.max(.005,.95*g.noise+.05*Math.abs(r-g.slow));g.change=Math.max(0,g.change+Math.abs(g.fast-g.slow)/g.noise-.8);let scores=[g.fast/g.noise,-g.fast/g.noise,1-Math.abs(g.fast)/g.noise,g.change/10],max=Math.max(...scores),p=scores.map(x=>Math.exp(M.clamp(x-max,-20,0))),sum=p.reduce((a,b)=>a+b,0);g.probabilities=p.map(x=>x/sum);if(g.change>25){event(s,'REGIME_CHANGE',s.lastAt,{distance:g.change});g.change=0}return g.probabilities.indexOf(Math.max(...g.probabilities))}
function forecast(s,key,x,frozen=null){let src=frozen||s,d=M.pooled(src.labels,key),slow=M.predict(src.models[key.h],x),fast=M.predict(src.fast[key.h],x),student=M.predict(src.student[key.h],x),emp=d.mean,fastWeight=.2+.4*(s.regime.probabilities[3]||0),teacher=.4*emp+(.6-fastWeight)*slow+fastWeight*fast;return {...d,slow,fast,student,teacher,uncertainty:Math.max(.05,(d.q90??1)-(d.q10??-1))/Math.sqrt(1+d.groupN/8),ready:d.globalN>=64&&d.groupN>=16}}
function cleanupGenerations(s){let used=new Set([s.currentGeneration,...Object.values(s.orders).map(o=>o.modelId)]);for(let p of Object.values(s.epoch?.portfolios||{}))for(let pos of Object.values(p.positions))used.add(pos.modelId);for(let id of Object.keys(s.generations))if(!used.has(id))delete s.generations[id]}
function buildGeneration(s,now){cleanupGenerations(s);if(s.currentGeneration&&(s.labelCount-s.lastGenerationLabels<16||now-s.lastGenerationAt<1800000))return s.currentGeneration;if(Object.keys(s.generations).length>=LIMITS.generations)return s.currentGeneration;let id='G'+(++s.generationSeq);s.generations[id]={id,createdAt:now,models:copy(s.models),fast:copy(s.fast),student:copy(s.student),ssl:copy(s.ssl),labels:s.labels.map(({h,tf,liq,symbol,y,mfe,mae,first,hitMs,pathValid})=>({h,tf,liq,symbol,y,mfe,mae,first,hitMs,pathValid}))};s.currentGeneration=id;s.lastGenerationLabels=s.labelCount;s.lastGenerationAt=now;event(s,'MODEL_FROZEN',now,{modelId:id,labels:s.labelCount});return id}
function startEpoch(s,now){let portfolios=s.epoch?.portfolios;if(!portfolios){portfolios={};for(let p of POLICIES)portfolios[p]={cash:10000,positions:{},fees:0,realized:0,equity:10000,valid:true,actions:0,markFresh:true}}
 s.epoch={id:++s.epochs,start:now,end:now+EPOCH,modelCutoff:now,version:VERSION,portfolios,startEquities:Object.fromEntries(POLICIES.map(k=>[k,portfolios[k].equity])),admitted:0,exposedAtStart:POLICIES.some(k=>Object.keys(portfolios[k].positions).length>0),quality:true};for(let p of Object.values(portfolios))p.valid=true;buildGeneration(s,now);event(s,'PERIOD_START',now,{id:s.epoch.id,capitalReset:false,end:s.epoch.end});
}
function register(s,shadow,row,now){let id=String(row?.cycleId||shadow?.id||'');if(!id||!shadow||!finite(+shadow.decidedAt)||row.dir!=='LONG'||+shadow.decidedAt<s.startedAt||+shadow.decidedAt>now||row.dataStale||!(+shadow.fillPrice>0)||s.studies[id]||s.seen.includes(id))return false;if(Object.keys(s.studies).length>=LIMITS.studies){s.capacityRejected++;return false}let tf=String(row.tf||'1h').toLowerCase(),ms=frame(tf),m=s.markets[row.symbol],x=features(row,m,s),p=+shadow.fillPrice;let st={id,symbol:row.symbol,tf,ms,at:now,price:p,lastAt:now,lastPrice:p,x:x.slice(),liq:m?.liq||'UNKNOWN',regime:s.regime.probabilities.indexOf(Math.max(...s.regime.probabilities)),horizons:HORIZONS.map(h=>({h,due:now+h*ms,done:false})),max:0,min:0,first:null,hitMs:null,valid:true,counted:false,portfolioTried:false};s.studies[id]=st;s.seen.push(id);if(s.seen.length>2048)s.seen.shift();event(s,'PATH_REGISTERED',now,{id,symbol:st.symbol,tf,featureAt:now,horizons:st.horizons.map(h=>h.due),x:st.x,price:st.price,liquidity:st.liq,regime:st.regime,version:VERSION});return true}
// Rotating exploration takes half the budget; the rest targets uncertainty and elapsed coverage.
function schedule(s,tickers,now){let entries=[...tickers].filter(([symbol,q])=>/USDT$/.test(symbol)&&+q.lastPrice>0&&+q.quoteVolume>=1e6).map(([symbol])=>symbol).sort();let pending=[...new Set([...Object.values(s.studies),...Object.values(s.orders)].map(p=>p.symbol))],universe=[...new Set([...pending,...entries])];if(!universe.length)return [];let held=new Set(Object.values(s.epoch?.portfolios||{}).flatMap(p=>Object.values(p.positions).map(p=>p.symbol)));let ranked=universe.map(symbol=>({symbol,score:(Object.values(s.orders).some(o=>o.symbol===symbol)?20:0)+(pending.includes(symbol)?3:0)+(held.has(symbol)?5:0)+Math.min(4,(now-(s.markets[symbol]?.depthAt||0))/60000)+(1/(1+(s.markets[symbol]?.observations||0)))+Math.min(2,Math.abs(M.predict(s.models[1],s.markets[symbol]?.x||[])-M.predict(s.fast[1],s.markets[symbol]?.x||[])))})).sort((a,b)=>b.score-a.score||a.symbol.localeCompare(b.symbol));let urgent=Object.keys(s.orders).length>0||s.epoch&&now>=s.epoch.end;let selected=ranked.slice(0,urgent?LIMITS.deepBudget:2).map(x=>x.symbol);for(let i=0;i<universe.length&&selected.length<LIMITS.deepBudget;i++){let sym=universe[(s.scheduleCursor+i)%universe.length];if(!selected.includes(sym))selected.push(sym)}s.scheduleCursor=(s.scheduleCursor+LIMITS.deepBudget)%universe.length;return selected}
function observeDepth(s,symbol,raw,trades,now,requestedAt=now){let book=E.snapshot(raw,now,requestedAt);if(!book.valid)return false;if(!s.markets[symbol]&&Object.keys(s.markets).length>=LIMITS.markets){let protectedSymbols=new Set([...Object.values(s.studies).map(p=>p.symbol),...Object.values(s.orders).map(p=>p.symbol)]);for(let port of Object.values(s.epoch?.portfolios||{}))for(let p of Object.values(port.positions))protectedSymbols.add(p.symbol);let victim=Object.keys(s.markets).filter(k=>!protectedSymbols.has(k)).sort((a,b)=>(s.markets[a].depthAt||0)-(s.markets[b].depthAt||0))[0];if(!victim)return false;delete s.markets[victim]}let m=s.markets[symbol]||(s.markets[symbol]={history:[],observations:0});m.book=book;m.depthAt=now;if(trades)observeTrades(s,symbol,trades,now);executeOrders(s,symbol,book,now);if(s.epoch){for(let p of Object.values(s.epoch.portfolios))marked(p,s,now);reviewPortfolios(s,now)}return true}
function observeTrades(s,symbol,trades,now){let m=s.markets[symbol];if(!m?.book?.valid||now-m.book.at>E.MAX_AGE_MS)return false;let mid=(m.book.bids[0][0]+m.book.asks[0][0])/2;m.flow=E.flow(trades,m.flow,mid,now);return true}
function teacherTarget(s,r){let d=M.pooled(s.labels.filter(x=>x.id!==r.id),r),slow=M.predict(s.models[r.h],r.x),fast=M.predict(s.fast[r.h],r.x);return .4*d.mean+.4*slow+.2*fast}
function mature(s,st,item,p,now){item.done=true;if(now-item.due>90000){s.rejected++;event(s,'LABEL_REJECTED',now,{id:st.id,h:item.h,reason:'ENDPOINT_NOT_OBSERVED_IN_TIME'});return}let y=(p/st.price-1)*100-.2;let r={id:st.id,h:item.h,tf:st.tf,symbol:st.symbol,liq:st.liq,regime:st.regime,x:st.x.slice(),featureAt:st.at,due:item.due,observedAt:now,y,mfe:st.max,mae:st.min,first:st.first,hitMs:st.hitMs,pathValid:st.valid,quality:st.valid?'OBSERVED_PATH_APPROXIMATION':'ENDPOINT_ONLY',targetKind:'MID_MINUS_FEES_NOT_EXECUTABLE'};
 if(!st.counted){s.uniqueEvidence++;st.counted=true;let b=String(Math.floor(st.at/DAY));s.blocks[b]=(s.blocks[b]||0)+1;let keys=Object.keys(s.blocks).sort();while(keys.length>366)delete s.blocks[keys.shift()]}
 // Prequential predictions and distillation targets computed before this record trains a teacher.
 let target=teacherTarget(s,r),before=M.predict(s.models[item.h],r.x);M.fit(s.student[item.h],r.x,target,.01);s.teacherUpdates++;
 M.fit(s.models[item.h],r.x,y,.01);M.fit(s.fast[item.h],r.x,y,.06);s.labels.push(r);if(s.labels.length>LIMITS.labels)s.labels.shift();s.labelCount++;event(s,'MATURE_LABEL',now,{id:st.id,h:item.h,y,predictionBefore:before,teacherTarget:target,featureAt:st.at,due:item.due,quality:r.quality,pathValid:r.pathValid,mfe:r.mfe,mae:r.mae,first:r.first,hitMs:r.hitMs});
}
function marked(port,s,now){let equity=port.cash,valid=true;for(let p of Object.values(port.positions)){let f=E.fill(s.markets[p.symbol]?.book,'SELL',p.quantity,now);if(f.valid&&f.complete){equity+=f.cash;p.mark=f.cash;p.markAt=now}else{equity+=p.mark??p.basis;valid=false}}port.equity=equity;port.markFresh=valid;return valid}
function correlationFor(s,a,b){let aa=s.markets[a]?.history||[],bb=s.markets[b]?.history||[],map=new Map(bb.map(x=>[x.from+'|'+x.t,x.r])),paired=aa.filter(x=>map.has(x.from+'|'+x.t));return M.correlation(paired.map(x=>x.r),paired.map(x=>map.get(x.from+'|'+x.t)))}
function openPortfolios(s,st,now){if(st.portfolioTried||!s.epoch)return;st.portfolioTried=true;if(st.ms<900000||now-st.at>60000||Object.keys(s.orders).length>=LIMITS.orders){event(s,'PORTFOLIO_SKIP',now,{id:st.id,reason:'HELPER_FRAME_OR_EXPIRED_OR_QUEUE_CAPACITY'});return}let modelId=buildGeneration(s,now),id='O'+(++s.orderSeq);s.orders[id]={id,side:'BUY',positionId:st.id,symbol:st.symbol,tf:st.tf,liq:st.liq,ms:st.ms,at:now,earliestAt:now+250,expiresAt:st.at+60000,end:st.at+4*st.ms,modelId};event(s,'BUY_INTENT',now,{id,positionId:st.id,symbol:st.symbol,modelId,end:st.at+4*st.ms})}
function executeOrders(s,symbol,book,now){if(!s.epoch)return;for(let o of Object.values(s.orders).filter(o=>o.symbol===symbol).sort((a,b)=>a.side===b.side?a.at-b.at:a.side==='SELL'?-1:1)){
 if(o.side==='BUY'&&now>o.expiresAt){event(s,'ORDER_EXPIRED',now,{id:o.id,reason:'NO_TIMELY_POST_DECISION_BOOK'});delete s.orders[o.id];continue}
 if(book.requestedAt<o.earliestAt||book.at<o.earliestAt)continue;
 if(o.side==='BUY'){
  let reference=s.epoch.portfolios.HOLD,existing=Object.values(reference.positions),correlated=existing.filter(p=>{let c=correlationFor(s,p.symbol,o.symbol);return c===null||c>.7}).length,reason=existing.some(p=>p.symbol===o.symbol)?'SYMBOL_CONCENTRATION':existing.length>=LIMITS.positions?'POSITION_CAPACITY':correlated>=4?'CORRELATED_OR_UNKNOWN_EXPOSURE':null;
  let budget=Math.min(500,...POLICIES.map(k=>s.epoch.portfolios[k].cash));if(budget<5)reason='CASH_CAPACITY';if(reason){event(s,'PORTFOLIO_SKIP',now,{id:o.positionId,reason});delete s.orders[o.id];continue}
  let quantity=budget/(book.asks[0][0]*1.002),f=E.fill(book,'BUY',quantity,now);
  if(!f.valid||!f.complete||f.cash>budget){event(s,'DEPTH_RETRY',now,{id:o.id,reason:'INSUFFICIENT_DEPTH'});continue}
  for(let policy of POLICIES){let port=s.epoch.portfolios[policy];port.cash-=f.cash;port.fees+=f.fee;port.positions[o.positionId]={id:o.positionId,symbol:o.symbol,tf:o.tf,liq:s.markets[symbol]?.liq||o.liq,ms:o.ms,at:now,end:o.end,quantity:f.filled,basis:f.cash,lastReview:now,weak:0,partial:false,mark:f.cash,markAt:now,modelId:o.modelId};event(s,'SHADOW_BUY',now,{policy,id:o.positionId,quantity:f.filled,cash:f.cash,entryPrice:f.average,intentAt:o.at,requestedAt:book.requestedAt,bookAt:book.at,modelId:o.modelId})}s.epoch.admitted++;delete s.orders[o.id];
 }else{
  let port=s.epoch.portfolios[o.policy],p=port.positions[o.positionId];if(!p){delete s.orders[o.id];continue}let requested=Math.min(o.remaining,p.quantity),f=E.fill(book,'SELL',requested,now);if(!f.valid||!f.filled)continue;let basis=p.basis*(f.filled/p.quantity);port.cash+=f.cash;port.fees+=f.fee;port.realized+=f.cash-basis;port.actions++;p.quantity-=f.filled;p.basis-=basis;o.remaining-=f.filled;
  event(s,'SHADOW_SELL',now,{policy:o.policy,id:p.id,quantity:f.filled,cash:f.cash,exitPrice:f.average,realized:f.cash-basis,reason:o.reason,intentAt:o.at,requestedAt:book.requestedAt,bookAt:book.at,complete:f.complete});
  if(p.quantity<1e-10)delete port.positions[p.id];else if(o.fraction<1)p.partial=true;if(o.remaining<1e-10||!port.positions[p.id])delete s.orders[o.id];
 }
}}
function stoppingAction(f,policy,position,now){if(now>=position.end)return {action:'EXIT',fraction:1,reason:'COMMON_HORIZON'};if(policy==='HOLD'||!f.ready)return {action:'HOLD',fraction:0,reason:!f.ready?'INSUFFICIENT_EVIDENCE':'FROZEN_REFERENCE'};
 // Forecast is incremental mid return minus round-trip fees. A held position owes only exit fees,
 // already in both alternatives, so add back the .20 training convention. Do not charge entry twice.
 let gain=(policy==='STUDENT'?f.student:f.teacher)+.2,risk=.25*Math.max(0,-f.q10)+f.uncertainty,hold=gain-risk,exit=0,partial=.5*gain-.25*risk-.02;
 if(hold<exit-.05)position.weak++;else position.weak=0;
 if(position.weak<2)return {action:'HOLD',fraction:0,reason:'HYSTERESIS',hold,exit,partial};
 if(policy==='PARTIAL'&&!position.partial&&partial>Math.max(exit,hold)+.02)return {action:'PARTIAL',fraction:.5,reason:'REDUCE_DOWNSIDE',hold,exit,partial};return {action:'EXIT',fraction:1,reason:'INCREMENTAL_UTILITY_NEGATIVE',hold,exit,partial};
}
function reviewPortfolios(s,now){let epoch=s.epoch;if(!epoch)return;
 for(let policy of POLICIES){let port=epoch.portfolios[policy];for(let p of Object.values(port.positions)){
  if(Object.values(s.orders).some(o=>o.side==='SELL'&&o.policy===policy&&o.positionId===p.id))continue;
  if(now<p.end&&now-p.lastReview<Math.max(120000,p.ms/4))continue;
  let market=s.markets[p.symbol],frozen=s.generations[p.modelId];if(now<p.end&&(!market?.at||now-market.at>90000))continue;
  let remaining=(p.end-now)/p.ms,h=HORIZONS.reduce((a,b)=>Math.abs(b-remaining)<Math.abs(a-remaining)?b:a,1),x=features(market?.row||{},market,s,frozen.ssl),f=forecast(s,{symbol:p.symbol,tf:p.tf,liq:p.liq,h},x,frozen),action=stoppingAction(f,policy,p,now);p.lastReview=now;
  event(s,'SHADOW_REVIEW',now,{policy,id:p.id,modelId:p.modelId,...action,horizonModel:h,remainingFrames:remaining});
  if(action.fraction>0&&Object.keys(s.orders).length<LIMITS.orders){let id='O'+(++s.orderSeq);s.orders[id]={id,side:'SELL',policy,positionId:p.id,symbol:p.symbol,at:now,earliestAt:now+250,remaining:p.quantity*action.fraction,fraction:action.fraction,modelId:p.modelId,reason:action.reason};event(s,'SELL_INTENT',now,{id,policy,positionId:p.id,reason:action.reason})}
 }marked(port,s,now)}
 // Model periods never own or delete positions. Missing terminal marks exclude evidence, not capital.
 if(now>=epoch.end){let fresh=POLICIES.every(k=>epoch.portfolios[k].markFresh);if(!fresh&&now-epoch.end<=90000)return;
  let valid=fresh&&epoch.quality&&now-epoch.end<=90000,result={id:epoch.id,start:epoch.start,end:now,valid,admitted:epoch.admitted,portfolios:Object.fromEntries(POLICIES.map(k=>{let p=epoch.portfolios[k];return [k,{cash:p.cash,equity:p.equity,returnPct:(p.equity-epoch.startEquities[k])/10000*100,totalReturnPct:(p.equity/10000-1)*100,fees:p.fees,realized:p.realized,positions:Object.keys(p.positions).length}]}))};
  if(valid&&(epoch.exposedAtStart||epoch.admitted||POLICIES.some(k=>Object.keys(epoch.portfolios[k].positions).length)))for(let k of POLICIES.slice(1))M.updateProof(s.proof[k],result.portfolios[k].returnPct-result.portfolios.HOLD.returnPct,epoch.id);
  s.lastEpoch=result;s.closedPeriods.push(result);if(s.closedPeriods.length>LIMITS.periods)s.closedPeriods.shift();event(s,'PERIOD_CLOSED',now,result);startEpoch(s,now);if(!fresh)s.epoch.quality=false;
 }
}
function advance(s,tickers,rows={},now=Date.now()){if(now<=s.lastAt)return s;if(!s.epoch)startEpoch(s,now);let previousAt=s.lastAt;if(now-previousAt>90000&&Object.values(s.epoch.portfolios).some(p=>Object.keys(p.positions).length))s.epoch.quality=false;s.lastAt=now;let tracked=new Set([...Object.values(s.studies).map(p=>p.symbol),...Object.keys(s.markets)]),returns=[];for(let symbol of tracked){let q=tickers.get(symbol),price=+q?.lastPrice;if(!(price>0))continue;let m=s.markets[symbol]||(s.markets[symbol]={history:[],observations:0}),r=m.price>0?(price/m.price-1)*100:0;let row=rows[symbol]||m.row||{},rawX=features(row,m,s,null);if(m.rawX&&m.at>=s.startedAt&&now-m.at<=90000){M.fit(s.ssl,m.rawX,M.clamp(r/Math.max((now-m.at)/60000,.01),-5,5),.02);s.sslUpdates++}m.rawX=rawX;m.row={radarScore:row.radarScore,relativeVolume:row.relativeVolume,alignedPressure:row.alignedPressure};m.x=features(row,m,s);m.price=price;m.at=now;m.liq=liquidity(q);m.observations++;if(m.previousAt!=null&&now-m.previousAt<=90000)m.history.push({from:m.previousAt,t:now,r});m.previousAt=now;if(m.history.length>96)m.history.shift();returns.push(r)}regime(s,returns);
 for(let st of Object.values(s.studies)){if(now<st.at)continue;let q=tickers.get(st.symbol),p=+q?.lastPrice;if(!(p>0)){if(now-st.lastAt>90000)st.valid=false;if(now>=st.at+4*st.ms+90000){s.rejected+=st.horizons.filter(h=>!h.done).length;event(s,'PATH_EXPIRED',now,{id:st.id,reason:'MISSING_PRICE'});delete s.studies[st.id]}continue}if(now-st.lastAt>90000)st.valid=false;let move=(p/st.price-1)*100;st.max=Math.max(st.max,move);st.min=Math.min(st.min,move);if(!st.first&&(move>=3||move<=-2)){st.first=move>=3?'TARGET':'LOSS';if(move>=3)st.hitMs=now-st.at}st.lastAt=now;st.lastPrice=p;openPortfolios(s,st,now);for(let item of st.horizons)if(!item.done&&now>=item.due)mature(s,st,item,p,now);if(st.horizons.every(h=>h.done))delete s.studies[st.id]}
 for(let o of Object.values(s.orders))if(o.side==='BUY'&&now>o.expiresAt){event(s,'ORDER_EXPIRED',now,{id:o.id,reason:'NO_TIMELY_POST_DECISION_BOOK'});delete s.orders[o.id]}
 for(let sample of M.replay(s.labels,s.models,Math.random,8)){M.fit(s.models[sample.row.h],sample.row.x,sample.row.y,.005,sample.importance);s.replayUpdates++}reviewPortfolios(s,now);
 cleanupGenerations(s);let protectedSymbols=new Set([...Object.values(s.studies).map(p=>p.symbol),...Object.values(s.orders).map(p=>p.symbol)]);for(let p of Object.values(s.epoch?.portfolios||{}))for(let pos of Object.values(p.positions))protectedSymbols.add(pos.symbol);let keys=Object.keys(s.markets).sort((a,b)=>(s.markets[a].at||0)-(s.markets[b].at||0));for(let key of keys){if(Object.keys(s.markets).length<=LIMITS.markets)break;if(!protectedSymbols.has(key))delete s.markets[key]}
 if(now-previousAt>90000)event(s,'OBSERVATION_GAP',now,{gapMs:now-previousAt});return s;
}
function publicState(s){return {version:VERSION,mode:'PROSPECTIVE_SHADOW_ONLY',automaticPromotion:false,startedAt:s.startedAt,migration:s.migration,uniqueEvidence:s.uniqueEvidence,labelCount:s.labelCount,independentTimeBlocks:Object.keys(s.blocks).length,replayUpdates:s.replayUpdates,teacherUpdates:s.teacherUpdates,sslUpdates:s.sslUpdates,rejected:s.rejected,capacityRejected:s.capacityRejected,pending:Object.keys(s.studies).length,pendingOrders:Object.keys(s.orders).length,regime:s.regime,proof:Object.fromEntries(POLICIES.slice(1).map(k=>[k,M.proof(s.proof[k])])),portfolios:s.epoch?Object.fromEntries(POLICIES.map(k=>{let p=s.epoch.portfolios[k];return [k,{equity:p.equity,cash:p.cash,realized:p.realized,totalPnl:p.equity-10000,totalReturnPct:(p.equity/10000-1)*100,unrealized:p.equity-p.cash-Object.values(p.positions).reduce((a,b)=>a+b.basis,0),fees:p.fees,positions:Object.keys(p.positions).length,valid:p.valid,markFresh:p.markFresh===true}]})):null,epoch:s.epoch?{id:s.epoch.id,start:s.epoch.start,end:s.epoch.end,modelCutoff:s.lastGenerationAt,quality:s.epoch.quality,capitalReset:false}:null,lastEpoch:s.lastEpoch,periods:s.closedPeriods.slice(-7),distributions:HORIZONS.map(h=>({h,...M.distribution(s.labels.filter(r=>r.h===h))})),recent:s.events.slice(-24)}}
return {VERSION,LIMITS,HORIZONS,POLICIES,frame,create,validate,validateLegacy,migrate,register,schedule,observeDepth,observeTrades,advance,forecast,stoppingAction,publicState,features,startEpoch,reviewPortfolios,correlationFor};
})(ResearchMath,ResearchExecution);
ResearchEngine.Math=ResearchMath;
ResearchEngine.Execution=ResearchExecution;
ResearchEngine.Runner=ResearchRunner;
module.exports=ResearchEngine;
