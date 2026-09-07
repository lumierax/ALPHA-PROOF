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
 assert(s.includes('id="memoryMeasureBtn"')&&s.includes('/api/memory/usage'),'manual memory measurement UI/API missing');
 assert(s.includes('لا يوجد قياس دوري')&&s.includes('احسب استخدام الذاكرة الآن'),'memory measurement must be manual only');
 assert(s.includes('Runtime State')&&s.includes('Dataset')&&s.includes('Adaptive Manager'),'memory breakdown parts missing');
 assert(s.includes('24 ساعة'),'fixed rejected retention explanation missing');

 // FOUNDATION contract: runtime, dataset, brain and checkpoints are visibly and logically separate.
 assert(s.includes('Runtime ≠ Dataset ≠ AI Brain ≠ Checkpoints'),'foundation separation banner missing');
 assert(s.includes('9.9.4-PROFIT-FIRST-SHADOW-MENTOR-RECOVERY-A-B'),'v9.9.4 Profit First Recovery A/B release version missing');
 assert(s.includes('حماية الذاكرة — Recovery A/B')&&s.includes('renderRecoveryProtection'),'Recovery A/B operations screen missing');
 assert(s.includes('id="aiCheckpoints"')&&s.includes('id="aiRam"')&&s.includes('id="aiDataset"')&&s.includes('id="aiBrainSize"'),'foundation health metrics missing');
 assert(s.includes('Restart — مسح التشغيل فقط'),'Restart must be runtime-only in Foundation');
 assert(s.includes('id="marketAiModel"')&&s.includes('id="marketAiForecasts"')&&s.includes('id="marketAiExportBtn"'),'Market AI panel/export missing');
 assert(s.includes('MARKET-AI-001')&&s.includes('MARKET-FEATURES-V1'),'Market AI model lineage missing');
 assert(s.includes('id="aiWithMarket"')&&s.includes('id="aiCounterMarket"'),'with/counter market learning display missing');
 for(const id of ['aiEconomicsDay','aiNetToday','aiProfitToday','aiLossToday','aiFeesToday','aiPreviousDay','aiVsPrevious','aiPrev7','aiLifetimeNet','aiProfitFactor','aiAvgNet','aiWinRateToday','aiPortfolioVerdict','aiDailyBody'])assert(s.includes(`id="${id}"`),`24h economics UI missing ${id}`);
 assert(s.includes('0.10% دخول + 0.10% خروج')&&s.includes('0.20%'),'Spot no-BNB full round-trip fee explanation missing');
 assert(s.includes('حجم صافي الربح أو الخسارة يحدد قوة أثر الحالة في التعلم'),'Trade AI UI must explain magnitude-weighted economic learning');
 assert(s.includes('دقة توقع صافي الربح')&&s.includes('ENTER صافي رابح'),'Trade AI labels must describe economic/net outcome, not TP touch');
 assert(s.includes('TARGET_DOES_NOT_COVER_SPOT_FEES')&&s.includes('صافي خاسر'),'net-PnL decision/result renderer missing');
 assert(!s.includes("x.result==='TP'?'حقق الهدف'"),'Trade AI must never render TP touch itself as a win');

 // AI audit: user must be able to verify the coin's actual entry/exit prices beside the economic result.
 for(const label of ['سعر الدخول','سعر الخروج','الربح / الخسارة'])assert(s.includes(label),`AI audit column missing ${label}`);
 assert(s.includes('x.entryPrice')&&s.includes('x.exitPrice'),'AI decision table must render frozen entry/exit market prices');
 // Automatic market scan is fixed per timeframe, not one global interval.
 assert(s.includes('5m/5د')&&s.includes('15m/15د')&&s.includes('1D/يوم')&&s.includes('Binance Kline'),'multi-timeframe Binance-truth schedule explanation missing');

 // Ω CORTEX research UI + safety contract.
 for(const id of ['cortexModel','cortexPhase','cortexCases','cortexTesting','cortexPromising','cortexProven','cortexEdge','cortexRisk','cortexDrift','cortexBaseUtility','cortexUtility','cortexChanged','cortexHelped','cortexHurt','cortexBaseEce','cortexEce','cortexInsights','cortexValidatedList','cortexFirewall','cortexProofGate','cortexAblationSamples','cortexResearchTax','cortexFeatureHelp','cortexFeatureHurt','cortexToolSimilar','cortexToolTemporal','cortexToolDecision','cortexToolIsolation','cortexToolLedger','cortexToolValidity','cortexShadowPhase','cortexShadowTesting','cortexShadowEligible','cortexShadowProof','cortexExportBtn'])assert(s.includes(`id="${id}"`),`CORTEX UI missing ${id}`);
 assert(s.includes('Ω CORTEX')&&s.includes('Calibration Mirror')&&s.includes('CORTEX Arena')&&s.includes('Drift Sentinel'),'CORTEX research surfaces missing');
 assert(s.includes('الماضي')&&s.includes('المستقبل')&&s.includes('+8%'),'prospective-only CORTEX safety explanation missing');
 assert(s.includes('Shadow Mentor')&&s.includes('100 حالة على الأقل')&&s.includes('لا ترث EDGE جديدة إثبات غيرها'),'per-edge Shadow Mentor explanation missing');
 assert(s.includes('/api/cortex/export'),'CORTEX export route missing');
 assert(s.includes('function renderCortex()'),'CORTEX renderer missing');
 assert(s.includes('فرضيات ربح فشلت')&&s.includes('يبتكر فرضيات EDGE الربحية فقط'),'Profit First EDGE-only wording missing');
 assert(!s.includes('RISK مثبت')&&!s.includes('يبتكر فرضيات EDGE وRISK'),'stale EDGE/RISK wording must not return');
 for(const tool of ['مقارنة الفرص المتشابهة','مجهر التسلسل الزمني','مختبر الدخول / الانتظار / الخروج','أداة عزل المتغيرات','سجل الفرضية ونتيجتها','خريطة صلاحية المعرفة'])assert(s.includes(tool),`CORTEX research tool missing: ${tool}`);
 assert(s.includes('تعمل عند الحاجة فقط'),'research tools must be documented as on-demand');
 for(const id of ['workforceMode','workforceJobs','workerEvidenceState','workerFalsifierState','workerProspectiveState','workerGeneralState','workforceLog','fatherGatewayStatus','fatherKeyBtn'])assert(s.includes(`id="${id}"`),`CORTEX workforce UI missing ${id}`);
 assert(s.includes('غرفة عمليات CORTEX')&&s.includes('باحث الأدلة')&&s.includes('المشكك / Falsifier')&&s.includes('المجرب المستقبلي')&&s.includes('مختبر التعميم'),'four-worker Arabic operations screen missing');
 assert(s.includes('function renderCortexWorkforce()')&&s.includes('renderCortex();renderCortexWorkforce();'),'workforce renderer not wired into AI page');
 assert(s.includes('مفتاح الأب — بعد VPS')&&s.includes('لا يوجد اتصال')&&s.includes('لا مفتاح محفوظ'),'Father button must remain preparation-only before VPS');
 assert(s.includes('Statistical Firewall')&&s.includes('Prospective Proof'),'operations screen must restate ALPHA PROOF policy boundaries');

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
assert(b.includes('alphaProofLabMemoryV2Foundation'),'GitHub backup must use a new V2 IndexedDB namespace');
assert(b.includes("'aiBrain'")&&b.includes("'aiCheckpoints'"),'GitHub backup must isolate brain and checkpoints in IndexedDB');assert(b.includes("'marketBrain'")&&b.includes("'marketRuntime'")&&b.includes("'marketDataset'")&&b.includes("'marketCheckpoints'"),'GitHub backup must isolate Market AI stores in IndexedDB');assert(b.includes("'forgeBrain'")&&b.includes("'forgeCheckpoints'")&&b.includes("'forgeEvents'"),'GitHub backup must isolate CORTEX brain/checkpoints/research events in IndexedDB');assert(b.includes('alpha-proof-omega-cortex-foundation/4')&&b.includes('CORTEX-RESEARCH-V4-ECONOMICS'),'local CORTEX foundation lineage missing');assert(b.includes('Statistical Firewall')&&b.includes('Feature Tribunal')&&b.includes('Multiple-testing tax'),'CORTEX V4 safety/research UI missing');assert(b.includes('async function localObserveMarketAI')&&b.includes('async function localMarketAiLoad'),'local Market AI foundation missing');
assert(b.includes('async function localBrainPersist')&&b.includes('async function localBrainLoad'),'local durable brain layer missing');
assert(b.includes('localRepairAiAndCortexFromDataset')&&b.includes('localIntegrityCases')&&b.includes('INTEGRITY_REPLAY_ORIGINAL_DECISION'),'GitHub backup must rebuild Trade AI/CORTEX from preserved VALID cases instead of relabeling old brain');
assert(b.includes('SCHEMA_CHANGE_PRESERVED')&&b.includes('retired-pre-net-pnl'),'incompatible local brains must be preserved before rebuilding');
const localBrainLoadBody=b.split('async function localBrainLoad')[1]?.split('async function localBrainStatus')[0]||'';assert(localBrainLoadBody&&!localBrainLoadBody.includes('LabAI.normalizeState(legacy);'),'legacy incompatible brain must never be falsely normalized into the new model schema');
assert(b.includes('shadowHit=LabAI.shadowBarrier(w.aiShadow,price)'),'local Shadow resolution must use its frozen TP/SL independently from later radar timeframe changes');
assert(b.includes('economicSoftTarget')&&b.includes('economicWeight'),'local Trade AI must learn net magnitude, not only binary win count');
const payloadBody=b.split('function localStatePayload()')[1]?.split('function localPersistState')[0]||'';
assert(payloadBody&&!payloadBody.includes('aiLab:'),'local runtime state payload must not duplicate AI brain');
const localClose=b.split('async function localCloseTrade')[1]?.split('async function localProcessRow')[0]||'';
assert(localClose.includes('localResolveAi')&&localClose.includes('localMemoryStoreCase')&&localClose.includes('localTrainAi'),'local close transaction pieces missing');
assert(localClose.indexOf('localResolveAi')<localClose.indexOf('localMemoryStoreCase')&&localClose.indexOf('localMemoryStoreCase')<localClose.indexOf('localTrainAi'),'local AI must resolve -> durable CASE -> train');
console.log('PASS: frontend syntax, useful radar sorting, visual-only strong flash, Safari resume sync and clean local memory');

