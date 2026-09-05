'use strict';
const fs=require('fs'),path=require('path');

const STORE_SCHEMA='alpha-proof-ai-foundation/1';
const BRAIN_SCHEMA='alpha-proof-ai-brain/1';
const CHECKPOINT_EVERY=100;

function safeName(s){return String(s||'').replace(/[^A-Za-z0-9._-]/g,'_')}
function atomicWriteJson(file,obj){
 const tmp=file+'.tmp';
 fs.writeFileSync(tmp,JSON.stringify(obj));
 fs.renameSync(tmp,file);
}
function fileSize(file){try{return fs.statSync(file).size}catch{return 0}}

function createFoundation({dataDir,LabAI,appVersion}){
 const root=path.join(dataDir,'ai-foundation');
 const checkpoints=path.join(root,'checkpoints');
 const retired=path.join(root,'retired');
 const brainFile=path.join(root,'brain.json');
 fs.mkdirSync(checkpoints,{recursive:true});
 fs.mkdirSync(retired,{recursive:true});
 let lastCheckpointSamples=-1,lastPeriodicBucket=0,checkpointCount=0,lastSavedAt=null,lastSource='NEW';
 try{
  const files=fs.readdirSync(checkpoints).filter(x=>x.endsWith('.json'));
  checkpointCount=files.length;
  for(const f of files){let m=/samples-(\d+)/.exec(f);if(m){let sm=Number(m[1]);lastCheckpointSamples=Math.max(lastCheckpointSamples,sm);if(sm>0&&sm%CHECKPOINT_EVERY===0)lastPeriodicBucket=Math.max(lastPeriodicBucket,Math.floor(sm/CHECKPOINT_EVERY))}}
 }catch{}
 function compatibleBrain(raw){
  if(!raw||typeof raw!=='object')return false;
  const brain=raw.brain&&typeof raw.brain==='object'?raw.brain:raw;
  const feature=brain.featureSchema||raw.featureSchema||LabAI.FEATURE_SCHEMA;
  const model=brain.modelVersion||raw.modelVersion||LabAI.MODEL_VERSION;
  return feature===LabAI.FEATURE_SCHEMA&&model===LabAI.MODEL_VERSION;
 }
 function envelope(brain,reason='UPDATE'){
  return {schema:BRAIN_SCHEMA,foundationSchema:STORE_SCHEMA,appVersion,featureSchema:LabAI.FEATURE_SCHEMA,modelVersion:LabAI.MODEL_VERSION,savedAt:Date.now(),reason,brain:LabAI.normalizeState(brain||{})};
 }
 function retireCurrent(reason='INCOMPATIBLE'){
  if(!fs.existsSync(brainFile))return null;
  let name=`brain-${safeName(reason)}-${new Date().toISOString().replace(/[:.]/g,'-')}.json`,dest=path.join(retired,name);
  fs.copyFileSync(brainFile,dest);return dest;
 }
 function writeCheckpoint(brain,reason='CHECKPOINT',force=false){
  brain=LabAI.normalizeState(brain||{});
  const samples=Math.max(0,Math.round(Number(brain.modelSamples)||0));
  let bucket=Math.floor(samples/CHECKPOINT_EVERY);
  if(!force&&(bucket<1||bucket<=lastPeriodicBucket))return null;
  const name=`checkpoint-samples-${String(samples).padStart(9,'0')}-${safeName(brain.lineageId||'AI')}.json`;
  const file=path.join(checkpoints,name);
  if(!fs.existsSync(file)){atomicWriteJson(file,{...envelope(brain,reason),checkpointSamples:samples});checkpointCount++}
  lastCheckpointSamples=Math.max(lastCheckpointSamples,samples);if(!force&&bucket>=1)lastPeriodicBucket=Math.max(lastPeriodicBucket,bucket);else if(force&&samples>0&&samples%CHECKPOINT_EVERY===0)lastPeriodicBucket=Math.max(lastPeriodicBucket,bucket);
  return file;
 }
 function persist(brain,reason='UPDATE',{forceCheckpoint=false}={}){
  brain=LabAI.normalizeState(brain||{});
  atomicWriteJson(brainFile,envelope(brain,reason));
  lastSavedAt=Date.now();
  writeCheckpoint(brain,reason,forceCheckpoint);
  return brain;
 }
 function load(legacyBrain=null){
  let brain=null;
  if(fs.existsSync(brainFile)){
   try{let raw=JSON.parse(fs.readFileSync(brainFile,'utf8'));if(compatibleBrain(raw)){brain=LabAI.normalizeState(raw.brain||raw);lastSavedAt=Number(raw.savedAt)||null;lastSource='BRAIN_FILE'}else{retireCurrent('SCHEMA_CHANGE');lastSource='NEW_AFTER_SCHEMA_CHANGE'}}catch(e){try{retireCurrent('CORRUPT')}catch{};lastSource='NEW_AFTER_CORRUPT'}
  }
  if(!brain&&legacyBrain&&typeof legacyBrain==='object'&&Number(legacyBrain.modelSamples||legacyBrain.decisions||0)>0&&compatibleBrain(legacyBrain)){
   brain=LabAI.normalizeState(legacyBrain);lastSource='MIGRATED_V9_1_STATE';
  }
  if(!brain){brain=LabAI.initialState();if(!lastSource.startsWith('NEW_AFTER_'))lastSource='NEW'}
  persist(brain,lastSource,{forceCheckpoint:true});
  return brain;
 }
 function reset(brainReason='EXPLICIT_RESET'){
  try{if(fs.existsSync(brainFile))retireCurrent(brainReason)}catch{}
  let brain=LabAI.initialState();lastCheckpointSamples=-1;lastPeriodicBucket=0;persist(brain,brainReason,{forceCheckpoint:true});lastSource=brainReason;return brain;
 }
 function status(brain){
  brain=LabAI.normalizeState(brain||{});
  return {schema:STORE_SCHEMA,brainSchema:BRAIN_SCHEMA,featureSchema:LabAI.FEATURE_SCHEMA,modelVersion:LabAI.MODEL_VERSION,lineageId:brain.lineageId,checkpointEvery:CHECKPOINT_EVERY,checkpointCount,lastCheckpointSamples:Math.max(0,lastCheckpointSamples),brainBytes:fileSize(brainFile),lastSavedAt,source:lastSource};
 }
 return {root,brainFile,checkpoints,retired,load,persist,reset,status,writeCheckpoint,retireCurrent};
}

module.exports={STORE_SCHEMA,BRAIN_SCHEMA,CHECKPOINT_EVERY,createFoundation};
