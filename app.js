"use strict";

const ENTRY_TFS = ["5m","15m","30m"];
const CONFIRM_TFS = ["1h","4h","12h","1d"];
const CONFIRM_WEIGHT = {"1h":1.0,"4h":0.9,"12h":0.6,"1d":0.5};
const TF_MS = {"5m":300000,"15m":900000,"30m":1800000,"1h":3600000,"4h":14400000,"12h":43200000,"1d":86400000};

const SPOT_BASE = "https://api.binance.com";
const FUT_BASE = "https://fapi.binance.com";

const SETTINGS_KEY = "lumierax_quant_settings_v1";
const STATE_KEY = "lumierax_quant_state_v1";

let settings = loadSettings();
let state = loadState();
let scanning = false;
let autoTimer = null;
let trackerTimer = null;

const $ = id => document.getElementById(id);
const sleep = ms => new Promise(r => setTimeout(r, ms));

function defaults(){
  return {
    telegramToken:"",
    spotChatId:"",
    futuresChatId:"",
    binanceKey:"",
    binanceSecret:"",
    spotScore:80,
    futuresScore:80,
    topN:8,
    scanMinutes:5,
    spotEnabled:true,
    futuresEnabled:true,
    autoScan:true
  };
}
function defaultState(){
  return {
    activeSpot:{},
    activeFutures:null,
    history:[],
    candidates:{spot:[],futures:[]},
    status:{spot:null,futures:null}
  };
}
function loadSettings(){
  try { return {...defaults(), ...JSON.parse(localStorage.getItem(SETTINGS_KEY)||"{}")}; }
  catch { return defaults(); }
}
function saveSettingsLocal(){ localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); }
function loadState(){
  try { return {...defaultState(), ...JSON.parse(localStorage.getItem(STATE_KEY)||"{}")}; }
  catch { return defaultState(); }
}
function saveState(){ localStorage.setItem(STATE_KEY, JSON.stringify(state)); }
function num(v,d=0){ const n=Number(v); return Number.isFinite(n)?n:d; }
function fmt(v){
  const n=Number(v);
  if(!Number.isFinite(n)) return "-";
  if(Math.abs(n)>=1000) return n.toLocaleString(undefined,{maximumFractionDigits:4});
  return n.toLocaleString(undefined,{maximumFractionDigits:8});
}
function esc(s){
  return String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
}
function nowIso(){ return new Date().toISOString(); }

function ema(values, period){
  if(values.length<period) return null;
  let out=values.slice(0,period).reduce((a,b)=>a+b,0)/period;
  const alpha=2/(period+1);
  for(const x of values.slice(period)) out=x*alpha+out*(1-alpha);
  return out;
}
function rsi(values, period=14){
  if(values.length<=period) return null;
  let gains=0, losses=0;
  for(let i=values.length-period;i<values.length;i++){
    const d=values[i]-values[i-1];
    gains+=Math.max(d,0); losses+=Math.max(-d,0);
  }
  const g=gains/period, l=losses/period;
  if(l===0) return 100;
  const rs=g/l;
  return 100-(100/(1+rs));
}
function atr(highs,lows,closes,period=14){
  if(closes.length<=period) return null;
  let a=[];
  for(let i=closes.length-period;i<closes.length;i++){
    a.push(Math.max(
      highs[i]-lows[i],
      Math.abs(highs[i]-closes[i-1]),
      Math.abs(lows[i]-closes[i-1])
    ));
  }
  return a.reduce((x,y)=>x+y,0)/period;
}
function arrays(candles){
  return {
    opens:candles.map(x=>num(x[1])),
    highs:candles.map(x=>num(x[2])),
    lows:candles.map(x=>num(x[3])),
    closes:candles.map(x=>num(x[4])),
    volumes:candles.map(x=>num(x[5])),
    taker:candles.map(x=>num(x[9]))
  };
}
function rejection(o,h,l,c){
  const range=Math.max(h-l,1e-12);
  const body=Math.abs(c-o);
  const upper=h-Math.max(o,c);
  const lower=Math.min(o,c)-l;
  if(lower/range>=0.45 && body/range<=0.45) return "BULLISH";
  if(upper/range>=0.45 && body/range<=0.45) return "BEARISH";
  return "NONE";
}
function regressionNext(values){
  const n=values.length;
  if(n<3) return values.at(-1);
  let sx=0, sy=0, sxx=0, sxy=0;
  values.forEach((y,x)=>{sx+=x;sy+=y;sxx+=x*x;sxy+=x*y;});
  const den=n*sxx-sx*sx;
  if(!den) return values.at(-1);
  const slope=(n*sxy-sx*sy)/den;
  const intercept=(sy-slope*sx)/n;
  return intercept+slope*n;
}
function patternHints(highs,lows,closes,av){
  const tags=[];
  if(closes.length<40 || !av) return tags;
  const l1=Math.min(...lows.slice(-40,-20)), l2=Math.min(...lows.slice(-20));
  if(Math.abs(l1-l2)<=av*.6 && closes.at(-1)>Math.max(...closes.slice(-15,-5))) tags.push("DOUBLE_BOTTOM_HINT");
  const h1=Math.max(...highs.slice(-40,-20)), h2=Math.max(...highs.slice(-20));
  if(Math.abs(h1-h2)<=av*.6 && closes.at(-1)<Math.min(...closes.slice(-15,-5))) tags.push("DOUBLE_TOP_HINT");
  const rr=Math.max(...highs.slice(-10))-Math.min(...lows.slice(-10));
  const pr=Math.max(...highs.slice(-30,-10))-Math.min(...lows.slice(-30,-10));
  if(pr>0 && rr<pr*.55) tags.push("COMPRESSION");
  return tags;
}

