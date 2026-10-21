// تطبيق العميل: المطاعم، المنيو، السلة، الطلب، والتتبع (hash routing)
import { backend, isDemo } from './backend/index.js';
import { CATEGORIES, ORDER_STATUSES, ORDER_FLOW, PAYMENT_LABELS } from './data.js';
import { Cart } from './cart.js';
import { locationPicker } from './map.js';
import { activeZones } from './finance.js';
import { matches, minPrice, inPriceRange, SORTS } from './search.js';
import {
  fmt, esc, toast, errorMessage, shortId, isAvailable, statusBadge, paymentLabel,
  loader, demoBanner, renderAuthForm, restaurantLogo, itemImage, renderCompleteProfile, renderAcceptTerms, needsTerms, usernameField, renderBlocked, homeFor,
  changePasswordForm, bindChangePassword, joinCards, JOIN_LINKS,
} from './ui.js';
import { renderSupport } from './support.js';
import { normalizeCode, couponProblem, couponLabel, couponConditions, couponDiscount } from './coupons.js';
import { activeOffer, priceOf, priceHtml, offerItems, hasOffers, promoText, untilLabel } from './offers.js';

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
const currentZone = () => {
  const z = state.settings?.zones[Cart.zoneId];
  return z && z.active !== false ? { id: Cart.zoneId, ...z } : null;
};
const minZoneFee = () => {
  const fees = activeZones(state.settings).map((z) => z.fee);
  return fees.length ? Math.min(...fees) : null;
};
const deliveryMeta = () => (minZoneFee() !== null ? ` • 🛵 التوصيل من ${fmt(minZoneFee())}` : '');

