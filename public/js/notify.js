// تنبيهات: صوت عالي + اهتزاز + إشعار من الموبايل/المتصفح لو الصفحة في الخلفية.
// الإشعار هنا بيشتغل طول ما التطبيق مفتوح (حتى لو في الخلفية). الإشعار والتطبيق مقفول خالص محتاج Push من السيرفر.

let ctx = null;
const audio = () => {
  ctx ??= new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
};
// المتصفحات مش بتسمح بالصوت غير بعد أول لمسة، فنجهّز الصوت مع أول دوسة
['pointerdown', 'keydown', 'touchstart'].forEach((ev) => window.addEventListener(ev, () => { try { audio(); } catch { /* مفيش صوت */ } }, { once: true, passive: true }));

// نغمتين عاليتين متكررتين (أوضح بكتير من الصفارة العادية)
export function alarm({ times = 3 } = {}) {
  try {
    const c = audio();
    for (let r = 0; r < times; r++) {
      [[988, 0], [1319, 0.18], [988, 0.36], [1319, 0.54]].forEach(([f, t]) => {
        const at = c.currentTime + r * 1.1 + t;
        const o = c.createOscillator();
        const g = c.createGain();
        o.type = 'square';
        o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, at);
        g.gain.exponentialRampToValueAtTime(0.5, at + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, at + 0.16);
        o.connect(g).connect(c.destination);
        o.start(at);
        o.stop(at + 0.17);
      });
    }
  } catch { /* الصوت غير متاح */ }
  try { navigator.vibrate?.([400, 150, 400, 150, 600]); } catch { /* مفيش اهتزاز */ }
}

export const canNotify = () => 'Notification' in window && 'serviceWorker' in navigator;
export const notifyState = () => (canNotify() ? Notification.permission : 'unsupported');

export async function askNotifications() {
  if (!canNotify()) return 'unsupported';
  try { return await Notification.requestPermission(); } catch { return Notification.permission; }
}

// إشعار بس لو الصفحة مش قدامه (لو قدامه، الصوت والرسالة كفاية)
export async function notify(title, body, { tag, url } = {}) {
  if (!canNotify() || Notification.permission !== 'granted' || document.visibilityState === 'visible') return;
  try {
    const reg = await navigator.serviceWorker.ready;
    await reg.showNotification(title, {
      body, tag, renotify: true, requireInteraction: true, lang: 'ar', dir: 'rtl',
      icon: '/img/logo-icon.png', badge: '/img/logo-icon.png', vibrate: [400, 150, 400],
      data: { url: url || location.href },
    });
  } catch { /* الإشعارات مش متاحة */ }
}

// زرار "فعّل الإشعارات" (بيختفي لو اتفعلت أو المتصفح مش بيدعمها)
export function notifyButton() {
  const s = notifyState();
  if (s === 'granted' || s === 'unsupported') return '';
  return s === 'denied'
    ? '<p class="notify-hint muted small">🔕 الإشعارات مقفولة من المتصفح. افتحها من إعدادات الموقع عشان يوصلك تنبيه والصفحة في الخلفية.</p>'
    : '<button class="btn small notify-btn" type="button" data-ask-notify>🔔 فعّل الإشعارات</button>';
}

export function bindNotifyButton(root, onDone) {
  root.querySelector('[data-ask-notify]')?.addEventListener('click', async () => {
    const s = await askNotifications();
    onDone?.(s);
  });
}
