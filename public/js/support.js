// خدمة العملاء: شكاوي واستفسارات بين المستخدم (عميل، مطعم، مندوب) والإدارة
import { esc, toast, errorMessage, loader, shortId, timeAgo } from './ui.js';

export const TICKET_TOPICS = {
  order: '📦 مشكلة في طلب',
  payment: '💰 فلوس وحسابات',
  account: '👤 الحساب',
  suggestion: '💡 اقتراح',
  other: '💬 حاجة تانية',
};

export const ROLE_NAMES = { customer: 'عميل', restaurant: 'مطعم', driver: 'مندوب', admin: 'أدمن' };

// رسايل المحادثة
// showStaff: في لوحة الإدارة بنعرض اسم الموظف اللي رد
export function thread(t, myId, showStaff = false) {
  return t.messages.map((m) => {
    const mine = m.by === myId;
    return `
      <div class="msg ${mine ? 'mine' : ''} ${m.by === 'admin' ? 'admin' : ''}">
        <div class="msg-head">${m.by === 'admin' ? `🎧 خدمة العملاء${showStaff && m.name ? ` (${esc(m.name)})` : ''}` : esc(m.name)} • <span>${timeAgo(m.at)}</span></div>
        <div class="msg-body">${esc(m.text).replace(/\n/g, '<br>')}</div>
      </div>`;
  }).join('');
}

export const ticketStatus = (t) => (t.status === 'closed' ? '<span class="status delivered">✅ اتقفلت</span>'
  : t.lastBy === 'admin' ? '<span class="status ready">💬 الإدارة ردت</span>'
    : '<span class="status placed">⏳ مستنية رد</span>');

// صفحة الدعم للمستخدم. options.orderId: لو جاي من صفحة طلب معين
export function renderSupport(el, { backend, user, settings, orderId = null }) {
  let tickets = null;
  let openId = null;
  let composing = Boolean(orderId);

  const whatsapp = settings?.supportPhone
    ? `<a class="btn whatsapp" target="_blank" rel="noopener" href="https://wa.me/2${esc(settings.supportPhone)}">💬 كلّمنا واتساب</a>` : '';

  const drawList = () => {
    el.innerHTML = `
      <div class="list-head">
        <h2>🎧 خدمة العملاء</h2>
        <div class="row-actions">${whatsapp}<button class="btn primary" id="newTicket" type="button">+ شكوى أو استفسار جديد</button></div>
      </div>
      ${tickets.length ? `<div class="tickets">${tickets.map((t) => `
        <button class="panel ticket-row" data-open="${t.id}" type="button">
          <div class="grow">
            <b>${TICKET_TOPICS[t.topic] || ''} ${esc(t.subject)}</b>
            <div class="muted small">#${shortId(t.id)}${t.orderId ? ` • طلب #${shortId(t.orderId)}` : ''} • ${timeAgo(t.updatedAt)}</div>
          </div>
          ${ticketStatus(t)}
        </button>`).join('')}</div>`
        : '<div class="empty-state"><div class="big">🎧</div><p class="muted">عندك مشكلة أو استفسار؟ ابعتلنا وهنرد عليك في أقرب وقت.</p></div>'}`;
    el.querySelector('#newTicket').addEventListener('click', () => { composing = true; draw(); });
    el.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => { openId = b.dataset.open; draw(); }));
  };

  const drawNew = () => {
    el.innerHTML = `
      <form class="panel narrow" id="ticketForm">
        <h2>شكوى أو استفسار جديد</h2>
        <label>الموضوع
          <select name="topic" required>
            ${Object.entries(TICKET_TOPICS).map(([k, l]) => `<option value="${k}" ${orderId && k === 'order' ? 'selected' : ''}>${l}</option>`).join('')}
          </select>
        </label>
        ${orderId ? `<p class="muted small">بخصوص الطلب #${shortId(orderId)}</p>` : ''}
        <label>العنوان<input name="subject" required maxlength="100" placeholder="مثال: الأكل وصل بارد"></label>
        <label>اكتب التفاصيل<textarea name="text" required rows="5" maxlength="2000"></textarea></label>
        <button class="btn primary block" type="submit">📨 ابعت</button>
        <button class="btn block" type="button" id="cancelNew">رجوع</button>
      </form>`;
    el.querySelector('#cancelNew').addEventListener('click', () => { composing = false; orderId = null; draw(); });
    el.querySelector('#ticketForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(e.target));
      const btn = e.target.querySelector('button[type=submit]');
      btn.disabled = true;
      try {
        openId = await backend.createTicket(user, { topic: d.topic, subject: d.subject.trim(), text: d.text.trim(), orderId });
        composing = false;
        orderId = null;
        toast('وصلتنا رسالتك ✅ هنرد عليك قريب');
        draw();
      } catch (err) {
        toast(errorMessage(err));
        btn.disabled = false;
      }
    });
  };

  // المحادثة: الرسايل بتتحدث لوحدها، وخانة الرد مش بتتمسح
  const drawThread = (t) => {
    if (!el.querySelector(`[data-thread="${t.id}"]`)) {
      el.innerHTML = `
        <button class="back link" id="backList" type="button">→ كل الرسايل</button>
        <section class="panel" data-thread="${t.id}">
          <div class="list-head">
            <h3>${TICKET_TOPICS[t.topic] || ''} ${esc(t.subject)}</h3>
            <span id="tStatus"></span>
          </div>
          <div class="muted small">#${shortId(t.id)}${t.orderId ? ` • طلب #${shortId(t.orderId)}` : ''}</div>
          <div class="messages" id="messages"></div>
          <form id="replyForm" class="reply">
            <textarea name="text" required rows="2" maxlength="2000" placeholder="اكتب ردك..."></textarea>
            <button class="btn primary" type="submit">إرسال</button>
          </form>
        </section>`;
      el.querySelector('#backList').addEventListener('click', () => { openId = null; draw(); });
      el.querySelector('#replyForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const ta = e.target.querySelector('textarea');
        const text = ta.value.trim();
        if (!text) return;
        const btn = e.target.querySelector('button');
        btn.disabled = true;
        try {
          await backend.replyTicket(openId, user, text);
          ta.value = '';
        } catch (err) {
          toast(errorMessage(err));
        } finally {
          btn.disabled = false;
        }
      });
    }
    el.querySelector('#tStatus').innerHTML = ticketStatus(t);
    const box = el.querySelector('#messages');
    box.innerHTML = thread(t, user.uid) + (t.status === 'closed' ? '<p class="muted small center">المحادثة اتقفلت. لو لسه محتاج حاجة اكتب رد وهتتفتح تاني.</p>' : '');
    box.scrollTop = box.scrollHeight;
  };

  const draw = () => {
    if (!tickets) { el.innerHTML = loader(); return; }
    if (composing) return drawNew();
    const t = openId && tickets.find((x) => x.id === openId);
    if (t) return drawThread(t);
    return drawList();
  };

  draw();
  return backend.watchMyTickets(user.uid, (list) => {
    tickets = list;
    // ما نعيدش رسم فورم الشكوى وهو بيكتب
    if (!composing || !el.querySelector('#ticketForm')) draw();
  });
}
