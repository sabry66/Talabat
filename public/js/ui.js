// أدوات مشتركة بين صفحات التطبيق ولوحة المطعم ولوحة الأدمن
import { ORDER_STATUSES, PAYMENT_LABELS } from './data.js';

export const fmt = (n) => `${Number(n || 0).toLocaleString('ar-EG')} ج.م`;

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const shortId = (id) => String(id).slice(-6).toUpperCase();

export const isAvailable = (item) => item.available !== false;

export const statusBadge = (status) => {
  const s = ORDER_STATUSES[status] || { label: status, icon: '' };
  return `<span class="status ${status}">${s.icon} ${s.label}</span>`;
};

export const paymentLabel = (p) => PAYMENT_LABELS[p] || p;

export const mapLink = (loc) => (loc ? `https://www.google.com/maps?q=${loc.lat},${loc.lng}` : null);

export const isToday = (ms) => new Date(ms).toDateString() === new Date().toDateString();

export function timeAgo(ms) {
  const min = Math.floor((Date.now() - ms) / 60000);
  if (min < 1) return 'دلوقتي';
  if (min < 60) return `من ${min} دقيقة`;
  const h = Math.floor(min / 60);
  if (h < 24) return `من ${h} ساعة`;
  return new Date(ms).toLocaleDateString('ar-EG');
}

export function toast(msg) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove('show'), 2600);
}

export function errorMessage(e) {
  const code = e?.code || '';
  const map = {
    'auth/invalid-credential': 'الإيميل أو كلمة السر غلط',
    'auth/wrong-password': 'الإيميل أو كلمة السر غلط',
    'auth/user-not-found': 'الإيميل أو كلمة السر غلط',
    'auth/email-already-in-use': 'الإيميل ده مسجل قبل كده، جرب تسجيل الدخول',
    'auth/weak-password': 'كلمة السر لازم تكون 6 حروف أو أرقام على الأقل',
    'auth/invalid-email': 'الإيميل مكتوب غلط',
    'auth/too-many-requests': 'محاولات كتير، استنى شوية وجرب تاني',
    'auth/network-request-failed': 'مفيش اتصال بالإنترنت',
    'auth/operation-not-allowed': 'لازم تفعّل تسجيل الدخول بالإيميل من Firebase Console',
    'auth/configuration-not-found': 'لازم تفعّل Authentication من Firebase Console',
    'permission-denied': 'مش مسموحلك تعمل العملية دي',
    unavailable: 'مفيش اتصال بالسيرفر، جرب تاني',
  };
  return map[code] || `حصل خطأ: ${e?.message || e}`;
}

// صوت تنبيه بسيط للطلبات الجديدة (من غير ملفات صوت)
export function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.25, 0.5].forEach((t) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.25, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.2);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + t);
      o.stop(ctx.currentTime + t + 0.2);
    });
  } catch { /* الصوت غير متاح */ }
}

export const loader = () => '<div class="loader" aria-label="جاري التحميل"></div>';

export function demoBanner(isDemo) {
  return isDemo
    ? '<div class="demo-banner">🧪 وضع تجريبي: البيانات محفوظة في المتصفح ده بس. لربط قاعدة بيانات حقيقية شوف ملف SETUP.md</div>'
    : '';
}

