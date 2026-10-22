// لوحة الأدمن: الإحصائيات، الحسابات، المطاعم، المناطق والنسب، المندوبين، والطلبات
import { backend, isDemo } from './backend/index.js';
import { SEED_RESTAURANTS, NEW_RESTAURANT, ORDER_STATUSES, FINAL_STATUSES, SAMPLE_ZONES, CATEGORIES } from './data.js';
import { VEHICLES } from './join.js';
import { TICKET_TOPICS, ROLE_NAMES, thread, ticketStatus } from './support.js';
import { renderMenuEditor } from './menu-editor.js';
import { drawCoupons } from './admin-coupons.js';
import { matches, normalize } from './search.js';
import { orderSplit, sum, withDefaults, rateLabel, applyRate } from './finance.js';
import {
  esc, fmt, toast, errorMessage, loader, demoBanner, isToday, shortId,
  renderAuthForm, renderDashNav, renderCompleteProfile, renderAcceptTerms, needsTerms, renderAccountPanel, homeFor, statusBadge, restaurantLogo,
} from './ui.js';

const root = document.getElementById('app');
let user;
let restaurants = null;
let orders = null;
let settings = null;
let drivers = [];
let users = [];
let userQuery = '';
let usersRedraw = null;
let tickets = [];
let ticketFilter = 'open';
let openTicket = null;
let applications = [];
let tab = 'overview';
let editing = null; // id المطعم اللي بيتعدل، أو 'new'
let orderFilter = 'active';
let period = 'today';
let unsubs = [];
let settingsCreated = false;
let couponsUnsub = null; // متابعة الكوبونات بتشتغل بس وتبويب الكوبونات مفتوح

const TABS = [
  ['overview', '📊 نظرة عامة'],
  ['requests', '📥 طلبات الانضمام'],
  ['support', '🎧 الشكاوي'],
  ['finance', '💰 الحسابات'],
  ['restaurants', '🏪 المطاعم'],
  ['zones', '📍 المناطق والإعدادات'],
  ['coupons', '🎟️ الكوبونات'],
  ['drivers', '🛵 المندوبين'],
  ['users', '👥 المستخدمين'],
  ['orders', '📋 الطلبات'],
];

// الصفحات اللي فيها فورم، مش بنعيد رسمها لما البيانات تتغير عشان منمسحش اللي الأدمن بيكتبه
const isEditing = () => editing || tab === 'zones' || tab === 'coupons' || tab === 'account' || (tab === 'support' && openTicket);

function stop() {
  if (couponsUnsub) couponsUnsub();
  couponsUnsub = null;
  unsubs.forEach((u) => u());
  unsubs = [];
  restaurants = null;
  orders = null;
  settings = null;
  drivers = [];
  users = [];
  tickets = [];
  openTicket = null;
  applications = [];
  editing = null;
}

function start() {
  stop();
  // لو الحساب ده ليه لوحة تانية (مثلًا مندوب فتح صفحة المطاعم) نوديه لوحته
  const panel = homeFor(user);
  if (panel && panel !== 'admin.html') { location.replace(panel); return; }
  renderDashNav(user, backend, openAccount);
  if (!user) {
    root.innerHTML = `${demoBanner(isDemo)}<div id="authBox"></div>`;
    renderAuthForm(document.getElementById('authBox'), { backend, isDemo, title: 'دخول الأدمن' });
    return;
  }
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
  if (!['admin', 'staff'].includes(user.role)) {
    root.innerHTML = `
      <div class="empty-state">
        <div class="big">🔒</div>
        <h2>الصفحة دي للأدمن بس</h2>
        <p class="muted">لو إنت صاحب المنصة، شوف ملف SETUP.md (خطوة "خلّي حسابك أدمن").</p>
        <a href="index.html" class="btn">الرجوع للتطبيق</a>
      </div>`;
    return;
  }
  // الموظف: الشكاوي وطلبات الانضمام بس
  if (isStaff()) {
    document.querySelector('.dash-label').textContent = '🎧 لوحة خدمة العملاء';
    if (!STAFF_TABS.includes(tab)) tab = 'support';
  }
  root.innerHTML = `
    ${demoBanner(isDemo)}
    <div class="tabs" id="tabs"></div>
    <div id="tabBody">${loader()}</div>`;
  drawTabs();
  // تبويب المستخدمين: بنحدّث الجدول بس عشان خانة البحث متتمسحش والكيبورد ميقفلش وإنت بتكتب
  const refresh = () => { if (tab === 'users' && usersRedraw) usersRedraw(); else if (!isEditing()) drawTab(); };
  unsubs.push(backend.watchOrders({}, (list) => {
    orders = list;
    drawTabs();
    refresh();
  }));
  unsubs.push(backend.watchAllTickets((list) => {
    tickets = list;
    drawTabs();
    if (tab === 'support') drawSupport(document.getElementById('tabBody'));
  }));
  unsubs.push(backend.watchApplications((list) => {
    applications = list;
    drawTabs();
    refresh();
  }));
  if (isStaff()) return;
  unsubs.push(backend.watchRestaurants((list) => {
    restaurants = list.sort((a, b) => a.name.localeCompare(b.name, 'ar'));
    refresh();
  }));
  unsubs.push(backend.watchSettings((s) => {
    const first = settings === null;
    settings = s;
    // أول مرة: نعمل مستند الإعدادات بالقيم الافتراضية (لازم يكون موجود عشان الطلبات تشتغل)
    if (s.exists === false && !settingsCreated) {
      settingsCreated = true;
      backend.saveSettings(withDefaults()).catch((e) => toast(errorMessage(e)));
    }
    if (first || tab !== 'zones') refresh();
  }));
  unsubs.push(backend.watchUsers((list) => {
    users = list;
    drivers = list.filter((u) => u.role === 'driver');
    if (tab === 'users' && usersRedraw) usersRedraw();
    else refresh();
  }));
}

const STAFF_TABS = ['support', 'requests', 'account'];
const isStaff = () => user?.role === 'staff';

// شكاوي مستنية رد من الإدارة
const waitingTickets = () => tickets.filter((t) => t.status !== 'closed' && t.lastBy !== 'admin');