async function fetchJson(url, params={}){
  const u=new URL(url);
  Object.entries(params).forEach(([k,v])=>u.searchParams.set(k,v));
  for(let i=0;i<3;i++){
    try{
      const r=await fetch(u.toString(), {cache:"no-store"});
      if(r.ok) return await r.json();
      if(r.status===429 || r.status===418){ await sleep(1500*(i+1)); continue; }
      throw new Error(`HTTP ${r.status}`);
    }catch(e){
      if(i===2) throw e;
      await sleep(800*(i+1));
    }
  }
}

async function getUniverse(market){
  const url=market==="spot" ? `${SPOT_BASE}/api/v3/ticker/24hr` : `${FUT_BASE}/fapi/v1/ticker/24hr`;
  const data=await fetchJson(url);
  const excluded=new Set(["USDCUSDT","FDUSDUSDT","TUSDUSDT","USDPUSDT"]);
  const suffixes=["UPUSDT","DOWNUSDT","BULLUSDT","BEARUSDT"];
  let rows=data.filter(x=>{
    const s=x.symbol||"";
    return s.endsWith("USDT") && !excluded.has(s) && !suffixes.some(z=>s.endsWith(z)) &&
      num(x.quoteVolume)>0 && num(x.lastPrice)>0;
  }).map(x=>({symbol:x.symbol,quoteVolume:num(x.quoteVolume),price:num(x.lastPrice)}));
  rows.sort((a,b)=>b.quoteVolume-a.quoteVolume);
  rows=rows.slice(0,Math.max(3,Math.min(20,settings.topN)));
  if(!rows.length) return [];
  const logs=rows.map(x=>Math.log10(Math.max(x.quoteVolume,1)));
  const lo=Math.min(...logs), hi=Math.max(...logs), span=Math.max(hi-lo,1e-9);
  return rows.map((x,i)=>({...x,quality:(logs[i]-lo)/span}));
}

async function klines(market,symbol,tf){
  const url=market==="spot" ? `${SPOT_BASE}/api/v3/klines` : `${FUT_BASE}/fapi/v1/klines`;
  const data=await fetchJson(url,{symbol,interval:tf,limit:260});
  return Array.isArray(data)&&data.length>=211 ? data : null;
}

