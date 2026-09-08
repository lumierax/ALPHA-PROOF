'use strict';
const fs=require('fs'),path=require('path'),R=require('./recovery-manager'),Engine=require('./research-engine');
function createFoundation(dataDir){
 const root=path.join(dataDir,'research-14'),main=path.join(root,'brain.json'),ready=path.join(root,'INITIALIZED.json'),events=path.join(root,'events.jsonl'),archives=path.join(root,'legacy-audit');fs.mkdirSync(root,{recursive:true});
 const accepted=p=>Engine.validate(p)||Engine.validateLegacy(p),recovery=R.createVault({root,component:'research14',appVersion:Engine.VERSION,validatePayload:accepted});let lastEvent=0,lastSavedAt=0,lastHash=null;
 function readMain(){try{let w=JSON.parse(fs.readFileSync(main,'utf8'));if(!Number.isSafeInteger(w.sequence)||w.sequence<1||w.sha256!==R.sha256Text(JSON.stringify(w.payload))||!accepted(w.payload))return null;return w}catch{return null}}
 function persist(state,{critical=true}={}){
  if(!Engine.validate(state))throw Error('RESEARCH14_INVALID_STATE');
  const fresh=state.events.filter(e=>e.seq>lastEvent);if(fresh.length||!fs.existsSync(events))fs.appendFileSync(events,fresh.length?fresh.map(e=>JSON.stringify({...e,cohort:state.startedAt})).join('\n')+'\n':'');lastEvent=state.eventSeq;
  if(!critical&&Date.now()-lastSavedAt<30000)return state;
  const text=JSON.stringify(state),hash=R.sha256Text(text);if(hash===lastHash)return state;
  const slot=recovery.capture(state,'RESEARCH14_SAVE');R.atomicJson(main,{sequence:slot.sequence,sha256:hash,payload:state});R.atomicJson(ready,{version:Engine.VERSION,startedAt:state.startedAt});lastSavedAt=Date.now();lastHash=hash;return state;
 }
 function adopt(payload){
  if(Engine.validateLegacy(payload)){
   const text=JSON.stringify(payload),hash=R.sha256Text(text),file=path.join(archives,'research14-v1-'+payload.startedAt+'-'+hash+'.json');
   if(!fs.existsSync(file))R.atomicJson(file,{sha256:hash,payload});
   const next=Engine.migrate(payload,Date.now());next.migration.archiveFile=path.basename(file);lastEvent=0;persist(next);lastHash=null;persist(next);return next;
  }
  lastEvent=payload.eventSeq;lastHash=R.sha256Text(JSON.stringify(payload));lastSavedAt=Date.now();return payload;
 }
 function load(){let m=readMain(),best=recovery.validSlots()[0];if(m&&(!best||m.sequence>=best.sequence))return adopt(m.payload);
  if(best){R.atomicJson(main,{sequence:best.sequence,sha256:best.payloadSha256,payload:best.payload});recovery.writeManifest({lastRecovery:{slot:best.slot,sequence:best.sequence,recoveredAt:Date.now(),reason:'RESEARCH14_MAIN_INVALID_OR_OLDER'}});return adopt(best.payload)}
  if(fs.existsSync(main)||fs.existsSync(ready)||fs.existsSync(recovery.manifestFile)||fs.existsSync(events)){recovery.restoreLatest(main,{reason:'RESEARCH14_ALL_COPIES_INVALID'});throw Error('RESEARCH14_RECOVERY_REQUIRED: existing research is never silently reset')}
  let state=Engine.create();persist(state);lastHash=null;persist(state);return state;
 }
 return {root,main,events,ready,archives,recovery,load,persist};
}
module.exports={createFoundation};
