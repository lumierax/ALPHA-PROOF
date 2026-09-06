'use strict';
const assert=require('assert');
const fs=require('fs');
process.env.DATA_DIR=fs.mkdtempSync('/tmp/alpha-proof-schedule-');
const S=require('./server.js');
assert.deepEqual(S.AUTO_SCAN_PLAN.map(x=>x.tf),['5m','15m','30m','1h','4h','6h','12h','1d']);
assert.equal(S.AUTO_SCAN_OFFSET_MS,60000);
const riyadh0301=Date.UTC(2026,8,6,0,1,0); // 03:01 Asia/Riyadh
for(const tf of ['5m','15m','30m','1h','4h','6h','12h','1d']){
  const slot=S.scanScheduleSlot(tf,riyadh0301+5000);
  assert.equal(slot.dueAt,riyadh0301,`${tf} must be due one minute after its 00:00 UTC boundary`);
}
assert.equal(S.nextAutoScanAt('5m',riyadh0301+5000),Date.UTC(2026,8,6,0,6,0));
assert.equal(S.nextAutoScanAt('15m',riyadh0301+5000),Date.UTC(2026,8,6,0,16,0));
assert.equal(S.nextAutoScanAt('1h',riyadh0301+5000),Date.UTC(2026,8,6,1,1,0));
assert.equal(S.nextAutoScanAt('4h',riyadh0301+5000),Date.UTC(2026,8,6,4,1,0));
assert.equal(S.nextAutoScanAt('1d',riyadh0301+5000),Date.UTC(2026,8,7,0,1,0));
const src=fs.readFileSync('server.js','utf8');
assert(src.includes('let scanUniverse=universe;'),'scheduled scans must analyze every eligible Spot/USDT symbol, including already-active symbols');
assert(src.includes('await scan(true,job.tf)'),'scheduler must scan each queued timeframe independently');
assert(!src.includes("setInterval(()=>scan(true),Math.max(1,C.autoScanMin)*60000)"),'old one-global-interval auto scan must be gone');
console.log('PASS: independent 5m/15m/30m/1h/4h/6h/12h/1d scheduler aligned +1 minute after Binance candle boundaries');

assert(src.includes('confirmClosedKline'),'scheduler must confirm closure from Binance Kline before full scan');assert(src.includes('lastProcessedClosedCandle'),'scheduler must persist last processed Binance candle per timeframe');