function entryAnalysis(candles, price, quality, direction){
  const closed=candles.slice(0,-1);
  if(closed.length<210) return null;
  const {opens,highs,lows,closes,volumes,taker}=arrays(closed);
  const e20=ema(closes,20), e50=ema(closes,50), e200=ema(closes,200);
  const rv=rsi(closes), av=atr(highs,lows,closes);
  if([e20,e50,e200,rv,av].some(x=>x===null) || av<=0) return null;

  const close=closes.at(-1), bullish=direction!=="SHORT";
  let score=0, tags=[];

  if(bullish){
    if(close>e20){score+=10;tags.push("ABOVE_EMA20")}
    if(e20>e50){score+=10;tags.push("EMA20_GT_50")}
    if(e50>e200){score+=8;tags.push("EMA50_GT_200")}
    if(close>e200){score+=7;tags.push("ABOVE_EMA200")}
    if(rv>=52&&rv<=68){score+=12;tags.push("RSI_HEALTHY")}
    else if(rv>=45&&rv<52)score+=5;
    else if(rv>=78){score-=8;tags.push("RSI_OVERBOUGHT")}
    const mom=(close/closes.at(-4)-1)*100;
    if(mom>0){score+=Math.min(10,4+mom*2);tags.push("MOMENTUM_UP")}
    const ph=Math.max(...highs.slice(-21,-1));
    if(close>ph){score+=14;tags.push("BREAKOUT")}
    else if(close>=ph-av*.35){score+=7;tags.push("NEAR_BREAKOUT")}
  }else{
    if(close<e20){score+=10;tags.push("BELOW_EMA20")}
    if(e20<e50){score+=10;tags.push("EMA20_LT_50")}
    if(e50<e200){score+=8;tags.push("EMA50_LT_200")}
    if(close<e200){score+=7;tags.push("BELOW_EMA200")}
    if(rv>=32&&rv<=48){score+=12;tags.push("RSI_HEALTHY_SHORT")}
    else if(rv>48&&rv<=55)score+=5;
    else if(rv<=22){score-=8;tags.push("RSI_OVERSOLD")}
    const mom=(close/closes.at(-4)-1)*100;
    if(mom<0){score+=Math.min(10,4+Math.abs(mom)*2);tags.push("MOMENTUM_DOWN")}
    const pl=Math.min(...lows.slice(-21,-1));
    if(close<pl){score+=14;tags.push("BREAKDOWN")}
    else if(close<=pl+av*.35){score+=7;tags.push("NEAR_BREAKDOWN")}
  }

  const avgV=volumes.slice(-21,-1).reduce((a,b)=>a+b,0)/20;
  const vr=avgV>0?volumes.at(-1)/avgV:0;
  if(vr>=1.5){score+=12;tags.push("VOLUME_STRONG")}
  else if(vr>=1.1)score+=7;

  const buyPct=volumes.at(-1)>0?taker.at(-1)/volumes.at(-1)*100:50;
  if(bullish){
    if(buyPct>=58){score+=10;tags.push("TAKER_BUY_STRONG")}
    else if(buyPct>=53)score+=5;
    else if(buyPct<=43){score-=8;tags.push("TAKER_SELL_STRONG")}
  }else{
    const sellPct=100-buyPct;
    if(sellPct>=58){score+=10;tags.push("TAKER_SELL_STRONG")}
    else if(sellPct>=53)score+=5;
    else if(sellPct<=43){score-=8;tags.push("BUY_PRESSURE_AGAINST_SHORT")}
  }

  const rej=rejection(opens.at(-1),highs.at(-1),lows.at(-1),closes.at(-1));
  if(bullish&&rej==="BULLISH"){score+=5;tags.push("BULLISH_REJECTION")}
  if(!bullish&&rej==="BEARISH"){score+=5;tags.push("BEARISH_REJECTION")}

  for(const t of patternHints(highs,lows,closes,av)){
    tags.push(t);
    if(bullish&&t==="DOUBLE_BOTTOM_HINT")score+=3;
    if(!bullish&&t==="DOUBLE_TOP_HINT")score+=3;
  }

  score+=Math.max(0,Math.min(8,quality*8));
  score=Math.max(0,Math.min(100,score));
  if(score<55)return null;

  let late,stop,risk,tp1,tp2,tp3;
  if(bullish){
    late=((price-e20)/av>1.65)||(price>close+av*1.2);
    stop=Math.min(Math.min(...lows.slice(-5))-av*.15, price-av*1.5);
    risk=price-stop;
    if(risk<=0)return null;
    [tp1,tp2,tp3]=[price+risk,price+2*risk,price+3*risk];
  }else{
    late=((e20-price)/av>1.65)||(price<close-av*1.2);
    stop=Math.max(Math.max(...highs.slice(-5))+av*.15, price+av*1.5);
    risk=stop-price;
    if(risk<=0)return null;
    [tp1,tp2,tp3]=[price-risk,price-2*risk,price-3*risk];
  }
  if(late)tags.push("LATE_ENTRY");
  return {rawScore:score,entry:price,sl:stop,tp1,tp2,tp3,late,tags,candleClose:Number(closed.at(-1)[6])};
}

