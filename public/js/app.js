// تطبيق العميل: المطاعم، المنيو، السلة، الطلب، والتتبع (hash routing)
import { backend, isDemo } from './backend/index.js';
import { CATEGORIES, ORDER_STATUSES, ORDER_FLOW } from './data.js';
import { Cart, MAX_LINE_NOTE } from './cart.js';
import { busyExtra, restTime } from './busy.js';
import { slots, whenLabel, isScheduled } from './schedule.js';
import { locationPicker, trackMap } from './map.js';
import { activeZones, deliversTo, enabledPayments, missingDeduction, missingItems, missingRefund, paidTotal } from './finance.js';
import { matches, minPrice, inPriceRange, SORTS } from './search.js';
import {
  fmt, esc, toast, errorMessage, phoneLinkBox, shortId, isAvailable, statusBadge, paymentLabel, timeAgo,
  loader, demoBanner, renderAuthForm, restaurantLogo, itemImage, renderCompleteProfile, renderAcceptTerms, needsTerms, usernameField, renderBlocked, homeFor,
  changePasswordForm, bindChangePassword, joinCards, JOIN_LINKS, lineOptions,
} from './ui.js';
import { renderSupport } from './support.js';
import { alarm, notify, notifyButton, bindNotifyButton } from './notify.js';
import { normalizeCode, couponProblem, couponLabel, couponConditions, couponDiscount } from './coupons.js';
import { hasOptions, resolveOptions, lineKey, priceGroup } from './options.js';
import { ratingOf, ratingValue, ratingBadge, stars } from './ratings.js';
import { MAX_ADDRESSES, ADDRESS_KINDS, addressIcon, addressTitle, newAddressId, savedAddresses, nextKind, cleanAddress } from './addresses.js';
import { activeOffer, priceOf, priceHtml, linePrice, offerItems, hasOffers, promoText, untilLabel } from './offers.js';

const app = document.getElementById('app');

// user: undefined = لسه بيحمّل، null = مش مسجل
const state = { user: undefined, restaurants: null, settings: null };
// حالة صفحة الرئيسية (بحث / تصنيف / ترتيب)
const ui = {
  query: '', category: 'all', sort: 'recommended', showFilters: false, showAllItems: false,
  openOnly: false, promoOnly: false, topRated: false, priceMin: '', priceMax: '',
};
// البحث والفلترة جوه منيو المطعم
const menuUi = { query: '', sort: 'default', availableOnly: false };
let page = '';
let cleanup = null;
let refreshCheckout = null;

const findRestaurant = (id) => (state.restaurants || []).find((r) => r.id === id);
const cartRestaurant = () => findRestaurant(Cart.restaurantId);
const cartTotals = (r) => Cart.totals(r, state.settings);
// منطقة التوصيل المختارة (لو المطعم اللي في السلة بيوصّلها)
const currentZone = () => {
  const z = state.settings?.zones[Cart.zoneId];
  if (!deliversTo(cartRestaurant(), Cart.zoneId)) return null;
  return z && z.active !== false ? { id: Cart.zoneId, ...z } : null;
};
const zoneName = (id) => state.settings?.zones[id]?.name || '';
// المطاعم اللي مش بتوصّل لمنطقة العميل
const outOfZone = (r) => Boolean(Cart.zoneId && state.settings?.zones[Cart.zoneId] && !deliversTo(r, Cart.zoneId));
const minZoneFee = () => {
  const fees = activeZones(state.settings).map((z) => z.fee);
  return fees.length ? Math.min(...fees) : null;
};
const deliveryMeta = () => (minZoneFee() !== null ? ` • 🛵 التوصيل من ${fmt(minZoneFee())}` : '');

// اختيار منطقة التوصيل (سعر التوصيل بيتحدد منها)
function zoneSelect() {
  const r = cartRestaurant();
  const all = activeZones(state.settings);
  const zones = all.filter((z) => deliversTo(r, z.id));
  if (!all.length) return '<p class="warn">التوصيل مش متاح لسه، مفيش مناطق توصيل متضافة.</p>';
  if (!zones.length) return '<p class="warn">المطعم ده مش بيوصّل لأي منطقة دلوقتي.</p>';
  const off = Cart.zoneId && state.settings.zones[Cart.zoneId] && !deliversTo(r, Cart.zoneId)
    ? `<p class="warn">🚫 ${esc(r.name)} مش بيوصّل لـ ${esc(zoneName(Cart.zoneId))}. اختار منطقة تانية من اللي بيوصّلها.</p>` : '';
  return `${off}
    <label>📍 منطقة التوصيل
      <select id="zoneSelect" required>
        <option value="">اختار منطقتك</option>
        ${zones.map((z) => `<option value="${z.id}" ${Cart.zoneId === z.id ? 'selected' : ''}>${esc(z.name)} — توصيل ${fmt(z.fee)}</option>`).join('')}
      </select>
    </label>`;
}

function setCleanup(fn) {
  if (cleanup) cleanup();
  cleanup = fn;
}

// ---------- الهيدر ----------

// شريط السلة تحت على الموبايل (في الرئيسية وصفحة المطعم)
const cartBar = document.createElement('a');
cartBar.className = 'mobile-cart-bar';
cartBar.href = '#/cart';
document.body.appendChild(cartBar);

function updateCartBar() {
  const n = Cart.count();
  const r = state.settings && cartRestaurant();
  const show = n > 0 && r && ['', 'restaurant', 'offers'].includes(page);
  cartBar.classList.toggle('show', Boolean(show));
  document.body.classList.toggle('has-cart-bar', Boolean(show));
  if (show) {
    cartBar.innerHTML = `<span class="bar-count">${n}</span><span>عرض السلة</span><strong>${fmt(cartTotals(r).subtotal)}</strong>`;
  }
}

function updateHeader() {
  updateCartBar();
  document.getElementById('cartCount').textContent = Cart.count();
  const u = state.user;
  document.getElementById('addressLabel').textContent = u?.address || 'حدد عنوانك عند الطلب';
  document.getElementById('userNav').innerHTML = u
    ? `${u.role === 'admin' ? '<a href="admin.html" class="nav-link" data-drawer-label="🛠️ لوحة الأدمن">🛠️ الأدمن</a>' : ''}
       ${u.role === 'staff' ? '<a href="admin.html" class="nav-link">🎧 لوحة خدمة العملاء</a>' : ''}
       ${u.restaurantId ? '<a href="restaurant.html" class="nav-link">🏪 لوحة المطعم</a>' : ''}
       ${u.role === 'driver' ? '<a href="delivery.html" class="nav-link">🛵 صفحة المندوب</a>' : ''}
       <a href="#/offers" class="nav-link" data-drawer-label="🔥 عروض وخصومات">🔥 العروض</a>
       <a href="#/orders" class="nav-link" data-drawer-label="🧾 طلباتي">طلباتي</a>
       <a href="#/favorites" class="nav-link" title="المفضلة" aria-label="المفضلة" data-drawer-label="❤️ المفضلة">❤️</a>
       <a href="#/support" class="nav-link" title="خدمة العملاء" data-drawer-label="🎧 خدمة العملاء">🎧</a>
       <a href="#/account" class="nav-link">👤 ${esc(u.name.split(' ')[0] || 'حسابي')}${u.username ? ` <span class="uname">@${esc(u.username)}</span>` : ''}</a>`
    : u === null ? `<a href="#/offers" class="nav-link" data-drawer-label="🔥 عروض وخصومات">🔥 العروض</a>
       <a href="#/login" class="nav-link" data-drawer-label="🔑 دخول / حساب جديد">دخول</a>` : '';
}

// ---------- الرئيسية ----------

function renderHome() {
  if (!state.restaurants || !state.settings) { app.innerHTML = loader(); return; }
  const activeFilters = [ui.openOnly, ui.promoOnly, ui.topRated, ui.priceMin, ui.priceMax].filter(Boolean).length;

  // الحاجات الثابتة (البحث والفلاتر) بترسم مرة، والنتايج بس اللي بتتحدث وإنت بتكتب
  app.innerHTML = `
    ${demoBanner(isDemo)}
    <section class="hero">
      <h1>جعان؟ اطلب أكلك المفضل وهيوصلك لحد الباب 🛵</h1>
      <div class="search">
        <input id="search" type="search" placeholder="دوّر على مطعم أو أكلة... (مثال: شاورما، بيتزا، كشري)" value="${esc(ui.query)}" autocomplete="off" enterkeyhint="search">
        <button class="btn filter-btn ${ui.showFilters ? 'active' : ''}" id="toggleFilters" type="button">⚙️ فلترة${activeFilters ? ` <span class="badge static">${activeFilters}</span>` : ''}</button>
      </div>
      ${activeZones(state.settings).length ? `
        <label class="home-zone">📍 بتطلب لفين؟
          <select id="homeZone" aria-label="منطقة التوصيل">
            <option value="">كل المناطق</option>
            ${activeZones(state.settings).map((z) => `<option value="${z.id}" ${Cart.zoneId === z.id ? 'selected' : ''}>${esc(z.name)}</option>`).join('')}
          </select>
        </label>` : ''}
    </section>

    <section class="panel filters" id="filters" ${ui.showFilters ? '' : 'hidden'}>
      <div class="chips">
        <label class="chip check-chip"><input type="checkbox" data-filter="openOnly" ${ui.openOnly ? 'checked' : ''}> 🟢 مفتوح دلوقتي</label>
        <label class="chip check-chip"><input type="checkbox" data-filter="promoOnly" ${ui.promoOnly ? 'checked' : ''}> 🏷️ عليه عرض</label>
        <label class="chip check-chip"><input type="checkbox" data-filter="topRated" ${ui.topRated ? 'checked' : ''}> ⭐ تقييم 4 وأكتر</label>
      </div>
      <div class="filter-row">
        <label>السعر من<input type="number" min="0" inputmode="numeric" data-filter="priceMin" value="${esc(ui.priceMin)}" placeholder="0"></label>
        <label>إلى<input type="number" min="0" inputmode="numeric" data-filter="priceMax" value="${esc(ui.priceMax)}" placeholder="أي سعر"></label>
        <label>الترتيب
          <select data-filter="sort">
            ${Object.entries(SORTS).map(([v, l]) => `<option value="${v}" ${ui.sort === v ? 'selected' : ''}>${l}</option>`).join('')}
          </select>
        </label>
        <button class="link danger" id="clearFilters" type="button">مسح الفلاتر</button>
      </div>
    </section>

    <section class="trust-strip" aria-label="ليه أريفو">
      <span>✅ مفيش رسوم مخفية</span>
      <span>🧾 راجع طلبك قبل ما تدفع</span>
      <span>💸 الاسترجاع بنفس طريقة الدفع</span>
      <span>🎧 موظف حقيقي بيرد عليك</span>
    </section>

    <section class="cats">
      ${CATEGORIES.map((c) => `
        <button class="cat ${ui.category === c.id ? 'active' : ''}" data-cat="${c.id}" type="button">
          <span class="cat-icon">${c.icon}</span><span>${c.name}</span>
        </button>`).join('')}
    </section>

    <div id="results"></div>
    ${joinCards()}`;

  drawResults();

  document.getElementById('homeZone')?.addEventListener('change', (e) => { Cart.setZone(e.target.value); drawResults(); });
  const search = document.getElementById('search');
  search.addEventListener('input', () => { ui.query = search.value; ui.showAllItems = false; drawResults(); });
  document.getElementById('toggleFilters').addEventListener('click', () => { ui.showFilters = !ui.showFilters; renderHome(); });
  app.querySelectorAll('[data-filter]').forEach((inp) => inp.addEventListener(inp.type === 'number' ? 'input' : 'change', () => {
    ui[inp.dataset.filter] = inp.type === 'checkbox' ? inp.checked : inp.value;
    drawResults();
    const n = [ui.openOnly, ui.promoOnly, ui.topRated, ui.priceMin, ui.priceMax].filter(Boolean).length;
    document.getElementById('toggleFilters').innerHTML = `⚙️ فلترة${n ? ` <span class="badge static">${n}</span>` : ''}`;
  }));
  document.getElementById('clearFilters').addEventListener('click', () => {
    Object.assign(ui, { openOnly: false, promoOnly: false, topRated: false, priceMin: '', priceMax: '', sort: 'recommended' });
    renderHome();
  });
  app.querySelectorAll('.cat').forEach((b) => b.addEventListener('click', () => { ui.category = b.dataset.cat; renderHome(); }));
}

