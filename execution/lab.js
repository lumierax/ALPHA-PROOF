'use strict';
const crypto=require('node:crypto');
const D=require('./decimal');
const F=require('./filters');
const {Journal,digest,fault}=require('./journal');
const SCHEMA='alpha-proof-execution-lab/1';
const LIVE_EXECUTION_ENABLED=false; // No transport, signer, credentials, or arming API exists.
const OPEN=new Set(['PENDING_NEW','NEW','PARTIALLY_FILLED','PENDING_CANCEL','UNKNOWN']);
const TERMINAL=new Set(['FILLED','CANCELED','EXPIRED','REJECTED']);
const TRANSITIONS={PENDING_NEW:['NEW','REJECTED','UNKNOWN','PENDING_CANCEL'],NEW:['PARTIALLY_FILLED','FILLED','PENDING_CANCEL','UNKNOWN','REJECTED','EXPIRED'],
  PARTIALLY_FILLED:['PARTIALLY_FILLED','FILLED','PENDING_CANCEL','UNKNOWN','EXPIRED'],PENDING_CANCEL:['CANCELED','EXPIRED','UNKNOWN','NEW','PARTIALLY_FILLED','FILLED'],
  UNKNOWN:['NEW','PARTIALLY_FILLED','FILLED','PENDING_CANCEL','CANCELED','EXPIRED','REJECTED']};
const DEFAULT_LIMITS=Object.freeze({maxOrderUSDT:'250',maxSymbolUSDT:'2000',maxGrossUSDT:'5000',maxDailyLossUSDT:'200',maxDrawdownUSDT:'1000',
  maxOpenOrders:10,maxPositions:10,maxOrdersPerMinute:20,maxQuoteAgeMs:15000,maxSpreadBps:50,maxSlippageBps:25,paperSlippageBps:5,participationBps:1000});
