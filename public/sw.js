// Service worker: بيخلّي الموقع يتنزّل كتطبيق، ويفتح بسرعة من الكاش.
// الشبكة الأول دايمًا (عشان أي تحديث يظهر على طول)، والكاش لو مفيش نت.
const CACHE = 'arrivo-v3';
const SHELL = [
  '/', '/index.html', '/restaurant.html', '/delivery.html', '/admin.html',
  '/css/style.css', '/fonts/Cairo-Variable.woff2', '/img/logo-mark.svg', '/img/logo-mark-dark.svg', '/img/logo-full.svg', '/img/logo-full-dark.svg',
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

// دوسة على الإشعار: نفتح الصفحة اللي الإشعار جاي منها (أو نرجع لها لو مفتوحة)
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = e.notification.data?.url || '/';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    const same = list.find((c) => c.url === url) || list.find((c) => new URL(c.url).pathname === new URL(url).pathname);
    if (same) return same.focus().then((c) => (c && c.url !== url ? c.navigate(url) : c));
    return self.clients.openWindow(url);
  }));
});

// اللينكات اللي في الإشعار لازم تكون جوه الموقع بس
const sameOrigin = (u) => {
  try {
    const url = new URL(u || '/', self.location.origin);
    return url.origin === self.location.origin ? url.href : self.location.origin + '/';
  } catch { return self.location.origin + '/'; }
};

// إشعار جاي من السيرفر والتطبيق مقفول (Firebase Cloud Messaging بيبعت data بس، وإحنا بنعرضه)
self.addEventListener('push', (e) => {
  let msg = {};
  try { msg = e.data?.json() || {}; } catch { msg = { data: { body: e.data?.text() || '' } }; }
  const d = msg.data || msg.notification || {};
  e.waitUntil(self.registration.showNotification(d.title || 'أريفو', {
    body: d.body || '',
    tag: d.tag || undefined,
    renotify: Boolean(d.tag),
    requireInteraction: d.urgent === '1',
    lang: 'ar', dir: 'rtl',
    icon: '/img/logo-icon.png', badge: '/img/logo-icon.png',
    vibrate: d.urgent === '1' ? [400, 150, 400, 150, 600] : [200, 100, 200],
    data: { url: sameOrigin(d.url) },
  }));
});