// نتايج البحث: الأصناف اللي بتدوّر عليها، والمطاعم
function drawResults() {
  const box = document.getElementById('results');
  if (!box) return;
  const q = ui.query.trim();
  // المطاعم اللي لسه مضافلهاش أصناف أو موقوفة مش بتظهر للعملاء
  const visible = state.restaurants.filter((r) => !r.blocked && r.menu.some((sec) => sec.items.length) &&
    (ui.category === 'all' || r.category === ui.category) &&
    (!ui.openOnly || r.isOpen !== false) &&
    (!ui.promoOnly || hasOffers(r)) &&
    (!ui.topRated || ratingValue(r) >= 4));

  // الأصناف اللي بتطابق البحث (بتظهر بس لو فيه بحث أو فلتر سعر)
  const wantItems = q || ui.priceMin || ui.priceMax;
  let items = wantItems ? visible.flatMap((r) => r.menu.flatMap((sec) => sec.items
    .filter((it) => isAvailable(it) && inPriceRange(priceOf(it), ui) && matches(q, it.name, it.desc, sec.section))
    .map((it) => ({ it, r })))) : [];

  let list = visible.filter((r) => (!q || matches(q, r.name, r.tags || [], CATEGORIES.find((c) => c.id === r.category)?.name || '')
      || items.some((x) => x.r.id === r.id))
    && (!(ui.priceMin || ui.priceMax) || r.menu.some((sec) => sec.items.some((it) => isAvailable(it) && inPriceRange(priceOf(it), ui)))));

  const byOpen = (a, b) => (b.isOpen !== false) - (a.isOpen !== false);
  if (ui.sort === 'rating') { list.sort((a, b) => ratingValue(b) - ratingValue(a)); items.sort((a, b) => ratingValue(b.r) - ratingValue(a.r)); }
  if (ui.sort === 'time') { list.sort((a, b) => restTime(a)[0] - restTime(b)[0]); items.sort((a, b) => restTime(a.r)[0] - restTime(b.r)[0]); }
  if (ui.sort === 'price_low') { list.sort((a, b) => minPrice(a) - minPrice(b)); items.sort((a, b) => priceOf(a.it) - priceOf(b.it)); }
  if (ui.sort === 'price_high') { list.sort((a, b) => minPrice(b) - minPrice(a)); items.sort((a, b) => priceOf(b.it) - priceOf(a.it)); }
  list.sort(byOpen);
  items.sort((a, b) => byOpen(a.r, b.r));
  // المطاعم اللي مش بتوصّل لمنطقتك في الآخر
  list.sort((a, b) => outOfZone(a) - outOfZone(b));
  items.sort((a, b) => outOfZone(a.r) - outOfZone(b.r));

  const ITEMS_PREVIEW = 12;
  const shownItems = ui.showAllItems ? items : items.slice(0, ITEMS_PREVIEW);

  // شريط العروض: بيظهر في الرئيسية لما مفيش بحث
  const deals = wantItems ? [] : dealsList(visible);
  const favs = wantItems || ui.category !== 'all' ? [] : favoriteRestaurants();
  box.innerHTML = `
    ${favs.length ? `
      <div class="list-head"><h2>❤️ مطاعمك المفضلة</h2><a href="#/favorites" class="link">عرض الكل ←</a></div>
      <section class="fav-strip">${favs.slice(0, 12).map((r) => `
        <a class="fav-chip ${r.isOpen === false ? 'closed' : ''}" href="#/restaurant/${r.id}">
          <span class="fav-logo" style="background:${esc(r.color)}">${restaurantLogo(r, 56)}</span>
          <b>${esc(r.name)}</b>
          <small class="muted">${r.isOpen === false ? 'مغلق' : `🕒 ${restTime(r)[0]}-${restTime(r)[1]} د`}</small>
        </a>`).join('')}</section>` : ''}
    ${deals.length ? `
      <div class="list-head"><h2>🔥 عروض وخصومات</h2><a href="#/offers" class="link">عرض الكل ←</a></div>
      <section class="deals-strip">${deals.slice(0, 12).map(itemCard).join('')}</section>` : ''}
    ${wantItems ? `
      <div class="list-head"><h2>🍽️ ${items.length} صنف</h2></div>
      ${items.length ? `<section class="item-grid">${shownItems.map(itemCard).join('')}</section>
        ${items.length > ITEMS_PREVIEW && !ui.showAllItems ? `<button class="btn block" id="showAllItems" type="button">عرض كل الأصناف (${items.length})</button>` : ''}`
        : '<p class="muted">مفيش أصناف مطابقة.</p>'}` : ''}
    <div class="list-head"><h2>🏪 ${list.length} مطعم</h2></div>
    <section class="grid">
      ${list.length ? list.map(restaurantCard).join('')
        : `<p class="empty">${state.restaurants.length ? 'مفيش نتائج مطابقة 😕 جرّب كلمة تانية أو امسح الفلاتر' : 'مفيش مطاعم لسه.'}</p>`}
    </section>`;

  box.querySelector('#showAllItems')?.addEventListener('click', () => { ui.showAllItems = true; drawResults(); });
  box.querySelectorAll('[data-quick-add]').forEach((b) => b.addEventListener('click', (e) => {
    e.preventDefault();
    quickAdd(b.dataset.quickAdd, drawResults);
  }));
}

function itemCard({ it, r }) {
  const closed = r.isOpen === false;
  const qty = Cart.restaurantId === r.id ? Cart.qty(it.id) : 0;
  return `
    <a class="item-card ${closed ? 'closed' : ''}" href="#/restaurant/${r.id}">
      <div class="item-img">${itemImage(it, 90)}${activeOffer(it) ? `<span class="off-badge">-${activeOffer(it).pct}%</span>` : ''}</div>
      <div class="grow">
        <b>${esc(it.name)}</b>
        <div class="muted small clamp">${esc(it.desc)}</div>
        <div class="small">${esc(r.emoji)} ${esc(r.name)}${closed ? ' • <span class="warn-text">مغلق</span>' : ''}</div>
        <div class="item-card-foot">
          ${priceHtml(it)}
          ${closed ? '' : `<button class="add-btn" data-quick-add="${r.id}:${it.id}" type="button">${qty ? `✓ ${qty} في السلة +` : '+ إضافة'}</button>`}
        </div>
      </div>
    </a>`;
}

// الأصناف اللي عليها خصم في المطاعم الظاهرة (المفتوح الأول، والخصم الأكبر الأول)
function dealsList(restaurants) {
  return restaurants.flatMap((r) => offerItems(r).map((it) => ({ it, r })))
    .sort((a, b) => (b.r.isOpen !== false) - (a.r.isOpen !== false) || activeOffer(b.it).pct - activeOffer(a.it).pct);
}

// ---------- صفحة العروض ----------

function renderOffers() {
  if (!state.restaurants || !state.settings) { app.innerHTML = loader(); return; }
  const visible = state.restaurants.filter((r) => !r.blocked && r.menu.some((sec) => sec.items.length));
  const deals = dealsList(visible);
  const promos = visible.filter((r) => r.promo).sort((a, b) => (b.isOpen !== false) - (a.isOpen !== false));
  app.innerHTML = `
    <a href="#/" class="back">→ رجوع للرئيسية</a>
    <section class="hero offers-hero">
      <h1>🔥 عروض وخصومات</h1>
      <p>كل الخصومات اللي المطاعم عاملاها دلوقتي في مكان واحد.</p>
    </section>
    ${promos.length ? `
      <div class="list-head"><h2>🏷️ عروض المطاعم</h2></div>
      <section class="grid">${promos.map(restaurantCard).join('')}</section>` : ''}
    <div class="list-head"><h2>💸 أصناف عليها خصم (${deals.length})</h2></div>
    ${deals.length ? `<section class="item-grid">${deals.map(itemCard).join('')}</section>`
      : '<p class="empty">مفيش خصومات على أصناف دلوقتي. ارجع تاني قريب 😉</p>'}`;
  app.querySelectorAll('[data-quick-add]').forEach((b) => b.addEventListener('click', (e) => {
    e.preventDefault();
    quickAdd(b.dataset.quickAdd, renderOffers);
  }));
  updateCartBar();
}

// إضافة صنف للسلة (مع سؤال لو السلة فيها أصناف من مطعم تاني). key = الصنف + اختياراته
function addToCart(r, key, count = 1) {
  if (!Cart.add(r.id, key, false, count)) {
    const other = cartRestaurant();
    if (!confirm(`السلة فيها أصناف من "${other?.name || 'مطعم تاني'}". تحب تفضّيها وتبدأ طلب جديد من "${r.name}"؟`)) return false;
    Cart.add(r.id, key, true, count);
  }
  toast('تمت الإضافة للسلة ✅');
  return true;
}

// زرار "إضافة" من كارت صنف: لو الصنف ليه اختيارات بنفتح شاشة الاختيار
function quickAdd(ref, redraw) {
  const [rid, itemId] = ref.split(':');
  const r = findRestaurant(rid);
  const it = r?.menu.flatMap((sec) => sec.items).find((x) => x.id === itemId);
  if (!it) return;
  if (hasOptions(it)) openItemSheet(r, it, redraw);
  else if (addToCart(r, itemId)) redraw();
}

