const assert=require('assert');
const {spawn}=require('child_process');
const fs=require('fs'),os=require('os'),path=require('path');
const PORT=31983, base=`http://127.0.0.1:${PORT}`;
const data=fs.mkdtempSync(path.join(os.tmpdir(),'alpha-proof-v900-'));
// Simulate a real pre-v1 noisy state. The clean-memory migration must purge old learning/history,
// but preserve the last visible radar snapshot so Safari does not come back to an empty table.
fs.writeFileSync(path.join(data,'state.json'),JSON.stringify({
 settings:{liveEnabled:false,scanMode:'manual',sortMode:'symbol'},
 liveRows:[{symbol:'KEEPUSDT',dir:'LONG',tf:'4h',radarScore:55,luxFlashActive:true}],
 active:{KEEPUSDT:{cycleId:'LEGACY-ACTIVE',symbol:'KEEPUSDT',dir:'LONG',tf:'4h',entryAt:Date.now()-1000,entryPrice:1,targetPrice:2,stopPrice:.5,setup:{huge:'OLD_SETUP'}}},
 closed:[{symbol:'OLDUSDT',result:'TP'}],
 learningSamples:[{id:'OLD_NOISE',journey:[{x:'huge'}]}],
 hiddenResearch:{OLD:{noise:true}}
}));
function start(){return spawn(process.execPath,['server.js'],{cwd:__dirname,env:{...process.env,PORT:String(PORT),DATA_DIR:data,ALPHAPROOF_TELEGRAM_TOKEN:'',ALPHAPROOF_TELEGRAM_CHAT_ID:''},stdio:['ignore','pipe','pipe']})}
async function ready(proc){let out='';proc.stdout.on('data',d=>out+=d);proc.stderr.on('data',d=>out+=d);for(let i=0;i<60;i++){try{let r=await fetch(base+'/health');if(r.ok)return}catch{}await new Promise(r=>setTimeout(r,80))}throw new Error('server not ready '+out)}
async function stop(proc){if(proc.exitCode!=null)return;proc.kill('SIGTERM');await Promise.race([new Promise(r=>proc.once('exit',r)),new Promise(r=>setTimeout(r,3000))])}
(async()=>{let p=start();try{
 await ready(p);
 let h=await (await fetch(base+'/health')).json();assert.equal(h.version,'9.0.0-LAB-BASELINE');
 let home=await fetch(base+'/');assert(home.ok);let html=await home.text();assert(html.includes('أقوى لونق')&&html.includes('أقوى شورت'));assert((home.headers.get('cache-control')||'').includes('no-store'));
 let st=await (await fetch(base+'/api/state')).json();
 assert.equal(st.settings.sortMode,'luxRecent','old alphabetical sort must migrate to Lux ordering');
 assert.equal(st.closed.length,0,'old noisy closed history must be zeroed on first v1 memory boot');
 assert.equal(st.learningSamplesCount,0,'old learning samples must not enter clean memory');
 assert.equal(st.liveRows.length,1,'last radar snapshot must survive clean-memory migration');
 assert.equal(st.liveRows[0].symbol,'KEEPUSDT');
 assert(st.active.KEEPUSDT,'active radar opportunity must survive clean-memory migration');
 assert.equal(st.active.KEEPUSDT.memoryEligible,false,'pre-v1 active opportunity must not contaminate clean training memory');
 assert(!('setup' in st.active.KEEPUSDT),'legacy heavy setup must be stripped from preserved active opportunity');
 assert.equal(st.memory.schema,'alpha-proof-lab-memory/1');
 assert.equal(st.memory.rejectedRetentionHours,24);
 let exp=await fetch(base+'/api/memory/export');assert(exp.ok);let expText=await exp.text();
 assert(expText.includes('"type":"MANIFEST"')&&expText.includes('"type":"SETTINGS"'),'clean JSONL export must contain manifest + deduplicated settings');
 assert(!expText.includes('OLD_NOISE')&&!expText.includes('OLDUSDT'),'legacy noisy data must never appear in clean export');

 let defaults=(await (await fetch(base+'/api/settings/defaults')).json()).settings;
 assert.equal(defaults.sortMode,'luxRecent');
 let changed={...defaults,liveEnabled:false,scanMode:'manual',autoScanMin:7,paLookback:9,expThreshold1:1.55,emaLength:123,trendMaxBars:33,flowMinMove:.77,flowWindows:'15,60,240',featuredTelegramEnabled:false,freshSignalMovePct:4.2};
 let r=await fetch(base+'/api/settings',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(changed)});assert(r.ok);let j=await r.json();
 assert(j.settingsRevision>=1);assert.equal(j.settings.flowMinMove,.77);assert.equal(j.settings.emaLength,123);assert.equal(j.settings.freshSignalMovePct,4.2);
 st=await (await fetch(base+'/api/state')).json();assert.equal(st.settings.paLookback,9);assert.equal(st.settings.freshSignalMovePct,4.2);assert.equal(st.settings.expThreshold1,1.55);assert.equal(st.settings.autoScanMin,7);assert.equal(st.settingsRevision,j.settingsRevision);assert(st.featuredTrackers&&st.featuredTrackers.LONG&&st.featuredTrackers.SHORT);

 // Rotate must verify/archive first, start a fresh memory cycle, and preserve radar/settings.
 const oldCycle=st.memory.cycleId;
 let rot=await (await fetch(base+'/api/memory/rotate',{method:'POST',headers:{'content-type':'application/json'},body:'{}'})).json();
 assert(rot.ok&&rot.archiveName&&rot.downloadPath);assert.notEqual(rot.memory.cycleId,oldCycle);assert.equal(rot.memory.validCount,0);
 let arch=await fetch(base+rot.downloadPath);assert(arch.ok);let archText=await arch.text();assert(archText.includes('"type":"CYCLE_END"'),'verified archive must contain end-of-cycle marker');
 st=await (await fetch(base+'/api/state')).json();assert.equal(st.liveRows.length,1,'memory rotation must not erase current radar snapshot');assert(st.active.KEEPUSDT,'memory rotation must preserve active radar opportunities');assert.equal(st.settings.flowMinMove,.77,'memory rotation must preserve settings');

 let restart=await (await fetch(base+'/api/restart',{method:'POST',headers:{'content-type':'application/json'},body:'{}'})).json();
 assert.equal(restart.state.settings.flowMinMove,.77);assert.equal(restart.state.settingsRevision,0);assert.equal(restart.state.learningSamplesCount,0);assert.equal(restart.state.liveRows.length,0,'explicit Restart still clears radar by design');
 r=await fetch(base+'/api/settings',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...changed,flowMinMove:.78})});j=await r.json();assert(j.settingsRevision>=1);assert.equal(j.settings.flowMinMove,.78);
 await new Promise(r=>setTimeout(r,350));await stop(p);
 let persisted=JSON.parse(fs.readFileSync(path.join(data,'state.json'),'utf8'));assert(persisted.settingsHistory.length>=1);assert.equal(persisted.settings.flowMinMove,.78);assert(!('learningSamples' in persisted),'heavy learningSamples array must never be persisted');assert(!('hiddenResearch' in persisted),'legacy hiddenResearch must never be persisted');
 p=start();await ready(p);st=await (await fetch(base+'/api/state')).json();assert.equal(st.settings.flowMinMove,.78);assert.equal(st.settings.emaLength,123);assert.equal(st.settings.paLookback,9);assert.equal(st.settings.freshSignalMovePct,4.2);assert(st.settingsRevision>=1);
 r=await fetch(base+'/api/settings/reset',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});j=await r.json();assert.equal(j.settings.flowMinMove,.12);assert.equal(j.settings.emaLength,200);assert.equal(j.settings.freshSignalMovePct,3);assert(j.settingsRevision>st.settingsRevision);
 let t=await fetch(base+'/api/telegram/test',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});assert.equal(t.status,400);
 console.log('PASS: clean-memory migration/export/rotate, radar snapshot persistence, settings persistence and safe Telegram test');
}finally{await stop(p).catch(()=>{});fs.rmSync(data,{recursive:true,force:true})}})().catch(e=>{console.error(e);process.exit(1)});
