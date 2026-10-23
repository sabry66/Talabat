// بيختار الباك إند: Firebase لو الإعدادات موجودة، وإلا الوضع التجريبي المحلي.
// الاتنين ليهم نفس الواجهة (onAuth, watchRestaurants, createOrder, ...).
import * as cfg from '../firebase-config.js';

const { firebaseConfig, useEmulators } = cfg;

export const isDemo = !firebaseConfig.apiKey;

const mod = isDemo ? await import('./local.js') : await import('./firebase.js');
// pushVapidKey اختياري (الإشعارات والتطبيق مقفول)، فبنقراه كده عشان لو مش موجود في الملف
export const backend = mod.createBackend(firebaseConfig, {
  useEmulators, pushVapidKey: cfg.pushVapidKey || '', phoneLogin: Boolean(cfg.phoneLogin),
});
