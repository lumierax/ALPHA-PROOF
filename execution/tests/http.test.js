'use strict';
const test=require('node:test'),A=require('node:assert/strict'),http=require('node:http'),{PassThrough}=require('node:stream');
const {fixture}=require('./fixtures');
const {createService,readBody,PublicMarketData}=require('../http');
const token='execution-test-token-with-32-characters';
async function setup(t,{market,configured=token}={}) {
  const f=fixture(t);let calls=0;
  const feed=market||{get:async symbol=>{calls++;const ctx=f.context();A.equal(symbol,ctx.symbol);return ctx;}};
  const service=createService({lab:f.lab,token:configured,market:feed});
  const server=http.createServer(async(req,res)=>{if(!await service.handle(req,res,new URL(req.url,'http://test'))){res.writeHead(404);res.end();}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));service.close();});
  const base='http://127.0.0.1:'+server.address().port;
  const post=(route,body={},headers={})=>fetch(base+'/api/execution'+route,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token,...headers},body:JSON.stringify(body)});
  return {...f,service,server,base,post,calls:()=>calls};
}
test('HTTP write controls are closed without a configured token; reads disclose no token',async t=>{
  const f=await setup(t,{configured:''});const r=await f.post('/kill');A.equal(r.status,503);
  const state=await (await fetch(f.base+'/api/execution/state')).json();A.equal(state.controlsConfigured,false);A(!JSON.stringify(state).includes(token));
});
test('HTTP rejects unauthorized and cross-origin mutation before market data or journal writes',async t=>{
  const f=await setup(t),sequence=f.lab.status().durability.sequence;
  A.equal((await f.post('/orders',f.order(),{Authorization:'Bearer wrong'})).status,401);
  A.equal((await f.post('/orders',f.order(),{Origin:'https://untrusted.example'})).status,403);
  A.equal(f.calls(),0);A.equal(f.lab.status().durability.sequence,sequence);
});
test('HTTP refuses real modes, Testnet placement, forged quotes and unexpected fields before fetching',async t=>{
  const f=await setup(t);
  for(const body of [f.order({mode:'LIVE'}),f.order({mode:'TESTNET'}),f.order({quote:{askPrice:'1'}}),f.order({eligible:true}),f.order({baseURL:'https://example.com'})])A.equal((await f.post('/orders',body)).status,422);
  A.equal(f.calls(),0);A.equal(f.lab.status().portfolio.cashUSDT,'10000');
});
test('HTTP plan, submit, retry, cancel and Kill Switch use actual Paper state',async t=>{
  const f=await setup(t);A.equal((await f.post('/plans',f.order({mode:'TESTNET'}))).status,200);
  A.equal(f.lab.status().orders.length,0);
  const first=await (await f.post('/orders',f.order())).json();A.equal(first.order.status,'FILLED');const calls=f.calls();
  const retry=await (await f.post('/orders',f.order())).json();A.equal(retry.duplicate,true);A.equal(f.calls(),calls);
  A.equal((await f.post('/orders',f.order({quantity:'2'}))).status,422);
  A.equal((await f.post('/orders',f.order({clientOrderId:'ap-order002',type:'LIMIT',price:'90'}))).status,200);
  A.equal((await f.post('/cancel',{clientOrderId:'ap-order002'})).status,200);
  A.equal((await f.post('/kill')).status,200);A.equal(f.lab.status().killSwitch.active,true);
  A.equal((await f.post('/reconcile')).status,200);A.equal((await f.post('/resume')).status,200);
});
test('Kill remains immediately usable while an order waits for a slow quote',async t=>{
  let unblock,started;
  const waiting=new Promise(resolve=>started=resolve),deferred=new Promise(resolve=>unblock=resolve);
  const f=await setup(t,{market:{get:async()=>{started();await deferred;return f.context();}}});
  const pending=f.post('/orders',f.order());await waiting;
  A.equal((await f.post('/kill')).status,200);unblock();
  A.equal((await pending).status,422);A.equal(f.lab.status().recentFills.length,0);
});
test('Malformed JSON, arrays, oversized bodies and wrong content type return client errors',async t=>{
  const f=await setup(t),headers={'Content-Type':'application/json',Authorization:'Bearer '+token};
  for(const body of ['{','[]','null'])A.equal((await fetch(f.base+'/api/execution/kill',{method:'POST',headers,body})).status,400);
  A.equal((await fetch(f.base+'/api/execution/kill',{method:'POST',headers,body:JSON.stringify({x:'x'.repeat(65536)})})).status,413);
  A.equal((await f.post('/kill',{}, {'Content-Type':'text/plain'})).status,415);
});
test('JSON body preserves Arabic split across UTF-8 chunks and rejects aborted streams',async()=>{
  const request=new PassThrough(),promise=readBody(request),bytes=Buffer.from(JSON.stringify({reason:'اختبار عربي'}));
  for(let i=0;i<bytes.length;i++)request.write(bytes.subarray(i,i+1));request.end();
  A.deepEqual(await promise,{reason:'اختبار عربي'});
  const aborted=new PassThrough(),pending=readBody(aborted);aborted.emit('aborted');await A.rejects(pending,e=>e.code==='REQUEST_ABORTED');
});
test('Public market adapter only issues credential-free GETs to a fixed data host',async()=>{
  const calls=[],clock=()=>Date.now();
  const feed=new PublicMarketData({clock,fetcher:async(url,options)=>{calls.push({url,options});const endpoint=new URL(url).pathname;
    return {ok:true,json:async()=>endpoint.endsWith('exchangeInfo')?{symbols:[{symbol:'BTCUSDT'}]}:endpoint.endsWith('avgPrice')?{mins:5,price:'100'}:{symbol:'BTCUSDT',price:'100',bidPrice:'100',askPrice:'100',bidQty:'1',askQty:'1'}};
  }});
  await feed.get('BTCUSDT');A.equal(calls.length,4);
  for(const call of calls){A.equal(call.options.method,'GET');A.equal(new URL(call.url).origin,'https://data-api.binance.vision');A.equal(call.options.redirect,'error');A.deepEqual(Object.keys(call.options.headers),['Accept']);}
  await A.rejects(()=>feed.get('../order'),e=>e.code==='SPOT_USDT_ONLY');A.equal(calls.length,4);
});
