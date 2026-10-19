// الواجهة والتنقل بين الصفحات (hash routing)
const app = document.getElementById('app');
const fmt = (n) => `${n.toLocaleString('ar-EG')} ج.م`;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// حالة صفحة الرئيسية (بحث / تصنيف / ترتيب)
const ui = { query: '', category: 'all', sort: 'recommended' };
let trackingTimer = null;

// مدة كل مرحلة في تتبع الطلب (مُسرّعة للعرض التجريبي)
const STAGE_SECONDS = [0, 15, 45, 90];

function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove('show'), 2200);
}

function updateHeader() {
  document.getElementById('cartCount').textContent = Store.cartCount();
  document.getElementById('addressLabel').textContent = Store.get().address;
}

function orderStage(order) {
  const elapsed = (Date.now() - order.createdAt) / 1000;
  let stage = 0;
  STAGE_SECONDS.forEach((s, i) => { if (elapsed >= s) stage = i; });
  return stage;
}

// ---------- الصفحات ----------

function renderHome() {
  const q = ui.query.trim();
  let list = RESTAURANTS.filter((r) =>
    (ui.category === 'all' || r.category === ui.category) &&
    (!q || r.name.includes(q) || r.tags.some((t) => t.includes(q)) ||
      r.menu.some((s) => s.items.some((i) => i.name.includes(q))))
  );
  if (ui.sort === 'rating') list = [...list].sort((a, b) => b.rating - a.rating);
  if (ui.sort === 'time') list = [...list].sort((a, b) => a.time[0] - b.time[0]);
  if (ui.sort === 'fee') list = [...list].sort((a, b) => a.deliveryFee - b.deliveryFee);

  app.innerHTML = `
    <section class="hero">
      <h1>جعان؟ اطلب أكلك المفضل وهيوصلك لحد الباب 🛵</h1>
      <div class="search">
        <input id="search" type="search" placeholder="دوّر على مطعم أو أكلة..." value="${esc(ui.query)}" autocomplete="off">
      </div>
    </section>

    <section class="cats" role="tablist">
      ${CATEGORIES.map((c) => `
        <button class="cat ${ui.category === c.id ? 'active' : ''}" data-cat="${c.id}" type="button">
          <span class="cat-icon">${c.icon}</span><span>${c.name}</span>
        </button>`).join('')}
    </section>

    <div class="list-head">
      <h2>${list.length} مطعم متاح</h2>
      <select id="sort" aria-label="ترتيب">
        <option value="recommended" ${ui.sort === 'recommended' ? 'selected' : ''}>المقترح</option>
        <option value="rating" ${ui.sort === 'rating' ? 'selected' : ''}>الأعلى تقييمًا</option>
        <option value="time" ${ui.sort === 'time' ? 'selected' : ''}>الأسرع توصيلًا</option>
        <option value="fee" ${ui.sort === 'fee' ? 'selected' : ''}>أقل رسوم توصيل</option>
      </select>
    </div>

    <section class="grid">
      ${list.length ? list.map(restaurantCard).join('') : '<p class="empty">مفيش نتائج مطابقة 😕</p>'}
    </section>`;

  const search = document.getElementById('search');
  search.addEventListener('input', (e) => {
    ui.query = e.target.value;
    const pos = e.target.selectionStart;
    renderHome();
    const s = document.getElementById('search');
    s.focus();
    s.setSelectionRange(pos, pos);
  });
  app.querySelectorAll('.cat').forEach((b) => b.addEventListener('click', () => { ui.category = b.dataset.cat; renderHome(); }));
  document.getElementById('sort').addEventListener('change', (e) => { ui.sort = e.target.value; renderHome(); });
}

