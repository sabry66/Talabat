// الوضع الليلي: بيتحمّل قبل الصفحة عشان متظهرش بيضا ثانية. auto = زي إعداد الموبايل
(function () {
  var KEY = 'arrivo_theme';
  var NAMES = { auto: '🌓 الشكل: تلقائي', light: '☀️ الشكل: فاتح', dark: '🌙 الشكل: غامق' };
  function get() { try { return localStorage.getItem(KEY) || 'auto'; } catch (e) { return 'auto'; } }
  function apply(t) {
    var root = document.documentElement;
    if (t === 'light' || t === 'dark') root.setAttribute('data-theme', t);
    else root.removeAttribute('data-theme');
  }
  function set(t) {
    try { if (t === 'auto') localStorage.removeItem(KEY); else localStorage.setItem(KEY, t); } catch (e) { /* مفيش تخزين */ }
    apply(t);
  }
  apply(get());
  window.arrivoTheme = {
    get: get,
    set: set,
    label: function () { return NAMES[get()] || NAMES.auto; },
    // تلقائي ← غامق ← فاتح ← تلقائي
    next: function () { var order = ['auto', 'dark', 'light']; set(order[(order.indexOf(get()) + 1) % 3]); return get(); },
  };
}());