// شاشة اختيار الحجم والإضافات (من تحت على الموبايل)
function openItemSheet(r, it, onDone) {
  if (r.isOpen === false || r.blocked) { toast('المطعم مغلق دلوقتي'); return; }
  const groups = (it.options || []).filter((g) => (g.choices || []).length);
  const sel = {};
  let qty = 1;
  // الاختيار الإجباري الواحد: نختار أول اختيار متاح عشان العميل يكمّل بسرعة
  groups.forEach((g) => {
    const first = g.choices.find((c) => c.available !== false);
    if (g.required && !g.multi && first) sel[g.id] = [first.id];
  });
  const back = document.createElement('div');
  back.className = 'sheet-backdrop';
  const sh = document.createElement('div');
  sh.className = 'sheet';
  sh.setAttribute('role', 'dialog');
  sh.setAttribute('aria-modal', 'true');
  sh.setAttribute('aria-label', it.name);
  document.body.append(back, sh);
  document.body.classList.add('sheet-open');
  const close = () => {
    back.remove(); sh.remove();
    document.body.classList.remove('sheet-open');
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('hashchange', close);
    opener?.focus?.({ preventScroll: true });
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  window.addEventListener('keydown', onKey);
  window.addEventListener('hashchange', close);
  back.addEventListener('click', close);

  const pg = priceGroup(it);
  const opener = document.activeElement;
  const draw = (focusValue) => {
    const res = resolveOptions(it, sel);
    const unit = res.ok ? linePrice(it, res).price : priceOf(it);
    const scroll = sh.querySelector('.sheet-body')?.scrollTop || 0; // منرجعش لفوق مع كل اختيار
    sh.innerHTML = `
      <div class="sheet-head">
        <div class="item-img">${itemImage(it, 90)}</div>
        <div class="grow"><h3>${esc(it.name)}</h3><p class="muted small">${esc(it.desc)}</p>${priceHtml(it)}</div>
        <button class="drawer-close" type="button" data-close aria-label="قفل">✕</button>
      </div>
      <div class="sheet-body">
        ${groups.map((g) => `
          <fieldset class="opt-group">
            <legend>${esc(g.name)} <small class="${g.required ? 'req' : ''}">${g.required ? 'إجباري' : 'اختياري'}${g.multi && Number(g.max) > 0 ? ` • لحد ${g.max}` : g.multi ? ' • اختار اللي تحبه' : ''}</small></legend>
            ${g.choices.map((c) => `
              <label class="opt-choice ${c.available === false ? 'off' : ''}">
                <input type="${g.multi ? 'checkbox' : 'radio'}" name="g-${esc(g.id)}" value="${esc(c.id)}" data-g="${esc(g.id)}"
                  ${(sel[g.id] || []).includes(c.id) ? 'checked' : ''} ${c.available === false ? 'disabled' : ''}>
                <span class="grow">${esc(c.name)}${c.available === false ? ' <small class="muted">(خلص)</small>' : ''}</span>
                <b>${g === pg ? fmt(c.price) : Number(c.price) ? `+ ${fmt(c.price)}` : ''}</b>
              </label>`).join('')}
          </fieldset>`).join('')}
      </div>
      <div class="sheet-foot">
        <div class="qty">
          <button type="button" data-q="-1" aria-label="نقص" ${qty <= 1 ? 'disabled' : ''}>−</button><span aria-live="polite">${qty}</span><button type="button" data-q="1" aria-label="زود">+</button>
        </div>
        <button class="btn primary grow" type="button" data-confirm ${res.ok ? '' : 'disabled'}>${res.ok ? `أضف للسلة • ${fmt(unit * qty)}` : esc(res.error)}</button>
      </div>`;
    sh.querySelector('.sheet-body').scrollTop = scroll;
    if (focusValue) sh.querySelector(`input[value="${CSS.escape(focusValue)}"]`)?.focus({ preventScroll: true });
    sh.querySelector('[data-close]').addEventListener('click', close);
    sh.querySelectorAll('[data-q]').forEach((b) => b.addEventListener('click', () => { qty = Math.max(1, qty + Number(b.dataset.q)); draw(); }));
    sh.querySelectorAll('input[data-g]').forEach((inp) => inp.addEventListener('click', (e) => {
      const g = groups.find((x) => x.id === inp.dataset.g);
      const cur = sel[g.id] || [];
      if (g.multi) {
        if (inp.checked && Number(g.max) > 0 && cur.length >= Number(g.max)) {
          e.preventDefault();
          toast(`أقصى حاجة ${g.max} من ${g.name}`);
          return;
        }
        sel[g.id] = inp.checked ? [...cur, inp.value] : cur.filter((id) => id !== inp.value);
      } else {
        // اختيار اختياري واحد: دوسة تانية على نفس الاختيار بتشيله
        sel[g.id] = !g.required && cur.includes(inp.value) ? [] : [inp.value];
      }
      draw(inp.value);
    }));
    sh.querySelector('[data-confirm]').addEventListener('click', () => {
      if (!resolveOptions(it, sel).ok) return;
      if (addToCart(r, lineKey(it.id, sel), qty)) { close(); onDone?.(); }
    });
  };
  draw();
  sh.querySelector('[data-close]').focus({ preventScroll: true });
}

// ---------- المفضلة ----------

const MAX_FAVORITES = 50;
const favorites = () => state.user?.favorites || [];
const isFavorite = (id) => favorites().includes(id);

function favBtn(id, big = false) {
  const on = isFavorite(id);
  return `<button class="fav-btn ${big ? 'big' : ''} ${on ? 'on' : ''}" data-fav="${esc(id)}" type="button"
    aria-pressed="${on}" aria-label="${on ? 'شيل من المفضلة' : 'ضيف للمفضلة'}" title="${on ? 'شيل من المفضلة' : 'ضيف للمفضلة'}">${on ? '❤️' : '🤍'}</button>`;
}

// كل القلوب اللي في الصفحة بتتحدث مع بعض
function paintFavs(id) {
  const on = isFavorite(id);
  app.querySelectorAll(`[data-fav="${CSS.escape(id)}"]`).forEach((b) => {
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', on);
    b.ariaLabel = b.title = on ? 'شيل من المفضلة' : 'ضيف للمفضلة';
    b.textContent = on ? '❤️' : '🤍';
  });
}

// الرئيسية بنحدث النتايج بس (عشان البحث والسكرول ميتغيروش)، وصفحة المفضلة كلها
function redrawFavorites() {
  if (page === '') drawResults();
  if (page === 'favorites') renderFavorites();
}

async function toggleFavorite(id) {
  if (!state.user) {
    toast('سجّل دخولك الأول عشان تحفظ مطاعمك المفضلة ❤️');
    location.hash = '#/login/favorites';
    return;
  }
  const on = !isFavorite(id);
  if (on && favorites().length >= MAX_FAVORITES) return toast(`أقصى عدد ${MAX_FAVORITES} مطعم في المفضلة`);
  const before = favorites();
  // بنغيّر على طول ومنستناش السيرفر، ولو فشل نرجّعه
  state.user = { ...state.user, favorites: on ? [...before, id] : before.filter((x) => x !== id) };
  paintFavs(id);
  toast(on ? 'اتضاف للمفضلة ❤️' : 'اتشال من المفضلة');
  redrawFavorites();
  try {
    await backend.setFavorite(state.user.uid, id, on);
  } catch (err) {
    state.user = { ...state.user, favorites: before };
    paintFavs(id);
    redrawFavorites();
    toast(errorMessage(err));
  }
}

// القلب جوه كارت المطعم (اللي هو لينك)، فمنخليش الدوسة تفتح المطعم
app.addEventListener('click', (e) => {
  const b = e.target.closest('[data-fav]');
  if (!b) return;
  e.preventDefault();
  e.stopPropagation();
  toggleFavorite(b.dataset.fav);
});

// المطاعم المفضلة اللي لسه ظاهرة للعملاء، بنفس ترتيب الإضافة (الأحدث الأول)
const favoriteRestaurants = () => favorites().slice().reverse()
  .map((id) => state.restaurants.find((r) => r.id === id))
  .filter((r) => r && !r.blocked && r.menu.some((sec) => sec.items.length));

function renderFavorites() {
  if (state.user === undefined || !state.restaurants || !state.settings) { app.innerHTML = loader(); return; }
  if (!state.user) { location.hash = '#/login/favorites'; return; }
  const list = favoriteRestaurants();
  list.sort((a, b) => (b.isOpen !== false) - (a.isOpen !== false));
  app.innerHTML = `
    <a href="#/" class="back">→ رجوع للرئيسية</a>
    <h1 class="page-title">❤️ المفضلة</h1>
    ${list.length ? `<section class="grid">${list.map(restaurantCard).join('')}</section>`
      : `<div class="panel empty-state">
          <div class="big">🤍</div>
          <p>لسه مضفتش مطاعم للمفضلة.</p>
          <p class="muted">دوس على القلب 🤍 اللي على أي مطعم، وهتلاقيه هنا على طول المرة الجاية.</p>
          <a href="#/" class="btn primary">تصفح المطاعم</a>
        </div>`}`;
}

function restaurantCard(r) {
  const closed = r.isOpen === false;
  return `
    <a class="card ${closed || outOfZone(r) ? 'closed' : ''}" href="#/restaurant/${r.id}">
      <div class="card-cover" style="background:${esc(r.color)}">${restaurantLogo(r, 140)}
        ${favBtn(r.id)}
        ${closed ? '<span class="closed-tag">مغلق الآن</span>' : outOfZone(r) ? `<span class="closed-tag">🚫 مش بيوصّل لـ ${esc(zoneName(Cart.zoneId))}</span>` : hasOffers(r) ? `<span class="promo">🏷️ ${promoText(r)}</span>` : ''}
      </div>
      <div class="card-body">
        <div class="card-title">
          <h3>${esc(r.name)}</h3>
          <span class="rating">${ratingBadge(r)}</span>
        </div>
        <p class="muted">${esc((r.tags || []).join(' • '))}</p>
        <p class="meta">🕒 ${restTime(r)[0]}-${restTime(r)[1]} دقيقة${busyExtra(r) ? ' • <span class="busy-tag">🐢 زحمة</span>' : ''}${deliveryMeta()}</p>
      </div>
    </a>`;
}

// ---------- صفحة المطعم ----------

function renderRestaurant(id) {
  if (!state.restaurants || !state.settings) { app.innerHTML = loader(); return; }
  const r = findRestaurant(id);
  if (!r || r.blocked) return renderNotFound();
  const closed = r.isOpen === false;
  if (menuUi.rid !== r.id) Object.assign(menuUi, { rid: r.id, query: '', sort: 'default', availableOnly: false });

  app.innerHTML = `
    <a href="#/" class="back">→ رجوع للمطاعم</a>
    <section class="rest-header" style="background:${esc(r.color)}">
      <div class="rest-emoji">${restaurantLogo(r, 110)}</div>
      <div>
        <h1>${esc(r.name)} ${favBtn(r.id, true)}</h1>
        <p>${esc((r.tags || []).join(' • '))}</p>
        <p class="meta">${ratingOf(r).avg ? `⭐ ${ratingOf(r).avg.toLocaleString('ar-EG')} (${ratingOf(r).count.toLocaleString('ar-EG')} تقييم) • ` : ''}🕒 ${restTime(r)[0]}-${restTime(r)[1]} دقيقة${deliveryMeta()} • الحد الأدنى ${fmt(r.minOrder)}</p>
        ${hasOffers(r) ? `<span class="promo static">🏷️ ${promoText(r)}</span>` : ''}
      </div>
    </section>
    ${outOfZone(r) ? `<p class="warn">🚫 ${esc(r.name)} مش بيوصّل لـ ${esc(zoneName(Cart.zoneId))}. تقدر تتفرج على المنيو، أو تغيّر منطقتك من الرئيسية.</p>` : ''}
    ${closed ? '<p class="warn">🔒 المطعم مغلق حاليًا ومش بيستقبل طلبات. تقدر تتفرج على المنيو.</p>'
      : busyExtra(r) ? `<p class="busy-note">🐢 المطعم عليه زحمة دلوقتي، فالطلب ممكن ياخد ${restTime(r)[0]}-${restTime(r)[1]} دقيقة. بنقولك الوقت الحقيقي من الأول.</p>` : ''}

    <div class="menu-tools">
      <input id="menuSearch" type="search" placeholder="🔍 دوّر في منيو ${esc(r.name)}..." value="${esc(menuUi.query)}" autocomplete="off">
      <select id="menuSort" aria-label="ترتيب المنيو">
        ${[['default', 'ترتيب المنيو'], ['price_low', 'الأرخص الأول'], ['price_high', 'الأغلى الأول']]
          .map(([v, l]) => `<option value="${v}" ${menuUi.sort === v ? 'selected' : ''}>${l}</option>`).join('')}
      </select>
      <label class="chip check-chip"><input type="checkbox" id="menuAvailable" ${menuUi.availableOnly ? 'checked' : ''}> المتاح بس</label>
    </div>

    <nav class="sections-nav">
      ${r.menu.map((sec, i) => `<a href="#sec-${i}" data-scroll="sec-${i}">${esc(sec.section)}</a>`).join('')}
    </nav>

    <div class="menu-layout">
      <div class="menu" id="menuList"></div>
      <aside class="side-cart" id="sideCart"></aside>
    </div>
    <section class="panel reviews-box" id="reviewsBox" hidden></section>`;

  setCleanup(backend.watchRestaurantReviews(r.id, (list) => drawReviews(r, list)));
  app.querySelectorAll('[data-scroll]').forEach((a) => a.addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById(a.dataset.scroll)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));
  document.getElementById('menuSearch').addEventListener('input', (e) => { menuUi.query = e.target.value; drawMenu(r); });
  document.getElementById('menuSort').addEventListener('change', (e) => { menuUi.sort = e.target.value; drawMenu(r); });
  document.getElementById('menuAvailable').addEventListener('change', (e) => { menuUi.availableOnly = e.target.checked; drawMenu(r); });
  drawMenu(r);
}

// آراء العملاء (آخر 10 فيهم تعليق أو تقييم)
function drawReviews(r, list) {
  const box = document.getElementById('reviewsBox');
  if (!box) return;
  const { avg, count, real } = ratingOf(r);
  box.hidden = !list.length;
  if (!list.length) return;
  box.innerHTML = `
    <div class="list-head"><h2>⭐ آراء العملاء</h2>${real ? `<span class="rating-big">${avg.toLocaleString('ar-EG')} <small class="muted">من ${count.toLocaleString('ar-EG')} تقييم</small></span>` : ''}</div>
    ${list.slice(0, 10).map((x) => `
      <div class="review-row">
        <div class="review-head"><span class="stars" aria-label="${x.food} من 5">${stars(x.food)}</span>
          <b>${esc(x.name || 'عميل')}</b> <span class="muted small">${timeAgo(x.createdAt)}</span></div>
        ${x.comment ? `<p>${esc(x.comment)}</p>` : ''}
      </div>`).join('')}`;
}