function restaurantCard(r) {
  return `
    <a class="card" href="#/restaurant/${r.id}">
      <div class="card-cover" style="background:${r.color}">${r.emoji}
        ${r.promo ? `<span class="promo">${esc(r.promo)}</span>` : ''}
      </div>
      <div class="card-body">
        <div class="card-title">
          <h3>${esc(r.name)}</h3>
          <span class="rating">⭐ ${r.rating}</span>
        </div>
        <p class="muted">${r.tags.join(' • ')}</p>
        <p class="meta">🕒 ${r.time[0]}-${r.time[1]} دقيقة • 🛵 ${fmt(r.deliveryFee)}</p>
      </div>
    </a>`;
}

function renderRestaurant(id) {
  const r = Store.findRestaurant(id);
  if (!r) return renderNotFound();
  const cart = Store.get().cart;
  const inCart = cart.restaurantId === r.id ? cart.items : {};

  app.innerHTML = `
    <a href="#/" class="back">→ رجوع للمطاعم</a>
    <section class="rest-header" style="background:${r.color}">
      <div class="rest-emoji">${r.emoji}</div>
      <div>
        <h1>${esc(r.name)}</h1>
        <p>${r.tags.join(' • ')}</p>
        <p class="meta">⭐ ${r.rating} (${r.reviews.toLocaleString('ar-EG')} تقييم) • 🕒 ${r.time[0]}-${r.time[1]} دقيقة • 🛵 ${fmt(r.deliveryFee)} • الحد الأدنى ${fmt(r.minOrder)}</p>
        ${r.promo ? `<span class="promo static">${esc(r.promo)}</span>` : ''}
      </div>
    </section>

    <nav class="sections-nav">
      ${r.menu.map((s, i) => `<a href="#sec-${i}" data-scroll="sec-${i}">${esc(s.section)}</a>`).join('')}
    </nav>

    <div class="menu-layout">
      <div class="menu">
        ${r.menu.map((s, i) => `
          <section class="menu-section" id="sec-${i}">
            <h2>${esc(s.section)}</h2>
            ${s.items.map((it) => `
              <div class="item">
                <div class="item-info">
                  <h3>${esc(it.name)}</h3>
                  <p class="muted">${esc(it.desc)}</p>
                  <strong>${fmt(it.price)}</strong>
                </div>
                <div class="item-side">
                  <div class="item-img">${it.emoji}</div>
                  ${inCart[it.id]
                    ? `<div class="qty">
                         <button data-dec="${it.id}" type="button" aria-label="نقص">−</button>
                         <span>${inCart[it.id]}</span>
                         <button data-inc="${it.id}" type="button" aria-label="زود">+</button>
                       </div>`
                    : `<button class="add-btn" data-add="${it.id}" type="button">+ إضافة</button>`}
                </div>
              </div>`).join('')}
          </section>`).join('')}
      </div>
      <aside class="side-cart">${miniCart()}</aside>
    </div>`;

  app.querySelectorAll('[data-scroll]').forEach((a) => a.addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById(a.dataset.scroll).scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));

  const rerender = () => { const y = window.scrollY; renderRestaurant(id); window.scrollTo(0, y); };

  app.querySelectorAll('[data-add], [data-inc]').forEach((b) => b.addEventListener('click', () => {
    const itemId = b.dataset.add || b.dataset.inc;
    if (!Store.addItem(r.id, itemId)) {
      const other = Store.findRestaurant(Store.get().cart.restaurantId);
      if (!confirm(`السلة فيها أصناف من "${other.name}". تحب تفضّيها وتبدأ طلب جديد من "${r.name}"؟`)) return;
      Store.addItem(r.id, itemId, true);
    }
    toast('تمت الإضافة للسلة ✅');
    rerender();
  }));
  app.querySelectorAll('[data-dec]').forEach((b) => b.addEventListener('click', () => {
    Store.setQty(b.dataset.dec, (Store.get().cart.items[b.dataset.dec] || 0) - 1);
    rerender();
  }));
}

