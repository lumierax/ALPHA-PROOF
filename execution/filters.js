'use strict';
const D = require('./decimal');
const {fault} = require('./journal');
function positive(value) { const n=D.parse(value); if(n<=0n) throw fault('NON_POSITIVE_VALUE'); return n; }
function validateMarket(context,now,maxAge) {
  const q=context?.quote, s=context?.rules;
  if(!q || !Number.isSafeInteger(q.asOf) || q.asOf>now+1000 || now-q.asOf>maxAge) throw fault('STALE_MARKET_DATA');
  if(typeof q.id!=='string' || !q.id || q.id.length>100) throw fault('INVALID_QUOTE_ID');
  if(!s || s.symbol!==context.symbol || s.quoteAsset!=='USDT' || s.status!=='TRADING' || s.isSpotTradingAllowed!==true) throw fault('SPOT_SYMBOL_NOT_TRADABLE');
  if(!Number.isSafeInteger(context.rulesAsOf) || now-context.rulesAsOf>3600000 || context.rulesAsOf>now+1000) throw fault('STALE_SYMBOL_FILTERS');
  const bid=positive(q.bidPrice),ask=positive(q.askPrice),bidQty=D.parse(q.bidQty),askQty=D.parse(q.askQty);
  if(ask<bid || bidQty<0n || askQty<0n) throw fault('INVALID_ORDER_BOOK');
  return {bid,ask,bidQty,askQty};
}
function filterOrder(intent,context,referencePrice,quantity,limitPrice,openOrders) {
  if(Array.isArray(context.rules.orderTypes)&&!context.rules.orderTypes.includes(intent.type))throw fault('SYMBOL_ORDER_TYPE_UNSUPPORTED');
  const list=context.rules.filters;
  if(!Array.isArray(list)) throw fault('MISSING_SYMBOL_FILTERS');
  const filters=Object.fromEntries(list.map(f=>[f.filterType,f]));
  if(!filters.PRICE_FILTER || !filters.LOT_SIZE || (!filters.MIN_NOTIONAL&&!filters.NOTIONAL)) throw fault('MISSING_SYMBOL_FILTERS');
  const tick=D.parse(filters.PRICE_FILTER.tickSize), step=D.parse(filters.LOT_SIZE.stepSize);
  if(tick<0n || step<0n) throw fault('INVALID_SYMBOL_FILTERS');
  const range=(value,f,min,max,increment,code)=>{
    const low=D.parse(f[min]), high=D.parse(f[max]), size=increment?D.parse(f[increment]):0n;
    if(low<0n||high<0n||size<0n) throw fault('INVALID_SYMBOL_FILTERS');
    if((low>0n&&value<low)||(high>0n&&value>high)||(size>0n&&value%size!==0n)) throw fault(code);
  };
  range(quantity,filters.LOT_SIZE,'minQty','maxQty','stepSize','LOT_SIZE');
  if(intent.type==='MARKET'&&filters.MARKET_LOT_SIZE) range(quantity,filters.MARKET_LOT_SIZE,'minQty','maxQty','stepSize','MARKET_LOT_SIZE');
  if(intent.type==='LIMIT') range(limitPrice,filters.PRICE_FILTER,'minPrice','maxPrice','tickSize','PRICE_FILTER');
  const average=f=>{
    if(Number(f.avgPriceMins)===0) return positive(context.lastPrice);
    if(!context.average || context.average.mins!==Number(f.avgPriceMins)) throw fault('FILTER_REFERENCE_MISSING');
    return positive(context.average.price);
  };
  for(const f of list) {
    if(f.filterType==='MIN_NOTIONAL' && (intent.type==='LIMIT'||f.applyToMarket===true)) {
      const px=intent.type==='LIMIT'?limitPrice:average(f);
      if(D.mul(px,quantity)<D.parse(f.minNotional)) throw fault('MIN_NOTIONAL');
    }
    if(f.filterType==='NOTIONAL') {
      if(intent.type==='MARKET'&&f.applyMinToMarket!==true&&f.applyMaxToMarket!==true)continue;
      const px=intent.type==='LIMIT'?limitPrice:average(f),notional=D.mul(px,quantity);
      if((intent.type==='LIMIT'||f.applyMinToMarket===true)&&notional<D.parse(f.minNotional)) throw fault('MIN_NOTIONAL');
      if((intent.type==='LIMIT'||f.applyMaxToMarket===true)&&D.parse(f.maxNotional)>0n&&notional>D.parse(f.maxNotional)) throw fault('MAX_NOTIONAL');
    }
    if(intent.type==='LIMIT' && ['PERCENT_PRICE','PERCENT_PRICE_BY_SIDE'].includes(f.filterType)) {
      const ref=average(f),prefix=intent.side==='BUY'?'bid':'ask';
      const up=D.parse(f.multiplierUp??f[prefix+'MultiplierUp']),down=D.parse(f.multiplierDown??f[prefix+'MultiplierDown']);
      if(limitPrice>D.mul(ref,up)||limitPrice<D.mul(ref,down)) throw fault(f.filterType);
    }
    if(f.filterType==='MAX_NUM_ORDERS' && openOrders>=Number(f.maxNumOrders)) throw fault('SYMBOL_ORDER_LIMIT');
    if(f.filterType==='MAX_POSITION' && intent.side==='BUY') {
      if(D.parse(context.projectedQuantity||'0')>D.parse(f.maxPosition)) throw fault('EXCHANGE_MAX_POSITION');
    }
    const supported=['PRICE_FILTER','LOT_SIZE','MARKET_LOT_SIZE','MIN_NOTIONAL','NOTIONAL','PERCENT_PRICE','PERCENT_PRICE_BY_SIDE','MAX_NUM_ORDERS','MAX_POSITION',
      'ICEBERG_PARTS','MAX_NUM_ALGO_ORDERS','MAX_NUM_ICEBERG_ORDERS','TRAILING_DELTA','MAX_NUM_ORDER_AMENDS','MAX_NUM_ORDER_LISTS'];
    if(!supported.includes(f.filterType)) throw fault('UNSUPPORTED_SYMBOL_FILTER');
  }
  return {tick,step};
}
module.exports={positive,validateMarket,filterOrder};
