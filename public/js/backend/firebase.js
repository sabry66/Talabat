// باك إند Firebase: تسجيل الدخول (Authentication) وقاعدة البيانات اللحظية (Firestore).
// الحماية (مين يقرا/يكتب إيه) موجودة في firestore.rules.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, updateProfile as updateAuthProfile, connectAuthEmulator,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  getFirestore, connectFirestoreEmulator, collection, doc, getDoc, getDocs, setDoc, addDoc,
  updateDoc, deleteDoc, onSnapshot, query, where, orderBy, limit, writeBatch, arrayUnion, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const toMillis = (t) => (t && typeof t.toMillis === 'function' ? t.toMillis() : typeof t === 'number' ? t : Date.now());
const withId = (snap) => ({ ...snap.data(), id: snap.id });
const toOrder = (snap) => {
  const o = withId(snap);
  o.createdAt = toMillis(o.createdAt);
  return o;
};
const withoutId = ({ id, ...rest }) => rest;

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

    async createOrder(order) {
      return (await addDoc(orders, { ...order, createdAt: serverTimestamp() })).id;
    },

    watchOrder(id, cb) {
      return onSnapshot(doc(orders, id), (s) => cb(s.exists() ? toOrder(s) : null), logError(cb, null));
    },

    // filter: { customerUid } أو { ownerUid } أو {} لكل الطلبات (للأدمن)
    watchOrders(filter, cb) {
      const q = filter.customerUid ? query(orders, where('customerUid', '==', filter.customerUid))
        : filter.ownerUid ? query(orders, where('ownerUid', '==', filter.ownerUid))
          : query(orders, orderBy('createdAt', 'desc'), limit(500));
      return onSnapshot(q, (s) => cb(s.docs.map(toOrder).sort((a, b) => b.createdAt - a.createdAt)), logError(cb, []));
    },

    setOrderStatus(id, status) {
      return updateDoc(doc(orders, id), {
        status,
        statusHistory: arrayUnion({ status, at: Date.now() }),
        updatedAt: serverTimestamp(),
      });
    },
  };
}
