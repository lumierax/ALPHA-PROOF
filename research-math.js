/* Research primitives: bounded storage; no replay or teacher target counts as new evidence. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.ResearchMath=factory()})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const clamp=(x,a=-10,b=10)=>Math.max(a,Math.min(b,Number(x)||0));
const mean=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:0;
function quantile(a,p){if(!a.length)return null;let b=a.slice().sort((x,y)=>x-y),i=(b.length-1)*p,j=Math.floor(i);return b[j]+(b[Math.ceil(i)]-b[j])*(i-j)}
function model(d=8){return {w:Array(d).fill(0),updates:0,error:1}}
function predict(m,x){return m.w.reduce((s,w,i)=>s+w*(x[i]||0),0)}
function fit(m,x,y,rate=.015,weight=1){let e=predict(m,x)-y,den=1+x.reduce((s,v)=>s+v*v,0);m.w=m.w.map((w,i)=>clamp(w-rate*weight*(clamp(e,-20,20)*(x[i]||0)/den+.0001*w),-20,20));m.updates++;m.error=.99*m.error+.01*Math.abs(e);return e}
function correlation(a,b){let n=Math.min(a.length,b.length);if(n<12)return null;let aa=a.slice(-n),bb=b.slice(-n),ma=mean(aa),mb=mean(bb),xy=0,xx=0,yy=0;for(let i=0;i<n;i++){let x=aa[i]-ma,y=bb[i]-mb;xy+=x*y;xx+=x*x;yy+=y*y}return xx*yy>0?xy/Math.sqrt(xx*yy):null}
function distribution(rows){let a=rows.map(r=>r.y);return {n:a.length,mean:mean(a),q10:quantile(a,.1),q50:quantile(a,.5),q90:quantile(a,.9),pPositive:mean(a.map(x=>+(x>0))),pTargetFirst:mean(rows.map(r=>+(r.first==='TARGET'))),timeToTargetMs:quantile(rows.filter(r=>r.hitMs!=null).map(r=>r.hitMs),.5),mfe:mean(rows.map(r=>r.mfe||0)),mae:mean(rows.map(r=>r.mae||0))}}
// Empirical partial pooling: local -> frame/liquidity -> horizon population.
function pooled(rows,key){let global=rows.filter(r=>r.h===key.h),group=global.filter(r=>r.tf===key.tf&&r.liq===key.liq),local=group.filter(r=>r.symbol===key.symbol),g=distribution(global),wb=group.length/(group.length+32),wl=local.length/(local.length+24),weighted=[];
 for(let [set,mass] of [[global,(1-wb)*(1-wl)],[group,wb*(1-wl)],[local,wl]])for(let r of set)weighted.push({r,w:mass/set.length});
 let out={...g,globalN:global.length,groupN:group.length,localN:local.length};if(!weighted.length)return out;
 for(let k of ['mean','pPositive','pTargetFirst','mfe','mae'])out[k]=weighted.reduce((sum,{r,w})=>sum+w*(k==='mean'?r.y:k==='pPositive'?+(r.y>0):k==='pTargetFirst'?+(r.first==='TARGET'):(r[k]||0)),0);
 weighted.sort((a,b)=>a.r.y-b.r.y);for(let [k,p] of [['q10',.1],['q50',.5],['q90',.9]]){let total=0;out[k]=weighted[weighted.length-1].r.y;for(let v of weighted){total+=v.w;if(total>=p){out[k]=v.r.y;break}}}return out}
// Mixture: half uniform across regimes, half uniform across records; priority bounded.
function replay(rows,models,rng=Math.random,count=8){if(!rows.length)return [];let groups=[...new Set(rows.map(r=>r.regime))],sizes={};for(let r of rows)sizes[r.regime]=(sizes[r.regime]||0)+1;let weights=rows.map(r=>(.5/rows.length+.5/groups.length/sizes[r.regime])*Math.pow(.1+Math.min(5,Math.abs(predict(models[r.h],r.x)-r.y)),.6)),sum=weights.reduce((a,b)=>a+b,0),out=[];for(let k=0;k<Math.min(count,rows.length);k++){let u=rng()*sum,i=0;while(i<rows.length-1&&(u-=weights[i])>0)i++;let p=weights[i]/sum;out.push({row:rows[i],probability:p,importance:1/(rows.length*p)})}return out}
// Alpha spending across 3 registered challengers and repeated looks. Bounded weekly blocks.
function proof(values,k=3,alpha=.05){let n=values.length;if(!n)return {n:0,lower:null,ready:false};let clipped=values.map(x=>clamp(x,-40,40)),level=alpha/(k*n*(n+1)),radius=80*Math.sqrt(Math.log(1/level)/(2*n)),lower=mean(clipped)-radius;return {n,mean:mean(clipped),rawMean:mean(values),lower,alphaAtLook:level,tailClips:values.filter(x=>Math.abs(x)>40).length,ready:lower>0&&n>=12,assumption:'bounded conditional block-mean null; market dependence can invalidate interpretation'}}
return {clamp,mean,quantile,model,predict,fit,correlation,distribution,pooled,replay,proof};
});
