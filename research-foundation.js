'use strict';
const fs=require('fs'),path=require('path'),R=require('./recovery-manager'),Engine=require('./research-engine');
function createFoundation(dataDir){
 const root=path.join(dataDir,'research-14'),main=path.join(root,'brain.json'),ready=path.join(root,'INITIALIZED.json'),events=path.join(root,'events.jsonl');fs.mkdirSync(root,{recursive:true});
 const recovery=R.createVault({root,component:'research14',appVersion:Engine.VERSION,validatePayload:Engine.validate});let sequence=0,lastEvent=0;
 function readMain(){try{let w=JSON.parse(fs.readFileSync(main,'utf8'));if(!Number.isSafeInteger(w.sequence)||w.sequence<1||w.sha256!==R.sha256Text(JSON.stringify(w.payload))||!Engine.validate(w.payload))return null;return w}catch{return null}}
 function persist(state){if(!Engine.validate(state))throw Error('RESEARCH14_INVALID_STATE');let fresh=state.events.filter(e=>e.seq>lastEvent);fs.appendFileSync(events,fresh.length?fresh.map(e=>JSON.stringify({...e,cohort:state.startedAt})).join('\n')+'\n':'');let slot=recovery.capture(state,'RESEARCH14_SAVE');sequence=slot.sequence;R.atomicJson(main,{sequence,sha256:R.sha256Text(JSON.stringify(state)),payload:state});R.atomicJson(ready,{version:Engine.VERSION,startedAt:state.startedAt});lastEvent=state.eventSeq;return state}
 function load(){let m=readMain(),slots=recovery.validSlots(),best=slots[0];if(m&&(!best||m.sequence>=best.sequence)){sequence=m.sequence;lastEvent=m.payload.eventSeq;return m.payload}if(best){sequence=best.sequence;lastEvent=best.payload.eventSeq;R.atomicJson(main,{sequence,sha256:best.payloadSha256,payload:best.payload});recovery.writeManifest({lastRecovery:{slot:best.slot,sequence:best.sequence,recoveredAt:Date.now(),reason:'RESEARCH14_MAIN_INVALID_OR_OLDER'}});return best.payload}if(fs.existsSync(main)||fs.existsSync(ready)||fs.existsSync(recovery.manifestFile)||fs.existsSync(events)){recovery.restoreLatest(main,{reason:'RESEARCH14_ALL_COPIES_INVALID'});throw Error('RESEARCH14_RECOVERY_REQUIRED: existing research is never silently reset')}let state=Engine.create();persist(state);persist(state);return state}
 return {root,main,events,ready,recovery,load,persist};
}
module.exports={createFoundation};
