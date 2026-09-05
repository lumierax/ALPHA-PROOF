# ALPHA PROOF Ω — v9.6.0 NET PNL 24H · LAB AI Ω CORTEX

هذه النسخة تجمع خط الأساس المستقر للرادار مع ثلاث طبقات تعلم منفصلة: **Trade AI Shadow**، و**Market AI**، و**Ω CORTEX**. جميعها تعمل في الظل ولا ترسل أي أمر تداول حقيقي.

الفلسفة الأساسية التي لا يجوز كسرها:

**Runtime ≠ Dataset ≠ AI Brain ≠ Checkpoints**

والقواعد الأساسية للرادار لم تتغير:

- **Lux Algo وحده** بوابة دخول الرادار.
- **Directional Flow وحده** مسؤول عن ترتيب الرادار واختيار أقوى LONG وأقوى SHORT.
- **PA + C/E + EMA** قراءات مساعدة في تفاصيل العملة فقط، ولا تدخل في قبول الرادار أو ترتيبه أو بطاقات الأقوى.
- أقوى LONG وأقوى SHORT مستقلان.
- ترتيب المستخدم للرادار عرض فقط ولا يعيد ترتيب المحرك الداخلي.
- البرق الأخضر/الأحمر للأقوى تمييز بصري فقط؛ البرق العادي كهرماني.
- Market AI وTrade AI وΩ CORTEX لا يملكون سلطة على Lux أو Flow أو بطاقات الرادار.
- لا توجد بوابة تنفيذ أوامر Binance؛ كل قرارات AI هي **SHADOW EXECUTION**.

---

## 1) Memory Foundation — ذاكرة طويلة العمر

ذاكرة التعلم النظيفة تستخدم:

`alpha-proof-lab-memory/2`

وتكتب الحالات الصالحة إلى JSONL على القرص بدل الاحتفاظ بالتاريخ الكامل في RAM.

السجلات الرئيسية:

- `MANIFEST`
- `SETTINGS`
- `CASE`
- `TRAINING`
- `CYCLE_END`

كل حالة مكتملة تُصنف إلى:

- **VALID**: تصلح للتعلم.
- **REJECTED تقنيًا**: stale، بيانات ناقصة، خطأ API، فشل كتابة أو حالة لا تصلح للتعلم. لا تدخل التدريب، ويحتفظ بملخصها الخفيف لمدة **24 ساعة فقط**.

ترتيب الإغلاق مقصود لحماية التعلم:

1. إغلاق القرار الافتراضي وحساب النتيجة دون تدريب.
2. بناء CASE النظيفة.
3. كتابة CASE على القرص.
4. فقط بعد نجاح الكتابة يسمح بالتعلم.
5. حفظ Brain بصورة ذرية.
6. توثيق TRAINING.
7. إنشاء Checkpoint عند بلوغ الحد الدوري.

إذا فشلت كتابة CASE فلا يتعلم AI منها. وإذا فشل حفظ Brain يرجع إلى حالة العقل السابقة بدل ترك تعلم غير موثق.

### Restart

زر Restart هو **Runtime-only**. يمسح حالة التشغيل والرادار والكاشات اللازمة لبداية نظيفة، لكنه لا يمسح:

- Dataset.
- Trade AI Brain.
- Market AI Brain/Dataset.
- Ω CORTEX Brain/Research Events.
- Checkpoints.
- الإعدادات.

### تدوير Dataset

`📦 تصدير + دورة ذاكرة جديدة` يؤرشف Dataset الحالية ويتحقق من النسخة قبل بدء دورة جديدة. لا يصفر العقول ولا Checkpoints.

---

# 2) Trade AI Shadow — العقل الذي يعيش الصفقة

الإصدار الحالي:

- Schema: `alpha-proof-shadow-ai/2`
- Model: `SHADOW-AI-005-NET-PNL`
- Features: `FEATURES-V3-ECONOMICS`

Trade AI يتخذ قرارًا واحدًا لحظيًا من المعلومات المتاحة وقت القرار:

- `ENTER`
- `SKIP`

