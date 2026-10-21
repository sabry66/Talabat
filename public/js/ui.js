// أدوات مشتركة بين صفحات التطبيق ولوحة المطعم ولوحة الأدمن
import { ORDER_STATUSES, PAYMENT_LABELS } from './data.js';
import { thumb } from './upload.js';

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
    'auth/missing-password': 'اكتب كلمة السر',
    'auth/requires-recent-login': 'لأسباب أمان، اخرج وادخل تاني وبعدين غيّر كلمة السر',
    'password-mismatch': 'كلمة السر الجديدة والتأكيد مش زي بعض',
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
    'order-taken': 'الأوردر ده مندوب تاني أخده',
    'driver-limit': 'وصلت لأقصى عدد أوردرات معاك في نفس الوقت. وصّل اللي معاك الأول وبعدين خد جديد',
    'coupon-exists': 'الكود ده موجود قبل كده، اختار كود تاني',
    'username-taken': 'اسم المستخدم ده محجوز، اختار اسم تاني',
    'username-invalid': 'اسم المستخدم لازم يكون من 3 لـ 20 حرف إنجليزي صغير أو أرقام أو _ و . بس',
    'username-locked': 'اسم المستخدم مينفعش يتغير بعد ما يتحدد',
    'phone-taken': 'رقم الموبايل ده مسجل بحساب تاني',
    'phone-invalid': 'رقم الموبايل لازم يكون 11 رقم ويبدأ بـ 01',
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

// لوجو المطعم لو موجود، وإلا الإيموجي
export const restaurantLogo = (r, size = 120) => (r.logo
  ? `<img class="logo-img" src="${esc(thumb(r.logo, size * 2))}" alt="${esc(r.name)}" loading="lazy">`
  : esc(r.emoji));

// صورة الصنف لو موجودة، وإلا الإيموجي
export const itemImage = (it, size = 84) => (it.image
  ? `<img src="${esc(thumb(it.image, size * 2))}" alt="${esc(it.name)}" loading="lazy">`
  : esc(it.emoji));

export const loader = () => '<div class="loader" aria-label="جاري التحميل"></div>';

export function demoBanner(isDemo) {
  return isDemo
    ? '<div class="demo-banner">🧪 وضع تجريبي: البيانات محفوظة في المتصفح ده بس. لربط قاعدة بيانات حقيقية شوف ملف SETUP.md</div>'
    : '';
}

// فورم تسجيل الدخول / إنشاء حساب
// نوع الحساب عند التسجيل من الموقع الرئيسي: العميل بيكمّل، والمطعم والمندوب بيروحوا لطلب الانضمام
export const SIGNUP_ROLES = [
  ['customer', '👤 عميل', 'عايز أطلب أكل'],
  ['restaurant', '🏪 صاحب مطعم', 'عايز أبيع على أريفو'],
  ['driver', '🛵 مندوب', 'عايز أشتغل توصيل'],
];