function confirmationAnalysis(tf,candles,direction){
  const closed=candles.slice(0,-1), cur=candles.at(-1);
  if(closed.length<210)return null;
  const {opens,highs,lows,closes,volumes}=arrays(closed);
  const e20=ema(closes,20),e50=ema(closes,50),e200=ema(closes,200),rv=rsi(closes),av=atr(highs,lows,closes);
  if([e20,e50,e200,rv,av].some(x=>x===null)||av<=0)return null;
  const [o,h,l,c,v,buyV]=[1,2,3,4,5,9].map(i=>num(cur[i]));
  const buyPct=v>0?buyV/v*100:50;
  const fraction=Math.max(.05,Math.min(1,(Date.now()-Number(cur[0]))/TF_MS[tf]));
  const avgV=volumes.slice(-20).reduce((a,b)=>a+b,0)/20;
  const pace=avgV>0?v/(avgV*fraction):0;
  const pos=(c-l)/Math.max(h-l,1e-12), rej=rejection(o,h,l,c);
  const bullish=direction!=="SHORT";
  let delta=0,tags=[],hardBlock=false,trend;

  let bias;
  if(c>e20&&e20>e50&&e50>e200){bias=6;trend="BULLISH";tags.push("EMA_STACK_BULLISH")}
  else if(c<e20&&e20<e50&&e50<e200){bias=-6;trend="BEARISH";tags.push("EMA_STACK_BEARISH")}
  else if(c>e200){bias=2;trend="MIXED_BULLISH"}
  else {bias=-2;trend="MIXED_BEARISH"}
  delta+=bullish?bias:-bias;

  let pressure=0;
  if(buyPct>=58){pressure+=4;tags.push("LIVE_BUY_PRESSURE")}
  else if(buyPct<=42){pressure-=4;tags.push("LIVE_SELL_PRESSURE")}
  if(pace>=1.4&&buyPct>=55){pressure+=3;tags.push("BUY_VOLUME_ACCELERATION")}
  else if(pace>=1.4&&buyPct<=45){pressure-=3;tags.push("SELL_VOLUME_ACCELERATION")}
  if(pos>=.72)pressure+=2; else if(pos<=.28)pressure-=2;
  delta+=bullish?pressure:-pressure;

  if(rej==="BULLISH"){delta+=bullish?3:-3;tags.push("BULLISH_REJECTION")}
  if(rej==="BEARISH"){delta+=bullish?-3:3;tags.push("BEARISH_REJECTION")}

  const support=Math.min(...lows.slice(-20)), resistance=Math.max(...highs.slice(-20));
  const priorSupport=Math.min(...lows.slice(-31,-6)), priorResistance=Math.max(...highs.slice(-31,-6));
  const nearSupport=Math.abs(c-support)<=av*.55, nearResistance=Math.abs(resistance-c)<=av*.55;

  if(nearSupport&&rej==="BULLISH"&&buyPct>=52){delta+=bullish?4:-4;tags.push("SUPPORT_HOLD")}
  if(nearResistance&&rej==="BEARISH"&&buyPct<=48){delta+=bullish?-5:5;tags.push("RESISTANCE_REJECTION")}

  const bullRetest=closes.at(-1)>priorResistance&&l<=priorResistance+av*.4&&c>=priorResistance&&buyPct>=52;
  if(bullRetest){delta+=bullish?6:-6;tags.push("BREAKOUT_RETEST_HELD")}

  const bearRetest=closes.at(-1)<priorSupport&&h>=priorSupport-av*.4&&c<=priorSupport&&buyPct<=48;
  if(bearRetest){
    delta+=bullish?-7:7;tags.push("BROKEN_SUPPORT_RETEST");
    if(bullish&&["4h","12h","1d"].includes(tf)&&rej==="BEARISH")hardBlock=true;
  }

  if(rv<=35){
    if(c>o&&buyPct>=55){delta+=bullish?4:-4;tags.push("OVERSOLD_RECOVERY")}
    else tags.push("OVERSOLD_UNCONFIRMED");
  }else if(rv>=72){
    if(c<o&&buyPct<=48){delta+=bullish?-5:5;tags.push("OVERBOUGHT_REJECTION")}
    else tags.push("OVERBOUGHT");
  }

  const projSup=regressionNext(lows.slice(-30)), projRes=regressionNext(highs.slice(-30));
  if(Math.abs(l-projSup)<=av*.55&&c>o&&buyPct>=52){delta+=bullish?3:-3;tags.push("TREND_RETEST_HELD")}
  if(Math.abs(h-projRes)<=av*.55&&c<o&&buyPct<=48){delta+=bullish?-3:3;tags.push("TREND_RESISTANCE_REJECTION")}

  if(["12h","1d"].includes(tf)){
    if(bullish&&nearResistance&&rej==="BEARISH"&&buyPct<=44){hardBlock=true;tags.push("MAJOR_RESISTANCE_BLOCK")}
    if(!bullish&&nearSupport&&rej==="BULLISH"&&buyPct>=56){hardBlock=true;tags.push("MAJOR_SUPPORT_BLOCK")}
  }

  for(const t of patternHints(highs,lows,closes,av)){
    tags.push(t);
    if(t==="DOUBLE_BOTTOM_HINT")delta+=bullish?2:-2;
    if(t==="DOUBLE_TOP_HINT")delta+=bullish?-2:2;
  }

  delta=Math.max(-12,Math.min(12,delta));
  return {delta,trend,hardBlock,rsi:rv,buyPct,pace,rejection:rej,tags};
}

async function futuresExtra(symbol,direction){
  const bullish=direction==="LONG";
  let delta=0,tags=[],details={};
  const safe=async(p)=>{try{return await p}catch{return null}};
  const [premium,depth,oi,taker]=await Promise.all([
    safe(fetchJson(`${FUT_BASE}/fapi/v1/premiumIndex`,{symbol})),
    safe(fetchJson(`${FUT_BASE}/fapi/v1/depth`,{symbol,limit:20})),
    safe(fetchJson(`${FUT_BASE}/futures/data/openInterestHist`,{symbol,period:"5m",limit:2})),
    safe(fetchJson(`${FUT_BASE}/futures/data/takerlongshortRatio`,{symbol,period:"5m",limit:1}))
  ]);

  if(premium){
    const funding=num(premium.lastFundingRate); details.funding=funding;
    if(bullish&&funding>.001){delta-=2;tags.push("FUNDING_LONG_CROWDED")}
    else if(!bullish&&funding<-.001){delta-=2;tags.push("FUNDING_SHORT_CROWDED")}
    else if(Math.abs(funding)<.0005){delta+=1;tags.push("FUNDING_NORMAL")}
  }
  if(depth){
    const bids=(depth.bids||[]).reduce((s,[p,q])=>s+num(p)*num(q),0);
    const asks=(depth.asks||[]).reduce((s,[p,q])=>s+num(p)*num(q),0);
    const ratio=asks>0?bids/asks:1; details.bookRatio=ratio;
    if(bullish&&ratio>=1.15){delta+=2;tags.push("ORDERBOOK_BID_SUPPORT")}
    else if(bullish&&ratio<=.85){delta-=2;tags.push("ORDERBOOK_ASK_PRESSURE")}
    else if(!bullish&&ratio<=.85){delta+=2;tags.push("ORDERBOOK_ASK_SUPPORT_SHORT")}
    else if(!bullish&&ratio>=1.15){delta-=2;tags.push("ORDERBOOK_BID_AGAINST_SHORT")}
  }
  if(Array.isArray(oi)&&oi.length>=2){
    const old=num(oi.at(-2).sumOpenInterest), cur=num(oi.at(-1).sumOpenInterest);
    const change=old>0?(cur/old-1)*100:0; details.oiChange=change;
    if(change>.3){delta+=1.5;tags.push("OI_EXPANDING")}
    else if(change<-.5){delta-=1;tags.push("OI_CONTRACTING")}
  }
  if(Array.isArray(taker)&&taker.length){
    const ratio=num(taker.at(-1).buySellRatio,1); details.takerRatio=ratio;
    if(bullish&&ratio>=1.1){delta+=2;tags.push("FUTURES_TAKER_BUY")}
    else if(bullish&&ratio<=.9){delta-=2;tags.push("FUTURES_TAKER_SELL")}
    else if(!bullish&&ratio<=.9){delta+=2;tags.push("FUTURES_TAKER_SELL")}
    else if(!bullish&&ratio>=1.1){delta-=2;tags.push("FUTURES_TAKER_BUY_AGAINST_SHORT")}
  }
  return {delta:Math.max(-6,Math.min(6,delta)),tags,details};
}