// اختيار منطقة التوصيل (سعر التوصيل بيتحدد منها)
function zoneSelect() {
  const zones = activeZones(state.settings);
  if (!zones.length) return '<p class="warn">التوصيل مش متاح لسه، مفيش مناطق توصيل متضافة.</p>';
  return `
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

    <section class="cats">
      ${CATEGORIES.map((c) => `
        <button class="cat ${ui.category === c.id ? 'active' : ''}" data-cat="${c.id}" type="button">
          <span class="cat-icon">${c.icon}</span><span>${c.name}</span>
        </button>`).join('')}
    </section>

    <div id="results"></div>
    ${joinCards()}`;

  drawResults();

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
    (!ui.topRated || (r.rating || 0) >= 4));

  // الأصناف اللي بتطابق البحث (بتظهر بس لو فيه بحث أو فلتر سعر)
  const wantItems = q || ui.priceMin || ui.priceMax;
  let items = wantItems ? visible.flatMap((r) => r.menu.flatMap((sec) => sec.items
    .filter((it) => isAvailable(it) && inPriceRange(priceOf(it), ui) && matches(q, it.name, it.desc, sec.section))
    .map((it) => ({ it, r })))) : [];

  let list = visible.filter((r) => (!q || matches(q, r.name, r.tags || [], CATEGORIES.find((c) => c.id === r.category)?.name || '')
      || items.some((x) => x.r.id === r.id))
    && (!(ui.priceMin || ui.priceMax) || r.menu.some((sec) => sec.items.some((it) => isAvailable(it) && inPriceRange(priceOf(it), ui)))));

  const byOpen = (a, b) => (b.isOpen !== false) - (a.isOpen !== false);
  if (ui.sort === 'rating') { list.sort((a, b) => (b.rating || 0) - (a.rating || 0)); items.sort((a, b) => (b.r.rating || 0) - (a.r.rating || 0)); }
  if (ui.sort === 'time') { list.sort((a, b) => a.time[0] - b.time[0]); items.sort((a, b) => a.r.time[0] - b.r.time[0]); }
  if (ui.sort === 'price_low') { list.sort((a, b) => minPrice(a) - minPrice(b)); items.sort((a, b) => priceOf(a.it) - priceOf(b.it)); }
  if (ui.sort === 'price_high') { list.sort((a, b) => minPrice(b) - minPrice(a)); items.sort((a, b) => priceOf(b.it) - priceOf(a.it)); }
  list.sort(byOpen);
  items.sort((a, b) => byOpen(a.r, b.r));

  const ITEMS_PREVIEW = 12;
  const shownItems = ui.showAllItems ? items : items.slice(0, ITEMS_PREVIEW);

  // شريط العروض: بيظهر في الرئيسية لما مفيش بحث
  const deals = wantItems ? [] : dealsList(visible);
  box.innerHTML = `
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
    const [rid, itemId] = b.dataset.quickAdd.split(':');
    if (addToCart(findRestaurant(rid), itemId)) drawResults();
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
    const [rid, itemId] = b.dataset.quickAdd.split(':');
    if (addToCart(findRestaurant(rid), itemId)) renderOffers();
  }));
  updateCartBar();
}

// إضافة صنف للسلة (مع سؤال لو السلة فيها أصناف من مطعم تاني)
function addToCart(r, itemId) {
  if (!Cart.add(r.id, itemId)) {
    const other = cartRestaurant();
    if (!confirm(`السلة فيها أصناف من "${other?.name || 'مطعم تاني'}". تحب تفضّيها وتبدأ طلب جديد من "${r.name}"؟`)) return false;
    Cart.add(r.id, itemId, true);
  }
  toast('تمت الإضافة للسلة ✅');
  return true;
}

function restaurantCard(r) {
  const closed = r.isOpen === false;
  return `
    <a class="card ${closed ? 'closed' : ''}" href="#/restaurant/${r.id}">
      <div class="card-cover" style="background:${esc(r.color)}">${restaurantLogo(r, 140)}
        ${closed ? '<span class="closed-tag">مغلق الآن</span>' : hasOffers(r) ? `<span class="promo">🏷️ ${promoText(r)}</span>` : ''}
      </div>
      <div class="card-body">
        <div class="card-title">
          <h3>${esc(r.name)}</h3>
          <span class="rating">${r.rating ? `⭐ ${r.rating}` : '🆕 جديد'}</span>
        </div>
        <p class="muted">${esc((r.tags || []).join(' • '))}</p>
        <p class="meta">🕒 ${r.time[0]}-${r.time[1]} دقيقة${deliveryMeta()}</p>
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
        <h1>${esc(r.name)}</h1>
        <p>${esc((r.tags || []).join(' • '))}</p>
        <p class="meta">${r.rating ? `⭐ ${r.rating} (${Number(r.reviews || 0).toLocaleString('ar-EG')} تقييم) • ` : ''}🕒 ${r.time[0]}-${r.time[1]} دقيقة${deliveryMeta()} • الحد الأدنى ${fmt(r.minOrder)}</p>
        ${hasOffers(r) ? `<span class="promo static">🏷️ ${promoText(r)}</span>` : ''}
      </div>
    </section>
    ${closed ? '<p class="warn">🔒 المطعم مغلق حاليًا ومش بيستقبل طلبات. تقدر تتفرج على المنيو.</p>' : ''}

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
    </div>`;

  app.querySelectorAll('[data-scroll]').forEach((a) => a.addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById(a.dataset.scroll)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));
  document.getElementById('menuSearch').addEventListener('input', (e) => { menuUi.query = e.target.value; drawMenu(r); });
  document.getElementById('menuSort').addEventListener('change', (e) => { menuUi.sort = e.target.value; drawMenu(r); });
  document.getElementById('menuAvailable').addEventListener('change', (e) => { menuUi.availableOnly = e.target.checked; drawMenu(r); });
  drawMenu(r);
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
            </div>
            <div class="item-side">
              <div class="item-img">${itemImage(it)}</div>
              ${!isAvailable(it) ? '<span class="muted small">غير متاح</span>'
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
    Cart.setQty(b.dataset.dec, Cart.qty(b.dataset.dec) - 1);
    drawMenu(r);
  }));
}

function miniCart() {
  const r = cartRestaurant();
  const lines = Cart.lines(r);
  if (!lines.length) return '<h3>سلتك</h3><p class="muted">السلة فاضية. ضيف أصناف من المنيو.</p>';
  const t = cartTotals(r);
  return `
    <h3>سلتك من ${esc(r.name)}</h3>
    ${lines.map((l) => `<div class="mini-line"><span>${l.qty}× ${esc(l.item.name)}</span><span>${fmt(l.item.price * l.qty)}</span></div>`).join('')}
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
              <strong>${esc(l.item.name)}</strong>
              <div class="muted">${fmt(l.item.price)}${l.item.fullPrice > l.item.price ? ` <s class="old-price">${fmt(l.item.fullPrice)}</s>` : ''}</div>
            </div>
            <div class="qty">
              <button data-dec="${l.item.id}" type="button" aria-label="نقص">−</button>
              <span>${l.qty}</span>
              <button data-inc="${l.item.id}" type="button" aria-label="زود">+</button>
            </div>
            <strong class="line-total">${fmt(l.item.price * l.qty)}</strong>
          </div>`).join('')}
        <a href="#/restaurant/${r.id}" class="link">+ ضيف أصناف تانية</a>
      </section>

      <section class="panel">
        ${zoneSelect()}
        ${perOrder ? couponBox(r, t) : ''}
        ${summary(t, currentZone(), Cart.usableCoupons(r, state.settings).map((c) => c.code))}
        ${closed ? '<p class="warn">🔒 المطعم مغلق حاليًا، مش هتقدر تطلب دلوقتي.</p>' : ''}
        ${belowMin ? `<p class="warn">الحد الأدنى للطلب ${fmt(r.minOrder)} — ضيف ${fmt(r.minOrder - t.subtotal)} كمان</p>` : ''}
        <a href="#/checkout" class="btn primary block ${blocked ? 'disabled' : ''}" ${blocked ? 'aria-disabled="true"' : ''}>إتمام الطلب</a>
      </section>
    </div>`;

  app.querySelectorAll('[data-inc]').forEach((b) => b.addEventListener('click', () => {
    Cart.setQty(b.dataset.inc, Cart.qty(b.dataset.inc) + 1);
    renderCart();
  }));
  app.querySelectorAll('[data-dec]').forEach((b) => b.addEventListener('click', () => {
    Cart.setQty(b.dataset.dec, Cart.qty(b.dataset.dec) - 1);
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
    </div>`;
}

// ---------- إتمام الطلب ----------

function renderCheckout() {
  if (!state.restaurants || !state.settings || state.user === undefined) { app.innerHTML = loader(); return; }
  if (!state.user) { location.hash = '#/login/checkout'; return; }
  const r = cartRestaurant();
  const lines = Cart.lines(r);
  if (!lines.length || r.isOpen === false || r.blocked || cartTotals(r).subtotal < r.minOrder) { location.hash = '#/cart'; return; }
  const t = cartTotals(r);
  const u = state.user;
  let location_ = u.location || null;

  app.innerHTML = `
    <h1 class="page-title">إتمام الطلب</h1>
    <form class="two-col" id="checkoutForm">
      <section class="panel">
        <h3>📍 عنوان التوصيل</h3>
        ${zoneSelect()}
        <p class="muted small">حدد مكانك على الخريطة (اختياري بس بيسهّل على المندوب يوصلك):</p>
        <div class="map-box" id="map"><span class="muted small">جاري تحميل الخريطة...</span></div>

        <label>العنوان بالتفصيل
          <textarea name="address" required rows="2" placeholder="المنطقة، الشارع، رقم العمارة، الدور، الشقة">${esc(u.address)}</textarea>
        </label>
        <div class="form-grid">
          <label>الاسم<input name="name" required value="${esc(u.name)}" autocomplete="name"></label>
          <label>رقم الموبايل
            <input name="phone" type="tel" required pattern="01[0-9]{9}" placeholder="01xxxxxxxxx" inputmode="numeric" value="${esc(u.phone)}" autocomplete="tel">
          </label>
        </div>
        <label>ملاحظات للمطعم (اختياري)
          <input name="notes" placeholder="مثال: من غير بصل">
        </label>

        <h3>💳 طريقة الدفع</h3>
        <div class="pay-options">
          ${Object.entries(PAYMENT_LABELS).map(([k, l], i) =>
            `<label class="pay"><input type="radio" name="payment" value="${k}" ${i === 0 ? 'checked' : ''}> ${l}</label>`).join('')}
        </div>
      </section>

      <section class="panel">
        <h3>ملخص الطلب — ${esc(r.name)}</h3>
        ${lines.map((l) => `<div class="mini-line"><span>${l.qty}× ${esc(l.item.name)}</span><span>${fmt(l.item.price * l.qty)}</span></div>`).join('')}
        <div id="checkoutSummary">${summary(t, currentZone(), Cart.usableCoupons(r, state.settings).map((c) => c.code))}</div>
        <button class="btn primary block" type="submit" id="placeBtn">تأكيد الطلب • ${fmt(t.total)}</button>
      </section>
    </form>`;

  // تحديث الملخص لما المنطقة أو الأسعار تتغير من غير ما نمسح اللي العميل كتبه
  refreshCheckout = () => {
    const rest = cartRestaurant();
    if (!rest) return;
    const tt = cartTotals(rest);
    document.getElementById('checkoutSummary').innerHTML = summary(tt, currentZone(), Cart.usableCoupons(rest, state.settings).map((c) => c.code));
    document.getElementById('placeBtn').textContent = `تأكيد الطلب • ${fmt(tt.total)}`;
  };
  document.getElementById('zoneSelect')?.addEventListener('change', (e) => { Cart.setZone(e.target.value); refreshCheckout(); });

  locationPicker(document.getElementById('map'), location_, (ll) => { location_ = ll; },
    { hint: 'هيتبعت للمندوب مع الطلب' }).then((p) => {
    if (page !== 'checkout') return p.destroy();
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
      lines: Cart.lines(rest).map((l) => ({ id: l.item.id, name: l.item.name, price: l.item.price, qty: l.qty, ...(l.item.fullPrice > l.item.price ? { fullPrice: l.item.fullPrice } : {}) })),
      totals,
      promos: usedCoupons.map((c) => c.code),
      coupons: usedCoupons.map((c) => ({ code: c.code, label: couponLabel(c), amount: couponDiscount(c, totals.subtotal, totals.delivery) })),
      address: d.address.trim(),
      location: location_,
      notes: d.notes.trim(),
      payment: d.payment,
      status: 'placed',
      statusHistory: [{ status: 'placed', at: Date.now() }],
    };
    btn.disabled = true;
    btn.textContent = 'جاري إرسال الطلب...';
    try {
      const id = await backend.createOrder(order, usedCoupons);
      backend.updateProfile(u.uid, { name: order.customerName, phone: order.customerPhone, address: order.address, location: location_ })
        .catch(console.error);
      Cart.clear();
      toast('تم إرسال طلبك بنجاح 🎉');
      location.hash = `#/order/${id}`;
    } catch (err) {
      console.error(err);
      toast(errorMessage(err));
      btn.disabled = false;
      btn.textContent = `تأكيد الطلب • ${fmt(totals.total)}`;
    }
  });
}

