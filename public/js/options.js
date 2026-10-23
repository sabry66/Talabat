// اختيارات وإضافات الصنف (الحجم، الإضافات، الصوصات...)
// item.options = [{ id, name, required, multi, max, choices: [{ id, name, price, available }] }]
// السطر في السلة ليه مفتاح: "itemId" لو مفيش اختيارات، أو "itemId|g1:c1,c2|g2:c3"
// (من غير ui.js عشان cart.js وغيره يستوردوه من غير مشاكل)

export const newOptId = (p) => p + Date.now().toString(36).slice(-4) + Math.random().toString(36).slice(2, 5);

export const hasOptions = (it) => (it?.options || []).some((g) => (g.choices || []).length);

// مجموعة "السعر" (زي الحجم: ربع / نص / كيلو): سعر الاختيار هو سعر الصنف نفسه مش زيادة عليه.
// المطعم بيحددها بـ g.sets، ولو محددش: إجبارية، اختيار واحد، وكل اختياراتها ليها سعر
export const setsPrice = (g) => !g.multi && (g.sets ?? (Boolean(g.required) && (g.choices || []).length > 0
  && g.choices.every((c) => Number(c.price) > 0)));
export const priceGroup = (it) => (it?.options || []).find((g) => (g.choices || []).length && setsPrice(g)) || null;

// أقل سعر للصنف قبل الخصم (أرخص حجم متاح، أو السعر العادي)
export function basePrice(it) {
  const g = priceGroup(it);
  const prices = (g?.choices || []).filter((c) => c.available !== false).map((c) => Number(c.price) || 0);
  return prices.length ? Math.min(...prices) : Number(it.price) || 0;
}

// sel = { groupId: [choiceId, ...] }
export function lineKey(itemId, sel = {}) {
  const parts = Object.keys(sel).filter((g) => sel[g]?.length).sort()
    .map((g) => `${g}:${[...sel[g]].sort().join(',')}`);
  return [itemId, ...parts].join('|');
}

export function parseKey(key) {
  const [itemId, ...parts] = String(key).split('|');
  const sel = {};
  parts.forEach((p) => { const [g, cs] = p.split(':'); if (g && cs) sel[g] = cs.split(','); });
  return { itemId, sel };
}

// بيتأكد إن الاختيارات صحيحة لسه (المطعم ممكن يكون غيّرها) ويحسب الزيادة في السعر
// base: سعر الحجم المختار لو الصنف ليه مجموعة سعر (بيحل محل سعر الصنف)، وإلا null
export function resolveOptions(item, sel = {}) {
  let extra = 0;
  let base = null;
  const pg = priceGroup(item);
  const labels = [];
  for (const g of item.options || []) {
    const picked = (sel[g.id] || []).map((id) => (g.choices || []).find((c) => c.id === id));
    if (picked.some((c) => !c || c.available === false)) return { ok: false, error: `"${g.name}" اتغيرت، اختار تاني` };
    if (g.required && !picked.length) return { ok: false, error: `اختار ${g.name}` };
    if (!g.multi && picked.length > 1) return { ok: false, error: `اختار حاجة واحدة بس من ${g.name}` };
    if (g.multi && Number(g.max) > 0 && picked.length > Number(g.max)) return { ok: false, error: `أقصى حاجة ${g.max} من ${g.name}` };
    if (picked.length) {
      const sum = picked.reduce((s, c) => s + (Number(c.price) || 0), 0);
      if (g === pg) base = sum; else extra += sum;
      labels.push(`${g.name}: ${picked.map((c) => c.name).join('، ')}`);
    }
  }
  // اختيارات لمجموعات مبقتش موجودة
  if (Object.keys(sel).some((gid) => sel[gid]?.length && !(item.options || []).some((g) => g.id === gid))) {
    return { ok: false, error: 'الاختيارات اتغيرت، اختار تاني' };
  }
  return { ok: true, extra: Math.round(extra * 100) / 100, base, labels };
}

// أقل سعر ممكن للصنف بالإضافات الإجبارية (عشان نكتب "من X")
export function minExtra(item) {
  const pg = priceGroup(item);
  return (item.options || []).filter((g) => g.required && g !== pg).reduce((s, g) => {
    const prices = (g.choices || []).filter((c) => c.available !== false).map((c) => Number(c.price) || 0);
    return s + (prices.length ? Math.min(...prices) : 0);
  }, 0);
}
