// باك إند Firebase: تسجيل الدخول (Authentication) وقاعدة البيانات اللحظية (Firestore).
// الحماية (مين يقرا/يكتب إيه) موجودة في firestore.rules.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { withDefaults } from '../finance.js';
import { normalizeUsername, normalizePhone, checkUsername, checkPhone, idError } from '../identity.js';
import {
  getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, updateProfile as updateAuthProfile, connectAuthEmulator,
  sendPasswordResetEmail, EmailAuthProvider, reauthenticateWithCredential, updatePassword,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  getFirestore, connectFirestoreEmulator, collection, doc, getDoc, getDocs, setDoc, addDoc,
  updateDoc, deleteDoc, onSnapshot, query, where, orderBy, limit, writeBatch, arrayUnion, arrayRemove, serverTimestamp,
  runTransaction, increment,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const toMillis = (t) => (t && typeof t.toMillis === 'function' ? t.toMillis() : typeof t === 'number' ? t : Date.now());
const withId = (snap) => ({ ...snap.data(), id: snap.id });
const toOrder = (snap) => {
  const o = withId(snap);
  o.createdAt = toMillis(o.createdAt);
  return o;
};
const withoutId = ({ id, ...rest }) => rest;
const CLAIMABLE = ['preparing', 'ready'];

export function createBackend(config, { useEmulators }) {
  const app = initializeApp(config);
  const auth = getAuth(app);
  auth.languageCode = 'ar'; // إيميلات Firebase (زي استرجاع كلمة السر) بالعربي
  const db = getFirestore(app);
  if (useEmulators) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
  }

  const users = collection(db, 'users');
  const restaurants = collection(db, 'restaurants');
  const orders = collection(db, 'orders');
  const settingsDoc = doc(db, 'settings', 'app');
  const applications = collection(db, 'applications');
  // مستند لكل اسم مستخدم ولكل رقم موبايل، عشان محدش ياخدهم مرتين
  const usernames = collection(db, 'usernames');
  const phones = collection(db, 'phones');
  const tickets = collection(db, 'tickets');
  // كوبونات الخصم: المستند اسمه هو الكود نفسه، ومحدش يقدر يجيب لستة الأكواد غير الأدمن
  const coupons = collection(db, 'coupons');
  // couponUses/{uid}/codes/{code}: العميل استخدم الكوبون ده (للكوبونات اللي مرة واحدة لكل عميل)
  const couponUse = (uid, code) => doc(db, 'couponUses', uid, 'codes', code);
  // driverLoads/{uid}: الأوردرات اللي مع المندوب دلوقتي، والقواعد بتمنعه يزود عن الحد اللي الأدمن حدده
  const driverLoads = collection(db, 'driverLoads');
  const FINAL = ['delivered', 'cancelled', 'rejected'];

  // بيشيل الأوردر من لستة المندوب في نفس العملية (لو موجود فيها)
  async function unload(batch, uid, orderId) {
    if (!uid) return;
    const load = await getDoc(doc(driverLoads, uid));
    if (load.exists() && (load.data().orders || []).includes(orderId)) {
      batch.update(load.ref, { orders: arrayRemove(orderId) });
    }
  }
  const message = (by, name, text) => ({ by, name, text, at: Date.now() });

  // بيرجّع الأوردرات اللي المندوب ماستلمهاش لسه لباقي المندوبين
  async function releaseDriverOrders(batch, uid) {
    const snap = await getDocs(query(orders, where('driverUid', '==', uid)));
    snap.docs.filter((d) => CLAIMABLE.includes(d.data().status)).forEach((d) => batch.update(d.ref, {
      driverUid: null, driverName: null, driverPhone: null, driverUsername: null, claimedAt: null,
    }));
  }
  let signingUp = false;

  const logError = (cb, fallback) => (err) => {
    console.error(err);
    cb(fallback);
  };

  // بيتأكد إن اسم المستخدم والرقم مش محجوزين لحد تاني
  async function checkFree(username, phone, uid) {
    const [u, p] = await Promise.all([getDoc(doc(usernames, username)), phone ? getDoc(doc(phones, phone)) : null]);
    if (u.exists() && u.data().uid !== uid) throw idError('username-taken');
    if (p?.exists() && p.data().uid !== uid) throw idError('phone-taken');
    return { usernameMine: u.exists(), phoneMine: Boolean(p?.exists()) };
  }

  return {
    // بيرجّع بيانات المستخدم من مستند users/{uid} (الاسم، الدور، المطعم...) ويتابع تغييراتها
    onAuth(cb) {
      let unsubUser = null;
      const unsubAuth = onAuthStateChanged(auth, (user) => {
        if (unsubUser) unsubUser();
        unsubUser = null;
        if (!user) return cb(null);
        const base = {
          uid: user.uid, email: (user.email || '').toLowerCase(), name: user.displayName || '',
          phone: '', address: '', role: 'customer', restaurantId: null,
        };
        unsubUser = onSnapshot(doc(users, user.uid), (snap) => {
          if (snap.exists()) return cb({ ...base, ...snap.data(), uid: user.uid });
          // حساب من غير مستند (مثلاً اتعمل من الكونسول): نعمله مستند عميل
          if (!signingUp) {
            setDoc(snap.ref, { email: base.email, name: base.name, phone: '', address: '', role: 'customer', restaurantId: null, createdAt: serverTimestamp() })
              .catch(console.error);
          }
          cb(base);
        }, logError(cb, base));
      });
      return () => {
        unsubAuth();
        if (unsubUser) unsubUser();
      };
    },

    async signUp({ name, email, password, phone, username }) {
      username = normalizeUsername(username);
      phone = normalizePhone(phone);
      checkUsername(username);
      checkPhone(phone);
      await checkFree(username, phone, null);
      signingUp = true;
      let user = null;
      try {
        ({ user } = await createUserWithEmailAndPassword(auth, email.trim(), password));
        await updateAuthProfile(user, { displayName: name });
        const batch = writeBatch(db);
        batch.set(doc(users, user.uid), {
          email: (user.email || '').toLowerCase(), name, phone, username, address: '',
          role: 'customer', restaurantId: null, createdAt: serverTimestamp(),
        });
        batch.set(doc(usernames, username), { uid: user.uid });
        batch.set(doc(phones, phone), { uid: user.uid });
        await batch.commit();
      } catch (err) {
        // حد سبقه للاسم أو الرقم في نفس اللحظة: نمسح الحساب اللي لسه اتعمل
        if (user) {
          await user.delete().catch(console.error);
          if (err.code === 'permission-denied') throw idError('username-taken');
        }
        throw err;
      } finally {
        signingUp = false;
      }
    },

    // للحسابات القديمة اللي اتعملت قبل أسماء المستخدمين، أو لتغيير الرقم
    async claimIdentity(user, { username, phone }) {
      username = normalizeUsername(username || user.username);
      phone = normalizePhone(phone);
      checkUsername(username);
      checkPhone(phone);
      if (user.username && username !== user.username) throw idError('username-locked');
      const { usernameMine, phoneMine } = await checkFree(username, phone, user.uid);
      const batch = writeBatch(db);
      batch.update(doc(users, user.uid), { username, phone });
      if (!usernameMine) batch.set(doc(usernames, username), { uid: user.uid });
      if (!phoneMine) batch.set(doc(phones, phone), { uid: user.uid });
      if (user.phone && user.phone !== phone) {
        const old = await getDoc(doc(phones, user.phone));
        if (old.exists() && old.data().uid === user.uid) batch.delete(old.ref);
      }
      await batch.commit();
    },

    async signIn(email, password) {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    },

    signOut: () => signOut(auth),

    // نسيت كلمة السر: Firebase بيبعت لينك على الإيميل
    resetPassword: (email) => sendPasswordResetEmail(auth, email.trim()),

    // تغيير كلمة السر وهو داخل: لازم يأكد بكلمة السر القديمة الأول
    async changePassword(current, next) {
      const user = auth.currentUser;
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, current));
      await updatePassword(user, next);
    },

    // الرقم بيتغير من claimIdentity بس (عشان يفضل مش متكرر)
    async updateProfile(uid, { name, address, location }) {
      await updateDoc(doc(users, uid), { name, address, location: location ?? null });
    },

    // بالإيميل أو اسم المستخدم (@ahmed) أو رقم الموبايل
    async findUser(identifier) {
      const id = String(identifier || '').trim();
      let snap;
      if (id.includes('@') && !id.startsWith('@')) {
        snap = await getDocs(query(users, where('email', '==', id.toLowerCase()), limit(1)));
      } else if (/^[0-9٠-٩+]/.test(id)) {
        snap = await getDocs(query(users, where('phone', '==', normalizePhone(id)), limit(1)));
      } else {
        snap = await getDocs(query(users, where('username', '==', normalizeUsername(id)), limit(1)));
      }
      return snap.empty ? null : { ...snap.docs[0].data(), uid: snap.docs[0].id };
    },

    watchUsers(cb) {
      return onSnapshot(users, (s) => cb(s.docs.map((d) => ({ ...d.data(), uid: d.id }))), logError(cb, []));
    },

    watchRestaurants(cb) {
      return onSnapshot(restaurants, (s) => cb(s.docs.map(withId)), logError(cb, []));
    },

    watchRestaurant(id, cb) {
      return onSnapshot(doc(restaurants, id), (s) => cb(s.exists() ? withId(s) : null), logError(cb, null));
    },

    async createRestaurant(data, id) {
      if (id) {
        await setDoc(doc(restaurants, id), withoutId(data));
        return id;
      }
      return (await addDoc(restaurants, withoutId(data))).id;
    },

    updateRestaurant: (id, data) => updateDoc(doc(restaurants, id), withoutId(data)),

    deleteRestaurant: (id) => deleteDoc(doc(restaurants, id)),

    // يربط حساب بمطعم كصاحبه، ويفك ربط صاحبه القديم
    async assignOwner(restaurantId, user) {
      const batch = writeBatch(db);
      const r = (await getDoc(doc(restaurants, restaurantId))).data();
      if (r.ownerUid && r.ownerUid !== user.uid) {
        const old = await getDoc(doc(users, r.ownerUid));
        if (old.exists()) {
          batch.update(old.ref, { restaurantId: null, role: old.data().role === 'restaurant' ? 'customer' : old.data().role });
        }
      }
      if (user.restaurantId && user.restaurantId !== restaurantId) {
        const prev = await getDoc(doc(restaurants, user.restaurantId));
        if (prev.exists()) batch.update(prev.ref, { ownerUid: null, ownerEmail: null });
      }
      batch.update(doc(restaurants, restaurantId), { ownerUid: user.uid, ownerEmail: user.email, ownerUsername: user.username || null });
      batch.update(doc(users, user.uid), { restaurantId, role: user.role === 'admin' ? 'admin' : 'restaurant' });
      await batch.commit();
    },

    watchSettings(cb) {
      return onSnapshot(settingsDoc, (s) => cb({ ...withDefaults(s.data()), exists: s.exists() }), logError(cb, withDefaults()));
    },

    saveSettings: (settings) => setDoc(settingsDoc, {
      zones: settings.zones, rates: settings.rates, supportPhone: settings.supportPhone || '',
      couponsPerOrder: Number(settings.couponsPerOrder) || 0,
        maxDriverOrders: Number(settings.maxDriverOrders) || 0,
    }),

    // ---------- الكوبونات ----------
    async getCoupon(code) {
      if (!code) return null;
      const s = await getDoc(doc(coupons, code));
      return s.exists() ? { ...s.data(), code: s.id } : null;
    },

    async hasUsedCoupon(uid, code) {
      return (await getDoc(couponUse(uid, code))).exists();
    },

    watchCoupons(cb) {
      return onSnapshot(coupons, (s) => cb(s.docs.map((d) => ({ ...d.data(), code: d.id }))
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))), logError(cb, []));
    },

    // isNew: كوبون جديد (لو الكود موجود قبل كده بيرجع خطأ)، غير كده تعديل من غير ما نلمس عدد الاستخدام
    async saveCoupon(coupon, isNew) {
      const { code, used, createdAt, lastOrder, ...data } = coupon;
      const ref = doc(coupons, code);
      if (isNew) {
        if ((await getDoc(ref)).exists()) throw Object.assign(new Error('exists'), { code: 'coupon-exists' });
        return setDoc(ref, { ...data, used: 0, createdAt: Date.now() });
      }
      return updateDoc(ref, data);
    },

    deleteCoupon: (code) => deleteDoc(doc(coupons, code)),

    watchUsersByRole(role, cb) {
      return onSnapshot(query(users, where('role', '==', role)),
        (s) => cb(s.docs.map((d) => ({ ...d.data(), uid: d.id }))), logError(cb, []));
    },

    setUserRole: (uid, role) => updateDoc(doc(users, uid), { role, restaurantId: null }),

    // طلبات الانضمام كمندوب أو مطعم (مستند واحد لكل مستخدم)
    submitApplication: (user, data) => setDoc(doc(applications, user.uid), {
      ...data, uid: user.uid, email: user.email, username: user.username || null, status: 'pending', createdAt: Date.now(),
    }),

    watchMyApplication(uid, cb) {
      return onSnapshot(doc(applications, uid), (s) => cb(s.exists() ? s.data() : null), logError(cb, null));
    },

    watchApplications(cb) {
      return onSnapshot(query(applications, where('status', '==', 'pending')),
        (s) => cb(s.docs.map((d) => d.data()).sort((a, b) => b.createdAt - a.createdAt)), logError(cb, []));
    },

    // reviewer = اسم مستخدم الأدمن أو الموظف اللي راجع الطلب
    approveDriver(uid, reviewer = null) {
      const batch = writeBatch(db);
      batch.update(doc(users, uid), { role: 'driver', restaurantId: null });
      batch.update(doc(applications, uid), { status: 'approved', reviewedAt: Date.now(), reviewedBy: reviewer });
      return batch.commit();
    },

    // بيعمل المطعم ويربطه بصاحب الطلب في خطوة واحدة
    async approveRestaurant(uid, restaurant, reviewer = null) {
      const user = (await getDoc(doc(users, uid))).data();
      const ref = doc(restaurants);
      const batch = writeBatch(db);
      batch.set(ref, { ...withoutId(restaurant), ownerUid: uid, ownerEmail: user.email, ownerUsername: user.username || null });
      batch.update(doc(users, uid), { role: 'restaurant', restaurantId: ref.id });
      batch.update(doc(applications, uid), { status: 'approved', reviewedAt: Date.now(), reviewedBy: reviewer });
      await batch.commit();
      return ref.id;
    },

    rejectApplication: (uid, reviewer = null) => updateDoc(doc(applications, uid), { status: 'rejected', reviewedAt: Date.now(), reviewedBy: reviewer }),

    // ---------- خدمة العملاء ----------
    async createTicket(user, { topic, subject, text, orderId }) {
      const now = Date.now();
      const ref = await addDoc(tickets, {
        uid: user.uid, name: user.name, username: user.username || null, role: user.role, phone: user.phone || '',
        topic, subject, orderId: orderId || null, status: 'open', lastBy: 'user',
        createdAt: now, updatedAt: now, messages: [message(user.uid, user.name, text)],
      });
      return ref.id;
    },

    replyTicket: (id, user, text) => updateDoc(doc(tickets, id), {
      messages: arrayUnion(message(user.uid, user.name, text)), updatedAt: Date.now(), lastBy: 'user', status: 'open',
    }),

    adminReplyTicket: (id, admin, text) => updateDoc(doc(tickets, id), {
      messages: arrayUnion(message('admin', admin.name, text)), updatedAt: Date.now(), lastBy: 'admin',
    }),

    setTicketStatus: (id, status) => updateDoc(doc(tickets, id), { status, updatedAt: Date.now() }),

    watchMyTickets(uid, cb) {
      return onSnapshot(query(tickets, where('uid', '==', uid)),
        (s) => cb(s.docs.map(withId).sort((a, b) => b.updatedAt - a.updatedAt)), logError(cb, []));
    },

    watchAllTickets(cb) {
      return onSnapshot(query(tickets, orderBy('updatedAt', 'desc'), limit(300)), (s) => cb(s.docs.map(withId)), logError(cb, []));
    },

    // ---------- الحظر والحذف (للأدمن) ----------
    async setBanned(user, banned, reason = '') {
      const batch = writeBatch(db);
      batch.update(doc(users, user.uid), { banned, bannedReason: banned ? reason : null });
      if (banned && user.role === 'driver') await releaseDriverOrders(batch, user.uid);
      if (banned && user.restaurantId) batch.update(doc(restaurants, user.restaurantId), { blocked: true, isOpen: false });
      if (!banned && user.restaurantId) batch.update(doc(restaurants, user.restaurantId), { blocked: false });
      await batch.commit();
    },

    // Firebase مش بيسمح بمسح حساب الدخول نفسه من المتصفح، فبنمسح بياناته ونقفله،
    // ونفك اسم المستخدم والرقم عشان حد تاني يقدر ياخدهم
    async deleteAccount(user) {
      const batch = writeBatch(db);
      batch.update(doc(users, user.uid), {
        deleted: true, banned: true, name: 'حساب محذوف', phone: '', address: '', location: null,
        username: null, deletedUsername: user.username || null, role: 'customer', restaurantId: null,
      });
      if (user.username) batch.delete(doc(usernames, user.username));
      if (user.phone) batch.delete(doc(phones, user.phone));
      if (user.role === 'driver') await releaseDriverOrders(batch, user.uid);
      if (user.restaurantId) {
        batch.update(doc(restaurants, user.restaurantId), { ownerUid: null, ownerEmail: null, ownerUsername: null, isOpen: false });
      }
      const app = await getDoc(doc(applications, user.uid));
      if (app.exists()) batch.delete(app.ref);
      await batch.commit();
    },

    setRestaurantBlocked: (id, blocked) => updateDoc(doc(restaurants, id), blocked ? { blocked: true, isOpen: false } : { blocked: false }),

    // الطلب وعداد استخدام الكوبونات بيتسجلوا مع بعض (batch)، والقواعد بتتأكد إن الكوبون صالح
    async createOrder(order, usedCoupons = []) {
      const ref = doc(orders);
      const batch = writeBatch(db);
      batch.set(ref, { ...order, createdAt: serverTimestamp() });
      usedCoupons.forEach((c) => {
        batch.update(doc(coupons, c.code), { used: increment(1), lastOrder: ref.id });
        if (c.onePerCustomer) batch.set(couponUse(order.customerUid, c.code), { orderId: ref.id, at: Date.now() });
      });
      await batch.commit();
      return ref.id;
    },

    watchOrder(id, cb) {
      return onSnapshot(doc(orders, id), (s) => cb(s.exists() ? toOrder(s) : null), logError(cb, null));
    },

    // filter: { customerUid } أو { ownerUid } أو { driverUid } أو {} لكل الطلبات (للأدمن)
    watchOrders(filter, cb) {
      const q = filter.customerUid ? query(orders, where('customerUid', '==', filter.customerUid))
        : filter.ownerUid ? query(orders, where('ownerUid', '==', filter.ownerUid))
          : filter.driverUid ? query(orders, where('driverUid', '==', filter.driverUid))
            : query(orders, orderBy('createdAt', 'desc'), limit(1000));
      return onSnapshot(q, (s) => cb(s.docs.map(toOrder).sort((a, b) => b.createdAt - a.createdAt)), logError(cb, []));
    },

    // الأوردرات اللي مستنية مندوب (بتتجهز أو جاهزة ومحدش أخدها)
    watchAvailableOrders(cb) {
      const q = query(orders, where('driverUid', '==', null), where('status', 'in', CLAIMABLE));
      return onSnapshot(q, (s) => cb(s.docs.map(toOrder).sort((a, b) => b.createdAt - a.createdAt)), logError(cb, []));
    },

    // transaction عشان مندوبين اتنين ميخدوش نفس الأوردر، والمندوب ميزودش عن max أوردر معاه
    claimOrder(id, driver, max = 0) {
      return runTransaction(db, async (tx) => {
        const ref = doc(orders, id);
        const loadRef = doc(driverLoads, driver.uid);
        const o = (await tx.get(ref)).data();
        const load = (await tx.get(loadRef)).data()?.orders || [];
        if (!o || o.driverUid || !CLAIMABLE.includes(o.status)) {
          throw Object.assign(new Error('taken'), { code: 'order-taken' });
        }
        if (max > 0 && load.length >= max) throw Object.assign(new Error('limit'), { code: 'driver-limit' });
        tx.update(ref, {
          driverUid: driver.uid, driverName: driver.name, driverPhone: driver.phone,
          driverUsername: driver.username || null, claimedAt: Date.now(),
        });
        tx.set(loadRef, { orders: [...load, id] });
      });
    },

    async releaseOrder(id, driverUid) {
      const batch = writeBatch(db);
      batch.update(doc(orders, id), {
        driverUid: null, driverName: null, driverPhone: null, driverUsername: null, claimedAt: null,
      });
      await unload(batch, driverUid, id);
      return batch.commit();
    },

    // driverUid: لما المندوب يسلّم الأوردر، بيتشال من لستته في نفس العملية
    async setOrderStatus(id, status, { driverUid } = {}) {
      const batch = writeBatch(db);
      batch.update(doc(orders, id), {
        status,
        statusHistory: arrayUnion({ status, at: Date.now() }),
        updatedAt: serverTimestamp(),
      });
      if (FINAL.includes(status)) await unload(batch, driverUid, id);
      return batch.commit();
    },

    // بيصلّح لستة المندوب: يشيل الأوردرات اللي خلصت أو اتلغت أو راحت لمندوب تاني (مثلًا الأدمن غيّرها)،
    // ويضيف أوردرات معاه مش متسجلة (من قبل الميزة دي). كل تغيير في عملية لوحده عشان القواعد بتتأكد منه.
    async syncDriverLoad(uid, activeIds) {
      const ref = doc(driverLoads, uid);
      const snap = await getDoc(ref);
      const load = snap.exists() ? snap.data().orders || [] : [];
      for (const id of load.filter((x) => !activeIds.includes(x))) {
        let stale = true;
        try {
          const o = await getDoc(doc(orders, id));
          stale = !o.exists() || o.data().driverUid !== uid || FINAL.includes(o.data().status);
        } catch { /* مش قادر يقراه = مبقاش بتاعه */ }
        if (stale) await updateDoc(ref, { orders: arrayRemove(id) }).catch(() => {});
      }
      for (const id of activeIds.filter((x) => !load.includes(x))) {
        await setDoc(ref, { orders: arrayUnion(id) }, { merge: true }).catch(() => {});
      }
    },
  };
}
