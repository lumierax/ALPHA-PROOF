'use strict';
const crypto=require('node:crypto');
const path=require('node:path');
const fs=require('node:fs');
const {ExecutionLab}=require('./lab');
const {fault,digest}=require('./journal');

function readBody(req,limit=65536) {
  return new Promise((resolve,reject)=>{
    const chunks=[];let bytes=0,settled=false;
    const fail=(code,status)=>{if(!settled){settled=true;reject(Object.assign(fault(code),{status}));}};
    req.on('data',chunk=>{bytes+=chunk.length;if(bytes>limit){fail('BODY_TOO_LARGE',413);return;}if(!settled)chunks.push(chunk);});
    req.on('aborted',()=>fail('REQUEST_ABORTED',400));req.on('error',()=>fail('REQUEST_READ_ERROR',400));
    req.on('end',()=>{
      if(settled)return;
      try {
        const text=new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks));
        const value=text?JSON.parse(text):{};
        if(!value||typeof value!=='object'||Array.isArray(value))throw fault('INVALID_JSON_OBJECT');
        settled=true;resolve(value);
      } catch {fail('INVALID_JSON_OBJECT',400);}
    });
  });
}
function staticFile(publicDir,pathname) {
  let decoded;try{decoded=decodeURIComponent(pathname);}catch{return null;}
  if(decoded.includes('\0')||decoded.includes('\\'))return null;
  const root=fs.realpathSync(publicDir),file=path.resolve(root,'.'+(decoded==='/'?'/index.html':decoded));
  if(!file.startsWith(root+path.sep))return null;
  try{const real=fs.realpathSync(file);return real.startsWith(root+path.sep)&&fs.statSync(real).isFile()?real:null;}catch{return null;}
}

