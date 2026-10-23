// العناوين المحفوظة للعميل (البيت، الشغل، ...) في users/{uid}.addresses
export const MAX_ADDRESSES = 10;
export const ADDRESS_KINDS = {
  home: { icon: '🏠', name: 'البيت' },
  work: { icon: '💼', name: 'الشغل' },
  other: { icon: '📍', name: 'عنوان تاني' },
};

export const addressIcon = (a) => (ADDRESS_KINDS[a?.kind] || ADDRESS_KINDS.other).icon;
export const addressTitle = (a) => String(a?.name || '').trim() || (ADDRESS_KINDS[a?.kind] || ADDRESS_KINDS.other).name;
export const newAddressId = () => `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// العناوين اللي شكلها سليم بس، والأحدث استخدامًا الأول
export function savedAddresses(user) {
  const list = Array.isArray(user?.addresses) ? user.addresses : [];
  return list.filter((a) => a && typeof a.id === 'string' && typeof a.address === 'string')
    .slice().sort((a, b) => (Number(b.usedAt) || 0) - (Number(a.usedAt) || 0));
}

// نوع العنوان الجديد: البيت لو مفيش، وبعدين الشغل، وبعدين تاني
export function nextKind(list) {
  if (!list.some((a) => a.kind === 'home')) return 'home';
  if (!list.some((a) => a.kind === 'work')) return 'work';
  return 'other';
}

export const cleanAddress = (a) => ({
  id: String(a.id),
  kind: ADDRESS_KINDS[a.kind] ? a.kind : 'other',
  name: String(a.name || '').trim().slice(0, 30),
  address: String(a.address || '').trim().slice(0, 300),
  location: a.location && Number.isFinite(+a.location.lat) && Number.isFinite(+a.location.lng)
    ? { lat: +a.location.lat, lng: +a.location.lng } : null,
  zoneId: a.zoneId || null,
  usedAt: Number(a.usedAt) || Date.now(),
});
