// محرر بيانات المطعم والمنيو: بيستخدمه صاحب المطعم والأدمن
import { CATEGORIES } from './data.js';
import { esc, toast, restaurantLogo, itemImage } from './ui.js';
import { uploadImage, uploadsEnabled } from './upload.js';
import { locationPicker } from './map.js';

const newItemId = () => 'i' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

const EDITABLE = ['name', 'emoji', 'color', 'logo', 'category', 'tags', 'time', 'minOrder', 'promo',
  'address', 'phone', 'location', 'isOpen', 'menu'];

// showOpenToggle: false في لوحة المطعم لأن الفتح والقفل ليه زرار لوحده فوق
export function renderMenuEditor(el, restaurant, { onSave, onCancel, saveLabel = 'حفظ التعديلات', showOpenToggle = true }) {
  // في لوحة المطعم: الفتح والقفل ليهم زرار، والعرض ليه تبويب "العروض"
  const fields = showOpenToggle ? EDITABLE : EDITABLE.filter((k) => k !== 'isOpen' && k !== 'promo');
  const draft = JSON.parse(JSON.stringify(Object.fromEntries(fields.map((k) => [k, restaurant[k] ?? null]))));
  draft.tags ||= [];
  draft.time ||= [20, 35];
  draft.menu ||= [];
  if (showOpenToggle) draft.promo ||= '';
  draft.address ||= '';
  draft.phone ||= '';
  draft.logo ||= '';
  let picker = null;
  let savedLoc = JSON.stringify(restaurant.location || null); // عشان نقول لصاحب المطعم المكان اتحفظ ولا لأ

  // يقرا كل الحقول من الصفحة ويحطها في draft قبل أي إعادة رسم
  function sync() {
    el.querySelectorAll('[data-f]').forEach((inp) => {
      const f = inp.dataset.f;
      const v = inp.type === 'checkbox' ? inp.checked : inp.value;
      if (inp.dataset.item !== undefined) {
        const it = draft.menu[+inp.dataset.sec].items[+inp.dataset.item];
        it[f] = f === 'price' ? Number(v) : v;
      } else if (inp.dataset.sec !== undefined) {
        draft.menu[+inp.dataset.sec].section = v;
      } else if (f === 'tags') {
        draft.tags = v.split(/[،,]/).map((t) => t.trim()).filter(Boolean);
      } else if (f === 'timeMin' || f === 'timeMax') {
        draft.time[f === 'timeMin' ? 0 : 1] = Number(v);
      } else if (f === 'minOrder') {
        draft[f] = Number(v);
      } else {
        draft[f] = v;
      }
    });
  }

  const canUpload = uploadsEnabled();

  const itemRow = (it, si, ii) => `
    <div class="edit-item ${it.available === false ? 'off' : ''}">
      <label class="item-photo ${canUpload ? '' : 'disabled'}" title="${canUpload ? 'صورة الصنف' : 'رفع الصور مش متظبط'}">
        ${itemImage(it, 52)}
        ${canUpload ? `<input type="file" accept="image/*" data-item-photo="${si}:${ii}" hidden>` : ''}
        <span class="photo-badge">📷</span>
      </label>
      <div class="grow edit-item-fields">
        <input data-f="name" data-sec="${si}" data-item="${ii}" value="${esc(it.name)}" placeholder="اسم الصنف" required>
        <input data-f="desc" data-sec="${si}" data-item="${ii}" value="${esc(it.desc)}" placeholder="الوصف">
      </div>
      <input class="emoji-in" data-f="emoji" data-sec="${si}" data-item="${ii}" value="${esc(it.emoji || '🍽️')}" aria-label="أيقونة لو مفيش صورة" title="أيقونة لو مفيش صورة">
      <input class="price-in" type="number" min="1" step="any" data-f="price" data-sec="${si}" data-item="${ii}" value="${it.price ?? ''}" placeholder="السعر" required aria-label="السعر">
      <label class="check"><input type="checkbox" data-f="available" data-sec="${si}" data-item="${ii}" ${it.available !== false ? 'checked' : ''}> متاح</label>
      ${it.image ? `<button type="button" class="icon-btn" data-del-photo="${si}:${ii}" title="شيل الصورة" aria-label="شيل الصورة">🖼️✕</button>` : ''}
      <button type="button" class="btn small danger-outline" data-del-item="${si}:${ii}" aria-label="حذف الصنف">🗑️ حذف</button>
    </div>`;

  function draw() {
    if (picker) picker.destroy();
    picker = null;
    el.innerHTML = `
      <form class="editor" id="editorForm" novalidate>
        <section class="panel">
          <h3>بيانات المطعم</h3>
          <div class="logo-edit">
            <div class="logo-preview" style="background:${esc(draft.color || '#eee')}">${restaurantLogo(draft, 96)}</div>
            <div>
              ${canUpload ? `
                <label class="btn small">📷 ${draft.logo ? 'غيّر اللوجو' : 'ارفع لوجو المطعم'}<input type="file" accept="image/*" id="logoInput" hidden></label>
                ${draft.logo ? '<button type="button" class="link danger" id="delLogo">شيل اللوجو</button>' : ''}`
              : '<p class="muted small">رفع الصور مش متظبط لسه (Cloudinary). لحد ما يتظبط بيظهر الإيموجي.</p>'}
              <p class="muted small">صورة مربعة واضحة، وهتتصغّر لوحدها.</p>
            </div>
          </div>
          <div class="form-grid">
            <label>اسم المطعم<input data-f="name" value="${esc(draft.name)}" required></label>
            <label>التصنيف
              <select data-f="category">
                ${CATEGORIES.filter((c) => c.id !== 'all').map((c) =>
                  `<option value="${c.id}" ${draft.category === c.id ? 'selected' : ''}>${c.icon} ${c.name}</option>`).join('')}
              </select>
            </label>
            <label>أيقونة (لو مفيش لوجو)<input data-f="emoji" value="${esc(draft.emoji)}"></label>
            <label>لون الخلفية<input type="color" data-f="color" value="${esc(draft.color || '#ffe3d1')}"></label>
            <label>الكلمات المميزة (افصل بفاصلة)<input data-f="tags" value="${esc(draft.tags.join('، '))}" placeholder="برجر، وجبات سريعة"></label>
            ${showOpenToggle ? `<label>عرض (اختياري)<input data-f="promo" value="${esc(draft.promo)}" placeholder="خصم 20% على أول طلب"></label>` : ''}
            <label>وقت التحضير والتوصيل من (دقيقة)<input type="number" min="1" data-f="timeMin" value="${draft.time[0]}" required></label>
            <label>إلى (دقيقة)<input type="number" min="1" data-f="timeMax" value="${draft.time[1]}" required></label>
            <label>الحد الأدنى للطلب (ج.م)<input type="number" min="0" step="any" data-f="minOrder" value="${draft.minOrder ?? 0}" required></label>
            <label>تليفون المطعم<input data-f="phone" type="tel" value="${esc(draft.phone)}" inputmode="numeric" dir="ltr"></label>
          </div>
          <label>عنوان المطعم (المندوب هيستلم منه)<input data-f="address" value="${esc(draft.address)}" placeholder="المنطقة، الشارع، علامة مميزة" required></label>
          <p class="muted small">📍 مكان المطعم على الخريطة (عشان المندوب يوصله):</p>
          <div class="map-box small-map" id="restMap"><span class="muted small">جاري تحميل الخريطة...</span></div>

          ${showOpenToggle ? `<label class="check"><input type="checkbox" data-f="isOpen" ${draft.isOpen !== false ? 'checked' : ''}> المطعم مفتوح ويستقبل طلبات</label>` : ''}
        </section>

        ${draft.menu.map((sec, si) => `
          <section class="panel">
            <div class="edit-sec-head">
              <input class="sec-in" data-f="section" data-sec="${si}" value="${esc(sec.section)}" placeholder="اسم القسم" required aria-label="اسم القسم">
              <button type="button" class="link danger" data-del-sec="${si}">حذف القسم</button>
            </div>
            ${sec.items.map((it, ii) => itemRow(it, si, ii)).join('') || '<p class="muted small">مفيش أصناف في القسم ده لسه.</p>'}
            <button type="button" class="btn small" data-add-item="${si}">+ صنف جديد</button>
          </section>`).join('')}

        <button type="button" class="btn block" id="addSec">+ قسم جديد في المنيو</button>
        <p class="form-error" id="editorError" hidden></p>
        <div class="editor-actions">
          <button class="btn primary" type="submit">${saveLabel}</button>
          ${onCancel ? '<button class="btn" type="button" id="cancelEdit">إلغاء</button>' : ''}
        </div>
      </form>`;

    locationPicker(el.querySelector('#restMap'), draft.location, (ll) => { draft.location = ll; }, {
      hint: (ll) => (JSON.stringify(ll) === savedLoc ? '💾 ده المكان المحفوظ' : `⚠️ متنساش تدوس «${saveLabel}» تحت عشان يتحفظ`),
    }).then((p) => { picker = p; }).catch(() => {
      el.querySelector('#restMap')?.replaceChildren('تعذر تحميل الخريطة');
    });

    const redraw = (change) => () => {
      sync();
      change();
      draw();
    };
    // رفع صورة: نعرض "جاري الرفع" ونعيد الرسم بعد ما تخلص
    const upload = async (input, apply) => {
      const file = input.files[0];
      if (!file) return;
      sync();
      toast('جاري رفع الصورة... ⏳');
      try {
        apply(await uploadImage(file));
        toast('تم رفع الصورة ✅ (متنساش تحفظ)');
        draw();
      } catch (err) {
        toast(err.message);
      }
    };

    el.querySelector('#logoInput')?.addEventListener('change', (e) => upload(e.target, (url) => { draft.logo = url; }));
    el.querySelector('#delLogo')?.addEventListener('click', redraw(() => { draft.logo = ''; }));
    el.querySelectorAll('[data-item-photo]').forEach((inp) => inp.addEventListener('change', () => {
      const [si, ii] = inp.dataset.itemPhoto.split(':').map(Number);
      upload(inp, (url) => { draft.menu[si].items[ii].image = url; });
    }));
    el.querySelectorAll('[data-del-photo]').forEach((b) => b.addEventListener('click', redraw(() => {
      const [si, ii] = b.dataset.delPhoto.split(':').map(Number);
      delete draft.menu[si].items[ii].image;
    })));
    el.querySelector('#addSec').addEventListener('click', redraw(() => draft.menu.push({ section: 'قسم جديد', items: [] })));
    el.querySelectorAll('[data-add-item]').forEach((b) => b.addEventListener('click', redraw(() =>
      draft.menu[+b.dataset.addItem].items.push({ id: newItemId(), name: '', desc: '', price: '', emoji: '🍽️', available: true }))));
    el.querySelectorAll('[data-del-item]').forEach((b) => b.addEventListener('click', () => {
      sync();
      const [si, ii] = b.dataset.delItem.split(':').map(Number);
      const it = draft.menu[si].items[ii];
      if (it.name && !confirm(`حذف "${it.name}" من المنيو؟ (هيتحذف نهائي لما تدوس حفظ)`)) return;
      redraw(() => draft.menu[si].items.splice(ii, 1))();
    }));
    el.querySelectorAll('[data-del-sec]').forEach((b) => b.addEventListener('click', () => {
      const sec = draft.menu[+b.dataset.delSec];
      if (sec.items.length && !confirm(`حذف قسم "${sec.section}" بكل أصنافه؟`)) return;
      redraw(() => draft.menu.splice(+b.dataset.delSec, 1))();
    }));
    if (onCancel) el.querySelector('#cancelEdit').addEventListener('click', onCancel);

    const form = el.querySelector('#editorForm');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      sync();
      const errEl = el.querySelector('#editorError');
      if (!form.checkValidity()) {
        errEl.textContent = 'كمّل البيانات الناقصة: اسم المطعم وعنوانه، واسم وسعر كل صنف.';
        errEl.hidden = false;
        form.reportValidity();
        return;
      }
      errEl.hidden = true;
      const btn = form.querySelector('button[type=submit]');
      btn.disabled = true;
      try {
        if (showOpenToggle) draft.isOpen = Boolean(draft.isOpen);
        draft.menu.forEach((s) => s.items.forEach((it) => { it.available = Boolean(it.available); }));
        if (await onSave(JSON.parse(JSON.stringify(draft))) !== false) {
          savedLoc = JSON.stringify(draft.location || null);
          picker?.refresh();
        }
      } finally {
        btn.disabled = false;
      }
    });
  }

  draw();
}
