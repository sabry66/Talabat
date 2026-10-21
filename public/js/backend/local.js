// الوضع التجريبي: قاعدة بيانات وهمية في localStorage بنفس واجهة باك إند Firebase.
// البيانات بتتزامن بين التابات، والدخول لكل تاب لوحده: تقدر تفتح التطبيق كعميل في تاب
// ولوحة المطعم كصاحب مطعم في تاب تاني.
import { SEED_RESTAURANTS, DEFAULT_SETTINGS, SAMPLE_ZONES, SAMPLE_COUPONS } from '../data.js';
import { withDefaults } from '../finance.js';
import { normalizeUsername, normalizePhone, checkUsername, checkPhone, idError } from '../identity.js';

const DB_KEY = 'arrivo_demo_db_v3';
const SESSION_KEY = 'talabaty_demo_session';

const clone = (x) => (x == null ? x : JSON.parse(JSON.stringify(x)));
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const session = {
  get: () => { try { return sessionStorage.getItem(SESSION_KEY); } catch { return null; } },
  set: (uid) => { try { sessionStorage.setItem(SESSION_KEY, uid); } catch { /* غير متاح */ } },
  clear: () => { try { sessionStorage.removeItem(SESSION_KEY); } catch { /* غير متاح */ } },
};
const authError = (code) => Object.assign(new Error(code), { code });

function seed() {
  const user = (uid, email, name, role, phone, restaurantId = null) =>
    ({ uid, email, password: '123456', name, phone, username: uid.replace('u-', 'demo_'), address: '', role, restaurantId });
  const users = {
    'u-admin': user('u-admin', 'admin@demo.com', 'مدير التطبيق', 'admin', '01000000001'),
    'u-owner': user('u-owner', 'owner@demo.com', 'صاحب بيت البرجر', 'restaurant', '01000000002', 'burger-house'),
    'u-customer': user('u-customer', 'customer@demo.com', 'عميل تجريبي', 'customer', '01000000003'),
    'u-driver': user('u-driver', 'driver@demo.com', 'مندوب تجريبي', 'driver', '01000000004'),
    'u-staff': user('u-staff', 'staff@demo.com', 'موظف خدمة العملاء', 'staff', '01000000005'),
  };
  const restaurants = {};
  for (const r of SEED_RESTAURANTS) {
    const owned = r.id === 'burger-house';
    restaurants[r.id] = {
      ...clone(r), isOpen: true, ownerUid: owned ? 'u-owner' : null,
      ownerEmail: owned ? 'owner@demo.com' : null, ownerUsername: owned ? 'demo_owner' : null,
    };
  }
  const settings = { ...clone(DEFAULT_SETTINGS), zones: clone(SAMPLE_ZONES) };
  return { users, restaurants, orders: {}, settings, applications: {}, tickets: {}, coupons: clone(SAMPLE_COUPONS), couponUses: {} };
}

let cache = null;
const listeners = new Set();

function db() {
  if (!cache) {
    try { cache = JSON.parse(localStorage.getItem(DB_KEY)); } catch { cache = null; }
    if (!cache) {
      cache = seed();
      persist();
    }
    // قاعدة تجريبية قديمة من قبل الكوبونات
    cache.coupons ||= clone(SAMPLE_COUPONS);
    cache.couponUses ||= {};
  }
  return cache;
}

function persist() {
  try { localStorage.setItem(DB_KEY, JSON.stringify(cache)); } catch { /* التخزين غير متاح */ }
}

function commit() {
  persist();
  listeners.forEach((fn) => fn());
}

window.addEventListener('storage', (e) => {
  if (e.key === DB_KEY) cache = null;
  if (e.key === DB_KEY) listeners.forEach((fn) => fn());
});

// بيبعت النتيجة أول مرة، وبعد كده بس لما تتغير
function watch(compute, cb) {
  let last;
  const run = () => {
    const value = compute();
    const json = JSON.stringify(value);
    if (json === last) return;
    last = json;
    cb(clone(value));
  };
  listeners.add(run);
  setTimeout(run, 0);
  return () => listeners.delete(run);
}

const publicUser = (u) => {
  if (!u) return null;
  const { password, ...rest } = u;
  return rest;
};

const sortByNewest = (list) => list.sort((a, b) => b.createdAt - a.createdAt);

