'use strict';

// ALPHA PROOF has one canonical trading-day boundary: Binance Spot 1D candles.
// Binance 1D opens/closes at 00:00 UTC. UI local time must never redefine this day.
const DAY_MS=86400000;
const BASIS='BINANCE_1D_UTC';
const TIMEZONE='UTC';
function tradingDayId(now=Date.now()) {
  const t=Number(now);
  if(!Number.isFinite(t)) throw new TypeError('INVALID_TRADING_DAY_TIME');
  return new Date(t).toISOString().slice(0,10);
}
function tradingDayStart(now=Date.now()) {
  return Date.parse(tradingDayId(now)+'T00:00:00.000Z');
}
module.exports={DAY_MS,BASIS,TIMEZONE,tradingDayId,tradingDayStart};