async function analyzeSymbol(market,item){
  const needed={};
  // First fetch entry frames; only fetch confirmation frames if at least one raw candidate exists.
  const entries=await Promise.all(ENTRY_TFS.map(tf=>klines(market,item.symbol,tf).catch(()=>null)));
  ENTRY_TFS.forEach((tf,i)=>needed[tf]=entries[i]);
  if(ENTRY_TFS.some(tf=>!needed[tf]))return [];

  const dirs=market==="spot"?["BUY"]:["LONG","SHORT"];
  const rawCandidates=[];
  for(const direction of dirs){
    for(const tf of ENTRY_TFS){
      const e=entryAnalysis(needed[tf],item.price,item.quality,direction);
      if(e)rawCandidates.push({tf,direction,e});
    }
  }
  if(!rawCandidates.length)return [];

  const confirms=await Promise.all(CONFIRM_TFS.map(tf=>klines(market,item.symbol,tf).catch(()=>null)));
  CONFIRM_TFS.forEach((tf,i)=>needed[tf]=confirms[i]);

  const out=[];
  for(const raw of rawCandidates){
    let contextDelta=0, blocks=[], context={};
    for(const tf of CONFIRM_TFS){
      if(!needed[tf])continue;
      const c=confirmationAnalysis(tf,needed[tf],raw.direction);
      if(!c)continue;
      contextDelta+=c.delta*CONFIRM_WEIGHT[tf];
      if(c.hardBlock)blocks.push(tf);
      context[tf]={delta:+c.delta.toFixed(2),trend:c.trend,rsi:+c.rsi.toFixed(1),buyPct:+c.buyPct.toFixed(1),pace:+c.pace.toFixed(2),rejection:c.rejection,tags:c.tags};
    }
    let extra={delta:0,tags:[],details:{}};
    if(market==="futures") extra=await futuresExtra(item.symbol,raw.direction);
    const score=Math.max(0,Math.min(100,raw.e.rawScore+contextDelta+extra.delta));
    let decision,reason;
    if(blocks.length){decision="BLOCKED";reason="HIGHER_TF_BLOCK:"+blocks.join(",")}
    else if(raw.e.late){decision="WAIT";reason="LATE_ENTRY"}
    else if(score>=80){decision="CONFIRMED";reason="MULTI_TF_CONFIRMED"}
    else if(score>=62){decision="WAIT";reason="NEEDS_CONFIRMATION"}
    else {decision="BLOCKED";reason="LOW_FINAL_SCORE"}

    out.push({
      market,symbol:item.symbol,timeframe:raw.tf,side:raw.direction,
      rawScore:+raw.e.rawScore.toFixed(2),score:+score.toFixed(2),decision,reason,
      entry:raw.e.entry,sl:raw.e.sl,tp1:raw.e.tp1,tp2:raw.e.tp2,tp3:raw.e.tp3,
      tags:raw.e.tags,context,extraTags:extra.tags,extra:extra.details,
      candleClose:raw.e.candleClose,createdAt:nowIso()
    });
  }
  return out;
}

async function sendTelegram(market,text){
  const token=settings.telegramToken.trim();
  const chat=(market==="spot"?settings.spotChatId:settings.futuresChatId).trim();
  if(!token||!chat) throw new Error("Telegram Token أو Chat ID غير مضبوط");
  const base=`https://api.telegram.org/bot${encodeURIComponent(token)}/sendMessage`;
  const url=new URL(base);
  url.searchParams.set("chat_id",chat);
  url.searchParams.set("text",text);
  try{
    const r=await fetch(url.toString(),{method:"GET",cache:"no-store"});
    if(!r.ok){
      const d=await r.json().catch(()=>({}));
      throw new Error(d.description||`Telegram HTTP ${r.status}`);
    }
    return true;
  }catch(e){
    // Some browsers may enforce CORS. no-cors still sends a simple GET, but response is opaque.
    try{
      await fetch(url.toString(),{method:"GET",mode:"no-cors",cache:"no-store"});
      return true;
    }catch{
      throw e;
    }
  }
}

