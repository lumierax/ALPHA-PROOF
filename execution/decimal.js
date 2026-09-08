'use strict';

// Exact fixed-point decimal arithmetic. No binary floats in balances or filters.
const SCALE = 10n ** 12n;
function parse(value) {
  if (typeof value !== 'string' || value.length > 32 || !/^-?(0|[1-9]\d*)(\.\d{1,12})?$/.test(value)) {
    throw Object.assign(new Error('Use a decimal string with at most 12 decimal places'), {code:'INVALID_DECIMAL'});
  }
  const negative = value[0] === '-';
  const [whole, fraction = ''] = (negative ? value.slice(1) : value).split('.');
  const result = BigInt(whole) * SCALE + BigInt(fraction.padEnd(12, '0'));
  if (result > 10n ** 27n) throw Object.assign(new Error('Decimal exceeds supported range'), {code:'INVALID_DECIMAL'});
  return negative ? -result : result;
}
function format(value) {
  const n = BigInt(value), abs = n < 0n ? -n : n;
  const fraction = (abs % SCALE).toString().padStart(12, '0').replace(/0+$/, '');
  return `${n < 0n ? '-' : ''}${abs / SCALE}${fraction ? '.' + fraction : ''}`;
}
const mul = (a,b) => a * b / SCALE;
const ceilDiv = (a,b) => { if (a < 0n || b <= 0n) throw new Error('Invalid positive division'); return (a+b-1n)/b; };
const cost = (a,b) => ceilDiv(a*b,SCALE);
const fee = amount => ceilDiv(amount * 10n, 10000n); // 0.10% each side, no BNB.
const floorStep = (n,step) => step > 0n ? n / step * step : n;
const ceilStep = (n,step) => step > 0n ? ceilDiv(n,step) * step : n;
module.exports = {SCALE,parse,format,mul,cost,fee,ceilDiv,floorStep,ceilStep};
