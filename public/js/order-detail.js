// صفحة الطلب الكاملة للأدمن وخدمة العملاء: مين طلب، ومين المطعم، ومين المندوب (وكل مندوب أخده ورجّعه)،
// وكل خطوة مين عملها وإمتى، والفلوس، والناقص، والتقييم، والشكاوي المرتبطة
import { ORDER_STATUSES } from './data.js';
import { esc, fmt, shortId, statusBadge, paymentLabel, lineOptions, mapLink } from './ui.js';
import { orderSplit, paidTotal, missingItems, missingRefund } from './finance.js';
import { whenLabel, isScheduled } from './schedule.js';
import { ROLE_NAMES, TICKET_TOPICS, ticketStatus } from './support.js';
import { stars } from './ratings.js';

const time = (ms) => (ms ? new Date(ms).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' }) : '—');
const who = (name, username) => `${esc(name || '—')}${username ? ` <span class="uname">@${esc(username)}</span>` : ''}`;
const tel = (p) => (p ? `<a href="tel:${esc(p)}" dir="ltr">📞 ${esc(p)}</a>` : '');
const row = (label, value) => (value ? `<div class="od-row"><span>${label}</span><b>${value}</b></div>` : '');

// الكلام اللي بيدوّر فيه البحث: رقم الطلب والعميل والمطعم وكل مندوب لمسه
export function orderSearchText(o) {
  return [
    shortId(o.id), o.id, o.customerName, o.customerUsername, o.customerPhone, o.restaurantName, o.restaurantPhone,
    o.driverName, o.driverUsername, o.driverPhone, o.zoneName, o.address,
    ...(o.driverLog || []).flatMap((d) => [d.name, d.username, d.phone]),
  ].filter(Boolean).join(' ');
}

// review: تقييم العميل (لو موجود)، tickets: الشكاوي اللي على الطلب ده
export function orderDetail(o, { tickets = [], review = null, statusControl = '' } = {}) {
  const s = orderSplit(o);
  const t = o.totals;
  const log = o.driverLog || [];
  const history = o.statusHistory || [];
  const missing = missingItems(o);
  return `
    <section class="panel od-head">
      <div class="list-head">
        <h2>طلب #${shortId(o.id)}</h2>
        ${statusControl || statusBadge(o.status)}
      </div>
      <p class="muted small">اتطلب ${time(o.createdAt)} • الرقم الكامل <span dir="ltr" class="od-id">${esc(o.id)}</span></p>
      ${isScheduled(o) ? `<p class="sched-tag">⏰ طلب مجدول: ${whenLabel(o.scheduledFor)}</p>` : ''}
    </section>

    <div class="od-grid">
      <section class="panel">
        <h3>👤 العميل</h3>
        ${row('الاسم', who(o.customerName, o.customerUsername))}
        ${row('الموبايل', tel(o.customerPhone))}
        ${row('المنطقة', esc(o.zoneName || ''))}
        ${row('العنوان', esc(o.address || ''))}
        ${o.location ? row('الخريطة', `<a href="${mapLink(o.location)}" target="_blank" rel="noopener">📍 افتح المكان</a>`) : ''}
        ${row('ملاحظات', esc(o.notes || ''))}
      </section>

      <section class="panel">
        <h3>🏪 المطعم</h3>
        ${row('المطعم', `${esc(o.restaurantEmoji || '')} ${esc(o.restaurantName)}`)}
        ${row('التليفون', tel(o.restaurantPhone))}
        ${row('العنوان', esc(o.restaurantAddress || ''))}
      </section>

      <section class="panel">
        <h3>🛵 المندوب</h3>
        ${o.driverUid ? `${row(o.status === 'delivered' ? 'وصّله' : 'معاه دلوقتي', who(o.driverName, o.driverUsername))}${row('الموبايل', tel(o.driverPhone))}`
          : `<p class="muted small">${o.status === 'delivered' ? 'مفيش مندوب متسجل' : 'لسه محدش أخده'}</p>`}
        ${log.length ? `
          <h4>سجل المندوبين</h4>
          <ol class="od-log">${log.map((d) => `
            <li class="${d.action}"><b>${d.action === 'claimed' ? '✋ أخده' : '↩️ رجّعه'}</b> ${who(d.name, d.username)} ${tel(d.phone)}
              <span class="muted small">${time(d.at)}</span></li>`).join('')}</ol>` : ''}
      </section>
    </div>

    <section class="panel">
      <h3>🕒 خطوات الطلب</h3>
      <ol class="od-timeline">${history.map((h) => `
        <li><b>${ORDER_STATUSES[h.status]?.icon || ''} ${ORDER_STATUSES[h.status]?.label || esc(h.status)}</b>
          <span class="muted small">${time(h.at)}</span>
          ${h.by?.uid ? `<span class="small">— ${esc(h.by.name || '')} ${h.by.role ? `(${esc(ROLE_NAMES[h.by.role] || h.by.role)})` : ''}</span>` : ''}</li>`).join('')}</ol>
    </section>

    <div class="od-grid">
      <section class="panel">
        <h3>🍽️ الأصناف</h3>
        ${o.lines.map((l, i) => `<div class="mini-line"><span>${l.qty}× ${esc(l.name)}${lineOptions(l)}
          ${missing.some((m) => m.i === i) ? '<span class="warn-text small">⚠️ ناقص</span>' : ''}</span><span>${fmt(l.price * l.qty)}</span></div>`).join('')}
      </section>

      <section class="panel">
        <h3>💰 الحساب</h3>
        ${row('تمن الأكل', fmt(t.subtotal))}
        ${row('التوصيل', fmt(t.delivery))}
        ${t.service ? row('رسوم الخدمة', fmt(t.service)) : ''}
        ${t.discount ? row(`الخصم ${(o.promos || []).length ? `(<span dir="ltr">${(o.promos || []).map(esc).join(' + ')}</span>)` : ''}`, `− ${fmt(t.discount)}`) : ''}
        ${row('الإجمالي', fmt(t.total))}
        ${o.missing ? row(`ناقص: ${missing.map((m) => `${m.qty}× ${esc(m.name)}`).join('، ')}`,
          o.missingDecision === 'confirmed' ? `اتخصم ${fmt(missingRefund(o))}` : o.missingDecision === 'disputed' ? 'المندوب اعترض' : 'مستني المندوب') : ''}
        ${row('العميل دفع', `${fmt(paidTotal(o))} — ${esc(paymentLabel(o.payment))}`)}
        <hr>
        ${row('حق المطعم', fmt(s.restaurant))}
        ${row('حق المندوب', fmt(s.driver))}
        ${row('ربح المنصة', fmt(s.platform))}
        ${s.restaurantDue < 0 ? row('المطعم عليه يرجّع', fmt(-s.restaurantDue)) : ''}
      </section>
    </div>

    ${review ? `<section class="panel"><h3>⭐ تقييم العميل</h3>
      <p><span class="stars">${stars(review.food)}</span> الأكل${review.delivery ? ` • <span class="stars">${stars(review.delivery)}</span> التوصيل` : ''}</p>
      ${review.comment ? `<p>${esc(review.comment)}</p>` : ''}</section>` : ''}

    <section class="panel">
      <h3>🎧 الشكاوي على الطلب ده (${tickets.length})</h3>
      ${tickets.length ? tickets.map((x) => `
        <button class="ticket-row panel" type="button" data-open-ticket="${esc(x.id)}">
          <div class="grow"><b>${TICKET_TOPICS[x.topic] || ''} ${esc(x.subject)}</b>
            <div class="small">${who(x.name, x.username)} • ${ROLE_NAMES[x.role] || ''}</div></div>
          ${ticketStatus(x)}
        </button>`).join('') : '<p class="muted small">مفيش شكاوي.</p>'}
    </section>`;
}
