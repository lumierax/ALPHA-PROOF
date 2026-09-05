'use strict';
const assert=require('assert');
const fs=require('fs');
process.env.DATA_DIR=process.env.DATA_DIR||'/tmp/alpha-proof-v89-test-data';
const S=require('./server.js');
const RadarFlow=require('./radar-flow.js');

function candles(){
  const a=[]; let p=100;
  for(let i=0;i<50;i++){
    const o=p, c=i>=45?o:(i%3===0?o:o-.2), h=Math.max(o,c)+.5, l=Math.min(o,c)-.5;
    a.push({t:i*60000,o,h,l,c,v:1000,T:i*60000+59999,q:100000,trades:100,tbq:50000}); p=c;
  }
  return a;
}

// Server-side normalization: values cannot silently drift outside UI ranges.
{
  const C=S.normalizeSettings({autoScanMin:0,concurrency:99,flowMinPressure:10,trendMaxBars:-4,sortMode:'BAD',flowWindows:'5,15,999'});
  assert.equal(C.autoScanMin,1);
  assert.equal(C.concurrency,10);
  assert.equal(C.flowMinPressure,50);
  assert.equal(C.trendMaxBars,0);
  assert.equal(C.sortMode,'luxRecent');
  assert.equal(C.flowWindows,'5,15');
  assert(!('volEmaLength' in C));
}


// Insufficient Lux history is a normal skip, not an actual scan error.
{
  const x=S.splitScanOutcomes([
    {symbol:'NEWUSDT',skipped:'INSUFFICIENT_HISTORY'},
    {symbol:'BADUSDT',error:'Binance HTTP 500'},
    {symbol:'OKUSDT',matched:false}
  ]);
  assert.equal(x.insufficient.length,1);
  assert.equal(x.errors.length,1);
  assert.equal(x.rows.length,1);
}

// PA/C-E/EMA may disagree, but Lux admission remains true.
{
  const c=candles(), i=c.length-2;
  const C=S.normalizeSettings({...S.defaults,paEnabled:true,paLookback:5,paMinDir:5,expEnabled:true,expMode:'expansion',expThreshold1:10,emaEnabled:true,emaLength:20,emaRule:'side',trendMaxBars:20});
  const ev={dir:'LONG',index:i-1,time:c[i-1].t,price:c[i-1].c,line:c[i-1].c-.1,atr:1,slope:.1};
  const x=S.analyzeDirection(c,i,'LONG',C,[ev]);
  assert.equal(x.radar.eligible,true,'Lux event must enter radar');
  assert.equal(x.pass,true,'admission must equal Lux admission');
  assert(x.support.ce.pass===false || x.support.pa.pass===false || x.support.ema.pass===false,'at least one helper should be warning in this fixture');
}

// Lux freshness belongs to Lux itself; 0 means unlimited.
{
  const c=candles(), C=S.normalizeSettings({...S.defaults,trendMaxBars:2});
  const tr={breakIndex:10,breakTime:c[10].t,stop:{price:95},withinWindow:false};
  assert.equal(S.radarEligibility(c,40,'LONG',C,tr,[]).eligible,false);
  const C2=S.normalizeSettings({...C,trendMaxBars:0});
  tr.withinWindow=true;
  assert.equal(S.radarEligibility(c,40,'LONG',C2,tr,[]).eligible,true);
}

// Doji option is functional for helper reading only.
{
  const c=[]; for(let i=0;i<8;i++){let o=100,cx=i>=3&&i<=5?101:100;c.push({t:i,o,h:102,l:99,c:cx,v:1,T:i,q:1,trades:1,tbq:.5});}
  const base=S.normalizeSettings({...S.defaults,paLookback:5,paMinDir:4,paStructureMode:'off',paDirMetric:'body'});
  const ign=S.analyzePA(c,7,'LONG',{...base,paDoji:'ignore'});
  const ag=S.analyzePA(c,7,'LONG',{...base,paDoji:'against'});
  assert.notEqual(ign.pass,ag.pass,'doji setting must change helper result in this fixture');
}

// Legacy setup score cannot leak into radar metrics anymore.
{
  const recent={bars:[{q:100,tbq:70},{q:100,tbq:70}],previousBars:[{q:90,tbq:50},{q:90,tbq:50}],currentVolume:200,currentTrades:20,tradesPerMin:10,buyRatio:70,recentMove:.2,windowMin:2,currentPerMin:100};
  const ref={baselineBuy:30,baselineSell:30,baselineVolume:30,baselineTrades:5,points:30,interval:'1m',compareMinutes:60};
  const a=S.buildVolumeMetrics({dir:'LONG',entryPrice:100,setup:{score:0}},recent,ref,101);
  const b=S.buildVolumeMetrics({dir:'LONG',entryPrice:100,setup:{score:100}},recent,ref,101);
  assert.equal(a.radarScore,b.radarScore);
}

