// الوضع الليلي: بيتحمّل قبل الصفحة عشان متظهرش بيضا ثانية.
// الاختيار (تلقائي/غامق/فاتح) بيتحفظ، والصفحة دايمًا عليها data-theme="dark" أو "light" (تلقائي = زي الموبايل)
(function () {
  var KEY = 'arrivo_theme';
  var NAMES = { auto: '🌓 الشكل: تلقائي', light: '☀️ الشكل: فاتح', dark: '🌙 الشكل: غامق' };
  var media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  function get() { try { return localStorage.getItem(KEY) || 'auto'; } catch (e) { return 'auto'; } }
  function apply() {
    var t = get();
    var dark = t === 'dark' || (t === 'auto' && media && media.matches);
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#0f0e17' : '#2d245b');
  }
  function set(t) {
    try { if (t === 'auto') localStorage.removeItem(KEY); else localStorage.setItem(KEY, t); } catch (e) { /* مفيش تخزين */ }
    apply();
  }
  apply();
  // لو الموبايل غيّر الوضع وإحنا على "تلقائي"
  if (media) {
    var onChange = function () { if (get() === 'auto') apply(); };
    if (media.addEventListener) media.addEventListener('change', onChange); else if (media.addListener) media.addListener(onChange);
  }
  window.arrivoTheme = {
    get: get,
    set: set,
    label: function () { return NAMES[get()] || NAMES.auto; },
    // تلقائي ← غامق ← فاتح ← تلقائي
    next: function () { var order = ['auto', 'dark', 'light']; set(order[(order.indexOf(get()) + 1) % 3]); return get(); },
  };
}());
