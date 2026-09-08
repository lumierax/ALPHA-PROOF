'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const SLOT_SCHEMA='alpha-proof-recovery-slot/1';
const MANIFEST_SCHEMA='alpha-proof-recovery-manifest/1';
const GLOBAL_SCHEMA='alpha-proof-global-recovery-manifest/1';
function atomicText(file,text){fs.mkdirSync(path.dirname(file),{recursive:true});const tmp=file+'.tmp';fs.writeFileSync(tmp,text);fs.renameSync(tmp,file)}
function atomicJson(file,obj){atomicText(file,JSON.stringify(obj,null,2))}
function sha256Text(text){return crypto.createHash('sha256').update(text).digest('hex')}
function safeParse(file){try{return {ok:true,value:JSON.parse(fs.readFileSync(file,'utf8'))}}catch(e){return {ok:false,error:e.message}}}
function slotName(file){return path.basename(file).includes('checkpoint-A')?'A':'B'}
function createVault({root,component,appVersion='UNKNOWN',cohortId=null,validatePayload=()=>true}){
 const recoveryDir=path.join(root,'recovery'),slotA=path.join(recoveryDir,'checkpoint-A.json'),slotB=path.join(recoveryDir,'checkpoint-B.json'),manifestFile=path.join(recoveryDir,'manifest.json'),requiredFile=path.join(recoveryDir,'RECOVERY_REQUIRED.json');
 fs.mkdirSync(recoveryDir,{recursive:true});
 function validateSlotFile(file){
  if(!fs.existsSync(file))return {ok:false,file,slot:slotName(file),reason:'MISSING'};
  let r=safeParse(file);if(!r.ok)return {ok:false,file,slot:slotName(file),reason:'PARSE_ERROR',error:r.error};
  let s=r.value;if(s?.schema!==SLOT_SCHEMA||s?.component!==component||!Number.isFinite(Number(s.sequence))||!s.payload||typeof s.payload!=='object')return {ok:false,file,slot:slotName(file),reason:'INVALID_SLOT'};
  let text=JSON.stringify(s.payload),hash=sha256Text(text);if(hash!==s.payloadSha256)return {ok:false,file,slot:s.slot||slotName(file),reason:'HASH_MISMATCH'};
  try{if(validatePayload(s.payload)!==true)return {ok:false,file,slot:s.slot||slotName(file),reason:'PAYLOAD_REJECTED'}}catch(e){return {ok:false,file,slot:s.slot||slotName(file),reason:'PAYLOAD_REJECTED',error:e.message}}
  if(cohortId&&s.cohortId&&s.cohortId!==cohortId)return {ok:false,file,slot:s.slot||slotName(file),reason:'COHORT_MISMATCH'};
  return {ok:true,file,slot:s.slot||slotName(file),sequence:Number(s.sequence),savedAt:Number(s.savedAt)||0,payloadSha256:s.payloadSha256,cohortId:s.cohortId||null,appVersion:s.appVersion||null,payload:s.payload,reason:s.reason||null};
 }
 function validSlots(){return [validateSlotFile(slotA),validateSlotFile(slotB)].filter(x=>x.ok).sort((a,b)=>b.sequence-a.sequence||b.savedAt-a.savedAt)}
 function nextSequence(){let slots=validSlots(),m=safeParse(manifestFile);let seq=slots.reduce((x,s)=>Math.max(x,s.sequence),0);if(m.ok&&m.value?.schema===MANIFEST_SCHEMA)seq=Math.max(seq,Number(m.value.latestSequence)||0);return seq+1}
 function writeManifest(extra={}){let a=validateSlotFile(slotA),b=validateSlotFile(slotB),valid=[a,b].filter(x=>x.ok).sort((x,y)=>y.sequence-x.sequence),prev=safeParse(manifestFile),prior=prev.ok&&prev.value?.schema===MANIFEST_SCHEMA?prev.value:{};let out={schema:MANIFEST_SCHEMA,component,appVersion,cohortId:cohortId||null,updatedAt:Date.now(),latestSequence:valid[0]?.sequence||0,slots:{A:a.ok?{valid:true,sequence:a.sequence,savedAt:a.savedAt,sha256:a.payloadSha256}:{valid:false,reason:a.reason},B:b.ok?{valid:true,sequence:b.sequence,savedAt:b.savedAt,sha256:b.payloadSha256}:{valid:false,reason:b.reason}},external:{status:'DISABLED_UNTIL_VPS',provider:'GITHUB_PRIVATE',fatherManaged:true},lastCapture:prior.lastCapture||null,lastRecovery:prior.lastRecovery||null,...extra};atomicJson(manifestFile,out);return out}
 function capture(payload,reason='CHECKPOINT'){
  if(!payload||typeof payload!=='object'||validatePayload(payload)!==true)throw Error(`Recovery payload rejected for ${component}`);
  let seq=nextSequence(),a=validateSlotFile(slotA),b=validateSlotFile(slotB),target=!a.ok?slotA:!b.ok?slotB:(a.sequence<=b.sequence?slotA:slotB),slot=target===slotA?'A':'B',text=JSON.stringify(payload),wrapper={schema:SLOT_SCHEMA,component,slot,sequence:seq,savedAt:Date.now(),appVersion,cohortId:cohortId||null,reason,payloadSha256:sha256Text(text),payload};
  atomicJson(target,wrapper);try{fs.rmSync(requiredFile,{force:true})}catch{}writeManifest({lastCapture:{slot,sequence:seq,reason,savedAt:wrapper.savedAt}});return {slot,sequence:seq,file:target,sha256:wrapper.payloadSha256,savedAt:wrapper.savedAt};
 }
 function restoreLatest(mainFile,{reason='MAIN_INVALID'}={}){
  let slots=validSlots();if(!slots.length){let required={schema:'alpha-proof-recovery-required/1',status:'RECOVERY_REQUIRED',component,appVersion,cohortId:cohortId||null,detectedAt:Date.now(),reason,localSlots:'NO_VALID_RECOVERY_SLOT',fatherAction:'RESTORE_CHECKPOINT_OR_SNAPSHOT',externalProvider:'GITHUB_PRIVATE',secretsIncluded:false};atomicJson(requiredFile,required);writeManifest({lastFailure:required});return {ok:false,reason:'NO_VALID_RECOVERY_SLOT',requiredFile}};
  let chosen=slots[0],text=JSON.stringify(chosen.payload);atomicText(mainFile,text);try{fs.rmSync(requiredFile,{force:true})}catch{}writeManifest({lastRecovery:{slot:chosen.slot,sequence:chosen.sequence,recoveredAt:Date.now(),reason}});return {ok:true,slot:chosen.slot,sequence:chosen.sequence,sourceFile:chosen.file,sha256:chosen.payloadSha256,payload:chosen.payload};
 }
 function status(){let m=safeParse(manifestFile),a=validateSlotFile(slotA),b=validateSlotFile(slotB),valid=[a,b].filter(x=>x.ok).sort((x,y)=>y.sequence-x.sequence);return {schema:MANIFEST_SCHEMA,component,appVersion,cohortId:cohortId||null,state:valid.length===2?'PROTECTED_AB':valid.length===1?'DEGRADED_ONE_SLOT':'NO_VALID_SLOT',latest:valid[0]?{slot:valid[0].slot,sequence:valid[0].sequence,savedAt:valid[0].savedAt,sha256:valid[0].payloadSha256}:null,slots:{A:a.ok?{valid:true,sequence:a.sequence,savedAt:a.savedAt,sha256:a.payloadSha256}:{valid:false,reason:a.reason},B:b.ok?{valid:true,sequence:b.sequence,savedAt:b.savedAt,sha256:b.payloadSha256}:{valid:false,reason:b.reason}},lastRecovery:m.ok?m.value?.lastRecovery||null:null,recoveryRequired:fs.existsSync(requiredFile),requiredFile:fs.existsSync(requiredFile)?requiredFile:null,external:{status:'DISABLED_UNTIL_VPS',provider:'GITHUB_PRIVATE',fatherManaged:true}}}
 return {component,recoveryDir,slotA,slotB,manifestFile,requiredFile,capture,restoreLatest,status,validSlots,validateSlotFile,writeManifest};
}
function createGlobalManifest({dataDir,appVersion}){
 const root=path.join(dataDir,'recovery'),file=path.join(root,'recovery-manifest.json');fs.mkdirSync(root,{recursive:true});
 function write({cohortId=null,components={},reason='SNAPSHOT'}={}){let normalized={};for(const [k,v] of Object.entries(components||{})){let s=typeof v?.status==='function'?v.status():v;normalized[k]={state:s?.state||'UNKNOWN',latest:s?.latest||null,slots:s?.slots||null,cohortId:s?.cohortId||null}}
  let out={schema:GLOBAL_SCHEMA,appVersion,cohortId:cohortId||null,createdAt:Date.now(),reason,components:normalized,externalBackup:{status:'DISABLED_UNTIL_VPS',provider:'GITHUB_PRIVATE',managedBy:'FATHER_WORKSHOP',policy:'LAST_TWO_VERIFIED_SNAPSHOTS',secretsIncluded:false},recoveryPolicy:{order:['MAIN','LOCAL_A_B','FATHER_GITHUB_AFTER_VPS','STOP'],silentResetForbidden:true,validationRequired:true}};atomicJson(file,out);return out}
 function status(){let r=safeParse(file);return r.ok?r.value:{schema:GLOBAL_SCHEMA,appVersion,status:'NOT_WRITTEN',components:{},externalBackup:{status:'DISABLED_UNTIL_VPS'}}}
 return {root,file,write,status};
}
module.exports={SLOT_SCHEMA,MANIFEST_SCHEMA,GLOBAL_SCHEMA,atomicText,atomicJson,sha256Text,createVault,createGlobalManifest};
