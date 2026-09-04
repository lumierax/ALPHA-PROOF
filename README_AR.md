# ALPHA PROOF v8.3 Cloud + Telegram — تشغيل 24/7

هذه النسخة تنقل المسح والرادار والذاكرة التعليمية إلى الباكند على Railway، لذلك يستمر Alpha Proof حتى عند إغلاق Safari أو قفل الآيفون.

## ما بقي كما هو
- نتائج آخر مسح: PA + C/E + EMA فقط.
- أهلية الرادار: اختراق الترند → Volume فوق EMA400 → عدم تحقق TP/SL تاريخيًا قبل لحظة المسح.
- LONG: اختراق ترند هابط.
- SHORT: اختراق ترند صاعد.
- الهدف من ذيل شمعة الاختراق حسب الفريم مع tolerance.
- SL من أقرب Pivot حول شمعة الاختراق.
- العملات النشطة لا يعاد فحصها حتى تغلق بـ TP أو SL.
- العملات المرفوضة لا تظهر في الرادار ولا سجل الصفقات المغلقة؛ تبقى فقط في الذاكرة التعليمية المخفية.
- الفريم محفوظ في الرادار والصفقات المغلقة والذاكرة التعليمية المخفية.

## Telegram
كل رسائل Alpha Proof تبدأ بـ:
`🧬 ALPHA PROOF | ألفا بروف`

الإشعارات الحالية:
- دخول فرصة جديدة إلى الرادار.
- تحقق TP.
- تحقق SL.

لا توجد رسائل للعملات المرفوضة أو لكل عملية مسح، حتى لا يزدحم القروب.

Alpha Proof يبحث عن متغيرات Telegram بهذا الترتيب:
1. `ALPHAPROOF_TELEGRAM_TOKEN` و `ALPHAPROOF_TELEGRAM_CHAT_ID`
2. وإذا لم توجد، يستخدم مباشرة `NEXTMOVE_TELEGRAM_TOKEN` و `NEXTMOVE_TELEGRAM_CHAT_ID`

لذلك يمكنه استخدام نفس بوت وقروب Next Move Predictor بدون نسخ التوكن داخل الكود.

## تركيب Alpha Proof بجانب Next Move Predictor في Railway
لا تعدّل خدمة `next-move-predictor` الحالية.

1. ارفع مجلد Alpha Proof هذا إلى مستودع GitHub مستقل (أو مجلد/Repo مستقل مناسب للنشر).
2. داخل نفس Railway Project اضغط `+ New` ثم أنشئ Service جديدة من مستودع Alpha Proof.
3. سمِّ الخدمة مثلًا `alpha-proof`.
4. اجعل متغيري Next Move الخاصين بTelegram متاحين لخدمة Alpha Proof كـ Shared Variables / Reference Variables:
   - `NEXTMOVE_TELEGRAM_TOKEN`
   - `NEXTMOVE_TELEGRAM_CHAT_ID`
   لا تغيّر قيمهما ولا تحذفهما من Next Move Predictor.
5. أضف Railway Volume لخدمة Alpha Proof واربطه بالمسار `/data`.
6. أنشئ Domain لخدمة Alpha Proof من Settings → Networking/Generate Domain.
7. افتح Domain؛ ستظهر واجهة Alpha Proof.

## اختبار Telegram
بعد تشغيل الخدمة يمكنك اختبار الربط بطلب POST إلى:
`/api/telegram/test`

أو ببساطة انتظر أول فرصة تدخل الرادار. رسالة الاختبار، إن استُخدمت، ستكون باسم Alpha Proof بوضوح.

## فحص صحة الخدمة
`/health`
يعرض `telegramConfigured: true` عندما تكون متغيرات Telegram متاحة فعلًا داخل خدمة Alpha Proof.

## التخزين الدائم مهم جدًا
اربط Railway Volume بالمسار `/data`. بدون Volume سيعمل النظام، لكن حالة الرادار والسجل والذاكرة التعليمية قد تضيع بعد Redeploy أو Restart.

## ملاحظة أمنية
لا تضع Telegram Bot Token داخل GitHub أو داخل ملفات HTML/JavaScript. يبقى داخل Railway Variables فقط.


## v8.3 — بطاقة أنشط عملة
- لا تظهر البطاقة إلا إذا زاد فوليوم 24h صافيًا منذ دخول الرادار بالحد الأدنى القابل للتعديل (افتراضي 100,000 USDT).
- بين العملات المؤهلة، الاختيار حسب سرعة إجمالي حركة فوليوم 24h (صعودًا وهبوطًا) منذ الدخول، ثم سرعة الزيادة الصافية ثم مقدارها.
- الرادار وشروط المسح والدخول وTP/SL وTelegram والذاكرة التعليمية لم تتغير.


## جديد v8.3
- تنبيه Telegram مستقل عند انتقال عملة إلى بطاقة «أنشط عملة».
- مفتاح تشغيل/إيقاف للتنبيه من الإعدادات، افتراضيًا تشغيل.
- منع تكرار التنبيه لنفس متصدر البطاقة في كل تحديث.
- حفظ أحداث FEATURED_ENTER في state.json وفي ملف التصدير لاستخدامها لاحقًا في مختبر Alpha Proof.
- لا تغيير في شروط المسح أو دخول الرادار أو TP/SL أو تنبيهات الدخول/الخروج.
