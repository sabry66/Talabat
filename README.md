# طلباتي 🛵

تطبيق ويب كامل لطلب الأكل والتوصيل، شبه "طلبات"، ببلاش بالكامل على Firebase.

- **تطبيق العميل:** بحث، تصنيفات، منيو، سلة، أكواد خصم، تحديد العنوان على الخريطة، وتتبع الطلب لحظيًا.
- **لوحة المطعم:** الطلبات بتوصل بصوت تنبيه، قبول ورفض وتغيير الحالة، تعديل المنيو والأسعار، وفتح وقفل المطعم.
- **لوحة الأدمن:** إحصائيات، إضافة المطاعم وربطها بأصحابها، ومتابعة كل الطلبات.

## 👈 ابدأ من هنا: [دليل التشغيل SETUP.md](SETUP.md)

## التجربة السريعة (من غير Firebase)

```bash
python3 -m http.server 8000 -d public
```

افتح http://localhost:8000. التطبيق هيشتغل في وضع تجريبي بحسابات جاهزة (كلمة السر لكلهم `123456`):

| الحساب | الصفحة |
|---|---|
| `customer@demo.com` | `/` |
| `owner@demo.com` | `/restaurant.html` |
| `admin@demo.com` | `/admin.html` |

افتح كل حساب في تاب لوحده، وجرّب تطلب من تاب العميل وتستقبل الطلب في تاب المطعم.

## التقنيات (كلها مجانية)

- HTML و CSS و JavaScript من غير أي framework ومن غير build step.
- Firebase Authentication لتسجيل الدخول.
- Cloud Firestore لقاعدة البيانات اللحظية.
- Firebase Hosting للاستضافة.
- Leaflet + OpenStreetMap للخريطة.
- خط Cairo جوه المشروع في `public/fonts` (رخصة OFL المجانية)، فمش محتاج Google Fonts.

## هيكل المشروع

```
public/
  index.html             تطبيق العميل
  restaurant.html        لوحة المطعم
  admin.html             لوحة الأدمن
  css/style.css
  js/
    firebase-config.js   ⚙️ إعدادات Firebase (حطها هنا)
    backend/             Firebase أو الوضع التجريبي، بنفس الواجهة
    app.js               صفحات العميل
    restaurant-dashboard.js
    admin.js
    menu-editor.js       محرر المنيو (للمطعم والأدمن)
    cart.js, map.js, ui.js, data.js
firestore.rules          قواعد الحماية
firebase.json            إعدادات الاستضافة
```