function drawTabs() {
  const active = (orders || []).filter((o) => !FINAL_STATUSES.includes(o.status)).length;
  const el = document.getElementById('tabs');
  if (!el) return;
  el.innerHTML = TABS.filter(([k]) => !isStaff() || STAFF_TABS.includes(k)).map(([k, l]) => `<button type="button" data-tab="${k}" class="${tab === k ? 'active' : ''}">${l}${
    k === 'orders' && active ? ` <span class="badge static">${active}</span>` : ''}${
    k === 'requests' && applications.length ? ` <span class="badge static">${applications.length}</span>` : ''}${
    k === 'support' && waitingTickets().length ? ` <span class="badge static">${waitingTickets().length}</span>` : ''}</button>`).join('');
  el.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => {
    tab = b.dataset.tab;
    editing = null;
    openTicket = null;
    usersRedraw = null;
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
  if (couponsUnsub) couponsUnsub();
  couponsUnsub = null;
  if (!orders || (!isStaff() && (!restaurants || !settings))) { body.innerHTML = loader(); return; }
  ({
    coupons: (b) => { couponsUnsub = drawCoupons(b, { backend, getSettings: () => settings, getOrders: () => orders }); },
    account: (b) => renderAccountPanel(b, { backend, user, onBack: () => { tab = isStaff() ? 'support' : 'overview'; drawTabs(); drawTab(); } }),
    overview: drawOverview, requests: drawRequests, support: drawSupport, finance: drawFinance, restaurants: drawRestaurants,
    zones: drawZones, drivers: drawDrivers, users: drawUsers, orders: drawOrders,
  })[tab](body);
}

// الاسم وجنبه اسم المستخدم
const who = (name, username) => `${esc(name || '—')}${username ? ` <span class="uname">@${esc(username)}</span>` : ''}`;

const inPeriod = (o) => {
  if (period === 'all') return true;
  if (period === 'today') return isToday(o.createdAt);
  const days = period === 'week' ? 7 : 30;
  return o.createdAt >= Date.now() - days * 86400000;
};

const periodChips = () => `
  <div class="chips">
    ${[['today', 'النهارده'], ['week', 'آخر 7 أيام'], ['month', 'آخر 30 يوم'], ['all', 'الكل']]
      .map(([k, l]) => `<button type="button" class="chip ${period === k ? 'active' : ''}" data-period="${k}">${l}</button>`).join('')}
  </div>`;

const bindPeriod = (body) => body.querySelectorAll('[data-period]').forEach((b) =>
  b.addEventListener('click', () => { period = b.dataset.period; drawTab(); }));

// ---------- نظرة عامة ----------

function drawOverview(body) {
  const today = orders.filter((o) => isToday(o.createdAt));
  const delivered = today.filter((o) => o.status === 'delivered');
  const active = orders.filter((o) => !FINAL_STATUSES.includes(o.status));
  const waitingDriver = active.filter((o) => !o.driverUid && ['preparing', 'ready'].includes(o.status));
  const open = restaurants.filter((r) => r.isOpen !== false).length;

  body.innerHTML = `
    <div class="stats">
      <div class="stat"><span>طلبات النهارده</span><strong>${today.length}</strong></div>
      <div class="stat"><span>مبيعات النهارده (اتوصلت)</span><strong>${fmt(sum(delivered, (o) => o.totals.total))}</strong></div>
      <div class="stat accent"><span>ربح المنصة النهارده</span><strong>${fmt(sum(delivered, (o) => orderSplit(o).platform))}</strong></div>
      <div class="stat"><span>طلبات شغالة دلوقتي</span><strong>${active.length}</strong></div>
      <div class="stat ${waitingDriver.length ? 'warn-stat' : ''}"><span>مستنية مندوب</span><strong>${waitingDriver.length}</strong></div>
      <div class="stat"><span>مطاعم مفتوحة</span><strong>${open} / ${restaurants.length}</strong></div>
      <div class="stat"><span>المندوبين</span><strong>${drivers.length}</strong></div>
    </div>
    ${waitingTickets().length ? `<p class="warn">🎧 فيه ${waitingTickets().length} شكوى مستنية ردك. روح "الشكاوي".</p>` : ''}
    ${applications.length ? `<p class="warn">📥 فيه ${applications.length} طلب انضمام مستني موافقتك. روح "طلبات الانضمام".</p>` : ''}
    ${!Object.keys(settings.zones).length ? '<p class="warn">⚠️ مفيش مناطق توصيل لسه، فالعملاء مش هيقدروا يطلبوا. روح "المناطق والنسب" وضيف مناطق.</p>' : ''}
    ${!drivers.length ? '<p class="warn">⚠️ مفيش مندوبين لسه. روح "المندوبين" وضيف مندوب بإيميله.</p>' : ''}
    <section class="panel">
      <h3>آخر الطلبات</h3>
      ${orders.slice(0, 8).map((o) => `
        <div class="mini-line"><span>#${shortId(o.id)} • ${esc(o.restaurantName)} ${o.driverName ? `• 🛵 ${who(o.driverName, o.driverUsername)}` : ''}</span>${statusBadge(o.status)}</div>`).join('') || '<p class="muted small">مفيش.</p>'}
    </section>`;
}

// ---------- الشكاوي ----------

function drawSupport(body) {
  const t = openTicket && tickets.find((x) => x.id === openTicket);
  if (t) return drawTicket(body, t);
  const filters = { open: 'المفتوحة', waiting: 'مستنية ردك', all: 'الكل' };
  const list = tickets.filter((x) => ticketFilter === 'all' ? true
    : ticketFilter === 'waiting' ? x.status !== 'closed' && x.lastBy !== 'admin' : x.status !== 'closed');
  body.innerHTML = `
    <div class="list-head">
      <h2>${list.length} شكوى</h2>
      <div class="chips">${Object.entries(filters).map(([k, l]) =>
        `<button type="button" class="chip ${ticketFilter === k ? 'active' : ''}" data-tfilter="${k}">${l}</button>`).join('')}</div>
    </div>
    ${list.length ? `<div class="tickets">${list.map((x) => `
      <button class="panel ticket-row" data-ticket="${x.id}" type="button">
        <div class="grow">
          <b>${TICKET_TOPICS[x.topic] || ''} ${esc(x.subject)}</b>
          <div class="small">${who(x.name, x.username)} • ${ROLE_NAMES[x.role] || ''}${x.orderId ? ` • طلب #${shortId(x.orderId)}` : ''}</div>
          <div class="muted small">${esc(x.messages[x.messages.length - 1].text).slice(0, 90)}</div>
        </div>
        ${ticketStatus(x).replace('الإدارة ردت', 'رديت')}
      </button>`).join('')}</div>` : '<div class="empty-state"><div class="big">🎧</div><p class="muted">مفيش شكاوي هنا.</p></div>'}`;
  body.querySelectorAll('[data-tfilter]').forEach((b) => b.addEventListener('click', () => { ticketFilter = b.dataset.tfilter; drawSupport(body); }));
  body.querySelectorAll('[data-ticket]').forEach((b) => b.addEventListener('click', () => { openTicket = b.dataset.ticket; drawSupport(body); }));
}

function drawTicket(body, t) {
  const draft = body.querySelector('#adminReply textarea')?.value || '';
  const order = t.orderId && orders.find((o) => o.id === t.orderId);
  body.innerHTML = `
    <button class="back link" id="backTickets" type="button">→ كل الشكاوي</button>
    <div class="two-col">
      <section class="panel">
        <div class="list-head"><h3>${TICKET_TOPICS[t.topic] || ''} ${esc(t.subject)}</h3>${ticketStatus(t).replace('الإدارة ردت', 'رديت')}</div>
        <div class="messages">${thread(t, 'admin', true)}</div>
        <form id="adminReply" class="reply">
          <textarea name="text" required rows="3" maxlength="2000" placeholder="اكتب ردك...">${esc(draft)}</textarea>
          <button class="btn primary" type="submit">إرسال</button>
        </form>
        <div class="row-actions">
          ${t.status === 'closed'
            ? '<button class="btn small" id="reopenTicket" type="button">فتحها تاني</button>'
            : '<button class="btn small" id="closeTicket" type="button">✅ قفل الشكوى (اتحلت)</button>'}
        </div>
      </section>
      <section class="panel">
        <h3>صاحب الشكوى</h3>
        <p>${who(t.name, t.username)} • ${ROLE_NAMES[t.role] || ''}</p>
        <p>📞 <a href="tel:${esc(t.phone)}" dir="ltr">${esc(t.phone)}</a></p>
        ${order ? `<h3>الطلب #${shortId(order.id)}</h3>
          <p class="small">${esc(order.restaurantName)} • ${fmt(order.totals.total)} • ${statusBadge(order.status)}</p>
          <p class="small">${order.lines.map((l) => `${l.qty}× ${esc(l.name)}`).join('، ')}</p>
          ${order.driverName ? `<p class="small">🛵 ${who(order.driverName, order.driverUsername)}</p>` : ''}` : ''}
      </section>
    </div>`;
  const box = body.querySelector('.messages');
  box.scrollTop = box.scrollHeight;
  body.querySelector('#backTickets').addEventListener('click', () => { openTicket = null; drawSupport(body); });
  body.querySelector('#adminReply').addEventListener('submit', async (e) => {
    e.preventDefault();
    const ta = e.target.querySelector('textarea');
    const text = ta.value.trim();
    if (!text) return;
    e.target.querySelector('button').disabled = true;
    try {
      ta.value = '';
      await backend.adminReplyTicket(t.id, user, text);
    } catch (err) {
      ta.value = text;
      toast(errorMessage(err));
    }
  });
  const setStatus = (status) => backend.setTicketStatus(t.id, status).catch((e) => toast(errorMessage(e)));
  body.querySelector('#closeTicket')?.addEventListener('click', () => setStatus('closed'));
  body.querySelector('#reopenTicket')?.addEventListener('click', () => setStatus('open'));
}

// ---------- طلبات الانضمام ----------

function drawRequests(body) {
  if (!applications.length) {
    body.innerHTML = `<div class="empty-state"><div class="big">📭</div><h2>مفيش طلبات جديدة</h2>
      <p class="muted">المندوبين بيقدّموا من <a href="delivery.html" target="_blank">صفحة المندوبين</a>، والمطاعم من <a href="restaurant.html" target="_blank">صفحة المطاعم</a>.</p></div>`;
    return;
  }
  const cat = (id) => CATEGORIES.find((c) => c.id === id);
  body.innerHTML = `
    <div class="requests">
      ${applications.map((a) => `
        <article class="panel request">
          <header>
            <span class="status ${a.type === 'driver' ? 'on_way' : 'ready'}">${a.type === 'driver' ? '🛵 مندوب' : '🏪 مطعم'}</span>
            <span class="muted small">${new Date(a.createdAt).toLocaleString('ar-EG')}</span>
          </header>
          ${a.type === 'restaurant' ? `<h3>${esc(cat(a.category)?.icon || '')} ${esc(a.restaurantName)}</h3>` : `<h3>${esc(a.name)}</h3>`}
          <dl>
            <dt>الاسم</dt><dd>${who(a.name, a.username)}</dd>
            <dt>الموبايل</dt><dd><a href="tel:${esc(a.phone)}" dir="ltr">${esc(a.phone)}</a></dd>
            <dt>الإيميل</dt><dd dir="ltr">${esc(a.email)}</dd>
            ${a.type === 'driver' ? `
              <dt>المواصلة</dt><dd>${VEHICLES[a.vehicle] || esc(a.vehicle)}</dd>
              <dt>المناطق</dt><dd>${esc(a.area)}</dd>` : `
              <dt>النوع</dt><dd>${esc(cat(a.category)?.name || a.category)}</dd>
              <dt>العنوان</dt><dd>${esc(a.address)}</dd>
              <dt>تليفون المطعم</dt><dd><a href="tel:${esc(a.restaurantPhone)}" dir="ltr">${esc(a.restaurantPhone)}</a></dd>`}
            ${a.notes ? `<dt>ملاحظات</dt><dd>${esc(a.notes)}</dd>` : ''}
          </dl>
          <div class="order-actions">
            <button class="btn primary" data-approve="${a.uid}" type="button">✅ موافقة</button>
            <button class="btn danger-outline" data-reject="${a.uid}" type="button">رفض</button>
          </div>
        </article>`).join('')}
    </div>`;

  const byUid = (uid) => applications.find((a) => a.uid === uid);
  body.querySelectorAll('[data-approve]').forEach((b) => b.addEventListener('click', async () => {
    const a = byUid(b.dataset.approve);
    b.disabled = true;
    try {
      if (a.type === 'driver') {
        await backend.approveDriver(a.uid, user.username);
        toast(`تمت إضافة ${a.name} كمندوب ✅`);
      } else {
        // المطعم بيبدأ مقفول لحد ما صاحبه يضيف المنيو ويفتحه
        await backend.approveRestaurant(a.uid, {
          ...NEW_RESTAURANT, name: a.restaurantName, category: a.category, emoji: cat(a.category)?.icon || '🍽️',
          address: a.address, phone: a.restaurantPhone, isOpen: false,
        }, user.username);
        toast(`تم تسجيل ${a.restaurantName} ✅ صاحبه يقدر يضيف المنيو دلوقتي`);
      }
    } catch (e) {
      toast(errorMessage(e));
      b.disabled = false;
    }
  }));
  body.querySelectorAll('[data-reject]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm('رفض الطلب ده؟')) return;
    try {
      await backend.rejectApplication(b.dataset.reject, user.username);
      toast('تم رفض الطلب');
    } catch (e) {
      toast(errorMessage(e));
    }
  }));
}

// ---------- الحسابات ----------

function drawFinance(body) {
  const list = orders.filter((o) => o.status === 'delivered' && inPeriod(o));
  const splits = list.map((o) => ({ o, s: orderSplit(o) }));
  const total = (fn) => sum(splits, fn);

  const byRestaurant = {};
  const byDriver = {};
  splits.forEach(({ o, s }) => {
    const r = byRestaurant[o.restaurantId] ??= { name: o.restaurantName, count: 0, sales: 0, commission: 0, net: 0, due: 0 };
    r.count++;
    r.sales += o.totals.subtotal;
    r.commission += s.commission;
    r.net += s.restaurant;
    r.due += s.restaurantDue;
    const key = o.driverUid || 'none';
    const d = byDriver[key] ??= { name: o.driverName || 'بدون مندوب', username: o.driverUsername, ids: [], earn: 0, owes: 0 };
    d.ids.push(shortId(o.id));
    d.earn += s.driver;
    d.owes += s.driverOwes;
  });
  const r = settings.rates;

  body.innerHTML = `
    <div class="list-head"><h2>الحسابات (الطلبات اللي اتوصلت بس)</h2>${periodChips()}</div>
    <div class="stats">
      <div class="stat"><span>عدد الأوردرات</span><strong>${list.length}</strong></div>
      <div class="stat"><span>إجمالي اللي دفعه العملاء</span><strong>${fmt(total(({ o }) => o.totals.total))}</strong></div>
      <div class="stat accent"><span>💰 ربح المنصة</span><strong>${fmt(total(({ s }) => s.platform))}</strong></div>
      <div class="stat"><span>🏪 حق المطاعم</span><strong>${fmt(total(({ s }) => s.restaurant))}</strong></div>
      <div class="stat"><span>🛵 حق المندوبين</span><strong>${fmt(total(({ s }) => s.driver))}</strong></div>
    </div>

    <section class="panel">
      <h3>🏪 المطاعم</h3>
      ${Object.keys(byRestaurant).length ? `<div class="table-wrap flat"><table class="table">
        <thead><tr><th>المطعم</th><th>الأوردرات</th><th>المبيعات</th><th>عمولة المنصة</th><th>صافي المطعم</th><th>${r.driverPaysRestaurant ? 'اتدفع للمطعم مع المندوب' : 'لسه للمطعم'}</th></tr></thead>
        <tbody>${Object.values(byRestaurant).sort((a, b) => b.count - a.count).map((x) => `
          <tr><td><b>${esc(x.name)}</b></td><td>${x.count}</td><td>${fmt(x.sales)}</td><td>${fmt(x.commission)}</td>
          <td><b>${fmt(x.net)}</b></td><td>${r.driverPaysRestaurant ? '✅' : fmt(x.due)}</td></tr>`).join('')}
        </tbody></table></div>` : '<p class="muted small">مفيش أوردرات في الفترة دي.</p>'}
    </section>

    <section class="panel">
      <h3>🛵 المندوبين</h3>
      ${Object.keys(byDriver).length ? `<div class="table-wrap flat"><table class="table">
        <thead><tr><th>المندوب</th><th>الأوردرات</th><th>أرقام الأوردرات</th><th>مكسبه</th><th>كاش معاه للمنصة</th></tr></thead>
        <tbody>${Object.values(byDriver).sort((a, b) => b.ids.length - a.ids.length).map((x) => `
          <tr><td><b>${who(x.name, x.username)}</b></td><td>${x.ids.length}</td>
          <td class="ids">${x.ids.map((id) => `<span class="chip static">#${id}</span>`).join(' ')}</td>
          <td><b>${fmt(x.earn)}</b></td><td>${x.owes >= 0 ? fmt(x.owes) : `<span class="muted">المنصة عليها ${fmt(-x.owes)}</span>`}</td></tr>`).join('')}
        </tbody></table></div>` : '<p class="muted small">مفيش.</p>'}
    </section>

    <section class="panel">
      <h3>تفاصيل كل أوردر</h3>
      ${splits.length ? `<div class="table-wrap flat"><table class="table">
        <thead><tr><th>الأوردر</th><th>المطعم</th><th>المنطقة</th><th>المندوب</th><th>الأكل</th><th>التوصيل</th><th>الخصم</th><th>الإجمالي</th><th>المطعم</th><th>المندوب</th><th>المنصة</th></tr></thead>
        <tbody>${splits.map(({ o, s }) => `
          <tr><td>#${shortId(o.id)}</td><td>${esc(o.restaurantName)}</td><td>${esc(o.zoneName || '')}</td><td>${who(o.driverName, o.driverUsername)}</td>
          <td>${fmt(o.totals.subtotal)}</td><td>${fmt(o.totals.delivery)}</td><td>${o.totals.discount ? fmt(o.totals.discount) : '—'}</td>
          <td>${fmt(o.totals.total)}</td><td>${fmt(s.restaurant)}</td><td>${fmt(s.driver)}</td><td><b>${fmt(s.platform)}</b></td></tr>`).join('')}
        </tbody></table></div>` : '<p class="muted small">مفيش.</p>'}
    </section>

    <section class="panel formula">
      <h3>🧮 المعادلة الحالية</h3>
      <ul>
        <li>المندوب بياخد <b>${rateLabel(r.driverShare)}</b> من رسوم التوصيل، والباقي للمنصة.</li>
        <li>عمولة المنصة على سعر الأكل: <b>${rateLabel(r.commission)}</b>.</li>
        <li>رسوم الخدمة على العميل: <b>${rateLabel(r.serviceFee)}</b> (بتروح للمنصة).</li>
        <li>الخصومات (أكواد الخصم) بتتخصم من ربح المنصة.</li>
        <li>${r.driverPaysRestaurant ? 'المندوب بيدفع للمطعم تمن الأكل وقت الاستلام، ويسلّم الباقي للمنصة.' : 'المندوب بيسلّم كل الكاش للمنصة، والمنصة بتحاسب المطاعم.'}</li>
      </ul>
      <p class="muted small">كل أوردر بيتحسب بالنسب اللي كانت شغالة وقت ما اتطلب. غيّر النسب من "المناطق والنسب".</p>
    </section>`;
  bindPeriod(body);
}

// ---------- المطاعم ----------

function drawRestaurants(body) {
  if (editing) return drawEditor(body);
  body.innerHTML = `
    <div class="list-head">
      <h2>${restaurants.length} مطعم</h2>
      <div class="row-actions">
        ${restaurants.length ? '' : '<button class="btn" id="seedBtn" type="button">➕ إضافة المطاعم التجريبية</button>'}
        <button class="btn primary" id="newBtn" type="button">+ مطعم جديد</button>
      </div>
    </div>
    ${restaurants.length ? '' : '<p class="muted">مفيش مطاعم لسه. ابدأ بالمطاعم التجريبية (8 مطاعم بالمنيو بتاعها) وعدّل عليها، أو ضيف مطعمك.</p>'}
    <div class="table-wrap">
      <table class="table">
        <thead><tr><th>المطعم</th><th>الحالة</th><th>صاحب المطعم</th><th>أصناف</th><th>أوردرات</th><th></th></tr></thead>
        <tbody>
          ${restaurants.map((r) => `
            <tr>
              <td><span class="mini-logo" style="background:${esc(r.color)}">${restaurantLogo(r, 36)}</span> <strong>${esc(r.name)}</strong>
                ${r.address ? '' : '<br><span class="small warn-text">⚠️ مفيش عنوان للمندوب</span>'}</td>
              <td>${r.blocked ? '<span class="status cancelled">⛔ موقوف</span>' : `<button class="chip" data-toggle="${r.id}" type="button">${r.isOpen !== false ? '🟢 مفتوح' : '🔴 مغلق'}</button>`}</td>
              <td class="small">${r.ownerEmail ? `${r.ownerUsername ? `<span class="uname">@${esc(r.ownerUsername)}</span><br>` : ''}<span dir="ltr">${esc(r.ownerEmail)}</span>` : '<span class="muted">—</span>'}</td>
              <td>${r.menu.reduce((n, s) => n + s.items.length, 0)}</td>
              <td>${orders.filter((o) => o.restaurantId === r.id && o.status === 'delivered').length}</td>
              <td class="row-actions">
                <button class="btn small" data-edit="${r.id}" type="button">تعديل</button>
                <button class="btn small" data-owner="${r.id}" type="button">ربط صاحب</button>
                <button class="btn small ${r.blocked ? '' : 'danger-outline'}" data-block="${r.id}" type="button">${r.blocked ? '▶️ تفعيل' : '⛔ إيقاف'}</button>
                <button class="btn small danger-outline" data-del="${r.id}" type="button">حذف</button>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;

  const byId = (id) => restaurants.find((r) => r.id === id);
  body.querySelector('#newBtn').addEventListener('click', () => { editing = 'new'; drawTab(); });
  body.querySelector('#seedBtn')?.addEventListener('click', seedRestaurants);
  body.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => { editing = b.dataset.edit; drawTab(); }));
  body.querySelectorAll('[data-toggle]').forEach((b) => b.addEventListener('click', () => {
    const r = byId(b.dataset.toggle);
    backend.updateRestaurant(r.id, { isOpen: r.isOpen === false }).catch((e) => toast(errorMessage(e)));
  }));
  body.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
    const r = byId(b.dataset.del);
    if (!confirm(`حذف "${r.name}" نهائيًا؟`)) return;
    try {
      await backend.deleteRestaurant(r.id);
      toast('تم الحذف');
    } catch (e) {
      toast(errorMessage(e));
    }
  }));
  body.querySelectorAll('[data-block]').forEach((b) => b.addEventListener('click', async () => {
    const r = byId(b.dataset.block);
    if (!confirm(r.blocked ? `تفعيل "${r.name}" تاني؟ (صاحبه يقدر يفتحه بعدها)` : `إيقاف "${r.name}"؟ هيتقفل ويختفي من التطبيق، وصاحبه مش هيقدر يفتحه.`)) return;
    try {
      await backend.setRestaurantBlocked(r.id, !r.blocked);
      toast(r.blocked ? 'تم التفعيل ✅' : 'تم الإيقاف ⛔');
    } catch (e) {
      toast(errorMessage(e));
    }
  }));
  body.querySelectorAll('[data-owner]').forEach((b) => b.addEventListener('click', () => assignOwner(byId(b.dataset.owner))));
}

function drawEditor(body) {
  const isNew = editing === 'new';
  const r = isNew ? NEW_RESTAURANT : restaurants.find((x) => x.id === editing);
  if (!r) { editing = null; return drawTab(); }
  body.innerHTML = `
    <button class="back link" id="backBtn" type="button">→ رجوع لقائمة المطاعم</button>
    <h2>${isNew ? 'مطعم جديد' : `تعديل: ${esc(r.name)}`}</h2>
    <div id="editor"></div>`;
  const close = () => { editing = null; drawTab(); };
  body.querySelector('#backBtn').addEventListener('click', close);
  renderMenuEditor(body.querySelector('#editor'), r, {
    saveLabel: isNew ? 'إضافة المطعم' : 'حفظ التعديلات',
    onCancel: close,
    onSave: async (data) => {
      try {
        if (isNew) await backend.createRestaurant({ ...NEW_RESTAURANT, ...data });
        else await backend.updateRestaurant(r.id, data);
        toast(isNew ? 'تمت إضافة المطعم ✅' : 'تم الحفظ ✅');
        close();
      } catch (e) {
        toast(errorMessage(e));
        return false;
      }
    },
  });
}

async function seedRestaurants() {
  try {
    for (const r of SEED_RESTAURANTS) {
      await backend.createRestaurant({ ...r, isOpen: true, logo: '', ownerUid: null, ownerEmail: null }, r.id);
    }
    toast('تمت إضافة المطاعم التجريبية ✅');
  } catch (e) {
    toast(errorMessage(e));
  }
}

async function assignOwner(r) {
  const email = prompt(`صاحب "${r.name}": اكتب إيميله أو اسم المستخدم (@...) أو رقم موبايله\n(لازم يكون عامل حساب في الموقع الأول):`,
    r.ownerUsername ? `@${r.ownerUsername}` : r.ownerEmail || '');
  if (!email || !email.trim()) return;
  try {
    const u = await backend.findUser(email);
    if (!u) return toast('مفيش حساب بالبيانات دي. خلّي صاحب المطعم يعمل حساب الأول.');
    if (u.role === 'driver') return toast('الحساب ده مندوب. شيله من المندوبين الأول.');
    if (u.restaurantId && u.restaurantId !== r.id && !confirm('الحساب ده مربوط بمطعم تاني، هيتفك ربطه منه. تكمل؟')) return;
    if (!confirm(`ربط ${u.name} (@${u.username || u.email}) بـ ${r.name}؟`)) return;
    await backend.assignOwner(r.id, u);
    toast(`تم ربط ${u.name || u.email} بـ ${r.name} ✅`);
  } catch (e) {
    toast(errorMessage(e));
  }
}

// ---------- المناطق والنسب ----------

function drawZones(body) {
  const draft = JSON.parse(JSON.stringify(withDefaults(settings)));
  const zoneRows = () => Object.entries(draft.zones).map(([id, z]) => `
    <tr>
      <td><input data-zone="${id}" data-zf="name" value="${esc(z.name)}" required aria-label="اسم المنطقة"></td>
      <td><input data-zone="${id}" data-zf="fee" type="number" min="0" step="any" value="${z.fee}" required aria-label="سعر التوصيل"></td>
      <td><label class="check"><input type="checkbox" data-zone="${id}" data-zf="active" ${z.active !== false ? 'checked' : ''}> متاحة</label></td>
      <td><button type="button" class="icon-btn danger" data-del-zone="${id}" aria-label="حذف">🗑️</button></td>
    </tr>`).join('');

  const rateField = (key, title, hint) => {
    const rt = draft.rates[key];
    return `
      <div class="rate-field">
        <b>${title}</b>
        <div class="rate-inputs">
          <select data-rate="${key}" data-rf="type" aria-label="نوع">
            <option value="percent" ${rt.type === 'percent' ? 'selected' : ''}>نسبة %</option>
            <option value="fixed" ${rt.type === 'fixed' ? 'selected' : ''}>مبلغ ثابت (ج.م)</option>
          </select>
          <input data-rate="${key}" data-rf="value" type="number" min="0" step="any" value="${rt.value}" required aria-label="القيمة">
        </div>
        <span class="muted small">${hint}</span>
      </div>`;
  };

  const example = () => {
    const fee = 30;
    const driver = applyRate(draft.rates.driverShare, fee);
    return `مثال: لو التوصيل ${fmt(fee)} ← المندوب ياخد ${fmt(driver)} والمنصة ${fmt(fee - driver)}`;
  };

  const draw = () => {
    body.innerHTML = `
      <form id="settingsForm" class="editor">
        <section class="panel">
          <div class="list-head">
            <h3>📍 مناطق التوصيل وأسعارها</h3>
            <div class="row-actions">
              ${Object.keys(draft.zones).length ? '' : '<button type="button" class="btn small" id="sampleZones">➕ مناطق القاهرة التجريبية</button>'}
              <button type="button" class="btn small primary" id="addZone">+ منطقة جديدة</button>
            </div>
          </div>
          <p class="muted small">العميل بيختار منطقته وقت الطلب، وسعر التوصيل بيتحدد منها.</p>
          ${Object.keys(draft.zones).length ? `<div class="table-wrap flat"><table class="table zones">
            <thead><tr><th>المنطقة</th><th>سعر التوصيل (ج.م)</th><th>الحالة</th><th></th></tr></thead>
            <tbody>${zoneRows()}</tbody></table></div>` : '<p class="warn">مفيش مناطق. العملاء مش هيقدروا يطلبوا لحد ما تضيف مناطق.</p>'}
        </section>

        <section class="panel">
          <h3>🧮 النسب وتقسيم الفلوس</h3>
          <div class="rates-grid">
            ${rateField('driverShare', '🛵 نصيب المندوب من رسوم التوصيل', 'والباقي من رسوم التوصيل للمنصة.')}
            ${rateField('commission', '🏪 عمولة المنصة على سعر الأكل', 'بتتخصم من حق المطعم. خليها 0 لو مفيش عمولة.')}
            ${rateField('serviceFee', '🧾 رسوم خدمة على العميل', 'بتتضاف على فاتورة العميل وتروح للمنصة. خليها 0 لو مش عايزها.')}
          </div>
          <p class="example" id="example">${example()}</p>
          <label class="check"><input type="checkbox" id="driverPays" ${draft.rates.driverPaysRestaurant ? 'checked' : ''}>
            المندوب بيدفع للمطعم تمن الأكل كاش وقت الاستلام</label>
          <p class="muted small">التغيير بيسري على الأوردرات الجديدة بس، والقديمة بتفضل بحسابها.</p>
        </section>

        <section class="panel">
          <h3>🛵 المندوبين</h3>
          <label>أقصى عدد أوردرات مع المندوب في نفس الوقت
            <input id="maxDriverOrders" type="number" min="0" max="20" step="1" value="${draft.maxDriverOrders}" required inputmode="numeric">
          </label>
          <p class="muted small">مثلًا 3: المندوب ياخد لحد 3 أوردرات من المتاحة، ولما يوصّلهم (أو يرجّع واحد) يقدر ياخد غيرهم. 0 يعني من غير حد. بيتطبق على كل المندوبين.</p>
        </section>

        <section class="panel">
          <h3>🎧 خدمة العملاء</h3>
          <label>رقم واتساب خدمة العملاء (اختياري، بيظهر في صفحة الدعم)
            <input id="supportPhone" type="tel" pattern="01[0-9]{9}" value="${esc(draft.supportPhone)}" placeholder="01xxxxxxxxx" inputmode="numeric" dir="ltr">
          </label>
        </section>
        <div class="editor-actions">
          <button class="btn primary" type="submit">💾 حفظ الإعدادات</button>
        </div>
      </form>`;

    const sync = () => {
      body.querySelectorAll('[data-zone]').forEach((inp) => {
        const z = draft.zones[inp.dataset.zone];
        const f = inp.dataset.zf;
        z[f] = f === 'active' ? inp.checked : f === 'fee' ? Number(inp.value) : inp.value.trim();
      });
      body.querySelectorAll('[data-rate]').forEach((inp) => {
        const rt = draft.rates[inp.dataset.rate];
        rt[inp.dataset.rf] = inp.dataset.rf === 'value' ? Number(inp.value) : inp.value;
      });
      draft.rates.driverPaysRestaurant = body.querySelector('#driverPays').checked;
      draft.supportPhone = body.querySelector('#supportPhone').value.trim();
      draft.maxDriverOrders = Math.max(0, Math.floor(Number(body.querySelector('#maxDriverOrders').value) || 0));
    };
    const redraw = (fn) => () => { sync(); fn(); draw(); };

    body.querySelector('#addZone').addEventListener('click', redraw(() => {
      draft.zones['z' + Date.now().toString(36)] = { name: '', fee: 25, active: true };
    }));
    body.querySelector('#sampleZones')?.addEventListener('click', redraw(() => {
      Object.assign(draft.zones, JSON.parse(JSON.stringify(SAMPLE_ZONES)));
    }));
    body.querySelectorAll('[data-del-zone]').forEach((b) => b.addEventListener('click', redraw(() => {
      delete draft.zones[b.dataset.delZone];
    })));
    body.querySelectorAll('[data-rate]').forEach((inp) => inp.addEventListener('input', () => {
      sync();
      body.querySelector('#example').textContent = example();
    }));

    body.querySelector('#settingsForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      sync();
      if (!e.target.checkValidity()) return e.target.reportValidity();
      const pct = ['driverShare', 'commission', 'serviceFee'].find((k) => draft.rates[k].type === 'percent' && draft.rates[k].value > 100);
      if (pct) return toast('النسبة مينفعش تزيد عن 100%');
      try {
        await backend.saveSettings(draft);
        toast('تم حفظ الإعدادات ✅');
      } catch (err) {
        toast(errorMessage(err));
      }
    });
  };
  draw();
}

// ---------- المندوبين ----------

function drawDrivers(body) {
  const stats = (uid) => {
    const mine = orders.filter((o) => o.driverUid === uid);
    const delivered = mine.filter((o) => o.status === 'delivered');
    const today = delivered.filter((o) => isToday(o.createdAt));
    return {
      active: mine.filter((o) => !FINAL_STATUSES.includes(o.status)).length,
      today: today.length,
      earnToday: sum(today, (o) => orderSplit(o).driver),
      total: delivered.length,
      owes: sum(delivered, (o) => orderSplit(o).driverOwes),
    };
  };

  body.innerHTML = `
    <div class="list-head">
      <h2>${drivers.length} مندوب</h2>
      <button class="btn primary" id="addDriver" type="button">+ إضافة مندوب</button>
    </div>
    <p class="muted small">المندوب يفتح صفحة المندوبين (<a href="delivery.html" target="_blank">delivery.html</a>)، ويعمل حساب ويقدّم طلب، وإنت توافق عليه من "📥 طلبات الانضمام". أو ضيف حساب موجود بإيميله من هنا.</p>
    ${drivers.length ? `<div class="table-wrap"><table class="table">
      <thead><tr><th>المندوب</th><th>الموبايل</th><th>معاه دلوقتي</th><th>وصّل النهارده</th><th>مكسبه النهارده</th><th>كل أوردراته</th><th>كاش معاه للمنصة</th><th></th></tr></thead>
      <tbody>${drivers.map((d) => {
        const s = stats(d.uid);
        return `<tr>
          <td><b>${who(d.name, d.username)}</b><br><span class="small muted" dir="ltr">${esc(d.email)}</span></td>
          <td><a href="tel:${esc(d.phone)}" dir="ltr">${esc(d.phone)}</a></td>
          <td>${s.active}</td><td>${s.today}</td><td>${fmt(s.earnToday)}</td><td>${s.total}</td>
          <td><b>${fmt(s.owes)}</b></td>
          <td class="row-actions">${accountState(d)} <button class="btn small" data-remove="${d.uid}" type="button">شيله من المندوبين</button>${moderationButtons(d)}</td>
        </tr>`;
      }).join('')}</tbody></table></div>` : '<p class="muted">مفيش مندوبين لسه.</p>'}`;

  body.querySelector('#addDriver').addEventListener('click', async () => {
    const email = prompt('اكتب إيميل المندوب أو اسم المستخدم (@...) أو رقم موبايله\n(لازم يكون عامل حساب في الموقع الأول):');
    if (!email || !email.trim()) return;
    try {
      const u = await backend.findUser(email);
      if (!u) return toast('مفيش حساب بالبيانات دي. خلّي المندوب يعمل حساب الأول.');
      if (!confirm(`إضافة ${u.name} (@${u.username || u.email}) كمندوب؟`)) return;
      if (u.role === 'admin') return toast('ده حساب أدمن، مينفعش يبقى مندوب.');
      if (u.role === 'driver') return toast('الحساب ده مندوب أصلًا.');
      if (u.restaurantId && !confirm('الحساب ده صاحب مطعم، هيتفك ربطه بالمطعم. تكمل؟')) return;
      await backend.setUserRole(u.uid, 'driver');
      toast(`تمت إضافة ${u.name || u.email} كمندوب ✅`);
    } catch (e) {
      toast(errorMessage(e));
    }
  });
  bindModeration(body);
  body.querySelectorAll('[data-remove]').forEach((b) => b.addEventListener('click', async () => {
    const d = drivers.find((x) => x.uid === b.dataset.remove);
    if (!confirm(`شيل ${d.name} من المندوبين؟`)) return;
    try {
      await backend.setUserRole(d.uid, 'customer');
      toast('تم');
    } catch (e) {
      toast(errorMessage(e));
    }
  }));
}

// ---------- الحظر والحذف ----------

const canModerate = (u) => u && u.role !== 'admin' && u.uid !== user.uid && !u.deleted;

async function toggleBan(u) {
  try {
    if (u.banned) {
      if (!confirm(`فك الحظر عن ${u.name} (@${u.username || ''})؟`)) return;
      await backend.setBanned(u, false);
      toast('تم فك الحظر ✅');
    } else {
      const reason = prompt(`حظر ${u.name} (@${u.username || ''})\nمش هيقدر يطلب أو يستقبل أوردرات.${
        u.role === 'driver' ? ' الأوردرات اللي ماستلمهاش هترجع لباقي المندوبين.' : ''}${
        u.restaurantId ? ' ومطعمه هيتقفل ويختفي من التطبيق.' : ''}\n\nاكتب السبب (هيظهرله):`);
      if (reason === null) return;
      await backend.setBanned(u, true, reason.trim());
      toast('تم الحظر 🚫');
    }
  } catch (e) {
    toast(errorMessage(e));
  }
}

async function deleteUser(u) {
  const typed = prompt(`⚠️ حذف حساب ${u.name} نهائيًا\nبياناته هتتمسح، واسم المستخدم والرقم هيتفكوا، ومش هيقدر يدخل تاني.\nالطلبات القديمة بتفضل في الحسابات.\n\nللتأكيد اكتب اسم المستخدم: ${u.username || u.email}`);
  if (typed === null) return;
  if (typed.trim().replace(/^@/, '').toLowerCase() !== String(u.username || u.email).toLowerCase()) return toast('الاسم مش مطابق، متحذفش');
  try {
    await backend.deleteAccount(u);
    toast('تم حذف الحساب 🗑️');
  } catch (e) {
    toast(errorMessage(e));
  }
}

const accountState = (u) => (u.deleted ? '<span class="status cancelled">🗑️ محذوف</span>'
  : u.banned ? `<span class="status cancelled" title="${esc(u.bannedReason || '')}">🚫 محظور</span>` : '');

// موظف خدمة العملاء: من العملاء بس (مش مطعم أو مندوب)
const staffButton = (u) => (canModerate(u) && !u.banned && ['customer', 'staff'].includes(u.role) ? `
  <button class="btn small" data-staff="${u.uid}" type="button">${u.role === 'staff' ? '👔 شيله من الموظفين' : '👔 خليه موظف'}</button>` : '');

const moderationButtons = (u) => (canModerate(u) ? `
  <button class="btn small ${u.banned ? '' : 'danger-outline'}" data-ban="${u.uid}" type="button">${u.banned ? '✅ فك الحظر' : '🚫 حظر'}</button>
  <button class="btn small danger-outline" data-delete="${u.uid}" type="button">🗑️ حذف</button>` : '');

function bindModeration(root) {
  const find = (uid) => users.find((x) => x.uid === uid);
  root.querySelectorAll('[data-staff]').forEach((b) => b.addEventListener('click', async () => {
    const u = find(b.dataset.staff);
    const make = u.role !== 'staff';
    if (!confirm(make
      ? `تخلي ${u.name} (@${u.username || ''}) موظف خدمة عملاء؟\nهيقدر يرد على الشكاوي ويوافق أو يرفض طلبات المطاعم والمندوبين.`
      : `تشيل ${u.name} من موظفين خدمة العملاء؟`)) return;
    try {
      await backend.setUserRole(u.uid, make ? 'staff' : 'customer');
      toast(make ? 'بقى موظف خدمة عملاء 👔' : 'اتشال من الموظفين');
    } catch (e) {
      toast(errorMessage(e));
    }
  }));
  root.querySelectorAll('[data-ban]').forEach((b) => b.addEventListener('click', () => toggleBan(find(b.dataset.ban))));
  root.querySelectorAll('[data-delete]').forEach((b) => b.addEventListener('click', () => deleteUser(find(b.dataset.delete))));
}

// ---------- المستخدمين ----------

const ROLE_LABELS = { customer: '👤 عميل', restaurant: '🏪 صاحب مطعم', driver: '🛵 مندوب', staff: '👔 خدمة عملاء', admin: '🛠️ أدمن' };

function drawUsers(body) {
  body.innerHTML = `
    <div class="list-head">
      <h2>${users.length} مستخدم</h2>
      <input class="search-in" id="userSearch" type="search" placeholder="دوّر بالاسم أو @اسم المستخدم أو الموبايل أو الإيميل" value="${esc(userQuery)}">
    </div>
    <div id="usersTable"></div>`;
  const restName = (id) => (restaurants || []).find((r) => r.id === id)?.name;
  const draw = () => {
    // بيقبل أرقام عربي (٠١٢) وحروف زي أ/ا و ة/ه، والرقم بـ +20 أو من غيرها
    const q = userQuery.trim().replace(/^@/, '');
    const phoneQ = normalize(q).replace(/\s|-/g, '').replace(/^\+?20(?=1)/, '0');
    const list = users.filter((u) => !q || matches(q, u.name, u.username, u.email, u.restaurantId ? restName(u.restaurantId) : '')
      || (/^\d{3,}$/.test(phoneQ) && String(u.phone || '').includes(phoneQ)))
      .sort((a, b) => String(a.username || '~').localeCompare(String(b.username || '~')));
    const ordersBy = (uid) => orders.filter((o) => o.customerUid === uid).length;
    const table = body.querySelector('#usersTable');
    if (!table) return;
    table.innerHTML = `
      <div class="table-wrap"><table class="table">
        <thead><tr><th>اسم المستخدم</th><th>الاسم</th><th>الموبايل</th><th>الإيميل</th><th>النوع</th><th>طلباته</th><th></th></tr></thead>
        <tbody>${list.map((u) => `
          <tr>
            <td>${u.username ? `<span class="uname">@${esc(u.username)}</span>` : u.deletedUsername ? `<s class="muted">@${esc(u.deletedUsername)}</s>` : '<span class="muted small">لسه ماختارش</span>'} ${accountState(u)}</td>
            <td>${esc(u.name)}</td>
            <td><a href="tel:${esc(u.phone)}" dir="ltr">${esc(u.phone)}</a></td>
            <td class="small" dir="ltr">${esc(u.email)}</td>
            <td class="small">${ROLE_LABELS[u.role] || esc(u.role)}${u.restaurantId && restName(u.restaurantId) ? `<br>${esc(restName(u.restaurantId))}` : ''}</td>
            <td>${ordersBy(u.uid)}</td>
            <td class="row-actions">${staffButton(u)}${moderationButtons(u)}</td>
          </tr>`).join('') || '<tr><td colspan="7" class="center muted">مفيش نتايج</td></tr>'}
        </tbody></table></div>`;
    bindModeration(body);
  };
  usersRedraw = draw;
  draw();
  body.querySelector('#userSearch').addEventListener('input', (e) => { userQuery = e.target.value; draw(); });
}

// ---------- الطلبات ----------

function drawOrders(body) {
  const filters = { active: 'الشغالة', today: 'النهارده', all: 'الكل' };
  const list = orders.filter((o) =>
    orderFilter === 'active' ? !FINAL_STATUSES.includes(o.status)
      : orderFilter === 'today' ? isToday(o.createdAt) : true);

  body.innerHTML = `
    <div class="list-head">
      <h2>${list.length} طلب</h2>
      <div class="chips">
        ${Object.entries(filters).map(([k, l]) => `<button type="button" class="chip ${orderFilter === k ? 'active' : ''}" data-filter="${k}">${l}</button>`).join('')}
      </div>
    </div>
    <div class="table-wrap">
      <table class="table">
        <thead><tr><th>الطلب</th><th>الوقت</th><th>المطعم</th><th>العميل</th><th>المنطقة</th><th>المندوب</th><th>الإجمالي</th><th>الحالة</th></tr></thead>
        <tbody>
          ${list.map((o) => `
            <tr>
              <td>#${shortId(o.id)}</td>
              <td class="small">${new Date(o.createdAt).toLocaleString('ar-EG')}</td>
              <td>${esc(o.restaurantName)}</td>
              <td class="small">${who(o.customerName, o.customerUsername)}<br><a href="tel:${esc(o.customerPhone)}" dir="ltr">${esc(o.customerPhone)}</a></td>
              <td class="small">${esc(o.zoneName || '')}</td>
              <td class="small">${o.driverName ? who(o.driverName, o.driverUsername) : '<span class="muted">—</span>'}</td>
              <td>${fmt(o.totals.total)}</td>
              <td>
                <select data-order="${o.id}" aria-label="حالة الطلب">
                  ${Object.entries(ORDER_STATUSES).map(([k, s]) => `<option value="${k}" ${o.status === k ? 'selected' : ''}>${s.icon} ${s.label}</option>`).join('')}
                </select>
              </td>
            </tr>`).join('') || '<tr><td colspan="8" class="center muted">مفيش طلبات</td></tr>'}
        </tbody>
      </table>
    </div>`;

  body.querySelectorAll('[data-filter]').forEach((b) => b.addEventListener('click', () => { orderFilter = b.dataset.filter; drawTab(); }));
  body.querySelectorAll('[data-order]').forEach((s) => s.addEventListener('change', () => {
    const o = orders.find((x) => x.id === s.dataset.order);
    backend.setOrderStatus(s.dataset.order, s.value, { driverUid: o?.driverUid })
      .then(() => toast('تم تحديث الحالة'))
      .catch((e) => toast(errorMessage(e)));
  }));
}

backend.onAuth((u) => {
  if (JSON.stringify(u) === JSON.stringify(user)) return;
  user = u;
  start();
});
