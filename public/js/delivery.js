// صفحة المندوب: الأوردرات المتاحة، استلامها من المطعم وتوصيلها، وحساب أرباحه
import { backend, isDemo } from './backend/index.js';
import { ORDER_STATUSES, FINAL_STATUSES } from './data.js';
import { orderSplit, sum } from './finance.js';
import {
  esc, fmt, toast, errorMessage, beep, loader, demoBanner, isToday, shortId, timeAgo, mapLink,
  renderAuthForm, renderDashNav, paymentLabel,
} from './ui.js';

const root = document.getElementById('app');
const baseTitle = document.title;
let user;
let available = [];
let mine = [];
let tab = 'available';
let unsubs = [];
let knownAvailable = null;

function stop() {
  unsubs.forEach((u) => u());
  unsubs = [];
  available = [];
  mine = [];
  knownAvailable = null;
}

function start() {
  stop();
  renderDashNav(user, backend);
  if (!user) {
    root.innerHTML = `${demoBanner(isDemo)}<div id="authBox"></div>`;
    renderAuthForm(document.getElementById('authBox'), { backend, isDemo, title: 'دخول المندوبين' });
    return;
  }
  if (user.role !== 'driver') {
    root.innerHTML = `
      <div class="empty-state">
        <div class="big">🛵</div>
        <h2>الحساب ده مش متسجل كمندوب</h2>
        <p class="muted">ابعت إيميلك (<span dir="ltr">${esc(user.email)}</span>) للأدمن عشان يضيفك كمندوب.</p>
        <a href="index.html" class="btn">الرجوع للتطبيق</a>
      </div>`;
    return;
  }
  root.innerHTML = `${demoBanner(isDemo)}<div class="tabs" id="tabs"></div><div id="tabBody">${loader()}</div>`;
  drawTabs();
  unsubs.push(backend.watchAvailableOrders((list) => {
    available = list;
    alertNew();
    drawTabs();
    if (tab === 'available') drawTab();
  }));
  unsubs.push(backend.watchOrders({ driverUid: user.uid }, (list) => {
    mine = list;
    drawTabs();
    if (tab !== 'available') drawTab();
  }));
}

function alertNew() {
  const ids = new Set(available.map((o) => o.id));
  const fresh = knownAvailable ? [...ids].filter((id) => !knownAvailable.has(id)) : [];
  knownAvailable = ids;
  document.title = ids.size ? `(${ids.size}) أوردرات متاحة - ${baseTitle}` : baseTitle;
  if (fresh.length) {
    beep();
    toast('🔔 فيه أوردر جديد متاح!');
  }
}

const active = () => mine.filter((o) => !FINAL_STATUSES.includes(o.status));

function drawTabs() {
  const el = document.getElementById('tabs');
  if (!el) return;
  const badge = (n) => (n ? ` <span class="badge static">${n}</span>` : '');
  el.innerHTML = [
    ['available', `📋 أوردرات متاحة${badge(available.length)}`],
    ['active', `🛵 أوردراتي الحالية${badge(active().length)}`],
    ['history', '💰 حسابي'],
  ].map(([k, l]) => `<button type="button" data-tab="${k}" class="${tab === k ? 'active' : ''}">${l}</button>`).join('');
  el.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => {
    tab = b.dataset.tab;
    drawTabs();
    drawTab();
  }));
}

function drawTab() {
  const body = document.getElementById('tabBody');
  if (!body) return;
  if (tab === 'available') drawAvailable(body);
  else if (tab === 'active') drawActive(body);
  else drawHistory(body);
}

// مكان الاستلام والتسليم والفلوس
function tripCard(o, actions) {
  const s = orderSplit(o);
  const pickupMap = mapLink(o.restaurantLocation);
  const dropMap = mapLink(o.location);
  const claimed = o.driverUid === user.uid;
  return `
    <article class="trip-card status-${o.status}">
      <header>
        <strong>أوردر #${shortId(o.id)}</strong>
        <span class="status ${o.status}">${ORDER_STATUSES[o.status].icon} ${ORDER_STATUSES[o.status].label}</span>
      </header>
      <div class="trip-stop">
        <span class="stop-dot pickup">استلام</span>
        <div>
          <b>${esc(o.restaurantEmoji)} ${esc(o.restaurantName)}</b>
          <div class="small">${esc(o.restaurantAddress || 'العنوان مش متسجل')}</div>
          <div class="small row-actions">
            ${pickupMap ? `<a href="${pickupMap}" target="_blank" rel="noopener">🗺️ افتح الخريطة</a>` : ''}
            ${claimed && o.restaurantPhone ? `<a href="tel:${esc(o.restaurantPhone)}">📞 كلّم المطعم</a>` : ''}
          </div>
        </div>
      </div>
      <div class="trip-stop">
        <span class="stop-dot drop">تسليم</span>
        <div>
          <b>${esc(o.zoneName || '')}</b>
          <div class="small">${esc(o.address)}</div>
          <div class="small row-actions">
            ${dropMap ? `<a href="${dropMap}" target="_blank" rel="noopener">🗺️ افتح الخريطة</a>` : ''}
            ${claimed ? `<span>👤 ${esc(o.customerName)}</span> <a href="tel:${esc(o.customerPhone)}" dir="ltr">📞 ${esc(o.customerPhone)}</a>` : ''}
          </div>
        </div>
      </div>
      <ul class="order-lines small">${o.lines.map((l) => `<li><b>${l.qty}×</b> ${esc(l.name)}</li>`).join('')}</ul>
      ${o.notes ? `<p class="note small">📝 ${esc(o.notes)}</p>` : ''}
      <div class="money">
        <div><span>تحصّل من العميل</span><b>${s.cash ? fmt(s.cash) : 'مدفوع (' + paymentLabel(o.payment) + ')'}</b></div>
        ${s.payRestaurant ? `<div><span>تدفع للمطعم</span><b>${fmt(s.payRestaurant)}</b></div>` : ''}
        <div class="earn"><span>مكسبك</span><b>${fmt(s.driver)}</b></div>
      </div>
      <div class="order-actions">${actions}</div>
    </article>`;
}

