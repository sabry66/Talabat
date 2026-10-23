// منطق إشعارات الـ Cloud Function (مين يوصله إيه) من غير Firebase
import { orderMessages } from '../../functions/messages.js';
const fails = [];
const ok = (cond, msg) => { console.log(cond ? '✔' : '✘', msg); if (!cond) fails.push(msg); };
const base = { customerUid: 'c1', ownerUid: 'o1', restaurantName: 'بيت البرجر', zoneName: 'المعادي', totals: { subtotal: 220 }, status: 'placed', driverUid: null };
const to = (list) => list.map((m) => m.to.drivers ? 'drivers' : m.to.uid).sort().join(',');

let m = orderMessages(null, base, 'abc123');
ok(to(m) === 'o1' && m[0].urgent && m[0].url === '/restaurant.html', 'new order -> restaurant owner only (urgent)');

m = orderMessages(base, { ...base, status: 'preparing' }, 'abc123');
ok(to(m) === 'c1,drivers', 'accepted -> customer + drivers: ' + to(m));
ok(m.find((x) => x.to.uid === 'c1').url === '/#/order/abc123', 'customer link opens the order');

const claimed = { ...base, status: 'preparing', driverUid: 'd1', driverName: 'أحمد' };
m = orderMessages({ ...base, status: 'preparing' }, claimed, 'abc123');
ok(to(m) === 'c1,o1' && m.some((x) => x.body.includes('أحمد مسك')), 'claim -> customer + restaurant, no driver broadcast');

m = orderMessages(claimed, { ...claimed, driverUid: null, driverName: null }, 'abc123');
ok(to(m) === 'c1,drivers' && m.find((x) => x.to.uid === 'c1').body.includes('اعتذر'), 'release -> customer told + drivers alerted again');

m = orderMessages(claimed, { ...claimed, driverUid: 'd2', driverName: 'محمود' }, 'abc123');
ok(to(m) === 'c1' && m[0].body.includes('محمود') && m[0].urgent, 'switch -> customer told the new driver');

m = orderMessages({ ...claimed, status: 'ready' }, { ...claimed, status: 'on_way' }, 'abc123');
ok(to(m) === 'c1' && m[0].urgent, 'on the way -> customer (urgent)');

m = orderMessages({ ...claimed, status: 'on_way' }, { ...claimed, status: 'delivered' }, 'abc123');
ok(to(m) === 'c1' && m[0].body.includes('تقيّمه'), 'delivered -> customer asked to rate');

m = orderMessages(base, { ...base, status: 'cancelled' }, 'abc123');
ok(to(m) === 'c1,o1', 'customer cancels -> restaurant told');

m = orderMessages({ ...claimed }, { ...claimed, status: 'cancelled' }, 'abc123');
ok(to(m) === 'c1,d1,o1', 'admin cancels a claimed order -> customer + restaurant + driver');

m = orderMessages({ ...claimed, status: 'preparing' }, { ...claimed, status: 'preparing', packed: { 0: true } }, 'abc123');
ok(m.length === 0, 'unrelated edits send nothing');

m = orderMessages(base, null, 'abc123');
ok(m.length === 0, 'deleted order sends nothing');

m = orderMessages(null, { ...base, ownerUid: null }, 'abc123');
ok(m.length === 0, 'restaurant without owner: nothing to send');

if (fails.length) { console.log('FAILED'); process.exit(1); }
console.log('ALL PASSED');
