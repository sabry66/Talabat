// الوضع التجريبي: قاعدة بيانات وهمية في localStorage بنفس واجهة باك إند Firebase.
// البيانات بتتزامن بين التابات، والدخول لكل تاب لوحده: تقدر تفتح التطبيق كعميل في تاب
// ولوحة المطعم كصاحب مطعم في تاب تاني.
import { SEED_RESTAURANTS, DEFAULT_SETTINGS, SAMPLE_ZONES } from '../data.js';
import { withDefaults } from '../finance.js';

const DB_KEY = 'arrivo_demo_db_v1';
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
  const user = (uid, email, name, role, restaurantId = null) =>
    ({ uid, email, password: '123456', name, phone: '01000000000', address: '', role, restaurantId });
  const users = {
    'u-admin': user('u-admin', 'admin@demo.com', 'مدير التطبيق', 'admin'),
    'u-owner': user('u-owner', 'owner@demo.com', 'صاحب بيت البرجر', 'restaurant', 'burger-house'),
    'u-customer': user('u-customer', 'customer@demo.com', 'عميل تجريبي', 'customer'),
    'u-driver': user('u-driver', 'driver@demo.com', 'مندوب تجريبي', 'driver'),
  };
  const restaurants = {};
  for (const r of SEED_RESTAURANTS) {
    const owned = r.id === 'burger-house';
    restaurants[r.id] = { ...clone(r), isOpen: true, ownerUid: owned ? 'u-owner' : null, ownerEmail: owned ? 'owner@demo.com' : null };
  }
  const settings = { ...clone(DEFAULT_SETTINGS), zones: clone(SAMPLE_ZONES) };
  return { users, restaurants, orders: {}, settings, applications: {} };
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

export function createBackend() {
  return {
    onAuth(cb) {
      return watch(() => publicUser(db().users[session.get()]), cb);
    },

    async signUp({ name, email, password, phone }) {
      email = email.trim().toLowerCase();
      if (!/^\S+@\S+\.\S+$/.test(email)) throw authError('auth/invalid-email');
      if (password.length < 6) throw authError('auth/weak-password');
      if (Object.values(db().users).some((u) => u.email === email)) throw authError('auth/email-already-in-use');
      const uid = 'u-' + newId();
      db().users[uid] = { uid, email, password, name, phone, address: '', role: 'customer', restaurantId: null };
      session.set(uid);
      commit();
    },

    async signIn(email, password) {
      email = email.trim().toLowerCase();
      const u = Object.values(db().users).find((x) => x.email === email && x.password === password);
      if (!u) throw authError('auth/invalid-credential');
      session.set(u.uid);
      commit();
    },

    async signOut() {
      session.clear();
      commit();
    },

    async updateProfile(uid, { name, phone, address, location }) {
      Object.assign(db().users[uid], clone({ name, phone, address, location: location ?? null }));
      commit();
    },

    async findUserByEmail(email) {
      email = email.trim().toLowerCase();
      return clone(publicUser(Object.values(db().users).find((u) => u.email === email)));
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
      Object.assign(r, { ownerUid: u.uid, ownerEmail: u.email });
      Object.assign(u, { restaurantId, role: u.role === 'admin' ? 'admin' : 'restaurant' });
      commit();
    },

    watchSettings(cb) {
      return watch(() => withDefaults(db().settings), cb);
    },

    async saveSettings(settings) {
      db().settings = clone(settings);
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
      db().applications[user.uid] = { ...clone(data), uid: user.uid, email: user.email, status: 'pending', createdAt: Date.now() };
      commit();
    },

    watchMyApplication(uid, cb) {
      return watch(() => (db().applications || {})[uid] || null, cb);
    },

    watchApplications(cb) {
      return watch(() => sortByNewest(Object.values(db().applications || {}).filter((a) => a.status === 'pending')), cb);
    },

    async approveDriver(uid) {
      Object.assign(db().users[uid], { role: 'driver', restaurantId: null });
      Object.assign(db().applications[uid], { status: 'approved', reviewedAt: Date.now() });
      commit();
    },

    async approveRestaurant(uid, restaurant) {
      const d = db();
      const id = 'r-' + newId();
      d.restaurants[id] = { ...clone(restaurant), id, ownerUid: uid, ownerEmail: d.users[uid].email };
      Object.assign(d.users[uid], { role: 'restaurant', restaurantId: id });
      Object.assign(d.applications[uid], { status: 'approved', reviewedAt: Date.now() });
      commit();
      return id;
    },

    async rejectApplication(uid) {
      Object.assign(db().applications[uid], { status: 'rejected', reviewedAt: Date.now() });
      commit();
    },

    async createOrder(order) {
      const id = newId();
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
      Object.assign(o, { driverUid: driver.uid, driverName: driver.name, driverPhone: driver.phone, claimedAt: Date.now() });
      commit();
    },

    async releaseOrder(id) {
      Object.assign(db().orders[id], { driverUid: null, driverName: null, driverPhone: null, claimedAt: null });
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