// askRole: يظهر سؤال "إنت مين؟" في الحساب الجديد، و onDone بيتنادى بالنوع اللي اختاره
export function renderAuthForm(el, { backend, isDemo, mode = 'login', title = '', onDone, askRole = false, role = 'customer' }) {
  const draw = () => {
    el.innerHTML = `
      <div class="auth-card panel">
        ${title ? `<h2>${title}</h2>` : ''}
        <div class="auth-tabs">
          <button type="button" data-mode="login" class="${mode === 'login' ? 'active' : ''}">تسجيل الدخول</button>
          <button type="button" data-mode="register" class="${mode === 'register' ? 'active' : ''}">حساب جديد</button>
        </div>
        <form id="authForm">
          ${mode === 'register' && askRole ? `
            <fieldset class="role-pick">
              <legend>إنت مين؟</legend>
              ${SIGNUP_ROLES.map(([k, l, d]) => `
                <label class="role-opt"><input type="radio" name="signupRole" value="${k}" ${role === k ? 'checked' : ''}>
                  <span><b>${l}</b><small>${d}</small></span></label>`).join('')}
            </fieldset>` : ''}
          ${mode === 'register' ? `
            <label>الاسم<input name="name" required autocomplete="name"></label>
            ${usernameField()}
            <label>رقم الموبايل<input name="phone" type="tel" required pattern="01[0-9]{9}" placeholder="01xxxxxxxxx" inputmode="numeric" autocomplete="tel" dir="ltr"></label>` : ''}
          <label>الإيميل<input name="email" type="email" required autocomplete="email" dir="ltr"></label>
          <label>كلمة السر<input name="password" type="password" required minlength="6" dir="ltr"
            autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}"></label>
          <p class="form-error" id="authError" hidden></p>
          <button class="btn primary block" type="submit">${mode === 'login' ? 'دخول' : 'إنشاء الحساب'}</button>
          ${mode === 'login' ? '<button class="link block-link" type="button" id="forgotBtn">نسيت كلمة السر؟</button>' : ''}
        </form>
        ${isDemo && mode === 'login' ? `
          <div class="demo-accounts">
            <p class="muted small">حسابات تجريبية (كلمة السر 123456):</p>
            <button type="button" class="chip" data-demo="customer@demo.com">👤 عميل</button>
            <button type="button" class="chip" data-demo="owner@demo.com">🍔 صاحب مطعم</button>
            <button type="button" class="chip" data-demo="driver@demo.com">🛵 مندوب</button>
            <button type="button" class="chip" data-demo="staff@demo.com">👔 خدمة عملاء</button>
            <button type="button" class="chip" data-demo="admin@demo.com">🛠️ أدمن</button>
          </div>` : ''}
      </div>`;

    el.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => { mode = b.dataset.mode; draw(); }));
    el.querySelectorAll('[name=signupRole]').forEach((r) => r.addEventListener('change', () => { role = r.value; }));
    el.querySelectorAll('[data-demo]').forEach((b) => b.addEventListener('click', () => {
      el.querySelector('[name=email]').value = b.dataset.demo;
      el.querySelector('[name=password]').value = '123456';
    }));

    el.querySelector('#forgotBtn')?.addEventListener('click', () => renderForgot(el, {
      backend, email: el.querySelector('[name=email]').value, onBack: () => { mode = 'login'; draw(); },
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
        else await backend.signUp({ name: d.name.trim(), phone: d.phone.trim(), username: d.handle, email: d.email, password: d.password });
        if (onDone) onDone(mode === 'register' ? role : null);
      } catch (err) {
        errEl.textContent = errorMessage(err);
        errEl.hidden = false;
        btn.disabled = false;
      }
    });
  };
  draw();
}

// الخانة اسمها handle ومن غير autocomplete عشان الموبايل ميفتكرهاش خانة تسجيل دخول
// ويفتح قايمة الإيميلات المحفوظة مع كل حرف (وده كان بيقفل الكيبورد)
const usernameField = (value = '', locked = false) => `
  <label>اسم المستخدم (مميز ليك ومحدش ياخده غيرك)
    <span class="at-input"><span>@</span><input name="handle" required pattern="[a-zA-Z0-9_.]{3,20}" value="${esc(value)}"
      placeholder="ahmed_10" dir="ltr" ${locked ? 'readonly' : ''}
      autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" data-lpignore="true" data-form-type="other"></span>
    <span class="muted small">${locked ? 'اسم المستخدم مبيتغيرش.' : 'من 3 لـ 20 حرف إنجليزي أو أرقام أو _ و . (مبيتغيرش بعد كده)'}</span>
  </label>`;

