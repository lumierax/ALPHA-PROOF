# ALPHA PROOF v9.9.4 — Verified Memory Recovery A/B

## الهدف
هذه الطبقة تحمي ذاكرة ALPHA PROOF من تلف ملفات JSON الرئيسية دون السماح بتصفير عقل قائم بصمت.

المسار الثابت:

**Main → Local Checkpoint A/B → Father Workshop + Private GitHub بعد VPS → STOP**

إذا كانت Main سليمة تُستخدم مباشرة. إذا كانت تالفة أو مفقودة مع وجود تاريخ سابق، يتم التحقق من A وB واختيار أحدث نسخة سليمة. إذا فشلت النسختان، يكتب النظام `RECOVERY_REQUIRED.json` ويتوقف بدل إنشاء ذاكرة جديدة.

## مكونات الذاكرة المحمية
- Runtime `state.json`
- Trade AI Brain
- Ω CORTEX Brain، بما فيه Shadow Mentor وResearch Workforce
- Adaptive Manager Brain
- Market AI Brain
- Market AI Runtime

كل مكوّن يملك Recovery Vault مستقلًا حتى لا يؤدي تلف مكوّن إلى استرجاع بقية العقول بلا حاجة.

## Checkpoint A/B
كل Recovery Vault يحتوي:
- `checkpoint-A.json`
- `checkpoint-B.json`
- `manifest.json`
- `RECOVERY_REQUIRED.json` فقط عند فشل الاستعادة المحلية بالكامل.

كل حفظ جديد يكتب فوق **الأقدم** من A/B. كل Slot يحمل:
- Sequence
- Timestamp
- SHA-256 للـpayload
- App Version
- Cohort ID عندما يكون المكوّن داخل Clean Cohort
- نوع المكوّن
- سبب الحفظ

لا يعتمد الاسترجاع على الـmanifest وحده؛ يتم التحقق من ملف Slot نفسه وHash وSchema/Model وCohort قبل استخدامه.

## Recovery Manifest العام
المسار:

`DATA_DIR/recovery/recovery-manifest.json`

يصف آخر حالة Recovery لكل مكوّن، والإصدار، والـClean Cohort، وسياسة النسخ الخارجية المستقبلية.

الحالة الخارجية الآن عمدًا:

`DISABLED_UNTIL_VPS`

المزود المستقبلي:

`GITHUB_PRIVATE`

ولا تحتوي Snapshot أو Manifest على مفاتيح API أو Telegram أو Father Key أو Secrets.

## Fail Closed
إذا كانت Main وA وB غير صالحة:
1. لا يبدأ Brain جديدًا.
2. لا يصفر Market AI أو Runtime State.
3. يكتب `RECOVERY_REQUIRED.json` بحالة قابلة للقراءة آليًا.
4. يتوقف المكوّن/الخادم.

بعد الانتقال إلى VPS ستكون Father Workshop خدمة مستقلة قادرة على قراءة إشارة Recovery حتى لو كان ALPHA PROOF نفسه متوقفًا.

## دور ورشة الأب لاحقًا
عقد Recovery المجهز يدعم:
- `BACKUP_CHECKPOINT`
- `VERIFY_BACKUP`
- `RESTORE_CHECKPOINT`
- `RESTORE_SNAPSHOT`

السياسة المستقبلية:
- حفظ آخر Snapshotين موثقين في مستودع GitHub خاص.
- الكتابة فوق الأقدم، وليس الأحدث.
- Git يبقي تاريخ commits كتدقيق إضافي.
- الأب لا يخمن أو يعيد بناء ذاكرة مفقودة من عنده.
- Restore لا يتم إلا من bytes موثقة بعد Hash + Schema + Cohort + Version validation.
- الاسترجاع إلى ملف مؤقت أولًا، ثم Validation، ثم Atomic Replace.

## الشاشة
صفحة AI LAB تحتوي الآن على قسم:

**🛡️ حماية الذاكرة — Recovery A/B**

ويعرض حالة:
- Runtime State
- Trade AI
- CORTEX
- Adaptive Manager
- Market AI
- Market Runtime

ويظهر إن حصل Recovery عند الإقلاع ومن أي Slot/Sequence.

## نتيجة الاختبار المتعمد
تم اختبار:
- دوران A/B والكتابة فوق الأقدم.
- تلف Main واستعادة الأحدث.
- تلف Main + أحدث Slot واستعادة السابق.
- تلف Runtime + Trade AI + CORTEX + Adaptive + Market AI + Market Runtime معًا واستعادة القيم المزروعة الصحيحة.
- تلف Main + A + B والتأكد من STOP وعدم التصفير الصامت.
- إنشاء `RECOVERY_REQUIRED.json` للفشل الكامل.
- بقاء Father/GitHub غير متصلين حتى VPS.

هذه الحماية لا تثبت ربحية التداول؛ هي طبقة نزاهة واستمرارية للذاكرة فقط.
