// باك إند Firebase: تسجيل الدخول (Authentication) وقاعدة البيانات اللحظية (Firestore).
// الحماية (مين يقرا/يكتب إيه) موجودة في firestore.rules.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { withDefaults } from '../finance.js';
import {
  getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, updateProfile as updateAuthProfile, connectAuthEmulator,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  getFirestore, connectFirestoreEmulator, collection, doc, getDoc, getDocs, setDoc, addDoc,
  updateDoc, deleteDoc, onSnapshot, query, where, orderBy, limit, writeBatch, arrayUnion, serverTimestamp,
  runTransaction,
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
  let signingUp = false;

  const logError = (cb, fallback) => (err) => {
    console.error(err);
    cb(fallback);
  };

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

    async signUp({ name, email, password, phone }) {
      signingUp = true;
      try {
        const { user } = await createUserWithEmailAndPassword(auth, email.trim(), password);
        await updateAuthProfile(user, { displayName: name });
        await setDoc(doc(users, user.uid), {
          email: (user.email || '').toLowerCase(), name, phone, address: '',
          role: 'customer', restaurantId: null, createdAt: serverTimestamp(),
        });
      } finally {
        signingUp = false;
      }
    },

    async signIn(email, password) {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    },

    signOut: () => signOut(auth),

    async updateProfile(uid, { name, phone, address, location }) {
      await updateDoc(doc(users, uid), { name, phone, address, location: location ?? null });
    },

    async findUserByEmail(email) {
      const snap = await getDocs(query(users, where('email', '==', email.trim().toLowerCase()), limit(1)));
      return snap.empty ? null : { ...snap.docs[0].data(), uid: snap.docs[0].id };
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
      batch.update(doc(restaurants, restaurantId), { ownerUid: user.uid, ownerEmail: user.email });
      batch.update(doc(users, user.uid), { restaurantId, role: user.role === 'admin' ? 'admin' : 'restaurant' });
      await batch.commit();
    },

    watchSettings(cb) {
      return onSnapshot(settingsDoc, (s) => cb({ ...withDefaults(s.data()), exists: s.exists() }), logError(cb, withDefaults()));
    },

    saveSettings: (settings) => setDoc(settingsDoc, { zones: settings.zones, rates: settings.rates }),

    watchUsersByRole(role, cb) {
      return onSnapshot(query(users, where('role', '==', role)),
        (s) => cb(s.docs.map((d) => ({ ...d.data(), uid: d.id }))), logError(cb, []));
    },

    setUserRole: (uid, role) => updateDoc(doc(users, uid), { role, restaurantId: null }),

    // طلبات الانضمام كمندوب أو مطعم (مستند واحد لكل مستخدم)
    submitApplication: (user, data) => setDoc(doc(applications, user.uid), {
      ...data, uid: user.uid, email: user.email, status: 'pending', createdAt: Date.now(),
    }),

    watchMyApplication(uid, cb) {
      return onSnapshot(doc(applications, uid), (s) => cb(s.exists() ? s.data() : null), logError(cb, null));
    },

    watchApplications(cb) {
      return onSnapshot(query(applications, where('status', '==', 'pending')),
        (s) => cb(s.docs.map((d) => d.data()).sort((a, b) => b.createdAt - a.createdAt)), logError(cb, []));
    },

    approveDriver(uid) {
      const batch = writeBatch(db);
      batch.update(doc(users, uid), { role: 'driver', restaurantId: null });
      batch.update(doc(applications, uid), { status: 'approved', reviewedAt: Date.now() });
      return batch.commit();
    },

    // بيعمل المطعم ويربطه بصاحب الطلب في خطوة واحدة
    async approveRestaurant(uid, restaurant) {
      const user = (await getDoc(doc(users, uid))).data();
      const ref = doc(restaurants);
      const batch = writeBatch(db);
      batch.set(ref, { ...withoutId(restaurant), ownerUid: uid, ownerEmail: user.email });
      batch.update(doc(users, uid), { role: 'restaurant', restaurantId: ref.id });
      batch.update(doc(applications, uid), { status: 'approved', reviewedAt: Date.now() });
      await batch.commit();
      return ref.id;
    },

    rejectApplication: (uid) => updateDoc(doc(applications, uid), { status: 'rejected', reviewedAt: Date.now() }),

    async createOrder(order) {
      return (await addDoc(orders, { ...order, createdAt: serverTimestamp() })).id;
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

    // transaction عشان مندوبين اتنين ميخدوش نفس الأوردر
    claimOrder(id, driver) {
      return runTransaction(db, async (tx) => {
        const ref = doc(orders, id);
        const o = (await tx.get(ref)).data();
        if (!o || o.driverUid || !CLAIMABLE.includes(o.status)) {
          throw Object.assign(new Error('taken'), { code: 'order-taken' });
        }
        tx.update(ref, { driverUid: driver.uid, driverName: driver.name, driverPhone: driver.phone, claimedAt: Date.now() });
      });
    },

    releaseOrder: (id) => updateDoc(doc(orders, id), { driverUid: null, driverName: null, driverPhone: null, claimedAt: null }),

    setOrderStatus(id, status) {
      return updateDoc(doc(orders, id), {
        status,
        statusHistory: arrayUnion({ status, at: Date.now() }),
        updatedAt: serverTimestamp(),
      });
    },
  };
}
