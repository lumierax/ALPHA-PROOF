const assert=require('assert');
const S=require('./server.js');
const now=Date.now();
const market={direction:'UP',upPct:63,downPct:31,medianChangePct:1.2,fearGreed:{value:72}};
// journeyPoint depends on internal state market context; still validate structure from a realistic row.
const w={symbol:'TESTUSDT',dir:'LONG',entryPrice:100,lastPrice:101,support:{pa:{enabled:true,pass:true,dirCount:4,lookback:5,structurePct:75},ce:{enabled:true,pass:false,ratio:1.1,mode:'expansion'},ema:{enabled:true,pass:true,dist:1.2,slope:.3,length:200}},flow:{minutes:60,volume:900000,directionalVolume:600000,net:300000,relative:2.5,pressure:66.7,persistence:75,impact:3.2,move:.3,speed:.4,acceleration:.05,score:82,eligible:true,alive:true,reason:'مؤهلة',measuredAt:now},radarScore:82,relativeVolume:2.5,alignedPressure:66.7,persistence:.75,volSpeed:.4,tradeCount:1200,monitorState:'تدفق مؤكد'};
const p=S.journeyPoint(w,now,w,'TICK',101);
assert.equal(p.price,101);assert.equal(p.movePct,1);assert.equal(p.flow.windowMin,60);assert.equal(p.flow.netExecution,300000);assert.equal(p.flow.eligible,true);assert(p.support.pa&&p.support.ce&&p.support.ema);assert('fearGreed' in (p.market||{}));assert.equal(typeof p.flags.settingsRevision,'number');
const pts=[];for(let i=0;i<500;i++)pts.push({...p,t:now+i*60000,kind:i===0?'ENTRY':i===499?'EXIT':'TICK',market:{...(p.market||{}),direction:i<250?'UP':'DOWN',fearGreed:i<300?70:30},flags:{...p.flags,risk:i===350,featured:i>100&&i<200,settingsRevision:i<400?1:2}});
const z=S.compressJourney(pts,120);assert(z.length<=120);assert.equal(z[0].kind,'ENTRY');assert.equal(z.at(-1).kind,'EXIT');assert(z.some(x=>x.market.direction==='DOWN'));assert(z.some(x=>x.market.fearGreed===30));assert(z.some(x=>x.flags.settingsRevision===2));
console.log('PASS: full learning journey structure, market/F&G context and adaptive compression');