function miniCart() {
  const lines = Store.cartLines();
  if (!lines.length) return `<h3>سلتك</h3><p class="muted">السلة فاضية. ضيف أصناف من المنيو.</p>`;
  const r = Store.findRestaurant(Store.get().cart.restaurantId);
  const t = Store.totals();
  return `
    <h3>سلتك من ${esc(r.name)}</h3>
    ${lines.map((l) => `<div class="mini-line"><span>${l.qty}× ${esc(l.item.name)}</span><span>${fmt(l.item.price * l.qty)}</span></div>`).join('')}
    <div class="mini-line total"><span>المجموع الفرعي</span><span>${fmt(t.subtotal)}</span></div>
    <a href="#/cart" class="btn primary block">اذهب للسلة (${Store.cartCount()})</a>`;
}

function renderCart() {
  const lines = Store.cartLines();
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
  const r = Store.findRestaurant(Store.get().cart.restaurantId);
  const t = Store.totals();
  const promo = Store.get().promo;
  const belowMin = t.subtotal < r.minOrder;

  app.innerHTML = `
    <h1 class="page-title">السلة</h1>
    <div class="two-col">
      <section class="panel">
        <div class="panel-head">
          <a href="#/restaurant/${r.id}"><strong>${r.emoji} ${esc(r.name)}</strong></a>
          <button class="link danger" id="clearCart" type="button">تفضية السلة</button>
        </div>
        ${lines.map((l) => `
          <div class="cart-line">
            <div class="item-img sm">${l.item.emoji}</div>
            <div class="grow">
              <strong>${esc(l.item.name)}</strong>
              <div class="muted">${fmt(l.item.price)}</div>
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
        <h3>كود الخصم</h3>
        ${promo
          ? `<div class="promo-applied">✅ ${promo} — ${PROMO_CODES[promo].label} <button class="link danger" id="removePromo" type="button">إزالة</button></div>`
          : `<form class="promo-form" id="promoForm">
               <input id="promoInput" placeholder="مثال: TALABAT20" autocomplete="off">
               <button class="btn" type="submit">تطبيق</button>
             </form>
             <p class="muted small">جرّب: TALABAT20 أو WELCOME50 أو FREEDEL</p>`}
        ${summary(t)}
        ${belowMin ? `<p class="warn">الحد الأدنى للطلب ${fmt(r.minOrder)} — ضيف ${fmt(r.minOrder - t.subtotal)} كمان</p>` : ''}
        <a href="#/checkout" class="btn primary block ${belowMin ? 'disabled' : ''}" ${belowMin ? 'aria-disabled="true"' : ''}>إتمام الطلب</a>
      </section>
    </div>`;

  app.querySelectorAll('[data-inc]').forEach((b) => b.addEventListener('click', () => {
    Store.setQty(b.dataset.inc, Store.get().cart.items[b.dataset.inc] + 1); renderCart();
  }));
  app.querySelectorAll('[data-dec]').forEach((b) => b.addEventListener('click', () => {
    Store.setQty(b.dataset.dec, Store.get().cart.items[b.dataset.dec] - 1); renderCart();
  }));
  document.getElementById('clearCart').addEventListener('click', () => {
    if (confirm('متأكد إنك عايز تفضّي السلة؟')) { Store.clearCart(); renderCart(); }
  });
  const form = document.getElementById('promoForm');
  if (form) form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (Store.applyPromo(document.getElementById('promoInput').value)) { toast('تم تطبيق الكود 🎉'); renderCart(); }
    else toast('الكود غير صحيح');
  });
  const rm = document.getElementById('removePromo');
  if (rm) rm.addEventListener('click', () => { Store.removePromo(); renderCart(); });
}

function summary(t) {
  return `
    <div class="summary">
      <div><span>المجموع الفرعي</span><span>${fmt(t.subtotal)}</span></div>
      <div><span>رسوم التوصيل</span><span>${t.delivery ? fmt(t.delivery) : 'مجاني'}</span></div>
      <div><span>رسوم الخدمة</span><span>${fmt(t.service)}</span></div>
      ${t.discount ? `<div class="discount"><span>الخصم</span><span>− ${fmt(t.discount)}</span></div>` : ''}
      <div class="grand"><span>الإجمالي</span><span>${fmt(t.total)}</span></div>
    </div>`;
}

function renderCheckout() {
  const lines = Store.cartLines();
  if (!lines.length) { location.hash = '#/cart'; return; }
  const r = Store.findRestaurant(Store.get().cart.restaurantId);
  const t = Store.totals();
  if (t.subtotal < r.minOrder) { location.hash = '#/cart'; return; }

  app.innerHTML = `
    <h1 class="page-title">إتمام الطلب</h1>
    <form class="two-col" id="checkoutForm">
      <section class="panel">
        <h3>📍 عنوان التوصيل</h3>
        <label>العنوان بالتفصيل
          <textarea name="address" required rows="2" placeholder="المنطقة، الشارع، رقم العمارة، الدور، الشقة">${esc(Store.get().address)}</textarea>
        </label>
        <label>رقم الموبايل
          <input name="phone" type="tel" required pattern="01[0-9]{9}" placeholder="01xxxxxxxxx" inputmode="numeric">
        </label>
        <label>ملاحظات للمطعم (اختياري)
          <input name="notes" placeholder="مثال: من غير بصل">
        </label>

        <h3>💳 طريقة الدفع</h3>
        <div class="pay-options">
          <label class="pay"><input type="radio" name="payment" value="cash" checked> 💵 كاش عند الاستلام</label>
          <label class="pay"><input type="radio" name="payment" value="card"> 💳 بطاقة عند الاستلام</label>
          <label class="pay"><input type="radio" name="payment" value="wallet"> 📱 محفظة إلكترونية</label>
        </div>
      </section>

      <section class="panel">
        <h3>ملخص الطلب — ${esc(r.name)}</h3>
        ${lines.map((l) => `<div class="mini-line"><span>${l.qty}× ${esc(l.item.name)}</span><span>${fmt(l.item.price * l.qty)}</span></div>`).join('')}
        ${summary(t)}
        <button class="btn primary block" type="submit">تأكيد الطلب • ${fmt(t.total)}</button>
      </section>
    </form>`;

  document.getElementById('checkoutForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const d = new FormData(e.target);
    const order = Store.placeOrder({
      address: d.get('address').trim(),
      phone: d.get('phone').trim(),
      notes: d.get('notes').trim(),
      payment: d.get('payment'),
    });
    toast('تم إرسال طلبك بنجاح 🎉');
    location.hash = `#/order/${order.id}`;
  });
}