// ---------- تتبع الطلب ----------

function renderOrder(id) {
  if (state.user === undefined) { app.innerHTML = loader(); return; }
  if (!state.user) { location.hash = '#/login'; return; }
  app.innerHTML = loader();
  setCleanup(backend.watchOrder(id, (o) => {
    if (!o) return renderNotFound();
    drawOrder(o);
  }));
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
          : `<div class="eta">${done ? 'وصل! بالهنا والشفا 😋' : `الوصول خلال ${remaining}`}</div>`}
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
        ${o.driverUid ? `<div class="driver-box">🛵 المندوب: <b>${esc(o.driverName)}</b> • <a href="tel:${esc(o.driverPhone)}" dir="ltr">📞 ${esc(o.driverPhone)}</a></div>` : ''}
        ${o.status === 'placed' ? '<p class="muted small center">مستنيين المطعم يأكد طلبك... الصفحة بتتحدث لوحدها.</p>' : ''}`}
    </section>

    <div class="two-col">
      <section class="panel">
        <h3>تفاصيل الطلب</h3>
        ${o.lines.map((l) => `<div class="mini-line"><span>${l.qty}× ${esc(l.name)}</span><span>${fmt(l.price * l.qty)}</span></div>`).join('')}
        ${summary(o.totals, undefined, o.promos || (o.promo ? [o.promo] : []))}
      </section>
      <section class="panel">
        <h3>التوصيل</h3>
        <p>📍 ${o.zoneName ? `${esc(o.zoneName)} — ` : ''}${esc(o.address)}</p>
        <p>📞 <span dir="ltr">${esc(o.customerPhone)}</span></p>
        <p>${paymentLabel(o.payment)}</p>
        ${o.notes ? `<p>📝 ${esc(o.notes)}</p>` : ''}
        ${o.status === 'placed' ? '<button class="btn block danger-outline" id="cancelOrder" type="button">إلغاء الطلب</button>' : ''}
        <button class="btn block" id="reorder" type="button">🔁 اطلب نفس الطلب تاني</button>
        <a class="btn block" href="#/support/order/${o.id}">🎧 عندك مشكلة في الطلب ده؟</a>
      </section>
    </div>`;

  document.getElementById('reorder').addEventListener('click', () => reorder(o));
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

