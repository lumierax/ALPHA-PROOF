'use strict';
const fs=require('fs'),path=require('path');
function tailJsonLines(file,max=200,readBytes=1024*1024){
 try{let st=fs.statSync(file);if(!st.size)return[];let size=Math.min(st.size,readBytes),fd=fs.openSync(file,'r'),buf=Buffer.allocUnsafe(size);try{fs.readSync(fd,buf,0,size,st.size-size)}finally{fs.closeSync(fd)}let txt=buf.toString('utf8');if(st.size>size)txt=txt.slice(txt.indexOf('\n')+1);return txt.split('\n').filter(Boolean).slice(-max).map(x=>{try{return JSON.parse(x)}catch{return null}}).filter(Boolean)}catch{return[]}
}
function createStore({dataDir}){const root=path.join(dataDir,'cold-runtime'),closedFile=path.join(root,'closed.jsonl');fs.mkdirSync(root,{recursive:true});
 function appendClosed(x){if(x)fs.appendFileSync(closedFile,JSON.stringify(x)+'\n')}
 function recentClosed(max=200){return tailJsonLines(closedFile,max)}
 function clearClosed(){try{fs.writeFileSync(closedFile,'')}catch{}}
 function status(){let size=0;try{size=fs.statSync(closedFile).size}catch{}return{closedBytes:size}}
 return{root,closedFile,appendClosed,recentClosed,clearClosed,status};}
module.exports={createStore,tailJsonLines};
