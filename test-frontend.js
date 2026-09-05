const fs=require('fs'),assert=require('assert'),vm=require('vm');
for(const file of ['index.html','public/index.html']){
 const s=fs.readFileSync(file,'utf8');
 assert(s.includes('id="settingsSaveState"'));
 assert(s.includes('الحفظ تلقائي'));
 assert(!/id=["'](?:saveSettingsBtn|saveBtn)["']/.test(s));
 assert(s.includes("e.type==='number'")&&s.includes("addEventListener('input',queueSettingsSave)"));
 assert(s.includes("addEventListener('change',queueSettingsSave)"));
 assert(s.includes('settingsSaveChain'));

 assert(s.includes('JSON.stringify({settings:snapshot})'),'manual scan must start atomically with current settings');
 assert(s.includes('alreadyRunning'),'already-running scan must not be treated as backend failure');
 assert(s.includes('انتهت مهلة الاتصال بالخادم'),'API timeout guard missing');
 assert(s.includes('applySettings(serverState.settings)'));
 assert(s.includes('saveSettings().catch(()=>{})'));
 // iOS popover must not be globally closed by scroll/touch.
 assert(!/addEventListener\(['"]scroll['"].*hidePopover/.test(s));
 assert(s.includes('data-radar-close'));
 assert(s.includes('id="featuredLong"')&&s.includes('id="featuredShort"'),'separate LONG/SHORT cards missing');
 assert(s.includes('id="featuredStack"')&&s.includes('id="featuredLongCard"')&&s.includes('id="featuredShortCard"'),'stacked card shell missing');
 assert(s.includes('touch-action:pan-y'),'stack must preserve vertical Safari scrolling');
 assert(s.includes('function initFeaturedCardStack()'),'stack gesture controller missing');
 assert(s.includes("addEventListener('pointerdown'")&&s.includes("addEventListener('pointermove'")&&s.includes("addEventListener('pointerup'"),'pointer swipe lifecycle missing');
 assert(s.includes("classList.toggle('is-front'")&&s.includes("classList.toggle('is-back'"),'front/back card state missing');
 assert(s.includes('tfBadgeHtml(x.tf)'),'timeframe badge must be shown beside radar symbol');
 assert(s.includes("if(s==='1d')return'D'"),'daily timeframe badge must be D');
 assert(s.includes('function tfLabel(tf)'));
 assert(s.includes('class="tf-badge"'));

 // Radar sorting is view-only and must expose useful fields, not alphabetical symbol sorting.
 for(const key of ['tf','flash','delta','speed','score','dir'])assert(s.includes(`data-radar-sort="${key}"`),`missing radar sort: ${key}`);
 assert(!s.includes('data-radar-sort="symbol"'),'alphabetical radar sorting must be removed');
 assert(!s.includes('<option value="symbol">'),'alphabetical scan-result setting must be removed');
 assert(s.includes('id="radarResetSort"'),'radar reset control missing');
 assert(s.includes('function radarTfMinutes(tf)'),'timeframe comparator missing');
 assert(s.includes('function radarSortRows(rows)')&&s.includes("key==='default'"),'view-only radar sorting missing');
 assert(s.includes('showLiveFeaturedCards(source)'),'manual radar sorting must not feed sorted rows into strongest-card selection');

 // Lux flash emphasis is visual only: strongest is derived from engine source, never the sorted view.
 assert(s.includes('lux-flash')&&s.includes('freshSignalMovePct'),'Lux flash UI/setting missing');
 assert(/\.lux-flash\.strong-long\{[^}]*color:var\(--green\)/.test(s),'strong LONG flash must be green');
 assert(/\.lux-flash\.strong-short\{[^}]*color:var\(--red\)/.test(s),'strong SHORT flash must be red');
 assert(/\.lux-flash\{[^}]*color:var\(--amber\)/.test(s),'ordinary flash must remain amber');
 assert(s.includes('function strongestFlashSymbols(rows)'),'strongest flash selector missing');
 assert(s.includes('strongest=strongestFlashSymbols(source)'),'strongest flash must use engine order');
 assert(!s.includes('strongestFlashSymbols(R)'),'sorted display must never choose strongest flash');

 // Resume must actively resync after Safari/iOS suspension without clearing the current view first.
 assert(s.includes("document.addEventListener('visibilitychange'")&&s.includes("window.addEventListener('pageshow'")&&s.includes("window.addEventListener('focus'")&&s.includes("window.addEventListener('online'"),'Safari resume resync guards missing');
 assert(s.includes('function syncAfterResume()'),'resume sync function missing');

 // Clean lab-memory actions.
 assert(s.includes('id="exportBtn"')&&s.includes('id="rotateMemoryBtn"'),'memory export/rotate buttons missing');
 assert(s.includes('/api/memory/export')&&s.includes('/api/memory/rotate'),'memory API wiring missing');
 assert(s.includes('24 ساعة'),'fixed rejected retention explanation missing');

 assert(!s.includes('<span class="pop-k">الفريم المختار</span>')&&!s.includes('<span class="pop-k">الفريمات التي ظهرت عليها</span>'),'popover must not repeat timeframe');
 assert(s.includes('timeframeListHtml(x)'), 'radar/history must render timeframe list');
 assert(s.includes('.tf-badge.selected'), 'selected best timeframe must be visually highlighted');
 assert(s.includes('resultLabel(r)'), 'history must translate the closing reason');
 assert(s.includes('حقق الهدف')&&s.includes('وصل إلى وقف الخسارة')&&s.includes('كسر ترند معاكس'), 'Arabic close reasons missing');
 assert(!s.includes('🧬 ALPHA PROOF'), 'old Telegram identity must be fully removed');
 const scripts=[...s.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n');
 new vm.Script(scripts,{filename:file});
}
const b=fs.readFileSync('index.html','utf8');
assert(b.includes('تاريخ غير كافٍ')&&b.includes('أخطاء فعلية'),'local backup scan classification labels missing');
for(const x of ['localEnsureFeaturedTrackers','localFeaturedRank','localBetterTimeframe','TIMEFRAME_SWITCH','localJourneyPoint','localCompressJourney','localAppendJourney','fearGreed','settingsRevisionAtEntry','settingsAtEntry','LOCAL_MEMORY_DB','localMemoryStoreCase','localMemoryJsonl','localMemoryCleanupRejected'])assert(b.includes(x),x);
assert(b.includes("e?.id==='backupTelegramToken'")&&b.includes("e?.id==='backupTelegramChatId'"));
const localExportBody=b.split('async function localMemoryJsonl()')[1]?.split('function localDownloadText')[0]||'';
assert(localExportBody&&!localExportBody.includes('backupTelegram')&&!localExportBody.includes('localTelegramCfg'),'Telegram credentials must never enter local learning export');
assert(b.includes('targetPct:localRound(w.targetPct,4)')&&b.includes('acceptedTargetPct:localRound(w.acceptedTargetPct,4)'),'local CASE schema must retain target percentages like Railway memory');
const rotateBody=b.split('async function localExportMemory(rotate=false)')[1]?.split('function localRecordSettingsChange')[0]||'';
assert(rotateBody&&!rotateBody.includes('w.memoryEligible=true'),'memory rotation must never re-validate a legacy active opportunity');
assert(rotateBody.includes('w.memoryEligible!==false&&w.memoryEpoch===LOCAL_MEMORY_EPOCH'),'only already-clean active opportunities may carry settings references into the next local cycle');
assert(b.includes('localBetterTimeframe')&&b.includes('localAddMatches'),'GitHub backup must compare timeframes instead of keeping first scan');
assert(b.includes('seenLuxSignals[luxKey]?.enteredAt'),'observed-but-not-entered alternate timeframe must remain reusable');
assert(b.includes('currentMetrics=await localGetVolumeMetrics(current'),'timeframe comparison must refresh current Flow too');
assert(b.includes("localFeaturedRank(rows,C,'LONG'")&&b.includes("localFeaturedRank(rows,C,'SHORT'"),'GitHub backup must maintain independent LONG/SHORT cards');
// Legacy local memory must be inspected/reset before the new IndexedDB epoch marker is created.
const startup=b.match(/\(async\(\)=>\{LOCAL_DEFAULTS=cfg\(\);[\s\S]*?\}\)\(\);/)?.[0]||'';
assert(startup&&!startup.includes('localMemoryInit().catch'),'startup must not pre-mark legacy local memory before localLoadState');
assert(!b.includes('🧬 ALPHA PROOF'),'old Telegram logo must be removed from GitHub backup');
assert(b.includes('Ω ALPHA PROOF'),'ALPHA PROOF Ω Telegram identity missing');
console.log('PASS: frontend syntax, useful radar sorting, visual-only strong flash, Safari resume sync and clean local memory');
