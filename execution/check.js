'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
let count=0;
function walk(dir) {
  for(const e of fs.readdirSync(dir,{withFileTypes:true})) {
    if(['data','node_modules','.git','upload'].includes(e.name))continue;
    const file=path.join(dir,e.name);
    if(e.isDirectory())walk(file);
    else if(e.name.endsWith('.js')){const r=spawnSync(process.execPath,['--check',file],{encoding:'utf8',timeout:10000});if(r.status!==0)throw new Error(r.stderr||'Syntax check failed');count++;}
    else if(e.name.endsWith('.html')){
      const html=fs.readFileSync(file,'utf8');let n=0;
      for(const [,attrs,code] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)){
        if(/src\s*=/.test(attrs)||/type\s*=\s*["']application\//.test(attrs))continue;
        new vm.Script(code,{filename:file+':script'+(++n)});count++;
      }
      if(!html.includes('<script id="execution-lab-script">\n'+fs.readFileSync(path.join(__dirname,'ui.js'),'utf8')+'</script>'))throw new Error('Embedded execution UI out of sync: '+file);
    }
  }
}
walk(root);console.log('PASS: '+count+' JavaScript modules / inline scripts compile; both execution UIs match their source.');
