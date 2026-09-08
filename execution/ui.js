(function () {
  'use strict';
  const nav = document.querySelector('.bottomNav');
  if (!nav) return;
  const style = document.createElement('style');
  style.textContent = `.bottomNav{grid-template-columns:repeat(5,1fr)}.execution-page{font-size:12px}.execution-page .exec-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.execution-page .exec-wide{grid-column:1/-1}.execution-page input,.execution-page select{width:100%;box-sizing:border-box;min-height:40px}.execution-page label{display:block;color:var(--muted,#9ab0c7);margin-bottom:6px}.execution-page .exec-actions{display:flex;flex-wrap:wrap;gap:8px;margin:14px 0}.execution-page button{min-height:40px}.execution-page .exec-kill{background:#661e2c;border:1px solid #ff7187;color:#fff}.execution-page .exec-note{line-height:1.9;color:var(--muted,#9ab0c7)}.execution-page pre{direction:ltr;text-align:left;max-height:300px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;font-size:11px;background:#081421;border:1px solid #203955;border-radius:12px;padding:12px}.execution-page .exec-message{line-height:1.8;overflow-wrap:anywhere;min-height:25px}.execution-page th,.execution-page td{white-space:nowrap}.execution-page .metric .v{font-size:18px;overflow-wrap:anywhere}.execution-page .metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.execution-page h2{font-size:18px}.execution-page .exec-tag{color:#f3cf79;border:1px solid #80662f;border-radius:14px;padding:5px 9px}.execution-page .exec-status{line-height:1.9;padding:10px;border:1px solid #284763;border-radius:12px}.execution-page .exec-limit-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;line-height:1.7}@media(min-width:750px){.execution-page .metrics{grid-template-columns:repeat(4,minmax(0,1fr))}}`;
  document.head.appendChild(style);
  const page = document.createElement('main');
  page.className = 'page execution-page'; page.dataset.page = 'execution';
  page.innerHTML = `<div class="grid"><section class="card span12">
    <div class="card-title"><h2>Ω مختبر التنفيذ</h2><span class="exec-tag">الأوامر الحقيقية مقفلة</span></div>
    <p class="exec-note">حساب Paper مستقل عن محفظة التعلم. الشراء من رادار Lux فقط، والبيع من الكمية المملوكة. Testnet لإنشاء خطة غير مرسلة. لا يوجد إرسال تلقائي لقرارات AI.</p>
    <div class="exec-status" id="execState">بانتظار خادم التنفيذ…</div>
    <div class="metrics">
      <div class="metric"><div class="l">قيمة الحساب الصافية · USDT</div><div class="v" id="execEquity">—</div></div>
      <div class="metric"><div class="l">الرصيد المتاح · USDT</div><div class="v" id="execAvailable">—</div></div>
      <div class="metric"><div class="l">الرصيد المحجوز · USDT</div><div class="v" id="execReserved">—</div></div>
      <div class="metric"><div class="l">الصافي التراكمي · USDT</div><div class="v" id="execNet">—</div></div>
      <div class="metric"><div class="l">صافي يوم Binance 1D</div><div class="v" id="execDay">—</div></div>
      <div class="metric"><div class="l">صافي 7 أيام</div><div class="v" id="execWeek">—</div></div>
      <div class="metric"><div class="l">الرسوم المدفوعة · USDT</div><div class="v" id="execFees">—</div></div>
      <div class="metric"><div class="l">الأوامر المفتوحة</div><div class="v" id="execOpen">—</div></div>
    </div>
    <p class="exec-note">الرسوم الافتراضية: 0.10% شراء + 0.10% بيع، دون خصم BNB. قيمة الحساب تحتسب رسوم الخروج المقدرة. بداية اليوم الوحيدة هي افتتاح شمعة Binance 1D عند 00:00 UTC، ولا يوجد تصفير عند منتصف الليل المحلي.</p>
    <label for="execToken">رمز التحكم بالمختبر · يبقى في هذه الصفحة فقط</label><input id="execToken" type="password" autocomplete="off" placeholder="أدخل رمز التحكم الذي ضبطته على الخادم" maxlength="256">
    <div class="exec-actions"><button id="execKill" class="exec-kill">إيقاف التنفيذ · Kill Switch</button><button id="execReconcile">مطابقة التنفيذ</button><button id="execResume">استئناف Paper</button></div>
    <div id="execMessage" class="exec-message" role="status" aria-live="polite"></div>
    <p class="exec-note">الإيقاف يلغي الأوامر المعلقة ويمنع أوامر جديدة. المراكز تبقى محفوظة ولا تُباع تلقائيًا. الاستئناف يعيد التحقق من المطابقة والمخاطر.</p>
  </section><section class="card span12"><div class="card-title"><h3>خطة أمر جديدة</h3><span class="sub">Market / Limit</span></div>
    <form id="execForm"><div class="exec-grid">
      <div><label for="execMode">البيئة</label><select id="execMode"><option value="PAPER">Paper · محاكاة</option><option value="TESTNET">Testnet · خطة فقط</option></select></div>
      <div><label for="execSymbol">الزوج · Spot/USDT</label><select id="execSymbol"><option value="">لا توجد عملات مؤهلة</option></select></div>
      <div><label for="execSide">العملية</label><select id="execSide"><option value="BUY">شراء</option><option value="SELL">بيع من الرصيد</option></select></div>
      <div><label for="execType">نوع الأمر</label><select id="execType"><option value="MARKET">Market</option><option value="LIMIT">Limit</option></select></div>
      <div><label for="execQuantity">الكمية بالعملة</label><input id="execQuantity" inputmode="decimal" value="" placeholder="مثال: 0.001" required></div>
      <div id="execPriceField" hidden><label for="execPrice">السعر المحدد · USDT</label><input id="execPrice" inputmode="decimal" placeholder="سعر Limit"></div>
      <div id="execTifField" hidden><label for="execTif">صلاحية Limit</label><select id="execTif"><option value="GTC">GTC · يبقى حتى الإلغاء أو المهلة</option><option value="IOC">IOC · نفّذ المتاح وألغِ الباقي</option><option value="FOK">FOK · الكمية كاملة أو لا شيء</option></select></div>
      <div><label for="execTtl">مهلة الأمر بالدقائق</label><input id="execTtl" type="number" min="1" max="1440" value="15"></div>
      <div class="exec-wide"><label for="execId">معرّف يمنع تكرار الأمر عند إعادة المحاولة</label><input id="execId" readonly dir="ltr"></div>
    </div><div class="exec-actions"><button id="execPreview" type="submit">فحص وإنشاء الخطة</button><button id="execSubmit" type="button" disabled>تنفيذ الخطة في Paper</button><button id="execNew" type="button">طلب جديد</button></div></form>
    <pre id="execPlan">أنشئ خطة لمراجعة قيمتها ورسومها قبل تشغيلها في Paper.</pre>
  </section><section class="card span12"><div class="card-title"><h3>المراكز والأوامر والتنفيذ</h3></div>
    <div class="tablewrap"><table><thead><tr><th>الزوج</th><th>الكمية المملوكة</th><th>المتاحة للبيع</th><th>تكلفة الدخول مع الرسوم</th></tr></thead><tbody id="execPositions"></tbody></table></div>
    <div class="tablewrap"><table><thead><tr><th>معرّف الأمر</th><th>الزوج</th><th>العملية</th><th>الحالة</th><th>المطلوب / المنفذ</th><th>الإجراء</th></tr></thead><tbody id="execOrders"></tbody></table></div>
    <div class="tablewrap"><table><thead><tr><th>الوقت</th><th>الزوج</th><th>الدخول / الخروج</th><th>سعر التنفيذ</th><th>الكمية</th><th>الرسوم USDT</th></tr></thead><tbody id="execFills"></tbody></table></div>
  </section><section class="card span12"><div class="card-title"><h3>حدود المخاطر وسجل التدقيق</h3></div><div id="execLimits" class="exec-limit-list"></div><pre id="execAudit">—</pre></section></div>`;
  nav.before(page);
  const tab=document.createElement('button');tab.className='navbtn';tab.dataset.go='execution';tab.innerHTML='<span>⛨</span>التنفيذ';
  tab.addEventListener('click',()=>{openPage('execution');paint();});nav.appendChild(tab);
  const el=id=>document.getElementById(id);
  const text=(id,value)=>{el(id).textContent=String(value??'—');};
  const source=()=>typeof serverState!=='undefined'?serverState:{};
  let plan=null,working=false;
  const words={FILLED:'مكتمل',PARTIALLY_FILLED:'منفذ جزئيًا',NEW:'معلق',CANCELED:'ملغى',EXPIRED:'منتهي',REJECTED:'مرفوض',UNKNOWN:'غير مؤكد',PENDING_NEW:'بانتظار القبول',PENDING_CANCEL:'بانتظار الإلغاء'};
  const errors={UNAUTHORIZED:'رمز التحكم غير صحيح.',EXECUTION_CONTROL_TOKEN_REQUIRED:'اضبط رمز التحكم على الخادم أولًا.',KILL_SWITCH_ACTIVE:'التنفيذ متوقف. طابق السجل ثم استأنف Paper.',STALE_MARKET_DATA:'بيانات السوق قديمة أو غير متاحة.',LUX_RADAR_REQUIRED:'الشراء متاح فقط لعملات رادار Lux الطويلة.',INSUFFICIENT_AVAILABLE_CASH:'الرصيد المتاح لا يغطي الأمر ورسومه.',INSUFFICIENT_AVAILABLE_POSITION:'الكمية المتاحة لا تكفي للبيع.',TESTNET_PLAN_ONLY:'Testnet متاح كخطة فقط.',MIN_NOTIONAL:'قيمة الأمر أقل من الحد الأدنى.',LOT_SIZE:'الكمية لا توافق دقة الزوج وحدوده.',PRICE_FILTER:'السعر لا يوافق دقة الزوج وحدوده.',EXECUTION_BUSY_RETRY_SAME_ID:'توجد عملية تحقق جارية. أعد المحاولة بالمعرّف نفسه.',DAILY_LOSS_LIMIT:'وصل الحساب إلى حد الخسارة اليومية.',DRAWDOWN_LIMIT:'وصل الحساب إلى حد التراجع.',LIVE_EXECUTION_FORBIDDEN:'إرسال الأوامر الحقيقية محظور في هذه النسخة.'};
  const message=(value,bad=false)=>{text('execMessage',value);el('execMessage').style.color=bad?'#ff7187':'#7ce4b4';};
  const money=value=>value==null?'—':Number(value).toLocaleString('en-US',{maximumFractionDigits:6});
  function table(id,rows,columns,empty) {
    const body=el(id);body.replaceChildren();
    if(!rows.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=columns;td.textContent=empty;tr.appendChild(td);body.appendChild(tr);return;}
    for(const row of rows){const tr=document.createElement('tr');for(const value of row){const td=document.createElement('td');if(value instanceof Node)td.appendChild(value);else td.textContent=String(value??'—');tr.appendChild(td);}body.appendChild(tr);}
  }
  function controls() {
    const s=source().execution,remote=typeof runtimeMode==='undefined'||runtimeMode==='remote';
    const authorized=remote&&s?.controlsConfigured&&el('execToken').value.length>=32;
    for(const id of ['execPreview','execReconcile','execResume'])el(id).disabled=!authorized||working;
    el('execKill').disabled=!authorized; // Available while a quote request is pending.
    el('execSubmit').disabled=!authorized||working||!plan||plan.raw.mode!=='PAPER'||s?.killSwitch?.active||Date.now()>plan.expiresAt;
    el('execPriceField').hidden=el('execType').value!=='LIMIT';el('execTifField').hidden=el('execType').value!=='LIMIT';
  }
  function paint() {
    const s=source().execution;
    if(!s){text('execState','خادم التنفيذ مطلوب. لا يعمل تنفيذ Paper داخل النسخة المحلية للمتصفح.');controls();return;}
    const p=s.portfolio||{},k=s.killSwitch||{},remote=typeof runtimeMode==='undefined'||runtimeMode==='remote';
    text('execState',`${remote?'Paper':'بيانات محفوظة · الخادم غير متصل'} · ${k.active?'متوقف: '+(errors[k.reason]||k.reason):'جاهز للاختبار'} · المطابقة: ${s.reconciliation?.ok?'سليمة':'مطلوبة'}${p.valuationFresh===false?' · الأسعار قديمة':''}${s.controlsConfigured?'':' · رمز التحكم غير مضبوط'}`);
    for(const [id,key] of [['execEquity','equityUSDT'],['execAvailable','availableUSDT'],['execReserved','reservedUSDT'],['execNet','totalPnlUSDT'],['execDay','dailyPnlUSDT'],['execWeek','rolling7dPnlUSDT'],['execFees','feesUSDT']])text(id,money(p[key]));
    text('execOpen',s.openOrders??0);
    const select=el('execSymbol'),current=select.value;
    const symbols=[...new Set([...Object.values(source().active||{}).filter(x=>x.dir==='LONG').map(x=>x.symbol),...(p.positions||[]).map(x=>x.symbol)])].sort();
    if(select.dataset.symbols!==symbols.join(',')){
      select.replaceChildren();for(const symbol of symbols){const option=document.createElement('option');option.value=symbol;option.textContent=symbol;select.appendChild(option);}
      if(!symbols.length){const option=document.createElement('option');option.value='';option.textContent='لا توجد عملات مؤهلة';select.appendChild(option);}
      if(symbols.includes(current))select.value=current;select.dataset.symbols=symbols.join(',');
    }
    table('execPositions',(p.positions||[]).map(x=>[x.symbol,x.quantity,x.availableQuantity,money(x.costUSDT)]),4,'لا توجد مراكز Paper.');
    table('execOrders',(s.orders||[]).map(o=>{
      let action='—';if(['NEW','PARTIALLY_FILLED','UNKNOWN','PENDING_NEW','PENDING_CANCEL'].includes(o.status)){
        action=document.createElement('button');action.textContent='إلغاء';action.disabled=!s.controlsConfigured||el('execToken').value.length<32||!remote;
        action.addEventListener('click',()=>run('/cancel',{clientOrderId:o.clientOrderId}));
      }
      return [o.clientOrderId,o.symbol,o.side==='BUY'?'شراء':'بيع',words[o.status]||o.status,o.quantity+' / '+o.filled,action];
    }),6,'لا توجد أوامر.');
    table('execFills',(s.recentFills||[]).map(f=>[new Date(f.t).toLocaleTimeString('ar-SA',{timeZone:'Asia/Riyadh'}),f.symbol,f.side==='BUY'?'دخول Paper':'خروج Paper',f.price,f.quantity,f.fee]),6,'لا توجد تعبئات مؤكدة داخل محاكي Paper.');
    const L=s.limits||{};el('execLimits').replaceChildren();
    for(const [label,value] of [['قيمة الأمر القصوى',L.maxOrderUSDT],['التعرض لكل زوج',L.maxSymbolUSDT],['التعرض الإجمالي',L.maxGrossUSDT],['حد الخسارة اليومية',L.maxDailyLossUSDT],['حد التراجع من القمة',L.maxDrawdownUSDT],['الأوامر المفتوحة القصوى',L.maxOpenOrders]]){
      const d=document.createElement('div');d.textContent=label+': '+(value??'—');el('execLimits').appendChild(d);
    }
    text('execAudit',(s.audit||[]).slice(0,25).map(x=>`${new Date(x.t).toLocaleTimeString('ar-SA',{timeZone:'Asia/Riyadh'})} | ${x.type} | ${x.id||''} ${x.status||x.reason||''}`).join('\n')||'لا توجد أحداث.');
    controls();
  }
  async function request(route,body) {
    const token=el('execToken').value;
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);
    try {
      const response=await fetch(apiUrl('/api/execution'+route),{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(body),signal:controller.signal});
      const result=await response.json();if(!response.ok||result.ok===false)throw new Error(errors[result.code]||result.code||'تعذر تنفيذ الطلب');return result;
    } finally{clearTimeout(timeout);}
  }
  async function reload() {const response=await fetch(apiUrl('/api/execution/state'),{cache:'no-store'});if(!response.ok)throw new Error('تعذر تحديث حالة التنفيذ');source().execution=await response.json();paint();}
  async function run(route,body={}) {
    if(working&&route!=='/kill')return;
    working=true;controls();message('جارٍ التحقق…');
    try {const result=await request(route,body);await reload();message(route==='/kill'?'تم إيقاف Paper وإلغاء الأوامر المعلقة.':route==='/reconcile'?'اكتملت المطابقة.':route==='/resume'?'تم استئناف Paper.':'تم حفظ العملية.');return result;}
    catch(e){message(e.name==='AbortError'?'انتهت المهلة. حدّث الحالة وأعد المحاولة بالمعرّف نفسه؛ قد يكون الطلب محفوظًا.':e.message,true);return null;}
    finally{working=false;controls();}
  }
  function newId(){text('execPlan','أنشئ خطة جديدة.');plan=null;el('execId').value='ap-'+(crypto.randomUUID?crypto.randomUUID().replace(/-/g,'').slice(0,24):Date.now().toString(36)+Math.random().toString(36).slice(2,12));controls();}
  function rawOrder(){const raw={mode:el('execMode').value,clientOrderId:el('execId').value,symbol:el('execSymbol').value,side:el('execSide').value,type:el('execType').value,quantity:el('execQuantity').value.trim(),ttlMs:Number(el('execTtl').value)*60000};if(raw.type==='LIMIT'){raw.price=el('execPrice').value.trim();raw.timeInForce=el('execTif').value;}return raw;}
  el('execForm').addEventListener('submit',async event=>{event.preventDefault();const raw=rawOrder(),result=await run('/plans',raw);if(result){plan={raw,expiresAt:result.expiresAt};text('execPlan',JSON.stringify(result,null,2));message(result.status==='DRAFT_TESTNET_PLAN'?'خطة Testnet جاهزة للمراجعة؛ لم تُرسل.':'خطة Paper جاهزة. صلاحيتها 15 ثانية، وتُفحص مجددًا عند التنفيذ.');}controls();});
  el('execSubmit').addEventListener('click',async()=>{if(plan){const result=await run('/orders',plan.raw);if(result){plan=null;text('execPlan',JSON.stringify(result,null,2));controls();}}});
  el('execKill').addEventListener('click',()=>run('/kill'));
  el('execReconcile').addEventListener('click',()=>run('/reconcile'));
  el('execResume').addEventListener('click',()=>run('/resume'));
  el('execNew').addEventListener('click',newId);
  el('execForm').addEventListener('input',()=>{plan=null;controls();});
  el('execToken').addEventListener('input',paint);
  newId();paint();setInterval(()=>{if(page.classList.contains('active'))paint();},1000);
})();
