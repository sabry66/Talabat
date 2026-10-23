// صفحة المندوب: الأوردرات المتاحة، استلامها من المطعم وتوصيلها، وحساب أرباحه
import { backend, isDemo } from './backend/index.js';
import { ORDER_STATUSES, FINAL_STATUSES } from './data.js';
import { alarm, notify, notifyButton, bindNotifyButton } from './notify.js';
import { isScheduled, whenLabel } from './schedule.js';
import { orderSplit, sum, missingItems, missingRefund, paidTotal } from './finance.js';
import { renderJoin } from './join.js';
import { renderSupport } from './support.js';
import {
  esc, fmt, toast, errorMessage, loader, demoBanner, isToday, shortId, timeAgo, mapLink,
  renderAuthForm, lineOptions, renderDashNav, renderCompleteProfile, renderAcceptTerms, needsTerms, renderBlocked, renderAccountPanel, homeFor, paymentLabel,
} from './ui.js';

const root = document.getElementById('app');
const baseTitle = document.title;
let user;
let available = [];
let mine = [];
let tab = 'available';
let unsubs = [];
let knownAvailable = null;
let supportUnsub = null;
let maxOrders = 0; // أقصى عدد أوردرات معاه في نفس الوقت (من إعدادات الأدمن)
let syncTimer = null;

function stop() {
  clearTimeout(syncTimer);
  unsubs.forEach((u) => u());
  unsubs = [];
  if (supportUnsub) supportUnsub();
  supportUnsub = null;
  available = [];
  mine = [];
  knownAvailable = null;
}

function start() {
  stop();
  // لو الحساب ده ليه لوحة تانية (مثلًا مندوب فتح صفحة المطاعم) نوديه لوحته
  const panel = homeFor(user);
  if (panel && panel !== 'delivery.html') { location.replace(panel); return; }
  renderDashNav(user, backend, openAccount);
  if (!user) {
    root.innerHTML = `${demoBanner(isDemo)}<div id="authBox"></div>`;
    renderAuthForm(document.getElementById('authBox'), { backend, isDemo, mode: new URLSearchParams(location.search).has('join') ? 'register' : 'login', title: 'المندوبين: سجّل دخول أو اعمل حساب جديد عشان تقدّم' });
    return;
  }
  if (renderBlocked(root, { backend, user })) return;
  if (!user.username) {
    root.innerHTML = '<div id="completeBox"></div>';
    renderCompleteProfile(document.getElementById('completeBox'), { backend, user });
    return;
  }
  if (needsTerms(user)) {
    root.innerHTML = '<div id="termsBox"></div>';
    renderAcceptTerms(document.getElementById('termsBox'), { backend, user });
    return;
  }
  if (user.role !== 'driver') {
    root.innerHTML = `${demoBanner(isDemo)}<div id="joinBox"></div>`;
    unsubs.push(renderJoin(document.getElementById('joinBox'), { backend, user, type: 'driver' }));
    return;
  }
  root.innerHTML = `${demoBanner(isDemo)}<div class="tabs" id="tabs"></div><div id="tabBody">${loader()}</div>`;
  drawTabs();
  unsubs.push(backend.watchAvailableOrders((list) => {
    available = list.filter((o) => o.customerUid !== user.uid); // مينفعش يوصّل طلبه هو
    alertNew();
    drawTabs();
    if (tab === 'available') drawTab();
  }));
  unsubs.push(backend.watchOrders({ driverUid: user.uid }, (list) => {
    mine = list;
    drawTabs();
    if (tab === 'active' || tab === 'history' || tab === 'available') drawTab();
    // نظبط لستة الأوردرات اللي معاه (لو الأدمن لغى أو غيّر أوردر كان معاه)
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => backend.syncDriverLoad(user.uid, active().map((o) => o.id)).catch(console.error), 1500);
  }));
  unsubs.push(backend.watchSettings((s) => {
    maxOrders = s.maxDriverOrders;
    if (tab === 'available') drawTab();
  }));
}

