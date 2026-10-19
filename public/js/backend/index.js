// بيختار الباك إند: Firebase لو الإعدادات موجودة، وإلا الوضع التجريبي المحلي.
// الاتنين ليهم نفس الواجهة (onAuth, watchRestaurants, createOrder, ...).
import { firebaseConfig, useEmulators } from '../firebase-config.js';

export const isDemo = !firebaseConfig.apiKey;

const mod = isDemo ? await import('./local.js') : await import('./firebase.js');
export const backend = mod.createBackend(firebaseConfig, { useEmulators });
