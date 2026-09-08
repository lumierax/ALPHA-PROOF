'use strict';
const fs=require('fs'),path=require('path');
const RecoveryManager=require('./recovery-manager.js');
function atomic(file,obj){let tmp=file+'.tmp';fs.writeFileSync(tmp,JSON.stringify(obj));fs.renameSync(tmp,file)}
function createFoundation({dataDir,AdaptiveManager,appVersion,cohortId=null}){
 const root=path.join(dataDir,'adaptive-manager'),brainFile=path.join(root,'brain.json'),eventsFile=path.join(root,'events.jsonl');fs.mkdirSync(root,{recursive:true});const recovery=RecoveryManager.createVault({root,component:'ADAPTIVE_MANAGER_BRAIN',appVersion,cohortId,validatePayload:raw=>{if(!raw||typeof raw!=='object')return false;let b=raw.state&&typeof raw.state==='object'?raw.state:raw;if(b.modelVersion!==AdaptiveManager.MODEL_VERSION||!AdaptiveManager.validateCaptureState(b))return false;if(cohortId&&b.researchCohort?.id!==cohortId)return false;return true}});
 function load(fallback){let source='NEW',state=null,hadMain=fs.existsSync(brainFile),invalidReason=null;if(hadMain){try{let raw=JSON.parse(fs.readFileSync(brainFile,'utf8'));let b=raw.state||raw;if(b.modelVersion!==AdaptiveManager.MODEL_VERSION)throw Error('MODEL_MISMATCH');state=AdaptiveManager.normalizeState(b);source='BRAIN_FILE'}catch(e){invalidReason=e.message==='MODEL_MISMATCH'?'SCHEMA_CHANGE':'CORRUPT'}}if(!state&&(hadMain||recovery.validSlots().length)){let rr=recovery.restoreLatest(brainFile,{reason:invalidReason||'MAIN_MISSING'});if(rr.ok){state=AdaptiveManager.normalizeState(rr.payload.state||rr.payload);source=`RECOVERED_LOCAL_${rr.slot}`}else if(hadMain)throw Error('Adaptive Manager brain invalid and no verified local recovery checkpoint exists')}if(!state)state=AdaptiveManager.normalizeState(fallback||{});persist(state,source);return state}
 function persist(state,reason='UPDATE'){state=AdaptiveManager.compactForPersistence(state);let pack={schema:'alpha-proof-adaptive-foundation/1',appVersion,savedAt:Date.now(),reason,state};atomic(brainFile,pack);if(!cohortId||state.researchCohort?.id===cohortId)try{recovery.capture(pack,reason)}catch(e){console.error('adaptive recovery checkpoint',e.message)}return state}
 function append(ev){if(!ev)return;fs.appendFileSync(eventsFile,JSON.stringify({schema:'alpha-proof-adaptive-events/1',t:Number(ev.t)||Date.now(),...ev})+'\n')}
 function status(){let sz=f=>{try{return fs.statSync(f).size}catch{return 0}};return {brainBytes:sz(brainFile),eventsBytes:sz(eventsFile),recovery:recovery.status()}}
 return {root,brainFile,eventsFile,load,persist,append,status,recovery};
}
module.exports={createFoundation};