// المنيو بعد البحث والفلترة (بيتحدث لوحده من غير ما خانة البحث تتمسح)
function drawMenu(r) {
  const closed = r.isOpen === false;
  const inCart = Cart.restaurantId === r.id;
  const filterItems = (sec) => {
    const list = sec.items.filter((it) => (!menuUi.availableOnly || isAvailable(it))
      && matches(menuUi.query, it.name, it.desc, sec.section));
    if (menuUi.sort === 'price_low') list.sort((a, b) => priceOf(a) - priceOf(b));
    if (menuUi.sort === 'price_high') list.sort((a, b) => priceOf(b) - priceOf(a));
    return list;
  };
  let sections = r.menu.map((sec, i) => ({ sec, i, items: filterItems(sec) })).filter((x) => x.items.length);
  // الترتيب بالسعر: قايمة واحدة لكل الأصناف بدل ما يترتبوا جوه كل قسم لوحده
  if (menuUi.sort !== 'default' && sections.length) {
    const all = sections.flatMap((x) => x.items).sort((a, b) => (menuUi.sort === 'price_low' ? priceOf(a) - priceOf(b) : priceOf(b) - priceOf(a)));
    sections = [{ sec: { section: menuUi.sort === 'price_low' ? 'كل الأصناف (من الأرخص)' : 'كل الأصناف (من الأغلى)' }, i: 'all', items: all }];
  }
  const filtering = menuUi.query.trim() || menuUi.availableOnly;

  document.getElementById('menuList').innerHTML = `
    ${filtering ? `<p class="muted small">${sections.reduce((n, x) => n + x.items.length, 0)} صنف مطابق</p>` : ''}
    ${sections.map(({ sec, i, items }) => `
      <section class="menu-section" id="sec-${i}">
        <h2>${esc(sec.section)}</h2>
        ${items.map((it) => {
          const qty = inCart ? Cart.qty(it.id) : 0;
          const can = !closed && isAvailable(it);
          return `
          <div class="item ${isAvailable(it) ? '' : 'unavailable'}">
            <div class="item-info">
              <h3>${esc(it.name)}</h3>
              <p class="muted">${esc(it.desc)}</p>
              ${priceHtml(it)}${activeOffer(it)?.until ? ` <span class="muted small">(${untilLabel(activeOffer(it).until)})</span>` : ''}
              ${hasOptions(it) ? '<div class="muted small">🧩 فيه اختيارات وإضافات</div>' : ''}
            </div>
            <div class="item-side">
              <div class="item-img">${itemImage(it)}</div>
              ${!isAvailable(it) ? '<span class="muted small">غير متاح</span>'
                : hasOptions(it) ? `<button class="add-btn" data-opt="${it.id}" type="button" ${can ? '' : 'disabled'}>${qty ? `✓ ${qty} • + إضافة` : '+ إضافة'}</button>`
                : qty ? `<div class="qty">
                     <button data-dec="${it.id}" type="button" aria-label="نقص">−</button>
                     <span>${qty}</span>
                     <button data-inc="${it.id}" type="button" aria-label="زود" ${can ? '' : 'disabled'}>+</button>
                   </div>`
                : `<button class="add-btn" data-add="${it.id}" type="button" ${can ? '' : 'disabled'}>+ إضافة</button>`}
            </div>
          </div>`;
        }).join('')}
      </section>`).join('') || '<p class="empty">مفيش أصناف مطابقة 😕</p>'}`;
  document.getElementById('sideCart').innerHTML = miniCart();
  updateCartBar();

  const list = document.getElementById('menuList');
  list.querySelectorAll('[data-add], [data-inc]').forEach((b) => b.addEventListener('click', () => {
    if (addToCart(r, b.dataset.add || b.dataset.inc)) drawMenu(r);
  }));
  list.querySelectorAll('[data-dec]').forEach((b) => b.addEventListener('click', () => {
    Cart.setQty(b.dataset.dec, Cart.lineQty(b.dataset.dec) - 1);
    drawMenu(r);
  }));
  list.querySelectorAll('[data-opt]').forEach((b) => b.addEventListener('click', () => {
    openItemSheet(r, r.menu.flatMap((sec) => sec.items).find((x) => x.id === b.dataset.opt), () => drawMenu(r));
  }));
}

function miniCart() {
  const r = cartRestaurant();
  const lines = Cart.lines(r);
  if (!lines.length) return '<h3>سلتك</h3><p class="muted">السلة فاضية. ضيف أصناف من المنيو.</p>';
  const t = cartTotals(r);
  return `
    <h3>سلتك من ${esc(r.name)}</h3>
    ${lines.map((l) => `<div class="mini-line"><span>${l.qty}× ${esc(l.item.name)}${lineOptions(l)}</span><span>${fmt(l.item.price * l.qty)}</span></div>`).join('')}
    <div class="mini-line total"><span>المجموع الفرعي</span><span>${fmt(t.subtotal)}</span></div>
    <a href="#/cart" class="btn primary block">اذهب للسلة (${Cart.count()})</a>`;
}

// ---------- السلة ----------

function renderCart() {
  if (!state.restaurants || !state.settings) { app.innerHTML = loader(); return; }
  const r = cartRestaurant();
  const lines = Cart.lines(r);
  if (!lines.length) {
    app.innerHTML = `
      <div class="empty-state">
        <div class="big">🛒</div>
        <h2>سلتك فاضية</h2>
        <p class="muted">ابدأ بإضافة أكلك المفضل</p>
        <a href="#/" class="btn primary">تصفح المطاعم</a>
      </div>`;
    return;
  }
  const t = cartTotals(r);
  const perOrder = state.settings.couponsPerOrder;
  // لو الأدمن قلّل عدد الكوبونات المسموح بيها، نشيل الزيادة
  if (Cart.coupons.length > perOrder) Cart.setCoupons(Cart.coupons.slice(0, perOrder));
  const belowMin = t.subtotal < r.minOrder;
  const closed = r.isOpen === false || r.blocked;
  const blocked = belowMin || closed;

  app.innerHTML = `
    <h1 class="page-title">السلة</h1>
    <div class="two-col">
      <section class="panel">
        <div class="panel-head">
          <a href="#/restaurant/${r.id}"><strong>${esc(r.emoji)} ${esc(r.name)}</strong></a>
          <button class="link danger" id="clearCart" type="button">تفضية السلة</button>
        </div>
        ${lines.map((l) => `
          <div class="cart-line">
            <div class="item-img sm">${itemImage(l.item, 52)}</div>
            <div class="grow">
              <strong>${esc(l.item.name)}</strong>${lineOptions({ ...l, note: '' })}
              <div class="line-note-box" data-note-box="${esc(l.key)}">${l.note
                ? `<span class="line-note">📝 ${esc(l.note)}</span> <button class="link small" data-note="${esc(l.key)}" type="button">تعديل</button>`
                : `<button class="link small" data-note="${esc(l.key)}" type="button">📝 ضيف ملاحظة للصنف ده</button>`}</div>
              <div class="muted">${fmt(l.item.price)}${l.item.fullPrice > l.item.price ? ` <s class="old-price">${fmt(l.item.fullPrice)}</s>` : ''}</div>
            </div>
            <div class="qty">
              <button data-dec="${esc(l.key)}" type="button" aria-label="نقص">−</button>
              <span>${l.qty}</span>
              <button data-inc="${esc(l.key)}" type="button" aria-label="زود">+</button>
            </div>
            <strong class="line-total">${fmt(l.item.price * l.qty)}</strong>
          </div>`).join('')}
        <a href="#/restaurant/${r.id}" class="link">+ ضيف أصناف تانية</a>
      </section>

      <section class="panel">
        ${zoneSelect()}
        ${perOrder ? couponBox(r, t) : ''}
        ${summary(t, currentZone(), Cart.usableCoupons(r, state.settings).map((c) => c.code))}
        ${REFUND_NOTE}
        ${closed ? '<p class="warn">🔒 المطعم مغلق حاليًا، مش هتقدر تطلب دلوقتي.</p>' : ''}
        ${belowMin ? `<p class="warn">الحد الأدنى للطلب ${fmt(r.minOrder)} — ضيف ${fmt(r.minOrder - t.subtotal)} كمان</p>` : ''}
        <a href="#/checkout" class="btn primary block ${blocked ? 'disabled' : ''}" ${blocked ? 'aria-disabled="true"' : ''}>إتمام الطلب</a>
      </section>
    </div>`;

  app.querySelectorAll('[data-inc]').forEach((b) => b.addEventListener('click', () => {
    Cart.setQty(b.dataset.inc, Cart.lineQty(b.dataset.inc) + 1);
    renderCart();
  }));
  // ملاحظة لكل صنف: بتتكتب في نفس مكانها من غير ما الصفحة تتعاد
  app.querySelectorAll('[data-note]').forEach((b) => b.addEventListener('click', () => {
    const key = b.dataset.note;
    const box = b.closest('[data-note-box]');
    box.innerHTML = `
      <div class="note-edit">
        <input maxlength="${MAX_LINE_NOTE}" placeholder="مثلًا: من غير بصل، صوص زيادة" aria-label="ملاحظة للصنف" value="${esc(Cart.note(key))}">
        <button class="btn small primary" type="button">حفظ</button>
      </div>`;
    const input = box.querySelector('input');
    const done = () => { Cart.setNote(key, input.value); renderCart(); };
    box.querySelector('button').addEventListener('click', done);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); done(); } });
    input.focus();
  }));
  app.querySelectorAll('[data-dec]').forEach((b) => b.addEventListener('click', () => {
    Cart.setQty(b.dataset.dec, Cart.lineQty(b.dataset.dec) - 1);
    renderCart();
  }));
  document.getElementById('clearCart').addEventListener('click', () => {
    if (confirm('متأكد إنك عايز تفضّي السلة؟')) {
      Cart.clear();
      renderCart();
    }
  });
  const form = document.getElementById('promoForm');
  if (form) form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button');
    const code = normalizeCode(document.getElementById('promoInput').value);
    if (!code) return;
    if (Cart.coupons.some((c) => c.code === code)) return toast('الكود ده متطبّق بالفعل');
    btn.disabled = true;
    try {
      Cart.addCoupon(await checkCoupon(code, Cart.subtotal(r)));
      toast('تم تطبيق الكود 🎉');
      renderCart();
    } catch (err) {
      toast(err.message);
      btn.disabled = false;
    }
  });
  app.querySelectorAll('[data-remove-coupon]').forEach((b) => b.addEventListener('click', () => {
    Cart.removeCoupon(b.dataset.removeCoupon);
    renderCart();
  }));
  document.getElementById('zoneSelect')?.addEventListener('change', (e) => { Cart.setZone(e.target.value); renderCart(); });
}

// خانة كوبونات الخصم في السلة
function couponBox(r, t) {
  const perOrder = state.settings.couponsPerOrder;
  const subtotal = Cart.subtotal(r);
  const delivery = t.delivery;
  return `
    <h3>كوبون الخصم</h3>
    ${Cart.coupons.map((c) => {
      const problem = couponProblem(c, { subtotal });
      return `<div class="promo-applied ${problem ? 'off' : ''}">
        <span>${problem ? '⚠️' : '✅'} <b dir="ltr">${esc(c.code)}</b> — ${esc(couponLabel(c))}
          ${problem ? `<small>${esc(problem)}</small>` : `<small>وفّرت ${fmt(couponDiscount(c, subtotal, delivery))}</small>`}</span>
        <button class="link danger" data-remove-coupon="${esc(c.code)}" type="button">إزالة</button>
      </div>`;
    }).join('')}
    ${Cart.coupons.length < perOrder ? `
      <form class="promo-form" id="promoForm">
        <input id="promoInput" placeholder="اكتب كود الخصم" autocomplete="off" autocapitalize="characters" dir="ltr" aria-label="كود الخصم">
        <button class="btn" type="submit">تطبيق</button>
      </form>
      ${perOrder > 1 ? `<p class="muted small">تقدر تستخدم لحد ${perOrder} كوبون في الطلب.</p>` : ''}` : ''}`;
}

// بيجيب الكوبون ويتأكد إنه ينفع، أو بيرمي رسالة الخطأ
async function checkCoupon(code, subtotal) {
  let c;
  try {
    c = await backend.getCoupon(code);
  } catch {
    throw new Error('مقدرناش نتأكد من الكود، جرّب تاني');
  }
  const problem = couponProblem(c, { subtotal });
  if (problem) throw new Error(problem);
  if (c.onePerCustomer && state.user && await backend.hasUsedCoupon(state.user.uid, code)) {
    throw new Error('إنت استخدمت الكود ده قبل كده');
  }
  return c;
}

// قبل الطلب: نجيب الكوبونات تاني من السيرفر (يمكن الأدمن وقفها أو خلصت)
async function refreshCoupons(rest) {
  const subtotal = Cart.subtotal(rest);
  const fresh = [];
  const problems = [];
  for (const c of Cart.coupons.slice(0, state.settings.couponsPerOrder)) {
    try {
      fresh.push(await checkCoupon(c.code, subtotal));
    } catch (err) {
      problems.push(`${c.code}: ${err.message}`);
    }
  }
  Cart.setCoupons(fresh);
  return problems;
}

