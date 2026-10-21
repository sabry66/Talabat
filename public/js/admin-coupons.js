// تبويب "الكوبونات" في لوحة الأدمن: إنشاء وتعديل ووقف وحذف أكواد الخصم، وعدد الكوبونات المسموح بيها في الطلب
import { esc, fmt, toast, errorMessage } from './ui.js';
import { withDefaults, sum } from './finance.js';
import {
  COUPON_TYPES, MAX_COUPONS_PER_ORDER, CODE_RE, normalizeCode, couponLabel, couponConditions, couponProblem,
} from './coupons.js';

const EMPTY = {
  code: '', type: 'percent', value: 10, maxDiscount: 0, minOrder: 0, expiresAt: null,
  limit: 0, onePerCustomer: false, active: true,
};

// تاريخ الانتهاء: آخر اليوم اللي الأدمن اختاره
const dateToMs = (d) => (d ? new Date(`${d}T23:59:59`).getTime() : null);
const msToDate = (ms) => {
  if (!ms) return '';
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// getSettings / getOrders: دوال بترجع أحدث بيانات من اللوحة
export function drawCoupons(body, { backend, getSettings, getOrders }) {
  let coupons = null;
  let form = { ...EMPTY };
  let editingCode = null; // الكود اللي بيتعدل، أو null لكوبون جديد

  // الخصم اللي اتعمل بكل كوبون في الطلبات اللي متلغتش
  const givenBy = (code) => {
    const list = (getOrders() || []).filter((o) => !['cancelled', 'rejected'].includes(o.status)
      && ((o.promos || []).includes(code) || o.promo === code));
    return { count: list.length, total: sum(list, (o) => (o.coupons || []).find((c) => c.code === code)?.amount ?? (o.promo === code ? o.totals.discount : 0)) };
  };

  function drawList() {
    const box = body.querySelector('#couponList');
    if (!box) return;
    if (!coupons) { box.innerHTML = '<div class="loader"></div>'; return; }
    // الحد الأدنى شرط على الطلب، مش مشكلة في الكوبون نفسه
    const problemOf = (c) => couponProblem(c, { subtotal: Infinity });
    const row = (c) => {
      const problem = problemOf(c);
      const g = givenBy(c.code);
      const left = Number(c.limit) > 0 ? Math.max(0, c.limit - (c.used || 0)) : null;
      return `
        <div class="coupon-row ${problem ? 'off' : ''}">
          <div class="grow">
            <div class="coupon-title"><b dir="ltr" class="coupon-code">${esc(c.code)}</b> ${esc(couponLabel(c))}
              <span class="status ${problem ? 'cancelled' : 'delivered'}">${c.active ? (problem ? `⏸ ${esc(problem.replace('الكود ده ', ''))}` : '🟢 شغال') : '⏸ موقوف'}</span></div>
            <div class="muted small">${esc(couponConditions(c)) || 'من غير شروط'}</div>
            <div class="small">اتستخدم في ${c.used || 0} طلب${left !== null ? ` من ${c.limit} (فاضل ${left})` : ''} • إجمالي الخصم: ${fmt(g.total)}</div>
          </div>
          <div class="row-actions">
            <button type="button" class="btn small" data-edit="${esc(c.code)}">✏️ تعديل</button>
            <button type="button" class="btn small" data-toggle="${esc(c.code)}">${c.active ? '⏸ إيقاف' : '▶ تفعيل'}</button>
            <button type="button" class="btn small danger-outline" data-del="${esc(c.code)}">🗑️ حذف</button>
          </div>
        </div>`;
    };
    // شغالة / خلصت أو انتهت (بتقف لوحدها) / موقوفة من الأدمن
    const working = coupons.filter((c) => c.active && !problemOf(c));
    const finished = coupons.filter((c) => c.active && problemOf(c));
    const paused = coupons.filter((c) => !c.active);
    const group = (title, list, empty) => `
      <h4 class="coupon-group">${title} (${list.length})</h4>
      ${list.length ? list.map(row).join('') : `<p class="muted small">${empty}</p>`}`;
    box.innerHTML = coupons.length ? `
      ${group('🟢 شغالة', working, 'مفيش كوبونات شغالة دلوقتي.')}
      ${group('⛔ خلصت أو انتهت', finished, 'مفيش. الكوبون اللي يوصل لعدد الطلبات المسموح أو يعدّي آخر يوم بيقف لوحده وينزل هنا، ولو عايز ترجّعه عدّل العدد أو التاريخ.')}
      ${paused.length ? group('⏸ موقوفة', paused, '') : ''}`
      : '<p class="muted">مفيش كوبونات لسه. اعمل أول كوبون من الفورم اللي فوق.</p>';

    box.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => {
      const c = coupons.find((x) => x.code === b.dataset.edit);
      editingCode = c.code;
      form = { ...EMPTY, ...c };
      drawForm();
      body.querySelector('#couponForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));
    box.querySelectorAll('[data-toggle]').forEach((b) => b.addEventListener('click', async () => {
      const c = coupons.find((x) => x.code === b.dataset.toggle);
      b.disabled = true;
      try {
        await backend.saveCoupon({ ...c, active: !c.active }, false);
        toast(c.active ? 'تم إيقاف الكوبون' : 'تم تفعيل الكوبون ✅');
      } catch (err) {
        toast(errorMessage(err));
        b.disabled = false;
      }
    }));
    box.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
      if (!confirm(`حذف الكوبون ${b.dataset.del} نهائيًا؟ (الطلبات القديمة اللي اتعملت بيه مش هتتأثر)`)) return;
      try {
        await backend.deleteCoupon(b.dataset.del);
        if (editingCode === b.dataset.del) { editingCode = null; form = { ...EMPTY }; drawForm(); }
        toast('تم حذف الكوبون');
      } catch (err) {
        toast(errorMessage(err));
      }
    }));
  }

  function drawForm() {
    const el = body.querySelector('#couponFormBox');
    const t = form.type;
    el.innerHTML = `
      <form id="couponForm" class="panel" novalidate>
        <h3>${editingCode ? `✏️ تعديل الكوبون <span dir="ltr">${esc(editingCode)}</span>` : '➕ كوبون جديد'}</h3>
        <div class="form-grid">
          <label>الكود (حروف إنجليزي وأرقام)
            <input name="code" value="${esc(form.code)}" required pattern="[A-Za-z0-9_\\-]{3,20}" placeholder="RAMADAN25" dir="ltr"
              autocomplete="off" autocapitalize="characters" ${editingCode ? 'readonly' : ''}>
          </label>
          <label>نوع الخصم
            <select name="type">
              ${Object.entries(COUPON_TYPES).map(([k, l]) => `<option value="${k}" ${t === k ? 'selected' : ''}>${l}</option>`).join('')}
            </select>
          </label>
          ${t !== 'delivery' ? `<label>${t === 'percent' ? 'نسبة الخصم %' : 'قيمة الخصم (ج.م)'}
            <input name="value" type="number" min="1" ${t === 'percent' ? 'max="100"' : ''} step="any" value="${form.value || ''}" required inputmode="decimal">
          </label>` : ''}
          ${t === 'percent' ? `<label>أقصى خصم (ج.م) — 0 يعني من غير حد
            <input name="maxDiscount" type="number" min="0" step="any" value="${form.maxDiscount || 0}" inputmode="decimal">
          </label>` : ''}
          <label>الحد الأدنى للطلب (ج.م) — 0 يعني أي طلب
            <input name="minOrder" type="number" min="0" step="any" value="${form.minOrder || 0}" inputmode="decimal">
          </label>
          <label>عدد الطلبات المسموح بيها بالكوبون (مثلًا 100) — 0 يعني من غير حد
            <input name="limit" type="number" min="0" step="1" value="${form.limit || 0}" inputmode="numeric">
          </label>
          <label>آخر يوم للكوبون (اختياري)
            <input name="expires" type="date" value="${msToDate(form.expiresAt)}">
          </label>
        </div>
        <label class="check"><input type="checkbox" name="onePerCustomer" ${form.onePerCustomer ? 'checked' : ''}> مرة واحدة بس لكل عميل</label>
        <p class="muted small">💡 لو عايز الكوبون لـ 100 شخص مختلف: حط العدد 100 وعلّم "مرة واحدة بس لكل عميل". أول ما يتعمل بيه 100 طلب بيقف لوحده.</p>
        <label class="check"><input type="checkbox" name="active" ${form.active ? 'checked' : ''}> الكوبون شغال</label>
        <p class="example" id="couponPreview"></p>
        <div class="editor-actions">
          <button class="btn primary" type="submit">${editingCode ? '💾 حفظ التعديل' : '➕ إضافة الكوبون'}</button>
          ${editingCode ? '<button class="btn" type="button" id="cancelCoupon">إلغاء</button>' : ''}
        </div>
      </form>`;

    const f = el.querySelector('#couponForm');
    const read = () => {
      const d = Object.fromEntries(new FormData(f));
      return {
        ...form,
        code: editingCode || normalizeCode(d.code),
        type: d.type,
        value: d.type === 'delivery' ? 0 : Number(d.value) || 0,
        maxDiscount: d.type === 'percent' ? Number(d.maxDiscount) || 0 : 0,
        minOrder: Number(d.minOrder) || 0,
        limit: Math.max(0, Math.floor(Number(d.limit) || 0)),
        expiresAt: dateToMs(d.expires),
        onePerCustomer: Boolean(d.onePerCustomer),
        active: Boolean(d.active),
      };
    };
    const preview = () => {
      const c = read();
      el.querySelector('#couponPreview').textContent = c.code
        ? `العميل هيكتب ${c.code} وياخد ${couponLabel(c)}${couponConditions(c) ? ` — ${couponConditions(c)}` : ''}` : '';
    };
    preview();
    f.addEventListener('input', preview);
    f.querySelector('[name=type]').addEventListener('change', () => { form = read(); drawForm(); });
    el.querySelector('#cancelCoupon')?.addEventListener('click', () => { editingCode = null; form = { ...EMPTY }; drawForm(); });

    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const c = read();
      if (!CODE_RE.test(c.code)) return toast('الكود لازم يكون من 3 لـ 20 حرف إنجليزي أو أرقام (ومن غير مسافات)');
      if (c.type !== 'delivery' && !(c.value > 0)) return toast('اكتب قيمة الخصم');
      if (c.type === 'percent' && c.value > 100) return toast('النسبة مينفعش تزيد عن 100%');
      if (c.expiresAt && c.expiresAt < Date.now()) return toast('تاريخ الانتهاء فات خلاص');
      const btn = f.querySelector('button[type=submit]');
      btn.disabled = true;
      try {
        await backend.saveCoupon(c, !editingCode);
        toast(editingCode ? 'تم حفظ التعديل ✅' : `تمت إضافة الكوبون ${c.code} ✅`);
        editingCode = null;
        form = { ...EMPTY };
        drawForm();
      } catch (err) {
        toast(errorMessage(err));
        btn.disabled = false;
      }
    });
  }

  const per = withDefaults(getSettings()).couponsPerOrder;
  body.innerHTML = `
    <section class="panel">
      <h3>⚙️ إعدادات الكوبونات</h3>
      <form class="promo-form" id="perOrderForm">
        <label class="grow">عدد الكوبونات المسموح بيها في الطلب الواحد
          <select id="perOrder">
            ${Array.from({ length: MAX_COUPONS_PER_ORDER + 1 }, (_, n) =>
              `<option value="${n}" ${per === n ? 'selected' : ''}>${n === 0 ? '0 — الكوبونات مقفولة (الخانة مش هتظهر للعميل)' : n === 1 ? 'كوبون واحد' : `${n} كوبون مع بعض`}</option>`).join('')}
          </select>
        </label>
        <button class="btn primary" type="submit">حفظ</button>
      </form>
      <p class="muted small">الخصم بيتحسب من نصيب المنصة، والمطعم بياخد حقه كامل. الأكواد مش بتظهر لأي حد غيرك، العميل لازم يعرف الكود عشان يستخدمه.</p>
    </section>
    <div id="couponFormBox"></div>
    <section class="panel">
      <h3>🎟️ الكوبونات</h3>
      <div id="couponList"></div>
    </section>`;

  body.querySelector('#perOrderForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await backend.saveSettings({ ...withDefaults(getSettings()), couponsPerOrder: Number(body.querySelector('#perOrder').value) });
      toast('تم الحفظ ✅');
    } catch (err) {
      toast(errorMessage(err));
    }
  });

  drawForm();
  drawList();
  return backend.watchCoupons((list) => {
    coupons = list;
    drawList();
  });
}
