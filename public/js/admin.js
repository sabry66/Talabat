// لوحة الأدمن: إحصائيات، إدارة المطاعم وربطها بأصحابها، ومتابعة كل الطلبات
import { backend, isDemo } from './backend/index.js';
import { SEED_RESTAURANTS, NEW_RESTAURANT, ORDER_STATUSES, FINAL_STATUSES } from './data.js';
import { renderMenuEditor } from './menu-editor.js';
import {
  esc, fmt, toast, errorMessage, loader, demoBanner, isToday, shortId,
  renderAuthForm, renderDashNav, statusBadge,
} from './ui.js';

const root = document.getElementById('app');
let user;
let restaurants = null;
let orders = null;
let tab = 'overview';
let editing = null; // id المطعم اللي بيتعدل، أو 'new'
let orderFilter = 'active';
let unsubs = [];

function stop() {
  unsubs.forEach((u) => u());
  unsubs = [];
  restaurants = null;
  orders = null;
  editing = null;
}

function start() {
  stop();
  renderDashNav(user, backend);
  if (!user) {
    root.innerHTML = `${demoBanner(isDemo)}<div id="authBox"></div>`;
    renderAuthForm(document.getElementById('authBox'), { backend, isDemo, title: 'دخول الأدمن' });
    return;
  }
  if (user.role !== 'admin') {
    root.innerHTML = `
      <div class="empty-state">
        <div class="big">🔒</div>
        <h2>الصفحة دي للأدمن بس</h2>
        <p class="muted">لو إنت صاحب التطبيق، شوف ملف SETUP.md (خطوة "خلّي حسابك أدمن").</p>
        <a href="index.html" class="btn">الرجوع للتطبيق</a>
      </div>`;
    return;
  }
  root.innerHTML = `
    ${demoBanner(isDemo)}
    <div class="tabs" id="tabs"></div>
    <div id="tabBody">${loader()}</div>`;
  drawTabs();
  unsubs.push(backend.watchRestaurants((list) => {
    restaurants = list.sort((a, b) => a.name.localeCompare(b.name, 'ar'));
    if (!editing) drawTab();
  }));
  unsubs.push(backend.watchOrders({}, (list) => {
    orders = list;
    drawTabs();
    if (!editing) drawTab();
  }));
}

function drawTabs() {
  const active = (orders || []).filter((o) => !FINAL_STATUSES.includes(o.status)).length;
  const el = document.getElementById('tabs');
  el.innerHTML = [['overview', '📊 نظرة عامة'], ['restaurants', '🏪 المطاعم'], ['orders', `📋 الطلبات ${active ? `<span class="badge static">${active}</span>` : ''}`]]
    .map(([k, l]) => `<button type="button" data-tab="${k}" class="${tab === k ? 'active' : ''}">${l}</button>`).join('');
  el.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => {
    tab = b.dataset.tab;
    editing = null;
    drawTabs();
    drawTab();
  }));
}

function drawTab() {
  const body = document.getElementById('tabBody');
  if (!restaurants || !orders) { body.innerHTML = loader(); return; }
  if (tab === 'overview') drawOverview(body);
  else if (tab === 'restaurants') drawRestaurants(body);
  else drawOrders(body);
}

// ---------- نظرة عامة ----------

