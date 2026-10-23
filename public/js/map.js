// خريطة مجانية (Leaflet + OpenStreetMap) لتحديد المكان. بتتحمل بس لما نحتاجها.
// طريقة الاستخدام زي تطبيقات التوصيل: الدبوس ثابت في النص، وإنت بتحرّك الخريطة تحته.
const LEAFLET = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4';
const NOMINATIM = 'https://nominatim.openstreetmap.org';
const CAIRO = { lat: 30.0444, lng: 31.2357 };
let loading = null;

function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  loading ??= new Promise((resolve, reject) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = `${LEAFLET}/leaflet.min.css`;
    document.head.appendChild(css);
    const s = document.createElement('script');
    s.src = `${LEAFLET}/leaflet.min.js`;
    s.onload = () => resolve(window.L);
    s.onerror = () => {
      loading = null;
      reject(new Error('تعذر تحميل الخريطة'));
    };
    document.head.appendChild(s);
  });
  return loading;
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const round6 = (n) => +Number(n).toFixed(6);
export const googleMapsLink = (ll) => `https://www.google.com/maps?q=${ll.lat},${ll.lng}`;

// اسم المكان (شارع / منطقة) عشان صاحبه يتأكد إنه اختار صح
async function placeName(ll) {
  try {
    const res = await fetch(`${NOMINATIM}/reverse?format=json&zoom=17&accept-language=ar&lat=${ll.lat}&lon=${ll.lng}`);
    if (!res.ok) return '';
    const a = (await res.json()).address || {};
    return [a.road, a.neighbourhood || a.suburb || a.quarter, a.city_district || a.city || a.town || a.village || a.state]
      .filter(Boolean).filter((x, i, arr) => arr.indexOf(x) === i).slice(0, 3).join('، ');
  } catch {
    return '';
  }
}

async function search(q) {
  const res = await fetch(`${NOMINATIM}/search?format=json&limit=5&countrycodes=eg&accept-language=ar&q=${encodeURIComponent(q)}`);
  if (!res.ok) throw new Error('البحث مش متاح دلوقتي');
  return (await res.json()).map((x) => ({ name: x.display_name, lat: +x.lat, lng: +x.lon }));
}

