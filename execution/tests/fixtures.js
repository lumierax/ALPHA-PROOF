'use strict';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {ExecutionLab}=require('../lab');
function fixture(t,options={}) {
  const {startAt,...labOptions}=options;
  let now=Number.isSafeInteger(startAt)?startAt:Date.UTC(2026,8,8,12);
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'alpha-execution-'));
  const lab=new ExecutionLab({directory,clock:()=>now,...labOptions});
  t.after(()=>{lab.close();fs.rmSync(directory,{recursive:true,force:true});});
  const context=(changes={})=>({symbol:'BTCUSDT',eligible:true,rulesAsOf:now,
    rules:{symbol:'BTCUSDT',status:'TRADING',quoteAsset:'USDT',isSpotTradingAllowed:true,filters:[
      {filterType:'PRICE_FILTER',minPrice:'0.01',maxPrice:'1000000',tickSize:'0.01'},
      {filterType:'LOT_SIZE',minQty:'0.001',maxQty:'1000000',stepSize:'0.001'},
      {filterType:'MIN_NOTIONAL',minNotional:'10',applyToMarket:true,avgPriceMins:5}]},
    average:{mins:5,price:'100'},lastPrice:'100',quote:{id:'q-'+now,asOf:now,bidPrice:'100',askPrice:'100',bidQty:'100',askQty:'100'},...changes});
  const order=(changes={})=>({mode:'PAPER',clientOrderId:'ap-order001',symbol:'BTCUSDT',side:'BUY',type:'MARKET',quantity:'1',...changes});
  return {lab,directory,context,order,now:()=>now,advance:(ms=1000)=>{now+=ms;return now;}};
}
module.exports={fixture};