function alertNew() {
  const ids = new Set(available.map((o) => o.id));
  const fresh = knownAvailable ? [...ids].filter((id) => !knownAvailable.has(id)) : [];
  knownAvailable = ids;
  document.title = ids.size ? `(${ids.size}) أوردرات متاحة - ${baseTitle}` : baseTitle;
  if (fresh.length) {
    alarm();
    toast('🔔 فيه أوردر جديد متاح!');
    notify('🛵 أوردر جديد متاح', fresh.length > 1 ? `${fresh.length} أوردرات جديدة مستنية مندوب` : 'فيه أوردر جديد مستني مندوب، الحق خده', { tag: 'available', url: `${location.origin}/delivery.html` });
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
    ['support', '🎧 الدعم'],
  ].map(([k, l]) => `<button type="button" data-tab="${k}" class="${tab === k ? 'active' : ''}">${l}</button>`).join('');
  el.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => {
    tab = b.dataset.tab;
    drawTabs();
    drawTab();
  }));
}

// صفحة "حسابي" جوه اللوحة
function openAccount() {
  if (!document.getElementById('tabBody')) {
    renderAccountPanel(root, { backend, user, onBack: start });
    return;
  }
  tab = 'account';
  drawTabs();
  drawTab();
}

function drawTab() {
  const body = document.getElementById('tabBody');
  if (!body) return;
  if (supportUnsub) supportUnsub();
  supportUnsub = null;
  if (tab === 'account') renderAccountPanel(body, { backend, user, onBack: () => { tab = 'available'; drawTabs(); drawTab(); } });
  else if (tab === 'available') drawAvailable(body);
  else if (tab === 'active') drawActive(body);
  else if (tab === 'support') supportUnsub = renderSupport(body, { backend, user });
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
      ${isScheduled(o) ? `<p class="sched-tag">⏰ <b>مجدول:</b> سلّمه للعميل ${whenLabel(o.scheduledFor)}</p>` : ''}
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
      <ul class="order-lines small">${o.lines.map((l) => `<li><b>${l.qty}×</b> ${esc(l.name)}${lineOptions(l)}</li>`).join('')}</ul>
      ${o.notes ? `<p class="note small">📝 ${esc(o.notes)}</p>` : ''}
      ${claimed && o.missing ? missingBox(o) : ''}
      <div class="money">
        <div><span>تحصّل من العميل</span><b>${s.cash ? fmt(s.cash) : o.payment === 'card' ? `💳 ${fmt(paidTotal(o))} بالماكينة`
          : o.payment === 'wallet' ? `📱 ${fmt(paidTotal(o))} تحويل` : `مدفوع (${paymentLabel(o.payment)})`}</b></div>
        ${o.payment === 'wallet' && o.status !== 'delivered' ? '<p class="note small">📱 العميل هيحوّل على حساب المنصة. اتأكد من رسالة التحويل على موبايله (المبلغ والوقت) قبل ما تسلّم.</p>' : ''}
        ${s.payRestaurant ? `<div><span>تدفع للمطعم</span><b>${fmt(s.payRestaurant)}</b></div>` : ''}
        <div class="earn"><span>مكسبك</span><b>${fmt(s.driver)}</b></div>
      </div>
      <div class="order-actions">${actions}</div>
    </article>`;
}

// العميل بلّغ إن فيه أصناف ناقصة وقت الاستلام
function missingBox(o) {
  const list = missingItems(o).map((x) => `<li><b>${x.qty}×</b> ${esc(x.name)} — ${fmt(x.amount)}</li>`).join('');
  if (o.missingDecision === 'confirmed') return `<div class="review-box ok small">✅ أكدت الناقص — اترجع للعميل ${fmt(missingRefund(o))}</div>`;
  if (o.missingDecision === 'disputed') return '<div class="review-box warn-box small">⚠️ اعترضت — خدمة العملاء هتراجع</div>';
  return `
    <div class="review-box warn-box">
      <b>⚠️ العميل بيقول إن فيه ناقص:</b>
      <ul class="order-lines small">${list}</ul>
      <p class="small">لو فعلًا ناقص: حصّل <b>${fmt(o.totals.total - missingRefund(o))}</b> بدل ${fmt(o.totals.total)}، والخصم بيتحسب على المطعم مش عليك.</p>
      <div class="order-actions">
        <button class="btn small primary" data-missing="confirmed" data-id="${o.id}" type="button">✅ فعلًا ناقص</button>
        <button class="btn small danger-outline" data-missing="disputed" data-id="${o.id}" type="button">❌ الطلب كامل</button>
      </div>
    </div>`;
}

function drawAvailable(body) {
  const n = active().length;
  const full = maxOrders > 0 && n >= maxOrders;
  const loadBar = maxOrders > 0 ? `
    <div class="load-bar ${full ? 'full' : ''}">
      <span>🛵 معاك <b>${n}</b> من <b>${maxOrders}</b> أوردرات</span>
      <span class="load-dots">${Array.from({ length: maxOrders }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</span>
      ${full ? '<small>وصلت للحد. وصّل الأوردرات اللي معاك الأول وبعدين تقدر تاخد جديد.</small>' : ''}
    </div>` : '';
  if (!available.length) {
    body.innerHTML = `${loadBar}${notifyButton()}<div class="empty-state"><div class="big">☕</div><h2>مفيش أوردرات متاحة دلوقتي</h2><p class="muted">أول ما مطعم يقبل أوردر هيظهر هنا بصوت تنبيه.</p></div>`;
    bindNotifyButton(body, drawTab);
    return;
  }
  body.innerHTML = `${loadBar}${notifyButton()}<div class="trips">${available.map((o) => tripCard(o,
    `<button class="btn primary" data-claim="${o.id}" type="button" ${full ? 'disabled' : ''}>${full ? '🔒 وصّل اللي معاك الأول' : '✋ هاخد الأوردر ده'}</button>`)).join('')}</div>`;
  bindNotifyButton(body, drawTab);
  body.querySelectorAll('[data-claim]').forEach((b) => b.addEventListener('click', async () => {
    b.disabled = true;
    try {
      await backend.claimOrder(b.dataset.claim, user, maxOrders);
      toast('الأوردر بقى معاك ✅ روح استلمه من المطعم');
      tab = 'active';
      drawTabs();
      drawTab();
    } catch (err) {
      toast(errorMessage(err.code === 'permission-denied' ? { code: 'order-taken' } : err));
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
    if (o.status === 'on_way') {
      const pending = o.missing && !o.missingDecision;
      return `<button class="btn primary" data-status="delivered" data-id="${o.id}" type="button" ${pending ? 'disabled' : ''}>${pending ? '⏳ رد على بلاغ الناقص الأول' : '✅ تم التوصيل للعميل'}</button>`;
    }
    return '';
  };
  body.innerHTML = `<div class="trips">${list.map((o) => tripCard(o, actions(o))).join('')}</div>`;
  body.querySelectorAll('[data-status]').forEach((b) => b.addEventListener('click', async () => {
    if (b.dataset.status === 'delivered' && !confirm('اتأكدت إن العميل استلم الأوردر؟')) return;
    b.disabled = true;
    try {
      await backend.setOrderStatus(b.dataset.id, b.dataset.status, { driverUid: user.uid });
      toast(b.dataset.status === 'delivered' ? 'تمام! اتسجل التوصيل 🎉' : 'في الطريق للعميل 🛵');
    } catch (err) {
      toast(errorMessage(err));
      b.disabled = false;
    }
  }));
  body.querySelectorAll('[data-missing]').forEach((b) => b.addEventListener('click', async () => {
    const yes = b.dataset.missing === 'confirmed';
    if (!confirm(yes ? 'اتأكدت إن الأصناف دي ناقصة فعلًا؟ هتتخصم من الحساب.' : 'متأكد إن الطلب كامل؟ خدمة العملاء هتراجع الموضوع.')) return;
    b.disabled = true;
    try {
      await backend.decideMissing(b.dataset.id, b.dataset.missing);
      toast(yes ? 'تمام، اتخصم الناقص ✅' : 'اتسجل اعتراضك');
    } catch (err) {
      toast(errorMessage(err));
      b.disabled = false;
    }
  }));
  body.querySelectorAll('[data-release]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm('هترجّع الأوردر لباقي المندوبين؟')) return;
    try {
      await backend.releaseOrder(b.dataset.release, user.uid);
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
