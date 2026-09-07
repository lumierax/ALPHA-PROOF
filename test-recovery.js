'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path'),os=require('os'),{spawn}=require('child_process');
const Recovery=require('./recovery-manager.js');
const LabAI=require('./lab-ai.js'),AIBase=require('./ai-foundation.js');
const Cortex=require('./learning-forge.js'),CortexBase=require('./learning-forge-foundation.js');
const Adaptive=require('./adaptive-manager.js'),AdaptiveBase=require('./adaptive-manager-foundation.js');
const Market=require('./market-ai.js'),MarketBase=require('./market-ai-foundation.js');
const Father=require('./father-workshop-contract.js');
function delay(ms){return new Promise(r=>setTimeout(r,ms))}
async function ready(base,p,timeout=7000){let until=Date.now()+timeout;while(Date.now()<until){if(p.exitCode!=null)throw Error('server exited before ready: '+p.exitCode);try{let r=await fetch(base+'/health');if(r.ok)return await r.json()}catch{}await delay(80)}throw Error('server not ready')}
async function stop(p){if(p.exitCode!=null)return;p.kill('SIGTERM');let until=Date.now()+5000;while(Date.now()<until&&p.exitCode==null)await delay(50);if(p.exitCode==null)p.kill('SIGKILL')}
function launch(data,port){return spawn(process.execPath,['server.js'],{cwd:__dirname,env:{...process.env,DATA_DIR:data,PORT:String(port)},stdio:['ignore','pipe','pipe']})}
async function json(base,url,opts){let r=await fetch(base+url,opts);return await r.json()}
(async()=>{
 // Core A/B rotation: always overwrite the oldest verified slot.
 let d=fs.mkdtempSync(path.join(os.tmpdir(),'alpha-recovery-core-')),root=path.join(d,'x');
 let v=Recovery.createVault({root,component:'TEST',appVersion:'9.9.4',validatePayload:x=>Number.isFinite(x?.value)});
 v.capture({value:1},'ONE');v.capture({value:2},'TWO');v.capture({value:3},'THREE');
 let slots=v.validSlots();assert.equal(slots.length,2);assert.deepEqual(slots.map(x=>x.sequence),[3,2]);
 let main=path.join(d,'main.json');fs.writeFileSync(main,'{broken');let r=v.restoreLatest(main,{reason:'TEST'});assert(r.ok);assert.equal(JSON.parse(fs.readFileSync(main)).value,3);
 let latest=v.status().latest.slot==='A'?v.slotA:v.slotB;fs.writeFileSync(latest,'{broken');fs.writeFileSync(main,'{broken');r=v.restoreLatest(main,{reason:'LATEST_SLOT_BROKEN'});assert(r.ok);assert.equal(JSON.parse(fs.readFileSync(main)).value,2,'must fall back to previous verified slot');
 fs.writeFileSync(v.slotA,'{broken');fs.writeFileSync(v.slotB,'{broken');assert.equal(v.restoreLatest(main).ok,false,'must never invent memory if both slots fail');
 fs.rmSync(d,{recursive:true,force:true});

 // Father recovery contract is prepared but network/GitHub and secrets are still disabled until VPS.
 let fc=Father.recoveryContract();assert(fc.jobTypes.includes('BACKUP_CHECKPOINT')&&fc.jobTypes.includes('RESTORE_SNAPSHOT'));assert.equal(fc.policy.status,'DISABLED_UNTIL_VPS');assert.equal(fc.policy.provider,'GITHUB_PRIVATE');assert.equal(fc.policy.keepVerifiedSnapshots,2);assert.equal(fc.policy.secretsIncluded,false);assert.equal(fc.policy.mayInventMissingMemory,false);

 // End-to-end: create real ALPHA data, seed distinct memories, damage mains, verify automatic local recovery.
 d=fs.mkdtempSync(path.join(os.tmpdir(),'alpha-recovery-server-'));let port=32240+Math.floor(Math.random()*200),base=`http://127.0.0.1:${port}`;
 let p=launch(d,port);await ready(base,p);await fetch(base+'/api/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tf:'12h',liveEnabled:false})});await delay(350);await fetch(base+'/api/restart',{method:'POST'});await delay(200);await stop(p);
 // second normal boot provides another verified generation for cohort brains
 p=launch(d,port);await ready(base,p);await delay(180);await stop(p);
 let cohortManifest=JSON.parse(fs.readFileSync(path.join(d,'research-cohorts','CLEAN-PROSPECTIVE-1','manifest.json'))),cohortRoot=path.join(d,'research-cohorts','CLEAN-PROSPECTIVE-1'),cid=cohortManifest.id;
 // Seed each brain with unmistakable values and save twice so A/B both exist.
 let af=AIBase.createFoundation({dataDir:cohortRoot,LabAI,appVersion:'9.9.4',cohortId:cid}),ab=af.load();ab.researchCohort={id:cid,policy:'CLEAN-PROSPECTIVE-1',startedAt:cohortManifest.startedAt};ab.modelSamples=77;af.persist(ab,'RECOVERY_SEED_1');af.persist(ab,'RECOVERY_SEED_2');
 let cf=CortexBase.createFoundation({dataDir:cohortRoot,LearningForge:Cortex,appVersion:'9.9.4',cohortId:cid}),cb=cf.load();cb.researchCohort={id:cid,policy:'CLEAN-PROSPECTIVE-1',startedAt:cohortManifest.startedAt};cb.observedCases=44;cf.persist(cb,'RECOVERY_SEED_1');cf.persist(cb,'RECOVERY_SEED_2');
 let adf=AdaptiveBase.createFoundation({dataDir:cohortRoot,AdaptiveManager:Adaptive,appVersion:'9.9.4',cohortId:cid}),adb=adf.load();adb.researchCohort={id:cid,policy:'CLEAN-PROSPECTIVE-1',startedAt:cohortManifest.startedAt};adb.samples=55;adf.persist(adb,'RECOVERY_SEED_1');adf.persist(adb,'RECOVERY_SEED_2');
 let mf=MarketBase.createFoundation({dataDir:d,MarketAI:Market,appVersion:'9.9.4'}),mb=mf.loadBrain(),mr=mf.loadRuntime();mb.resolvedLabels=777;mr.lastRegime='DOWN';mf.persistBrain(mb,'RECOVERY_SEED_1');mf.persistBrain(mb,'RECOVERY_SEED_2');mf.persistRuntime(mr,'RECOVERY_SEED_1');mf.persistRuntime(mr,'RECOVERY_SEED_2');
 // runtime state has A/B after normal saves; main retains requested 12h state
 let state=JSON.parse(fs.readFileSync(path.join(d,'state.json')));state.settings.tf='12h';state.settings.liveEnabled=false;fs.writeFileSync(path.join(d,'state.json'),JSON.stringify(state));let sv=Recovery.createVault({root:path.join(d,'runtime-state-recovery'),component:'RUNTIME_STATE',appVersion:'9.9.4-PROFIT-FIRST-SHADOW-MENTOR-RECOVERY-A-B',validatePayload:x=>!!(x&&x.settings&&x.memory)});sv.capture(state,'RECOVERY_SEED_1');sv.capture(state,'RECOVERY_SEED_2');
 // Deliberately damage all primary JSON files that previously could reset silently.
 for(const f of [path.join(d,'state.json'),af.brainFile,cf.brainFile,adf.brainFile,mf.brainFile,mf.runtimeFile])fs.writeFileSync(f,'{INTENTIONAL_CORRUPTION');
 p=launch(d,port);await ready(base,p);let st=await json(base,'/api/state'),rec=await json(base,'/api/recovery/status');
 assert.equal(st.settings.tf,'12h');assert.equal(st.settings.liveEnabled,false);assert.equal(st.aiLab.modelSamples,77);assert.equal(st.cortex.observedCases,44);assert.equal(st.adaptiveManager.samples,55);assert.equal(st.marketAI.resolvedLabels,777);assert.equal(st.marketAI.regime,'DOWN');
 assert(rec.startup.runtime,'runtime state must report startup recovery');assert.equal(rec.startup.cohort.length,3,'all three clean-cohort brains must preflight-recover');assert(rec.components.marketAI.lastRecovery,'Market AI recovery must be visible');assert(rec.components.marketRuntime.lastRecovery,'Market runtime recovery must be visible');assert.equal(rec.father.policy.status,'DISABLED_UNTIL_VPS');
 await stop(p);

 // Fail-closed: corrupt main + A + B for runtime state. Server must refuse to boot, never silently reset.
 fs.writeFileSync(path.join(d,'state.json'),'{BROKEN');let stateRecDir=path.join(d,'runtime-state-recovery','recovery');fs.writeFileSync(path.join(stateRecDir,'checkpoint-A.json'),'{BROKEN');fs.writeFileSync(path.join(stateRecDir,'checkpoint-B.json'),'{BROKEN');
 p=launch(d,port);let exited=false;for(let i=0;i<50;i++){if(p.exitCode!=null){exited=true;break}await delay(80)}if(!exited){p.kill('SIGKILL');throw Error('server must stop when main and both verified runtime recovery slots are invalid')}assert.notEqual(p.exitCode,0,'fatal recovery failure must be a non-zero stop');assert(fs.existsSync(path.join(stateRecDir,'RECOVERY_REQUIRED.json')),'fatal local failure must leave a machine-readable RECOVERY_REQUIRED marker for the future Father Workshop');let required=JSON.parse(fs.readFileSync(path.join(stateRecDir,'RECOVERY_REQUIRED.json')));assert.equal(required.status,'RECOVERY_REQUIRED');assert.equal(required.fatherAction,'RESTORE_CHECKPOINT_OR_SNAPSHOT');
 let gm=JSON.parse(fs.readFileSync(path.join(d,'recovery','recovery-manifest.json')));assert.equal(gm.externalBackup.status,'DISABLED_UNTIL_VPS');assert.equal(gm.externalBackup.provider,'GITHUB_PRIVATE');assert.equal(gm.externalBackup.secretsIncluded,false);assert.equal(gm.recoveryPolicy.silentResetForbidden,true);
 fs.rmSync(d,{recursive:true,force:true});
 console.log('PASS: verified A/B recovery rotates oldest, restores runtime/Trade AI/CORTEX/Adaptive/Market memory after deliberate corruption, falls back to previous slot, and fails closed when all local copies are invalid; Father GitHub recovery remains disabled until VPS');
})().catch(e=>{console.error(e.stack||e);process.exit(1)});
