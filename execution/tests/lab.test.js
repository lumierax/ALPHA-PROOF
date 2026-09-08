'use strict';
const test=require('node:test'),A=require('node:assert/strict'),fs=require('node:fs');
const {fixture}=require('./fixtures');
const D=require('../decimal');
const {ExecutionLab}=require('../lab');
const expectCode=(run,code)=>A.throws(run,e=>e.code===code);
test('Decimal accounting and step validation remain exact for tiny prices',()=>{
  A.equal(D.format(D.parse('0.1')+D.parse('0.2')),'0.3');
  A.equal(D.format(D.fee(D.parse('100'))),'0.1');
  A.equal(D.parse('0.00000001')%D.parse('0.00000001'),0n);
  for(const bad of ['1e3','NaN','Infinity','1.0000000000001',1,null,true,'',{},'01'])expectCode(()=>D.parse(bad),'INVALID_DECIMAL');
});
test('Live and Testnet placement fail closed before any fills or balances change',t=>{
  const f=fixture(t),before=f.lab.status().portfolio;
  for(const mode of ['LIVE','BINANCE','live','PAPRE','FUTURES',''])expectCode(()=>f.lab.submit(f.order({mode}),[f.context()]),'LIVE_EXECUTION_FORBIDDEN');
  expectCode(()=>f.lab.submit(f.order({mode:'TESTNET'}),[f.context()]),'TESTNET_PLAN_ONLY');
  A.deepEqual(f.lab.status().portfolio,before);A.equal(f.lab.status().recentFills.length,0);
  expectCode(()=>new ExecutionLab({directory:f.directory+'/live',mode:'LIVE'}),'LIVE_EXECUTION_FORBIDDEN');
});
test('Testnet yields an unsigned draft without creating orders or reservations',t=>{
  const f=fixture(t),p=f.lab.plan(f.order({mode:'TESTNET'}),[f.context()]);
  A.equal(p.ok,true);A.equal(p.request.baseURL,'https://testnet.binance.vision');A.equal(p.request.signed,false);A.equal(p.sendEnabled,false);
  A.equal(f.lab.status().orders.length,0);A.equal(f.lab.status().portfolio.reservedUSDT,'0');
});
test('The canonical intent returned in a Paper plan can be submitted directly',t=>{
  const f=fixture(t),p=f.lab.plan(f.order(),[f.context()]);
  A.equal(f.lab.submit(p.intent,[f.context()]).order.status,'FILLED');
});
test('Paper round trip has exact costs, inventory, entry and exit fills',t=>{
  const f=fixture(t),b=f.lab.submit(f.order(),[f.context()]);
  A.equal(b.order.status,'FILLED');A.equal(b.order.notional,'100.05');
  A.equal(f.lab.status().portfolio.cashUSDT,'9899.84995');
  f.advance();const ctx=f.context();ctx.quote.bidPrice='101';ctx.quote.askPrice='101';
  const sell=f.lab.submit(f.order({clientOrderId:'ap-sell0001',side:'SELL'}),[ctx]);
  A.equal(sell.order.status,'FILLED');A.equal(sell.order.notional,'100.94');
  const p=f.lab.status().portfolio;
  A.equal(p.cashUSDT,'10000.68901');A.equal(p.realizedPnlUSDT,'0.68901');A.equal(p.feesUSDT,'0.20099');A.equal(p.positions.length,0);
  A.equal(f.lab.reconcile().ok,true);
});
test('Retry of the same client id never spends twice; conflicting intent is rejected',t=>{
  const f=fixture(t);f.lab.submit(f.order(),[f.context()]);const cash=f.lab.status().portfolio.cashUSDT;
  f.advance(100000);A.equal(f.lab.submit(f.order()).duplicate,true);
  A.equal(f.lab.status().portfolio.cashUSDT,cash);A.equal(f.lab.status().recentFills.length,1);
  expectCode(()=>f.lab.submit(f.order({quantity:'2'})),'IDEMPOTENCY_CONFLICT');
});
test('Limit orders reserve cash; another order cannot overspend reserved funds',t=>{
  const f=fixture(t,{initialCapitalUSDT:'200'}),ctx=f.context();
  const b=f.lab.submit(f.order({type:'LIMIT',price:'90'}),[ctx]);
  A.equal(b.order.status,'NEW');A.equal(f.lab.status().portfolio.reservedUSDT,'90.09');
  expectCode(()=>f.lab.submit(f.order({clientOrderId:'ap-order002',type:'LIMIT',price:'90',quantity:'1.5'}),[ctx]),'INSUFFICIENT_AVAILABLE_CASH');
  A.equal(f.lab.status().portfolio.cashUSDT,'200');
  f.lab.cancel('ap-order001');A.equal(f.lab.status().portfolio.availableUSDT,'200');
});
test('Partial fills share snapshot liquidity and are not duplicated by repeated ticks',t=>{
  const f=fixture(t),ctx=f.context();ctx.quote.askQty='5';
  f.lab.submit(f.order({type:'LIMIT',price:'101'}),[ctx]);
  A.equal(f.lab.status().orders[0].filled,'0.5');
  f.lab.submit(f.order({clientOrderId:'ap-order002',type:'LIMIT',price:'101'}),[ctx]);
  f.lab.tick([ctx]);A.equal(f.lab.status().recentFills.length,1);
  f.advance();const fresh=f.context();fresh.quote.askQty='5';f.lab.tick([fresh]);
  A.equal(f.lab.lookup(f.order({type:'LIMIT',price:'101'})).status,'FILLED');
  A.equal(f.lab.lookup(f.order({clientOrderId:'ap-order002',type:'LIMIT',price:'101'})).filled,'0');
  A.equal(f.lab.reconcile().ok,true);
});
test('Restart cannot replenish already consumed liquidity from the same snapshot',t=>{
  const f=fixture(t),ctx=f.context();ctx.quote.askQty='5';
  f.lab.submit(f.order({type:'LIMIT',price:'101'}),[ctx]);f.lab.close();
  const restarted=new ExecutionLab({directory:f.directory,clock:f.now});t.after(()=>restarted.close());
  restarted.resume([ctx]);restarted.tick([ctx]);A.equal(restarted.status().orders[0].filled,'0.5');
});
test('A resting buy loses eligibility when its symbol leaves Lux radar',t=>{
  const f=fixture(t);f.lab.submit(f.order({type:'LIMIT',price:'90'}),[f.context()]);f.advance();
  const ctx=f.context({eligible:false});ctx.quote.bidPrice='89';ctx.quote.askPrice='89';f.lab.tick([ctx]);
  A.equal(f.lab.status().orders[0].status,'CANCELED');A.equal(f.lab.status().recentFills.length,0);
});
test('Tick rounding cannot exceed the maximum permitted slippage',t=>{
  const f=fixture(t),ctx=f.context();ctx.rules.filters[0].tickSize='1';
  const o=f.lab.submit(f.order(),[ctx]).order;A.equal(o.status,'EXPIRED');A.equal(o.filled,'0');
});
test('Market orders expire unfilled remainder; FOK never fills partially; IOC does not rest',t=>{
  const f=fixture(t),ctx=f.context();ctx.quote.askQty='5';
  const m=f.lab.submit(f.order(),[ctx]).order;A.equal(m.status,'EXPIRED');A.equal(m.filled,'0.5');A.equal(f.lab.status().portfolio.reservedUSDT,'0');
  f.advance();const fresh=f.context();fresh.quote.askQty='5';
  const fok=f.lab.submit(f.order({clientOrderId:'ap-order002',type:'LIMIT',price:'101',timeInForce:'FOK'}),[fresh]).order;
  A.equal(fok.status,'EXPIRED');A.equal(fok.filled,'0');
  const ioc=f.lab.submit(f.order({clientOrderId:'ap-order003',type:'LIMIT',price:'90',timeInForce:'IOC'}),[fresh]).order;
  A.equal(ioc.status,'EXPIRED');A.equal(ioc.filled,'0');
});
test('SELL reserves owned inventory, supports partial exits and cannot short',t=>{
  const f=fixture(t);expectCode(()=>f.lab.submit(f.order({side:'SELL',clientOrderId:'ap-nocoins1'}),[f.context()]),'INSUFFICIENT_AVAILABLE_POSITION');
  f.lab.submit(f.order(),[f.context()]);f.advance();
  f.lab.submit(f.order({clientOrderId:'ap-sell0001',side:'SELL',quantity:'0.5',type:'LIMIT',price:'110'}),[f.context()]);
  A.equal(f.lab.status().portfolio.positions[0].availableQuantity,'0.5');
  expectCode(()=>f.lab.submit(f.order({clientOrderId:'ap-sell0002',side:'SELL',quantity:'0.6'}),[f.context()]),'INSUFFICIENT_AVAILABLE_POSITION');
  f.lab.cancel('ap-sell0001');f.lab.submit(f.order({clientOrderId:'ap-sell0003',side:'SELL',quantity:'0.5'}),[f.context()]);
  A.equal(f.lab.status().portfolio.positions[0].quantity,'0.5');A.equal(f.lab.reconcile().ok,true);
});
test('Filter checks refuse invalid lots, prices, notionals and short direction',t=>{
  const f=fixture(t);
  for(const [changes,code] of [[{quantity:'1.0001'},'LOT_SIZE'],[{type:'LIMIT',price:'100.001'},'PRICE_FILTER'],[{quantity:'0.001'},'MIN_NOTIONAL'],[{side:'SHORT'},'SPOT_LONG_ONLY'],[{symbol:'BTCBUSD'},'SPOT_USDT_ONLY'],[{type:'STOP_LOSS'},'UNSUPPORTED_ORDER_TYPE']]) {
    A.equal(f.lab.plan(f.order(changes),[f.context()]).code,code);
  }
  const ctx=f.context();ctx.rules.filters.push({filterType:'NEW_UNKNOWN_FILTER'});A.equal(f.lab.plan(f.order(),[ctx]).code,'UNSUPPORTED_SYMBOL_FILTER');
});
test('Rejected orders are durable terminal outcomes and cannot be silently changed on retry',t=>{
  const f=fixture(t),order=f.order({quantity:'3'});
  expectCode(()=>f.lab.submit(order,[f.context()]),'ORDER_NOTIONAL_LIMIT');
  A.equal(f.lab.status().orders[0].status,'REJECTED');A.equal(f.lab.status().portfolio.reservedUSDT,'0');A.equal(f.lab.reconcile().ok,true);
  expectCode(()=>f.lab.submit(order,[f.context()]),'ORDER_NOTIONAL_LIMIT');
  expectCode(()=>f.lab.submit({...order,quantity:'1'},[f.context()]),'IDEMPOTENCY_CONFLICT');
});
test('Market lot and percent-price filters use their supplied reference, never guess',t=>{
  const f=fixture(t),ctx=f.context();ctx.rules.filters.push({filterType:'MARKET_LOT_SIZE',minQty:'0',maxQty:'0.5',stepSize:'0'});
  A.equal(f.lab.plan(f.order(),[ctx]).code,'MARKET_LOT_SIZE');
  ctx.rules.filters.pop();ctx.rules.filters.push({filterType:'PERCENT_PRICE',multiplierUp:'1.05',multiplierDown:'0.95',avgPriceMins:5});
  A.equal(f.lab.plan(f.order({type:'LIMIT',price:'110'}),[ctx]).code,'PERCENT_PRICE');
  ctx.average.mins=1;A.equal(f.lab.plan(f.order(),[ctx]).code,'FILTER_REFERENCE_MISSING');
});
test('New orders reject stale data, crossed books, wide spreads, missing Lux and metadata',t=>{
  const f=fixture(t);
  const stale=f.context();stale.quote.asOf-=16000;A.equal(f.lab.plan(f.order(),[stale]).code,'STALE_MARKET_DATA');
  const crossed=f.context();crossed.quote.askPrice='99';A.equal(f.lab.plan(f.order(),[crossed]).code,'INVALID_ORDER_BOOK');
  const wide=f.context();wide.quote.askPrice='101';A.equal(f.lab.plan(f.order(),[wide]).code,'SPREAD_LIMIT');
  f.advance();A.equal(f.lab.plan(f.order(),[f.context({eligible:false})]).code,'LUX_RADAR_REQUIRED');
  f.advance();const noFilters=f.context();delete noFilters.rules;A.equal(f.lab.plan(f.order(),[noFilters]).code,'SPOT_SYMBOL_NOT_TRADABLE');
});
test('Order, symbol, gross exposure and order-rate limits fail before reservation',t=>{
  const f=fixture(t,{risk:{maxOrderUSDT:'100',maxSymbolUSDT:'150',maxGrossUSDT:'160',maxOrdersPerMinute:2}});
  A.equal(f.lab.plan(f.order(),[f.context()]).code,'ORDER_NOTIONAL_LIMIT');
  f.lab.submit(f.order({type:'LIMIT',price:'90'}),[f.context()]);
  A.equal(f.lab.plan(f.order({clientOrderId:'ap-order002',type:'LIMIT',price:'90'}),[f.context()]).code,'SYMBOL_EXPOSURE_LIMIT');
  f.lab.cancel('ap-order001');f.lab.submit(f.order({clientOrderId:'ap-order002',type:'LIMIT',price:'90'}),[f.context()]);
  A.equal(f.lab.plan(f.order({clientOrderId:'ap-order003',quantity:'0.2'}),[f.context()]).code,'ORDER_RATE_LIMIT');
});
test('Daily loss triggers latched cancel-all and midnight does not erase total losses',t=>{
  const f=fixture(t,{risk:{maxDailyLossUSDT:'1',maxDrawdownUSDT:'100'}});
  f.lab.submit(f.order(),[f.context()]);
  f.lab.submit(f.order({clientOrderId:'ap-order002',type:'LIMIT',price:'90'}),[f.context()]);
  f.advance();const down=f.context();down.quote.bidPrice='95';down.quote.askPrice='95';down.quote.id+='-down';
  f.lab.tick([down]);A.equal(f.lab.status().killSwitch.reason,'DAILY_LOSS_LIMIT');A.equal(f.lab.status().openOrders,0);
  const loss=f.lab.status().portfolio.totalPnlUSDT;
  expectCode(()=>f.lab.resume([down]),'DAILY_LOSS_LIMIT');
  f.advance(86400000);const tomorrow=f.context();tomorrow.quote.bidPrice='95';tomorrow.quote.askPrice='95';
  f.lab.resume([tomorrow]);A.equal(f.lab.status().portfolio.dailyPnlUSDT,'0');A.equal(f.lab.status().portfolio.totalPnlUSDT,loss);
  A.equal(f.lab.status().portfolio.rolling7dPnlUSDT,loss);
});
test('High-water drawdown remains enforced across days and restarts',t=>{
  const f=fixture(t,{risk:{maxDailyLossUSDT:'1000',maxDrawdownUSDT:'1'}});f.lab.submit(f.order(),[f.context()]);
  f.advance(86400000);const down=f.context();down.quote.bidPrice='95';down.quote.askPrice='95';f.lab.tick([down]);
  A.equal(f.lab.status().killSwitch.reason,'DRAWDOWN_LIMIT');expectCode(()=>f.lab.resume([down]),'DRAWDOWN_LIMIT');
});
test('Kill cancels resting orders, releases reservations and leaves positions intact',t=>{
  const f=fixture(t);f.lab.submit(f.order(),[f.context()]);f.lab.submit(f.order({clientOrderId:'ap-order002',type:'LIMIT',price:'90'}),[f.context()]);
  const quantity=f.lab.status().portfolio.positions[0].quantity;
  f.lab.kill();A.equal(f.lab.status().portfolio.reservedUSDT,'0');A.equal(f.lab.status().portfolio.positions[0].quantity,quantity);
  expectCode(()=>f.lab.submit(f.order({clientOrderId:'ap-order003'}),[f.context()]),'KILL_SWITCH_ACTIVE');
  f.lab.resume([f.context()]);A.equal(f.lab.status().killSwitch.active,false);
});
test('PnL and daily records keep updating while execution is killed',t=>{
  const f=fixture(t);f.lab.submit(f.order(),[f.context()]);f.lab.kill();
  const before=f.lab.status().portfolio.dailyPnlUSDT;f.advance();
  const ctx=f.context();ctx.quote.bidPrice='99';ctx.quote.askPrice='99';f.lab.tick([ctx]);
  const status=f.lab.status();A.equal(status.killSwitch.active,true);A(D.parse(status.portfolio.dailyPnlUSDT)<D.parse(before));
  A.equal(status.portfolio.dailyPnlUSDT,status.portfolio.totalPnlUSDT);A.equal(status.recentFills.length,1);
});
test('Maximum position count includes both filled symbols and pending buys',t=>{
  const f=fixture(t,{risk:{maxPositions:1}});f.lab.submit(f.order({type:'LIMIT',price:'90'}),[f.context()]);
  const eth=f.context();eth.symbol='ETHUSDT';eth.rules.symbol='ETHUSDT';eth.quote.id+='-eth';
  A.equal(f.lab.plan(f.order({clientOrderId:'ap-eth00001',symbol:'ETHUSDT'}),[eth]).code,'POSITION_COUNT_LIMIT');
});
test('Open orders stay visible even after more than 60 terminal orders',t=>{
  const f=fixture(t,{risk:{maxOrdersPerMinute:1000}});f.lab.submit(f.order({type:'LIMIT',price:'90'}),[f.context()]);
  for(let i=0;i<65;i++)expectCode(()=>f.lab.submit(f.order({clientOrderId:'ap-rejected'+String(i).padStart(4,'0'),quantity:'3'}),[f.context()]),'ORDER_NOTIONAL_LIMIT');
  A.equal(f.lab.status().orders[0].clientOrderId,'ap-order001');A.equal(f.lab.status().orders[0].status,'NEW');
});
test('TTL expires resting orders even while market data is stale',t=>{
  const f=fixture(t);f.lab.submit(f.order({type:'LIMIT',price:'90',ttlMs:1000}),[f.context()]);f.advance(20000);f.lab.tick();
  A.equal(f.lab.status().orders[0].status,'EXPIRED');A.equal(f.lab.status().portfolio.reservedUSDT,'0');
});
test('Matching freezes on stale held-position marks',t=>{
  const f=fixture(t);f.lab.submit(f.order(),[f.context()]);f.advance(16000);f.lab.tick();A.equal(f.lab.status().killSwitch.reason,'STALE_MARKET_DATA');
  A.equal(f.lab.status().portfolio.valuationFresh,false);expectCode(()=>f.lab.resume(),'STALE_MARKET_DATA');
});
test('Duplicate reports are idempotent and forged execution facts cannot mutate balances',t=>{
  const f=fixture(t);f.lab.submit(f.order(),[f.context()]);const fill=Object.values(f.lab.paperSnapshot().fills)[0],cash=f.lab.status().portfolio.cashUSDT;
  A.equal(f.lab.receiveReport(fill).duplicate,true);
  expectCode(()=>f.lab.receiveReport({...fill,quantity:'2000000000000'}),'UNVERIFIED_EXECUTION_REPORT');A.equal(f.lab.status().portfolio.cashUSDT,cash);
});
test('Reconciliation detects external mismatches and resolves uncertain known Paper status',t=>{
  const f=fixture(t);f.lab.submit(f.order({type:'LIMIT',price:'90'}),[f.context()]);f.lab.recordUncertain('ap-order001');
  A.equal(f.lab.status().orders[0].status,'UNKNOWN');A.equal(f.lab.reconcile().ok,true);A.equal(f.lab.status().orders[0].status,'NEW');
  A.equal(f.lab.status().killSwitch.active,true);
  const bad=f.lab.paperSnapshot();bad.cash='0';A.equal(f.lab.reconcile(bad).ok,false);A.equal(f.lab.status().killSwitch.reason,'RECONCILIATION_MISMATCH');
  A.equal(f.lab.status().portfolio.cashUSDT,'10000');
});
test('Restart restores balances and orders, remains killed, and never reuses an id',t=>{
  const f=fixture(t);f.lab.submit(f.order(),[f.context()]);const cash=f.lab.status().portfolio.cashUSDT;f.lab.close();
  const restarted=new ExecutionLab({directory:f.directory,clock:f.now});t.after(()=>restarted.close());
  A.equal(restarted.status().portfolio.cashUSDT,cash);A.equal(restarted.status().killSwitch.active,true);
  A.equal(restarted.submit(f.order()).duplicate,true);restarted.resume([f.context()]);A.equal(restarted.status().recentFills.length,1);
});
test('Second writer and changed persisted risk configuration are blocked',t=>{
  const f=fixture(t);expectCode(()=>new ExecutionLab({directory:f.directory,clock:f.now}),'EXECUTION_SINGLE_WRITER_REQUIRED');
  f.lab.close();expectCode(()=>new ExecutionLab({directory:f.directory,risk:{maxOrderUSDT:'300'},clock:f.now}),'EXECUTION_CONFIGURATION_CHANGED');
});
test('Incomplete final write recovers committed state and requires explicit resume',t=>{
  const f=fixture(t);f.lab.submit(f.order(),[f.context()]);const cash=f.lab.status().portfolio.cashUSDT;f.lab.close();
  fs.appendFileSync(f.directory+'/execution-events.jsonl','{"sequence":');
  const restarted=new ExecutionLab({directory:f.directory,clock:f.now});t.after(()=>restarted.close());
  A.equal(restarted.status().portfolio.cashUSDT,cash);A.equal(restarted.status().killSwitch.reason,'RECOVERED_INCOMPLETE_WRITE');
});
test('Tampered committed journal refuses startup without replacing the data',t=>{
  const f=fixture(t);f.lab.close();const file=f.directory+'/execution-events.jsonl';
  const corrupt=fs.readFileSync(file,'utf8').replace('GENESIS','BROKEN!');fs.writeFileSync(file,corrupt);
  expectCode(()=>new ExecutionLab({directory:f.directory,clock:f.now}),'JOURNAL_CORRUPT');A.equal(fs.readFileSync(file,'utf8'),corrupt);
});
test('Durability failure never acknowledges a newly created order',t=>{
  const f=fixture(t),original=fs.fsyncSync;
  fs.fsyncSync=()=>{throw new Error('injected disk failure');};
  try{expectCode(()=>f.lab.submit(f.order(),[f.context()]),'EXECUTION_STORAGE_FAILURE');}finally{fs.fsyncSync=original;}
  A.equal(f.lab.status().orders.length,0);A.equal(f.lab.status().killSwitch.active,true);
});
test('Mixed randomized partial fills, cancels and exits preserve cash and inventory accounting',t=>{
  const f=fixture(t,{risk:{maxOrdersPerMinute:1000,maxOpenOrders:100}});let seed=731;
  const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  for(let i=0;i<120;i++){
    f.advance(1000);const ctx=f.context();ctx.quote.askQty=(1+Math.floor(random()*8)).toString();ctx.quote.bidQty='8';
    const p=f.lab.status().portfolio,owned=Number(p.positions[0]?.availableQuantity||0),sell=owned>=0.2&&random()>.5;
    const intent=f.order({clientOrderId:'ap-random'+String(i).padStart(4,'0'),side:sell?'SELL':'BUY',quantity:'0.2',type:'LIMIT',price:sell?'99':'101'});
    f.lab.submit(intent,[ctx]);
    if(random()>.4)for(const o of f.lab.status().orders.filter(o=>['NEW','PARTIALLY_FILLED'].includes(o.status)).slice(0,2))f.lab.cancel(o.clientOrderId);
    const state=f.lab.status();A(D.parse(state.portfolio.availableUSDT)>=0n);A(D.parse(state.portfolio.cashUSDT)>=0n);
    A.equal(D.parse(state.portfolio.totalPnlUSDT),D.parse(state.portfolio.realizedPnlUSDT)+D.parse(state.portfolio.unrealizedPnlUSDT));
    A.equal(f.lab.reconcile().ok,true);
  }
});
