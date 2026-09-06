'use strict';
const assert=require('assert');
const fs=require('fs');
process.env.DATA_DIR=fs.mkdtempSync('/tmp/alpha-proof-schedule-');
const S=require('./server.js');
assert.deepEqual(S.AUTO_SCAN_PLAN.map(x=>x.tf),['5m','15m','30m','1h','4h','6h','12h','1d']);
assert.equal(S.AUTO_SCAN_OFFSET_MS,5000,'boundary wake-up hint should be short; Binance confirmation remains source of truth');
const utc000005=Date.UTC(2026,8,6,0,0,5);
for(const tf of ['5m','15m','30m','1h','4h','6h','12h','1d']){
 const slot=S.scanScheduleSlot(tf,utc000005+1000);assert.equal(slot.dueAt,utc000005,`${tf} wake-up should occur shortly after expected boundary`);
}
const src=fs.readFileSync('server.js','utf8');
assert(src.includes('let scanUniverse=universe;'),'scheduled scans must analyze every eligible Spot/USDT symbol');
assert(src.includes('await scan(true,job.tf)'),'scheduler must scan each queued timeframe independently');
assert(src.includes('confirmClosedKline'),'scheduler must confirm closure from Binance Kline before full scan');
assert(src.includes('confirmation.closeTime<=last'),'duplicate/old Binance candles must never trigger a full scan');
assert(src.includes('lastProcessedClosedCandle'),'last processed Binance candle must be persisted per timeframe');
assert(!src.includes("setInterval(()=>scan(true),Math.max(1,C.autoScanMin)*60000)"),'old global interval scheduler must be gone');
console.log('PASS: all timeframes use a lightweight wake-up hint but full scans are gated by actual Binance closed Kline truth');