// Overall market context is breadth-based and has no route into RadarFlow.
{
  const up=new Map([['AUSDT',{priceChangePercent:'1'}],['BUSDT',{priceChangePercent:'2'}],['CUSDT',{priceChangePercent:'3'}],['DUSDT',{priceChangePercent:'4'}],['EUSDT',{priceChangePercent:'-1'}]]);
  assert.equal(S.marketDirectionFromTicker(up,[...up.keys()]).direction,'UP');
  const dn=new Map([['AUSDT',{priceChangePercent:'-1'}],['BUSDT',{priceChangePercent:'-2'}],['CUSDT',{priceChangePercent:'-3'}],['DUSDT',{priceChangePercent:'-4'}],['EUSDT',{priceChangePercent:'1'}]]);
  assert.equal(S.marketDirectionFromTicker(dn,[...dn.keys()]).direction,'DOWN');
}

// Notification templates remain present for the three required events.
{
  const x={symbol:'TESTUSDT',dir:'LONG',tf:'4h',livePrice:1,relativeVolume:2,volDeltaPct:100,volSpeed:1,alignedPressure:60,radarScore:80,targetPrice:1.1,stopPrice:.9,flow:{minutes:60,net:100000,pressure:65,relative:2,speed:1}};
  assert(S.featuredActivityMessage(x).includes('بطاقة أقوى لونق الآن'));
  assert(S.featuredActivityMessage(x).startsWith('Ω ALPHA PROOF'));
  assert(S.riskAlertMessage({...x,riskReason:'اختبار'}).includes('خطر انعكاس'));
  assert(S.riskAlertMessage({...x,riskReason:'اختبار'}).startsWith('Ω ALPHA PROOF'));
  assert(S.tradeExitMessage({...x,entryPrice:1},'TP',1.1,Date.now()).includes('النتيجة النهائية'));
  assert(S.tradeExitMessage({...x,entryPrice:1},'TP',1.1,Date.now()).startsWith('Ω ALPHA PROOF'));
}


// LONG and SHORT featured cards are selected independently.
{
  const now=Date.now(), C={...S.defaults,flowHoldSec:0,flowSwitchMargin:0};
  const base={flowQualifiedSince:now-1000,riskFlag:false,dataStale:false,notificationActive:true,monitorState:'تدفق مؤكد'};
  const rows=[
    {...base,symbol:'LONGUSDT',dir:'LONG',cycleId:'L',radarScore:78,flow:{eligible:true,measuredAt:now,relative:2}},
    {...base,symbol:'SHORTUSDT',dir:'SHORT',cycleId:'S',radarScore:92,flow:{eligible:true,measuredAt:now,relative:3}}
  ];
  assert.equal(S.featuredRank(rows,C,'LONG',{}).symbol,'LONGUSDT');
  assert.equal(S.featuredRank(rows,C,'SHORT',{}).symbol,'SHORTUSDT');
}

// A later scan may replace the active timeframe only when the new candidate is better.
{
  const cur={tf:'4h',breakTime:100,radarScore:70,flow:{eligible:true,relative:2,pressure:60,score:70}};
  const stronger={tf:'1d',breakTime:90,radarScore:82,flow:{eligible:true,relative:2.4,pressure:64,score:82}};
  const weaker={tf:'1d',breakTime:200,radarScore:65,flow:{eligible:true,relative:1.9,pressure:59,score:65}};
  const equalNewer={tf:'1d',breakTime:200,radarScore:70,flow:{eligible:true,relative:2,pressure:60,score:70}};
  assert.equal(S.betterTimeframeCandidate(cur,cur,stronger,stronger),true);
  assert.equal(S.betterTimeframeCandidate(cur,cur,weaker,weaker),false);
  assert.equal(S.betterTimeframeCandidate(cur,cur,equalNewer,equalNewer),true);
}


