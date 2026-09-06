'use strict';
const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path'),{spawn}=require('child_process');
const M=require('./adaptive-manager.js');
// Adaptive manager RAM must stay bounded even across many observations/positions.
let s=M.initialState(1);
for(let p=0;p<220;p++){
  const id='P'+p,w={cycleId:id,symbol:'T'+p+'USDT',dir:p%2?'LONG':'SHORT',tf:'1h',radarScore:70,flow:{relative:2,pressure:60,persistence:65,speed:.1,acceleration:.01}};
  s=M.open(s,{finalDecision:'ENTER',fillPrice:100,confidence:.7},w,1000+p);
  for(let i=0;i<90;i++)s=M.observe(s,w,100+(p%2?1:-1)*i*.001,2000+i*30000).state;
}
for(const p of Object.values(s.positions)){assert(p.observations.length<=M.OBS_RAM_MAX);assert(p.pending.length<=13);assert(p.decisions.length<=M.DECISION_RAM_MAX)}
let compact=M.compactForPersistence(s),json=JSON.stringify(compact);assert(json.length<8*1024*1024,'adaptive persistent state must stay compact under stress');

// Existing oversized v9.8 recovery state may contain a huge duplicated liveRows snapshot.
// Server must ignore that duplicate on selective load and become healthy under a small Node heap.
const data=fs.mkdtempSync(path.join(os.tmpdir(),'alpha-proof-memory-safe-'));
fs.mkdirSync(path.join(data,'lab-memory','archives'),{recursive:true});
fs.writeFileSync(path.join(data,'lab-memory','current.jsonl'),JSON.stringify({type:'MANIFEST',schema:'alpha-proof-lab-memory/2',cycleId:'MEMSAFE'})+'\n');
const active={ONEUSDT:{cycleId:'ONE',symbol:'ONEUSDT',dir:'LONG',tf:'1h',entryAt:Date.now()-1000,entryPrice:1,targetPrice:1.1,stopPrice:.9}};
const hugeRows=Array.from({length:36},(_,i)=>({symbol:'DUP'+i+'USDT',blob:'x'.repeat(600000)})); // >20 MB duplicate UI state
fs.writeFileSync(path.join(data,'state.json'),JSON.stringify({settings:{liveEnabled:false,scanMode:'manual'},active,liveRows:hugeRows,memory:{epoch:'LAB-MEMORY-V2-FOUNDATION-2026-09-05',schema:'alpha-proof-lab-memory/2',cycleId:'MEMSAFE',startedAt:Date.now()-5000,validCount:0,settingsRevisions:[]},meta:{}}));
const port=31991,child=spawn(process.execPath,['--max-old-space-size=96','server.js'],{cwd:__dirname,env:{...process.env,PORT:String(port),DATA_DIR:data,ALPHAPROOF_TELEGRAM_TOKEN:'',ALPHAPROOF_TELEGRAM_CHAT_ID:''},stdio:['ignore','pipe','pipe']});
let logs='';child.stdout.on('data',d=>logs+=d);child.stderr.on('data',d=>logs+=d);
(async()=>{try{
  let ok=false;for(let i=0;i<100;i++){if(child.exitCode!=null)break;try{let r=await fetch(`http://127.0.0.1:${port}/health`);if(r.ok){ok=true;break}}catch{}await new Promise(r=>setTimeout(r,60))}
  assert(ok,'server must survive oversized duplicate runtime state under 96 MB heap: '+logs.slice(-1200));
  let st=await (await fetch(`http://127.0.0.1:${port}/api/state`)).json();assert.equal(st.active.ONEUSDT.symbol,'ONEUSDT');assert.equal(st.liveRows.length,1,'liveRows must be reconstructed from active instead of loading huge duplicate snapshot');
  console.log('PASS: Railway-style 96 MB heap startup survives oversized legacy UI snapshot; adaptive manager remains bounded');
}finally{if(child.exitCode==null)child.kill('SIGTERM');await new Promise(r=>setTimeout(r,150));fs.rmSync(data,{recursive:true,force:true})}})().catch(e=>{console.error(e);process.exit(1)});