function signalKey(c){return `${c.market}:${c.symbol}:${c.timeframe}:${c.side}:${c.candleClose}`}

function openMessage(c){
  const title=c.market==="spot"?"SPOT":"FUTURES";
  const lock=c.market==="spot"
    ?"🔒 لن ترسل إشارة ثانية لنفس العملة حتى TP3 أو SL."
    :"🔒 لن ترسل أي إشارة Futures أخرى حتى TP3 أو SL.";
  return `📡 ${title} SIGNAL

${c.symbol} — ${c.side}
Timeframe: ${c.timeframe}
Score: ${c.score}

Entry: ${fmt(c.entry)}
TP1: ${fmt(c.tp1)}
TP2: ${fmt(c.tp2)}
TP3: ${fmt(c.tp3)}
SL: ${fmt(c.sl)}

${lock}`;
}
function resultMessage(s){
  const title=s.status==="TP3"?"✅ TARGETS COMPLETED":"❌ STOP LOSS HIT";
  const pct=s.resultPct??0;
  return `${title} — ${s.market.toUpperCase()}

${s.symbol} — ${s.side}
Timeframe: ${s.timeframe}
Score: ${s.score}
Entry: ${fmt(s.entry)}
TP3: ${fmt(s.tp3)}
SL: ${fmt(s.sl)}

النتيجة: ${s.status}
سعر اللمس: ${fmt(s.hitPrice)}
الحركة: ${pct.toFixed(3)}%

🔓 متاح الآن استقبال إشارة جديدة.`;
}

async function acceptCandidate(c){
  if(c.market==="spot"){
    if(state.activeSpot[c.symbol])return false;
  }else{
    if(state.activeFutures)return false;
  }
  const signal={...c,id:signalKey(c),status:"OPEN",tp1Hit:false,tp2Hit:false,openedAt:nowIso()};
  try{
    await sendTelegram(c.market,openMessage(c));
  }catch(e){
    console.warn("Telegram:",e);
    // Do not lock if the initial message could not be sent.
    throw e;
  }
  if(c.market==="spot")state.activeSpot[c.symbol]=signal;
  else state.activeFutures=signal;
  saveState();
  render();
  return true;
}

async function scanMarket(market){
  if(scanning)return;
  scanning=true; updateBadge();
  const t0=Date.now();
  try{
    const universe=await getUniverse(market);
    let all=[];
    // Sequential symbols keep GitHub Pages/browser request pressure modest.
    for(let i=0;i<universe.length;i++){
      setStatusText(market,`فحص ${i+1}/${universe.length}: ${universe[i].symbol}`);
      try{ all.push(...await analyzeSymbol(market,universe[i])); }
      catch(e){ console.warn(universe[i].symbol,e); }
      await sleep(150);
    }
    all.sort((a,b)=>b.score-a.score);
    state.candidates[market]=all.slice(0,30);
    state.status[market]={
      at:nowIso(),symbols:universe.length,candidates:all.length,
      confirmed:all.filter(x=>x.decision==="CONFIRMED").length,
      wait:all.filter(x=>x.decision==="WAIT").length,
      blocked:all.filter(x=>x.decision==="BLOCKED").length,
      elapsed:Math.round((Date.now()-t0)/1000),error:""
    };
    const threshold=market==="spot"?settings.spotScore:settings.futuresScore;
    const confirmed=all.filter(x=>x.decision==="CONFIRMED"&&x.score>=threshold);

    if(market==="spot"){
      for(const c of confirmed){
        if(state.activeSpot[c.symbol])continue;
        try{ await acceptCandidate(c); }catch{}
        break; // One new Spot alert per scan in static version.
      }
    }else if(!state.activeFutures && confirmed.length){
      try{ await acceptCandidate(confirmed[0]); }catch{}
    }
    saveState();
  }catch(e){
    state.status[market]={at:nowIso(),symbols:0,candidates:0,confirmed:0,wait:0,blocked:0,elapsed:0,error:String(e.message||e)};
    saveState();
  }finally{
    scanning=false;updateBadge();render();
  }
}

async function getPrice(market,symbol){
  const url=market==="spot"?`${SPOT_BASE}/api/v3/ticker/price`:`${FUT_BASE}/fapi/v1/ticker/price`;
  const d=await fetchJson(url,{symbol});
  return num(d.price);
}

async function trackOne(s){
  let price;
  try{price=await getPrice(s.market,s.symbol)}catch{return}
  if(price<=0)return;
  const bull=s.side!=="SHORT";
  const slHit=bull?price<=s.sl:price>=s.sl;
  const tp3Hit=bull?price>=s.tp3:price<=s.tp3;
  if(slHit||tp3Hit){
    s.status=tp3Hit?"TP3":"SL";
    s.hitPrice=price;
    s.closedAt=nowIso();
    s.resultPct=bull?(price-s.entry)/s.entry*100:(s.entry-price)/s.entry*100;
    try{await sendTelegram(s.market,resultMessage(s));}catch(e){console.warn(e)}
    state.history.unshift(s);
    state.history=state.history.slice(0,100);
    if(s.market==="spot")delete state.activeSpot[s.symbol];
    else state.activeFutures=null;
    saveState();render();return;
  }
  if(bull){
    if(price>=s.tp1)s.tp1Hit=true;
    if(price>=s.tp2)s.tp2Hit=true;
  }else{
    if(price<=s.tp1)s.tp1Hit=true;
    if(price<=s.tp2)s.tp2Hit=true;
  }
  s.lastPrice=price;s.lastCheck=nowIso();
  saveState();render();
}

