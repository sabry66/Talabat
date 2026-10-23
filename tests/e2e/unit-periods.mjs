// فترات الحسابات: حدود كل فترة بالظبط، واليوم بيوم، وملف الـ CSV
import { periodRange, dailyRows, toCSV, inRange } from '../../public/js/periods.js';
const fails = [];
const ok = (cond, msg) => { console.log(cond ? '✔' : '✘', msg); if (!cond) fails.push(msg); };
const D = (y, m, d, h = 0) => new Date(y, m - 1, d, h).getTime();
const now = new Date(2026, 9, 23, 15, 30); // 23 أكتوبر 2026 الساعة 3:30 العصر

let r = periodRange('today', {}, now);
ok(r.from === D(2026, 10, 23) && r.to === D(2026, 10, 24), 'النهارده: من 12 بالليل لـ 12 بالليل اللي بعده');
r = periodRange('yesterday', {}, now);
ok(r.from === D(2026, 10, 22) && r.to === D(2026, 10, 23), 'امبارح');
r = periodRange('week', {}, now);
ok(r.from === D(2026, 10, 17) && r.to === D(2026, 10, 24), 'آخر 7 أيام = النهارده و6 أيام قبله');
r = periodRange('month', {}, now);
ok(r.from === D(2026, 10, 1) && r.to === D(2026, 10, 24), 'الشهر ده: من أول أكتوبر لحد النهارده');
r = periodRange('lastMonth', {}, now);
ok(r.from === D(2026, 9, 1) && r.to === D(2026, 10, 1), 'الشهر اللي فات: سبتمبر كله');
r = periodRange('lastMonth', {}, new Date(2026, 0, 10));
ok(r.from === D(2025, 12, 1) && r.to === D(2026, 1, 1), 'الشهر اللي فات في يناير = ديسمبر السنة اللي فاتت');
r = periodRange('custom', { from: '2026-10-05', to: '2026-10-05' }, now);
ok(r.from === D(2026, 10, 5) && r.to === D(2026, 10, 6) && !r.label.includes('من'), 'يوم واحد (نفس التاريخ مرتين)');
r = periodRange('custom', { from: '2026-10-10', to: '2026-10-01' }, now);
ok(r.from === D(2026, 10, 1) && r.to === D(2026, 10, 11), 'لو اختار التواريخ بالعكس بنقلبهم');
ok(inRange({ createdAt: D(2026, 10, 10, 23) }, r) && !inRange({ createdAt: D(2026, 10, 11) }, r), 'آخر يوم داخل كله، واليوم اللي بعده لأ');
ok(periodRange('all', {}, now).from === 0, 'الكل من الأول');

const item = (day, sub) => ({ o: { createdAt: D(2026, 10, day, 12), totals: { subtotal: sub, discount: 0 } }, s: { missing: 0, restaurant: sub, driver: 9, platform: 21 }, paid: sub + 30 });
const rows = dailyRows([item(23, 100), item(23, 200), item(22, 150)]);
ok(rows.length === 2 && rows[0].key === '2026-10-23' && rows[0].count === 2 && rows[0].paid === 360 && rows[0].platform === 42, 'يوم بيوم: 23 أكتوبر = طلبين ودفعوا 360');
ok(rows[1].paid === 180, 'يوم بيوم: 22 أكتوبر = 180');

const csv = toCSV([['المطعم', 'ملاحظة'], ['بيت "البرجر"', 'سطر,فيه فاصلة']]);
ok(csv.startsWith('﻿') && csv.includes('"بيت ""البرجر"""') && csv.includes('"سطر,فيه فاصلة"'), 'CSV: عربي بيفتح في Excel، والفواصل والعلامات متأمّنة');

if (fails.length) { console.log('FAILED'); process.exit(1); }
console.log('ALL PASSED');
