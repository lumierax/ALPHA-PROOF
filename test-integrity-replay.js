'use strict';
const assert=require('assert');
const fs=require('fs');
const os=require('os');
const path=require('path');

const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'alpha-proof-integrity-'));
process.env.DATA_DIR=tmp;
const memoryDir=path.join(tmp,'lab-memory');
fs.mkdirSync(path.join(memoryDir,'archives'),{recursive:true});
const MEMORY_SCHEMA='alpha-proof-lab-memory/2';
const MEMORY_EPOCH='LAB-MEMORY-V2-FOUNDATION-2026-09-05';
const base=Date.UTC(2026,8,5,8,0,0);
const featureNames=['score','relative','pressure','persistence','impact','move','speed','acceleration','market','fearGreed','marketForecast','marketForecastConfidence','marketTurning','marketAgreement','pa','ce','ema','timeframe','dirShort'];
const features=Object.fromEntries(featureNames.map((k,i)=>[k,i===0?.6:0]));
function oldAi({decision='ENTER',decidedAt=base,fill=100,target=100.5,stop=99}={}){
  return {schema:'alpha-proof-shadow-ai/2',featureSchema:'FEATURES-V2-MARKET',modelVersion:'SHADOW-AI-004-CORTEX',decision,finalDecision:decision,decidedAt,fillPrice:fill,targetPrice:target,stopPrice:stop,confidence:.7,features:{...features},facts:{symbol:'TESTUSDT',dir:'LONG',tf:'4h',market:{direction:'UP'}}};
}
function learningCase({id,decidedAt,fill=100,target=100.5,stop=99,journey=[],outcomePrice,outcomeType='REVERSE'}){
  return {type:'CASE',schema:MEMORY_SCHEMA,case:{schema:MEMORY_SCHEMA,caseId:id,cycleId:'CYCLE-OLD',quality:'VALID',symbol:'TESTUSDT',dir:'LONG',tf:'4h',entry:{at:decidedAt-1000,price:fill,targetPrice:target,stopPrice:stop,market:{direction:'UP'}},journey,outcome:{type:outcomeType,at:decidedAt+60000,price:outcomePrice},ai:oldAi({decidedAt,fill,target,stop})}};
}
const records=[
  {type:'MANIFEST',schema:MEMORY_SCHEMA,cycleId:'CYCLE-OLD',startedAt:base-10000,version:'9.5.0-LAB-AI-OMEGA-CORTEX'},
  // Verifiable historical winner: frozen journey truly crosses TP.
  learningCase({id:'OLD-WIN',decidedAt:base,journey:[{t:base+10000,price:100.2},{t:base+20000,price:100.5}],outcomePrice:100.5,outcomeType:'TP'}),
  // Real exit at REVERSE: actual exit price is usable even without a TP/SL touch.
  learningCase({id:'OLD-LOSS',decidedAt:base+120000,journey:[{t:base+130000,price:100.1}],outcomePrice:99.8,outcomeType:'REVERSE'}),
  // The v9.5 wrong-side TP/SL bug: this must be deleted from the canonical learning dataset.
  learningCase({id:'OLD-INVALID',decidedAt:base+240000,target:99.8,stop:99,journey:[{t:base+250000,price:99.8}],outcomePrice:99.8,outcomeType:'TP'}),
  // A legacy row says TP although the frozen journey never touched it: do NOT trust the old label.
  learningCase({id:'OLD-FAKE-TP',decidedAt:base+360000,target:101,stop:99,journey:[{t:base+370000,price:100.15},{t:base+380000,price:100.2}],outcomePrice:101,outcomeType:'TP'}),
  {type:'TRAINING',schema:MEMORY_SCHEMA,caseId:'OLD-WIN',accepted:true,modelVersion:'SHADOW-AI-004-CORTEX'}
];
const memoryFile=path.join(memoryDir,'current.jsonl');
fs.writeFileSync(memoryFile,records.map(x=>JSON.stringify(x)).join('\n')+'\n');
fs.writeFileSync(path.join(tmp,'state.json'),JSON.stringify({settings:{},active:{},closed:[{cycleId:'STALE-CLOSED',ai:{outcome:{winLabel:1}}}],memory:{epoch:MEMORY_EPOCH,schema:MEMORY_SCHEMA,cycleId:'CYCLE-OLD',startedAt:base-10000,validCount:4,settingsRevisions:[]},aiLab:{modelVersion:'SHADOW-AI-004-CORTEX',featureSchema:'FEATURES-V2-MARKET',modelSamples:50,decisions:50}}));
const rawBefore=fs.readFileSync(memoryFile,'utf8');
const server=require('./server.js');
const ai=server.aiPublicState();
const cortex=server.cortexPublicState();
const replayPath=path.join(tmp,'integrity-replay-net-pnl.json');
const sanitizePath=path.join(tmp,'integrity-sanitize-net-pnl.json');
assert(fs.existsSync(replayPath),'one-time integrity replay report must be written');
assert(fs.existsSync(sanitizePath),'one-time sanitation report must be written');
const report=JSON.parse(fs.readFileSync(replayPath,'utf8'));
const sanitation=JSON.parse(fs.readFileSync(sanitizePath,'utf8'));
assert.equal(ai.repairVersion,server.LabAI.REPAIR_VERSION);
assert.equal(cortex.replayVersion,server.LabAI.REPAIR_VERSION);
assert.equal(sanitation.invalidGeometryDeleted,1,'wrong-side historical TP/SL case must be deleted from canonical VALID data');
assert.equal(sanitation.unverifiableDeleted,1,'legacy TP label with no frozen price proof must be deleted, not trusted');
assert.equal(sanitation.trainingRowsDeleted,1,'stale v9.5 TRAINING audit row must be removed from canonical dataset');
assert.equal(report.trained,2,'only two verified historical cases should rebuild the brain');
assert.equal(ai.modelSamples,2,'Trade AI must start repaired learning only from verified corrected cases');
assert.equal(ai.economics.lifetime.trades,2,'only actual ENTER cases count in portfolio economics');
assert(Math.abs(ai.economics.lifetime.profitPct-.3)<1e-9,'+0.50% gross TP must become +0.30% net after 0.20% fees');
assert(Math.abs(ai.economics.lifetime.lossPct-.4)<1e-9,'-0.20% gross losing exit must become -0.40% net after fees');
assert(Math.abs(ai.economics.lifetime.netPct-(-.1))<1e-9,'overall repaired portfolio must be negative when the loss outweighs the winner');
const sanitized=fs.readFileSync(memoryFile,'utf8');
assert(!sanitized.includes('OLD-INVALID'),'invalid old winner must no longer exist in the canonical learning dataset');
assert(!sanitized.includes('OLD-FAKE-TP'),'unverifiable old TP must no longer exist in the canonical learning dataset');
assert(!sanitized.includes('"type":"TRAINING"'),'stale training records must not survive canonical sanitation');
assert(sanitized.includes('OLD-WIN')&&sanitized.includes('OLD-LOSS'),'verified cases must remain');
assert(sanitized.includes('"totalFeesPct":0.2'),'corrected canonical cases must explicitly store round-trip Spot fees');
assert(sanitized.includes('"netPnlPct":0.3'),'corrected winner must store net PnL, not fee-free label');
const backupDir=path.join(tmp,'integrity-raw-backup-v9.5');
const backups=fs.readdirSync(backupDir);
assert(backups.length>=1,'raw pre-sanitize dataset must be preserved outside the learning source for audit only');
assert(fs.readFileSync(path.join(backupDir,backups[0]),'utf8')===rawBefore,'raw audit backup must be byte-identical to pre-migration data');
assert(fs.readdirSync(path.join(tmp,'ai-foundation','checkpoints')).some(x=>x.endsWith('.json')),'repaired brain must have a checkpoint');
assert(fs.readdirSync(path.join(tmp,'omega-cortex','checkpoints')).some(x=>x.endsWith('.json')),'repaired CORTEX must have a checkpoint');
fs.rmSync(tmp,{recursive:true,force:true});
console.log('PASS: v9.5 corrupted winners are corrected when provable or deleted when invalid/unverifiable; raw audit backup is isolated; v9.6 brain rebuilds only from net-PnL truth');