إذا اختار ENTER يعيش صفقة افتراضية كاملة حتى TP / SL / REVERSE. وإذا اختار SKIP تستمر مراقبة الحالة لقياس الفرص التي فوتها والخسائر التي تجنبها.

القرار يحفظ Snapshot مجمدًا يشمل:

- Flow.
- السوق وFear & Greed.
- Market AI عند اللحظة نفسها.
- PA/C-E/EMA كميزات للـAI فقط.
- الفريم والاتجاه.
- سعر Shadow Fill والهدف والوقف.
- Seed/Learned probability.
- Base confidence وCORTEX confidence.
- Challengers.

## Feature Ablation Snapshot

من v9.5 يحسب Trade AI عند لحظة القرار أيضًا احتمال القرار **بعد إزالة كل Feature على حدة**، ويحفظ النتائج مع القرار قبل معرفة المستقبل.

الهدف: تمكين Ω CORTEX لاحقًا من الإجابة على سؤال مهم:

> هل هذه الميزة ساعدت التنبؤ فعلًا أم أضرته؟

لا يعاد حساب ذلك بعد ظهور النتيجة، لذلك لا يوجد Lookahead.

---

## v9.6 — Net PnL Integrity + 24H Economics

هذه النسخة تغيّر تعريف «النجاح» داخل Trade AI من نجاح حركة السعر إلى **ربحية اقتصادية صافية**.

### رسوم Spot المحافظة

الحساب ثابت كما لو أنه **لا يوجد BNB**:

- دخول: `0.10%`
- خروج: `0.10%`
- الدورة الكاملة: `0.20%`

لا يُفترض أي خصم BNB. لذلك لمس TP لا يعني WIN تلقائيًا. النتيجة التعليمية هي:

`Net PnL = Gross signed move - 0.20% fees`

ويكون `NET_WIN` فقط عندما يكون صافي الربح بعد الرسوم أكبر من صفر.

### Execution Integrity

قبل إنشاء Shadow Trade يجب أن تكون هندسة التنفيذ صحيحة:

- LONG: `SL < Fill < TP`
- SHORT: `TP < Fill < SL`

أي حالة تخالف ذلك تصبح `REJECTED / IGNORE` ولا تدخل التعلم. سعر Shadow Fill والاتجاه والفريم وTP وSL تُجمّد وقت القرار حتى لا يغيّر تبديل فريم الرادار معنى الصفقة بعد إنشائها.

### ليس كل WIN مساويًا لغيره

لا يعتمد Trade AI على عدّ الرابح والخاسر فقط. يحتفظ بالـbinary label للـCalibration، لكن تحديث النموذج يستخدم أيضًا **حجم صافي الربح/الخسارة** عبر soft economic target وeconomic weight محدودين لحماية الاستقرار. النتيجة المقصودة: ربح صغير لا يساوي خسارة كبيرة لمجرد أن كل واحد منهما حالة واحدة.

### نتيجة اليوم / نافذة 24 ساعة

تُحفظ النتائج في Buckets يومية بتوقيت `Asia/Riyadh`، ويحتفظ العقل بآخر **120 يومًا** إضافة إلى الإجمالي التاريخي. لكل يوم يتم حفظ:

- عدد ENTER المغلقة.
- الرابحة والخاسرة بعد الرسوم.
- مجموع الأرباح الصافية.
- مجموع الخسائر الصافية.
- الرسوم المحتسبة.
- الصافي الكلي.
- أفضل وأسوأ صفقة.
- Win Rate.
- Average Net PnL.
- Profit Factor.

اليوم الجديد يقارن نفسه باليوم السابق ومتوسط صافي الأيام السبعة السابقة. كما تدخل ثلاث إشارات اقتصادية إلى Features الخاصة بـTrade AI: `net24h` و`dayVsHistory` و`profitBalance24h`. وبذلك يستطيع النموذج التعلم من سياق أن اليوم ككل يخسر حتى لو ظهرت داخله بعض الصفقات الرابحة.

