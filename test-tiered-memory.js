'use strict';
const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path');
const Tiered=require('./tiered-memory.js');
const Cold=require('./cold-runtime-store.js');
const Adaptive=require('./adaptive-manager.js');
const AF=require('./adaptive-manager-foundation.js');
const d=fs.mkdtempSync(path.join(os.tmpdir(),'alpha-tiered-'));
try{
 const cold=Cold.createStore({dataDir:d});
 for(let i=0;i<350;i++)cold.appendClosed({i,symbol:'T'+i+'USDT'});
 let tail=cold.recentClosed(40);assert.equal(tail.length,40);assert.equal(tail.at(-1).i,349);assert.equal(tail[0].i,310);
 const af=AF.createFoundation({dataDir:d,AdaptiveManager:Adaptive,appVersion:'TEST'});let s=af.load(Adaptive.initialState());assert(fs.existsSync(af.brainFile));
 const tm=Tiered.createTieredMemory({dataDir:d,stateFile:path.join(d,'state.json'),adaptiveFoundation:af,coldRuntime:cold});
 assert(Number.isFinite(tm.totals.ramLimitBytes)&&tm.totals.ramLimitBytes>0);assert(tm.totals.capturedAt>0);
 fs.writeFileSync(path.join(d,'state.json'),'{}');let m=tm.breakdown();assert(Number.isFinite(m.ram.rssBytes));assert(m.storage.parts.coldRuntime>0);assert(m.storage.usedBytes>=m.storage.parts.coldRuntime);
 cold.clearClosed();assert.equal(cold.recentClosed(10).length,0);
 console.log('PASS: tiered memory keeps cold history on disk, loads only a bounded tail, and computes detailed usage only on demand');
}finally{fs.rmSync(d,{recursive:true,force:true})}