const clone=x=>structuredClone(x);
const day=now=>new Date(now+3*3600000).toISOString().slice(0,10);
const min=(a,b)=>a<b?a:b;
const sum=xs=>xs.reduce((a,b)=>a+b,0n);
const active=s=>Object.values(s.orders).filter(o=>OPEN.has(o.status));
const remaining=o=>BigInt(o.quantity)-BigInt(o.filled);
function limits(raw={}) {
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).some(k=>!(k in DEFAULT_LIMITS))) throw fault('INVALID_RISK_CONFIGURATION');
  const value={...DEFAULT_LIMITS,...raw};
  for(const [k,v] of Object.entries(value)) {
    if(k.endsWith('USDT')) { if(D.parse(v)<=0n) throw fault('INVALID_RISK_CONFIGURATION'); }
    else if(!Number.isSafeInteger(v)||v<1||v>({maxOpenOrders:100,maxPositions:100,maxOrdersPerMinute:1000,maxQuoteAgeMs:60000,participationBps:10000}[k]||1000)) throw fault('INVALID_RISK_CONFIGURATION');
  }
  if(value.paperSlippageBps>value.maxSlippageBps) throw fault('INVALID_RISK_CONFIGURATION');
  return value;
}
function apply(s,e) {
  if(e.type==='INIT') return {schema:SCHEMA,capital:e.capital,cash:e.capital,realized:'0',fees:'0',positions:{},orders:{},fills:{},
    broker:{cash:e.capital,positions:{},orders:{},fills:{}},limits:e.limits,kill:{active:false,reason:null},reconciliation:{ok:false,at:null},
    risk:{equity:e.capital,highWater:e.capital,days:{},marks:{}},recent:[],createdAt:e.t};
  if(!s) throw fault('JOURNAL_MISSING_INIT');
  if(e.type==='ORDER') s.orders[e.order.clientOrderId]=e.order;
  else if(e.type==='BROKER_ACK') s.broker.orders[e.id]={clientOrderId:e.id,symbol:s.orders[e.id].symbol,side:s.orders[e.id].side,quantity:s.orders[e.id].quantity,filled:'0',status:'NEW'};
  else if(e.type==='STATUS') {
    const o=s.orders[e.id];
    if(!o || (o.status!==e.status&&!TRANSITIONS[o.status]?.includes(e.status)))throw fault('INVALID_ORDER_TRANSITION');
    o.status=e.status;o.updatedAt=e.t;
  }
  else if(e.type==='BROKER_STATUS') s.broker.orders[e.id].status=e.status;
  else if(e.type==='BROKER_FILL') {
    const f=e.fill,o=s.broker.orders[f.clientOrderId],q=BigInt(f.quantity),gross=BigInt(f.notional),fee=BigInt(f.fee),held=BigInt(s.broker.positions[f.symbol]||'0');
    s.broker.cash=(BigInt(s.broker.cash)+(f.side==='BUY'?-gross-fee:gross-fee)).toString();
    s.broker.positions[f.symbol]=(held+(f.side==='BUY'?q:-q)).toString();
    o.filled=(BigInt(o.filled)+q).toString(); o.status=o.filled===o.quantity?'FILLED':'PARTIALLY_FILLED';
    s.broker.fills[f.tradeId]=f;
  } else if(e.type==='FILL') {
    const f=e.fill,o=s.orders[f.clientOrderId],q=BigInt(f.quantity),gross=BigInt(f.notional),fee=BigInt(f.fee);
    const p=s.positions[f.symbol]||{quantity:'0',cost:'0'};
    if(f.side==='BUY') {
      s.cash=(BigInt(s.cash)-gross-fee).toString();
      p.quantity=(BigInt(p.quantity)+q).toString(); p.cost=(BigInt(p.cost)+gross+fee).toString();
    } else {
      const allocation=q===BigInt(p.quantity)?BigInt(p.cost):BigInt(p.cost)*q/BigInt(p.quantity);
      s.cash=(BigInt(s.cash)+gross-fee).toString(); s.realized=(BigInt(s.realized)+gross-fee-allocation).toString();
      p.quantity=(BigInt(p.quantity)-q).toString(); p.cost=(BigInt(p.cost)-allocation).toString();
    }
    if(BigInt(p.quantity)>0n) s.positions[f.symbol]=p; else delete s.positions[f.symbol];
    s.fees=(BigInt(s.fees)+fee).toString(); s.fills[f.tradeId]=f;
    o.filled=(BigInt(o.filled)+q).toString(); o.fees=(BigInt(o.fees)+fee).toString(); o.notional=(BigInt(o.notional)+gross).toString();
    o.status=o.filled===o.quantity?'FILLED':(TERMINAL.has(o.status)?o.status:'PARTIALLY_FILLED'); o.updatedAt=e.t;
  } else if(e.type==='KILL') s.kill={active:true,reason:e.reason,at:e.t};
  else if(e.type==='RESUME') s.kill={active:false,reason:null,at:e.t};
  else if(e.type==='RECONCILE') s.reconciliation={ok:e.ok,at:e.t,issues:e.issues};
  else if(e.type==='MARK') {
    const d=day(e.t),equity=BigInt(e.equity);
    if(!s.risk.days[d]) s.risk.days[d]={start:s.risk.equity,equity:e.equity};
    s.risk.days[d].equity=e.equity; s.risk.equity=e.equity; s.risk.marks=e.marks;
    if(equity>BigInt(s.risk.highWater)) s.risk.highWater=e.equity;
    for(const key of Object.keys(s.risk.days).sort().slice(0,-400)) delete s.risk.days[key];
  } else if(e.type!=='REJECTION') throw fault('JOURNAL_UNKNOWN_EVENT');
  s.recent.push({type:e.type,t:e.t,id:e.id||e.order?.clientOrderId||e.fill?.clientOrderId,reason:e.reason,status:e.status});
  s.recent=s.recent.slice(-80);
  return s;
}
class ExecutionLab {
  #s=null; #journal; #contexts=new Map(); #consumed=new Map(); #fatal=null; #clock;
  constructor({directory,initialCapitalUSDT='10000',risk={},mode='PAPER',clock=Date.now}={}) {
    if(mode!=='PAPER') throw fault(mode==='LIVE'||mode==='BINANCE'?'LIVE_EXECUTION_FORBIDDEN':'UNSUPPORTED_EXECUTION_MODE');
    if(!directory) throw fault('EXECUTION_DIRECTORY_REQUIRED');
    this.#clock=clock;
    const configured=limits(risk),capital=F.positive(initialCapitalUSDT).toString();
    this.#journal=new Journal(directory,events=>{for(const e of events) this.#s=apply(this.#s,e);});
    if(!this.#s) this.#commit([{type:'INIT',capital,limits:configured,t:this.#now()}]);
    else {
      if(this.#s.schema!==SCHEMA) {this.close();throw fault('EXECUTION_SCHEMA_MISMATCH');}
      // A restart never silently changes capital or risk limits.
      if(digest(this.#s.limits)!==digest(configured)||this.#s.capital!==capital) {this.close();throw fault('EXECUTION_CONFIGURATION_CHANGED');}
      this.#commit([{type:'KILL',reason:this.#journal.tornTail?'RECOVERED_INCOMPLETE_WRITE':'RESTART_RECONCILIATION_REQUIRED',t:this.#now()},
        {type:'RECONCILE',ok:false,issues:['RESTART'],t:this.#now()}]);
    }
    for(const f of Object.values(this.#s.broker.fills)) {
      if(this.#now()-f.t>60000)continue;
      const key=f.symbol+'|'+f.side+'|'+f.quoteId,previous=this.#consumed.get(key)?.quantity||0n;
      this.#consumed.set(key,{quantity:previous+BigInt(f.quantity),at:f.t});
    }
    this.reconcile();
  }
  #now() {const t=this.#clock();if(!Number.isSafeInteger(t)||t<0)throw fault('INVALID_CLOCK');return t;}
  #commit(events) {
    if(!events.length) return;
    if(this.#fatal) throw fault(this.#fatal);
    const next=clone(this.#s);
    let result=next;
    for(const e of events) result=apply(result,e);
    try {this.#journal.append(events);} catch(e) {this.#fatal=e.code||'EXECUTION_STORAGE_FAILURE';throw e;}
    this.#s=result;
  }
  #ingest(contexts=[]) {
    const now=this.#now();
    for(const c of contexts) {
      F.validateMarket(c,now,this.#s.limits.maxQuoteAgeMs);
      const old=this.#contexts.get(c.symbol);
      if(old && (old.quote.asOf>c.quote.asOf || (old.quote.id===c.quote.id && digest(old.quote)!==digest(c.quote)))) throw fault('QUOTE_REPLAY_CONFLICT');
      this.#contexts.set(c.symbol,clone(c));
    }
    // Cache size does not grow with the exchange universe.
    for(const [symbol,c] of this.#contexts) if(now-c.quote.asOf>3600000&&!this.#s.positions[symbol]&&!active(this.#s).some(o=>o.symbol===symbol)) this.#contexts.delete(symbol);
    if(this.#contexts.size>120)for(const symbol of this.#contexts.keys()) {
      if(this.#contexts.size<=120)break;
      if(!this.#s.positions[symbol]&&!active(this.#s).some(o=>o.symbol===symbol))this.#contexts.delete(symbol);
    }
    for(const [key,c] of this.#consumed) if(now-c.at>60000) this.#consumed.delete(key);
  }
  #valuation(s=this.#s) {
    let gross=0n,unrealized=0n;const symbols={},marks={};
    for(const [symbol,p] of Object.entries(s.positions)) {
      const ctx=this.#contexts.get(symbol);
      const book=F.validateMarket(ctx,this.#now(),s.limits.maxQuoteAgeMs);
      const value=D.mul(BigInt(p.quantity),book.bid);
      gross+=value;symbols[symbol]=value;unrealized+=value-D.fee(value)-BigInt(p.cost);
      marks[symbol]={bidPrice:ctx.quote.bidPrice,asOf:ctx.quote.asOf};
    }
    const equity=BigInt(s.cash)+sum(Object.entries(s.positions).map(([symbol,p])=>{const v=symbols[symbol];return v-D.fee(v);}));
    return {equity,gross,symbols,marks,unrealized};
  }
  #riskReason(v,s=this.#s) {
    const start=BigInt(s.risk.days[day(this.#now())]?.start??s.risk.equity);
    if(start-v.equity>=D.parse(s.limits.maxDailyLossUSDT)) return 'DAILY_LOSS_LIMIT';
    if(BigInt(s.risk.highWater)-v.equity>=D.parse(s.limits.maxDrawdownUSDT)) return 'DRAWDOWN_LIMIT';
    const pending=active(s).filter(o=>o.side==='BUY');
    if(v.gross+sum(pending.map(o=>D.cost(remaining(o),BigInt(o.priceCap))))>D.parse(s.limits.maxGrossUSDT)) return 'GROSS_EXPOSURE_LIMIT';
    for(const symbol of new Set([...Object.keys(v.symbols),...pending.map(o=>o.symbol)])) {
      if((v.symbols[symbol]||0n)+sum(pending.filter(o=>o.symbol===symbol).map(o=>D.cost(remaining(o),BigInt(o.priceCap))))>D.parse(s.limits.maxSymbolUSDT))return 'SYMBOL_EXPOSURE_LIMIT';
    }
    return null;
  }
  #recordMark() {
    const v=this.#valuation();
    const reason=this.#riskReason(v);
    if(v.equity.toString()!==this.#s.risk.equity || !this.#s.risk.days[day(this.#now())]) {
      this.#commit([{type:'MARK',equity:v.equity.toString(),marks:v.marks,t:this.#now()}]);
    }
    if(reason&&!this.#s.kill.active) this.kill(reason);
    return v;
  }
  #intent(raw) {
    if(!raw||typeof raw!=='object'||Array.isArray(raw)) throw fault('INVALID_ORDER');
    const allowed=['mode','clientOrderId','symbol','side','type','quantity','price','timeInForce','ttlMs'];
    if(Object.keys(raw).some(k=>!allowed.includes(k))) throw fault('UNSUPPORTED_ORDER_FIELD');
    const mode=raw.mode===undefined?'PAPER':raw.mode;
    if(!['PAPER','TESTNET'].includes(mode)) throw fault('LIVE_EXECUTION_FORBIDDEN');
    if(!/^ap-[A-Za-z0-9_-]{5,32}$/.test(raw.clientOrderId||'')) throw fault('INVALID_CLIENT_ORDER_ID');
    if(!/^[A-Z0-9]{2,20}USDT$/.test(raw.symbol||'')) throw fault('SPOT_USDT_ONLY');
    if(!['BUY','SELL'].includes(raw.side)) throw fault('SPOT_LONG_ONLY');
    if(!['MARKET','LIMIT'].includes(raw.type)) throw fault('UNSUPPORTED_ORDER_TYPE');
    const quantity=D.format(F.positive(raw.quantity));
    const price=raw.type==='LIMIT'?D.format(F.positive(raw.price)):null;
    if(raw.type==='MARKET'&&(raw.price!=null||(raw.timeInForce!==undefined&&raw.timeInForce!=='IOC'))) throw fault('MARKET_PARAMETER_CONFLICT');
    const timeInForce=raw.type==='MARKET'?'IOC':raw.timeInForce??'GTC';
    if(!['GTC','IOC','FOK'].includes(timeInForce)) throw fault('UNSUPPORTED_TIME_IN_FORCE');
    const ttlMs=raw.ttlMs??900000;
    if(!Number.isSafeInteger(ttlMs)||ttlMs<1000||ttlMs>86400000) throw fault('INVALID_ORDER_TTL');
    return {mode,clientOrderId:raw.clientOrderId,symbol:raw.symbol,side:raw.side,type:raw.type,quantity,price,timeInForce,ttlMs};
  }
  #evaluate(intent) {
    if(this.#fatal) throw fault(this.#fatal);
    const s=this.#s,now=this.#now(),L=s.limits;
    if(s.kill.active) throw fault('KILL_SWITCH_ACTIVE');
    if(!s.reconciliation.ok) throw fault('RECONCILIATION_REQUIRED');
    const ctx=this.#contexts.get(intent.symbol),b=F.validateMarket(ctx,now,L.maxQuoteAgeMs);
    if(intent.side==='BUY'&&ctx.eligible!==true) throw fault('LUX_RADAR_REQUIRED');
    if((b.ask-b.bid)*10000n>b.bid*BigInt(L.maxSpreadBps)) throw fault('SPREAD_LIMIT');
    const opens=active(s),same=opens.filter(o=>o.symbol===intent.symbol);
    if(opens.length>=L.maxOpenOrders) throw fault('OPEN_ORDER_LIMIT');
    if(Object.values(s.orders).filter(o=>now-o.createdAt<60000).length>=L.maxOrdersPerMinute) throw fault('ORDER_RATE_LIMIT');
    if(Object.keys(s.orders).length>=1000||Object.keys(s.fills).length>=20000) throw fault('EXECUTION_HISTORY_CAPACITY');
    const quantity=D.parse(intent.quantity),price=intent.price?D.parse(intent.price):null;
    const held=BigInt(s.positions[intent.symbol]?.quantity||0),pendingBuy=sum(same.filter(o=>o.side==='BUY').map(remaining));
    const filter=F.filterOrder(intent,{...ctx,projectedQuantity:D.format(held+pendingBuy+quantity)},b.ask,quantity,price,same.length);
    const cap=intent.type==='LIMIT'?price:intent.side==='BUY'?D.ceilStep(D.ceilDiv(b.ask*BigInt(10000+L.maxSlippageBps),10000n),filter.tick):D.floorStep(b.bid*BigInt(10000-L.maxSlippageBps)/10000n,filter.tick);
    const notional=D.cost(quantity,intent.side==='BUY'?cap:(price??b.bid));
    if(notional>D.parse(L.maxOrderUSDT)) throw fault('ORDER_NOTIONAL_LIMIT');
    const v=this.#valuation(),loss=this.#riskReason(v);
    if(loss) throw fault(loss);
    const buyReserve=o=>{const amount=D.cost(remaining(o),BigInt(o.priceCap));return amount+D.fee(amount);};
    const reserved=sum(opens.filter(o=>o.side==='BUY').map(buyReserve));
    if(intent.side==='BUY') {
      if(new Set([...Object.keys(s.positions),...opens.filter(o=>o.side==='BUY').map(o=>o.symbol),intent.symbol]).size>L.maxPositions)throw fault('POSITION_COUNT_LIMIT');
      if(notional+D.fee(notional)>BigInt(s.cash)-reserved) throw fault('INSUFFICIENT_AVAILABLE_CASH');
      const symbolPending=sum(same.filter(o=>o.side==='BUY').map(o=>D.cost(remaining(o),BigInt(o.priceCap))));
      const grossPending=sum(opens.filter(o=>o.side==='BUY').map(o=>D.cost(remaining(o),BigInt(o.priceCap))));
      if((v.symbols[intent.symbol]||0n)+symbolPending+notional>D.parse(L.maxSymbolUSDT)) throw fault('SYMBOL_EXPOSURE_LIMIT');
      if(v.gross+grossPending+notional>D.parse(L.maxGrossUSDT)) throw fault('GROSS_EXPOSURE_LIMIT');
    } else if(quantity>held-sum(same.filter(o=>o.side==='SELL').map(remaining))) throw fault('INSUFFICIENT_AVAILABLE_POSITION');
    return {cap,notional,quantity,filter,quote:ctx.quote};
  }
  plan(raw,contexts=[]) {
    try {
      const intent=this.#intent(raw);this.#ingest(contexts);
      const p=this.#evaluate(intent),params={symbol:intent.symbol,side:intent.side,type:intent.type,quantity:intent.quantity,newClientOrderId:intent.clientOrderId};
      if(intent.type==='LIMIT') Object.assign(params,{price:intent.price,timeInForce:intent.timeInForce});
      return {ok:true,intent,expiresAt:this.#now()+Math.min(15000,intent.ttlMs),estimatedNotionalUSDT:D.format(p.notional),estimatedFeeUSDT:D.format(D.fee(p.notional)),
        status:intent.mode==='TESTNET'?'DRAFT_TESTNET_PLAN':'PAPER_PLAN',liveExecutionEnabled:LIVE_EXECUTION_ENABLED,sendEnabled:false,
        filterValidation:'LOCAL_PREFLIGHT_ONLY',
        request:intent.mode==='TESTNET'?{baseURL:'https://testnet.binance.vision',method:'POST',path:'/api/v3/order',validationPath:'/api/v3/order/test',parameters:params,
          signed:false,requires:['TESTNET_FILTER_REFRESH','TESTNET_BALANCES','TESTNET_CREDENTIALS','INDEPENDENT_ADAPTER_REVIEW']}:null};
    } catch(e) {return {ok:false,code:e.code||'INVALID_ORDER',liveExecutionEnabled:false};}
  }
  validateIntent(raw) {return this.#intent(raw);}
  lookup(raw) {
    const intent=this.#intent(raw),old=this.#s.orders[intent.clientOrderId];
    if(old&&old.fingerprint!==digest(intent))throw fault('IDEMPOTENCY_CONFLICT');
    return old?this.#publicOrder(old):null;
  }
  submit(raw,contexts=[]) {
    let intent;
    try {
      intent=this.#intent(raw);
      if(intent.mode!=='PAPER') throw fault('TESTNET_PLAN_ONLY');
      const old=this.#s.orders[intent.clientOrderId];
      if(old) {
        if(old.fingerprint!==digest(intent)) throw fault('IDEMPOTENCY_CONFLICT');
        if(old.status==='REJECTED')throw fault(old.rejectionReason);
        return {ok:true,duplicate:true,order:this.#publicOrder(old)};
      }
      this.#ingest(contexts);
      const p=this.#evaluate(intent),now=this.#now();
      const order={...intent,quantity:p.quantity.toString(),price:intent.price?D.parse(intent.price).toString():null,priceCap:p.cap.toString(),fingerprint:digest(intent),
        filled:'0',fees:'0',notional:'0',status:'PENDING_NEW',createdAt:now,updatedAt:now,expiresAt:now+intent.ttlMs};
      this.#commit([{type:'ORDER',order,t:now},{type:'BROKER_ACK',id:order.clientOrderId,t:now},{type:'STATUS',id:order.clientOrderId,status:'NEW',t:now}]);
      this.tick();
      return {ok:true,duplicate:false,order:this.#publicOrder(this.#s.orders[intent.clientOrderId])};
    } catch(e) {
      if(['DAILY_LOSS_LIMIT','DRAWDOWN_LIMIT'].includes(e.code)) this.kill(e.code);
      if(!this.#fatal) {
        const events=[],now=this.#now();
        if(intent?.mode==='PAPER'&&!this.#s.orders[intent.clientOrderId]&&Object.keys(this.#s.orders).length<1000) {
          events.push({type:'ORDER',t:now,order:{...intent,quantity:D.parse(intent.quantity).toString(),price:intent.price?D.parse(intent.price).toString():null,
            priceCap:'0',fingerprint:digest(intent),filled:'0',fees:'0',notional:'0',status:'REJECTED',rejectionReason:e.code||'INVALID_ORDER',createdAt:now,updatedAt:now,expiresAt:now}});
        }
        events.push({type:'REJECTION',reason:e.code||'INVALID_ORDER',id:intent?.clientOrderId,t:now});this.#commit(events);
      }
      throw e;
    }
  }
  #match(o,contextsBudget,events) {
    const c=this.#contexts.get(o.symbol),b=F.validateMarket(c,this.#now(),this.#s.limits.maxQuoteAgeMs),L=this.#s.limits;
    if((b.ask-b.bid)*10000n>b.bid*BigInt(L.maxSpreadBps)) return;
    const tick=D.parse(c.rules.filters.find(f=>f.filterType==='PRICE_FILTER').tickSize);
    const step=D.parse(c.rules.filters.find(f=>f.filterType==='LOT_SIZE').stepSize);
    const raw=o.side==='BUY'?D.ceilDiv(b.ask*BigInt(10000+L.paperSlippageBps),10000n):b.bid*BigInt(10000-L.paperSlippageBps)/10000n;
    const px=o.side==='BUY'?D.ceilStep(raw,tick):D.floorStep(raw,tick);
    if(px<=0n) return;
    if(o.side==='BUY'&&(px-b.ask)*10000n>b.ask*BigInt(L.maxSlippageBps))return;
    if(o.side==='SELL'&&(b.bid-px)*10000n>b.bid*BigInt(L.maxSlippageBps))return;
    if(o.side==='BUY'&&px>BigInt(o.priceCap)) return;
    if(o.side==='SELL'&&px<BigInt(o.priceCap)) return;
    const key=o.symbol+'|'+o.side+'|'+c.quote.id;
    const used=contextsBudget.get(key)||{quantity:0n,at:c.quote.asOf};
    const liquidity=(o.side==='BUY'?b.askQty:b.bidQty)*BigInt(L.participationBps)/10000n;
    const available=liquidity>used.quantity?liquidity-used.quantity:0n;
    const q=D.floorStep(min(remaining(o),available),step);
    if(q<=0n||(o.timeInForce==='FOK'&&q<remaining(o))) return;
    const gross=o.side==='BUY'?D.cost(q,px):D.mul(q,px),commission=D.fee(gross);
    if(o.side==='BUY') {
      const reserved=sum(active(this.#s).filter(x=>x.side==='BUY').map(x=>{
        const left=x.clientOrderId===o.clientOrderId?remaining(x)-q:remaining(x);
        const amount=D.cost(left,BigInt(x.priceCap));return amount+D.fee(amount);
      }));
      if(BigInt(this.#s.cash)-gross-commission<reserved)throw fault('RESERVATION_INVARIANT');
    } else if(q>BigInt(this.#s.positions[o.symbol]?.quantity||0))throw fault('POSITION_INVARIANT');
    const fill={tradeId:'paper-'+crypto.randomUUID(),clientOrderId:o.clientOrderId,symbol:o.symbol,side:o.side,mode:'PAPER',
      quantity:q.toString(),price:px.toString(),notional:gross.toString(),fee:commission.toString(),quoteId:c.quote.id,t:this.#now()};
    events.push({type:'BROKER_FILL',fill,t:fill.t},{type:'FILL',fill,t:fill.t});
    contextsBudget.set(key,{quantity:used.quantity+q,at:c.quote.asOf});
  }
  tick(contexts=[]) {
    this.#ingest(contexts);
    const now=this.#now(),events=[];
    // TTL and cancels do not depend on a working market-data connection.
    for(const o of active(this.#s)) if(o.expiresAt<=now) events.push(...this.#cancelEvents(o,'EXPIRED'));
    this.#commit(events);
    if(this.#fatal) return this.status();
    try {this.#recordMark();} catch(e) {this.kill(e.code||'MARKET_DATA_FAILURE');return this.status();}
    if(this.#s.kill.active) return this.status();
    for(const o of active(this.#s)) {
      if(Object.keys(this.#s.fills).length>=20000){this.kill('EXECUTION_HISTORY_CAPACITY');break;}
      if(!['NEW','PARTIALLY_FILLED'].includes(o.status)) continue;
      if(o.side==='BUY'&&this.#contexts.get(o.symbol)?.eligible!==true){this.cancel(o.clientOrderId);continue;}
      const batch=[],budget=new Map(this.#consumed);
      try {this.#match(o,budget,batch);} catch(e) {this.kill(e.code||'MARKET_DATA_FAILURE');break;}
      let next=clone(this.#s);for(const e of batch) next=apply(next,e);
      const updated=next.orders[o.clientOrderId];
      if(OPEN.has(updated.status)&&updated.timeInForce!=='GTC') batch.push(...this.#cancelEvents(updated,'EXPIRED'));
      this.#commit(batch);this.#consumed=budget;
      try{this.#recordMark();}catch(e){this.kill(e.code||'MARKET_DATA_FAILURE');}
      if(this.#s.kill.active)break;
    }
    if(!this.#s.kill.active) {try{this.#recordMark();}catch(e){this.kill(e.code||'MARKET_DATA_FAILURE');}}
    return this.status();
  }
  #cancelEvents(o,status='CANCELED') {
    if(!OPEN.has(o.status)) return [];
    const t=this.#now();
    if(!this.#s.broker.orders[o.clientOrderId]) return [{type:'STATUS',id:o.clientOrderId,status:'UNKNOWN',t}];
    return [{type:'STATUS',id:o.clientOrderId,status:'PENDING_CANCEL',t},{type:'BROKER_STATUS',id:o.clientOrderId,status,t},{type:'STATUS',id:o.clientOrderId,status,t}];
  }
  cancel(id) {
    if(typeof id!=='string'||!Object.hasOwn(this.#s.orders,id))throw fault('ORDER_NOT_FOUND');
    const o=this.#s.orders[id];
    this.#commit(this.#cancelEvents(o));return {ok:true,order:this.#publicOrder(this.#s.orders[id])};
  }
  kill(reason='OPERATOR_KILL') {
    const safe=typeof reason==='string'&&/^[A-Z0-9_]{1,80}$/.test(reason)?reason:'OPERATOR_KILL';
    this.#commit([{type:'KILL',reason:safe,t:this.#now()},...active(this.#s).flatMap(o=>this.#cancelEvents(o))]);
    return this.status();
  }
  recordUncertain(id) {
    if(!this.#s.orders[id]||!OPEN.has(this.#s.orders[id].status)) throw fault('ORDER_NOT_OPEN');
    this.#commit([{type:'STATUS',id,status:'UNKNOWN',t:this.#now()},{type:'KILL',reason:'UNKNOWN_EXECUTION_STATUS',t:this.#now()},
      {type:'RECONCILE',ok:false,issues:['UNKNOWN_EXECUTION_STATUS'],t:this.#now()}]);
  }
  receiveReport(report) {
    // Only facts already recorded by this build's Paper broker can enter accounting.
    const known=typeof report?.tradeId==='string'&&Object.hasOwn(this.#s.broker.fills,report.tradeId)?this.#s.broker.fills[report.tradeId]:null;
    if(!known||digest(known)!==digest(report)) {this.kill('UNVERIFIED_EXECUTION_REPORT');throw fault('UNVERIFIED_EXECUTION_REPORT');}
    if(this.#s.fills[known.tradeId]) return {ok:true,duplicate:true};
    this.#commit([{type:'FILL',fill:known,t:this.#now()}]);return {ok:true,duplicate:false};
  }
  paperSnapshot() {return clone({mode:'PAPER',...this.#s.broker});}
  reconcile(snapshot=this.paperSnapshot()) {
    const issues=[],s=this.#s,events=[];
    if(snapshot?.mode!=='PAPER'||digest({...snapshot,mode:undefined})!==digest({...s.broker,mode:undefined})) {
      issues.push('UNTRUSTED_BROKER_SNAPSHOT');
    } else {
      for(const o of Object.values(s.orders)) {
        const b=snapshot.orders[o.clientOrderId];
        if(o.status==='REJECTED'&&!b&&o.filled==='0')continue;
        if(!b) {issues.push('MISSING_BROKER_ORDER:'+o.clientOrderId);continue;}
        if(o.filled!==b.filled||o.quantity!==b.quantity||o.symbol!==b.symbol||o.side!==b.side) issues.push('ORDER_MISMATCH:'+o.clientOrderId);
        if(o.status!==b.status) {
          if(['UNKNOWN','PENDING_NEW','PENDING_CANCEL'].includes(o.status)) events.push({type:'STATUS',id:o.clientOrderId,status:b.status,t:this.#now()});
          else issues.push('ORDER_STATUS_MISMATCH:'+o.clientOrderId);
        }
      }
      if(Object.keys(snapshot.orders).some(id=>!s.orders[id])) issues.push('ORPHAN_BROKER_ORDER');
      if(s.cash!==snapshot.cash) issues.push('CASH_MISMATCH');
      for(const symbol of new Set([...Object.keys(s.positions),...Object.keys(snapshot.positions)])) if((s.positions[symbol]?.quantity||'0')!==(snapshot.positions[symbol]||'0')) issues.push('POSITION_MISMATCH:'+symbol);
      if(digest(s.fills)!==digest(snapshot.fills)) issues.push('FILL_MISMATCH');
    }
    if(issues.length) {events.length=0;events.push({type:'KILL',reason:'RECONCILIATION_MISMATCH',t:this.#now()});}
    events.push({type:'RECONCILE',ok:issues.length===0,issues,t:this.#now()});this.#commit(events);
    if(issues.length) this.kill('RECONCILIATION_MISMATCH');
    return clone(this.#s.reconciliation);
  }
  resume(contexts=[]) {
    if(this.#fatal) throw fault(this.#fatal);
    this.#ingest(contexts);
    const r=this.reconcile();if(!r.ok) throw fault('RECONCILIATION_REQUIRED');
    const v=this.#valuation(),reason=this.#riskReason(v);if(reason) throw fault(reason);
    for(const o of active(this.#s)) F.validateMarket(this.#contexts.get(o.symbol),this.#now(),this.#s.limits.maxQuoteAgeMs);
    this.#commit([{type:'MARK',equity:v.equity.toString(),marks:v.marks,t:this.#now()},{type:'RESUME',t:this.#now()}]);return this.status();
  }
  requiredSymbols() {return [...new Set([...Object.keys(this.#s.positions),...active(this.#s).map(o=>o.symbol)])];}
  #publicOrder(o) {const r=clone(o);for(const k of ['quantity','filled','price','priceCap','fees','notional']) if(r[k]!==null)r[k]=D.format(r[k]);delete r.fingerprint;return r;}
  status() {
    const s=this.#s,opens=active(s),reserved=sum(opens.filter(o=>o.side==='BUY').map(o=>{const n=D.cost(remaining(o),BigInt(o.priceCap));return n+D.fee(n);}));
    let v=null;try{v=this.#valuation();}catch{}
    const equity=v?.equity??BigInt(s.risk.equity),days=Object.entries(s.risk.days).sort(([a],[b])=>a.localeCompare(b)).map(([date,x])=>({date,netPnlUSDT:D.format(BigInt(x.equity)-BigInt(x.start))}));
    const today=days.find(x=>x.date===day(this.#now()));
    const recentFills=Object.values(s.fills).slice(-40).reverse().map(f=>{const r=clone(f);for(const k of ['quantity','price','notional','fee'])r[k]=D.format(r[k]);return r;});
    return {schema:SCHEMA,mode:'PAPER',liveExecutionEnabled:LIVE_EXECUTION_ENABLED,testnet:'PLAN_ONLY',automaticStrategyOrders:false,
      killSwitch:this.#fatal?{active:true,reason:this.#fatal}:clone(s.kill),reconciliation:clone(s.reconciliation),limits:clone(s.limits),
      portfolio:{initialCapitalUSDT:D.format(s.capital),cashUSDT:D.format(s.cash),reservedUSDT:D.format(reserved),availableUSDT:D.format(BigInt(s.cash)-reserved),
        equityUSDT:D.format(equity),valuationFresh:!!v,realizedPnlUSDT:D.format(s.realized),unrealizedPnlUSDT:v?D.format(v.unrealized):null,
        totalPnlUSDT:D.format(equity-BigInt(s.capital)),feesUSDT:D.format(s.fees),dailyPnlUSDT:today?.netPnlUSDT||'0',
        rolling7dPnlUSDT:D.format(sum(days.filter(x=>x.date>=day(this.#now()-6*86400000)).map(x=>D.parse(x.netPnlUSDT)))),
        highWaterUSDT:D.format(s.risk.highWater),days:days.slice(-30),positions:Object.entries(s.positions).map(([symbol,p])=>({symbol,quantity:D.format(p.quantity),costUSDT:D.format(p.cost),
          availableQuantity:D.format(BigInt(p.quantity)-sum(opens.filter(o=>o.symbol===symbol&&o.side==='SELL').map(remaining)))}))},
      orders:[...opens.slice().reverse(),...Object.values(s.orders).filter(o=>!OPEN.has(o.status)).slice(-60).reverse()].map(o=>this.#publicOrder(o)),openOrders:opens.length,recentFills,audit:clone(s.recent).reverse(),
      durability:{sequence:this.#journal.sequence,hash:this.#journal.hash,bytes:this.#journal.bytes,singleWriter:true},feePolicy:'SPOT_NO_BNB_0.10_PERCENT_PER_SIDE'};
  }
  close() {this.#journal?.close();}
}
module.exports={ExecutionLab,DEFAULT_LIMITS,SCHEMA,LIVE_EXECUTION_ENABLED,OPEN,TERMINAL};
