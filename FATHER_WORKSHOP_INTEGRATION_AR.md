# ALPHA PROOF Ω — تجهيز CORTEX + فريق البحث + ورشة الأب

## المبدأ المعماري

**CORTEX يفكر، والموظفون يحفرون.**

CORTEX يلاحظ ويصنع السؤال والفرضية ويقرر متى يستحق الأمر تحقيقًا. المساعدون الأربعة ينفذون أعمال البحث المحددة ويعيدون تقارير إلى CORTEX. الأدوات الست معدات بحث On-Demand وليست عقولًا مستقلة. ورشة الأب طبقة تصعيد خارجية مستقبلية، وليست جزءًا لازمًا لاستمرار ALPHA PROOF.

## المساعدون الأربعة

1. **Evidence Hunter — باحث الأدلة**
   - يجمع الحالات المشابهة والتسلسل الزمني وحدود صلاحية المعرفة.
   - الأدوات الأساسية: Similarity Comparison + Temporal Microscope + Validity Map.

2. **Falsifier — المشكك**
   - يحاول إسقاط الفرضية بدل تأكيدها.
   - يبحث عن الحالات المضادة والمتغيرات المربكة.
   - الأدوات الأساسية: Variable Isolation + Similarity Comparison + Temporal Microscope.

3. **Prospective Experimenter — المجرب المستقبلي**
   - يتابع الفرضية بعد تجميدها فقط.
   - الماضي لا يدخل في إثباتها.
   - الأدوات الأساسية: Hypothesis Ledger + Entry/Wait/Exit Decision Lab.

4. **Generalization Tester — مختبر التعميم**
   - يفحص هل EDGE تعمل عبر سياقات وفريمات واتجاهات متعددة أم أنها محلية فقط.
   - الأدوات الأساسية: Validity Map + Similarity Comparison + Variable Isolation.

كل Worker يعمل **On-Demand**، وحالة عمله وسجل مهامه محدودان في الذاكرة.

## الأدوات الست

- Similar Opportunities Comparison
- Temporal Microscope
- Entry / Wait / Exit Lab
- Variable Isolation
- Hypothesis Ledger
- Knowledge Validity Map

تظل متاحة لـCORTEX ولفريقه عند الحاجة. لا تعمل كعقول دائمة، ولا تمنح أي سلطة تداول.

## صلاحيات الفريق

المساعدون الأربعة لا يستطيعون:

- تنفيذ صفقة.
- تعديل Trade AI.
- تعديل Adaptive Manager.
- رفع أو خفض الثقة الحية.
- اعتماد EDGE.
- استخدام البيانات التاريخية كإثبات لفرضية وُلدت منها.

هم يعيدون **تقارير بحث فقط** إلى CORTEX.

## Father Gateway — بوابة الأب

الحالة الحالية عمدًا:

`DISABLED_UNTIL_VPS`

الحزمة الحالية لا تحفظ مفتاح أب، ولا ترسل اتصالًا إلى أي ورشة خارجية، ولا تحتوي مسارًا يضع سرًا في المتصفح.

تم تجهيز العقود التالية:

- `alpha-proof-father-workshop/1`
- `alpha-proof-father-handoff/1`
- `alpha-proof-father-response/1`

وأنواع المهام المستقبلية:

- `INVESTIGATE`
- `CHALLENGE_HYPOTHESIS`
- `DESIGN_TOOL`
- `REVIEW_EDGE`
- `EXPLAIN_ANOMALY`
- `FULL_RESEARCH`

## Father Handoff Package

عند بناء الورشة، يستطيع CORTEX تجهيز حقيبة تسليم محدودة تحتوي على:

- السؤال المحدد.
- الفرضية المجمدة عند الحاجة.
- حالة CORTEX الحالية.
- تقارير المساعدين الأخيرة.
- حالة الأدوات البحثية.
- سياق السوق المختصر.
- حدود الإثبات والصلاحيات.

الأب لا يبدأ من الصفر، ولا يستلم قاعدة ALPHA PROOF كاملة بلا حاجة.

## عقد رد الأب

أي رد مستقبلي من الورشة يجب أن يعود كـProposal منظم يتضمن مثلًا:

- conclusion
- confidence
- evidence
- counterEvidence
- unknowns
- suggestedExperiments
- suggestedTools
- validityScope
- risks
- nextAction

حتى لو كانت النتيجة قوية، لا تصبح معرفة معتمدة مباشرة.

## السياسة العليا

الماضي مسموح للاكتشاف والفهم، بما في ذلك تاريخ أقدم من إنشاء ALPHA PROOF.

لكن الإثبات الحقيقي:

**Frozen Hypothesis → Future Data → Statistical Firewall → Prospective Proof**

لا يستطيع CORTEX أو أحد المساعدين أو الأب تجاوز هذه السلسلة.

## شاشة غرفة العمليات

صفحة AI LAB تعرض الآن:

- حالة فريق CORTEX.
- آخر تكليف لكل مساعد.
- خلاصة النتيجة.
- عدد العينات التي فُحصت.
- الأدوات المستخدمة.
- سجل أحدث المهام.
- حالة Father Gateway.

زر «مفتاح الأب» موجود كموضع جاهز، لكنه لا يطلب المفتاح ولا يحفظه الآن، ويشرح أن التفعيل بعد الانتقال إلى VPS.

## عند الانتقال إلى VPS لاحقًا

الخطوة المستقبلية هي وصل Father Gateway بالورشة وبمخزن أسرار آمن في الـbackend، ثم تحويل زر المفتاح من وضع التجهيز إلى مسار إدخال آمن. لا يلزم إعادة بناء CORTEX أو المساعدين أو عقود التسليم.

## Disaster Recovery + GitHub Private Vault — جاهز للتوصيل بعد VPS

أضيف في v9.9.4 عقد مستقل لاستعادة الذاكرة. ALPHA PROOF يحاول أولًا الاسترجاع المحلي من Checkpoint A/B الموثق. إذا فشلت Main وA وB، يكتب Recovery Manager ملف `RECOVERY_REQUIRED.json` ثم يتوقف بدل تصفير الذاكرة.

ورشة الأب المستقبلية يجب أن تعمل كخدمة مستقلة على الـVPS، حتى تستطيع رؤية إشارة Recovery عندما يكون ALPHA PROOF نفسه متوقفًا.

أنواع مهام الاستعادة المجهزة:
- `BACKUP_CHECKPOINT`
- `VERIFY_BACKUP`
- `RESTORE_CHECKPOINT`
- `RESTORE_SNAPSHOT`

السياسة المعدة لـGitHub:
- مستودع Private.
- آخر Snapshotين موثقين.
- كل Snapshot جديد يكتب فوق الأقدم.
- التحقق من SHA-256 + Schema/Model + App Version + Clean Cohort قبل Restore.
- لا Secrets داخل GitHub Backup.
- الأب لا يخمن القيم المفقودة ولا يصلح JSON بالاجتهاد؛ إما Restore من نسخة موثقة أو يبقى النظام STOP.

التفاصيل: `MEMORY_RECOVERY_AR.md`.


## v10 Research Teacher

في v10 أضيفت عقود `REVIEW_V10_POLICY` و`TRAIN_RESEARCH_TEACHER` و`DISTILL_CANDIDATE_POLICY`. هذه مجرد عقود جاهزة للورشة المستقبلية: Father Teacher لا يعمل على Railway، لا يملك مفتاحًا الآن، ومخرجاته Proposals/teacher targets فقط. أي Student أو Policy ناتجة عنه تحتاج Shadow prospective comparison مستقل قبل أي سلطة LIVE.