// Same symbol may be rescanned on a different timeframe; the stronger Flow candidate wins,
// not whichever timeframe happened to be scanned first.
{
  const cur={symbol:'TESTUSDT',dir:'LONG',tf:'4h',breakTime:100,radarScore:70,flow:{eligible:true,score:70,relative:2,pressure:62}};
  const better={symbol:'TESTUSDT',dir:'LONG',tf:'1d',breakTime:90,radarScore:82,flow:{eligible:true,score:82,relative:2.4,pressure:65}};
  const weaker={symbol:'TESTUSDT',dir:'LONG',tf:'1d',breakTime:120,radarScore:60,flow:{eligible:true,score:60,relative:3,pressure:70}};
  assert.equal(S.betterTimeframeCandidate(cur,cur,better,better),true);
  assert.equal(S.betterTimeframeCandidate(cur,cur,weaker,weaker),false);
  const tieNewer={...cur,tf:'1d',breakTime:150};
  assert.equal(S.betterTimeframeCandidate(cur,cur,tieNewer,tieNewer),true,'newer Lux wins only after Flow tie');
}

// LONG and SHORT strongest cards are selected independently.
{
  const now=Date.now(),C={...S.defaults,flowHoldSec:0,flowSwitchMargin:0};
  const mk=(symbol,dir,score)=>({symbol,dir,cycleId:symbol,radarScore:score,flowQualifiedSince:now-1000,notificationActive:true,monitorState:'تدفق مؤكد',riskFlag:false,dataStale:false,flow:{eligible:true,measuredAt:now,relative:2,score}});
  const rows=[mk('L1','LONG',71),mk('L2','LONG',84),mk('S1','SHORT',90),mk('S2','SHORT',75)];
  assert.equal(S.featuredRank(rows,C,'LONG').symbol,'L2');
  assert.equal(S.featuredRank(rows,C,'SHORT').symbol,'S1');
}

// UI settings audit: every visible setting control participates in cfg(), removed Volume EMA is absent.
{
  const html=fs.readFileSync('./public/index.html','utf8');
  const panel=html.split('<div class="panel" id="settingsPanel">')[1].split('<div class="panel" id="helpPanel">')[0];
  const ids=[...panel.matchAll(/<(?:input|select)[^>]+id="([^"]+)"/g)].map(m=>m[1]);
  const cfg=html.split('function cfg(){return {')[1].split('}}\nfunction applySettings')[0];
  for(const id of ids) assert(cfg.includes('#'+id),`setting ${id} is visible but not wired`);
  const backend=fs.readFileSync('./server.js','utf8')+fs.readFileSync('./radar-flow.js','utf8');
  for(const id of ids) assert(backend.includes(id),`setting ${id} is saved by UI but has no backend consumer`);
  assert(!html.includes('id="volEmaLength"'));
  assert(html.includes('/api/settings/reset'));
  assert(html.includes('/api/restart'));
  assert(html.includes('/api/telegram/test'));
  assert(html.includes('.current-name{color:var(--amber)'), 'current strongest must be gold');
  assert(html.includes('.active-name{color:var(--cyan)'), 'active radar coin must be cyan');
  assert(html.includes('.exited-name{color:var(--violet)'), 'exited radar coin must have its own violet state');
  assert(html.includes('خوف / طمع · alternative.me'), 'Fear & Greed source attribution must be adjacent');
  assert(html.includes('id="featuredLong"')&&html.includes('id="featuredShort"'), 'LONG and SHORT cards must both exist');
  assert(html.includes('.featured-long-card')&&html.includes('.featured-short-card'), 'featured card colors must differ by side');
  assert(html.includes('function tfLabel(tf)')&&html.includes("if(s==='1d')return'D'"), 'timeframe badge must render daily as D');
  const flow=fs.readFileSync('./radar-flow.js','utf8');
  for(const forbidden of ['paEnabled','expEnabled','emaEnabled','supportScore']) assert(!flow.includes(forbidden), `Flow engine leaked helper setting: ${forbidden}`);
  assert(backend.includes("if(w.wasFeatured&&state.settings.featuredTelegramEnabled)sendTelegram(tradeExitMessage"), 'final featured result alert must not be suppressed by dormant notification state');
}


// Source audit for multi-timeframe lifecycle: observing a weaker alternate timeframe must not
// permanently consume that Lux signal, and comparisons refresh both candidates.
{
  const src=fs.readFileSync('./server.js','utf8');
  assert(src.includes("seenLuxSignals?.[luxKey]?.enteredAt"),'only actually-entered Lux signals may be blocked after the active opportunity ends');
  assert(src.includes("currentMetrics=await getVolumeMetrics(current"),'current timeframe Flow must be refreshed before comparing against a new timeframe');
}

console.log('PASS: Lux-only admission, helper isolation, settings wiring, market context and notification templates');