// Execute the embedded economic/management modules, not just their syntax.
const embedded=b.slice(b.indexOf('const CaptureGovernance=(()=>{'),b.indexOf('const MarketAI=(()=>{'));
const browserContext={};vm.runInNewContext(embedded+';globalThis.captureModules={LabAI,AdaptiveManager};',browserContext);
const browserAI=browserContext.captureModules.LabAI,browserManager=browserContext.captureModules.AdaptiveManager;
assert.equal(browserAI.EXECUTION_POLICY,require('./lab-ai').EXECUTION_POLICY);
assert.equal(browserAI.shadowBarrier({status:'OPEN',direction:'LONG',targetPrice:110,stopPrice:95},90).exitPrice,90);
assert.equal(browserAI.executionGeometry('SHORT',100,90,110).targetGrossPct,10);
assert.equal(browserManager.frameMinutes('3d'),4320);
const now=Date.now(),bw={cycleId:'BROWSER',symbol:'BROWSERUSDT',dir:'LONG',tf:'4h',entryAt:now,flow:{measuredAt:now,relative:3,pressure:70,persistence:80}},bs={executionPolicy:browserAI.EXECUTION_POLICY,modelDecision:'ENTER',finalDecision:'ENTER',fillPrice:100,decidedAt:now,entryExecutionCostPct:.1};
let browserState=browserManager.open(browserManager.initialState(now),bs,bw,now);assert.equal(browserState.positions.BROWSER.frameMs,14400000);
for(let i=1;i<=60;i++)browserState=browserManager.advanceCapture(browserState,new Map([[bw.symbol,{lastPrice:100.5,bidPrice:100.5,askPrice:100.5}]]),{[bw.symbol]:{...bw,flow:{...bw.flow,measuredAt:now+i*30000}}},now+i*30000).state;
assert(browserState.positions.BROWSER,'browser fallback must not prematurely take a small intact gain');
for(const f of ['index.html','public/index.html']){const text=fs.readFileSync(f,'utf8');assert(text.includes('id="captureSummary"'));assert(text.includes('id="captureClosed"'));assert(text.includes('function renderAI(){renderProfitCapture();'));}
console.log('PASS: executable browser/backend capture parity and wired Arabic economic results');
