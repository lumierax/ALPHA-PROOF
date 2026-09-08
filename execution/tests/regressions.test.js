'use strict';
const test=require('node:test'),A=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm');
const Portfolio=require('../../portfolio-manager');
const {staticFile}=require('../http');
test('Shared portfolio cards read the lexical server state on both shipped pages',()=>{
  for(const file of ['index.html','public/index.html']) {
    const html=fs.readFileSync(path.join(__dirname,'../..',file),'utf8'),code=html.match(/<script id="phase2-script">([\s\S]*?)<\/script>/)[1],elements={};
    const context={window:{},serverState:{sharedPortfolio:{scope:'GLOBAL_SHARED',equityUSDT:1234,cashUSDT:1000,mode:'PAPER',integrity:{ok:true},openPositions:[]}},
      document:{getElementById:id=>elements[id]||(elements[id]={style:{},textContent:''})},setInterval(){},setTimeout(fn){fn();}};
    vm.runInNewContext(code,context);A.match(elements.p2Equity.textContent,/1,234/);A.equal(elements.p2Integrity.textContent,'متوازنة');
  }
});
test('Unknown portfolio modes cannot silently produce Paper fills',()=>{
  for(const mode of ['LIVE','UNKNOWN','TESTNET','TYPO']) {
    const s=Portfolio.open(Portfolio.initialState({mode}),{finalDecision:'ENTER',direction:'LONG',caseId:'x',symbol:'BTCUSDT',fillPrice:100});
    A.equal(s.fills.length,0);A.equal(s.rejections.at(-1).code,'LIVE_EXECUTION_FAIL_CLOSED');
  }
});
test('Invalid balances remain blocked across repeated normalization and cannot reset capital',()=>{
  for(const value of [-1,'invalid',null]) {
    const raw={...Portfolio.initialState(),cashUSDT:value};A.equal(Portfolio.integrity(raw).ok,false);
    let state=Portfolio.open(raw,{finalDecision:'ENTER',direction:'LONG',caseId:'x',symbol:'BTCUSDT',fillPrice:100});
    state=Portfolio.open(state,{finalDecision:'ENTER',direction:'LONG',caseId:'y',symbol:'BTCUSDT',fillPrice:100});
    A.equal(state.fills.length,0);A.equal(state.rejections.at(-1).code,'PORTFOLIO_INTEGRITY_BLOCK');
  }
});
test('AI decision write failure cannot open or spend the shared Paper wallet',()=>{
  const source=fs.readFileSync(path.join(__dirname,'../../server.js'),'utf8');
  const start=source.indexOf('function ensureAiDecision('),end=source.indexOf('\n',start),code=source.slice(start,end);
  let opens=0,rejections=0;
  const context={state:{aiLab:{},adaptiveManager:{positions:{}},sharedPortfolio:{}},learningForgeState:{},cloneContext:()=>({}),cortexAdvice:()=>({}),
    AdaptiveManager:{entryAdvice:()=>({}),open:s=>s},LabAI:{portfolioContext:()=>({}),decide:()=>({state:{},created:true,shadow:{finalDecision:'ENTER',fillPrice:100}})},
    aiFoundation:{persist:()=>{throw new Error('disk full');}},PortfolioManager:{open:()=>{opens++;return {};}},recordRejectedTechnical:()=>{rejections++;},persist(){}};
  vm.runInNewContext(code,context);A.equal(context.ensureAiDecision({cycleId:'x',symbol:'BTCUSDT'},null,100,1000),null);A.equal(opens,0);A.equal(rejections,1);
});
test('Static serving confines decoded paths and symlinks to public assets',t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'alpha-static-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const pub=path.join(dir,'public');fs.mkdirSync(pub);fs.writeFileSync(path.join(pub,'index.html'),'ok');fs.writeFileSync(path.join(dir,'secret'),'private');
  fs.symlinkSync(path.join(dir,'secret'),path.join(pub,'link'));
  A.equal(staticFile(pub,'/'),path.join(pub,'index.html'));
  for(const name of ['/../secret','/%2e%2e%2fsecret','/link','/%','/%00','/foo\\bar'])A.equal(staticFile(pub,name),null);
});