async function trackerTick(){
  const signals=[...Object.values(state.activeSpot)];
  if(state.activeFutures)signals.push(state.activeFutures);
  for(const s of signals)await trackOne(s);
}

function statusClass(v){return v==="CONFIRMED"||v==="TP3"?"ok":v==="WAIT"?"warn":"bad"}
function cardSignal(s){
  const tags=[...(s.tags||[]),...(s.extraTags||[])].slice(0,12).map(x=>`<span class="tag">${esc(x)}</span>`).join("");
  return `<div class="card">
    <div class="signal-head">
      <div><b>${esc(s.symbol)}</b> · ${esc(s.timeframe)} · ${esc(s.side)}</div>
      <div class="${statusClass(s.decision||s.status)}">${esc(s.decision||s.status)}</div>
    </div>
    <div class="grid">
      <div class="metric"><div class="k">Score</div><div class="v">${fmt(s.score)}</div></div>
      <div class="metric"><div class="k">Entry</div><div class="v">${fmt(s.entry)}</div></div>
      <div class="metric"><div class="k">Current</div><div class="v">${fmt(s.lastPrice)}</div></div>
      <div class="metric"><div class="k">TP1 ${s.tp1Hit?"✅":""}</div><div class="v">${fmt(s.tp1)}</div></div>
      <div class="metric"><div class="k">TP2 ${s.tp2Hit?"✅":""}</div><div class="v">${fmt(s.tp2)}</div></div>
      <div class="metric"><div class="k">TP3</div><div class="v">${fmt(s.tp3)}</div></div>
      <div class="metric"><div class="k">SL</div><div class="v">${fmt(s.sl)}</div></div>
      <div class="metric"><div class="k">Raw Score</div><div class="v">${fmt(s.rawScore)}</div></div>
      <div class="metric"><div class="k">Reason</div><div class="v">${esc(s.reason||"-")}</div></div>
    </div>
    <div style="margin-top:8px">${tags}</div>
  </div>`;
}
function summary(market){
  const x=state.status[market];
  if(!x)return `<div class="card empty">لم يتم الفحص بعد.</div>`;
  return `<div class="card">
    <div class="grid">
      <div class="metric"><div class="k">آخر فحص</div><div class="v">${new Date(x.at).toLocaleString()}</div></div>
      <div class="metric"><div class="k">العملات</div><div class="v">${x.symbols}</div></div>
      <div class="metric"><div class="k">المرشحين</div><div class="v">${x.candidates}</div></div>
      <div class="metric"><div class="k">CONFIRMED</div><div class="v ok">${x.confirmed}</div></div>
      <div class="metric"><div class="k">WAIT</div><div class="v warn">${x.wait}</div></div>
      <div class="metric"><div class="k">BLOCKED</div><div class="v bad">${x.blocked}</div></div>
    </div>
    ${x.error?`<p class="bad">${esc(x.error)}</p>`:""}
  </div>`;
}
function candidates(market){
  const rows=state.candidates[market]||[];
  if(!rows.length)return `<div class="card empty">لا توجد مرشحات بعد.</div>`;
  return `<div class="card"><h3>أفضل المرشحين</h3><div class="scroll"><table>
    <thead><tr><th>العملة</th><th>الفريم</th><th>الجهة</th><th>Score</th><th>الحالة</th><th>Entry</th></tr></thead>
    <tbody>${rows.slice(0,20).map(x=>`<tr><td>${esc(x.symbol)}</td><td>${x.timeframe}</td><td>${x.side}</td><td>${fmt(x.score)}</td><td class="${statusClass(x.decision)}">${x.decision}</td><td>${fmt(x.entry)}</td></tr>`).join("")}</tbody>
  </table></div></div>`;
}
function history(market){
  const rows=state.history.filter(x=>x.market===market).slice(0,20);
  if(!rows.length)return `<div class="card empty">لا توجد نتائج نهائية بعد.</div>`;
  return `<div class="card"><h3>آخر النتائج</h3><div class="scroll"><table>
    <thead><tr><th>العملة</th><th>الفريم</th><th>الجهة</th><th>النتيجة</th><th>Score</th><th>%</th></tr></thead>
    <tbody>${rows.map(x=>`<tr><td>${esc(x.symbol)}</td><td>${x.timeframe}</td><td>${x.side}</td><td class="${statusClass(x.status)}">${x.status}</td><td>${fmt(x.score)}</td><td>${fmt(x.resultPct)}</td></tr>`).join("")}</tbody>
  </table></div></div>`;
}
function render(){
  $("futuresStatus").innerHTML=summary("futures");
  $("spotStatus").innerHTML=summary("spot");
  $("futuresActive").innerHTML=state.activeFutures?`<h3>الإشارة النشطة</h3>${cardSignal(state.activeFutures)}`:`<div class="card empty">لا توجد إشارة Futures نشطة.</div>`;
  const activeSpot=Object.values(state.activeSpot);
  $("spotActive").innerHTML=activeSpot.length?`<h3>إشارات Spot النشطة</h3>${activeSpot.map(cardSignal).join("")}`:`<div class="card empty">لا توجد إشارة Spot نشطة.</div>`;
  $("futuresCandidates").innerHTML=candidates("futures");
  $("spotCandidates").innerHTML=candidates("spot");
  $("futuresHistory").innerHTML=history("futures");
  $("spotHistory").innerHTML=history("spot");
  updateBadge();
}
function setStatusText(market,text){
  const el=$(market+"Status");
  if(el)el.innerHTML=`<div class="card spinner">${esc(text)}</div>`;
}
function updateBadge(){
  const on=settings.autoScan&&!document.hidden;
  $("scannerBadge").textContent=scanning?"يفحص الآن":on?"يعمل أثناء فتح الصفحة":"متوقف";
  $("scannerBadge").className="badge "+(on?"on":"off");
}
function fillSettings(){
  $("telegramToken").value=settings.telegramToken;
  $("spotChatId").value=settings.spotChatId;
  $("futuresChatId").value=settings.futuresChatId;
  $("binanceKey").value=settings.binanceKey;
  $("binanceSecret").value=settings.binanceSecret;
  $("spotScore").value=settings.spotScore;
  $("futuresScore").value=settings.futuresScore;
  $("topN").value=settings.topN;
  $("scanMinutes").value=settings.scanMinutes;
  $("spotEnabled").checked=settings.spotEnabled;
  $("futuresEnabled").checked=settings.futuresEnabled;
  $("autoScan").checked=settings.autoScan;
}
function readSettings(){
  settings={
    telegramToken:$("telegramToken").value.trim(),
    spotChatId:$("spotChatId").value.trim(),
    futuresChatId:$("futuresChatId").value.trim(),
    binanceKey:$("binanceKey").value.trim(),
    binanceSecret:$("binanceSecret").value.trim(),
    spotScore:Math.max(0,Math.min(100,num($("spotScore").value,80))),
    futuresScore:Math.max(0,Math.min(100,num($("futuresScore").value,80))),
    topN:Math.max(3,Math.min(20,Math.round(num($("topN").value,8)))),
    scanMinutes:Math.max(1,Math.min(60,num($("scanMinutes").value,5))),
    spotEnabled:$("spotEnabled").checked,
    futuresEnabled:$("futuresEnabled").checked,
    autoScan:$("autoScan").checked
  };
  saveSettingsLocal(); scheduleAuto(); updateBadge();
}
function scheduleAuto(){
  if(autoTimer)clearInterval(autoTimer);
  if(settings.autoScan){
    autoTimer=setInterval(async()=>{
      if(document.hidden||scanning)return;
      if(settings.spotEnabled)await scanMarket("spot");
      if(settings.futuresEnabled)await scanMarket("futures");
    }, settings.scanMinutes*60*1000);
  }
}