// نسيت كلمة السر: بنبعت لينك على الإيميل
function renderForgot(el, { backend, email = '', onBack }) {
  el.innerHTML = `
    <form class="auth-card panel" id="forgotForm">
      <h2>نسيت كلمة السر؟ 🔑</h2>
      <p class="muted small center">اكتب الإيميل اللي سجلت بيه، وهنبعتلك لينك تعمل منه كلمة سر جديدة.</p>
      <label>الإيميل<input name="email" type="email" required value="${esc(email)}" autocomplete="email" dir="ltr"></label>
      <p class="form-error" id="forgotError" hidden></p>
      <button class="btn primary block" type="submit">ابعتلي اللينك</button>
      <button class="btn block" type="button" id="forgotBack">رجوع لتسجيل الدخول</button>
    </form>`;
  el.querySelector('#forgotBack').addEventListener('click', onBack);
  el.querySelector('#forgotForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type=submit]');
    const errEl = el.querySelector('#forgotError');
    btn.disabled = true;
    errEl.hidden = true;
    try {
      const addr = e.target.email.value.trim();
      await backend.resetPassword(addr);
      el.innerHTML = `
        <div class="auth-card panel center">
          <div class="big">📧</div>
          <h2>بعتنالك إيميل</h2>
          <p>لو الإيميل <b dir="ltr">${esc(addr)}</b> مسجل عندنا، هيوصلك لينك تغيّر منه كلمة السر.</p>
          <p class="muted small">لو مش لاقيه، دوّر في <b>Spam</b> أو <b>الرسائل غير المرغوب فيها</b>.</p>
          <button class="btn primary block" type="button" id="forgotDone">رجوع لتسجيل الدخول</button>
        </div>`;
      el.querySelector('#forgotDone').addEventListener('click', onBack);
    } catch (err) {
      errEl.textContent = errorMessage(err);
      errEl.hidden = false;
      btn.disabled = false;
    }
  });
}

// تغيير كلمة السر (للي داخل بحسابه)
export function changePasswordForm() {
  return `
    <form class="panel narrow" id="passwordForm">
      <h3>🔑 تغيير كلمة السر</h3>
      <label>كلمة السر الحالية<input name="current" type="password" required autocomplete="current-password" dir="ltr"></label>
      <label>كلمة السر الجديدة<input name="next" type="password" required minlength="6" autocomplete="new-password" dir="ltr"></label>
      <label>اكتبها تاني للتأكيد<input name="confirm" type="password" required minlength="6" autocomplete="new-password" dir="ltr"></label>
      <button class="btn primary block" type="submit">تغيير كلمة السر</button>
    </form>`;
}

export function bindChangePassword(el, backend) {
  el.querySelector('#passwordForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const btn = f.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      if (f.next.value !== f.confirm.value) throw Object.assign(new Error('mismatch'), { code: 'password-mismatch' });
      await backend.changePassword(f.current.value, f.next.value);
      f.reset();
      toast('تم تغيير كلمة السر ✅');
    } catch (err) {
      // كلمة السر الحالية غلط بيرجع نفس كود "الإيميل أو كلمة السر غلط"
      toast(err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password' ? 'كلمة السر الحالية غلط' : errorMessage(err));
    } finally {
      btn.disabled = false;
    }
  });
}

