/* Shared radar engine; independent of Lux admission and TP/SL. */
const RadarFlow=(()=>{
 const defaults={flowWindows:'15,60,240,360,720',flowMinQuote:150000,flowMinNet:50000,flowMinImpact:2,flowMinRelative:1.8,flowMinPressure:58,flowMinPersistence:55,flowMinMove:.12,flowMinScore:65,flowHoldSec:60,flowSwitchMargin:6,flowFreshSec:420};
 const num=(x,d=0)=>Number.isFinite(Number(x))?Number(x):d;
 const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
 const sum=a=>a.reduce((s,x)=>s+x,0);
 function config(c={}){let o={...defaults,...c};for(const k of Object.keys(defaults))if(k!=='flowWindows')o[k]=num(o[k],defaults[k]);o.flowWindows=[...new Set(String(o.flowWindows).split(',').map(Number).filter(x=>[5,15,30,60,120,240,360,720].includes(x)))];if(!o.flowWindows.length)o.flowWindows=[15,60,240,360,720];return o}
 function evaluate(bars,dir,c={},now=Date.now()){
  const C=config(c),sgn=dir==='SHORT'?-1:1;
  const all=bars.filter(b=>b.T<now&&[b.t,b.T,b.q,b.tbq,b.o,b.c].every(Number.isFinite)&&b.q>=0&&b.tbq>=0&&b.tbq<=b.q).sort((a,b)=>a.t-b.t);
  const delta=b=>sgn*(2*b.tbq-b.q),directional=b=>dir==='SHORT'?b.q-b.tbq:b.tbq;
  const fresh=all.length>0&&now-all.at(-1).T<=Math.max(60,C.flowFreshSec)*1000;
  const windows=[];
  for(const minutes of C.flowWindows){
   const count=minutes/5,tail=all.slice(-count),prior=all.slice(0,-count),history=prior.slice(-288);
   const complete=tail.length===count&&history.length>=12&&tail.every((b,i)=>!i||b.t-tail[i-1].t===300000);
   const volume=sum(tail.map(b=>b.q)),net=sum(tail.map(delta)),buy=(volume+net)/2;
   const priorRate=history.length?sum(history.map(b=>b.q))/(history.length*5):0;
   const priorDirectionalRate=history.length?sum(history.map(directional))/(history.length*5):0;
   const referenceRate=c.flowDirectionalReferenceRate==null?priorDirectionalRate:num(c.flowDirectionalReferenceRate);
   const directionalVolume=sum(tail.map(directional)),directionalRate=directionalVolume/minutes;
   const relative=referenceRate>0?directionalRate/referenceRate:0,impact=priorRate>0?net/(priorRate*1440)*100:0;
   const previous=prior.slice(-count),older=prior.slice(-count*2,-count);
   const previousRate=sum(previous.map(directional))/minutes,olderRate=sum(older.map(directional))/minutes;
   const speed=previous.length===count&&previousRate>0?(directionalRate/previousRate-1)*100/minutes:null;
   const previousSpeed=older.length===count&&olderRate>0?(previousRate/olderRate-1)*100/minutes:null;
   const acceleration=speed!=null&&previousSpeed!=null?(speed-previousSpeed)/minutes:null;
   const pressure=volume>0?buy/volume*100:50;
   const persistence=tail.length?tail.filter(b=>delta(b)>0&&directional(b)/5>=referenceRate).length/tail.length*100:0;
   const move=tail.length&&tail[0].o>0?sgn*(tail.at(-1).c/tail[0].o-1)*100:0;
   const recent=all.slice(-Math.min(3,count)),recentNet=sum(recent.map(delta)),recentV=sum(recent.map(b=>b.q));
   const recentRate=sum(recent.map(directional))/(Math.max(1,recent.length)*5),alive=recentNet>0&&referenceRate>0&&recentRate>=referenceRate;
   const priceHolding=recent.length&&sgn*(recent.at(-1).c/recent[0].o-1)*100>=-Math.max(.1,C.flowMinMove);
   const sufficient=volume>=Math.max(0,C.flowMinQuote)&&net>=Math.max(0,C.flowMinNet);
   const score=clamp(25*clamp(relative/Math.max(1,C.flowMinRelative*2),0,1)+25*clamp((pressure-50)/20,0,1)+15*persistence/100+15*clamp(impact/Math.max(.1,C.flowMinImpact*2),0,1)+10*clamp(move/Math.max(.1,C.flowMinMove*3),0,1)+10*(alive?1:0),0,100);
   const reason=!fresh?'بيانات قديمة':!complete||referenceRate<=0?'تاريخ غير مكتمل':!sufficient?'تدفق صغير':relative<C.flowMinRelative?'نشاط اتجاهي معتاد':impact<C.flowMinImpact?'أثر نسبي ضعيف':pressure<C.flowMinPressure?'الشراء والبيع متقاربان':persistence<C.flowMinPersistence?'ضغط غير مستمر':!alive?'الموجة هدأت':move<C.flowMinMove||!priceHolding?'السعر لا يؤكد التدفق':score<C.flowMinScore?'قوة غير كافية':'مؤهلة';
   windows.push({minutes,volume,directionalVolume,directionalRate,referenceRate,speed,acceleration,net,pressure,persistence,move,relative,impact,score,reason,eligible:reason==='مؤهلة',alive,priorRate,burstActive:relative>=C.flowMinRelative&&speed>0&&acceleration>0&&alive});
  }
  windows.sort((a,b)=>Number(b.eligible)-Number(a.eligible)||b.score-a.score);
  const best=windows[0];return {...best,windows,fresh,measuredAt:all.at(-1)?.T||0};
 }
 function select(rows,c,now){const C=config(c);const eligible=rows.filter(x=>x.flow?.eligible&&!x.riskFlag&&!x.dataStale&&x.notificationActive!==false&&x.monitorState!=='DORMANT'&&now-x.flow.measuredAt<=Math.max(60,C.flowFreshSec)*1000&&now-num(x.flowQualifiedSince,now)>=Math.max(0,C.flowHoldSec)*1000).sort((a,b)=>b.radarScore-a.radarScore);const best=eligible[0]||null,old=eligible.find(x=>x.isFeaturedNow);return old&&best&&best.radarScore<old.radarScore+Math.max(0,C.flowSwitchMargin)?old:best}
 return {defaults,config,evaluate,select};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=RadarFlow;
