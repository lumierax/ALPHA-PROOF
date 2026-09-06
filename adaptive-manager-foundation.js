'use strict';
const fs=require('fs'),path=require('path');
function atomic(file,obj){let tmp=file+'.tmp';fs.writeFileSync(tmp,JSON.stringify(obj));fs.renameSync(tmp,file)}
function createFoundation({dataDir,AdaptiveManager,appVersion}){
 const root=path.join(dataDir,'adaptive-manager'),brainFile=path.join(root,'brain.json'),eventsFile=path.join(root,'events.jsonl');fs.mkdirSync(root,{recursive:true});
 function load(fallback){let source='NEW',state=null;if(fs.existsSync(brainFile)){try{let raw=JSON.parse(fs.readFileSync(brainFile,'utf8'));state=AdaptiveManager.normalizeState(raw.state||raw);source='BRAIN_FILE'}catch(e){source='CORRUPT_FALLBACK'}}if(!state)state=AdaptiveManager.normalizeState(fallback||{});persist(state,source);return state}
 function persist(state,reason='UPDATE'){state=AdaptiveManager.compactForPersistence(state);atomic(brainFile,{schema:'alpha-proof-adaptive-foundation/1',appVersion,savedAt:Date.now(),reason,state});return state}
 function append(ev){if(!ev)return;fs.appendFileSync(eventsFile,JSON.stringify({schema:'alpha-proof-adaptive-events/1',t:Number(ev.t)||Date.now(),...ev})+'\n')}
 function status(){let sz=f=>{try{return fs.statSync(f).size}catch{return 0}};return {brainBytes:sz(brainFile),eventsBytes:sz(eventsFile)}}
 return {root,brainFile,eventsFile,load,persist,append,status};
}
module.exports={createFoundation};
