// بيبعت إشعارات والتطبيق مقفول (Firebase Cloud Messaging) لما الطلب يتغير.
// محتاج خطة Blaze. النشر: شوف SETUP.md (firebase deploy --only functions --config firebase.functions.json)
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { orderMessages } from './messages.js';

initializeApp();
const db = getFirestore();

// أقرب منطقة لقاعدة البيانات (eur3 في أوروبا)
const REGION = 'europe-west1';

async function tokensFor(uids) {
  const tokens = new Map(); // token -> uid
  for (let i = 0; i < uids.length; i += 30) {
    const snap = await db.collection('pushTokens').where('uid', 'in', uids.slice(i, i + 30)).get();
    snap.forEach((d) => tokens.set(d.id, d.data().uid));
  }
  return tokens;
}

async function activeDrivers() {
  const snap = await db.collection('users').where('role', '==', 'driver').get();
  return snap.docs.filter((d) => !d.data().banned && !d.data().deleted).map((d) => d.id);
}

async function send(msg) {
  const uids = msg.to.drivers ? await activeDrivers() : [msg.to.uid];
  if (!uids.length) return;
  const tokens = await tokensFor(uids);
  if (!tokens.size) return;
  const list = [...tokens.keys()];
  const res = await getMessaging().sendEachForMulticast({
    tokens: list,
    // data بس، والـ service worker (public/sw.js) هو اللي بيعرض الإشعار
    data: { title: msg.title, body: msg.body, url: msg.url, tag: msg.tag || '', urgent: msg.urgent ? '1' : '0' },
    webpush: { headers: { Urgency: msg.urgent ? 'high' : 'normal', TTL: '1800' } },
  });
  // التوكنات اللي مبقتش شغالة (التطبيق اتمسح أو الإذن اتشال) نمسحها
  const dead = [];
  res.responses.forEach((r, i) => {
    const code = r.error?.code || '';
    if (code.includes('registration-token-not-registered') || code.includes('invalid-registration-token') || code.includes('invalid-argument')) dead.push(list[i]);
  });
  await Promise.all(dead.map((t) => db.collection('pushTokens').doc(t).delete().catch(() => {})));
}

export const orderPush = onDocumentWritten({ document: 'orders/{orderId}', region: REGION }, async (event) => {
  const before = event.data?.before?.exists ? event.data.before.data() : null;
  const after = event.data?.after?.exists ? event.data.after.data() : null;
  const messages = orderMessages(before, after, event.params.orderId);
  await Promise.all(messages.map((m) => send(m).catch((err) => console.error('push', err))));
});