function renderOrder(id) {
  const o = Store.findOrder(id);
  if (!o) return renderNotFound();
  const r = Store.findRestaurant(o.restaurantId);
  const stage = orderStage(o);
  const remaining = Math.max(0, Math.ceil(o.etaMinutes * (1 - stage / (ORDER_STATUSES.length - 1))));
  const payLabel = { cash: 'كاش عند الاستلام', card: 'بطاقة عند الاستلام', wallet: 'محفظة إلكترونية' }[o.payment];

  app.innerHTML = `
    <a href="#/orders" class="back">→ كل طلباتي</a>
    <section class="panel track">
      <div class="track-head">
        <div>
          <h1>طلب رقم #${o.id}</h1>
          <p class="muted">${r.emoji} ${esc(r.name)} • ${new Date(o.createdAt).toLocaleString('ar-EG')}</p>
        </div>
        <div class="eta">${stage === ORDER_STATUSES.length - 1 ? 'وصل! بالهنا والشفا 😋' : `الوصول خلال ~${remaining} دقيقة`}</div>
      </div>
      <div class="rider ${stage === 2 ? 'moving' : ''}">${stage >= 2 ? '🛵' : ORDER_STATUSES[stage].icon}</div>
      <ol class="steps">
        ${ORDER_STATUSES.map((s, i) => `
          <li class="${i < stage ? 'done' : ''} ${i === stage ? 'current' : ''}">
            <span class="dot">${i <= stage ? s.icon : ''}</span>
            <span>${s.label}</span>
          </li>`).join('')}
      </ol>
      <p class="muted small">* تتبع تجريبي: الحالة بتتغير تلقائيًا كل عدة ثواني.</p>
    </section>

    <div class="two-col">
      <section class="panel">
        <h3>تفاصيل الطلب</h3>
        ${o.lines.map((l) => `<div class="mini-line"><span>${l.qty}× ${esc(l.name)}</span><span>${fmt(l.price * l.qty)}</span></div>`).join('')}
        ${summary(o.totals)}
      </section>
      <section class="panel">
        <h3>التوصيل</h3>
        <p>📍 ${esc(o.address)}</p>
        <p>📞 ${esc(o.phone)}</p>
        <p>💳 ${payLabel}</p>
        ${o.notes ? `<p>📝 ${esc(o.notes)}</p>` : ''}
        <button class="btn block" id="reorder" type="button">🔁 اطلب نفس الطلب تاني</button>
      </section>
    </div>`;

  document.getElementById('reorder').addEventListener('click', () => reorder(o));

  if (stage < ORDER_STATUSES.length - 1) {
    trackingTimer = setTimeout(() => { if (location.hash === `#/order/${id}`) renderOrder(id); }, 3000);
  }
}

