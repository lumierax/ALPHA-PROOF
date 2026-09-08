'use strict';
const fs=require('fs'),path=require('path'),os=require('os');
function tailJsonLines(file,max=200,readBytes=1024*1024){
 try{let st=fs.statSync(file);if(!st.size)return[];let size=Math.min(st.size,readBytes),fd=fs.openSync(file,'r'),buf=Buffer.allocUnsafe(size);try{fs.readSync(fd,buf,0,size,st.size-size)}finally{fs.closeSync(fd)}let txt=buf.toString('utf8');if(st.size>size)txt=txt.slice(txt.indexOf('\n')+1);return txt.split('\n').filter(Boolean).slice(-max).map(x=>{try{return JSON.parse(x)}catch{return null}}).filter(Boolean)}catch{return[]}
}
function createColdRuntimeStore({dataDir}){const root=path.join(dataDir,'cold-runtime'),closedFile=path.join(root,'closed.jsonl');fs.mkdirSync(root,{recursive:true});
 function appendClosed(x){if(x)fs.appendFileSync(closedFile,JSON.stringify(x)+'\n')}
 function recentClosed(max=200){return tailJsonLines(closedFile,max)}
 function clearClosed(){try{fs.writeFileSync(closedFile,'')}catch{}}
 function status(){let size=0;try{size=fs.statSync(closedFile).size}catch{}return{closedBytes:size}}
 return{root,closedFile,appendClosed,recentClosed,clearClosed,status};}
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
module.exports={createTieredMemory,createColdRuntimeStore,tailJsonLines,dirBytes,fileBytes,cgroupLimit,volumeTotal};
