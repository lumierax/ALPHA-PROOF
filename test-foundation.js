'use strict';
const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path');
const AI=require('./lab-ai.js'),Store=require('./ai-foundation.js');
const data=fs.mkdtempSync(path.join(os.tmpdir(),'alpha-proof-foundation-'));
const f=Store.createFoundation({dataDir:data,LabAI:AI,appVersion:'TEST'});
let brain=AI.initialState(1000);brain.modelSamples=99;brain.decisions=123;brain.weights.score=.42;
brain=f.persist(brain,'TEST_SEED',{forceCheckpoint:true});
assert(fs.existsSync(f.brainFile),'brain must be persisted separately from runtime state');
let st=f.status(brain);assert.equal(st.featureSchema,AI.FEATURE_SCHEMA);assert.equal(st.checkpointEvery,100);assert(st.checkpointCount>=1);
brain.modelSamples=100;brain=f.persist(brain,'CASE_100');st=f.status(brain);assert(st.lastCheckpointSamples>=100,'checkpoint must be created when the 100-case boundary is reached');
let loaded=f.load(null);assert.equal(loaded.modelSamples,100);assert.equal(loaded.weights.score,.42);assert.equal(loaded.lineageId,brain.lineageId,'brain lineage must survive process restart');
// v9.1 state migration: when no dedicated brain file exists, preserve the previous brain instead of starting over.
const data2=fs.mkdtempSync(path.join(os.tmpdir(),'alpha-proof-foundation-migrate-')),f2=Store.createFoundation({dataDir:data2,LabAI:AI,appVersion:'TEST'});let legacy=AI.initialState(2000);legacy.modelSamples=47;legacy.weights.relative=.33;let migrated=f2.load(legacy);assert.equal(migrated.modelSamples,47);assert.equal(migrated.weights.relative,.33);assert.equal(f2.status(migrated).source,'MIGRATED_V9_1_STATE');
assert(Buffer.byteLength(JSON.stringify(migrated))<80000,'brain must remain bounded and tiny compared with the dataset');
fs.rmSync(data,{recursive:true,force:true});fs.rmSync(data2,{recursive:true,force:true});
console.log('PASS: separate durable AI brain, v9.1 migration, feature-schema guard and 100-case checkpoints');
