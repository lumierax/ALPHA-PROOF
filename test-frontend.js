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
 assert(s.includes('id="featuredLong"')&&s.includes('id="featuredShort"'),'separate LONG/SHORT cards missing');
 assert(s.includes('tfBadgeHtml(x.tf)'),'timeframe badge must be shown beside radar symbol');
 assert(s.includes("if(s==='1d')return'D'"),'daily timeframe badge must be D');
 assert(s.includes('id="featuredLong"')&&s.includes('id="featuredShort"'));
 assert(s.includes('function tfLabel(tf)'));
 assert(s.includes('class="tf-badge"'));
 assert(s.includes('timeframeListHtml(x)'), 'radar/history must render timeframe list');
 assert(s.includes(".tf-badge.selected"), 'selected best timeframe must be visually highlighted');
 assert(s.includes("resultLabel(r)"), 'history must translate the closing reason');
 assert(s.includes("حقق الهدف")&&s.includes("وصل إلى وقف الخسارة")&&s.includes("كسر ترند معاكس"), 'Arabic close reasons missing');
 assert(!s.includes('🧬 ALPHA PROOF'), 'old Telegram identity must be fully removed');
 const scripts=[...s.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n');
 new vm.Script(scripts,{filename:file});
}
const b=fs.readFileSync('index.html','utf8');
for(const x of ['localEnsureFeaturedTrackers','localFeaturedRank','localBetterTimeframe','TIMEFRAME_SWITCH','localJourneyPoint','localCompressJourney','localAppendJourney','activeJourneys','fearGreed','settingsRevisionAtEntry','settingsAtEntry'])assert(b.includes(x),x);
assert(b.includes("e?.id==='backupTelegramToken'")&&b.includes("e?.id==='backupTelegramChatId'"));
assert(b.includes("note:'Telegram credentials intentionally excluded'"));
assert(b.includes('localBetterTimeframe')&&b.includes('localAddMatches'),'GitHub backup must compare timeframes instead of keeping first scan');
assert(b.includes("seenLuxSignals[luxKey]?.enteredAt"),'observed-but-not-entered alternate timeframe must remain reusable');
assert(b.includes("currentMetrics=await localGetVolumeMetrics(current"),'timeframe comparison must refresh current Flow too');
assert(b.includes("localFeaturedRank(rows,C,'LONG'")&&b.includes("localFeaturedRank(rows,C,'SHORT'"),'GitHub backup must maintain independent LONG/SHORT cards');
assert(!b.includes('🧬 ALPHA PROOF'),'old Telegram logo must be removed from GitHub backup');
assert(b.includes('Ω ALPHA PROOF'),'ALPHA PROOF Ω Telegram identity missing');
console.log('PASS: frontend syntax, true autosave without save button, iOS popover guards and local journey logging');
