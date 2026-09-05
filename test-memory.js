const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path');
const data=fs.mkdtempSync(path.join(os.tmpdir(),'alpha-proof-memory-'));
process.env.DATA_DIR=data;
const S=require('./server.js');
const now=Date.now();
assert.equal(S.MEMORY_SCHEMA,'alpha-proof-lab-memory/1');
assert.equal(S.normalizeSettings({sortMode:'symbol'}).sortMode,'luxRecent','legacy alphabetical sort must normalize away');
const base={cycleId:'CASE-1',luxKey:'TESTUSDT|LONG|4h|1',symbol:'TESTUSDT',dir:'LONG',tf:'4h',entryAt:now-600000,entryPrice:100,entryQuoteVol:1000000,targetPct:12,acceptedTargetPct:11.9,targetPrice:112,stopPrice:95,breakTime:now-700000,breakPrice:101,breakBarsAgoAtEntry:0,stopMethod:'nearest-pivot',supportAtEntry:{pa:{enabled:true,pass:true,dirCount:4,lookback:5,structurePct:75},ce:{enabled:true,pass:true,ratio:1.5,mode:'expansion'},ema:{enabled:true,pass:true,dist:2,slope:.2,length:200}},settingsRevisionAtEntry:0,settingsAtEntry:S.defaults,memoryEpoch:S.MEMORY_EPOCH,memoryEligible:true,timeframeSignals:[{tf:'4h',dir:'LONG',selected:true,radarScore:80,flowRelative:2.1,flowEligible:true}],timeframeHistory:[],wasFeatured:true};
const flow={windowMin:60,quoteVolume:800000,directionalVolume:500000,netExecution:200000,relative:2.4,pressurePct:64,persistencePct:70,impactPct:2.5,priceMovePct:1,speed:.2,acceleration:.01,score:80,eligible:true,alive:true,reason:'مؤهلة',measuredAt:now-500000};
const journey=[{t:now-500000,kind:'TICK',movePct:2,flow,market:{direction:'UP',fearGreed:70},flags:{settingsRevision:0}},{t:now,kind:'EXIT',movePct:10,flow,market:{direction:'UP',fearGreed:71},flags:{settingsRevision:0}}];
let c=S.buildLearningCase(base,'TP',110,1200000,now,journey);
assert.equal(c.quality,'VALID');assert.equal(c.outcome.signedMovePct,10);assert.equal(c.outcome.mfePct,10);assert.equal(c.outcome.maePct,2);assert(c.settingsRefs&&c.settingsRefs.entryRevision===0);assert(!JSON.stringify(c).includes('settingsAtEntry'),'full settings must not be duplicated inside every CASE');
let sh={...base,cycleId:'CASE-2',dir:'SHORT',luxKey:'TESTUSDT|SHORT|4h|1'};
c=S.buildLearningCase(sh,'TP',90,1200000,now,journey);
assert.equal(c.outcome.signedMovePct,10,'SHORT move must use the same entry-price denominator as live journey/UI');
let legacy={...base,cycleId:'OLD',memoryEligible:false,memoryEpoch:'LEGACY_PRE_V1'};
assert.equal(S.buildLearningCase(legacy,'TP',110,1,now,journey).quality,'REJECTED','pre-v1 cases must never enter clean memory');

// A huge legacy state must be scanned selectively instead of JSON.parse'ing the entire file into RAM.
const huge=path.join(data,'huge-state.json');
const noise='x'.repeat(S.SAFE_STATE_PARSE_LIMIT+1024*1024);
fs.writeFileSync(huge,JSON.stringify({settings:{tf:'6h',liveEnabled:true},results:[],liveRows:[{symbol:'OLDROW'}],liveHistory:{NOISE:noise},active:{SAFEUSDT:{symbol:'SAFEUSDT',dir:'LONG',tf:'6h',entryPrice:1}},closed:[{noise}],memory:{epoch:'LEGACY'},settingsRevision:7,marketContext:{direction:'UP'},meta:{connectionState:'CONNECTED'}}));
let loaded=S.loadStateSnapshot(huge);assert.equal(loaded.settings.tf,'6h');assert(loaded.active.SAFEUSDT);assert(!('liveHistory' in loaded),'huge legacy liveHistory must not be loaded into RAM');assert(!('closed' in loaded),'huge legacy closed history must not be loaded into RAM');
fs.unlinkSync(huge);

S.recordRejectedTechnical('OLD',{symbol:'OLDUSDT',tf:'4h',reason:'stale'},now-25*60*60*1000);
S.recordRejectedTechnical('NEW',{symbol:'NEWUSDT',tf:'4h',reason:'timeout'},now);
let meta=S.memoryPublicMeta();assert.equal(meta.rejectedRetentionHours,24);assert.equal(meta.rejectedCount24h,1,'technical rejects older than 24h must be removed');
fs.rmSync(data,{recursive:true,force:true});
console.log('PASS: clean memory schema, VALID/REJECTED gate, settings references, SHORT math and fixed 24h reject cleanup');