> النسب اليومية هي **Shadow returns معيارية مجمعة بافتراض وزن متساوٍ لكل صفقة**، وليست عائد رصيد حساب حقيقي أو محاكاة Position Sizing.

### Integrity Replay للبيانات القديمة

عند أول تشغيل لـv9.6 يتم تنفيذ Migration/Replay مرة واحدة على حالات `VALID` المحفوظة:

1. تُؤخذ نسخة خام byte-for-byte من `current.jsonl` قبل التنظيف، وتبقى Archives القديمة خامًا وغير معدّلة كدليل Audit فقط وخارج مصادر التعلم.
2. الحالة ذات هندسة TP/SL غير الصحيحة **تُحذف من الـDataset التعليمي canonical** ولا يسمح لها بالتدريب.
3. لا تُصدّق تسمية `TP` أو `SL` القديمة وحدها. يجب أن تثبت Frozen Journey أن السعر لمس الحاجز بعد قرار AI؛ وإلا تُحذف الحالة غير القابلة للتحقق. خروج `REVERSE` فقط يمكن اعتماده من سعر الخروج الحقيقي المسجل.
4. الحالات القابلة للإثبات تُصحح داخل الـDataset canonical ويُعاد حساب Gross ثم رسوم `0.20%` ثم Net PnL؛ ويمكن أن تتحول صفقة قديمة مسجلة WIN إلى `NET_LOSS` إذا لم تغطِّ الرسوم.
5. سجلات `TRAINING` القديمة المرتبطة بالعقل الملوّث لا تُستخدم بعد الترقية؛ يُعاد بناء Trade AI وΩ CORTEX زمنيًا من الحالات المصححة فقط وبدون Lookahead.
6. يُحفظ تاريخ الأرشيف الخام خارج مسار التعلم، ويُنشأ مصدر تاريخي canonical نظيف، مع تقريري `integrity-sanitize-net-pnl.json` و`integrity-replay-net-pnl.json`.
7. تُحفظ Checkpoints جديدة، والعقول القديمة غير المتوافقة تُحال إلى `retired` بدل أن تعود للتعلم.
8. Market AI لا يُصفّر ولا يدخل في هذا الإصلاح.

---

# 3) Market AI — عقل مستقل لفهم اتجاه السوق

الإصدار الحالي:

- Schema: `alpha-proof-market-ai/1`
- Runtime schema: `alpha-proof-market-ai-runtime/1`
- Model: `MARKET-AI-001`
- Features: `MARKET-FEATURES-V1`

Market AI لا يتنبأ بعملة واحدة. مهمته فهم **السوق نفسه**.

يراقب كل 5 دقائق تقريبًا ويصنع Anchor كل 15 دقيقة، ثم يقفل توقعاته قبل معرفة المستقبل ويقيمها لاحقًا على آفاق:

- 15 دقيقة
- 60 دقيقة
- 240 دقيقة
- 720 دقيقة
- 1440 دقيقة

البيانات التي يراها تشمل:

- Breadth: نسبة العملات الصاعدة/الهابطة.
- Median market return.
- Strong breadth.
- Volume-weighted market movement.
- Dispersion.
- BTC وETH.
- تغير Breadth/Median/Market Index خلال 15 و60 دقيقة.
- Fear & Greed وتغيره.
- Participation.

ويصنف حالة السوق الحالية إلى:

- `STRONG_UP`
- `UP`
- `TURNING_UP`
- `NEUTRAL`
- `TURNING_DOWN`
- `DOWN`
- `STRONG_DOWN`

أما توقعاته المستقبلية فتتعلم على نتائج السوق الفعلية لاحقًا: `UP / NEUTRAL / DOWN`.

لا يعتبر التوقع جاهزًا للاستخدام كميزة في Trade AI قبل وصول عينة ذلك الأفق إلى حد الاستعداد. وحتى بعد ذلك يبقى تأثيره داخل Shadow AI فقط.

### فصل ذاكرة Market AI

يوجد Foundation مستقل يحفظ:

