'use strict';
const test=require('node:test');
const A=require('node:assert/strict');
const F=require('../futures-engine');
function trade(id,direction,leverage,price=100){return {finalDecision:'ENTER',caseId:id,symbol:'BTCUSDT',direction,fillPrice:price,executionProfile:{venue:'FUTURES',direction,leverage,commissionPct:.05,leverageMode:'AUTO'}}}

test('Futures engine opens and closes LONG with isolated margin accounting',()=>{
  let s=F.initialState({initialCapitalUSDT:1000,tradeMarginUSDT:100,takerFeePct:.05});
  s=F.open(s,trade('L','LONG',5),1000);
  A.equal(s.positions.L.direction,'LONG'); A.equal(s.positions.L.leverage,5);
  A(Math.abs(s.cashUSDT-899.75)<1e-9);
  s=F.close(s,'L',102,2000,{reason:'TP'});
  A.equal(Object.keys(s.positions).length,0);
  A(Math.abs(s.realizedPnlUSDT-9.495)<1e-9);
});

test('Futures engine opens and closes SHORT; SELL is a real Futures direction, not a Spot sell',()=>{
  let s=F.initialState({initialCapitalUSDT:1000,tradeMarginUSDT:100,takerFeePct:.05});
  s=F.open(s,trade('S','SHORT',5),1000);
  A.equal(s.positions.S.direction,'SHORT'); A.equal(s.positions.S.side,'SELL');
  s=F.close(s,'S',98,2000,{reason:'TP'});
  A(Math.abs(s.realizedPnlUSDT-9.505)<1e-9);
  A.equal(s.fills.at(-1).side,'BUY');
});

test('AUTO learning is not constrained by a strategy leverage max in PAPER',()=>{
  let s=F.initialState({initialCapitalUSDT:10000,tradeMarginUSDT:10,takerFeePct:.05});
  s=F.open(s,trade('HIGH','LONG',250),1000);
  A.equal(s.positions.HIGH.leverage,250);
  A.equal(s.policy.leverageStrategyMax,null);
});

test('liquidation geometry works for LONG and SHORT',()=>{
  let s=F.initialState({initialCapitalUSDT:1000,tradeMarginUSDT:100,maintenanceMarginRate:.004});
  s=F.open(s,trade('LQ-L','LONG',10),1000);
  s=F.open(s,trade('LQ-S','SHORT',10),1001);
  const lp=s.positions['LQ-L'].liquidationPrice,sp=s.positions['LQ-S'].liquidationPrice;
  A.equal(F.liquidationHit(s,'LQ-L',lp).hit,true);
  A.equal(F.liquidationHit(s,'LQ-S',sp).hit,true);
});

test('TESTNET and LIVE are architecturally represented but fail closed until verified adapters exist',()=>{
  for(const mode of ['TESTNET','LIVE']){
    let s=F.initialState({mode,initialCapitalUSDT:1000,tradeMarginUSDT:100});
    s=F.open(s,trade(mode,'LONG',2),1000);
    A.equal(Object.keys(s.positions).length,0);
    A.equal(s.rejections.at(-1).code,mode==='LIVE'?'LIVE_EXECUTION_FAIL_CLOSED':'TESTNET_ADAPTER_REQUIRED');
    A.equal(s.adapter.liveOrderPlacementImplemented,false);
  }
});

test('funding is accounted separately from commission',()=>{
  let s=F.initialState({initialCapitalUSDT:1000,tradeMarginUSDT:100});
  s=F.open(s,trade('FUND','SHORT',3),1000);
  s=F.accrueFunding(s,'FUND',1.25,1500);
  A.equal(s.positions.FUND.fundingUSDT,1.25); A.equal(s.fundingUSDT,1.25);
  s=F.close(s,'FUND',100,2000,{reason:'EXIT'});
  A(s.realizedPnlUSDT>0);
});
