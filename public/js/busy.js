// وضع الزحمة: المطعم بيزوّد وقت التحضير لمدة ساعة بضغطة، والعملاء بيشوفوا الوقت الحقيقي
export const BUSY_OPTIONS = [15, 30, 45];
export const BUSY_FOR = 60 * 60 * 1000; // ساعة، وبعدها بيرجع لوحده

export const busyExtra = (r, now = Date.now()) => (r?.busy && Number(r.busy.until) > now
  ? Math.min(60, Math.max(0, Number(r.busy.extra) || 0)) : 0);

// وقت التوصيل [من، إلى] بالدقايق بعد زيادة الزحمة
export const restTime = (r) => {
  const e = busyExtra(r);
  return [Number(r.time?.[0]) + e, Number(r.time?.[1]) + e];
};