// zone = null لما المنطقة لسه متختارتش في السلة أو الدفع، ومن غيرها لطلب اتعمل خلاص
function summary(t, zone, codes = []) {
  const delivery = zone === null ? '<span class="muted">اختار منطقتك</span>' : t.delivery ? fmt(t.delivery) : 'مجاني';
  return `
    <div class="summary">
      <div><span>المجموع الفرعي</span><span>${fmt(t.subtotal)}</span></div>
      <div><span>رسوم التوصيل${zone?.name ? ` (${esc(zone.name)})` : ''}</span><span>${delivery}</span></div>
      ${t.service ? `<div><span>رسوم الخدمة</span><span>${fmt(t.service)}</span></div>` : ''}
      ${t.discount ? `<div class="discount"><span>الخصم${codes.length ? ` (<span dir="ltr">${codes.map(esc).join(' + ')}</span>)` : ''}</span><span>− ${fmt(t.discount)}</span></div>` : ''}
      <div class="grand"><span>الإجمالي</span><span>${fmt(t.total)}</span></div>
      ${zone === null ? '' : '<p class="no-hidden">✅ ده الإجمالي النهائي اللي هتدفعه. مفيش رسوم مخفية ولا حاجة هتتزود عند الباب.</p>'}
    </div>`;
}

// سياسة الاسترجاع باختصار (التفاصيل في الشروط)
const REFUND_NOTE = '<p class="refund-note muted small">💸 لو حصلت مشكلة واتفقنا على استرجاع، الفلوس بترجعلك <b>بنفس طريقة الدفع</b> مش رصيد. <a href="terms.html#t6" target="_blank" rel="noopener">سياسة الاسترجاع</a></p>';

// ---------- إتمام الطلب ----------

function renderCheckout() {
  if (!state.restaurants || !state.settings || state.user === undefined) { app.innerHTML = loader(); return; }
  if (!state.user) { location.hash = '#/login/checkout'; return; }
  const r = cartRestaurant();
  const lines = Cart.lines(r);
  if (!lines.length || r.isOpen === false || r.blocked || cartTotals(r).subtotal < r.minOrder) { location.hash = '#/cart'; return; }
  const t = cartTotals(r);
  const u = state.user;
  const saved = savedAddresses(u);
  // أول مرة: آخر عنوان استخدمه، ولو مفيش محفوظ نبدأ بعنوانه القديم كعنوان جديد
  let chosen = saved[0] || null;
  let location_ = chosen ? chosen.location : (u.location || null);

  app.innerHTML = `
    <h1 class="page-title">إتمام الطلب</h1>
    <form class="two-col" id="checkoutForm">
      <section class="panel">
        <h3>📍 عنوان التوصيل</h3>
        ${saved.length ? `
          <div class="addr-pick" role="radiogroup" aria-label="عناوينك المحفوظة">
            ${saved.map((a) => `<button type="button" class="addr-chip" role="radio" data-addr="${esc(a.id)}">
              <span>${addressIcon(a)}</span><b>${esc(addressTitle(a))}</b><small>${esc(a.address)}</small></button>`).join('')}
            <button type="button" class="addr-chip new" role="radio" data-addr="new"><span>➕</span><b>عنوان جديد</b></button>
          </div>` : ''}
        ${zoneSelect()}
        <p class="muted small">حدد مكانك على الخريطة (اختياري بس بيسهّل على المندوب يوصلك):</p>
        <div class="map-box" id="map"><span class="muted small">جاري تحميل الخريطة...</span></div>

        <label>العنوان بالتفصيل
          <textarea name="address" required rows="2" maxlength="300" placeholder="المنطقة، الشارع، رقم العمارة، الدور، الشقة">${esc(chosen ? chosen.address : u.address)}</textarea>
        </label>
        <div id="addrSave" class="addr-save"></div>
        <div class="form-grid">
          <label>الاسم<input name="name" required maxlength="60" value="${esc(u.name)}" autocomplete="name"></label>
          <label>رقم الموبايل
            <input name="phone" type="tel" required pattern="01[0-9]{9}" placeholder="01xxxxxxxxx" inputmode="numeric" value="${esc(u.phone)}" autocomplete="tel">
          </label>
        </div>
        <label>ملاحظات للمطعم (اختياري)
          <input name="notes" placeholder="مثال: من غير بصل">
        </label>

        <h3>⏰ وقت التوصيل</h3>
        <div class="pay-options when-options">
          <label class="pay"><input type="radio" name="when" value="now" checked> 🛵 دلوقتي <span class="muted small">(${restTime(r)[0]}-${restTime(r)[1]} دقيقة)</span></label>
          <label class="pay"><input type="radio" name="when" value="later"> 📅 حدد ميعاد (النهارده أو بكرة)</label>
        </div>
        <div class="form-grid when-later" id="whenLater" hidden>
          <label>اليوم<select name="day"><option value="0">النهارده</option><option value="1">بكرة</option></select></label>
          <label>الساعة<select name="slot"></select></label>
        </div>

        <h3>💳 طريقة الدفع</h3>
        <div class="pay-options" id="payOptions">${payOptions()}</div>
      </section>

      <section class="panel">
        <h3>ملخص الطلب — ${esc(r.name)}</h3>
        ${lines.map((l) => `<div class="mini-line"><span>${l.qty}× ${esc(l.item.name)}${lineOptions(l)}</span><span>${fmt(l.item.price * l.qty)}</span></div>`).join('')}
        <div id="checkoutSummary">${summary(t, currentZone(), Cart.usableCoupons(r, state.settings).map((c) => c.code))}</div>
        <button class="btn primary block" type="submit" id="placeBtn">تأكيد الطلب • ${fmt(t.total)}</button>
      </section>
    </form>`;

  // تحديث الملخص لما المنطقة أو الأسعار تتغير من غير ما نمسح اللي العميل كتبه
  refreshCheckout = () => {
    const rest = cartRestaurant();
    if (!rest) return;
    // لو الأدمن غيّر طرق الدفع وإنت في الصفحة
    const box = document.getElementById('payOptions');
    const picked = box.querySelector('[name=payment]:checked')?.value;
    const ids = enabledPayments(state.settings).map((m) => m.id).join();
    if (box.dataset.ids !== ids) { box.innerHTML = payOptions(picked); bindPayOptions(); }
    const tt = cartTotals(rest);
    document.getElementById('checkoutSummary').innerHTML = summary(tt, currentZone(), Cart.usableCoupons(rest, state.settings).map((c) => c.code));
    document.getElementById('placeBtn').textContent = `تأكيد الطلب • ${fmt(tt.total)}`;
  };
  document.getElementById('zoneSelect')?.addEventListener('change', (e) => { Cart.setZone(e.target.value); refreshCheckout(); });
  bindPayOptions();

  // ميعاد التوصيل: لو "بعدين" نعرض المواعيد المتاحة (كل نص ساعة)
  const later = document.getElementById('whenLater');
  const fillSlots = () => {
    const day = Number(later.querySelector('[name=day]').value);
    let list = slots(day, restTime(r)[1]);
    if (!list.length && day === 0) { later.querySelector('[name=day]').value = '1'; list = slots(1, restTime(r)[1]); }
    later.querySelector('[name=slot]').innerHTML = list.map((x) => `<option value="${x.value}">${x.label}</option>`).join('');
  };
  app.querySelectorAll('[name=when]').forEach((x) => x.addEventListener('change', () => {
    later.hidden = app.querySelector('[name=when]:checked').value !== 'later';
    if (!later.hidden) fillSlots();
  }));
  later.querySelector('[name=day]').addEventListener('change', fillSlots);

  // اختيار عنوان محفوظ بيملا العنوان والمنطقة والخريطة
  let picker = null;
  const addrBox = app.querySelector('textarea[name=address]');
  const drawAddrSave = () => {
    const box = document.getElementById('addrSave');
    if (chosen) {
      box.innerHTML = `<p class="muted small">أي تعديل في العنوان أو المكان هيتحفظ في «${esc(addressTitle(chosen))}».</p>`;
      return;
    }
    if (saved.length >= MAX_ADDRESSES) {
      box.innerHTML = `<p class="muted small">عندك ${MAX_ADDRESSES} عناوين محفوظة (الحد الأقصى). تقدر تمسح منهم من حسابي.</p>`;
      return;
    }
    const kind = nextKind(saved);
    box.innerHTML = `
      <label class="check-line"><input type="checkbox" name="saveAddr" checked> 💾 احفظ العنوان ده عشان المرة الجاية</label>
      <div class="addr-kinds" role="radiogroup" aria-label="اسم العنوان">
        ${Object.entries(ADDRESS_KINDS).map(([k, x]) => `<label class="chip check-chip"><input type="radio" name="addrKind" value="${k}" ${k === kind ? 'checked' : ''}> ${x.icon} ${x.name}</label>`).join('')}
        <input name="addrName" maxlength="30" placeholder="اسم العنوان (مثلًا: بيت ماما)" ${kind === 'other' ? '' : 'hidden'}>
      </div>`;
    const name = box.querySelector('[name=addrName]');
    box.querySelectorAll('[name=addrKind]').forEach((r) => r.addEventListener('change', () => { name.hidden = r.value !== 'other'; }));
    box.querySelector('[name=saveAddr]').addEventListener('change', (e) => { box.querySelector('.addr-kinds').hidden = !e.target.checked; });
  };
  const choose = (id) => {
    chosen = saved.find((a) => a.id === id) || null;
    app.querySelectorAll('[data-addr]').forEach((b) => {
      const on = b.dataset.addr === (chosen ? chosen.id : 'new');
      b.classList.toggle('active', on);
      b.setAttribute('aria-checked', on);
    });
    addrBox.value = chosen ? chosen.address : '';
    location_ = chosen ? chosen.location : null;
    picker?.setLocation(location_);
    const zoneSel = document.getElementById('zoneSelect');
    if (chosen?.zoneId && zoneSel && [...zoneSel.options].some((o) => o.value === chosen.zoneId)) {
      zoneSel.value = chosen.zoneId;
      Cart.setZone(chosen.zoneId);
      refreshCheckout();
    }
    drawAddrSave();
  };
  app.querySelectorAll('[data-addr]').forEach((b) => b.addEventListener('click', () => {
    choose(b.dataset.addr);
    if (b.dataset.addr === 'new') addrBox.focus();
  }));
  if (saved.length) choose(chosen.id); else drawAddrSave();

  const initial = location_;
  locationPicker(document.getElementById('map'), location_, (ll) => { location_ = ll; },
    { hint: 'هيتبعت للمندوب مع الطلب' }).then((p) => {
    if (page !== 'checkout') return p.destroy();
    picker = p;
    // لو اختار عنوان تاني قبل ما الخريطة تحمل
    if (location_ !== initial) p.setLocation(location_);
    setCleanup(() => p.destroy());
  }).catch(() => {
    document.getElementById('map')?.replaceChildren('تعذر تحميل الخريطة. اكتب العنوان بالتفصيل.');
  });

  document.getElementById('checkoutForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    const btn = document.getElementById('placeBtn');
    const rest = cartRestaurant();
    if (!rest || rest.isOpen === false || rest.blocked) return toast('المطعم مش متاح دلوقتي');
    const zone = currentZone();
    if (!zone) return toast('اختار منطقة التوصيل الأول');
    const method = enabledPayments(state.settings).find((m) => m.id === d.payment);
    if (!method) return toast('اختار طريقة الدفع');
    const scheduledFor = d.when === 'later' ? Number(d.slot) : null;
    if (d.when === 'later' && !(scheduledFor > Date.now() + 25 * 60 * 1000)) {
      fillSlots();
      return toast('الميعاد ده عدّى، اختار ميعاد تاني');
    }
    btn.disabled = true;
    const problems = await refreshCoupons(rest);
    btn.disabled = false;
    if (problems.length) {
      refreshCheckout();
      return toast(`اتشال كوبون: ${problems.join(' • ')}. راجع الإجمالي وأكّد تاني`);
    }
    const usedCoupons = Cart.usableCoupons(rest, state.settings);
    const totals = cartTotals(rest);
    const order = {
      customerUid: u.uid,
      customerName: d.name.trim(),
      customerPhone: d.phone.trim(),
      customerUsername: u.username || null,
      restaurantId: rest.id,
      restaurantName: rest.name,
      restaurantEmoji: rest.emoji,
      restaurantAddress: rest.address || '',
      restaurantPhone: rest.phone || '',
      restaurantLocation: rest.location || null,
      ownerUid: rest.ownerUid ?? null,
      zoneId: zone.id,
      zoneName: zone.name,
      rates: state.settings.rates,
      driverUid: null,
      driverName: null,
      driverPhone: null,
      lines: Cart.lines(rest).map((l) => ({
        id: l.item.id, key: l.key, name: l.item.name, price: l.item.price, qty: l.qty,
        ...(l.note ? { note: l.note } : {}),
        ...(l.options.length ? { options: l.options } : {}),
        ...(l.item.fullPrice > l.item.price ? { fullPrice: l.item.fullPrice } : {}),
      })),
      totals,
      promos: usedCoupons.map((c) => c.code),
      coupons: usedCoupons.map((c) => ({ code: c.code, label: couponLabel(c), amount: couponDiscount(c, totals.subtotal, totals.delivery) })),
      address: d.address.trim(),
      location: location_,
      notes: d.notes.trim(),
      payment: method.id,
      ...(scheduledFor ? { scheduledFor } : {}),
      ...(method.note ? { paymentNote: method.note.slice(0, 200) } : {}),
      status: 'placed',
      statusHistory: [{ status: 'placed', at: Date.now(), by: { uid: u.uid, name: u.name || '', role: 'customer' } }],
    };
    btn.disabled = true;
    btn.textContent = 'جاري إرسال الطلب...';
    try {
      const id = await backend.createOrder(order, usedCoupons);
      backend.updateProfile(u.uid, { name: order.customerName, phone: order.customerPhone, address: order.address, location: location_ })
        .catch(console.error);
      const addresses = rememberAddress(savedAddresses(state.user), chosen, d, { address: order.address, location: location_, zoneId: zone.id });
      if (addresses) backend.saveAddresses(u.uid, addresses).catch(console.error);
      Cart.clear();
      toast(scheduledFor ? `تم حجز طلبك ${whenLabel(scheduledFor)} 🎉` : 'تم إرسال طلبك بنجاح 🎉');
      location.hash = `#/order/${id}`;
    } catch (err) {
      console.error(err);
      toast(errorMessage(err));
      btn.disabled = false;
      btn.textContent = `تأكيد الطلب • ${fmt(totals.total)}`;
    }
  });
}

