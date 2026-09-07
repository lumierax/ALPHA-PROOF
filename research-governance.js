'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const POLICY='CLEAN-PROSPECTIVE-1';
const ORIGINAL_CUTOFF=Date.parse('2026-09-06T11:50:00+03:00');
const OBJECTIVE=Object.freeze({id:'REPEATABLE_NET_ECONOMIC_EDGE',statement:'اكتشاف أفضلية اقتصادية مستقبلية قابلة للتكرار بعد جميع التكاليف، ومعرفة متى توجد ومتى لا توجد.',feePolicy:'SPOT_NO_BNB',roundTripFeePct:.20,proof:'FROZEN_THEN_PROSPECTIVE',calibrationIsProfit:false,realExecution:false});
function atomic(file,value){const tmp=file+'.tmp';fs.writeFileSync(tmp,JSON.stringify(value,null,2));fs.renameSync(tmp,file)}
function digest(file){const h=crypto.createHash('sha256'),fd=fs.openSync(file,'r'),b=Buffer.alloc(65536);try{let n;while((n=fs.readSync(fd,b,0,b.length,null)))h.update(b.subarray(0,n));return h.digest('hex')}finally{fs.closeSync(fd)}}
function createCohort(dataDir,now=Date.now(),expectedModels={}){
 const root=path.join(dataDir,'research-cohorts',POLICY),file=path.join(root,'manifest.json');fs.mkdirSync(root,{recursive:true});let manifest;
 if(fs.existsSync(file)){manifest=JSON.parse(fs.readFileSync(file,'utf8'));if(manifest.policy!==POLICY||!Number.isFinite(manifest.startedAt)||manifest.startedAt<ORIGINAL_CUTOFF)throw Error('Invalid research cohort manifest; preserved for recovery');}
 else{const original=path.join(dataDir,'state.json'),backup=path.join(root,'pre-cohort-runtime.json');if(fs.existsSync(original)&&!fs.existsSync(backup)){fs.copyFileSync(original,backup);if(digest(original)!==digest(backup))throw Error('Research audit backup verification failed')}
 manifest={policy:POLICY,id:crypto.randomUUID(),startedAt:Math.max(now,ORIGINAL_CUTOFF),originalV992Cutoff:ORIGINAL_CUTOFF,status:'PREPARING',legacyPolicy:'AUDIT_ONLY_NO_REPLAY',marketPolicy:'INDEPENDENT_MARKET_BRAIN_PRESERVED_NOT_CERTIFIED',objective:OBJECTIVE};atomic(file,manifest);}
 const brainFiles=['ai-foundation/brain.json','adaptive-manager/brain.json','omega-cortex/brain.json'];
 for(const rel of brainFiles){const p=path.join(root,rel);if(!fs.existsSync(p)){if(manifest.status==='READY')throw Error('Missing cohort brain; restore checkpoint before continuing: '+rel);continue}const raw=JSON.parse(fs.readFileSync(p,'utf8')),b=raw.brain||raw.state||raw;if(expectedModels[rel]&&b.modelVersion!==expectedModels[rel])throw Error('Incompatible cohort model; explicit migration required: '+rel);if(b.researchCohort?.id!==manifest.id)throw Error('Unverified cohort brain; preserved for recovery: '+rel)}
 return {root,manifest,bind(s){s.researchCohort={id:manifest.id,policy:POLICY,startedAt:manifest.startedAt};return s},ready(){manifest.status='READY';atomic(file,manifest)},publicState(){return {...manifest,objective:OBJECTIVE,legacyLearning:'QUARANTINED_IN_ORIGINAL_FILES',currentEvaluation:'DECISIONS_AND_ENTRIES_AFTER_COHORT_START',historicalV992Evaluation:'NOT_CERTIFIED_FROM_SOURCE_FILES',marketLearning:'INDEPENDENT_PRESERVED_UNAUDITED'}}};
}
function eligible(state,shadow,w,now=Date.now()){
 const c=state?.researchCohort;if(!c)return true;
 return shadow?.researchCohort?.id===c.id&&Number.isFinite(shadow.decidedAt)&&shadow.decidedAt>=c.startedAt&&shadow.decidedAt<=now&&Number.isFinite(w?.entryAt)&&w.entryAt>=c.startedAt&&w.entryAt<=shadow.decidedAt&&w.memoryEligible!==false&&w.quality!=='REJECTED'&&!shadow.outcome?.integrityReplay&&(!shadow.outcome||Number.isFinite(shadow.outcome.at)&&shadow.outcome.at>=shadow.decidedAt&&shadow.outcome.at<=now);
}
function validOutcome(shadow){const o=shadow?.outcome;return ['ENTER','SKIP'].includes(shadow?.finalDecision)&&o?.executionValid===true&&Number.isFinite(o.netPnlPct)&&Number.isFinite(o.grossMovePct)&&o.feePolicy==='SPOT_NO_BNB'&&o.totalFeesPct===.20&&Math.abs(o.netPnlPct-(o.grossMovePct-.20))<.00002&&o.winLabel===(o.netPnlPct>0?1:0);}
module.exports={validOutcome,POLICY,ORIGINAL_CUTOFF,OBJECTIVE,createCohort,eligible};
