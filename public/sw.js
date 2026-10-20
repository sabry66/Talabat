// Service worker: بيخلّي الموقع يتنزّل كتطبيق، ويفتح بسرعة من الكاش.
// الشبكة الأول دايمًا (عشان أي تحديث يظهر على طول)، والكاش لو مفيش نت.
const CACHE = 'arrivo-v1';
const SHELL = [
  '/', '/index.html', '/restaurant.html', '/delivery.html', '/admin.html',
  '/css/style.css', '/fonts/Cairo-Variable.woff2', '/img/logo-icon.png', '/img/logo.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // ملفات الموقع بس؛ Firebase والصور والخرائط بتروح للنت على طول
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true })),
  );
});
