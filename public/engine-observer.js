"use strict";
(() => {
  const MODE = window.__ALPHA_ENTRY_MODE__ || "AUTO";
  const IS_LOCAL = MODE === "LOCAL_STANDALONE";
  const $ = (s, r=document) => r.querySelector(s);
  const num = (v, d=0) => Number.isFinite(Number(v)) ? Number(v) : d;
  const arr = v => Array.isArray(v) ? v : [];
  const obj = v => v && typeof v === "object" ? v : {};
  const esc = v => String(v == null ? "—" : v).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
  const time = v => {
    if (!v) return "—";
    try { return new Date(v).toLocaleString("ar-SA", {timeZone:"Asia/Riyadh", hour:"2-digit", minute:"2-digit", second:"2-digit", day:"2-digit", month:"2-digit"}); }
    catch (_) { return "—"; }
  };
  const bytes = v => {
    v = Number(v); if (!Number.isFinite(v) || v < 0) return "—";
    const u=["B","KB","MB","GB","TB"]; let i=0;
    while(v>=1024 && i<u.length-1){v/=1024;i++;}
    return `${v.toFixed(i<2?1:2)} ${u[i]}`;
  };
  const currentState = () => {
    try { return typeof serverState !== "undefined" ? serverState : null; }
    catch (_) { return null; }
  };
  const currentVersion = s => {
    if (s && s.version) return s.version;
    try { return typeof VERSION !== "undefined" ? VERSION : "—"; }
    catch (_) { return "—"; }
  };

  function addStyles(){
    if ($("#alphaObserverStyle")) return;
    const st=document.createElement("style"); st.id="alphaObserverStyle";
    st.textContent=`
      #alphaObserver{margin:0 0 14px;border:1px solid rgba(84,225,255,.27);background:linear-gradient(180deg,rgba(10,28,45,.98),rgba(6,17,30,.98));border-radius:18px;padding:12px;box-shadow:0 16px 44px rgba(0,0,0,.25);direction:rtl}
      #alphaObserver .aow-head{display:flex;align-items:center;justify-content:space-between;gap:9px;flex-wrap:wrap;margin-bottom:10px}
      #alphaObserver .aow-title{font-weight:950;font-size:14px}.aow-mode{font-size:10px;padding:5px 9px;border-radius:999px;border:1px solid #2b5974;color:#54e1ff;background:#0a2031;font-weight:900}
      #alphaObserver .aow-mode.local{color:#4ee6a8;border-color:#2f6d59;background:#0c2922}
      #alphaObserver .aow-grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:7px}
      #alphaObserver .aow-kpi{min-width:0;border:1px solid #1d3a52;background:#071725;border-radius:11px;padding:8px}
      #alphaObserver .aow-k{font-size:9px;color:#8fa6bf;margin-bottom:3px}.aow-v{font-size:12px;font-weight:900;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      #alphaObserver .aow-wide{margin-top:8px;border:1px solid #1c364c;background:#071522;border-radius:11px;padding:8px;font-size:10px;line-height:1.7;color:#c8d7e6;overflow-wrap:anywhere}
      #alphaObserver .aow-line{display:flex;gap:6px;justify-content:space-between;border-bottom:1px solid rgba(41,70,94,.38);padding:4px 0}.aow-line:last-child{border-bottom:0}.aow-line b{color:#edf5ff}
      #alphaObserver .aow-ok{color:#4ee6a8}.aow-warn{color:#ffd369}.aow-bad{color:#ff7187}.aow-cyan{color:#54e1ff}
      #alphaObserver details{margin-top:8px;border:1px solid #1c364c;border-radius:11px;background:#06131f;padding:8px}
      #alphaObserver summary{cursor:pointer;font-size:10px;font-weight:900;color:#54e1ff}
      #alphaObserver pre{direction:ltr;text-align:left;white-space:pre-wrap;word-break:break-word;max-height:46vh;overflow:auto;font-size:9px;color:#b9ccde;margin:8px 0 0}
      #alphaObserver .aow-actions{display:flex;gap:6px;flex-wrap:wrap}.aow-btn{border:1px solid #29516e!important;background:#0b2032!important;color:#ddecfa!important;padding:6px 9px!important;border-radius:9px!important;font-size:10px!important}
      @media(max-width:950px){#alphaObserver .aow-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
      @media(max-width:560px){#alphaObserver .aow-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
    `;
    document.head.appendChild(st);
  }

  function ensurePanel(){
    let box=$("#alphaObserver"); if(box) return box;
    addStyles();
    box=document.createElement("section"); box.id="alphaObserver";
    box.innerHTML=`
      <div class="aow-head">
        <div><div class="aow-title">Ω مراقب المحرك — Engine Watch</div><div id="aowSubtitle" style="font-size:9px;color:#8fa6bf;margin-top:2px"></div></div>
        <div class="aow-actions"><span id="aowMode" class="aow-mode"></span><button id="aowSnapshot" class="aow-btn" type="button">حفظ Snapshot</button><button id="aowRefresh" class="aow-btn" type="button">تحديث</button></div>
      </div>
      <div class="aow-grid" id="aowGrid"></div>
      <div class="aow-wide" id="aowSchedule"></div>
      <div class="aow-wide" id="aowBrains"></div>
      <div class="aow-wide" id="aowMovement"></div>
      <div class="aow-wide" id="aowErrors"></div>
      <details id="aowRaw"><summary>الحالة الخام الكاملة التي تعرضها هذه النسخة (Raw State)</summary><pre id="aowRawText">—</pre></details>`;
    const shell=$(".shell"), app=$(".app") || document.body;
    if(shell && shell.parentNode) shell.insertAdjacentElement("afterend",box); else app.prepend(box);
    $("#aowRefresh",box).onclick=render;
    $("#aowSnapshot",box).onclick=saveSnapshot;
    $("#aowRaw",box).addEventListener("toggle",()=>{if($("#aowRaw",box).open) renderRaw();});
    return box;
  }

  const cell=(k,v,cls="")=>`<div class="aow-kpi"><div class="aow-k">${esc(k)}</div><div class="aow-v ${cls}">${esc(v)}</div></div>`;
  const line=(k,v,cls="")=>`<div class="aow-line"><span>${esc(k)}</span><b class="${cls}">${esc(v)}</b></div>`;

  function summarizeRecovery(s){
    const comps=obj(s?.recovery?.components); const names=Object.keys(comps);
    if(!names.length) return "—";
    let ok=0,degraded=0;
    for(const k of names){const st=String(comps[k]?.state||""); if(st==="PROTECTED_AB")ok++; else if(st)degraded++;}
    return degraded ? `${ok}/${names.length} A/B · ${degraded} غير مكتملة` : `${ok}/${names.length} A/B محمية`;
  }

  function summarizeNext(meta){
    const xs=arr(meta.autoScanNext);
    if(!xs.length) return "—";
    return xs.slice(0,8).map(x=>`${x.tf||"?"}: ${time(x.nextAt)}`).join(" · ");
  }

  function render(){
    const box=ensurePanel(); const s=currentState(); if(!s) return;
    const m=obj(s.meta), ai=obj(s.aiLab), market=obj(s.marketAI), cortex=obj(s.cortex||s.learningForge), wf=obj(cortex.researchWorkforce), adaptive=obj(s.adaptiveManager), r14=obj(s.research14||s.v10Research), mem=obj(s.memoryUsage), mt=obj(s.memoryTotals||mem.totals);
    const activeCount=Object.keys(obj(s.active)).length, tracked=m.trackedCount!=null?m.trackedCount:activeCount;
    const modeEl=$("#aowMode",box); modeEl.textContent=IS_LOCAL?"LOCAL BACKUP · مستقل":"RAILWAY · LIVE"; modeEl.className="aow-mode"+(IS_LOCAL?" local":"");
    $("#aowSubtitle",box).textContent=IS_LOCAL?"لا توجد أي مطالبة تشغيلية لـ Railway؛ Binance والذاكرة المحلية يعملان من هذا الجهاز.":"قراءة مباشرة من /api/state — هذه اللوحة لا تخمّن القيم ولا تستبدل المحرك.";
    const conn=IS_LOCAL?"LOCAL":(m.connectionState||"CONNECTED");
    const scan=m.scanning?`${m.currentScanTimeframe||s.settings?.tf||"—"} · ${Math.round(num(m.progress))}%`:"لا يوجد فحص جارٍ";
    const aiSamples=ai.modelSamples ?? ai.samples ?? 0;
    const cortexCases=cortex.observedCases ?? cortex.cases ?? 0;
    const adaptiveOpen=arr(adaptive.open).length;
    const researchOps=r14?.counters?.opportunities ?? r14.opportunities ?? r14.totalCases ?? 0;
    $("#aowGrid",box).innerHTML=[
      cell("الإصدار الحقيقي",currentVersion(s),"aow-cyan"),
      cell("الاتصال",conn,conn==="CONNECTED"||conn==="LOCAL"?"aow-ok":"aow-warn"),
      cell("الفحص الآن",scan,m.scanning?"aow-warn":"aow-ok"),
      cell("الرادار النشط",`${activeCount} · tracked ${tracked}`),
      cell("Universe / محلل",`${m.universeCount??0} / ${m.analyzedCount??0}`),
      cell("Settings Rev",s.settingsRevision??"—"),
      cell("Trade AI Samples",aiSamples),
      cell("CORTEX Cases",cortexCases),
      cell("Adaptive Open",adaptiveOpen),
      cell("Research Ops",researchOps),
      cell("Recovery",summarizeRecovery(s)),
      cell("آخر مسح",time(m.lastScanAt||s.lastScanAt))
    ].join("");

    const queue=arr(m.autoScanQueue).join(" → ")||"فارغة";
    const current=m.autoScanCurrent ? `${m.autoScanCurrent.tf||"—"} · ${m.autoScanCurrent.waitingFor||"RUNNING"} · بدأ ${time(m.autoScanCurrent.startedAt)}` : "لا توجد مهمة Auto نشطة";
    $("#aowSchedule",box).innerHTML=`<b class="aow-cyan">الجدولة والحركة الزمنية</b>${line("Auto Queue",queue)}${line("Auto Current",current)}${line("الفحوص القادمة",summarizeNext(m))}${line("آخر Auto",m.autoScanLast?`${m.autoScanLast.tf||"—"} · ${m.autoScanLast.ok===false?"FAILED":"OK"} · ${time(m.autoScanLast.finishedAt)}`:"—",m.autoScanLast?.ok===false?"aow-bad":"")}`;

    const forecasts=obj(market.forecasts), forecastText=Object.keys(forecasts).slice(0,8).map(k=>`${k}:${forecasts[k]?.direction||forecasts[k]?.dir||"—"}`).join(" · ")||"—";
    const drift=cortex?.drift?.status||cortex.driftStatus||"—";
    const workers=`${wf.jobsCompleted??0} مكتملة / ${wf.jobsFailed??0} فشلت`;
    const researchRegime=r14?.regime?.current||r14.regime||"—";
    $("#aowBrains",box).innerHTML=`<b class="aow-cyan">العقول والبحث</b>${line("Trade AI",`${ai.modelVersion||"—"} · samples ${aiSamples}`)}${line("Market AI",`${market.modelVersion||"—"} · ${forecastText}`)}${line("Ω CORTEX",`cases ${cortexCases} · drift ${drift}`)}${line("Research Workforce",workers)}${line("Adaptive Manager",`${adaptive.modelVersion||"—"} · samples ${adaptive.samples??0} · open ${adaptiveOpen}`)}${line("Research / v10",`regime ${researchRegime} · opportunities ${researchOps}`)}${line("Recovery A/B",summarizeRecovery(s))}`;

    const long=s.featuredTrackers?.LONG, short=s.featuredTrackers?.SHORT;
    const live=arr(s.liveRows), closed=arr(s.closed), jobs=arr(wf.recentJobs);
    const latestLive=live.slice().sort((a,b)=>num(b.updatedAt||b.lastUpdateAt||b.t)-num(a.updatedAt||a.lastUpdateAt||a.t))[0];
    const latestClosed=closed[closed.length-1]; const latestJob=jobs[0];
    $("#aowMovement",box).innerHTML=`<b class="aow-cyan">آخر التحركات المرئية</b>${line("أقوى LONG",long?.symbol?`${long.symbol} · ${long.cycleId||""}`:"—")}${line("أقوى SHORT",short?.symbol?`${short.symbol} · ${short.cycleId||""}`:"—")}${line("آخر تحديث Radar",latestLive?`${latestLive.symbol||"—"} · ${latestLive.dir||"—"} · ${latestLive.tf||"—"} · score ${Math.round(num(latestLive.radarScore))}`:"—")}${line("آخر نتيجة مغلقة",latestClosed?`${latestClosed.symbol||"—"} · ${latestClosed.reason||latestClosed.exitReason||"—"} · ${time(latestClosed.exitAt||latestClosed.closedAt||latestClosed.t)}`:"—")}${line("آخر مهمة بحث",latestJob?`${latestJob.workerName||latestJob.worker||"worker"} · ${latestJob.reason||"—"} · ${latestJob.summary||"—"}`:"—")}`;

    const ram=mem?.ram?.rssBytes, disk=mem?.storage?.usedBytes;
    const errs=[m.lastError, m.lastMarketAiError, m.lastCortexError, m.lastTelegramError].filter(Boolean);
    const samples=arr(m.lastScanErrorSamples).slice(0,4).map(x=>`${x.symbol||"?"}: ${x.error||"?"}`).join(" | ");
    $("#aowErrors",box).innerHTML=`<b class="aow-cyan">الصحة والأخطاء</b>${line("RAM / Volume",`${bytes(ram)} / ${bytes(disk)} · limits ${bytes(mt.ramLimitBytes)} / ${bytes(mt.volumeTotalBytes)}`)}${line("Scan errors",`${m.lastActualErrors??0} · insufficient ${m.lastInsufficientHistory??0}`,(m.lastActualErrors??0)>0?"aow-warn":"aow-ok")}${line("آخر خطأ",errs.join(" | ")||"لا يوجد","aow-ok")}${samples?line("عينات أخطاء",samples,"aow-warn"):""}`;

    const vb=$("#versionBadge"); if(vb && s.version) vb.textContent=s.version;
    if($("#aowRaw",box).open) renderRaw();
  }

  function renderRaw(){
    const s=currentState(), p=$("#aowRawText"); if(!p||!s) return;
    try { const raw=JSON.stringify(s,null,2); p.textContent=raw.length>300000?raw.slice(0,300000)+"\n… [تم إيقاف العرض عند 300KB لحماية Safari — Snapshot يحتوي الحالة كاملة]":raw; }
    catch(e){ p.textContent="تعذر عرض الحالة الخام: "+e.message; }
  }

  function saveSnapshot(){
    const s=currentState(); if(!s) return;
    try{
      const payload={capturedAt:new Date().toISOString(),mode:MODE,standalone:IS_LOCAL,state:s};
      const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"});
      const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=`alpha-proof-${IS_LOCAL?"local":"railway"}-snapshot-${new Date().toISOString().replace(/[:.]/g,"-")}.json`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),2000);
    }catch(e){console.error("snapshot",e);}
  }

  const boot=()=>{ensurePanel();render();setInterval(render,2000);};
  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",()=>setTimeout(boot,50),{once:true}); else setTimeout(boot,50);
})();
