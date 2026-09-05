const assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),R=require('./radar-flow');
const now=1800000000000;
function series(base=10000,buy=.5){return Array.from({length:600},(_,i)=>({t:now-(600-i)*300000,T:now-(599-i)*300000-1,q:base,tbq:base*buy,o:100,c:100,trades:100}))}
function wave(base=10000,amount=100000,pressure=.8){let b=series(base);b.slice(-12).forEach((z,i)=>{z.q=amount*(i%3===0?1.3:1);z.tbq=z.q*pressure;z.o=100+i*.1;z.c=100+(i+1)*.1});return b}
let C={flowWindows:'60',flowHoldSec:0};
assert.equal(R.evaluate(series(), 'LONG',C,now).eligible,false,'flat activity');
let strong=R.evaluate(wave(),'LONG',C,now);assert.equal(strong.eligible,true,'sustained directional wave');
assert.equal(R.evaluate(wave(10000,100000,.5),'LONG',C,now).eligible,false,'balanced volume');
assert.equal(R.evaluate(wave(10000,100000,.2),'LONG',C,now).eligible,false,'selling volume');
assert.equal(R.evaluate(wave(10,1000),'LONG',C,now).eligible,false,'tiny baseline illusion');
assert.equal(R.evaluate(wave(100000,100000),'LONG',C,now).eligible,false,'normal big coin');
let absorbed=wave();absorbed.slice(-12).forEach(z=>z.o=z.c=100);assert.equal(R.evaluate(absorbed,'LONG',C,now).eligible,false,'no price response');
let stale=wave().map(z=>({...z,t:z.t-900000,T:z.T-900000}));assert.equal(R.evaluate(stale,'LONG',C,now).eligible,false,'stale data');
let fade=wave();fade.slice(-3).forEach(z=>{z.q=1000;z.tbq=100});assert.equal(R.evaluate(fade,'LONG',C,now).eligible,false,'old burst faded');
let short=wave(10000,100000,.2);short.slice(-12).forEach((z,i)=>{z.o=100-i*.1;z.c=100-(i+1)*.1});assert.equal(R.evaluate(short,'SHORT',C,now).eligible,true,'short symmetry');
assert.equal(R.evaluate(wave(),'LONG',{...C,flowMinQuote:1e9},now).eligible,false,'setting changes gate');
let row={symbol:'TEST',flow:strong,radarScore:strong.score,flowQualifiedSince:now-120000};
assert.equal(R.select([row],C,now),row);assert.equal(R.select([{...row,dataStale:true}],C,now),null);assert.equal(R.select([row],{...C,flowHoldSec:300},now),null);
assert.equal(R.select([{...row,notificationActive:false}],C,now),null);
for(const file of ['index.html','public/index.html']){const html=fs.readFileSync(__dirname+'/'+file,'utf8');for(const m of html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g))new vm.Script(m[1]);const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);assert.equal(new Set(ids).size,ids.length,'unique UI IDs');for(const k of Object.keys(R.defaults))assert(ids.includes(k),k);}
const browser=fs.readFileSync(__dirname+'/index.html','utf8');assert(browser.includes(fs.readFileSync(__dirname+'/radar-flow.js','utf8')),'identical browser engine');
// Constant gross turnover can conceal a directional change. Compare each side to its own past.
let shift=series(100000,.2);shift.slice(-12).forEach((z,i)=>{z.tbq=80000;z.o=100+i*.1;z.c=z.o+.1});
let shifted=R.evaluate(shift,'LONG',C,now);assert.equal(shifted.relative,4);assert.equal(shifted.directionalVolume,960000);assert(shifted.speed>0);assert(shifted.acceleration>0);
let steadyBuy=series(100000,.5);steadyBuy.slice(-12).forEach(z=>{z.q=500000;z.tbq=50000});
let sellerWave=R.evaluate(steadyBuy,'LONG',C,now);assert.equal(sellerWave.relative,1);assert.equal(sellerWave.speed,0);assert.equal(sellerWave.eligible,false);
let mirror=shift.map(z=>({...z,tbq:z.q-z.tbq,o:200-z.o,c:200-z.c}));let mirrored=R.evaluate(mirror,'SHORT',C,now);assert.equal(mirrored.relative,shifted.relative);assert.equal(mirrored.speed,shifted.speed);assert.equal(mirrored.net,shifted.net);
assert.equal(R.evaluate(wave(),'LONG',{...C,flowDirectionalReferenceRate:0},now).eligible,false,'zero directional reference');
assert.equal(R.evaluate(wave(),'LONG',{...C,flowDirectionalReferenceRate:1000000},now).eligible,false,'configured historical directional reference used');
assert(strong.persistence>=55,'repeated uneven bursts retain persistence');
console.log('PASS: directional RVOL/speed/acceleration, seller-only surge rejected, symmetry, zero baseline, repeated bursts, controls, stale guards and browser parity');