// فورم تسجيل الدخول / إنشاء حساب
export function renderAuthForm(el, { backend, isDemo, mode = 'login', title = '', onDone }) {
  const draw = () => {
    el.innerHTML = `
      <div class="auth-card panel">
        ${title ? `<h2>${title}</h2>` : ''}
        <div class="auth-tabs">
          <button type="button" data-mode="login" class="${mode === 'login' ? 'active' : ''}">تسجيل الدخول</button>
          <button type="button" data-mode="register" class="${mode === 'register' ? 'active' : ''}">حساب جديد</button>
        </div>
        <form id="authForm">
          ${mode === 'register' ? `
            <label>الاسم<input name="name" required autocomplete="name"></label>
            <label>رقم الموبايل<input name="phone" type="tel" required pattern="01[0-9]{9}" placeholder="01xxxxxxxxx" inputmode="numeric" autocomplete="tel"></label>` : ''}
          <label>الإيميل<input name="email" type="email" required autocomplete="email" dir="ltr"></label>
          <label>كلمة السر<input name="password" type="password" required minlength="6" dir="ltr"
            autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}"></label>
          <p class="form-error" id="authError" hidden></p>
          <button class="btn primary block" type="submit">${mode === 'login' ? 'دخول' : 'إنشاء الحساب'}</button>
        </form>
        ${isDemo && mode === 'login' ? `
          <div class="demo-accounts">
            <p class="muted small">حسابات تجريبية (كلمة السر 123456):</p>
            <button type="button" class="chip" data-demo="customer@demo.com">👤 عميل</button>
            <button type="button" class="chip" data-demo="owner@demo.com">🍔 صاحب مطعم</button>
            <button type="button" class="chip" data-demo="admin@demo.com">🛠️ أدمن</button>
          </div>` : ''}
      </div>`;

    el.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => { mode = b.dataset.mode; draw(); }));
    el.querySelectorAll('[data-demo]').forEach((b) => b.addEventListener('click', () => {
      el.querySelector('[name=email]').value = b.dataset.demo;
      el.querySelector('[name=password]').value = '123456';
    }));

    const form = el.querySelector('#authForm');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(form));
      const btn = form.querySelector('button[type=submit]');
      const errEl = el.querySelector('#authError');
      btn.disabled = true;
      errEl.hidden = true;
      try {
        if (mode === 'login') await backend.signIn(d.email, d.password);
        else await backend.signUp({ name: d.name.trim(), phone: d.phone.trim(), email: d.email, password: d.password });
        if (onDone) onDone();
      } catch (err) {
        errEl.textContent = errorMessage(err);
        errEl.hidden = false;
        btn.disabled = false;
      }
    });
  };
  draw();
}

// اسم المستخدم وزرار الخروج في هيدر لوحات التحكم
export function renderDashNav(user, backend) {
  const nav = document.getElementById('userNav');
  nav.innerHTML = user
    ? `<span class="muted small">${esc(user.name || user.email)}</span><button class="btn small" id="logoutBtn" type="button">خروج</button>`
    : '';
  if (user) nav.querySelector('#logoutBtn').addEventListener('click', () => backend.signOut());
}

// بطاقة طلب في لوحات التحكم، actions = [{ status, label, cls }]
export function orderCard(o, actions = [], { showRestaurant = false } = {}) {
  const map = mapLink(o.location);
  return `
    <article class="order-card status-${o.status}">
      <header>
        <strong>#${shortId(o.id)}</strong>
        <span class="muted small">${timeAgo(o.createdAt)}</span>
      </header>
      ${showRestaurant ? `<div class="small">${esc(o.restaurantEmoji)} ${esc(o.restaurantName)}</div>` : ''}
      <ul class="order-lines">
        ${o.lines.map((l) => `<li><b>${l.qty}×</b> ${esc(l.name)}</li>`).join('')}
      </ul>
      ${o.notes ? `<p class="note">📝 ${esc(o.notes)}</p>` : ''}
      <div class="small">
        👤 ${esc(o.customerName)} • <a href="tel:${esc(o.customerPhone)}" dir="ltr">${esc(o.customerPhone)}</a><br>
        📍 ${esc(o.address)} ${map ? `<a href="${map}" target="_blank" rel="noopener">(الخريطة)</a>` : ''}
      </div>
      <footer>
        <strong>${fmt(o.totals.total)}</strong>
        <span class="small muted">${paymentLabel(o.payment)}</span>
      </footer>
      ${actions.length ? `<div class="order-actions">
        ${actions.map((a) => `<button class="btn small ${a.cls || ''}" data-id="${o.id}" data-status="${a.status}" type="button">${a.label}</button>`).join('')}
      </div>` : ''}
    </article>`;
}