// صفحة "حسابي" جوه لوحات المطعم والمندوب والموظفين (عشان ميحتاجوش يدخلوا تطبيق العملاء)
export function renderAccountPanel(el, { backend, user, onBack }) {
  el.innerHTML = `
    ${onBack ? '<button class="back link" id="accountBack" type="button">→ رجوع</button>' : ''}
    <form class="panel narrow" id="profileForm">
      <h3>👤 بياناتي</h3>
      <p class="muted" dir="ltr">${esc(user.email)}</p>
      ${usernameField(user.username, true)}
      <label>الاسم<input name="name" required value="${esc(user.name)}"></label>
      <label>رقم الموبايل<input name="phone" type="tel" required pattern="01[0-9]{9}" value="${esc(user.phone)}" inputmode="numeric" dir="ltr"></label>
      <button class="btn primary block" type="submit">حفظ</button>
    </form>
    ${changePasswordForm()}
    <div class="narrow"><button class="btn block" type="button" id="accountLogout">🚪 تسجيل الخروج</button></div>`;
  el.querySelector('#accountBack')?.addEventListener('click', onBack);
  el.querySelector('#accountLogout').addEventListener('click', () => backend.signOut());
  el.querySelector('#profileForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    try {
      await backend.updateProfile(user.uid, { name: d.name.trim(), address: user.address || '', location: user.location });
      if (d.phone.trim() !== user.phone) await backend.claimIdentity(user, { username: user.username, phone: d.phone });
      toast('تم الحفظ ✅');
    } catch (err) {
      toast(errorMessage(err));
    }
  });
  bindChangePassword(el, backend);
}

// كل نوع حساب ليه لوحته؛ المطعم والمندوب والموظف مش بيستخدموا تطبيق العملاء
export function homeFor(user) {
  if (!user || user.banned || user.deleted) return null;
  if (user.role === 'restaurant' && user.restaurantId) return 'restaurant.html';
  if (user.role === 'driver') return 'delivery.html';
  if (user.role === 'staff') return 'admin.html';
  return null;
}

// للحسابات اللي اتعملت قبل أسماء المستخدمين: لازم يختاروا اسم مستخدم ويأكدوا رقمهم مرة واحدة
export function renderCompleteProfile(el, { backend, user }) {
  el.innerHTML = `
    <form class="auth-card panel" id="completeForm">
      <h2>كمّل بيانات حسابك 👋</h2>
      <p class="muted small center">اختار اسم مستخدم مميز ليك، عشان نعرف كل حساب بسهولة.</p>
      ${usernameField()}
      <label>رقم الموبايل<input name="phone" type="tel" required pattern="01[0-9]{9}" value="${esc(user.phone)}" inputmode="numeric" dir="ltr"></label>
      <p class="form-error" id="completeError" hidden></p>
      <button class="btn primary block" type="submit">حفظ</button>
      <button class="btn block" type="button" id="completeLogout">خروج</button>
    </form>`;
  el.querySelector('#completeLogout').addEventListener('click', () => backend.signOut());
  el.querySelector('#completeForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    const btn = e.target.querySelector('button[type=submit]');
    const errEl = el.querySelector('#completeError');
    btn.disabled = true;
    errEl.hidden = true;
    try {
      await backend.claimIdentity(user, { username: d.handle, phone: d.phone });
      toast('تم حفظ بياناتك ✅');
    } catch (err) {
      errEl.textContent = errorMessage(err);
      errEl.hidden = false;
      btn.disabled = false;
    }
  });
}

export { usernameField };

// حساب محظور أو محذوف: بيرجّع true لو رسم الشاشة (والصفحة توقف هنا)
export function renderBlocked(el, { backend, user }) {
  if (!user?.deleted && !user?.banned) return false;
  el.innerHTML = user.deleted ? `
    <div class="empty-state">
      <div class="big">🗑️</div>
      <h2>الحساب ده اتحذف</h2>
      <p class="muted">لو ده حصل بالغلط، كلّم إدارة أريفو.</p>
      <button class="btn" type="button" id="blockedLogout">خروج</button>
    </div>` : `
    <div class="empty-state">
      <div class="big">🚫</div>
      <h2>حسابك موقوف</h2>
      ${user.bannedReason ? `<p>السبب: ${esc(user.bannedReason)}</p>` : ''}
      <p class="muted">لو شايف إن ده غلط، ابعتلنا من خدمة العملاء.</p>
      <div class="row-actions center-row">
        <a class="btn primary" href="index.html#/support">🎧 خدمة العملاء</a>
        <button class="btn" type="button" id="blockedLogout">خروج</button>
      </div>
    </div>`;
  el.querySelector('#blockedLogout').addEventListener('click', () => backend.signOut());
  return true;
}

