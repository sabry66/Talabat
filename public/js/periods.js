// فترات الحسابات (بتوقيت الجهاز = مصر): النهارده، امبارح، آخر 7 أيام، الشهر ده، الشهر اللي فات، الكل، أو من يوم ليوم
export const PERIODS = [
  ['today', 'النهارده'], ['yesterday', 'امبارح'], ['week', 'آخر 7 أيام'],
  ['month', 'الشهر ده'], ['lastMonth', 'الشهر اللي فات'], ['all', 'الكل'], ['custom', '📅 من … لـ …'],
];

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
// "2026-10-23" ← تاريخ (للـ input type=date) والعكس
export const dateInput = (ms) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const parseDate = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
};
const dayLabel = (ms) => new Date(ms).toLocaleDateString('ar-EG', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

// { from, to, label }: من أول from لحد قبل to (to مش داخل)
export function periodRange(key, custom = {}, now = new Date()) {
  const today = startOfDay(now);
  const r = (from, to) => ({ from: from.getTime(), to: to.getTime() });
  let out;
  if (key === 'today') out = r(today, addDays(today, 1));
  else if (key === 'yesterday') out = r(addDays(today, -1), today);
  else if (key === 'week') out = r(addDays(today, -6), addDays(today, 1));
  else if (key === 'month') out = r(new Date(today.getFullYear(), today.getMonth(), 1), addDays(today, 1));
  else if (key === 'lastMonth') out = r(new Date(today.getFullYear(), today.getMonth() - 1, 1), new Date(today.getFullYear(), today.getMonth(), 1));
  else if (key === 'custom') {
    let a = parseDate(custom.from) || today;
    let b = parseDate(custom.to) || a;
    if (b < a) [a, b] = [b, a];
    out = r(a, addDays(b, 1));
  } else out = { from: 0, to: addDays(today, 1).getTime() };
  const last = out.to - 1;
  out.label = key === 'all' ? 'من الأول لحد النهارده'
    : dateInput(out.from) === dateInput(last) ? dayLabel(out.from)
      : `من ${dayLabel(out.from)} لـ ${dayLabel(last)}`;
  return out;
}

export const inRange = (o, { from, to }) => o.createdAt >= from && o.createdAt < to;

// تقسيم الحسابات يوم بيوم (الأحدث الأول). split = orderSplit(o)، paid = paidTotal(o)
export function dailyRows(items) {
  const days = {};
  for (const { o, s, paid } of items) {
    const key = dateInput(o.createdAt);
    const d = days[key] ??= { key, label: dayLabel(startOfDay(new Date(o.createdAt)).getTime()), count: 0, paid: 0, food: 0, discount: 0, restaurant: 0, driver: 0, platform: 0 };
    d.count++;
    d.paid += paid;
    d.food += o.totals.subtotal - s.missing;
    d.discount += o.totals.discount || 0;
    d.restaurant += s.restaurant;
    d.driver += s.driver;
    d.platform += s.platform;
  }
  const round = (n) => Math.round(n * 100) / 100;
  return Object.values(days).sort((a, b) => b.key.localeCompare(a.key))
    .map((d) => ({ ...d, paid: round(d.paid), food: round(d.food), discount: round(d.discount), restaurant: round(d.restaurant), driver: round(d.driver), platform: round(d.platform) }));
}

// ملف CSV يفتح في Excel بالعربي (BOM عشان الحروف)
export function toCSV(rows) {
  const cell = (v) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n');
}