function reorder(o) {
  const cart = Store.get().cart;
  if (cart.restaurantId && cart.restaurantId !== o.restaurantId && Object.keys(cart.items).length &&
      !confirm('السلة الحالية من مطعم تاني. تحب تستبدلها؟')) return;
  Store.clearCart();
  o.lines.forEach((l) => { for (let i = 0; i < l.qty; i++) Store.addItem(o.restaurantId, l.id); });
  location.hash = '#/cart';
}

function renderOrders() {
  const orders = Store.get().orders;
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
      ${orders.map((o) => {
        const r = Store.findRestaurant(o.restaurantId);
        const s = ORDER_STATUSES[orderStage(o)];
        return `
          <a class="panel order-row" href="#/order/${o.id}">
            <div class="item-img sm">${r.emoji}</div>
            <div class="grow">
              <strong>${esc(r.name)}</strong>
              <div class="muted small">#${o.id} • ${new Date(o.createdAt).toLocaleDateString('ar-EG')} • ${o.lines.reduce((a, l) => a + l.qty, 0)} صنف</div>
            </div>
            <span class="status ${s.key}">${s.icon} ${s.label}</span>
            <strong>${fmt(o.totals.total)}</strong>
          </a>`;
      }).join('')}
    </div>`;
}

function renderNotFound() {
  app.innerHTML = `<div class="empty-state"><div class="big">🤷</div><h2>الصفحة مش موجودة</h2><a href="#/" class="btn primary">الرئيسية</a></div>`;
}

// ---------- التنقل ----------

function router() {
  clearTimeout(trackingTimer);
  const [, page, id] = (location.hash || '#/').slice(1).split('/');
  switch (page) {
    case '': case undefined: renderHome(); break;
    case 'restaurant': renderRestaurant(id); break;
    case 'cart': renderCart(); break;
    case 'checkout': renderCheckout(); break;
    case 'orders': renderOrders(); break;
    case 'order': renderOrder(id); break;
    default: renderNotFound();
  }
  updateHeader();
}

window.addEventListener('hashchange', () => { router(); window.scrollTo(0, 0); });
Store.subscribe(updateHeader);
document.getElementById('addressBtn').addEventListener('click', () => {
  const addr = prompt('اكتب عنوان التوصيل:', Store.get().address);
  if (addr && addr.trim()) { Store.setAddress(addr.trim()); toast('تم تحديث العنوان 📍'); }
});
router();
