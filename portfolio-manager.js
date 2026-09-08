'use strict';

// One shared, Spot-only operating wallet for the whole service.
// PAPER accounting is executable now. BINANCE mode is intentionally fail-closed:
// this module will never fabricate a live fill or mutate cash as though an exchange
// order succeeded. A future exchange adapter must return a verified fill first.
const SCHEMA='alpha-proof-shared-portfolio/2';
const LEGACY_SCHEMA='alpha-proof-shared-portfolio/1';
const SCOPE='GLOBAL_SHARED';
const EXCHANGE='BINANCE_SPOT';
const QUOTE_ASSET='USDT';
const FEE_POLICY='SPOT_NO_BNB';
const ENTRY_FEE_PCT=0.10;
const EXIT_FEE_PCT=0.10;
const ROUND_TRIP_FEE_PCT=0.20;
const MAX_FILLS=250;
const MAX_REJECTIONS=80;

const finite=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,finite(v,a)));
const round=(v,p=10)=>Number.isFinite(Number(v))?Number(Number(v).toFixed(p)):null;
const riyadhDay=now=>new Date(finite(now,Date.now())+3*60*60*1000).toISOString().slice(0,10);

function configuredMode(cfg={}){
  return String(cfg.mode??process.env.PORTFOLIO_MODE??'PAPER').toUpperCase()==='BINANCE'?'BINANCE':'PAPER';
}
function policy(cfg={}){
  const fixedUSDT=Math.max(0,finite(cfg.tradeUSDT??process.env.PORTFOLIO_TRADE_USDT,100));
  const pctOfEquity=clamp(cfg.tradePctOfEquity??process.env.PORTFOLIO_TRADE_PCT,0,100);
  return {
    feePolicy:FEE_POLICY,
    entryFeePct:ENTRY_FEE_PCT,
    exitFeePct:EXIT_FEE_PCT,
    roundTripFeePct:ROUND_TRIP_FEE_PCT,
    allocation:pctOfEquity>0?'PCT_OF_LIQUIDATION_EQUITY':'FIXED_USDT',
    fixedTradeUSDT:fixedUSDT,
    tradePctOfEquity:pctOfEquity,
    subscriberWallets:false,
    onePortfolioForAllSubscribers:true,
    spotOnly:true,
    shortExecution:false,
  };
}
function adapterState(mode='PAPER'){
  return {
    name:'binance-spot',
    contractVersion:1,
    connected:false,
    executionEnabled:false,
    liveOrderPlacementImplemented:false,
    requiresVerifiedExchangeFill:true,
    status:mode==='BINANCE'?'LOCKED':'PAPER_ONLY',
    reason:mode==='BINANCE'?'LIVE_ADAPTER_NOT_INSTALLED':'LEARNING_NOT_COMPLETE',
  };
}
function initialState(cfg={}){
  const capital=Math.max(0,finite(cfg.initialCapitalUSDT??process.env.PORTFOLIO_INITIAL_USDT,10000));
  const mode=configuredMode(cfg);
  return {
    schema:SCHEMA,
    scope:SCOPE,
    mode,
    exchange:EXCHANGE,
    quoteAsset:QUOTE_ASSET,
    initialCapitalUSDT:capital,
    cashUSDT:capital,
    realizedPnlUSDT:0,
    feesUSDT:0,
    closedTrades:0,
    positions:{},
    fills:[],
    rejections:[],
    updatedAt:Date.now(),
    policy:policy(cfg),
    adapter:adapterState(mode),
  };
}
function normalizePosition(p,id){
  if(!p||typeof p!=='object')return null;
  const quantity=Math.max(0,finite(p.quantity));
  const entryPrice=Math.max(0,finite(p.entryPrice));
  const costUSDT=Math.max(0,finite(p.costUSDT,quantity*entryPrice));
  const entryFeeUSDT=Math.max(0,finite(p.entryFeeUSDT));
  if(!(quantity>0&&entryPrice>0&&costUSDT>0))return null;
  return {
    ...p,
    id:String(p.id||id||''),
    symbol:String(p.symbol||''),
    side:'LONG',
    quantity,
    entryPrice,
    entryAt:finite(p.entryAt,Date.now()),
    costUSDT,
    entryFeeUSDT,
    feePolicy:FEE_POLICY,
    source:String(p.source||'ALPHA_PROOF_AI'),
  };
}
function normalize(raw,cfg={}){
  const base=initialState(cfg), x=raw&&typeof raw==='object'?raw:{};
  const mode=configuredMode({mode:x.mode??cfg.mode});
  const positions={};
  for(const [id,p] of Object.entries(x.positions&&typeof x.positions==='object'?x.positions:{})){
    const q=normalizePosition(p,id);if(q&&q.id)positions[q.id]=q;
  }
  const out={
    ...base,...x,
    schema:SCHEMA,
    scope:SCOPE,
    mode,
    exchange:EXCHANGE,
    quoteAsset:QUOTE_ASSET,
    initialCapitalUSDT:Math.max(0,finite(x.initialCapitalUSDT,base.initialCapitalUSDT)),
    cashUSDT:Math.max(0,finite(x.cashUSDT,base.cashUSDT)),
    realizedPnlUSDT:finite(x.realizedPnlUSDT),
    feesUSDT:Math.max(0,finite(x.feesUSDT)),
    closedTrades:Math.max(0,Math.floor(finite(x.closedTrades))),
    positions,
    fills:Array.isArray(x.fills)?x.fills.slice(-MAX_FILLS):[],
    rejections:Array.isArray(x.rejections)?x.rejections.slice(-MAX_REJECTIONS):[],
    updatedAt:finite(x.updatedAt,Date.now()),
    policy:{...policy(cfg),...(x.policy&&typeof x.policy==='object'?x.policy:{}),feePolicy:FEE_POLICY,entryFeePct:ENTRY_FEE_PCT,exitFeePct:EXIT_FEE_PCT,roundTripFeePct:ROUND_TRIP_FEE_PCT,subscriberWallets:false,onePortfolioForAllSubscribers:true,spotOnly:true,shortExecution:false},
    // Never trust persisted flags to arm live execution in this build.
    adapter:adapterState(mode),
  };
  // Legacy v1 states migrate in place without relabelling historical fills.
  if(x.schema===LEGACY_SCHEMA&&!Number.isFinite(Number(x.closedTrades)))out.closedTrades=out.fills.filter(f=>f&&f.side==='SELL').length;
  return out;
}
function markFor(p,marks={}){
  const px=finite(marks?.[p.symbol],p.entryPrice);
  return px>0?px:p.entryPrice;
}
function valuation(s,marks={}){
  s=normalize(s);
  let grossMarketValueUSDT=0,estimatedExitFeesUSDT=0,openCostUSDT=0,unrealizedPnlUSDT=0;
  const positions=[];
  for(const p of Object.values(s.positions)){
    const markPrice=markFor(p,marks), gross=p.quantity*markPrice, exitFee=gross*(EXIT_FEE_PCT/100), liquidation=gross-exitFee;
    const totalEntryCost=p.costUSDT+p.entryFeeUSDT, net=liquidation-totalEntryCost;
    grossMarketValueUSDT+=gross;estimatedExitFeesUSDT+=exitFee;openCostUSDT+=totalEntryCost;unrealizedPnlUSDT+=net;
    positions.push({...p,markPrice:round(markPrice),grossMarketValueUSDT:round(gross),estimatedExitFeeUSDT:round(exitFee),liquidationValueUSDT:round(liquidation),unrealizedPnlUSDT:round(net)});
  }
  const grossEquityUSDT=s.cashUSDT+grossMarketValueUSDT;
  const liquidationEquityUSDT=grossEquityUSDT-estimatedExitFeesUSDT;
  const totalPnlUSDT=liquidationEquityUSDT-s.initialCapitalUSDT;
  const expectedTotalPnlUSDT=s.realizedPnlUSDT+unrealizedPnlUSDT;
  const exposurePct=grossEquityUSDT>0?grossMarketValueUSDT/grossEquityUSDT*100:0;
  return {positions,grossMarketValueUSDT,estimatedExitFeesUSDT,openCostUSDT,unrealizedPnlUSDT,grossEquityUSDT,liquidationEquityUSDT,totalPnlUSDT,expectedTotalPnlUSDT,exposurePct,accountingInvariantUSDT:totalPnlUSDT-expectedTotalPnlUSDT};
}
function requestedNotional(s,requested,marks={}){
  const explicit=Number(requested);
  if(Number.isFinite(explicit)&&explicit>=0)return explicit;
  const pct=clamp(s.policy?.tradePctOfEquity,0,100);
  if(pct>0)return Math.max(0,valuation(s,marks).liquidationEquityUSDT*pct/100);
  return Math.max(0,finite(s.policy?.fixedTradeUSDT,100));
}
function reject(s,code,detail={},now=Date.now()){
  s.rejections.push({t:now,day:riyadhDay(now),code,...detail});
  s.rejections=s.rejections.slice(-MAX_REJECTIONS);s.updatedAt=now;return s;
}
function orderIntent(s,trade,opts={}){
  s=normalize(s);
  const price=finite(trade?.fillPrice), id=String(opts.id||trade?.caseId||trade?.cycleId||''), symbol=String(trade?.symbol||'');
  const grossRequested=requestedNotional(s,opts.notionalUSDT,opts.marks||{});
  const feeRate=ENTRY_FEE_PCT/100;
  const grossNotionalUSDT=Math.min(grossRequested,s.cashUSDT/(1+feeRate));
  const quantity=price>0?grossNotionalUSDT/price:0;
  return {schema:'alpha-proof-order-intent/1',id,symbol,side:'BUY',type:'MARKET',quoteAsset:QUOTE_ASSET,priceReference:price,grossNotionalUSDT:round(grossNotionalUSDT),estimatedEntryFeeUSDT:round(grossNotionalUSDT*feeRate),quantityEstimate:round(quantity),mode:s.mode,status:s.mode==='BINANCE'?'LOCKED_REQUIRES_VERIFIED_EXCHANGE_FILL':'PAPER_SIMULATION',livePlacement:false,requiresVerifiedExchangeFill:s.mode==='BINANCE'};
}
function open(raw,trade,now=Date.now(),opts={}){
  let s=normalize(raw);
  if(!trade||trade.finalDecision!=='ENTER')return s;
  if(trade.direction!=='LONG')return reject(s,'SPOT_LONG_ONLY',{id:String(opts.id||trade.caseId||trade.cycleId||''),symbol:String(trade.symbol||''),direction:String(trade.direction||'')},now);
  const id=String(opts.id||trade.caseId||trade.cycleId||'');
  if(!id)return reject(s,'MISSING_POSITION_ID',{symbol:String(trade.symbol||'')},now);
  if(s.positions[id])return s;
  const price=finite(trade.fillPrice);
  if(!(price>0))return reject(s,'INVALID_FILL_PRICE',{id,symbol:String(trade.symbol||'')},now);
  if(s.mode==='BINANCE')return reject(s,'LIVE_EXECUTION_FAIL_CLOSED',{id,symbol:String(trade.symbol||''),reason:s.adapter.reason},now);
  const intent=orderIntent(s,trade,{...opts,id});
  const gross=Math.max(0,finite(intent.grossNotionalUSDT));
  if(!(gross>0))return reject(s,'INSUFFICIENT_CASH',{id,symbol:String(trade.symbol||'')},now);
  const fee=gross*(ENTRY_FEE_PCT/100), spend=gross+fee, quantity=gross/price;
  if(spend>s.cashUSDT+1e-9)return reject(s,'CASH_INVARIANT_BLOCK',{id,symbol:String(trade.symbol||'')},now);
  s.cashUSDT=Math.max(0,s.cashUSDT-spend);s.feesUSDT+=fee;
  s.positions[id]={id,symbol:String(trade.symbol||''),side:'LONG',quantity,entryPrice:price,entryAt:now,costUSDT:gross,entryFeeUSDT:fee,feePolicy:FEE_POLICY,source:'ALPHA_PROOF_AI'};
  s.fills.push({t:now,day:riyadhDay(now),id,symbol:String(trade.symbol||''),side:'BUY',price,quantity,notionalUSDT:gross,feeUSDT:fee,feePct:ENTRY_FEE_PCT,feePolicy:FEE_POLICY,mode:'PAPER'});
  s.fills=s.fills.slice(-MAX_FILLS);s.updatedAt=now;return s;
}
function close(raw,id,price,now=Date.now(),opts={}){
  let s=normalize(raw);id=String(id||'');const p=s.positions[id],px=finite(price);
  if(!p)return s;
  if(!(px>0))return reject(s,'INVALID_EXIT_PRICE',{id,symbol:p.symbol},now);
  if(s.mode==='BINANCE')return reject(s,'LIVE_EXECUTION_FAIL_CLOSED',{id,symbol:p.symbol,reason:s.adapter.reason},now);
  const gross=p.quantity*px,fee=gross*(EXIT_FEE_PCT/100),net=gross-fee,pnl=net-p.costUSDT-p.entryFeeUSDT;
  s.cashUSDT+=net;s.realizedPnlUSDT+=pnl;s.feesUSDT+=fee;s.closedTrades+=1;
  s.fills.push({t:now,day:riyadhDay(now),id,symbol:p.symbol,side:'SELL',price:px,quantity:p.quantity,notionalUSDT:gross,feeUSDT:fee,feePct:EXIT_FEE_PCT,feePolicy:FEE_POLICY,realizedPnlUSDT:pnl,mode:'PAPER'});
  delete s.positions[id];s.fills=s.fills.slice(-MAX_FILLS);s.updatedAt=now;return s;
}
function integrity(raw,marks={}){
  const s=normalize(raw),v=valuation(s,marks),ids=Object.keys(s.positions);
  const finiteCore=[s.initialCapitalUSDT,s.cashUSDT,s.realizedPnlUSDT,s.feesUSDT,v.liquidationEquityUSDT,v.totalPnlUSDT].every(Number.isFinite);
  const noNegativeCash=s.cashUSDT>=-1e-9,uniqueIds=new Set(ids).size===ids.length,accountingBalanced=Math.abs(v.accountingInvariantUSDT)<=1e-6;
  return {ok:finiteCore&&noNegativeCash&&uniqueIds&&accountingBalanced,finiteCore,noNegativeCash,uniqueIds,accountingBalanced,accountingInvariantUSDT:round(v.accountingInvariantUSDT,8)};
}
function publicState(raw,marks={}){
  const s=normalize(raw),v=valuation(s,marks),check=integrity(s,marks);
  return {
    schema:SCHEMA,scope:SCOPE,mode:s.mode,exchange:EXCHANGE,quoteAsset:QUOTE_ASSET,
    initialCapitalUSDT:round(s.initialCapitalUSDT),cashUSDT:round(s.cashUSDT),
    // Equity below is net liquidation equity: it already reserves the estimated Spot exit fee.
    equityUSDT:round(v.liquidationEquityUSDT),grossEquityUSDT:round(v.grossEquityUSDT),
    marketValueUSDT:round(v.grossMarketValueUSDT),estimatedExitFeesUSDT:round(v.estimatedExitFeesUSDT),
    realizedPnlUSDT:round(s.realizedPnlUSDT),unrealizedPnlUSDT:round(v.unrealizedPnlUSDT),totalPnlUSDT:round(v.totalPnlUSDT),
    exposurePct:round(v.exposurePct,4),feesUSDT:round(s.feesUSDT),closedTrades:s.closedTrades,
    openPositions:v.positions,recentFills:s.fills.slice(-30).reverse(),recentRejections:s.rejections.slice(-12).reverse(),updatedAt:s.updatedAt,
    adapter:s.adapter,policy:s.policy,integrity:check,
    accounting:{basis:'NET_LIQUIDATION_AFTER_ESTIMATED_EXIT_FEE',feePolicy:FEE_POLICY,entryFeePct:ENTRY_FEE_PCT,exitFeePct:EXIT_FEE_PCT,roundTripFeePct:ROUND_TRIP_FEE_PCT,timezone:'Asia/Riyadh'},
    execution:s.mode==='BINANCE'?'FAIL_CLOSED_NO_SYNTHETIC_FILLS':'PAPER_REALISTIC_ACCOUNTING',
  };
}

module.exports={SCHEMA,LEGACY_SCHEMA,SCOPE,EXCHANGE,QUOTE_ASSET,FEE_POLICY,ENTRY_FEE_PCT,EXIT_FEE_PCT,ROUND_TRIP_FEE_PCT,initialState,normalize,valuation,orderIntent,open,close,integrity,publicState};