- Brain.
- Runtime القصير.
- Market Dataset JSONL.
- Checkpoints كل **500 نتيجة مستقبلية محلولة**.

وبذلك كبر تاريخ السوق على القرص لا يعني كبر RAM.

---

# 4) مع السوق وضد السوق

كل قرار Trade AI يعرف علاقته بحالة السوق:

- `WITH`
- `COUNTER`
- `NEUTRAL`

كما يحتفظ بعلاقته بتوقع Market AI المستقبلي عندما يكون جاهزًا.

الهدف ليس فرض قاعدة ثابتة من نوع «لا تدخل ضد السوق»، بل ترك المختبر يكتشف مثلًا إن كانت بعض صفقات الانعكاس ضد الاتجاه الحالي تصبح قوية عندما يكون Market AI في `TURNING_UP` أو `TURNING_DOWN`.

---

# 5) Ω CORTEX — عقل البحث والتعلّم

الإصدار الحالي:

- Schema: `alpha-proof-omega-cortex/4`
- Model: `OMEGA-CORTEX-004-NET-PNL`
- Research features: `CORTEX-RESEARCH-V4-ECONOMICS`
- Foundation: `alpha-proof-omega-cortex-foundation/4`

CORTEX ليس نموذجًا إضافيًا يرفع الثقة عشوائيًا. هو طبقة **بحث علمي آلي** فوق تجارب Trade AI النظيفة.

## Hypothesis Forge

بعد توفر حد أدنى من البيانات يبدأ CORTEX بالبحث عن فروقات بين الحالات الناجحة والفاشلة ويولد فرضيات EDGE وRISK بنفسه، عبر سياقات مثل:

- GLOBAL.
- LONG / SHORT.
- مجموعة الفريم.
- WITH / COUNTER market.
- اتجاه + علاقة السوق.
- اتجاه + الفريم.
- Market AI regime.

الماضي يستخدم لاكتشاف الفكرة فقط.

## Prospective Validation — منع خداع الماضي

أي حالة استُخدمت لاكتشاف فرضية **لا يسمح باستخدامها لإثباتها**.

إذا وُلدت فرضية بعد الحالة 100 مثلًا، يبدأ امتحانها من الحالات 101 وما بعدها فقط.

هذا يمنع CORTEX من اكتشاف نمط في الماضي ثم الادعاء بأنه أثبته على الماضي نفسه.

## Statistical Firewall

حتى الاختبار المستقبلي وحده ليس كافيًا، لأن توليد عدد كبير من الفرضيات قد ينتج نجاحات بالصدفة. لذلك أضيفت طبقة Statistical Firewall:

- لا يمكن إعلان `PROVEN` قبل **100 حالة مستقبلية** على الأقل.
- فحص الإثبات يحدث فقط عند **بوابات كل 25 حالة مستقبلية**، وليس بعد كل حالة بحثًا عن لحظة حظ.
- يستخدم Wilson lower bound بدل الاعتماد على النسبة الخام فقط.
- قيمة `z` تصبح أكثر صرامة كلما زاد عدد الفرضيات التي اختبرها النظام: **Multiple-testing tax**.
- القواعد المركبة AND تدفع عقوبة تعقيد إضافية.
- يجب أن يتكرر الأثر في **3 كتل زمنية إيجابية على الأقل**، وأن يكون عدد الكتل الإيجابية أكبر من ضعفي السلبية.
- توجد شروط حد أدنى للـmatch والقرارات التي غيّرتها الفرضية والتغطية وحجم الـlift.

كل فرضية `PROVEN` تحتفظ ببيانات الإثبات نفسها: `z`، والـadjusted lower bound، وعدد الفرضيات التي كانت تحت الاختبار، وعدد الحالات المستقبلية والكتل الزمنية.

## Feature Tribunal

هذه أداة محاسبة الميزات.

بفضل Feature Ablation Snapshot المجمد عند اتخاذ القرار، يقارن CORTEX بعد ظهور النتيجة بين:

- خطأ الاحتمال الكامل.
- خطأ الاحتمال لو أزيلت Feature واحدة وقت القرار.

