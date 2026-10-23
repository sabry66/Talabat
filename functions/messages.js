// مين يوصله إشعار ولما إيه يحصل في الطلب (من غير Firebase، عشان يتجرب لوحده)
// كل رسالة: { to: { uid } أو { drivers: true }, title, body, url, tag, urgent }

const CUSTOMER_STATUS = {
  preparing: '👨‍🍳 المطعم قبل طلبك وبيجهّزه',
  ready: '📦 طلبك جاهز في المطعم',
  on_way: '🛵 طلبك مع المندوب في الطريق ليك',
  delivered: '✅ طلبك وصل، بالهنا والشفا. متنساش تقيّمه ⭐',
  cancelled: '❌ الطلب اتلغى',
  rejected: '🚫 المطعم اعتذر عن طلبك. جرّب مطعم تاني',
};
const WAITING_DRIVER = ['preparing', 'ready'];
const short = (id) => String(id || '').slice(-6).toUpperCase();
const money = (n) => `${Math.round(Number(n) || 0)} ج.م`;

export function orderMessages(before, after, id) {
  if (!after) return [];
  const out = [];
  const orderUrl = `/#/order/${id}`;
  const rest = after.restaurantName || 'المطعم';
  const tag = `order-${id}`;
  const toCustomer = (body, urgent = false) => after.customerUid && out.push({ to: { uid: after.customerUid }, title: `طلبك من ${rest}`, body, url: orderUrl, tag, urgent });

  // طلب جديد: صاحب المطعم
  if (!before) {
    if (after.ownerUid) {
      out.push({
        to: { uid: after.ownerUid }, title: '🔔 طلب جديد', urgent: true, tag: `new-${id}`,
        body: after.scheduledFor
          ? `طلب مجدول #${short(id)} بـ ${money(after.totals?.subtotal)}، شوف ميعاده واقبله`
          : `طلب #${short(id)} بـ ${money(after.totals?.subtotal)}، اقبله بسرعة`,
        url: '/restaurant.html',
      });
    }
    return out;
  }

  const statusChanged = before.status !== after.status;
  if (statusChanged && CUSTOMER_STATUS[after.status]) toCustomer(CUSTOMER_STATUS[after.status], after.status === 'on_way');

  // العميل لغى: المطعم والمندوب يعرفوا
  if (statusChanged && after.status === 'cancelled') {
    [after.ownerUid, before.driverUid].filter(Boolean).forEach((uid) => out.push({
      to: { uid }, title: '❌ طلب اتلغى', body: `طلب #${short(id)} من ${rest} اتلغى`, tag: `cancel-${id}`,
      url: uid === after.ownerUid ? '/restaurant.html' : '/delivery.html',
    }));
  }

  // المندوب
  const was = before.driverUid || null;
  const now = after.driverUid || null;
  if (was !== now && !['delivered', 'cancelled', 'rejected'].includes(after.status)) {
    if (!was && now) toCustomer(`🛵 ${after.driverName || 'مندوب'} مسك طلبك`);
    else if (was && !now) toCustomer('🔄 المندوب اعتذر عن طلبك، وبندوّر على مندوب تاني دلوقتي', true);
    else toCustomer(`🔄 طلبك اتنقل لمندوب جديد: ${after.driverName || ''}`, true);
  }

  // أوردر بقى مستني مندوب (المطعم قبله، أو المندوب رجّعه)
  const waitingNow = WAITING_DRIVER.includes(after.status) && !now;
  const waitingBefore = WAITING_DRIVER.includes(before.status) && !was;
  if (waitingNow && !waitingBefore) {
    out.push({
      to: { drivers: true }, title: '🛵 أوردر جديد متاح', urgent: true, tag: 'available', url: '/delivery.html',
      body: `${rest} → ${after.zoneName || ''}. الحق خده`,
    });
  }

  // المطعم: المندوب جاي يستلم
  if (!was && now && after.ownerUid) {
    out.push({ to: { uid: after.ownerUid }, title: '🛵 مندوب جاي يستلم', body: `${after.driverName || 'مندوب'} مسك طلب #${short(id)}`, tag: `drv-${id}`, url: '/restaurant.html' });
  }
  return out;
}
