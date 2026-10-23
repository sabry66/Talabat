// لوحة صاحب المطعم: استقبال الطلبات لحظيًا وتغيير حالتها، وتعديل المنيو
import { backend, isDemo } from './backend/index.js';
import { ORDER_STATUSES, FINAL_STATUSES } from './data.js';
import { renderMenuEditor } from './menu-editor.js';
import { alarm, notify, notifyButton, bindNotifyButton } from './notify.js';
import { BUSY_OPTIONS, BUSY_FOR, busyExtra } from './busy.js';
import { renderOffersEditor } from './offers-editor.js';
import { orderSplit, sum, missingItems, missingValue, activeZones } from './finance.js';
import { renderJoin } from './join.js';
import { priceProblems } from './price-check.js';
import { renderSupport } from './support.js';
import { ratingOf, stars } from './ratings.js';
import {
  esc, fmt, toast, errorMessage, loader, demoBanner, isToday, timeAgo, shortId,
  renderAuthForm, renderDashNav, renderCompleteProfile, renderAcceptTerms, needsTerms, renderBlocked, renderAccountPanel, homeFor, orderCard, restaurantLogo,
} from './ui.js';

const root = document.getElementById('app');
const baseTitle = document.title;
let user;
let restaurant = null;
let settings = null; // المناطق (عشان المطعم يختار بيوصّل لفين)
let orders = [];
let tab = 'orders';
let unsubs = [];
let knownNew = null;
let supportUnsub = null;
const packed = {}; // orderId → Set بأرقام الأصناف اللي اتجهزت (قايمة المراجعة قبل "جاهز")

const NEXT_ACTIONS = {
  placed: [
    { status: 'preparing', label: '✅ قبول وابدأ التحضير', cls: 'primary' },
    { status: 'rejected', label: 'رفض', cls: 'danger-outline' },
  ],
  preparing: [{ status: 'ready', label: '📦 تم التجهيز - جاهز للتسليم', cls: 'primary' }],
};

function stop() {
  unsubs.forEach((u) => u());
  unsubs = [];
  if (supportUnsub) supportUnsub();
  supportUnsub = null;
  restaurant = null;
  orders = [];
  knownNew = null;
}

