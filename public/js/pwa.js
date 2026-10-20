// تنزيل الموقع كتطبيق على الموبايل (PWA)
// بيسجّل الـ service worker، ويظهر زرار "نزّل التطبيق" في العنصر اللي عليه data-install
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(console.error));
}

let deferredPrompt = null;

function showButtons() {
  if (isStandalone()) return;
  document.querySelectorAll('[data-install]').forEach((b) => { b.hidden = false; });
}

function iosHelp() {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = 'على الآيفون: اضغط زرار المشاركة ⬆️ تحت، وبعدين "Add to Home Screen" (إضافة إلى الشاشة الرئيسية)';
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 7000);
}

// أندرويد وكروم: المتصفح بيقولنا إن التطبيق ينفع يتنزّل
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  showButtons();
});

window.addEventListener('appinstalled', () => {
  deferredPrompt = null;
  document.querySelectorAll('[data-install]').forEach((b) => { b.hidden = true; });
});

// الآيفون مفيهوش زرار تنزيل تلقائي، فبنظهر الزرار ونشرح الخطوات
if (isIOS()) document.addEventListener('DOMContentLoaded', showButtons);

document.addEventListener('click', async (e) => {
  if (!e.target.closest('[data-install]')) return;
  if (deferredPrompt) {
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
  } else if (isIOS()) {
    iosHelp();
  }
});
