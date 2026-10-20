// طلبات الانضمام: المندوب أو صاحب المطعم يقدّم طلب، والأدمن يوافق عليه من لوحة الأدمن
import { CATEGORIES } from './data.js';
import { esc, toast, errorMessage, loader } from './ui.js';

export const VEHICLES = { motorcycle: '🏍️ موتوسيكل', bicycle: '🚲 عجلة', car: '🚗 عربية', walk: '🚶 مشي' };

const TEXT = {
  driver: { title: 'انضم لأريفو كمندوب 🛵', pending: 'طلبك كمندوب' },
  restaurant: { title: 'سجّل مطعمك في أريفو 🏪', pending: 'طلب تسجيل مطعمك' },
};

function driverFields(a) {
  return `
    <label>نوع المواصلة
      <select name="vehicle" required>
        ${Object.entries(VEHICLES).map(([k, l]) => `<option value="${k}" ${a.vehicle === k ? 'selected' : ''}>${l}</option>`).join('')}
      </select>
    </label>
    <label>المناطق اللي تقدر تشتغل فيها<input name="area" required value="${esc(a.area)}" placeholder="مثال: مدينة نصر ومصر الجديدة"></label>`;
}

function restaurantFields(a) {
  return `
    <label>اسم المطعم<input name="restaurantName" required value="${esc(a.restaurantName)}"></label>
    <label>نوع الأكل
      <select name="category" required>
        ${CATEGORIES.filter((c) => c.id !== 'all').map((c) =>
          `<option value="${c.id}" ${a.category === c.id ? 'selected' : ''}>${c.icon} ${c.name}</option>`).join('')}
      </select>
    </label>
    <label>عنوان المطعم<input name="address" required value="${esc(a.address)}" placeholder="المنطقة، الشارع، علامة مميزة"></label>
    <label>تليفون المطعم<input name="restaurantPhone" type="tel" required value="${esc(a.restaurantPhone)}" inputmode="numeric" dir="ltr"></label>`;
}

// بيرسم حالة طلب الانضمام (فورم، أو قيد المراجعة، أو مرفوض) ويرجّع دالة لإلغاء المتابعة
export function renderJoin(el, { backend, user, type }) {
  el.innerHTML = loader();
  let editing = false;
  let current = null;

  const drawForm = (a = {}) => {
    el.innerHTML = `
      <form class="panel narrow join-form" id="joinForm">
        <h2>${TEXT[type].title}</h2>
        ${a.status === 'rejected' ? '<p class="warn">طلبك اللي فات اترفض. تقدر تعدّل البيانات وتبعته تاني، أو تكلّم الإدارة.</p>' : ''}
        <label>الاسم<input name="name" required value="${esc(a.name || user.name)}"></label>
        <label>رقم الموبايل<input name="phone" type="tel" required pattern="01[0-9]{9}" inputmode="numeric" value="${esc(a.phone || user.phone)}" dir="ltr"></label>
        ${type === 'driver' ? driverFields(a) : restaurantFields(a)}
        <label>ملاحظات (اختياري)<input name="notes" value="${esc(a.notes)}"></label>
        <button class="btn primary block" type="submit">📨 ابعت الطلب</button>
        ${a.status === 'pending' ? '<button class="btn block" type="button" id="cancelEdit">رجوع</button>' : ''}
        <p class="muted small center">الإدارة هتراجع طلبك، وأول ما يتوافق عليه الصفحة دي هتتفتح لوحدها.</p>
      </form>`;
    el.querySelector('#cancelEdit')?.addEventListener('click', () => { editing = false; draw(); });
    el.querySelector('#joinForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(e.target));
      Object.keys(d).forEach((k) => { d[k] = d[k].trim(); });
      const btn = e.target.querySelector('button[type=submit]');
      btn.disabled = true;
      try {
        await backend.submitApplication(user, { ...d, type });
        editing = false;
        toast('تم إرسال طلبك ✅');
      } catch (err) {
        toast(errorMessage(err));
        btn.disabled = false;
      }
    });
  };

  const drawPending = (a) => {
    el.innerHTML = `
      <div class="empty-state">
        <div class="big">⏳</div>
        <h2>${TEXT[type].pending} قيد المراجعة</h2>
        <p class="muted">بعتناه للإدارة في ${new Date(a.createdAt).toLocaleString('ar-EG')}. أول ما يتوافق عليه الصفحة دي هتتفتح لوحدها.</p>
        <button class="btn" type="button" id="editApp">تعديل بيانات الطلب</button>
      </div>`;
    el.querySelector('#editApp').addEventListener('click', () => { editing = true; drawForm(a); });
  };

  const draw = () => {
    const a = current;
    // طلب لنوع تاني (مثلًا قدّم كمندوب وفتح صفحة المطاعم) بنعامله كأنه مفيش
    if (!a || a.type !== type || a.status === 'rejected') return drawForm(a && a.type === type ? a : {});
    if (a.status === 'pending') return editing ? null : drawPending(a);
    // اتوافق عليه: الصفحة بتتفتح لوحدها لما الصلاحية توصل. لو فضلت كده، يبقى الإدارة شالت الصلاحية بعدين
    el.innerHTML = `<div class="empty-state"><div class="big">🎉</div><h2>تمت الموافقة على طلبك!</h2>
      <p class="muted">لو الصفحة متفتحتش خلال ثواني، كلّم الإدارة أو قدّم طلب جديد.</p>
      <button class="btn" type="button" id="reapply">قدّم طلب جديد</button></div>`;
    el.querySelector('#reapply').addEventListener('click', () => drawForm({}));
  };

  return backend.watchMyApplication(user.uid, (a) => {
    current = a;
    draw();
  });
}
