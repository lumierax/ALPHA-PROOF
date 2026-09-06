'use strict';
const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path'),{spawnSync}=require('child_process');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'alpha-soak-'));
try{
 const managerPath=path.join(__dirname,'adaptive-manager.js');
 const coldPath=path.join(__dirname,'cold-runtime-store.js');
 const script=`
 const M=require(${JSON.stringify(managerPath)});
 const Cold=require(${JSON.stringify(coldPath)});
 let s=M.initialState(1),d=${JSON.stringify(dir)},cold=Cold.createStore({dataDir:d});
 for(let p=0;p<80;p++){
   let id='P'+p,w={cycleId:id,symbol:'S'+p+'USDT',dir:p%2?'SHORT':'LONG',tf:['5m','15m','1h','4h'][p%4],radarScore:70+(p%20),flow:{relative:2.5,pressure:62,persistence:70,speed:.12,acceleration:.01}};
   s=M.open(s,{finalDecision:'SKIP',modelDecision:'ENTER',fillPrice:100,confidence:.72},w,1000+p);
   for(let i=0;i<180;i++){let q=100+(p%2?-1:1)*Math.sin(i/8)*.7+(i*.002);s=M.observe(s,w,q,2000+(p*180+i)*30000).state}
 }
 for(let i=0;i<12000;i++)cold.appendClosed({i,symbol:'OLD'+i+'USDT',result:i%2?'TP':'SL',blob:'x'.repeat(256)});
 let pub=M.publicState(s),mu=process.memoryUsage();
 if(pub.recent.length>60||pub.closed.length>40)throw new Error('public tails unbounded');
 for(const p of Object.values(s.positions)){if(p.observations.length>M.OBS_RAM_MAX||p.decisions.length>M.DECISION_RAM_MAX||p.pending.length>13)throw new Error('position window unbounded')}
 if(cold.recentClosed(200).length!==200)throw new Error('cold tail not bounded');
 console.log(JSON.stringify({heapUsed:mu.heapUsed,rss:mu.rss,coldBytes:cold.status().closedBytes,positions:Object.keys(s.positions).length,samples:s.samples}));
 `;
 const r=spawnSync(process.execPath,['--max-old-space-size=64','-e',script],{encoding:'utf8',timeout:60000});
 assert.equal(r.status,0,'64 MB soak must complete without OOM: '+(r.stderr||r.stdout));
 const line=(r.stdout||'').trim().split(/\n/).at(-1),m=JSON.parse(line);
 assert(m.heapUsed<58*1024*1024,'heap must remain below bounded 64MB soak envelope');
 assert(m.coldBytes>3*1024*1024,'cold history should grow on disk rather than RAM');
 console.log('PASS: long-run bounded hot memory survives 64 MB soak while cold history grows on disk');
}finally{fs.rmSync(dir,{recursive:true,force:true})}