function start() {
  stop();
  // لو الحساب ده ليه لوحة تانية (مثلًا مندوب فتح صفحة المطاعم) نوديه لوحته
  const panel = homeFor(user);
  if (panel && panel !== 'restaurant.html') { location.replace(panel); return; }
  renderDashNav(user, backend, openAccount);
  if (!user) {
    root.innerHTML = `${demoBanner(isDemo)}<div id="authBox"></div>`;
    renderAuthForm(document.getElementById('authBox'), { backend, isDemo, mode: new URLSearchParams(location.search).has('join') ? 'register' : 'login', title: 'أصحاب المطاعم: سجّل دخول أو اعمل حساب جديد عشان تسجّل مطعمك' });
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
  if (!user.restaurantId) {
    root.innerHTML = `${demoBanner(isDemo)}<div id="joinBox"></div>`;
    unsubs.push(renderJoin(document.getElementById('joinBox'), { backend, user, type: 'restaurant' }));
    return;
  }
  root.innerHTML = loader();
  unsubs.push(backend.watchSettings((s) => { settings = s; }));
  unsubs.push(backend.watchRestaurant(user.restaurantId, (r) => {
    const first = !restaurant;
    restaurant = r;
    if (!r) {
      root.innerHTML = '<div class="empty-state"><h2>المطعم ده اتحذف</h2></div>';
      return;
    }
    // ما نعيدش رسم المحرر وصاحب المطعم بيعدّل
    if (first) render();
    else drawHead();
  }));
  unsubs.push(backend.watchOrders({ ownerUid: user.uid }, (list) => {
    orders = list.filter((o) => o.restaurantId === user.restaurantId);
    alertNewOrders();
    if (restaurant) {
      drawTabs();
      if (tab === 'orders') drawOrders();
    }
  }));
}

function alertNewOrders() {
  const ids = new Set(orders.filter((o) => o.status === 'placed').map((o) => o.id));
  const fresh = knownNew ? [...ids].filter((id) => !knownNew.has(id)) : [];
  knownNew = ids;
  document.title = ids.size ? `(${ids.size}) طلبات جديدة - ${baseTitle}` : baseTitle;
  if (fresh.length) {
    alarm();
    notify('🔔 طلب جديد', fresh.length > 1 ? `وصلك ${fresh.length} طلبات جديدة` : 'وصلك طلب جديد، اقبله بسرعة', { tag: 'new-orders', url: `${location.origin}/restaurant.html` });
    toast(`🔔 وصلك ${fresh.length > 1 ? `${fresh.length} طلبات جديدة` : 'طلب جديد'}!`);
  }
}

function render() {
  root.innerHTML = `
    ${demoBanner(isDemo)}
    <div id="dashHead"></div>
    <div class="tabs" id="tabs"></div>
    <div id="tabBody"></div>`;
  drawHead();
  drawTabs();
  drawTab();
}

let busyTimer = null;

// وضع الزحمة بضغطة: يزوّد الوقت اللي العملاء بيشوفوه لمدة ساعة
function busyBar(r) {
  const extra = busyExtra(r);
  if (extra) {
    const until = new Date(Number(r.busy.until)).toLocaleTimeString('ar-EG', { hour: 'numeric', minute: '2-digit' });
    return `<div class="busy-bar on">🐢 <b>وضع الزحمة شغال:</b> الوقت زايد ${extra} دقيقة لحد ${until}
      <button class="btn small" data-busy="0" type="button">✅ رجّع الوقت العادي</button></div>`;
  }
  return `<div class="busy-bar">🐢 عليك زحمة؟ زوّد الوقت ساعة:
    ${BUSY_OPTIONS.map((m) => `<button class="btn small" data-busy="${m}" type="button">+${m} د</button>`).join('')}</div>`;
}

function drawHead() {
  const r = restaurant;
  const open = r.isOpen !== false;
  document.getElementById('dashHead').innerHTML = `
    <section class="dash-head" style="background:${esc(r.color)}">
      <div class="rest-emoji sm">${restaurantLogo(r, 64)}</div>
      <div class="grow">
        <h1>${esc(r.name)}</h1>
        ${r.blocked ? '<span class="status cancelled">⛔ موقوف من الإدارة</span>'
          : `<span class="status ${open ? 'delivered' : 'cancelled'}">${open ? '🟢 مفتوح ويستقبل طلبات' : '🔴 مغلق'}</span>`}
      </div>
      ${r.blocked ? '' : `<button class="btn ${open ? '' : 'primary'}" id="toggleOpen" type="button">${open ? 'اقفل المطعم' : 'افتح المطعم'}</button>`}
    </section>
    ${r.blocked ? '<p class="warn">⛔ المطعم موقوف من إدارة أريفو ومش ظاهر للعملاء. كلّم خدمة العملاء من تبويب "🎧 الدعم".</p>' : `${open ? busyBar(r) : ''}${notifyButton()}`}`;
  bindNotifyButton(document.getElementById('dashHead'), drawHead);
  document.querySelectorAll('[data-busy]').forEach((b) => b.addEventListener('click', async () => {
    const extra = Number(b.dataset.busy);
    b.disabled = true;
    try {
      await backend.updateRestaurant(r.id, { busy: extra ? { extra, until: Date.now() + BUSY_FOR } : null });
      toast(extra ? `🐢 العملاء هيشوفوا الوقت زايد ${extra} دقيقة لمدة ساعة` : 'رجعت للوقت العادي ✅');
    } catch (err) {
      toast(errorMessage(err));
      b.disabled = false;
    }
  }));
  // لما وقت الزحمة يخلص، الشريط يرجع لوحده
  clearTimeout(busyTimer);
  const left = busyExtra(r) ? Number(r.busy.until) - Date.now() : 0;
  if (left > 0) busyTimer = setTimeout(drawHead, Math.min(left + 500, 2 ** 31 - 1));
  document.getElementById('toggleOpen')?.addEventListener('click', async (e) => {
    e.target.disabled = true;
    try {
      await backend.updateRestaurant(r.id, { isOpen: !open });
    } catch (err) {
      toast(errorMessage(err));
      e.target.disabled = false;
    }
  });
}

function drawTabs() {
  const pending = orders.filter((o) => o.status === 'placed').length;
  const el = document.getElementById('tabs');
  el.innerHTML = `
    <button type="button" data-tab="orders" class="${tab === 'orders' ? 'active' : ''}">📋 الطلبات ${pending ? `<span class="badge static">${pending}</span>` : ''}</button>
    <button type="button" data-tab="menu" class="${tab === 'menu' ? 'active' : ''}">🍽️ المنيو والإعدادات</button>
    <button type="button" data-tab="offers" class="${tab === 'offers' ? 'active' : ''}">🏷️ العروض والخصومات</button>
    <button type="button" data-tab="reviews" class="${tab === 'reviews' ? 'active' : ''}">⭐ التقييمات</button>
    <button type="button" data-tab="support" class="${tab === 'support' ? 'active' : ''}">🎧 الدعم</button>`;
  el.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => {
    if (tab === b.dataset.tab) return;
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
  if (supportUnsub) supportUnsub();
  supportUnsub = null;
  if (tab === 'account') {
    renderAccountPanel(document.getElementById('tabBody'), { backend, user, onBack: () => { tab = 'orders'; drawTabs(); drawTab(); } });
    return;
  }
  if (tab === 'orders') return drawOrders();
  if (tab === 'support') {
    supportUnsub = renderSupport(document.getElementById('tabBody'), { backend, user });
    return;
  }
  if (tab === 'reviews') {
    const body = document.getElementById('tabBody');
    body.innerHTML = loader();
    supportUnsub = backend.watchRestaurantReviews(restaurant.id, (list) => drawReviews(body, list));
    return;
  }
  if (tab === 'offers') {
    renderOffersEditor(document.getElementById('tabBody'), restaurant, {
      onSave: async (changes) => {
        try {
          await backend.updateRestaurant(restaurant.id, changes);
        } catch (err) {
          throw new Error(errorMessage(err));
        }
        Object.assign(restaurant, JSON.parse(JSON.stringify(changes)));
        if (tab === 'offers') drawTab();
      },
    });
    return;
  }
  renderMenuEditor(document.getElementById('tabBody'), restaurant, {
    showOpenToggle: false,
    zones: () => (settings ? activeZones(settings) : []),
    onSave: async (data) => {
      try {
        await backend.updateRestaurant(restaurant.id, data);
        toast('تم حفظ التعديلات ✅');
      } catch (err) {
        toast(errorMessage(err));
        return false;
      }
    },
  });
}

// تقييمات العملاء لأكل المطعم
function drawReviews(body, list) {
  const { avg, count } = ratingOf({ ratingSum: list.reduce((a, x) => a + x.food, 0), ratingCount: list.length });
  const dist = [5, 4, 3, 2, 1].map((n) => ({ n, c: list.filter((x) => x.food === n).length }));
  body.innerHTML = list.length ? `
    <section class="panel">
      <div class="rating-summary">
        <div class="rating-big">${avg.toLocaleString('ar-EG')}<small class="muted"> من 5</small><div class="stars">${stars(Math.round(avg))}</div>
          <div class="muted small">${count.toLocaleString('ar-EG')} تقييم</div></div>
        <div class="rating-bars">${dist.map((d) => `<div class="bar-row"><span>${d.n} ★</span><span class="bar"><i style="width:${count ? Math.round((d.c / count) * 100) : 0}%"></i></span><span class="muted small">${d.c}</span></div>`).join('')}</div>
      </div>
    </section>
    <section class="panel">
      <h3>آراء العملاء</h3>
      ${list.map((x) => `
        <div class="review-row">
          <div class="review-head"><span class="stars">${stars(x.food)}</span> <b>${esc(x.name || 'عميل')}</b>
            <span class="muted small">${timeAgo(x.createdAt)} • طلب #${shortId(x.orderId)}</span></div>
          ${x.comment ? `<p>${esc(x.comment)}</p>` : '<p class="muted small">من غير تعليق</p>'}
        </div>`).join('')}
    </section>` : '<div class="empty-state"><div class="big">⭐</div><h2>لسه مفيش تقييمات</h2><p class="muted">بعد ما الطلبات تتوصل، العملاء بيقيّموا الأكل والتقييمات بتظهر هنا وعلى صفحة مطعمك.</p></div>';
}

function drawOrders() {
  const body = document.getElementById('tabBody');
  const empty = !restaurant.menu.some((sec) => sec.items.length);
  const today = orders.filter((o) => isToday(o.createdAt));
  const delivered = today.filter((o) => o.status === 'delivered');
  const column = (status, title) => {
    const list = orders.filter((o) => o.status === status).reverse();
    return `
      <section class="column">
        <h3>${title} <span class="count">${list.length}</span></h3>
        ${list.map((o) => orderCard(o, NEXT_ACTIONS[status], { checklist: status === 'preparing' ? (packed[o.id] ||= new Set()) : null, problems: priceProblems(o, restaurant) })).join('') || '<p class="muted small center">مفيش</p>'}
      </section>`;
  };
  const finished = orders.filter((o) => FINAL_STATUSES.includes(o.status)).slice(0, 20);

  body.innerHTML = `
    ${empty ? '<p class="warn">👋 أهلًا بيك في أريفو! ابدأ من "🍽️ المنيو والإعدادات": ضيف أصنافك وصورها ومكان المطعم على الخريطة، وبعدين اضغط "افتح المطعم". المطعم مش هيظهر للعملاء غير لما يبقى فيه أصناف.</p>' : ''}
    <div class="stats">
      <div class="stat"><span>طلبات النهارده</span><strong>${today.length}</strong></div>
      <div class="stat"><span>اتوصلت النهارده</span><strong>${delivered.length}</strong></div>
      <div class="stat"><span>مبيعات النهارده</span><strong>${fmt(sum(delivered, (o) => o.totals.subtotal - orderSplit(o).missing))}</strong></div>
      <div class="stat"><span>صافي ليك النهارده</span><strong>${fmt(sum(delivered, (o) => orderSplit(o).restaurant))}</strong></div>
    </div>
    <div class="board">
      ${column('placed', '🔔 طلبات جديدة')}
      ${column('preparing', '👨‍🍳 قيد التحضير')}
      ${column('ready', '📦 جاهز - مستني المندوب')}
      ${column('on_way', '🛵 مع المندوب')}
    </div>
    <section class="panel">
      <h3>آخر الطلبات المنتهية</h3>
      ${finished.length ? `<div class="table-wrap flat"><table class="table">
        <thead><tr><th>الطلب</th><th>العميل</th><th>تمن الأكل</th><th>الحالة</th><th>الوقت</th></tr></thead>
        <tbody>${finished.map((o) => `
          <tr><td>#${o.id.slice(-6).toUpperCase()}</td><td>${esc(o.customerName)}</td><td>${fmt(o.totals.subtotal - missingValue(o) * (o.missingDecision === 'confirmed' ? 1 : 0))}${o.missingDecision === 'confirmed' ? ` <span class="small warn-text" title="${missingItems(o).map((x) => `${x.qty}× ${esc(x.name)}`).join('، ')}">(ناقص اتخصم −${fmt(missingValue(o))})</span>` : o.missing ? ' <span class="small warn-text">⚠️ بلاغ ناقص</span>' : ''}</td>
          <td>${ORDER_STATUSES[o.status].icon} ${ORDER_STATUSES[o.status].label}</td>
          <td class="small">${new Date(o.createdAt).toLocaleString('ar-EG')}</td></tr>`).join('')}
        </tbody></table></div>` : '<p class="muted small">لسه مفيش.</p>'}
    </section>`;

  body.querySelectorAll('[data-pack]').forEach((c) => c.addEventListener('change', () => {
    const [id, i] = c.dataset.pack.split(':');
    const set = (packed[id] ||= new Set());
    if (c.checked) set.add(Number(i)); else set.delete(Number(i));
    drawOrders();
  }));
  body.querySelectorAll('[data-status]').forEach((b) => b.addEventListener('click', async () => {
    if (b.dataset.status === 'rejected' && !confirm('متأكد إنك عايز ترفض الطلب ده؟')) return;
    b.disabled = true;
    try {
      await backend.setOrderStatus(b.dataset.id, b.dataset.status);
    } catch (err) {
      toast(errorMessage(err));
      b.disabled = false;
    }
  }));
}

// تحديث "من كام دقيقة" كل دقيقة
setInterval(() => { if (restaurant && tab === 'orders') drawOrders(); }, 60000);

backend.onAuth((u) => {
  if (JSON.stringify(u) === JSON.stringify(user)) return;
  user = u;
  start();
});