// اسم المستخدم وزرار الخروج في هيدر لوحات التحكم
// onAccount: بيفتح صفحة "حسابي" جوه اللوحة نفسها
export function renderDashNav(user, backend, onAccount) {
  const nav = document.getElementById('userNav');
  nav.innerHTML = user
    ? `<span class="muted small">${esc(user.name || user.email)}${user.username ? ` <b dir="ltr">@${esc(user.username)}</b>` : ''}</span>
       <button class="btn small" id="accountBtn" type="button" title="حسابي وكلمة السر" data-drawer-label="⚙️ حسابي وكلمة السر">⚙️</button><button class="btn small" id="logoutBtn" type="button" data-drawer-label="🚪 خروج">خروج</button>`
    : '';
  if (!user) return;
  nav.querySelector('#logoutBtn').addEventListener('click', () => backend.signOut());
  nav.querySelector('#accountBtn').addEventListener('click', () => onAccount?.());
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
        👤 ${esc(o.customerName)}${o.customerUsername ? ` <span class="uname">@${esc(o.customerUsername)}</span>` : ''} • <a href="tel:${esc(o.customerPhone)}" dir="ltr">${esc(o.customerPhone)}</a><br>
        📍 ${o.zoneName ? `<b>${esc(o.zoneName)}</b> — ` : ''}${esc(o.address)} ${map ? `<a href="${map}" target="_blank" rel="noopener">(الخريطة)</a>` : ''}
      </div>
      ${o.driverUid ? `<div class="driver-tag small">🛵 المندوب: ${esc(o.driverName)}${o.driverUsername ? ` <span class="uname">@${esc(o.driverUsername)}</span>` : ''} • <a href="tel:${esc(o.driverPhone)}" dir="ltr">${esc(o.driverPhone)}</a></div>`
        : ['preparing', 'ready'].includes(o.status) ? '<div class="driver-tag waiting small">⏳ مستني مندوب ياخده</div>' : ''}
      <footer>
        <strong>${fmt(o.totals.total)}</strong>
        <span class="small muted">${paymentLabel(o.payment)}</span>
      </footer>
      ${actions.length ? `<div class="order-actions">
        ${actions.map((a) => `<button class="btn small ${a.cls || ''}" data-id="${o.id}" data-status="${a.status}" type="button">${a.label}</button>`).join('')}
      </div>` : ''}
    </article>`;
}

// كروت "اشتغل معانا" (في الرئيسية وصفحة #/join)
export const JOIN_LINKS = { restaurant: 'restaurant.html?join=1', driver: 'delivery.html?join=1' };
export const joinCards = () => `
  <section class="join-section" id="join">
    <h2>🤝 اشتغل مع أريفو</h2>
    <p class="muted">عندك مطعم أو عايز تشتغل مندوب؟ سجّل في دقيقة وفريقنا هيراجع طلبك.</p>
    <div class="join-cards">
      <a class="join-card" href="${JOIN_LINKS.restaurant}">
        <span class="join-icon">🏪</span>
        <b>سجّل مطعمك</b>
        <ul><li>عملاء جداد في منطقتك</li><li>الطلبات بتوصلك لحظيًا بصوت تنبيه</li><li>تتحكم في المنيو والأسعار والعروض بنفسك</li></ul>
        <span class="btn primary">ابدأ دلوقتي ←</span>
      </a>
      <a class="join-card" href="${JOIN_LINKS.driver}">
        <span class="join-icon">🛵</span>
        <b>اشتغل مندوب معانا</b>
        <ul><li>اشتغل في الوقت اللي يناسبك</li><li>اختار الأوردرات اللي تناسبك</li><li>تابع مكسبك أول بأول</li></ul>
        <span class="btn primary">قدّم دلوقتي ←</span>
      </a>
    </div>
  </section>`;