function reorder(o) {
  const r = findRestaurant(o.restaurantId);
  if (!r) return toast('المطعم ده مش متاح دلوقتي');
  if (Cart.count() && Cart.restaurantId !== o.restaurantId && !confirm('السلة الحالية فيها أصناف من مطعم تاني. تحب تستبدلها؟')) return;
  Cart.clear();
  const available = new Set(r.menu.flatMap((s) => s.items).filter(isAvailable).map((i) => i.id));
  o.lines.filter((l) => available.has(l.id)).forEach((l) => {
    Cart.add(o.restaurantId, l.id);
    Cart.setQty(l.id, l.qty);
  });
  if (!Cart.count()) return toast('الأصناف دي مش متاحة دلوقتي');
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
            <strong>${fmt(o.totals.total)}</strong>
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
      <label>الاسم<input name="name" required value="${esc(u.name)}"></label>
      <label>رقم الموبايل<input name="phone" type="tel" required pattern="01[0-9]{9}" value="${esc(u.phone)}" inputmode="numeric" dir="ltr"></label>
      <label>العنوان<textarea name="address" rows="2">${esc(u.address)}</textarea></label>
      <button class="btn primary block" type="submit">حفظ</button>
      <button class="btn block" type="button" id="logout">تسجيل الخروج</button>
    </form>
    ${changePasswordForm()}`;
  bindChangePassword(app, backend);
  document.getElementById('profileForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    try {
      await backend.updateProfile(u.uid, { name: d.name.trim(), address: d.address.trim(), location: u.location });
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

backend.watchRestaurants((list) => {
  const first = state.restaurants === null;
  state.restaurants = list;
  // صفحات بتعتمد على بيانات المطاعم بس، فنحدثها لما المطاعم تتغير
  if (first || ['', 'restaurant', 'cart', 'offers'].includes(page)) {
    const y = window.scrollY;
    router();
    window.scrollTo(0, y);
  }
});

backend.watchSettings((settings) => {
  const first = state.settings === null;
  state.settings = settings;
  if (page === 'checkout' && !first && refreshCheckout) return refreshCheckout();
  if (first || ['', 'restaurant', 'cart', 'offers'].includes(page)) {
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