// طرق الدفع اللي الأدمن مفعّلها، وتحت المختارة ملاحظتها (زي رقم إنستاباي)
function payOptions(picked) {
  const list = enabledPayments(state.settings);
  if (!list.length) return '<p class="warn">مفيش طرق دفع متاحة دلوقتي. كلم خدمة العملاء.</p>';
  const sel = list.some((m) => m.id === picked) ? picked : list[0].id;
  return list.map((m) => `
    <label class="pay">
      <input type="radio" name="payment" value="${m.id}" ${m.id === sel ? 'checked' : ''} required> ${m.label}
      <span class="pay-hint muted small">${esc(m.hint)}${m.note ? `<b class="pay-note">${esc(m.note)}</b>` : ''}</span>
    </label>`).join('');
}

function bindPayOptions() {
  const box = document.getElementById('payOptions');
  box.dataset.ids = enabledPayments(state.settings).map((m) => m.id).join();
}

// بعد الطلب: نحدث العنوان المختار، أو نضيف الجديد لو طلب يحفظه. null = مفيش تغيير
function rememberAddress(list, chosen, form, { address, location, zoneId }) {
  const now = Date.now();
  if (chosen) {
    return list.map((a) => (a.id === chosen.id ? cleanAddress({ ...a, address, location, zoneId, usedAt: now }) : cleanAddress(a)));
  }
  if (!form.saveAddr || list.length >= MAX_ADDRESSES) return null;
  const kind = ADDRESS_KINDS[form.addrKind] ? form.addrKind : 'other';
  return [...list.map(cleanAddress), cleanAddress({
    id: newAddressId(), kind, name: kind === 'other' ? form.addrName : '', address, location, zoneId, usedAt: now,
  })];
}

// ---------- تتبع الطلب ----------

function renderOrder(id) {
  if (state.user === undefined) { app.innerHTML = loader(); return; }
  if (!state.user) { location.hash = '#/login'; return; }
  app.innerHTML = loader();
  const unsub = backend.watchOrder(id, (o) => {
    if (!o) return renderNotFound();
    orderAlerts(o);
    drawOrder(o);
    mountRiderMap(o);
  });
  setCleanup(() => { unsub(); stopRiderMap(); });
}

// خريطة المندوب وهو في الطريق: بتفضل نفس الخريطة بين التحديثات (منعيدش تحميلها كل مرة)
let riderTrack = null;
function mountRiderMap(o) {
  const slot = document.getElementById('riderSlot');
  if (!slot) return stopRiderMap();
  if (riderTrack?.id === o.id) {
    slot.replaceWith(riderTrack.el);
    return;
  }
  stopRiderMap();
  const el = document.createElement('div');
  el.id = 'riderSlot';
  slot.replaceWith(el);
  const t = { id: o.id, el, map: null, last: null, unsub: null };
  riderTrack = t;
  t.unsub = backend.watchRiderLocation(o.id, (ll) => { t.last = ll; t.map?.setRider(ll); });
  trackMap(el, { dest: o.location }).then((m) => {
    if (riderTrack !== t) return m.destroy();
    t.map = m;
    m.setRider(t.last);
  }).catch(() => { el.textContent = 'تعذر تحميل الخريطة'; });
}
function stopRiderMap() {
  if (!riderTrack) return;
  riderTrack.unsub?.();
  riderTrack.map?.destroy();
  riderTrack = null;
}

// ---------- تنبيهات الطلب (تغيير المندوب والحالة) ----------

const DRIVER_SEEN = 'arrivo_driver_seen';
const ENDED = ['delivered', 'cancelled', 'rejected'];
const readSeen = () => { try { return JSON.parse(localStorage.getItem(DRIVER_SEEN)) || {}; } catch { return {}; } };
const writeSeen = (m) => { try { localStorage.setItem(DRIVER_SEEN, JSON.stringify(m)); } catch { /* مفيش تخزين */ } };
const lastStatus = {};

// بنفتكر آخر مندوب شوفناه لكل طلب، ولو اتغير (اعتذر أو اتبدل) نعرّف العميل بصوت ورسالة تفضل ظاهرة
function orderAlerts(o) {
  const url = `${location.origin}/#/order/${o.id}`;
  if (lastStatus[o.id] && lastStatus[o.id] !== o.status) {
    notify(`طلبك من ${o.restaurantName}`, `${ORDER_STATUSES[o.status]?.icon || ''} ${ORDER_STATUSES[o.status]?.label || ''}`, { tag: `order-${o.id}`, url });
  }
  lastStatus[o.id] = o.status;

  const all = readSeen();
  const prev = all[o.id];
  if (ENDED.includes(o.status)) {
    if (prev) { delete all[o.id]; writeSeen(all); }
    return;
  }
  const cur = o.driverUid || '';
  let note = prev?.note || null;
  if (prev && prev.uid !== cur) {
    if (!cur) note = { kind: 'released', name: prev.name };
    else if (prev.uid || note?.kind === 'released') note = { kind: 'switched', name: o.driverName || '' };
    else note = null;
    if (note) {
      const msg = note.kind === 'released'
        ? 'المندوب اعتذر عن طلبك، وبندوّر على مندوب تاني دلوقتي'
        : `طلبك اتنقل لمندوب جديد: ${o.driverName || ''}`;
      alarm({ times: 1 });
      toast(`🔄 ${msg}`);
      notify('🔄 المندوب اتغير', msg, { tag: `order-${o.id}`, url });
    } else toast(`🛵 ${o.driverName || 'مندوب'} مسك طلبك`);
  }
  all[o.id] = { uid: cur, name: o.driverName || '', note };
  // منخليش اللستة تكبر على الفاضي
  const ids = Object.keys(all);
  if (ids.length > 30) ids.slice(0, ids.length - 30).forEach((k) => delete all[k]);
  writeSeen(all);
}

function driverNote(o) {
  const note = readSeen()[o.id]?.note;
  if (!note || ENDED.includes(o.status)) return '';
  return note.kind === 'released'
    ? `<p class="driver-changed">🔄 المندوب${note.name ? ` (${esc(note.name)})` : ''} اعتذر عن طلبك. بندوّر على مندوب تاني دلوقتي، وطلبك لسه شغال ومش محتاج تعمل حاجة.</p>`
    : `<p class="driver-changed">🔄 طلبك اتنقل لمندوب جديد: <b>${esc(note.name)}</b>. بياناته تحت، وده الرقم اللي هيكلمك.</p>`;
}

function drawOrder(o) {
  const step = ORDER_FLOW.indexOf(o.status);
  const stopped = step === -1;
  const done = o.status === 'delivered';
  const remaining = `~${{ placed: 40, preparing: 30, ready: 20, on_way: 15 }[o.status] || 30} دقيقة`;
  const historyAt = (s) => (o.statusHistory || []).find((h) => h.status === s)?.at;

  app.innerHTML = `
    <a href="#/orders" class="back">→ كل طلباتي</a>
    <section class="panel track">
      <div class="track-head">
        <div>
          <h1>طلب رقم #${shortId(o.id)}</h1>
          <p class="muted">${esc(o.restaurantEmoji)} ${esc(o.restaurantName)} • ${new Date(o.createdAt).toLocaleString('ar-EG')}</p>
        </div>
        ${stopped ? statusBadge(o.status)
          : `<div class="eta">${done ? 'وصل! بالهنا والشفا 😋' : isScheduled(o) && o.status !== 'on_way' ? `⏰ هيوصلك ${whenLabel(o.scheduledFor)}` : `الوصول خلال ${remaining}`}</div>`}
      </div>
      ${stopped ? `
        <p class="warn">${o.status === 'rejected' ? 'للأسف المطعم مقدرش يقبل طلبك دلوقتي. جرّب تطلب من مطعم تاني.' : 'تم إلغاء الطلب.'}</p>` : `
        <div class="rider ${o.status === 'on_way' ? 'moving' : ''}">${ORDER_STATUSES[o.status].icon}</div>
        <ol class="steps">
          ${ORDER_FLOW.map((s, i) => `
            <li class="${i < step ? 'done' : ''} ${i === step ? 'current' : ''}">
              <span class="dot">${i <= step ? ORDER_STATUSES[s].icon : ''}</span>
              <span>${ORDER_STATUSES[s].label}</span>
              ${historyAt(s) ? `<span class="muted small">${new Date(historyAt(s)).toLocaleTimeString('ar-EG', { hour: 'numeric', minute: '2-digit' })}</span>` : ''}
            </li>`).join('')}
        </ol>
        ${driverNote(o)}
        ${o.status === 'on_way' && o.driverUid ? '<div id="riderSlot"></div>' : ''}
        ${ENDED.includes(o.status) ? '' : notifyButton().replace('🔔 فعّل الإشعارات', '🔔 عرّفني لما حالة الطلب تتغير')}
        ${o.driverUid ? `<div class="driver-box">🛵 المندوب: <b>${esc(o.driverName)}</b> • <a href="tel:${esc(o.driverPhone)}" dir="ltr">📞 ${esc(o.driverPhone)}</a></div>` : ''}
        ${missingPanel(o)}
        ${reviewPanel(o)}
        ${o.status === 'placed' ? '<p class="muted small center">مستنيين المطعم يأكد طلبك... الصفحة بتتحدث لوحدها.</p>' : ''}`}
    </section>

    <div class="two-col">
      <section class="panel">
        <h3>تفاصيل الطلب</h3>
        ${o.lines.map((l) => `<div class="mini-line"><span>${l.qty}× ${esc(l.name)}${lineOptions(l)}</span><span>${fmt(l.price * l.qty)}</span></div>`).join('')}
        ${summary(o.totals, undefined, o.promos || (o.promo ? [o.promo] : []))}
        ${REFUND_NOTE}
        ${missingDeduction(o) ? `<div class="summary"><div class="discount"><span>ناقص (اتخصم)</span><span>− ${fmt(missingDeduction(o))}</span></div><div class="total"><span>دفعت</span><span>${fmt(paidTotal(o))}</span></div></div>` : ''}
      </section>
      <section class="panel">
        <h3>التوصيل</h3>
        <p>📍 ${o.zoneName ? `${esc(o.zoneName)} — ` : ''}${esc(o.address)}</p>
        <p>📞 <span dir="ltr">${esc(o.customerPhone)}</span></p>
        <p>${paymentLabel(o.payment)}</p>
        ${o.paymentNote && !['delivered', 'cancelled', 'rejected'].includes(o.status) ? `<p class="pay-note">💡 ${esc(o.paymentNote)}</p>` : ''}
        ${o.notes ? `<p>📝 ${esc(o.notes)}</p>` : ''}
        ${o.status === 'placed' ? '<button class="btn block danger-outline" id="cancelOrder" type="button">إلغاء الطلب</button>' : ''}
        <button class="btn block" id="reorder" type="button">🔁 اطلب نفس الطلب تاني</button>
        <a class="btn block problem-btn" href="#/support/order/${o.id}">⚠️ مشكلة في الطلب؟</a>
        <p class="muted small center">ناقص صنف؟ حاجة غلط؟ اتأخر؟ ابعتلنا ومعاها صورة، وهيرد عليك موظف حقيقي.</p>
      </section>
    </div>`;

  document.getElementById('reorder').addEventListener('click', () => reorder(o));
  bindMissing(o);
  bindReview(o);
  bindNotifyButton(app, () => drawOrder(o));
  const cancel = document.getElementById('cancelOrder');
  if (cancel) cancel.addEventListener('click', async () => {
    if (!confirm('متأكد إنك عايز تلغي الطلب؟')) return;
    cancel.disabled = true;
    try {
      await backend.setOrderStatus(o.id, 'cancelled');
      toast('تم إلغاء الطلب');
    } catch (err) {
      toast(errorMessage(err));
      cancel.disabled = false;
    }
  });
}

