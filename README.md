# Lumierax Quant — GitHub Pages

نسخة HTML/CSS/JavaScript تعمل مباشرة على GitHub Pages وتُفتح من Safari.

## الفريمات

- دخول: `5m / 15m / 30m`
- تأكيد فقط: `1h / 4h / 12h / 1d`

فريمات التأكيد ليست شروطًا إجبارية كلها. تستخدم كسياق مرن مع:
`CONFIRMED / WAIT / BLOCKED`

وتشمل:
- EMA20 / EMA50 / EMA200
- دعم ومقاومة
- Breakout / Breakdown
- Retest / Reclaim / Rejection
- دعم مكسور أصبح مقاومة والعكس
- Oversold / Overbought
- ضغط Taker داخل الشمعة الحالية
- Volume pace
- Trend retest
- Pattern hints
- Late Entry

Futures يضيف:
- Funding
- Open Interest
- Taker Buy/Sell Ratio
- Order Book imbalance

## Telegram

في صفحة SETTINGS أدخل:
- Telegram Bot Token
- Spot Chat ID
- Futures Chat ID

يمكن استخدام نفس البوت مع قناتين مختلفتين.

### قواعد عدم التكرار
- Spot: إذا أُرسلت عملة، لا تُرسل مرة ثانية حتى TP3 أو SL.
- Futures: إشارة نشطة واحدة فقط في النظام حتى TP3 أو SL.
- TP1 وTP2 يتم تسجيلهما بصمت.

## الأسرار

لا توجد أسرار داخل ملفات GitHub.

أي Token / Chat ID / Binance Key تكتبه في SETTINGS يُحفظ فقط داخل `localStorage` في Safari/المتصفح على جهازك.

**تحذير:** التخزين داخل المتصفح ليس بديلًا عن Backend آمن. لا تستخدم Binance API Key بصلاحية سحب. Scanner الحالي لا يحتاج Binance API Key أصلًا لأنه يستخدم البيانات العامة فقط.

## أهم قيد

GitHub Pages ليس سيرفر 24/7.

الماسح والمتابعة يعملان فقط عندما تكون الصفحة مفتوحة ويُسمح لـJavaScript بالعمل. iPhone/Safari قد يوقف JavaScript عندما تكون الصفحة في الخلفية أو الشاشة مقفلة. لذلك Telegram alerts ليست مضمونة 24/7 في هذه النسخة.

## رفعه إلى GitHub Pages

1. أنشئ Repository جديدًا.
2. ارفع محتويات هذا المجلد إلى جذر الـRepository:
   - `index.html`
   - `styles.css`
   - `app.js`
   - `.nojekyll`
3. افتح:
   `Settings → Pages`
4. تحت Build and deployment:
   - Source: `Deploy from a branch`
   - Branch: `main`
   - Folder: `/ (root)`
5. Save.
6. انتظر دقيقة أو دقيقتين وسيظهر رابط GitHub Pages.
7. افتح الرابط من Safari.
8. ادخل SETTINGS وأضف Telegram Token وChat IDs.

## ملاحظة الأداء

النسخة الثابتة تقلل الضغط على Binance:
- تبدأ افتراضيًا بـ 8 عملات لكل سوق.
- يمكن رفعها من SETTINGS حتى 20.
- تجلب فريمات التأكيد فقط عندما توجد إشارة خام تستحق التحليل.

الـScore هو درجة فلترة heuristic وليس نسبة نجاح أو ضمان ربح.