function drawAvailable(body) {
  if (!available.length) {
    body.innerHTML = '<div class="empty-state"><div class="big">☕</div><h2>مفيش أوردرات متاحة دلوقتي</h2><p class="muted">أول ما مطعم يقبل أوردر هيظهر هنا بصوت تنبيه.</p></div>';
    return;
  }
  body.innerHTML = `<div class="trips">${available.map((o) => tripCard(o,
    `<button class="btn primary" data-claim="${o.id}" type="button">✋ هاخد الأوردر ده</button>`)).join('')}</div>`;
  body.querySelectorAll('[data-claim]').forEach((b) => b.addEventListener('click', async () => {
    b.disabled = true;
    try {
      await backend.claimOrder(b.dataset.claim, user);
      toast('الأوردر بقى معاك ✅ روح استلمه من المطعم');
      tab = 'active';
      drawTabs();
      drawTab();
    } catch (err) {
      toast(err.code === 'permission-denied' ? errorMessage({ code: 'order-taken' }) : errorMessage(err));
      b.disabled = false;
    }
  }));
}

function drawActive(body) {
  const list = active();
  if (!list.length) {
    body.innerHTML = '<div class="empty-state"><div class="big">🛵</div><h2>مفيش أوردرات معاك دلوقتي</h2><p class="muted">خد أوردر من "أوردرات متاحة".</p></div>';
    return;
  }
  const actions = (o) => {
    if (o.status === 'preparing') {
      return `<p class="muted small grow">⏳ المطعم لسه بيجهّز الأوردر</p>
        <button class="btn small danger-outline" data-release="${o.id}" type="button">مش هقدر آخده</button>`;
    }
    if (o.status === 'ready') {
      return `<button class="btn primary" data-status="on_way" data-id="${o.id}" type="button">📦 استلمت الأوردر من المطعم</button>
        <button class="btn small danger-outline" data-release="${o.id}" type="button">مش هقدر آخده</button>`;
    }
    if (o.status === 'on_way') return `<button class="btn primary" data-status="delivered" data-id="${o.id}" type="button">✅ تم التوصيل للعميل</button>`;
    return '';
  };
  body.innerHTML = `<div class="trips">${list.map((o) => tripCard(o, actions(o))).join('')}</div>`;
  body.querySelectorAll('[data-status]').forEach((b) => b.addEventListener('click', async () => {
    if (b.dataset.status === 'delivered' && !confirm('اتأكدت إن العميل استلم الأوردر؟')) return;
    b.disabled = true;
    try {
      await backend.setOrderStatus(b.dataset.id, b.dataset.status);
      toast(b.dataset.status === 'delivered' ? 'تمام! اتسجل التوصيل 🎉' : 'في الطريق للعميل 🛵');
    } catch (err) {
      toast(errorMessage(err));
      b.disabled = false;
    }
  }));
  body.querySelectorAll('[data-release]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm('هترجّع الأوردر لباقي المندوبين؟')) return;
    try {
      await backend.releaseOrder(b.dataset.release);
      toast('الأوردر رجع للمتاح');
    } catch (err) {
      toast(errorMessage(err));
    }
  }));
}

function drawHistory(body) {
  const delivered = mine.filter((o) => o.status === 'delivered');
  const today = delivered.filter((o) => isToday(o.createdAt));
  const owes = sum(delivered, (o) => orderSplit(o).driverOwes);
  body.innerHTML = `
    <div class="stats">
      <div class="stat"><span>أوردرات النهارده</span><strong>${today.length}</strong></div>
      <div class="stat"><span>مكسبك النهارده</span><strong>${fmt(sum(today, (o) => orderSplit(o).driver))}</strong></div>
      <div class="stat"><span>كل أوردراتك</span><strong>${delivered.length}</strong></div>
      <div class="stat"><span>إجمالي مكسبك</span><strong>${fmt(sum(delivered, (o) => orderSplit(o).driver))}</strong></div>
      <div class="stat"><span>${owes >= 0 ? 'كاش عليك للمنصة' : 'المنصة عليها ليك'}</span><strong>${fmt(Math.abs(owes))}</strong></div>
    </div>
    <section class="panel">
      <h3>الأوردرات اللي وصّلتها</h3>
      ${delivered.length ? `<div class="table-wrap"><table class="table">
        <thead><tr><th>رقم الأوردر</th><th>الوقت</th><th>من</th><th>إلى</th><th>حصّلت</th><th>مكسبك</th></tr></thead>
        <tbody>${delivered.map((o) => {
          const s = orderSplit(o);
          return `<tr><td><b>#${shortId(o.id)}</b></td><td class="small">${timeAgo(o.createdAt)}</td>
            <td>${esc(o.restaurantName)}</td><td>${esc(o.zoneName || '')}</td>
            <td>${fmt(s.cash)}</td><td><b>${fmt(s.driver)}</b></td></tr>`;
        }).join('')}</tbody></table></div>` : '<p class="muted small">لسه موصّلتش أوردرات.</p>'}
    </section>`;
}

// تحديث "من كام دقيقة" كل دقيقة
setInterval(() => { if (user?.role === 'driver' && tab === 'history') drawTab(); }, 60000);

backend.onAuth((u) => {
  if (JSON.stringify(u) === JSON.stringify(user)) return;
  user = u;
  start();
});
