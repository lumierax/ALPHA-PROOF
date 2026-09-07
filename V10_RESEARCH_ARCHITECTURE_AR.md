# ALPHA PROOF v10 — Research Architecture

## الهدف
بناء الجيل الأقوى كاملًا من البداية مع إبقاء السلطة الحية خلف الإثبات. v10 ليست وعد ربح؛ هي بنية تجعل المقارنة المستقبلية أكثر عدلًا ودقة وتمنع أن تتحول كثرة التعلم إلى كثرة ادعاءات.

## خط الرجعة
- Rollback: `ALPHA-PROOF-v9.9.4-FULL-PROFIT-FIRST-VERIFIED-MEMORY-RECOVERY-AB-FATHER-READY.zip`
- لا تخلط أدلة v9.9.4 مع Prospective Evidence الخاصة بـv10.
- SPOT-CAPTURE-1 هو Candidate Base داخل v10 وليس إعادة كتابة لتاريخ v9.9.4.

## القدرات الـ14
1. **Multi-Horizon Return Distribution**: آفاق 0.25F/0.5F/1F/2F/4F، mean/Q10/Q50/Q90/P(net>0)، ومسار بلوغ الحركة البحثية قبل الحركة المعاكسة وزمن الوصول.
2. **Economic Continuation Value**: قيم بحثية مستقلة لـEXIT/HOLD/WAIT/PARTIAL_EXIT مع مخاطر الذيل وتكلفة إشغال رأس المال والامتصاص.
3. **Liquidity-Price Response**: التدفق الصافي، استجابة السعر، residual response، وabsorption احتمالي.
4. **Size-Aware Execution**: استهلاك مستويات Depth، unfilled quote، slippage، وlatency scenario. لا يُخصم spread مرتين.
5. **Portfolio & Capital**: محفظة Shadow لكل سياسة، رأس مال متماثل، drawdown/turnover، حدود تركّز، وقيود ارتباط عند وجود عينات كافية.
6. **Probabilistic Market Regime**: مزيج احتمالات لأربع حالات مع انتقال تدريجي.
7. **Sequential Evidence**: paired deltas على المستقبل المشترك، كتل زمنية، empirical-Bernstein LCB/ UCB، وحد اقتصادي قبل PROMISING/PROVEN.
8. **Hierarchical Transfer**: global → liquidity → frame → regime → symbol؛ partial pooling للبداية الأسرع دون تحويل النقل إلى Evidence.
9. **Multi-Task Maturity**: كل Label لها dueAt وجودة مستقلة؛ الفجوة تبطل الهدف غير القابل للمعرفة فقط.
10. **Prioritized Diverse Replay**: hard + recent + diverse؛ training updates منفصلة عن عدد الفرص المستقلة.
11. **Causal Self-Supervised Representation**: تعلم انتقال vector السوق الخام من t إلى t+1 دون outcome labels، مع مسار supervised منفصل عند نضج العوائد.
12. **Value of Information Budget**: novelty + disagreement + economic importance + proximity + liquidity، مع Deep Budget محدود.
13. **Shadow Policy Tournament**: كل السياسات ترى نفس الفرصة والوقت والبيانات؛ لا مقارنة بين فترات سوق مختلفة.
14. **Teacher / Student Distillation**: Teacher Research محلي Shadow + Student خفيف؛ عقد Father Teacher جاهز للـVPS، ولا تُحسب توقعات المعلّم كحقائق سوق.

## السياسات المتنافسة
- `BASELINE_V994` — Control
- `SPOT_CAPTURE_1` — Control/Candidate comparator
- `ECONOMIC_CONTINUATION` — Shadow
- `LIQUIDITY_AWARE` — Shadow
- `V10_COMBINED` — Shadow

حالات المرشح: `SHADOW → PROMISING → PROVEN`. لا يوجد انتقال تلقائي إلى LIVE في v10.0.0. فتح LIVE قرار Governance مستقل بعد الدليل.

## النزاهة
- Prospective only للترقية.
- Transferred knowledge ≠ evidence.
- Replay updates ≠ independent outcomes.
- Labels من المسار نفسه مترابطة وليست صفقات مستقلة.
- Profitability ≠ Calibration ≠ Statistical certainty.
- CORTEX يولد EDGE فقط.
- Father/Workers لا يعدلون Trade AI أو Adaptive Manager أو confidence أو EDGE مباشرة.

## الذاكرة
`v10-research/brain.json` لها Recovery A/B مستقل عبر `v10-research-foundation.js`. في GitHub Backup المحلي توجد ذاكرة IndexedDB A/B منفصلة لـv10.

## الأب
أضيفت أنواع مهام مستقبلية: `REVIEW_V10_POLICY`, `TRAIN_RESEARCH_TEACHER`, `DISTILL_CANDIDATE_POLICY`. تبقى البوابة `DISABLED_UNTIL_VPS` ولا يوجد مفتاح أو اتصال في هذه الحزمة.
