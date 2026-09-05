'use strict';
const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path');
const MarketAI=require('./market-ai.js'),Foundation=require('./market-ai-foundation.js');
function tickers(step){let m=new Map(),trend=step*.035;for(let i=0;i<160;i++){let base=1+i/100,p=base*(1+trend/100)*(1+((i%7)-3)*.0001),chg=trend+((i%9)-4)*.08;m.set(`C${i}USDT`,{lastPrice:String(p),priceChangePercent:String(chg),quoteVolume:String(1000000+i*5000)})}m.set('BTCUSDT',{lastPrice:String(60000*(1+trend/100)),priceChangePercent:String(trend),quoteVolume:'500000000'});m.set('ETHUSDT',{lastPrice:String(3000*(1+trend*.9/100)),priceChangePercent:String(trend*.9),quoteVolume:'300000000'});return m}
let state=MarketAI.initialState(1_000_000),runtime=MarketAI.initialRuntime(1_000_000),start=1_000_000,all=[];
for(let i=0;i<310;i++){let now=start+i*5*60000,r=MarketAI.observe(state,runtime,tickers(i),{value:55+Math.min(30,i/12)},now);state=r.state;runtime=r.runtime;all.push(...r.resolutions)}
assert(runtime.history.length<=MarketAI.HISTORY_MAX,'history must be bounded');
assert(runtime.anchors.length<=MarketAI.ANCHOR_MAX,'anchors must be bounded');
assert(state.resolvedLabels>100,'must resolve true-forward labels');
assert(state.horizons['15'].samples>50,'15m model should learn');
assert(state.horizons['60'].samples>=50,'1h model should become ready');
assert(all.some(x=>x.horizonMin===1440),'1d label should resolve');
let pub=MarketAI.publicState(state,runtime);assert(pub.forecast60.ready,'1h readiness guard should unlock after enough labels');assert(['UP','NEUTRAL','DOWN'].includes(pub.forecast60.direction));assert(['STRONG_UP','UP','TURNING_UP','NEUTRAL','TURNING_DOWN','DOWN','STRONG_DOWN'].includes(pub.regime));
let tr=MarketAI.tradeContext(state,runtime);assert(tr.forecast60.ready&&tr.featureSchema===MarketAI.FEATURE_SCHEMA);
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'market-ai-foundation-')),f=Foundation.createFoundation({dataDir:dir,MarketAI,appVersion:'TEST'});let b=f.loadBrain(),rt=f.loadRuntime();let r=MarketAI.observe(b,rt,tickers(0),{value:50},start);f.persistObservation(r.state,r.runtime,r.resolutions,'TEST');for(let i=1;i<20;i++){r=MarketAI.observe(r.state,r.runtime,tickers(i),{value:50+i},start+i*5*60000);f.persistObservation(r.state,r.runtime,r.resolutions,'TEST')}
assert(fs.existsSync(f.brainFile)&&fs.existsSync(f.runtimeFile)&&fs.existsSync(f.datasetFile));let manifest=fs.readFileSync(f.datasetFile,'utf8').split('\n')[0];assert(manifest.includes('alpha-proof-market-ai-dataset/1'));let st=f.status(r.state,r.runtime);assert(st.brainBytes>0&&st.runtimeBytes>0&&st.datasetBytes>0);assert(st.pendingAnchors<=MarketAI.ANCHOR_MAX);fs.rmSync(dir,{recursive:true,force:true});
console.log('PASS: Market AI observes bounded 5m state, anchors every 15m, learns true forward horizons and persists brain/runtime/dataset separately');
