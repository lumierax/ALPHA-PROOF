'use strict';
const fs=require('fs'),path=require('path'),os=require('os');
function safeStat(file){try{return fs.statSync(file)}catch{return null}}
function fileBytes(file){let s=safeStat(file);return s&&s.isFile()?s.size:0}
function dirBytes(root){let total=0;function walk(p){let st=safeStat(p);if(!st)return;if(st.isFile()){total+=st.size;return}if(!st.isDirectory())return;let names=[];try{names=fs.readdirSync(p)}catch{return}for(const n of names)walk(path.join(p,n))}walk(root);return total}
function cgroupLimit(){for(const f of ['/sys/fs/cgroup/memory.max','/sys/fs/cgroup/memory/memory.limit_in_bytes']){try{let raw=String(fs.readFileSync(f,'utf8')).trim();if(raw&&raw!=='max'){let n=Number(raw);if(Number.isFinite(n)&&n>0&&n<2**53)return n}}catch{}}return os.totalmem()}
function volumeTotal(root){try{let s=fs.statfsSync(root);return Number(s.blocks)*Number(s.bsize)}catch{return null}}
function createTieredMemory({dataDir,stateFile,aiFoundation,marketAiFoundation,learningForgeFoundation,adaptiveFoundation,coldRuntime}){
 const totals={capturedAt:Date.now(),ramLimitBytes:cgroupLimit(),volumeTotalBytes:volumeTotal(dataDir)};
 function breakdown(){
  let mu=process.memoryUsage(),stateBytes=fileBytes(stateFile),labMemory=dirBytes(path.join(dataDir,'lab-memory')),ai=dirBytes(aiFoundation?.root||path.join(dataDir,'ai-foundation')),market=dirBytes(path.join(dataDir,'market-ai-foundation')),cortex=dirBytes(learningForgeFoundation?.root||path.join(dataDir,'omega-cortex')),adaptive=dirBytes(adaptiveFoundation?.root||path.join(dataDir,'adaptive-manager')),coldRuntimeBytes=dirBytes(path.join(dataDir,'cold-runtime')),integrity=['integrity-raw-backup-v9.5','integrity-replay-net-pnl.json','integrity-sanitize-net-pnl.json'].reduce((a,n)=>a+dirBytes(path.join(dataDir,n)),0),known=stateBytes+labMemory+ai+market+cortex+adaptive+coldRuntimeBytes+integrity,totalUsed=dirBytes(dataDir),other=Math.max(0,totalUsed-known);
  return {measuredAt:Date.now(),totals,ram:{rssBytes:mu.rss,heapUsedBytes:mu.heapUsed,heapTotalBytes:mu.heapTotal,externalBytes:mu.external,arrayBuffersBytes:mu.arrayBuffers||0,remainingToLimitBytes:totals.ramLimitBytes?Math.max(0,totals.ramLimitBytes-mu.rss):null},storage:{usedBytes:totalUsed,remainingBytes:totals.volumeTotalBytes!=null?Math.max(0,totals.volumeTotalBytes-totalUsed):null,parts:{runtimeState:stateBytes,labDataset:labMemory,tradeAI:ai,marketAI:market,cortex,adaptiveManager:adaptive,coldRuntime:coldRuntimeBytes,integrityAudit:integrity,other}}};
 }
 return {totals,breakdown,dirBytes,fileBytes};
}
module.exports={createTieredMemory,dirBytes,fileBytes,cgroupLimit,volumeTotal};