ويحسب `ΔBrier` لكل Feature:

- موجب: وجود Feature حسن التنبؤ في المتوسط.
- سالب: وجودها أضر التنبؤ في المتوسط.

ويعرض عدد المرات التي ساعدت/أضرت/كانت محايدة.

هذه الأداة لا تحذف Feature تلقائيًا؛ هي تنتج دليلًا بحثيًا يمكن أن يستخدم لاحقًا في Challenger جديد بدل تغيير العقل الرئيسي بصمت.

## Calibration Mirror

CORTEX لا يقيس فقط هل القرار صحيح، بل هل **الثقة نفسها صادقة**.

يتابع:

- ECE للـBase AI.
- ECE بعد CORTEX.
- Brier score.

وبذلك لا نكافئ نموذجًا لمجرد أنه أصبح أكثر ثقة.

## CORTEX Arena

يقارن في نفس الحالات:

- قرار Trade AI الأساسي.
- القرار بعد Mentor.

ويحسب Utility والدقة وعدد القرارات التي تغيرت، ومتى ساعد CORTEX ومتى أضر.

هذا يجعل CORTEX نفسه تحت الاختبار بدل افتراض أنه مفيد لأنه «AI».

## Drift Sentinel

يراقب تغير العلاقة بين الميزات والنتائج في السلوك القريب مقابل التاريخ الأطول.

الحالات:

- `LEARNING`
- `STABLE`
- `WATCH`
- `SHIFT`

عند `WATCH` يخفف Mentor تأثيره. وعند `SHIFT` يتم **عزل Mentor تلقائيًا** ويصبح تأثيره صفرًا حتى لو كانت لديه فرضيات PROVEN.

## حد سلطة Mentor

حتى في الوضع الطبيعي تأثير CORTEX على Trade AI Shadow محدود بحد أقصى:

**±8%**

ولا يمتلك أي مسار إلى Lux أو Directional Flow أو الرادار أو بطاقات الأقوى أو تنفيذ Binance.

## ذاكرة CORTEX

عقله مستقل في:

`omega-cortex/brain.json`

وأحداث البحث في:

`omega-cortex/research-events.jsonl`

وCheckpoints كل **100 حالة VALID يراقبها CORTEX**.

الحالة العقلية نفسها محدودة الحجم: الإحصاءات والسياقات والفرضيات والسجلات الحديثة لها caps، بينما Dataset الأصلية تبقى على القرص.

الفرضيات التي تُستبعد بسبب حد السعة لا تختفي بصمت؛ يتم نقلها إلى الأرشيف البحثي الداخلي ضمن الحدود المحددة.

---

# 6) تسلسل التعلم الكامل

الصورة الحالية للمختبر:

**Lux → Radar admission**

**Directional Flow → ranking / strongest cards**

ثم في عالم Shadow:

**Market AI → يفهم السوق ويقفل توقعاته المستقبلية**

**Trade AI → يقرر ENTER/SKIP ويعيش النتيجة افتراضيًا**

**Ω CORTEX → يكتشف فرضيات، يمتحنها مستقبلًا، يحاسب الثقة والميزات، ويراقب تغير السوق**

ثم:

**Durable CASE → VALID gate → learning → brain checkpoint**

ولا توجد قفزة من «فكرة مثيرة» إلى «قاعدة معتمدة» بدون مرورها بالمستقبل وStatistical Firewall.

---

# 7) RAM والاستمرارية

الهدف المعماري أن يظل استهلاك RAM محدودًا حتى لو عمل البرنامج أشهرًا:

- تاريخ التعلم الكبير على القرص/IndexedDB.
- Runtime يحمل فقط ما يحتاجه الآن.
- Trade AI brain صغير ومحدود.
- Market AI history/anchors/recent لها حدود.
- CORTEX candidates/validated/segments/recent لها حدود.
- REJECTED تنظف بعد 24 ساعة.

تظهر في الواجهة مؤشرات Runtime Memory وأحجام Dataset/Brains/Checkpoints للمراقبة المبكرة لأي نمو غير طبيعي.

