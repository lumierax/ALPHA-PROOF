'use strict';
// ALPHA PROOF has one canonical trading-day boundary: Binance Spot 1D klines.
// Binance's default Spot 1D kline opens at 00:00 UTC. Never derive the trading
// day from the server timezone or from Asia/Riyadh local midnight.
const BASIS='BINANCE_SPOT_1D_UTC';
const TIMEZONE='UTC';
const OPEN_UTC='00:00';
function timestamp(value=Date.now()){
  const n=Number(value);
  if(!Number.isFinite(n)) throw new TypeError('INVALID_TRADING_DAY_TIMESTAMP');
  return n;
}
function id(value=Date.now()){return new Date(timestamp(value)).toISOString().slice(0,10)}
function start(value=Date.now()){
  const d=new Date(timestamp(value));
  return Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate());
}
function metadata(){return {basis:BASIS,timezone:TIMEZONE,openUTC:OPEN_UTC}}
module.exports={BASIS,TIMEZONE,OPEN_UTC,id,start,metadata};