function drawOverview(body) {
  const today = orders.filter((o) => isToday(o.createdAt));
  const delivered = today.filter((o) => o.status === 'delivered');
  const active = orders.filter((o) => !FINAL_STATUSES.includes(o.status));
  const open = restaurants.filter((r) => r.isOpen !== false).length;
  const byRestaurant = {};
  today.filter((o) => !['cancelled', 'rejected'].includes(o.status)).forEach((o) => {
    byRestaurant[o.restaurantName] ??= { count: 0, total: 0 };
    byRestaurant[o.restaurantName].count++;
    byRestaurant[o.restaurantName].total += o.totals.total;
  });
  const top = Object.entries(byRestaurant).sort((a, b) => b[1].count - a[1].count).slice(0, 5);

  body.innerHTML = `
    <div class="stats">
      <div class="stat"><span>طلبات النهارده</span><strong>${today.length}</strong></div>
      <div class="stat"><span>مبيعات النهارده (اتوصلت)</span><strong>${fmt(delivered.reduce((s, o) => s + o.totals.total, 0))}</strong></div>
      <div class="stat"><span>طلبات شغالة دلوقتي</span><strong>${active.length}</strong></div>
      <div class="stat"><span>مطاعم مفتوحة</span><strong>${open} / ${restaurants.length}</strong></div>
      <div class="stat"><span>كل الطلبات</span><strong>${orders.length}</strong></div>
    </div>
    <div class="two-col">
      <section class="panel">
        <h3>أكتر المطاعم طلبًا النهارده</h3>
        ${top.length ? `<table class="table"><thead><tr><th>المطعم</th><th>الطلبات</th><th>القيمة</th></tr></thead><tbody>
          ${top.map(([name, s]) => `<tr><td>${esc(name)}</td><td>${s.count}</td><td>${fmt(s.total)}</td></tr>`).join('')}
        </tbody></table>` : '<p class="muted small">لسه مفيش طلبات النهارده.</p>'}
      </section>
      <section class="panel">
        <h3>آخر الطلبات</h3>
        ${orders.slice(0, 6).map((o) => `
          <div class="mini-line"><span>#${shortId(o.id)} • ${esc(o.restaurantName)}</span>${statusBadge(o.status)}</div>`).join('') || '<p class="muted small">مفيش.</p>'}
      </section>
    </div>`;
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
        <thead><tr><th>المطعم</th><th>الحالة</th><th>صاحب المطعم</th><th>أصناف</th><th></th></tr></thead>
        <tbody>
          ${restaurants.map((r) => `
            <tr>
              <td><strong>${esc(r.emoji)} ${esc(r.name)}</strong></td>
              <td><button class="chip" data-toggle="${r.id}" type="button">${r.isOpen !== false ? '🟢 مفتوح' : '🔴 مغلق'}</button></td>
              <td class="small" dir="ltr">${r.ownerEmail ? esc(r.ownerEmail) : '<span class="muted">—</span>'}</td>
              <td>${r.menu.reduce((n, s) => n + s.items.length, 0)}</td>
              <td class="row-actions">
                <button class="btn small" data-edit="${r.id}" type="button">تعديل</button>
                <button class="btn small" data-owner="${r.id}" type="button">ربط صاحب</button>
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
      }
    },
  });
}

async function seedRestaurants() {
  try {
    for (const r of SEED_RESTAURANTS) {
      await backend.createRestaurant({ ...r, isOpen: true, ownerUid: null, ownerEmail: null }, r.id);
    }
    toast('تمت إضافة المطاعم التجريبية ✅');
  } catch (e) {
    toast(errorMessage(e));
  }
}

async function assignOwner(r) {
  const email = prompt(`إيميل صاحب "${r.name}"\n(لازم يكون عامل حساب في التطبيق الأول):`, r.ownerEmail || '');
  if (!email || !email.trim()) return;
  try {
    const u = await backend.findUserByEmail(email);
    if (!u) return toast('مفيش حساب بالإيميل ده. خلّي صاحب المطعم يعمل حساب الأول.');
    if (u.restaurantId && u.restaurantId !== r.id && !confirm('الحساب ده مربوط بمطعم تاني، هيتفك ربطه منه. تكمل؟')) return;
    await backend.assignOwner(r.id, u);
    toast(`تم ربط ${u.name || u.email} بـ ${r.name} ✅`);
  } catch (e) {
    toast(errorMessage(e));
  }
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
        <thead><tr><th>الطلب</th><th>الوقت</th><th>المطعم</th><th>العميل</th><th>الأصناف</th><th>الإجمالي</th><th>الحالة</th></tr></thead>
        <tbody>
          ${list.map((o) => `
            <tr>
              <td>#${shortId(o.id)}</td>
              <td class="small">${new Date(o.createdAt).toLocaleString('ar-EG')}</td>
              <td>${esc(o.restaurantEmoji)} ${esc(o.restaurantName)}</td>
              <td class="small">${esc(o.customerName)}<br><a href="tel:${esc(o.customerPhone)}" dir="ltr">${esc(o.customerPhone)}</a></td>
              <td class="small">${o.lines.map((l) => `${l.qty}× ${esc(l.name)}`).join('<br>')}</td>
              <td>${fmt(o.totals.total)}</td>
              <td>
                <select data-order="${o.id}" aria-label="حالة الطلب">
                  ${Object.entries(ORDER_STATUSES).map(([k, s]) => `<option value="${k}" ${o.status === k ? 'selected' : ''}>${s.icon} ${s.label}</option>`).join('')}
                </select>
              </td>
            </tr>`).join('') || '<tr><td colspan="7" class="center muted">مفيش طلبات</td></tr>'}
        </tbody>
      </table>
    </div>`;

  body.querySelectorAll('[data-filter]').forEach((b) => b.addEventListener('click', () => { orderFilter = b.dataset.filter; drawTab(); }));
  body.querySelectorAll('[data-order]').forEach((s) => s.addEventListener('change', () => {
    backend.setOrderStatus(s.dataset.order, s.value)
      .then(() => toast('تم تحديث الحالة'))
      .catch((e) => toast(errorMessage(e)));
  }));
}

backend.onAuth((u) => {
  if (JSON.stringify(u) === JSON.stringify(user)) return;
  user = u;
  start();
});
