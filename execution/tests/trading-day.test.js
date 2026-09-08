'use strict';
const test=require('node:test'),A=require('node:assert/strict');
const TradingDay=require('../trading-day');
const LabAI=require('../../lab-ai.js');
const Portfolio=require('../../portfolio-manager.js');

test('Canonical trading day follows Binance 1D at 00:00 UTC, not Riyadh midnight',()=>{
  const beforeRiyadhMidnight=Date.UTC(2026,8,8,20,59,59);
  const afterRiyadhMidnight=Date.UTC(2026,8,8,21,0,1);
  const afterBinanceBoundary=Date.UTC(2026,8,9,0,0,1);
  A.equal(TradingDay.tradingDayId(beforeRiyadhMidnight),'2026-09-08');
  A.equal(TradingDay.tradingDayId(afterRiyadhMidnight),'2026-09-08');
  A.equal(TradingDay.tradingDayId(afterBinanceBoundary),'2026-09-09');
  A.equal(TradingDay.tradingDayStart(afterRiyadhMidnight),Date.UTC(2026,8,8,0,0,0));
});

test('Trade AI daily economics use only Binance-day buckets and quarantine legacy Riyadh buckets',()=>{
  const legacy={economics:{timezone:'Asia/Riyadh',days:[{day:'2026-09-09',trades:2,wins:1,losses:1,profitPct:1,lossPct:.5,feesPct:.4,netPct:.5}],lifetime:{trades:2,wins:1,losses:1,profitPct:1,lossPct:.5,feesPct:.4,netPct:.5}}};
  const at=Date.UTC(2026,8,8,22,0,0),pub=LabAI.economicsPublic(legacy,at),ctx=LabAI.portfolioContext(legacy,at);
  A.equal(ctx.day,'2026-09-08');A.equal(ctx.trades,0);
  A.equal(pub.timezone,'UTC');A.equal(pub.dayBoundary,TradingDay.BASIS);A.equal(pub.legacyDayBuckets,1);A.equal(pub.lifetime.trades,2);
  const current={economics:{dayBoundary:TradingDay.BASIS,days:[{day:'2026-09-08',basis:TradingDay.BASIS,trades:3,wins:2,losses:1,profitPct:2,lossPct:.5,feesPct:.6,netPct:1.5}]}};
  A.equal(LabAI.portfolioContext(current,before(21)).trades,3);
  A.equal(LabAI.portfolioContext(current,after(21)).trades,3);
  A.equal(LabAI.portfolioContext(current,Date.UTC(2026,8,9,0,0,1)).trades,0);
});
function before(hour){return Date.UTC(2026,8,8,hour-1,59,59)}
function after(hour){return Date.UTC(2026,8,8,hour,0,1)}

test('Shared portfolio retags retained fill/rejection records to the Binance trading day',()=>{
  const t=Date.UTC(2026,8,8,22,30,0),s=Portfolio.initialState();
  s.fills=[{t,day:'2026-09-09',id:'x',symbol:'BTCUSDT',side:'BUY'}];
  s.rejections=[{t,day:'2026-09-09',code:'TEST'}];
  const n=Portfolio.normalize(s),pub=Portfolio.publicState(n,{});
  A.equal(n.fills[0].day,'2026-09-08');A.equal(n.rejections[0].day,'2026-09-08');
  A.equal(pub.accounting.timezone,'UTC');A.equal(pub.accounting.dayBoundary,TradingDay.BASIS);
});
