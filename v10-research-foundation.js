'use strict';
const fs=require('fs'),path=require('path');
const RecoveryManager=require('./recovery-manager.js');
function atomic(file,obj){let tmp=file+'.tmp';fs.writeFileSync(tmp,JSON.stringify(obj));fs.renameSync(tmp,file)}
function createFoundation({dataDir,V10,appVersion,cohortId=null}){
 const root=path.join(dataDir,'v10-research'),brainFile=path.join(root,'brain.json'),eventsFile=path.join(root,'events.jsonl');fs.mkdirSync(root,{recursive:true});
 const valid=raw=>{let s=raw?.state||raw;return V10.validateState(s)&&(!cohortId||!s.researchCohort||s.researchCohort.id===cohortId)};
 const recovery=RecoveryManager.createVault({root,component:'V10_RESEARCH_BRAIN',appVersion,cohortId,validatePayload:valid});
 function load(){let s=null,source='NEW',had=fs.existsSync(brainFile),bad=null;if(had){try{let raw=JSON.parse(fs.readFileSync(brainFile,'utf8'));if(!valid(raw))throw Error('SCHEMA_CHANGE');s=V10.normalizeState(raw.state||raw);source='BRAIN_FILE'}catch(e){bad=e.message||'CORRUPT'}}if(!s&&(had||recovery.validSlots().length)){let rr=recovery.restoreLatest(brainFile,{reason:bad||'MAIN_MISSING'});if(rr.ok){s=V10.normalizeState(rr.payload.state||rr.payload);source=`RECOVERED_LOCAL_${rr.slot}`}else if(had)throw Error('V10 research brain invalid and no verified recovery checkpoint exists')}if(!s)s=V10.initialState();return persist(s,source)}
 function persist(state,reason='UPDATE'){state=V10.compactForPersistence(state);let pack={schema:'alpha-proof-v10-research-foundation/1',appVersion,savedAt:Date.now(),reason,state};atomic(brainFile,pack);try{recovery.capture(pack,reason)}catch(e){console.error('v10 research recovery checkpoint',e.message)}return state}
 function append(ev){if(!ev)return;fs.appendFileSync(eventsFile,JSON.stringify({schema:'alpha-proof-v10-events/1',t:Number(ev.t)||Date.now(),...ev})+'\n')}
 function status(state){let size=f=>{try{return fs.statSync(f).size}catch{return 0}};return {schema:'alpha-proof-v10-research-foundation/1',modelVersion:V10.MODEL_VERSION,brainBytes:size(brainFile),eventsBytes:size(eventsFile),activeStudies:Object.keys(state?.studies||{}).length,recovery:recovery.status()}}
 return {root,brainFile,eventsFile,load,persist,append,status,recovery};
}
module.exports={createFoundation};