// ---------- تقييم الطلب بعد التوصيل ----------
const reviewState = { orderId: null, loaded: false, review: null, food: 0, delivery: 0, comment: '', sending: false };

function reviewPanel(o) {
  if (o.status !== 'delivered') return '';
  if (reviewState.orderId !== o.id) {
    Object.assign(reviewState, { orderId: o.id, loaded: false, review: null, food: 0, delivery: 0, comment: '', sending: false });
    backend.getReview(o.id).then((rv) => {
      if (reviewState.orderId !== o.id) return;
      Object.assign(reviewState, { loaded: true, review: rv });
      if (page === 'order') drawOrder(o);
    }).catch(() => { reviewState.loaded = true; });
    return '';
  }
  if (!reviewState.loaded) return '';
  const rv = reviewState.review;
  if (rv) {
    return `<div class="review-box ok">⭐ شكرًا على تقييمك! الأكل: <span class="stars">${stars(rv.food)}</span>${rv.delivery ? ` • التوصيل: <span class="stars">${stars(rv.delivery)}</span>` : ''}${rv.comment ? `<p class="small">"${esc(rv.comment)}"</p>` : ''}</div>`;
  }
  const picker = (key, val) => `<div class="star-pick" role="radiogroup" aria-label="${key === 'food' ? 'تقييم الأكل' : 'تقييم التوصيل'}">
    ${[1, 2, 3, 4, 5].map((n) => `<button type="button" role="radio" aria-checked="${val === n}" aria-label="${n} من 5" data-star="${key}:${n}" class="${n <= val ? 'on' : ''}">★</button>`).join('')}</div>`;
  return `
    <form class="review-box rate-form" id="rateForm">
      <h3>⭐ قيّم طلبك</h3>
      <label class="rate-row"><span>الأكل من ${esc(o.restaurantName)}</span>${picker('food', reviewState.food)}</label>
      ${o.driverUid ? `<label class="rate-row"><span>التوصيل <small class="muted">(اختياري)</small></span>${picker('delivery', reviewState.delivery)}</label>` : ''}
      <textarea id="rateComment" rows="2" maxlength="500" placeholder="رأيك يفرق مع غيرك ومع المطعم (اختياري)">${esc(reviewState.comment)}</textarea>
      <p class="muted small">تقييمك وتعليقك واسمك الأول بس هيظهروا في صفحة المطعم.</p>
      <button class="btn primary block" type="submit" ${reviewState.food && !reviewState.sending ? '' : 'disabled'}>ابعت التقييم</button>
    </form>`;
}

function bindReview(o) {
  const form = app.querySelector('#rateForm');
  if (!form) return;
  form.querySelector('#rateComment').addEventListener('input', (e) => { reviewState.comment = e.target.value; });
  form.querySelectorAll('[data-star]').forEach((b) => b.addEventListener('click', () => {
    const [key, n] = b.dataset.star.split(':');
    reviewState[key] = Number(n);
    reviewState.comment = form.querySelector('#rateComment').value;
    drawOrder(o);
  }));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!reviewState.food) return;
    reviewState.sending = true;
    reviewState.comment = form.querySelector('#rateComment').value.trim();
    try {
      await backend.submitReview(o, state.user, { food: reviewState.food, delivery: reviewState.delivery || null, comment: reviewState.comment });
      reviewState.review = { food: reviewState.food, delivery: reviewState.delivery || null, comment: reviewState.comment };
      toast('شكرًا على تقييمك ⭐');
    } catch (err) {
      toast(errorMessage(err));
    }
    reviewState.sending = false;
    drawOrder(o);
  });
}

// ---------- راجع طلبك قبل ما تدفع ----------
// اللي العميل علّم عليه إنه ناقص (بيفضل لو الصفحة اتعاد رسمها)
const missingDraft = { orderId: null, picks: {} };

function missingPanel(o) {
  const m = missingDeduction(o);
  if (o.missing) {
    const list = missingItems(o).map((x) => `${x.qty}× ${esc(x.name)}`).join('، ');
    if (o.missingDecision === 'confirmed') {
      return `<div class="review-box ok">✅ اتخصم <b>${fmt(m)}</b> تمن الناقص (${list}). هتدفع <b>${fmt(paidTotal(o))}</b> بدل ${fmt(o.totals.total)}.</div>`;
    }
    if (o.missingDecision === 'disputed') {
      return `<div class="review-box warn-box">⚠️ المندوب قال إن الطلب كامل. خدمة العملاء هتراجع الموضوع وترد عليك في الشكوى.</div>`;
    }
    return `<div class="review-box">⏳ بلّغت إن ناقص: ${list}. المندوب بيتأكد دلوقتي، ولو أكد هتدفع <b>${fmt(o.totals.total - missingRefund(o))}</b> بدل ${fmt(o.totals.total)}.</div>`;
  }
  if (o.status !== 'on_way') return '';
  if (missingDraft.orderId !== o.id) Object.assign(missingDraft, { orderId: o.id, picks: {} });
  const picks = missingDraft.picks;
  return `
    <details class="review-box" ${Object.keys(picks).length ? 'open' : ''}>
      <summary>🧾 <b>راجع طلبك قبل ما تدفع</b> — لو حاجة ناقصة مش هتدفع تمنها</summary>
      <p class="muted small">لما المندوب يوصل، اتأكد من الأصناف. علّم على الناقص والمندوب هيأكد قدامك.</p>
      ${o.lines.map((l, i) => `
        <label class="miss-row">
          <input type="checkbox" data-miss="${i}" ${picks[i] ? 'checked' : ''}>
          <span class="grow">${l.qty}× ${esc(l.name)}${lineOptions(l)}</span>
          ${l.qty > 1 && picks[i] ? `<select data-miss-qty="${i}" aria-label="العدد الناقص">${Array.from({ length: l.qty }, (_, k) => `<option value="${k + 1}" ${picks[i] === k + 1 ? 'selected' : ''}>ناقص ${k + 1}</option>`).join('')}</select>` : ''}
          <b>${fmt(l.price * (picks[i] || l.qty))}</b>
        </label>`).join('')}
      <button class="btn block danger-outline" id="reportMissing" type="button" ${Object.keys(picks).length ? '' : 'disabled'}>بلّغ إن دول ناقصين</button>
    </details>`;
}

function bindMissing(o) {
  const picks = missingDraft.picks;
  app.querySelectorAll('[data-miss]').forEach((c) => c.addEventListener('change', () => {
    if (c.checked) picks[c.dataset.miss] = 1; else delete picks[c.dataset.miss];
    drawOrder(o);
  }));
  app.querySelectorAll('[data-miss-qty]').forEach((s) => s.addEventListener('change', () => {
    picks[s.dataset.missQty] = Number(s.value);
    drawOrder(o);
  }));
  app.querySelector('#reportMissing')?.addEventListener('click', async (e) => {
    // بنبعت أرقام الأصناف والعدد بس، والحساب كله من الطلب نفسه
    const missing = Object.entries(picks).map(([i, qty]) => ({ i: Number(i), qty: Number(qty) }));
    const preview = { ...o, missing };
    const items = missingItems(preview);
    const amount = items.reduce((a, x) => a + x.amount, 0);
    if (!items.length || !confirm(`هتبلّغ إن ناقص: ${items.map((x) => `${x.qty}× ${x.name}`).join('، ')}\nهيترجعلك ${fmt(missingRefund(preview))}. المندوب هيأكد قدامك. تكمّل؟`)) return;
    e.target.disabled = true;
    try {
      await backend.reportMissing(o.id, missing, amount);
      // شكوى مربوطة بالطلب عشان خدمة العملاء والمطعم يعرفوا
      backend.createTicket(state.user, {
        topic: 'order', subject: 'صنف ناقص', orderId: o.id,
        text: `الطلب وصل ناقص: ${items.map((x) => `${x.qty}× ${x.name}`).join('، ')} (${amount} ج.م).`,
      }).catch(console.error);
      missingDraft.picks = {};
      toast('وصل البلاغ ✅ المندوب هيأكد دلوقتي');
    } catch (err) {
      toast(errorMessage(err));
      e.target.disabled = false;
    }
  });
}

function reorder(o) {
  const r = findRestaurant(o.restaurantId);
  if (!r) return toast('المطعم ده مش متاح دلوقتي');
  if (Cart.count() && Cart.restaurantId !== o.restaurantId && !confirm('السلة الحالية فيها أصناف من مطعم تاني. تحب تستبدلها؟')) return;
  Cart.clear();
  const available = new Set(r.menu.flatMap((s) => s.items).filter(isAvailable).map((i) => i.id));
  o.lines.filter((l) => available.has(l.id)).forEach((l) => {
    Cart.add(o.restaurantId, l.key || l.id, true, l.qty);
    if (l.note) Cart.setNote(l.key || l.id, l.note);
  });
  // سطر اختياراته اتغيرت أو خلصت مبيظهرش في السلة
  if (!Cart.lines(r).length) { Cart.clear(); return toast('الأصناف دي مش متاحة دلوقتي'); }
  if (Cart.lines(r).length < o.lines.length) toast('بعض الأصناف أو الاختيارات مبقتش متاحة، راجع السلة');
  location.hash = '#/cart';
}

// ---------- طلباتي ----------

function renderOrders() {
  if (state.user === undefined) { app.innerHTML = loader(); return; }
  if (!state.user) { location.hash = '#/login/orders'; return; }
  app.innerHTML = loader();
  setCleanup(backend.watchOrders({ customerUid: state.user.uid }, (orders) => {
    if (!orders.length) {
      app.innerHTML = `
        <div class="empty-state">
          <div class="big">🧾</div>
          <h2>لسه مفيش طلبات</h2>
          <a href="#/" class="btn primary">اطلب دلوقتي</a>
        </div>`;
      return;
    }
    app.innerHTML = `
      <h1 class="page-title">طلباتي</h1>
      <div class="orders">
        ${orders.map((o) => `
          <a class="panel order-row" href="#/order/${o.id}">
            <div class="item-img sm">${esc(o.restaurantEmoji)}</div>
            <div class="grow">
              <strong>${esc(o.restaurantName)}</strong>
              <div class="muted small">#${shortId(o.id)} • ${new Date(o.createdAt).toLocaleDateString('ar-EG')} • ${o.lines.reduce((a, l) => a + l.qty, 0)} صنف</div>
            </div>
            ${statusBadge(o.status)}
            <strong>${fmt(paidTotal(o))}</strong>
          </a>`).join('')}
      </div>`;
  }));
}

// ---------- الحساب ----------

function renderLogin(mode, next) {
  if (state.user === undefined) { app.innerHTML = loader(); return; }
  if (state.user) { location.hash = `#/${next || ''}`; return; }
  app.innerHTML = '<div id="authBox"></div>';
  renderAuthForm(document.getElementById('authBox'), {
    backend, isDemo, mode, askRole: next !== 'checkout',
    title: next === 'checkout' ? 'سجّل دخولك عشان تكمل الطلب' : '',
    onDone: (role) => {
      // صاحب مطعم أو مندوب: نوديه على طلب الانضمام على طول
      if (JOIN_LINKS[role]) { location.href = JOIN_LINKS[role].replace('?join=1', ''); return; }
      toast('أهلًا بيك 👋');
      // ممكن يكون اتنقل لوحده بالفعل لما الدخول اتسجل
      if (['login', 'register'].includes(page)) location.hash = `#/${next || ''}`;
    },
  });
}

