const fs=require('fs'),assert=require('assert'),vm=require('vm');
for(const file of ['index.html','public/index.html']){
 const s=fs.readFileSync(file,'utf8');
 assert(s.includes('id="settingsSaveState"'));
 assert(s.includes('الحفظ تلقائي'));
 assert(!/id=["'](?:saveSettingsBtn|saveBtn)["']/.test(s));
 assert(s.includes("e.type==='number'")&&s.includes("addEventListener('input',queueSettingsSave)"));
 assert(s.includes("addEventListener('change',queueSettingsSave)"));
 assert(s.includes("settingsSaveChain"));
 assert(s.includes("applySettings(serverState.settings)"));
 assert(s.includes("saveSettings().catch(()=>{})"));
 // iOS popover must not be globally closed by scroll/touch.
 assert(!/addEventListener\(['\"]scroll['\"].*hidePopover/.test(s));
 assert(s.includes('data-radar-close'));
 const scripts=[...s.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n');
 new vm.Script(scripts,{filename:file});
}
const b=fs.readFileSync('index.html','utf8');
for(const x of ['localJourneyPoint','localCompressJourney','localAppendJourney','activeJourneys','fearGreed','settingsRevisionAtEntry','settingsAtEntry'])assert(b.includes(x),x);
assert(b.includes("e?.id==='backupTelegramToken'")&&b.includes("e?.id==='backupTelegramChatId'"));
assert(b.includes("note:'Telegram credentials intentionally excluded'"));
console.log('PASS: frontend syntax, true autosave without save button, iOS popover guards and local journey logging');