class PublicMarketData {
  constructor({eligible=()=>false,fetcher=fetch,clock=Date.now}={}) {this.eligible=eligible;this.fetcher=fetcher;this.clock=clock;this.rules=new Map();}
  async get(symbol) {
    if(!/^[A-Z0-9]{2,20}USDT$/.test(symbol))throw fault('SPOT_USDT_ONLY');
    const query='?symbol='+encodeURIComponent(symbol),started=this.clock();
    const read=async endpoint=>{
      // Only public GET market data. No configurable base URL and no credentials.
      const response=await this.fetcher('https://data-api.binance.vision/api/v3/'+endpoint+query,{method:'GET',redirect:'error',signal:AbortSignal.timeout(5000),headers:{Accept:'application/json'}});
      if(!response.ok)throw fault('MARKET_DATA_HTTP_'+response.status);
      return response.json();
    };
    let cached=this.rules.get(symbol);
    const jobs=await Promise.allSettled([read('ticker/bookTicker'),read('avgPrice'),read('ticker/price'),
      cached&&started-cached.at<300000?Promise.resolve(cached):read('exchangeInfo').then(x=>({value:x.symbols?.find(s=>s.symbol===symbol),at:started}))]);
    const failure=jobs.find(r=>r.status==='rejected');if(failure)throw failure.reason;
    const [book,average,last,metadata]=jobs.map(r=>r.value);
    if(!metadata.value||book.symbol!==symbol||last.symbol!==symbol)throw fault('MARKET_DATA_SYMBOL_MISMATCH');
    this.rules.delete(symbol);this.rules.set(symbol,metadata);
    while(this.rules.size>120)this.rules.delete(this.rules.keys().next().value);
    return {symbol,eligible:!!this.eligible(symbol),rules:metadata.value,rulesAsOf:metadata.at,average,lastPrice:last.price,
      quote:{id:digest({symbol,book,started}),asOf:started,bidPrice:book.bidPrice,askPrice:book.askPrice,bidQty:book.bidQty,askQty:book.askQty}};
  }
}
function createService({dataDir,eligible=()=>false,token=process.env.EXECUTION_CONTROL_TOKEN||'',origins=(process.env.EXECUTION_ALLOWED_ORIGINS||'').split(',').filter(Boolean),
  market,lab:providedLab,env=process.env}={}) {
  let lab=providedLab,startupError=null,busy=false,timer=null;
  const configured=typeof token==='string'&&token.length>=32&&token.length<=256;
  try {
    if(!lab)lab=new ExecutionLab({directory:env.EXECUTION_DATA_DIR||path.join(dataDir,'execution-lab'),initialCapitalUSDT:env.EXECUTION_INITIAL_USDT||'10000',
      risk:JSON.parse(env.EXECUTION_RISK_JSON||'{}'),mode:env.EXECUTION_MODE||'PAPER'});
  } catch(e) {startupError=e.code||'EXECUTION_STARTUP_FAILED';}
  const feed=market||new PublicMarketData({eligible});
  const status=()=>lab?{...lab.status(),controlsConfigured:configured}:{schema:'alpha-proof-execution-lab/1',mode:'LOCKED',liveExecutionEnabled:false,testnet:'PLAN_ONLY',
    controlsConfigured:configured,killSwitch:{active:true,reason:startupError},reconciliation:{ok:false}};
  const send=(res,code,value,origin)=>{
    if(res.destroyed||res.writableEnded)return;
    const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Vary':'Origin'};
    if(origin)headers['Access-Control-Allow-Origin']=origin;
    headers['Access-Control-Allow-Methods']='GET,POST,OPTIONS';headers['Access-Control-Allow-Headers']='Content-Type,Authorization';
    res.writeHead(code,headers);res.end(code===204?'':JSON.stringify(value));
  };
  const originFor=req=>{
    const origin=req.headers.origin;if(!origin)return null;
    // Same hostname/port supports TLS terminated by the deployment proxy. The
    // Bearer token is still mandatory; cookies and the Host header cannot authorize.
    try {const u=new URL(origin);if(['https:','http:'].includes(u.protocol)&&u.host===req.headers.host)return origin;}catch{}
    if(origins.includes(origin))return origin;
    throw Object.assign(fault('ORIGIN_NOT_ALLOWED'),{status:403});
  };
  const authorize=req=>{
    if(!configured)throw Object.assign(fault('EXECUTION_CONTROL_TOKEN_REQUIRED'),{status:503});
    const auth=req.headers.authorization||'',expected='Bearer '+token;
    const got=Buffer.from(auth),want=Buffer.from(expected);
    if(got.length!==want.length||!crypto.timingSafeEqual(got,want))throw Object.assign(fault('UNAUTHORIZED'),{status:401});
  };
  const contexts=async symbol=>{
    const symbols=[...new Set([...lab.requiredSymbols(),...(symbol?[symbol]:[])])];
    const results=[];
    // Bounded concurrency avoids request bursts on a constrained VPS.
    for(let i=0;i<symbols.length;i+=3){const batch=await Promise.allSettled(symbols.slice(i,i+3).map(s=>feed.get(s)));for(const r of batch){if(r.status==='rejected')throw r.reason;results.push(r.value);}}
    return results;
  };
  async function handle(req,res,url) {
    if(!url.pathname.startsWith('/api/execution/'))return false;
    let origin=null;
    try {
      origin=originFor(req);
      if(req.method==='OPTIONS'){send(res,204,{},origin);return true;}
      if(req.method==='GET'&&url.pathname==='/api/execution/state'){send(res,200,status(),origin||'*');return true;}
      if(req.method!=='POST')throw Object.assign(fault('METHOD_NOT_ALLOWED'),{status:405});
      authorize(req);
      if(!lab)throw Object.assign(fault(startupError),{status:503});
      if(!(req.headers['content-type']||'').toLowerCase().startsWith('application/json'))throw Object.assign(fault('JSON_CONTENT_TYPE_REQUIRED'),{status:415});
      const body=await readBody(req),route=url.pathname;
      let result;
      if(route==='/api/execution/kill'){result=lab.kill('OPERATOR_KILL');}
      else if(route==='/api/execution/cancel'){
        if(typeof body.clientOrderId!=='string')throw fault('INVALID_CLIENT_ORDER_ID');
        result=lab.cancel(body.clientOrderId);
      } else if(route==='/api/execution/reconcile'){result=lab.reconcile();}
      else if(['/api/execution/plans','/api/execution/orders','/api/execution/resume'].includes(route)) {
        if(route!=='/api/execution/resume') {
          lab.validateIntent(body);
          if(route==='/api/execution/orders'&&body.mode==='TESTNET')throw fault('TESTNET_PLAN_ONLY');
          if(route==='/api/execution/orders'&&lab.lookup(body)){send(res,200,lab.submit(body),origin);return true;}
        }
        if(busy)throw Object.assign(fault('EXECUTION_BUSY_RETRY_SAME_ID'),{status:409});
        busy=true;
        try {
          const fresh=await contexts(body.symbol);
          if(route==='/api/execution/plans')result=lab.plan(body,fresh);
          else if(route==='/api/execution/orders')result=lab.submit(body,fresh);
          else result=lab.resume(fresh);
        } finally {busy=false;}
      } else throw Object.assign(fault('EXECUTION_ROUTE_NOT_FOUND'),{status:404});
      send(res,result?.ok===false?422:200,result,origin);
    } catch(e) {send(res,e.status||(e.code==='ORDER_NOT_FOUND'?404:422),{ok:false,code:e.code||'EXECUTION_REQUEST_FAILED',liveExecutionEnabled:false},origin);}
    return true;
  }
  async function poll() {
    if(!lab||busy||!lab.requiredSymbols().length)return;
    busy=true;
    try{lab.tick(await contexts());}catch(e){try{lab.kill(e.code||'MARKET_DATA_FAILURE');}catch{}}
    finally{busy=false;}
  }
  return {handle,status,lab,poll,start(){if(!timer){timer=setInterval(poll,5000);timer.unref?.();}},close(){clearInterval(timer);lab?.close();}};
}
module.exports={createService,PublicMarketData,readBody,staticFile};
