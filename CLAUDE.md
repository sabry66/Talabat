# أريفو (Arrivo) — خريطة سريعة للمشروع

تطبيق توصيل أكل مصري: عميل / مطعم / مندوب / خدمة عملاء / أدمن. HTML+CSS+JS عادي (ES modules، من غير build) + Firebase.
القواعد الكاملة في مهارة `arrivo-conventions`، والاختبارات في `arrivo-test` (`bash tests/run.sh`).
الفرع: `claude/web-orders-app-design-1utclh`. الموقع: https://arrivo-932e4.web.app (مشروع Firebase `arrivo-932e4`، Firestore في eur3).

## فين إيه (public/)
| الملف | فيه |
|---|---|
| `index.html` + `js/app.js` | تطبيق العميل (hash routing): `router`, `renderHome/drawResults`, `renderRestaurant/drawMenu`, `openItemSheet` (الحجم والإضافات), `renderCart/couponBox`, `renderCheckout`, `renderOrder/drawOrder/reorder`, `renderOffers`, `renderFavorites/toggleFavorite`, `renderAccount/drawAddressBook`, `renderSupportPage` |
| `restaurant.html` + `js/restaurant-dashboard.js` | لوحة المطعم: الطلبات، `menu-editor.js` (المنيو + محرر الاختيارات)، `offers-editor.js` (الخصومات) |
| `delivery.html` + `js/delivery.js` | المندوب: المتاح (حد الأوردرات `maxOrders`)، الحالي، حسابي |
| `admin.html` + `js/admin.js` | الأدمن والموظف: `drawOverview/Requests/Support/Finance/Restaurants/Zones/Drivers/Users/Orders` + `admin-coupons.js` |
| `js/backend/firebase.js` و`local.js` | نفس الواجهة بالظبط (Firebase أو الوضع التجريبي في localStorage). `index.js` بيختار (فيه top-level await) |
| `js/ui.js` | مشترك: `renderAuthForm` (موافقة الشروط)، `renderAcceptTerms`، `orderCard`، `lineOptions`، `errorMessage`، `homeFor` |
| `js/data.js` | ثوابت + بيانات تجريبية + `DEFAULT_SETTINGS` + `LEGAL_VERSION` + `PAYMENT_METHODS` (طرق الدفع؛ الأدمن بيفعّلها في `settings.payments`) |
| `js/addresses.js` / `finance.js` / `coupons.js` / `offers.js` / `options.js` / `cart.js` | العناوين / الحسابات / الكوبونات / الخصومات / اختيارات الصنف (مفتاح السطر `itemId\|g:c`) / السلة |
| `js/busy.js` / `schedule.js` | وضع الزحمة (`restTime`) / جدولة الطلب (`slots`، `whenLabel`، `scheduleTag`) |
| `js/notify.js` | التنبيه العالي `alarm` + الاهتزاز + إشعارات المتصفح `notify` (والتطبيق مفتوح) |
| `js/support.js` | الشكاوى + الصور + أسباب "مشكلة في الطلب" |
| `js/map.js` `drawer.js` `pwa.js` `upload.js` `search.js` `join.js` `identity.js` | الخريطة، القايمة الجانبية، التنزيل كتطبيق، رفع الصور (Cloudinary `qrp8inik`)، البحث، طلبات الانضمام، اسم المستخدم والموبايل |
| `css/style.css` | كل الستايل (الألوان متغيرات في `:root`، والوضع الليلي تحتها؛ متكتبش ألوان ثابتة)؛ الأقسام بعناوين `/* ---------- ... ---------- */`، والموبايل تحت `@media (max-width: 900px/760px)` |
| `terms.html` / `privacy.html` | الشروط والخصوصية (لو اتعدلوا تعديل مهم غيّر `LEGAL_VERSION`) |

**لو ضفت أو شيلت `import`:** شغّل `node scripts/preload.mjs` (بيحدّث لستة `modulepreload` في الصفحات عشان المتصفح يحمّل كل الملفات مرة واحدة)، والاختبار بيفشل لو نسيت.

برّه public: `firestore.rules` (كل الصلاحيات)، `firebase.json` (لينكات `/join/*`)، `functions/` (إشعارات Push، بتتنشر لوحدها بـ `firebase.functions.json`)، `android/` (APK؛ ملف التوقيع ممنوع)، `tests/`، `replica/` (تحليل السوق وخطة البناء `replica/build-plan.md`).

## توفير السياق (زي Headroom بس محلي وآمن)
- أي أمر مخرجاته طويلة (اختبارات، emulator، npm، JSON): `... 2>&1 | python3 .claude/tools/squeeze.py` — بيجمّع المتكرر ويحافظ على سطور الأخطاء، والأصل كامل في `tests/out/squeeze/`.
- متقراش ملف كبير كله: `grep -n` الأول، وبعدين Read بـ offset/limit على الجزء المطلوب. الخريطة اللي فوق بتقولك الملف.
- البحث الواسع في الكود: Explore agent بدل ما تقرا ملفات كتير بنفسك.
- `bash tests/run.sh` بيطبع ✅/❌ بس؛ التفاصيل في `tests/out/<اسم>.log` (اقراها بـ squeeze أو tail).
- الصور (screenshots): بس لما الشكل نفسه هو السؤال.