// onChange بيتنادى بـ {lat, lng} كل ما المكان يتحدد
// hint: جملة (أو دالة بتاخد المكان) بتظهر تحت المكان، مثلًا "متنساش تدوس حفظ"
export async function locationPicker(el, initial, onChange, { hint = '' } = {}) {
  const L = await loadLeaflet();
  el.classList.add('picker');
  el.innerHTML = `
    <div class="picker-map"></div>
    <div class="picker-pin" aria-hidden="true">
      <svg viewBox="0 0 24 34" width="34" height="48"><path d="M12 0C5.4 0 0 5.3 0 11.9 0 20.8 12 34 12 34s12-13.2 12-22.1C24 5.3 18.6 0 12 0z" fill="#2d245b"/><circle cx="12" cy="12" r="4.6" fill="#e39b34"/></svg>
    </div>
    <span class="picker-dot" aria-hidden="true"></span>
    <div class="picker-search" role="search">
      <input type="search" placeholder="🔍 دوّر على منطقة أو شارع..." autocomplete="off" enterkeyhint="search" aria-label="دوّر على مكان">
      <div class="picker-results" hidden></div>
    </div>
    <div class="picker-btns">
      <button type="button" data-locate title="موقعي الحالي" aria-label="موقعي الحالي">◎</button>
      <button type="button" data-full title="تكبير الخريطة" aria-label="تكبير الخريطة">⛶</button>
    </div>
    <div class="picker-status"></div>
    <button type="button" class="btn primary picker-done">✓ تمام، ده المكان</button>`;

  const start = initial || CAIRO;
  const map = L.map(el.querySelector('.picker-map'), { zoomControl: false, attributionControl: true })
    .setView([start.lat, start.lng], initial ? 17 : 12);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(map);
  L.control.zoom({ position: 'bottomleft' }).addTo(map);

  const status = el.querySelector('.picker-status');
  let current = initial ? { lat: round6(initial.lat), lng: round6(initial.lng) } : null;
  let touched = false; // ما نحددش مكان غير لما صاحبه يحرّك الخريطة بنفسه
  let nameTimer = null;

  let lastName = '';
  const showStatus = (name) => {
    lastName = name;
    const note = typeof hint === 'function' ? hint(current) : hint;
    status.classList.toggle('done', Boolean(current));
    status.innerHTML = current
      ? `<b>✅ المكان اتحدد</b>${name ? `<span>${esc(name)}</span>` : ''}${note ? `<span class="muted">${esc(note)}</span>` : ''}
         <a href="${googleMapsLink(current)}" target="_blank" rel="noopener">اتأكد منه على خرائط جوجل ↗</a>`
      : '👆 حرّك الخريطة لحد ما الدبوس ييجي على المكان بالظبط، أو دوس ◎ لموقعك الحالي';
  };
  showStatus('');
  if (current) placeName(current).then((n) => { if (n) showStatus(n); });

  const pick = () => {
    const c = map.getCenter();
    current = { lat: round6(c.lat), lng: round6(c.lng) };
    onChange(current);
    showStatus('');
    clearTimeout(nameTimer);
    const at = current;
    nameTimer = setTimeout(() => placeName(at).then((n) => { if (n && at === current) showStatus(n); }), 700);
  };

  const box = el.querySelector('.picker-map');
  ['pointerdown', 'touchstart', 'wheel', 'keydown'].forEach((ev) => box.addEventListener(ev, () => { touched = true; }, { passive: true }));
  map.on('movestart', () => { if (touched) el.classList.add('moving'); });
  map.on('moveend', () => {
    el.classList.remove('moving');
    if (touched) pick();
  });
  // دوسة على الخريطة بتجيب المكان ده تحت الدبوس
  map.on('click', (e) => { touched = true; map.panTo(e.latlng); });

  const goTo = (ll, zoom = 17) => {
    touched = true;
    const c = map.getCenter();
    // لو هو نفس المكان moveend مش هيتنادى، فنحدد بإيدينا
    if (Math.abs(c.lat - ll.lat) < 1e-7 && Math.abs(c.lng - ll.lng) < 1e-7 && map.getZoom() === zoom) pick();
    else map.setView([ll.lat, ll.lng], zoom);
  };

  // البحث (مش <form> عشان الخريطة ساعات بتبقى جوه فورم تاني زي فورم الطلب)
  const input = el.querySelector('.picker-search input');
  const results = el.querySelector('.picker-results');
  input.addEventListener('keydown', async (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const q = input.value.trim();
    if (!q) return;
    results.hidden = false;
    results.innerHTML = '<div class="muted small">جاري البحث...</div>';
    try {
      const list = await search(q);
      results.innerHTML = list.length
        ? list.map((x, i) => `<button type="button" data-i="${i}">📍 ${esc(x.name)}</button>`).join('')
        : '<div class="muted small">مالقيناش المكان ده. جرّب اسم المنطقة أو حرّك الخريطة بإيدك.</div>';
      results.querySelectorAll('[data-i]').forEach((b) => b.addEventListener('click', () => {
        const x = list[+b.dataset.i];
        results.hidden = true;
        input.value = '';
        input.blur();
        goTo(x);
      }));
    } catch (err) {
      results.innerHTML = `<div class="muted small">${esc(err.message)}</div>`;
    }
  });
  input.addEventListener('input', () => { if (!input.value) results.hidden = true; });

  // تكبير الخريطة لملء الشاشة (أسهل كتير على الموبايل)
  const setFull = (on) => {
    el.classList.toggle('picker-full', on);
    document.body.classList.toggle('picker-open', on);
    setTimeout(() => map.invalidateSize(), 50);
  };
  el.querySelector('[data-full]').addEventListener('click', () => setFull(!el.classList.contains('picker-full')));
  el.querySelector('.picker-done').addEventListener('click', () => {
    if (!current) pick();
    setFull(false);
  });

  const locate = () => new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('المتصفح مش بيدعم تحديد الموقع'));
    status.textContent = '⏳ بنحدد موقعك...';
    navigator.geolocation.getCurrentPosition((p) => {
      const ll = { lat: p.coords.latitude, lng: p.coords.longitude };
      goTo(ll);
      resolve(ll);
    }, () => {
      showStatus('');
      reject(new Error('مقدرناش نحدد موقعك. اتأكد إن الـ GPS شغال وإنك سمحت للموقع، أو اختار المكان من الخريطة'));
    }, { enableHighAccuracy: true, timeout: 10000 });
  });
  el.querySelector('[data-locate]').addEventListener('click', () => locate().catch((e) => { status.textContent = `⚠️ ${e.message}`; }));

  return {
    locate,
    refresh: () => showStatus(lastName),
    // نقل الدبوس لمكان محفوظ (أو مسحه) من غير ما صاحبه يحرّك الخريطة
    setLocation: (ll) => {
      touched = false;
      clearTimeout(nameTimer);
      current = ll ? { lat: round6(ll.lat), lng: round6(ll.lng) } : null;
      if (current) map.setView([current.lat, current.lng], 17);
      showStatus('');
      if (current) {
        const at = current;
        placeName(at).then((n) => { if (n && at === current) showStatus(n); });
      }
    },
    destroy: () => {
      clearTimeout(nameTimer);
      document.body.classList.remove('picker-open');
      map.remove();
    },
  };
}