---

# 8) GitHub Backup / Safari

النسخة المستقلة تحافظ قدر الإمكان على نفس الفصل باستخدام IndexedDB Stores مستقلة لـ:

- Dataset/settings/rejected/archives.
- Trade AI Brain/Checkpoints.
- Market AI Brain/Runtime/Dataset/Checkpoints.
- CORTEX Brain/Events/Checkpoints.

Restart المحلي لا يمسح التعلم الدائم.

وعند رجوع Safari من الخلفية تتم مزامنة فورية عبر `visibilitychange`, `pageshow`, `focus`, `online` بدون تفريغ الرادار الحالي أولًا.

بيانات Telegram لا تدخل ملفات التعلم المصدرة.

---

# 9) واجهة Ω CORTEX

صفحة AI LAB تعرض إضافة إلى Trade AI وMarket AI:

- مرحلة CORTEX.
- VALID cases.
- TESTING / PROMISING / PROVEN.
- EDGE / RISK.
- Drift Sentinel.
- عدد الفرضيات.
- Mentor usage.
- Checkpoints وحجم Brain.
- Statistical Firewall.
- Proof Gate.
- Multiple-testing tax.
- CORTEX Arena.
- Calibration Mirror.
- أفضل الاكتشافات.
- الفرضيات التي اجتازت المستقبل مع دليل LCB/z.
- Feature Tribunal: الميزات المساعدة والميزات التي أضرت بالتنبؤ.

---

# 10) الاختبارات والمراجعة قبل/بعد

نفذ:

```bash
npm test
```

وتغطي الحزمة:

- Directional Flow.
- Lux-only admission.
- عزل PA/C-E/EMA.
- الفريمات واستقلال LONG/SHORT.
- البرق الأقوى البصري.
- فرز الرادار العرضي فقط.
- Safari resume.
- Memory V2 وVALID/REJECTED.
- Giant legacy state selective loader.
- Trade AI Shadow وVALID-only training.
- Net PnL بعد رسوم Spot الكاملة 0.20% بدون BNB.
- رفض هندسة TP/SL الخاطئة قبل التعلم.
- Economic magnitude weighting: الخسارة الكبيرة أثقل من الربح الصغير.
- حفظ نتيجة كل يوم 24h ومقارنتها باليوم السابق ومتوسط 7 أيام.
- Integrity Sanitation + Replay لبيانات v9.5: تصحيح القابل للإثبات، حذف الخاطئ/غير القابل للتحقق من مصادر التعلم، وحفظ النسخة الخام كـAudit فقط.
- Feature Ablation snapshots.
- فصل Brain/Dataset/Runtime/Checkpoints.
- Market AI anchors/forward labels/readiness/bounded memory.
- Ω CORTEX Hypothesis Forge.
- منع hindsight proof.
- Statistical Firewall + multiple-testing adjustment + temporal blocks.
- Feature Tribunal.
- Calibration Mirror.
- Drift quarantine.
- Restart غير المدمر للتعلم.
- API exports واستمرارية العقول عبر إعادة تشغيل الخادم.

## مرجع التطوير

اعتبر **v9.6.0 NET PNL 24H · LAB AI Ω CORTEX** خط الأساس التالي بعد نجاح اختبارات الحزمة النهائية.

أي تطوير لاحق يجب أن يحافظ على:

1. Lux/Flow invariants.
2. Shadow-only AI حتى يتم اتخاذ قرار مستقل وصريح مستقبلًا.
3. عدم تغيير معنى Feature Schema قديم بصمت.
4. فصل Runtime/Dataset/Brains/Checkpoints.
5. عدم إثبات أي فرضية على بيانات اكتشافها.
6. عدم اعتماد اكتشاف واحد لمجرد أنه جميل؛ يجب أن يمر من Statistical Firewall وCORTEX Arena.
7. لا يعتبر TP أو نسبة الفوز وحدهما ربحية؛ الحكم الاقتصادي يعتمد على Net PnL ومجموع الأرباح مقابل مجموع الخسائر بعد الرسوم.