document.querySelectorAll(".tab").forEach(btn=>btn.addEventListener("click",()=>{
  document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));
  document.querySelectorAll(".panel").forEach(x=>x.classList.remove("active"));
  btn.classList.add("active");$(btn.dataset.tab).classList.add("active");
}));

$("saveSettings").onclick=()=>{
  readSettings();
  $("settingsMessage").textContent="✅ تم الحفظ على هذا الجهاز فقط.";
};
$("clearSecrets").onclick=()=>{
  if(!confirm("مسح Token وBinance keys وChat IDs من هذا الجهاز؟"))return;
  settings.telegramToken=settings.spotChatId=settings.futuresChatId=settings.binanceKey=settings.binanceSecret="";
  saveSettingsLocal();fillSettings();
  $("settingsMessage").textContent="✅ تم مسح الأسرار من المتصفح.";
};
$("testSpotTelegram").onclick=async()=>{
  try{readSettings();await sendTelegram("spot","✅ SPOT Telegram connected from GitHub Pages.");alert("تم إرسال اختبار Spot");}
  catch(e){alert("فشل: "+e.message)}
};
$("testFuturesTelegram").onclick=async()=>{
  try{readSettings();await sendTelegram("futures","✅ FUTURES Telegram connected from GitHub Pages.");alert("تم إرسال اختبار Futures");}
  catch(e){alert("فشل: "+e.message)}
};
$("scanSpotNow").onclick=()=>scanMarket("spot");
$("scanFuturesNow").onclick=()=>scanMarket("futures");

document.addEventListener("visibilitychange",updateBadge);

fillSettings();
render();
scheduleAuto();
trackerTimer=setInterval(()=>{ if(!document.hidden) trackerTick(); },15000);
updateBadge();

// Initial scan shortly after opening, if enabled.
setTimeout(async()=>{
  if(!settings.autoScan || document.hidden)return;
  if(settings.spotEnabled)await scanMarket("spot");
  if(settings.futuresEnabled)await scanMarket("futures");
},1500);