function releaseDriverOrders(uid) {
  Object.values(db().orders).filter((o) => o.driverUid === uid && ['preparing', 'ready'].includes(o.status))
    .forEach((o) => Object.assign(o, { driverUid: null, driverName: null, driverPhone: null, driverUsername: null, claimedAt: null }));
}

export function createBackend() {
  return {
    onAuth(cb) {
      return watch(() => publicUser(db().users[session.get()]), cb);
    },

    async signUp({ name, email, password, phone, username }) {
      email = email.trim().toLowerCase();
      username = normalizeUsername(username);
      phone = normalizePhone(phone);
      checkUsername(username);
      checkPhone(phone);
      if (!/^\S+@\S+\.\S+$/.test(email)) throw authError('auth/invalid-email');
      if (password.length < 6) throw authError('auth/weak-password');
      const all = Object.values(db().users);
      if (all.some((u) => u.email === email)) throw authError('auth/email-already-in-use');
      if (all.some((u) => u.username === username)) throw idError('username-taken');
      if (all.some((u) => u.phone === phone)) throw idError('phone-taken');
      const uid = 'u-' + newId();
      db().users[uid] = { uid, email, password, name, phone, username, address: '', role: 'customer', restaurantId: null };
      session.set(uid);
      commit();
    },

    async claimIdentity(user, { username, phone }) {
      username = normalizeUsername(username || user.username);
      phone = normalizePhone(phone);
      checkUsername(username);
      checkPhone(phone);
      if (user.username && username !== user.username) throw idError('username-locked');
      const others = Object.values(db().users).filter((u) => u.uid !== user.uid);
      if (others.some((u) => u.username === username)) throw idError('username-taken');
      if (others.some((u) => u.phone === phone)) throw idError('phone-taken');
      Object.assign(db().users[user.uid], { username, phone });
      commit();
    },

    async signIn(email, password) {
      email = email.trim().toLowerCase();
      const u = Object.values(db().users).find((x) => x.email === email && x.password === password);
      if (!u) throw authError('auth/invalid-credential');
      session.set(u.uid);
      commit();
    },

    // الوضع التجريبي مفيهوش إيميلات حقيقية
    async resetPassword(email) {
      if (!/^\S+@\S+\.\S+$/.test(email.trim())) throw authError('auth/invalid-email');
    },

    async changePassword(current, next) {
      const u = db().users[session.get()];
      if (!u || u.password !== current) throw authError('auth/invalid-credential');
      if (next.length < 6) throw authError('auth/weak-password');
      u.password = next;
      commit();
    },

    async signOut() {
      session.clear();
      commit();
    },

    async updateProfile(uid, { name, address, location }) {
      Object.assign(db().users[uid], clone({ name, address, location: location ?? null }));
      commit();
    },

    // بالإيميل أو اسم المستخدم (@ahmed) أو رقم الموبايل
    async findUser(identifier) {
      const id = String(identifier || '').trim();
      const match = id.includes('@') && !id.startsWith('@') ? (u) => u.email === id.toLowerCase()
        : /^[0-9٠-٩+]/.test(id) ? (u) => u.phone === normalizePhone(id)
          : (u) => u.username === normalizeUsername(id);
      return clone(publicUser(Object.values(db().users).find(match)));
    },

    watchUsers(cb) {
      return watch(() => Object.values(db().users).map(publicUser), cb);
    },

    watchRestaurants(cb) {
      return watch(() => Object.values(db().restaurants), cb);
    },

    watchRestaurant(id, cb) {
      return watch(() => db().restaurants[id] || null, cb);
    },

    async createRestaurant(data, id = 'r-' + newId()) {
      db().restaurants[id] = { ...clone(data), id };
      commit();
      return id;
    },

    async updateRestaurant(id, data) {
      Object.assign(db().restaurants[id], clone(data));
      commit();
    },

    async deleteRestaurant(id) {
      delete db().restaurants[id];
      commit();
    },

    // يربط حساب بمطعم كصاحبه، ويفك ربط صاحبه القديم
    async assignOwner(restaurantId, user) {
      const d = db();
      const r = d.restaurants[restaurantId];
      const old = r.ownerUid && d.users[r.ownerUid];
      if (old && old.uid !== user.uid) {
        old.restaurantId = null;
        if (old.role === 'restaurant') old.role = 'customer';
      }
      const u = d.users[user.uid];
      if (u.restaurantId && u.restaurantId !== restaurantId && d.restaurants[u.restaurantId]) {
        Object.assign(d.restaurants[u.restaurantId], { ownerUid: null, ownerEmail: null });
      }
      Object.assign(r, { ownerUid: u.uid, ownerEmail: u.email, ownerUsername: u.username || null });
      Object.assign(u, { restaurantId, role: u.role === 'admin' ? 'admin' : 'restaurant' });
      commit();
    },

    watchSettings(cb) {
      return watch(() => withDefaults(db().settings), cb);
    },

    async saveSettings(settings) {
      db().settings = clone({
        zones: settings.zones, rates: settings.rates, supportPhone: settings.supportPhone || '',
        couponsPerOrder: Number(settings.couponsPerOrder) || 0,
      });
      commit();
    },

    // ---------- الكوبونات ----------
    async getCoupon(code) {
      return clone(db().coupons[code] || null);
    },

    async hasUsedCoupon(uid, code) {
      return Boolean(db().couponUses[`${uid}/${code}`]);
    },

    watchCoupons(cb) {
      return watch(() => Object.values(db().coupons).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)), cb);
    },

    async saveCoupon(coupon, isNew) {
      const { code, used, createdAt, lastOrder, ...data } = clone(coupon);
      const old = db().coupons[code];
      if (isNew && old) throw authError('coupon-exists');
      db().coupons[code] = isNew ? { ...data, code, used: 0, createdAt: Date.now() } : { ...old, ...data };
      commit();
    },

    async deleteCoupon(code) {
      delete db().coupons[code];
      commit();
    },

    watchUsersByRole(role, cb) {
      return watch(() => Object.values(db().users).filter((u) => u.role === role).map(publicUser), cb);
    },

    async setUserRole(uid, role) {
      Object.assign(db().users[uid], { role, restaurantId: null });
      commit();
    },

    // طلبات الانضمام كمندوب أو مطعم
    async submitApplication(user, data) {
      db().applications ||= {};
      db().applications[user.uid] = {
        ...clone(data), uid: user.uid, email: user.email, username: user.username || null, status: 'pending', createdAt: Date.now(),
      };
      commit();
    },

    watchMyApplication(uid, cb) {
      return watch(() => (db().applications || {})[uid] || null, cb);
    },

    watchApplications(cb) {
      return watch(() => sortByNewest(Object.values(db().applications || {}).filter((a) => a.status === 'pending')), cb);
    },

    async approveDriver(uid, reviewer = null) {
      Object.assign(db().users[uid], { role: 'driver', restaurantId: null });
      Object.assign(db().applications[uid], { status: 'approved', reviewedAt: Date.now(), reviewedBy: reviewer });
      commit();
    },

    async approveRestaurant(uid, restaurant, reviewer = null) {
      const d = db();
      const id = 'r-' + newId();
      d.restaurants[id] = { ...clone(restaurant), id, ownerUid: uid, ownerEmail: d.users[uid].email, ownerUsername: d.users[uid].username || null };
      Object.assign(d.users[uid], { role: 'restaurant', restaurantId: id });
      Object.assign(d.applications[uid], { status: 'approved', reviewedAt: Date.now(), reviewedBy: reviewer });
      commit();
      return id;
    },

    async rejectApplication(uid, reviewer = null) {
      Object.assign(db().applications[uid], { status: 'rejected', reviewedAt: Date.now(), reviewedBy: reviewer });
      commit();
    },

    // ---------- خدمة العملاء ----------
    async createTicket(user, { topic, subject, text, orderId }) {
      const d = db();
      d.tickets ||= {};
      const id = 't' + newId();
      const now = Date.now();
      d.tickets[id] = {
        id, uid: user.uid, name: user.name, username: user.username || null, role: user.role, phone: user.phone || '',
        topic, subject, orderId: orderId || null, status: 'open', lastBy: 'user', createdAt: now, updatedAt: now,
        messages: [{ by: user.uid, name: user.name, text, at: now }],
      };
      commit();
      return id;
    },

    async replyTicket(id, user, text) {
      const t = db().tickets[id];
      t.messages.push({ by: user.uid, name: user.name, text, at: Date.now() });
      Object.assign(t, { updatedAt: Date.now(), lastBy: 'user', status: 'open' });
      commit();
    },

    async adminReplyTicket(id, admin, text) {
      const t = db().tickets[id];
      t.messages.push({ by: 'admin', name: admin.name, text, at: Date.now() });
      Object.assign(t, { updatedAt: Date.now(), lastBy: 'admin' });
      commit();
    },

    async setTicketStatus(id, status) {
      Object.assign(db().tickets[id], { status, updatedAt: Date.now() });
      commit();
    },

    watchMyTickets(uid, cb) {
      return watch(() => Object.values(db().tickets || {}).filter((t) => t.uid === uid).sort((a, b) => b.updatedAt - a.updatedAt), cb);
    },

    watchAllTickets(cb) {
      return watch(() => Object.values(db().tickets || {}).sort((a, b) => b.updatedAt - a.updatedAt), cb);
    },

    // ---------- الحظر والحذف (للأدمن) ----------
    async setBanned(user, banned, reason = '') {
      const d = db();
      Object.assign(d.users[user.uid], { banned, bannedReason: banned ? reason : null });
      if (banned && user.role === 'driver') releaseDriverOrders(user.uid);
      if (user.restaurantId && d.restaurants[user.restaurantId]) {
        Object.assign(d.restaurants[user.restaurantId], banned ? { blocked: true, isOpen: false } : { blocked: false });
      }
      commit();
    },

    async deleteAccount(user) {
      const d = db();
      Object.assign(d.users[user.uid], {
        deleted: true, banned: true, name: 'حساب محذوف', phone: '', address: '', location: null,
        username: null, deletedUsername: user.username || null, role: 'customer', restaurantId: null,
      });
      if (user.role === 'driver') releaseDriverOrders(user.uid);
      if (user.restaurantId && d.restaurants[user.restaurantId]) {
        Object.assign(d.restaurants[user.restaurantId], { ownerUid: null, ownerEmail: null, ownerUsername: null, isOpen: false });
      }
      delete (d.applications || {})[user.uid];
      commit();
    },

    async setRestaurantBlocked(id, blocked) {
      Object.assign(db().restaurants[id], blocked ? { blocked: true, isOpen: false } : { blocked: false });
      commit();
    },

    async createOrder(order, usedCoupons = []) {
      const id = newId();
      for (const c of usedCoupons) {
        const cur = db().coupons[c.code];
        const key = `${order.customerUid}/${c.code}`;
        if (!cur || !cur.active || (cur.limit && cur.used >= cur.limit) || (cur.expiresAt && Date.now() > cur.expiresAt)
          || (cur.onePerCustomer && db().couponUses[key])) throw authError('permission-denied');
      }
      for (const c of usedCoupons) {
        db().coupons[c.code].used = (db().coupons[c.code].used || 0) + 1;
        if (c.onePerCustomer) db().couponUses[`${order.customerUid}/${c.code}`] = { orderId: id, at: Date.now() };
      }
      db().orders[id] = { ...clone(order), id, createdAt: Date.now() };
      commit();
      return id;
    },

    watchOrder(id, cb) {
      return watch(() => db().orders[id] || null, cb);
    },

    // filter: { customerUid } أو { ownerUid } أو { driverUid } أو {} لكل الطلبات (للأدمن)
    watchOrders(filter, cb) {
      return watch(() => sortByNewest(Object.values(db().orders).filter((o) =>
        (!filter.customerUid || o.customerUid === filter.customerUid) &&
        (!filter.ownerUid || o.ownerUid === filter.ownerUid) &&
        (!filter.driverUid || o.driverUid === filter.driverUid))), cb);
    },

    // الأوردرات اللي مستنية مندوب (بتتجهز أو جاهزة ومحدش أخدها)
    watchAvailableOrders(cb) {
      return watch(() => sortByNewest(Object.values(db().orders)
        .filter((o) => !o.driverUid && ['preparing', 'ready'].includes(o.status))), cb);
    },

    async claimOrder(id, driver) {
      const o = db().orders[id];
      if (o.driverUid || !['preparing', 'ready'].includes(o.status)) throw authError('permission-denied');
      Object.assign(o, {
        driverUid: driver.uid, driverName: driver.name, driverPhone: driver.phone, driverUsername: driver.username || null, claimedAt: Date.now(),
      });
      commit();
    },

    async releaseOrder(id) {
      Object.assign(db().orders[id], { driverUid: null, driverName: null, driverPhone: null, driverUsername: null, claimedAt: null });
      commit();
    },

    async setOrderStatus(id, status) {
      const o = db().orders[id];
      o.status = status;
      o.statusHistory = [...(o.statusHistory || []), { status, at: Date.now() }];
      commit();
    },
  };
}