function renderAccount() {
  if (state.user === undefined) { app.innerHTML = loader(); return; }
  if (!state.user) { location.hash = '#/login/account'; return; }
  const u = state.user;
  app.innerHTML = `
    <h1 class="page-title">حسابي</h1>
    <form class="panel narrow" id="profileForm">
      <p class="muted" dir="ltr">${esc(u.email)}</p>
      ${usernameField(u.username, true)}
      <label>الاسم<input name="name" required maxlength="60" value="${esc(u.name)}"></label>
      <label>رقم الموبايل<input name="phone" type="tel" required pattern="01[0-9]{9}" value="${esc(u.phone)}" inputmode="numeric" dir="ltr"></label>
      <button class="btn primary block" type="submit">حفظ</button>
      <button class="btn block" type="button" id="logout">تسجيل الخروج</button>
    </form>
    <section class="panel narrow addr-book" id="addrBook"></section>
    <section class="panel narrow" id="phoneLinkBox" hidden></section>
    ${changePasswordForm()}`;
  drawAddressBook();
  phoneLinkBox(document.getElementById('phoneLinkBox'), { backend, user: u });
  bindChangePassword(app, backend);
  document.getElementById('profileForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    try {
      await backend.updateProfile(u.uid, { name: d.name.trim(), address: u.address || '', location: u.location });
      // تغيير الرقم بيتأكد إنه مش مسجل بحساب تاني
      if (d.phone.trim() !== u.phone) await backend.claimIdentity(u, { username: u.username, phone: d.phone });
      toast('تم الحفظ ✅');
    } catch (err) {
      toast(errorMessage(err));
    }
  });
  document.getElementById('logout').addEventListener('click', async () => {
    await backend.signOut();
    state.user = null; // من غير ما نستنى إشعار الخروج، عشان صفحة الدخول تفتح على طول
    updateHeader();
    location.hash = '#/';
  });
}

// ---------- عناويني ----------

let addrPicker = null;
const closeAddrPicker = () => { addrPicker?.destroy(); addrPicker = null; };

function drawAddressBook() {
  const box = document.getElementById('addrBook');
  if (!box) return;
  closeAddrPicker();
  const list = savedAddresses(state.user);
  const zones = state.settings ? state.settings.zones : {};
  box.innerHTML = `
    <div class="list-head"><h3>📍 عناويني</h3><span class="muted small">${list.length} من ${MAX_ADDRESSES}</span></div>
    ${list.length ? list.map((a) => `
      <div class="addr-row">
        <span class="addr-ico">${addressIcon(a)}</span>
        <div class="grow">
          <b>${esc(addressTitle(a))}</b>
          <div class="small">${esc(a.address)}</div>
          <div class="muted small">${a.zoneId && zones[a.zoneId] ? `🛵 ${esc(zones[a.zoneId].name)}` : ''}${a.location ? ' • 📌 متحدد على الخريطة' : ''}</div>
        </div>
        <button class="btn small" type="button" data-edit-addr="${esc(a.id)}">✏️ تعديل</button>
        <button class="btn small danger-outline" type="button" data-del-addr="${esc(a.id)}" aria-label="امسح ${esc(addressTitle(a))}">🗑️</button>
      </div>`).join('') : '<p class="muted small">لسه مفيش عناوين محفوظة. ضيف البيت أو الشغل عشان تطلب أسرع.</p>'}
    ${list.length < MAX_ADDRESSES ? '<button class="btn block" type="button" id="addAddr">➕ ضيف عنوان</button>' : ''}
    <div id="addrEditor"></div>`;
  box.querySelector('#addAddr')?.addEventListener('click', () => openAddressEditor(null));
  box.querySelectorAll('[data-edit-addr]').forEach((b) => b.addEventListener('click', () => openAddressEditor(list.find((a) => a.id === b.dataset.editAddr))));
  box.querySelectorAll('[data-del-addr]').forEach((b) => b.addEventListener('click', async () => {
    const a = list.find((x) => x.id === b.dataset.delAddr);
    if (!confirm(`تمسح عنوان «${addressTitle(a)}»؟`)) return;
    await storeAddresses(list.filter((x) => x.id !== a.id).map(cleanAddress), 'اتمسح العنوان');
  }));
}

async function storeAddresses(addresses, done) {
  try {
    await backend.saveAddresses(state.user.uid, addresses);
    state.user = { ...state.user, addresses };
    toast(done);
    drawAddressBook();
    return true;
  } catch (err) {
    toast(errorMessage(err));
    return false;
  }
}

function openAddressEditor(a) {
  const ed = document.getElementById('addrEditor');
  const list = savedAddresses(state.user);
  const kind = a ? a.kind : nextKind(list);
  const zones = state.settings ? activeZones(state.settings) : [];
  let loc = a?.location || null;
  closeAddrPicker();
  document.getElementById('addAddr')?.setAttribute('hidden', '');
  ed.innerHTML = `
    <form class="addr-form" id="addrForm">
      <h4>${a ? `✏️ تعديل «${esc(addressTitle(a))}»` : '➕ عنوان جديد'}</h4>
      <div class="addr-kinds" role="radiogroup" aria-label="نوع العنوان">
        ${Object.entries(ADDRESS_KINDS).map(([k, x]) => `<label class="chip check-chip"><input type="radio" name="kind" value="${k}" ${k === kind ? 'checked' : ''}> ${x.icon} ${x.name}</label>`).join('')}
      </div>
      <label ${kind === 'other' ? '' : 'hidden'} id="addrNameLbl">اسم العنوان<input name="name" maxlength="30" value="${esc(a?.name || '')}" placeholder="مثلًا: بيت ماما"></label>
      ${zones.length ? `<label>📍 منطقة التوصيل
        <select name="zoneId"><option value="">اختار المنطقة</option>
          ${zones.map((z) => `<option value="${z.id}" ${a?.zoneId === z.id ? 'selected' : ''}>${esc(z.name)}</option>`).join('')}
        </select></label>` : ''}
      <div class="map-box" id="addrMap"><span class="muted small">جاري تحميل الخريطة...</span></div>
      <label>العنوان بالتفصيل
        <textarea name="address" required rows="2" maxlength="300" placeholder="المنطقة، الشارع، رقم العمارة، الدور، الشقة">${esc(a?.address || '')}</textarea>
      </label>
      <div class="row-btns">
        <button class="btn primary" type="submit">💾 حفظ العنوان</button>
        <button class="btn" type="button" id="addrCancel">إلغاء</button>
      </div>
    </form>`;
  const form = ed.querySelector('#addrForm');
  form.querySelectorAll('[name=kind]').forEach((r) => r.addEventListener('change', () => { form.querySelector('#addrNameLbl').hidden = r.value !== 'other'; }));
  form.querySelector('#addrCancel').addEventListener('click', drawAddressBook);
  locationPicker(form.querySelector('#addrMap'), loc, (ll) => { loc = ll; }).then((p) => {
    if (!form.isConnected) return p.destroy();
    addrPicker = p;
  }).catch(() => form.querySelector('#addrMap')?.replaceChildren('تعذر تحميل الخريطة. اكتب العنوان بالتفصيل.'));
  setCleanup(closeAddrPicker);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(form));
    const entry = cleanAddress({
      id: a?.id || newAddressId(), kind: d.kind, name: d.kind === 'other' ? d.name : '',
      address: d.address, location: loc, zoneId: d.zoneId || null, usedAt: a?.usedAt || Date.now(),
    });
    const next = a ? list.map((x) => (x.id === a.id ? entry : cleanAddress(x))) : [...list.map(cleanAddress), entry];
    form.querySelector('[type=submit]').disabled = true;
    if (!await storeAddresses(next, 'اتحفظ العنوان ✅')) form.querySelector('[type=submit]').disabled = false;
  });
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ---------- خدمة العملاء ----------

function renderSupportPage(orderId) {
  if (state.user === undefined || !state.settings) { app.innerHTML = loader(); return; }
  if (!state.user) { location.hash = '#/login/support'; return; }
  app.innerHTML = '<div id="supportBox"></div>';
  setCleanup(renderSupport(document.getElementById('supportBox'), { backend, user: state.user, settings: state.settings, orderId }));
}

function renderNotFound() {
  app.innerHTML = '<div class="empty-state"><div class="big">🤷</div><h2>الصفحة مش موجودة</h2><a href="#/" class="btn primary">الرئيسية</a></div>';
}

// ---------- التنقل ----------

function router() {
  setCleanup(null);
  // المطعم والمندوب والموظف ليهم لوحاتهم، مش بيدخلوا تطبيق العملاء
  const panel = homeFor(state.user);
  if (panel) { location.replace(panel); return; }
  const [, name = '', id] = (location.hash || '#/').slice(1).split('/');
  page = name;
  // حساب محذوف أو محظور (المحظور يقدر يكلّم خدمة العملاء بس)
  if (state.user && (state.user.deleted || (state.user.banned && name !== 'support'))) {
    page = 'blocked';
    renderBlocked(app, { backend, user: state.user });
    updateHeader();
    return;
  }
  // حساب قديم من غير اسم مستخدم: لازم يختار واحد الأول
  if (state.user && !state.user.username && !state.user.banned) {
    page = 'complete';
    renderCompleteProfile(app, { backend, user: state.user });
    updateHeader();
    return;
  }
  // لازم يوافق على الشروط وسياسة الخصوصية (حساب قديم أو الشروط اتعدلت)
  if (needsTerms(state.user) && !state.user.banned) {
    page = 'terms';
    renderAcceptTerms(app, { backend, user: state.user });
    updateHeader();
    return;
  }
  switch (name) {
    case '': renderHome(); break;
    case 'restaurant': renderRestaurant(id); break;
    case 'offers': renderOffers(); break;
    case 'favorites': renderFavorites(); break;
    case 'join': app.innerHTML = `<a href="#/" class="back">→ رجوع للرئيسية</a>${joinCards()}`; break;
    case 'cart': renderCart(); break;
    case 'checkout': renderCheckout(); break;
    case 'orders': renderOrders(); break;
    case 'order': renderOrder(id); break;
    case 'login': renderLogin('login', id); break;
    case 'register': renderLogin('register', id); break;
    case 'account': renderAccount(); break;
    case 'support': renderSupportPage(id === 'order' ? (location.hash.split('/')[3] || null) : null); break;
    default: renderNotFound();
  }
  updateHeader();
}

window.addEventListener('hashchange', () => {
  router();
  window.scrollTo(0, 0);
  // انتقال ناعم بين الصفحات
  app.classList.remove('page-enter');
  void app.offsetWidth;
  app.classList.add('page-enter');
});
Cart.subscribe(updateHeader);

// الصفحات اللي بتعتمد على بيانات المطاعم والإعدادات (والباقي زي الدخول والحساب الجديد
// منعيدش رسمها، عشان اللي العميل بيكتبه في الفورم ميتمسحش لما البيانات توصل)
const DATA_PAGES = ['', 'restaurant', 'cart', 'offers', 'favorites'];
// أو أي صفحة لسه بتعرض "جاري التحميل" ومستنية البيانات (زي الدفع وخدمة العملاء)
const needsData = () => DATA_PAGES.includes(page) || Boolean(app.querySelector(':scope > .loader'));

backend.watchRestaurants((list) => {
  state.restaurants = list;
  if (needsData()) {
    const y = window.scrollY;
    router();
    window.scrollTo(0, y);
  }
});

backend.watchSettings((settings) => {
  const first = state.settings === null;
  state.settings = settings;
  if (page === 'checkout' && !first && refreshCheckout) return refreshCheckout();
  if (needsData()) {
    const y = window.scrollY;
    router();
    window.scrollTo(0, y);
  }
});

backend.onAuth((user) => {
  const prev = state.user;
  if (JSON.stringify(prev) === JSON.stringify(user)) return;
  state.user = user;
  updateHeader();
  // نعيد الرسم لو حالة الدخول اتغيرت أو الصفحة بتعرض بيانات الحساب
  // صفحة الحساب مش بنعيد رسمها هنا عشان منمسحش اللي بيكتبه (زي كلمة السر)
  if (prev === undefined || !prev !== !user || prev?.uid !== user?.uid
    || Boolean(prev?.username) !== Boolean(user?.username) || prev?.terms?.version !== user?.terms?.version
    || Boolean(prev?.banned) !== Boolean(user?.banned) || Boolean(prev?.deleted) !== Boolean(user?.deleted)) router();
});

router();
