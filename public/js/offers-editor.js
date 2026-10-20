// تبويب "العروض" في لوحة المطعم: عرض عام على المطعم + خصم على أي صنف
import { esc, fmt, toast, itemImage } from './ui.js';
import { activeOffer, untilLabel } from './offers.js';

// onSave(changes) بيحفظ {promo} أو {menu}
export function renderOffersEditor(el, restaurant, { onSave }) {
  const menu = JSON.parse(JSON.stringify(restaurant.menu || []));
  const items = menu.flatMap((sec) => sec.items.map((it) => ({ it, sec: sec.section })));
  const running = items.filter((x) => activeOffer(x.it));
  const today = new Date().toISOString().slice(0, 10);

  const row = ({ it, sec }) => {
    const o = it.offer || {};
    const live = activeOffer(it);
    const expired = o.value && !live;
    return `
      <div class="offer-row ${live ? 'on' : ''}" data-id="${esc(it.id)}">
        <div class="offer-item">
          <div class="item-img sm">${itemImage(it, 52)}</div>
          <div class="grow">
            <b>${esc(it.name || 'صنف من غير اسم')}</b>
            <div class="muted small">${esc(sec)} • السعر الأصلي ${fmt(it.price)}</div>
            ${live ? `<div class="small ok-text">✅ عليه خصم دلوقتي: ${fmt(live.price)} بدل ${fmt(it.price)} (-${live.pct}%) ${live.until ? `• ${untilLabel(live.until)}` : ''}</div>`
              : expired ? '<div class="small warn-text">⏰ الخصم ده خلص أو مش مظبوط</div>' : ''}
          </div>
        </div>
        <div class="offer-controls">
          <select data-k="type" aria-label="نوع الخصم">
            <option value="percent" ${o.type !== 'price' ? 'selected' : ''}>خصم %</option>
            <option value="price" ${o.type === 'price' ? 'selected' : ''}>سعر جديد</option>
          </select>
          <input data-k="value" type="number" min="1" step="any" inputmode="decimal" value="${o.value ?? ''}" placeholder="${o.type === 'price' ? 'السعر بعد الخصم' : 'مثلًا 20'}" aria-label="قيمة الخصم">
          <label class="until">لحد يوم (اختياري)<input data-k="until" type="date" min="${today}" value="${esc(o.until || '')}"></label>
          <span class="offer-preview muted small"></span>
          <button type="button" class="btn small primary" data-apply>${live ? 'تحديث' : 'طبّق الخصم'}</button>
          ${o.value ? '<button type="button" class="btn small danger-outline" data-remove>شيل الخصم</button>' : ''}
        </div>
      </div>`;
  };

  el.innerHTML = `
    <section class="panel">
      <h3>🏷️ عرض عام على المطعم</h3>
      <p class="muted small">جملة قصيرة بتظهر على كارت المطعم وفي صفحة "عروض وخصومات". مثال: "توصيل مجاني فوق 200 ج" أو "اطلب 2 والتالت هدية".</p>
      <form class="promo-form" id="promoForm">
        <input id="promoText" maxlength="60" value="${esc(restaurant.promo || '')}" placeholder="اكتب العرض هنا">
        <button class="btn primary" type="submit">حفظ</button>
        ${restaurant.promo ? '<button class="btn" type="button" id="clearPromo">شيل العرض</button>' : ''}
      </form>
    </section>

    <section class="panel">
      <h3>💸 خصومات على الأصناف ${running.length ? `<span class="badge static">${running.length} شغال</span>` : ''}</h3>
      <p class="muted small">اختار الصنف، وحط نسبة الخصم أو السعر الجديد، ولو عايز الخصم يخلص لوحده حدد آخر يوم. الصنف هيظهر للعملاء بالسعر القديم مشطوب جنب السعر الجديد، وفي قسم "عروض وخصومات" في الرئيسية.</p>
      <input type="search" id="offerSearch" class="offer-search" placeholder="🔍 دوّر على صنف..." autocomplete="off">
      <div id="offerList">
        ${items.length ? [...running, ...items.filter((x) => !activeOffer(x.it))].map(row).join('')
          : '<p class="muted">مفيش أصناف لسه. ضيف أصنافك الأول من "🍽️ المنيو والإعدادات".</p>'}
      </div>
    </section>`;

  const findItem = (id) => items.find((x) => x.it.id === id).it;

  // معاينة السعر بعد الخصم وإنت بتكتب
  const preview = (rowEl) => {
    const it = findItem(rowEl.dataset.id);
    const draft = { ...it, offer: readOffer(rowEl) };
    const live = activeOffer(draft);
    const v = rowEl.querySelector('[data-k=value]').value;
    rowEl.querySelector('.offer-preview').textContent = !v ? ''
      : live ? `هيبقى ${fmt(live.price)} بدل ${fmt(it.price)}` : '⚠️ الخصم لازم يقلل السعر';
    rowEl.querySelector('[data-k=value]').placeholder = rowEl.querySelector('[data-k=type]').value === 'price' ? 'السعر بعد الخصم' : 'مثلًا 20';
  };
  const readOffer = (rowEl) => ({
    type: rowEl.querySelector('[data-k=type]').value,
    value: Number(rowEl.querySelector('[data-k=value]').value),
    until: rowEl.querySelector('[data-k=until]').value || null,
  });

  const save = async (changes, msg) => {
    try {
      await onSave(changes);
      toast(msg);
    } catch (err) {
      toast(err.message || 'حصلت مشكلة، جرّب تاني');
    }
  };

  el.querySelectorAll('.offer-row').forEach((rowEl) => {
    rowEl.querySelectorAll('[data-k]').forEach((inp) => inp.addEventListener('input', () => preview(rowEl)));
    rowEl.querySelector('[data-apply]').addEventListener('click', async (e) => {
      const it = findItem(rowEl.dataset.id);
      const offer = readOffer(rowEl);
      if (!activeOffer({ ...it, offer })) {
        toast(offer.type === 'percent' ? 'اكتب نسبة خصم من 1 لـ 95' : 'السعر الجديد لازم يكون أقل من السعر الأصلي');
        return;
      }
      e.target.disabled = true;
      it.offer = offer;
      await save({ menu }, 'تم تطبيق الخصم ✅');
      e.target.disabled = false;
    });
    rowEl.querySelector('[data-remove]')?.addEventListener('click', async (e) => {
      e.target.disabled = true;
      delete findItem(rowEl.dataset.id).offer;
      await save({ menu }, 'تم شيل الخصم');
    });
  });

  el.querySelector('#offerSearch').addEventListener('input', (e) => {
    const q = e.target.value.trim();
    el.querySelectorAll('.offer-row').forEach((rowEl) => {
      rowEl.hidden = q && !findItem(rowEl.dataset.id).name.includes(q);
    });
  });

  el.querySelector('#promoForm').addEventListener('submit', (e) => {
    e.preventDefault();
    save({ promo: el.querySelector('#promoText').value.trim() || null }, 'تم حفظ العرض ✅');
  });
  el.querySelector('#clearPromo')?.addEventListener('click', () => save({ promo: null }, 'تم شيل العرض'));
}
