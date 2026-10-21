// القايمة الجانبية (☰) للشاشات الصغيرة: بدل ما الروابط تتزحم في الشريط اللي فوق.
// بتجمع لوحدها روابط الشريط اللي فوق وتبويبات لوحات التحكم، فمش محتاجة تتعدل مع كل صفحة.
(function () {
  const isHome = /\/(index\.html)?$/.test(location.pathname);

  function build() {
    const bar = document.querySelector('.topbar-inner');
    if (!bar || document.getElementById('menuBtn')) return;

    const btn = document.createElement('button');
    btn.id = 'menuBtn';
    btn.className = 'menu-btn';
    btn.type = 'button';
    btn.setAttribute('aria-label', 'القايمة');
    btn.setAttribute('aria-expanded', 'false');
    btn.innerHTML = '<span></span><span></span><span></span><b class="menu-badge" hidden></b>';
    bar.prepend(btn); // في أول الشريط (يمين، زي تطبيقات العربي)

    const drawer = document.createElement('aside');
    drawer.className = 'drawer';
    drawer.id = 'drawer';
    drawer.setAttribute('aria-hidden', 'true');
    drawer.innerHTML = `
      <div class="drawer-head">
        <a href="${location.pathname.split('/').pop() || 'index.html'}" class="logo"><img src="img/logo-icon.png" alt=""><span>أريفو</span></a>
        <button class="drawer-close" type="button" aria-label="قفل القايمة">✕</button>
      </div>
      <nav class="drawer-body" id="drawerBody"></nav>`;
    const backdrop = document.createElement('div');
    backdrop.className = 'drawer-backdrop';
    document.body.append(backdrop, drawer);

    const close = () => {
      document.body.classList.remove('drawer-open');
      drawer.setAttribute('aria-hidden', 'true');
      btn.setAttribute('aria-expanded', 'false');
    };
    const open = () => {
      fill();
      document.body.classList.add('drawer-open');
      drawer.setAttribute('aria-hidden', 'false');
      btn.setAttribute('aria-expanded', 'true');
    };
    btn.addEventListener('click', () => (document.body.classList.contains('drawer-open') ? close() : open()));
    backdrop.addEventListener('click', close);
    drawer.querySelector('.drawer-close').addEventListener('click', close);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
    window.addEventListener('hashchange', close);

    // عنصر في القايمة بيدوس على الأصلي (فكل اللي مربوط بيه بيشتغل زي ما هو)
    const item = (label, source, active = false) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `drawer-item${active ? ' active' : ''}`;
      b.innerHTML = label;
      b.addEventListener('click', () => { close(); source.click(); });
      return b;
    };
    const link = (label, href) => {
      const a = document.createElement('a');
      a.className = `drawer-item${location.hash === href.replace(/^[^#]*/, '') && href.includes('#') ? ' active' : ''}`;
      a.href = href;
      a.innerHTML = label;
      a.addEventListener('click', close);
      return a;
    };
    const section = (title) => {
      const h = document.createElement('div');
      h.className = 'drawer-section';
      h.textContent = title;
      return h;
    };
    const labelOf = (el) => (el.dataset.drawerLabel || el.textContent.trim() || el.title || '').replace(/\s+/g, ' ');

    function fill() {
      const body = document.getElementById('drawerBody');
      body.innerHTML = '';
      if (isHome) {
        body.append(link('🏠 الرئيسية', '#/'), link('🛒 السلة', '#/cart'));
      }
      const tabs = [...document.querySelectorAll('#tabs [data-tab]')];
      if (tabs.length) {
        body.append(section('الأقسام'));
        tabs.forEach((t) => body.append(item(t.innerHTML, t, t.classList.contains('active'))));
      }
      const navEls = [...document.querySelectorAll('.topbar .nav a, .topbar .nav button, .topbar-inner > .install-btn')]
        .filter((el) => !el.hidden && !el.classList.contains('cart-link'));
      if (navEls.length) {
        body.append(section(tabs.length ? 'الحساب' : 'القايمة'));
        navEls.forEach((el) => body.append(el.tagName === 'A' && el.getAttribute('href')
          ? link(labelOf(el), el.getAttribute('href'))
          : item(labelOf(el), el)));
      }
      // في الموقع الرئيسي: روابط الانضمام للمطاعم والمندوبين
      if (isHome) {
        body.append(section('اشتغل معانا'), link('🏪 سجّل مطعمك', 'restaurant.html?join=1'), link('🛵 اشتغل مندوب', 'delivery.html?join=1'));
      }
      body.append(section('عن أريفو'), link('📄 الشروط والأحكام', 'terms.html'), link('🔒 سياسة الخصوصية', 'privacy.html'));
      const who = document.querySelector('.topbar .nav .muted');
      if (who) {
        const w = document.createElement('div');
        w.className = 'drawer-user';
        w.innerHTML = who.innerHTML;
        body.prepend(w);
      }
    }

    // على الموبايل شريط الأقسام بيستخبى (موجود في القايمة)، فبنعرض اسم القسم الحالي
    // ونحط عدد الإشعارات (طلبات/شكاوي جديدة) على زرار ☰
    let queued = false;
    function sync() {
      queued = false;
      const tabsEl = document.getElementById('tabs');
      let title = document.getElementById('sectionTitle');
      if (!tabsEl) { if (title) title.remove(); }
      else {
        if (!title || title.nextElementSibling !== tabsEl) {
          if (title) title.remove();
          title = document.createElement('button');
          title.type = 'button';
          title.id = 'sectionTitle';
          title.className = 'section-title';
          title.addEventListener('click', open);
          tabsEl.before(title);
        }
        const active = tabsEl.querySelector('[data-tab].active');
        const html = `<span>${active ? active.innerHTML : ''}</span><small>الأقسام ▾</small>`;
        if (title.innerHTML !== html) title.innerHTML = html;
      }
      const count = [...document.querySelectorAll('#tabs .badge')]
        .reduce((n, b) => n + (parseInt(b.textContent.replace(/[^0-9]/g, ''), 10) || 0), 0);
      const badge = btn.querySelector('.menu-badge');
      const text = count > 99 ? '99+' : String(count);
      if (badge.textContent !== text) badge.textContent = text;
      if (badge.hidden !== !count) badge.hidden = !count;
    }
    new MutationObserver(() => {
      if (!queued) { queued = true; requestAnimationFrame(sync); }
    }).observe(document.getElementById('app') || document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'], characterData: true });
    sync();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();
}());
