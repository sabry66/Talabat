// جدولة الطلب لوقت بعدين (النهارده أو بكرة)، كل نص ساعة
export const MIN_LEAD = 30 * 60 * 1000; // أقل حاجة بعد نص ساعة (زي قواعد Firestore)
export const MAX_AHEAD = 3 * 24 * 60 * 60 * 1000;
const SLOT = 30 * 60 * 1000;
const FIRST_HOUR = 9; // أول ميعاد في اليوم
const LAST = { h: 23, m: 30 }; // آخر ميعاد

const dayStart = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

// المواعيد المتاحة في اليوم ده (0 = النهارده، 1 = بكرة). leadMin = أقل وقت يجهز فيه الطلب
export function slots(dayOffset, leadMin, now = new Date()) {
  const base = dayStart(now);
  base.setDate(base.getDate() + dayOffset);
  const from = new Date(base); from.setHours(FIRST_HOUR, 0, 0, 0);
  const to = new Date(base); to.setHours(LAST.h, LAST.m, 0, 0);
  const earliest = now.getTime() + Math.max(MIN_LEAD, (Number(leadMin) || 0) * 60 * 1000 + 15 * 60 * 1000);
  let t = Math.max(from.getTime(), Math.ceil(earliest / SLOT) * SLOT);
  const out = [];
  for (; t <= to.getTime(); t += SLOT) out.push({ value: t, label: timeLabel(t) });
  return out;
}

const timeLabel = (ms) => new Date(ms).toLocaleTimeString('ar-EG', { hour: 'numeric', minute: '2-digit' });

// "النهارده 8:30 م" أو "بكرة 1:00 م"
export function whenLabel(ms, now = new Date()) {
  const diff = Math.round((dayStart(new Date(ms)) - dayStart(now)) / 86400000);
  const day = diff === 0 ? 'النهارده' : diff === 1 ? 'بكرة' : new Date(ms).toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long' });
  return `${day} الساعة ${timeLabel(ms)}`;
}

export const isScheduled = (o) => Number(o?.scheduledFor) > 0;

export const scheduleTag = (o) => (isScheduled(o)
  ? `<p class="sched-tag">⏰ <b>طلب مجدول:</b> العميل عايزه ${whenLabel(o.scheduledFor)}</p>` : '');
