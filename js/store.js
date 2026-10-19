// إدارة الحالة (السلة والطلبات والعنوان) مع الحفظ في localStorage
const Store = (() => {
  const KEY = 'talabaty_state_v1';
  const defaults = { cart: { restaurantId: null, items: {} }, orders: [], address: 'القاهرة، مدينة نصر', promo: null };

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? { ...defaults, ...JSON.parse(raw) } : structuredClone(defaults);
    } catch {
      return structuredClone(defaults);
    }
  }

  let state = load();
  const listeners = [];

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* التخزين غير متاح */ }
    listeners.forEach((fn) => fn(state));
  }

  const findRestaurant = (id) => RESTAURANTS.find((r) => r.id === id);

  function findItem(restaurant, itemId) {
    for (const sec of restaurant.menu) {
      const it = sec.items.find((i) => i.id === itemId);
      if (it) return it;
    }
    return null;
  }

  return {
    get: () => state,
    subscribe: (fn) => listeners.push(fn),
    findRestaurant,
    findItem,

    // يرجّع false لو السلة فيها أصناف من مطعم تاني (زي طلبات: مطعم واحد لكل طلب)
    addItem(restaurantId, itemId, force = false) {
      const cart = state.cart;
      if (cart.restaurantId && cart.restaurantId !== restaurantId && Object.keys(cart.items).length) {
        if (!force) return false;
        cart.items = {};
        state.promo = null;
      }
      cart.restaurantId = restaurantId;
      cart.items[itemId] = (cart.items[itemId] || 0) + 1;
      save();
      return true;
    },

    setQty(itemId, qty) {
      const cart = state.cart;
      if (qty <= 0) delete cart.items[itemId];
      else cart.items[itemId] = qty;
      if (!Object.keys(cart.items).length) {
        cart.restaurantId = null;
        state.promo = null;
      }
      save();
    },

    clearCart() {
      state.cart = { restaurantId: null, items: {} };
      state.promo = null;
      save();
    },

    cartCount: () => Object.values(state.cart.items).reduce((a, b) => a + b, 0),

    cartLines() {
      const r = findRestaurant(state.cart.restaurantId);
      if (!r) return [];
      return Object.entries(state.cart.items)
        .map(([id, qty]) => ({ item: findItem(r, id), qty }))
        .filter((l) => l.item);
    },

    applyPromo(code) {
      const c = code.trim().toUpperCase();
      if (!PROMO_CODES[c]) return false;
      state.promo = c;
      save();
      return true;
    },

    removePromo() {
      state.promo = null;
      save();
    },

    totals() {
      const r = findRestaurant(state.cart.restaurantId);
      const subtotal = this.cartLines().reduce((s, l) => s + l.item.price * l.qty, 0);
      let delivery = r ? r.deliveryFee : 0;
      let discount = 0;
      const promo = state.promo && PROMO_CODES[state.promo];
      if (promo) {
        if (promo.type === 'percent') discount = Math.round(subtotal * promo.value / 100);
        else if (promo.type === 'fixed') discount = Math.min(promo.value, subtotal);
        else if (promo.type === 'delivery') delivery = 0;
      }
      const service = Math.round(subtotal * 0.05);
      return { subtotal, delivery, discount, service, total: subtotal + delivery + service - discount };
    },

    placeOrder({ address, phone, notes, payment }) {
      const r = findRestaurant(state.cart.restaurantId);
      const order = {
        id: 'T' + Date.now().toString().slice(-7),
        restaurantId: r.id,
        lines: this.cartLines().map((l) => ({ id: l.item.id, name: l.item.name, price: l.item.price, qty: l.qty })),
        totals: this.totals(),
        address, phone, notes, payment,
        createdAt: Date.now(),
        etaMinutes: r.time[1],
      };
      state.orders.unshift(order);
      state.address = address;
      state.cart = { restaurantId: null, items: {} };
      state.promo = null;
      save();
      return order;
    },

    findOrder: (id) => state.orders.find((o) => o.id === id),

    setAddress(addr) {
      state.address = addr;
      save();
    },
  };
})();
