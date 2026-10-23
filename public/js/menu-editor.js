// محرر بيانات المطعم والمنيو: بيستخدمه صاحب المطعم والأدمن
import { CATEGORIES } from './data.js';
import { esc, toast, restaurantLogo, itemImage } from './ui.js';
import { uploadImage, uploadsEnabled } from './upload.js';
import { locationPicker } from './map.js';
import { newOptId, priceGroup, basePrice, setsPrice } from './options.js';

const newItemId = () => 'i' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

const EDITABLE = ['name', 'emoji', 'color', 'logo', 'category', 'tags', 'time', 'minOrder', 'promo',
  'address', 'phone', 'location', 'isOpen', 'menu', 'zones'];

// showOpenToggle: false في لوحة المطعم لأن الفتح والقفل ليه زرار لوحده فوق
// zones: دالة بترجع مناطق التوصيل المتاحة (عشان المطعم يختار بيوصّل لأنهي منها)
export function renderMenuEditor(el, restaurant, { onSave, onCancel, saveLabel = 'حفظ التعديلات', showOpenToggle = true, zones = () => [] }) {
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
  if (!Array.isArray(draft.zones)) draft.zones = null; // null = بيوصّل لكل المناطق
  let picker = null;
  let savedLoc = JSON.stringify(restaurant.location || null); // عشان نقول لصاحب المطعم المكان اتحفظ ولا لأ
  const openOpts = new Set(); // الأصناف اللي فاتح محرر اختياراتها ("si:ii")

  // المطعم بيوصّل لأنهي مناطق (العميل في منطقة تانية مش هيقدر يطلب منه)
  function zoneField() {
    const list = zones();
    if (!list.length) return '';
    const allOn = !draft.zones;
    return `
      <fieldset class="zone-pick">
        <legend>🛵 بتوصّل لأنهي مناطق؟</legend>
        <label class="check"><input type="checkbox" data-zall ${allOn ? 'checked' : ''}> كل المناطق (وأي منطقة جديدة تتضاف)</label>
        <div class="chips zone-chips" ${allOn ? 'hidden' : ''}>
          ${list.map((z) => `<label class="chip check-chip"><input type="checkbox" data-rzone="${esc(z.id)}" ${allOn || draft.zones.includes(z.id) ? 'checked' : ''}> ${esc(z.name)}</label>`).join('')}
        </div>
        <p class="muted small">العملاء في المناطق اللي مش متعلّم عليها هيشوفوا المطعم بس مش هيقدروا يطلبوا منه.</p>
      </fieldset>`;
  }

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
    // مناطق التوصيل
    const all = el.querySelector('[data-zall]');
    if (all) draft.zones = all.checked ? null : [...el.querySelectorAll('[data-rzone]:checked')].map((x) => x.dataset.rzone);
    // الاختيارات والإضافات: data-k = "si:ii:gi" أو "si:ii:gi:ci"
    el.querySelectorAll('[data-o]').forEach((inp) => {
      const [si, ii, gi, ci] = inp.dataset.k.split(':').map(Number);
      const g = draft.menu[si].items[ii].options[gi];
      const c = ci !== undefined && !Number.isNaN(ci) ? g.choices[ci] : null;
      const v = inp.type === 'checkbox' ? inp.checked : inp.value;
      ({
        gname: () => { g.name = v.trim(); }, greq: () => { g.required = v; }, gmulti: () => { g.multi = v; }, gsets: () => { g.sets = v; },
        gmax: () => { g.max = Math.max(0, Math.floor(Number(v) || 0)); },
        cname: () => { c.name = v.trim(); }, cprice: () => { c.price = Math.max(0, Number(v) || 0); },
        cavail: () => { c.available = v; },
      })[inp.dataset.o]();
    });
  }

  // قوالب جاهزة عشان صاحب المطعم يبدأ بسرعة
  const OPT_TEMPLATES = {
    // الحجم: سعر كل حجم هو سعر الصنف نفسه (مش زيادة)
    size: (it) => ({ name: 'الحجم', required: true, multi: false, sets: true, choices: ['صغير', 'وسط', 'كبير'].map((n, i) => ({ id: newOptId('c'), name: n, price: (Number(it.price) || 0) + i * 15, available: true })) }),
    extras: () => ({ name: 'إضافات', required: false, multi: true, max: 0, choices: [{ id: newOptId('c'), name: 'جبنة زيادة', price: 10, available: true }] }),
    blank: () => ({ name: '', required: false, multi: false, choices: [{ id: newOptId('c'), name: '', price: 0, available: true }] }),
  };

  const optEditor = (it, si, ii) => `
    <div class="opt-editor">
      ${(it.options || []).map((g, gi) => {
        const k = `${si}:${ii}:${gi}`;
        const sets = g === priceGroup(it);
        return `
        <div class="opt-group-edit">
          <div class="opt-g-row">
            <input data-o="gname" data-k="${k}" value="${esc(g.name)}" placeholder="اسم المجموعة (مثلًا الحجم)" aria-label="اسم المجموعة">
            <label class="check"><input type="checkbox" data-o="greq" data-k="${k}" ${g.required ? 'checked' : ''}> إجباري</label>
            <label class="check"><input type="checkbox" data-o="gmulti" data-k="${k}" data-redraw ${g.multi ? 'checked' : ''}> أكتر من اختيار</label>
            ${g.multi ? '' : `<label class="check" title="سعر الاختيار هو سعر الصنف (زي ربع / نص / كيلو)"><input type="checkbox" data-o="gsets" data-k="${k}" data-redraw ${setsPrice(g) ? 'checked' : ''}> السعر نفسه (مش زيادة)</label>`}
            ${g.multi ? `<label class="check">لحد <input class="mini-in" dir="ltr" type="number" min="0" data-o="gmax" data-k="${k}" value="${g.max || 0}" aria-label="أقصى عدد"> <small class="muted">(0 = مفتوح)</small></label>` : ''}
            <button type="button" class="icon-btn danger" data-del-g="${k}" aria-label="حذف المجموعة">🗑️</button>
          </div>
          ${(g.choices || []).map((c, ci) => `
            <div class="opt-c-row">
              <input data-o="cname" data-k="${k}:${ci}" value="${esc(c.name)}" placeholder="الاختيار (مثلًا كبير)" aria-label="اسم الاختيار">
              <label class="check">${sets ? '' : '+ '}<input class="mini-in" dir="ltr" type="number" min="${sets ? 1 : 0}" step="any" data-o="cprice" data-k="${k}:${ci}" ${sets ? 'data-redraw required' : ''} value="${c.price ?? 0}" aria-label="${sets ? 'السعر' : 'زيادة السعر'}"> ج.م</label>
              <label class="check"><input type="checkbox" data-o="cavail" data-k="${k}:${ci}" ${c.available !== false ? 'checked' : ''}> متاح</label>
              <button type="button" class="icon-btn danger" data-del-c="${k}:${ci}" aria-label="حذف الاختيار">✕</button>
            </div>`).join('')}
          <button type="button" class="link" data-add-c="${k}">+ اختيار</button>
        </div>`;
      }).join('')}
      <div class="row-actions">
        <button type="button" class="btn small" data-add-g="${si}:${ii}:size">+ الحجم (صغير/وسط/كبير)</button>
        <button type="button" class="btn small" data-add-g="${si}:${ii}:extras">+ إضافات</button>
        <button type="button" class="btn small" data-add-g="${si}:${ii}:blank">+ مجموعة فاضية</button>
      </div>
      <p class="muted small">الرقم جنب كل اختيار بيتزود على سعر الصنف. لو علّمت "السعر نفسه" (زي ربع / نص / كيلو): اكتب سعر كل حجم كامل، وهو اللي هيتحسب بدل سعر الصنف. "إجباري" يعني العميل لازم يختار.</p>
    </div>`;

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
      ${priceGroup(it) ? `<span class="price-in muted small" title="السعر من الاختيارات">من ${basePrice(it)}</span>`
        : `<input class="price-in" type="number" min="1" step="any" data-f="price" data-sec="${si}" data-item="${ii}" value="${it.price ?? ''}" placeholder="السعر" required aria-label="السعر">`}
      <label class="check"><input type="checkbox" data-f="available" data-sec="${si}" data-item="${ii}" ${it.available !== false ? 'checked' : ''}> متاح</label>
      ${it.image ? `<button type="button" class="icon-btn" data-del-photo="${si}:${ii}" title="شيل الصورة" aria-label="شيل الصورة">🖼️✕</button>` : ''}
      <button type="button" class="btn small" data-toggle-opt="${si}:${ii}" aria-expanded="${openOpts.has(`${si}:${ii}`)}">🧩 الاختيارات${(it.options || []).length ? ` (${it.options.length})` : ''}</button>
      <button type="button" class="btn small danger-outline" data-del-item="${si}:${ii}" aria-label="حذف الصنف">🗑️ حذف</button>
      ${openOpts.has(`${si}:${ii}`) ? optEditor(it, si, ii) : ''}
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

          ${zoneField()}
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
    el.querySelector('[data-zall]')?.addEventListener('change', (e) => {
      el.querySelector('.zone-chips').hidden = e.target.checked;
    });
    el.querySelectorAll('[data-add-item]').forEach((b) => b.addEventListener('click', redraw(() =>
      draft.menu[+b.dataset.addItem].items.push({ id: newItemId(), name: '', desc: '', price: '', emoji: '🍽️', available: true }))));
    el.querySelectorAll('[data-del-item]').forEach((b) => b.addEventListener('click', () => {
      sync();
      const [si, ii] = b.dataset.delItem.split(':').map(Number);
      const it = draft.menu[si].items[ii];
      if (it.name && !confirm(`حذف "${it.name}" من المنيو؟ (هيتحذف نهائي لما تدوس حفظ)`)) return;
      redraw(() => { draft.menu[si].items.splice(ii, 1); openOpts.clear(); })();
    }));
    const itemAt = (k) => { const [si, ii] = k.split(':').map(Number); return draft.menu[si].items[ii]; };
    el.querySelectorAll('[data-toggle-opt]').forEach((b) => b.addEventListener('click', redraw(() => {
      const k = b.dataset.toggleOpt;
      if (openOpts.has(k)) openOpts.delete(k); else openOpts.add(k);
    })));
    el.querySelectorAll('[data-add-g]').forEach((b) => b.addEventListener('click', redraw(() => {
      const [si, ii, tpl] = b.dataset.addG.split(':');
      const it = itemAt(`${si}:${ii}`);
      (it.options ||= []).push({ id: newOptId('g'), ...OPT_TEMPLATES[tpl](it) });
    })));
    el.querySelectorAll('[data-del-g]').forEach((b) => b.addEventListener('click', redraw(() => {
      const [si, ii, gi] = b.dataset.delG.split(':').map(Number);
      draft.menu[si].items[ii].options.splice(gi, 1);
    })));
    el.querySelectorAll('[data-add-c]').forEach((b) => b.addEventListener('click', redraw(() => {
      const [si, ii, gi] = b.dataset.addC.split(':').map(Number);
      draft.menu[si].items[ii].options[gi].choices.push({ id: newOptId('c'), name: '', price: 0, available: true });
    })));
    el.querySelectorAll('[data-del-c]').forEach((b) => b.addEventListener('click', redraw(() => {
      const [si, ii, gi, ci] = b.dataset.delC.split(':').map(Number);
      draft.menu[si].items[ii].options[gi].choices.splice(ci, 1);
    })));
    el.querySelectorAll('[data-o][data-redraw]').forEach((inp) => inp.addEventListener('change', redraw(() => {})));
    el.querySelectorAll('[data-del-sec]').forEach((b) => b.addEventListener('click', () => {
      const sec = draft.menu[+b.dataset.delSec];
      if (sec.items.length && !confirm(`حذف قسم "${sec.section}" بكل أصنافه؟`)) return;
      redraw(() => { draft.menu.splice(+b.dataset.delSec, 1); openOpts.clear(); })();
    }));
    if (onCancel) el.querySelector('#cancelEdit').addEventListener('click', onCancel);

    const form = el.querySelector('#editorForm');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      sync();
      const errEl = el.querySelector('#editorError');
      // مجموعات الاختيارات: شيل الفاضية، ولازم يبقى فيها اختيار واحد على الأقل
      let dropped = 0;
      draft.menu.forEach((sec) => sec.items.forEach((it) => {
        if (!it.options) return;
        it.options.forEach((g) => { const n = (g.choices || []).length; g.choices = (g.choices || []).filter((c) => c.name); dropped += n - g.choices.length; });
        const n = it.options.length;
        it.options = it.options.filter((g) => g.name && g.choices.length);
        dropped += n - it.options.length;
        if (!it.options.length) delete it.options;
        // الصنف اللي سعره من الأحجام: سعره = أرخص حجم (للترتيب والبحث)
        if (priceGroup(it)) it.price = basePrice(it);
      }));
      if (dropped) toast(`اتشال ${dropped} اختيار/مجموعة من غير اسم`);
      if (!form.checkValidity()) {
        errEl.textContent = 'كمّل البيانات الناقصة: اسم المطعم وعنوانه، واسم وسعر كل صنف، واسم كل مجموعة اختيارات وكل اختيار.';
        errEl.hidden = false;
        form.reportValidity();
        return;
      }
      if (Array.isArray(draft.zones) && !draft.zones.length) {
        errEl.textContent = 'اختار منطقة توصيل واحدة على الأقل، أو علّم على "كل المناطق".';
        errEl.hidden = false;
        el.querySelector('[data-zall]')?.scrollIntoView({ block: 'center' });
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
