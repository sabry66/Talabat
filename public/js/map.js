// خريطة مجانية (Leaflet + OpenStreetMap) لتحديد مكان التوصيل. بتتحمل بس لما نحتاجها.
const LEAFLET = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4';
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

// onChange بيتنادى بـ {lat, lng} لما العميل يحدد مكان
export async function locationPicker(el, initial, onChange) {
  const L = await loadLeaflet();
  const start = initial || CAIRO;
  const map = L.map(el).setView([start.lat, start.lng], initial ? 16 : 11);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap',
  }).addTo(map);
  const marker = L.marker([start.lat, start.lng], { draggable: true, opacity: initial ? 1 : 0.5 }).addTo(map);

  const set = (ll) => {
    marker.setLatLng(ll).setOpacity(1);
    onChange({ lat: +Number(ll.lat).toFixed(6), lng: +Number(ll.lng).toFixed(6) });
  };
  marker.on('dragend', () => set(marker.getLatLng()));
  map.on('click', (e) => set(e.latlng));

  return {
    locate() {
      return new Promise((resolve, reject) => {
        if (!navigator.geolocation) return reject(new Error('المتصفح مش بيدعم تحديد الموقع'));
        navigator.geolocation.getCurrentPosition((p) => {
          const ll = { lat: p.coords.latitude, lng: p.coords.longitude };
          map.setView([ll.lat, ll.lng], 17);
          set(ll);
          resolve(ll);
        }, () => reject(new Error('مقدرناش نحدد موقعك، اختاره من الخريطة')), { enableHighAccuracy: true, timeout: 10000 });
      });
    },
    destroy: () => map.remove(),
  };
}
