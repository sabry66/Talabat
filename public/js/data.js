// بيانات ثابتة: التصنيفات، المطاعم التجريبية، أكواد الخصم، وحالات الطلب
export const CATEGORIES = [
  { id: 'all', name: 'الكل', icon: '🍽️' },
  { id: 'burger', name: 'برجر', icon: '🍔' },
  { id: 'pizza', name: 'بيتزا', icon: '🍕' },
  { id: 'shawarma', name: 'شاورما', icon: '🌯' },
  { id: 'egyptian', name: 'أكل مصري', icon: '🥘' },
  { id: 'chicken', name: 'فراخ', icon: '🍗' },
  { id: 'sweets', name: 'حلويات', icon: '🍰' },
  { id: 'coffee', name: 'قهوة', icon: '☕' },
  { id: 'grocery', name: 'بقالة', icon: '🛒' },
];

// المطاعم التجريبية: بتتضاف تلقائيًا في الوضع التجريبي، أو من لوحة الأدمن بزرار واحد
export const SEED_RESTAURANTS = [
  {
    id: 'burger-house', address: 'مدينة نصر، شارع عباس العقاد', phone: '0225550000', location: { lat: 30.0626, lng: 31.344 },
    name: 'بيت البرجر', category: 'burger', emoji: '🍔', color: '#ffe3d1',
    rating: 4.6, reviews: 1240, time: [25, 35], minOrder: 80,
    tags: ['برجر', 'وجبات سريعة'], promo: 'خصم 20% على أول طلب',
    menu: [
      { section: 'الأكثر طلبًا', items: [
        { id: 'bh1', name: 'كلاسيك برجر', desc: 'لحم بقري 150 جم، جبنة شيدر، خس، طماطم وصوص خاص', price: 120, emoji: '🍔' },
        { id: 'bh2', name: 'دبل تشيز برجر', desc: 'قطعتين لحم، جبنة مضاعفة، بصل مكرمل', price: 175, emoji: '🍔' },
      ]},
      { section: 'برجر فراخ', items: [
        { id: 'bh3', name: 'كرسبي تشيكن', desc: 'صدر فراخ مقرمش، كول سلو، صوص رانش', price: 110, emoji: '🍗' },
        { id: 'bh4', name: 'سبايسي تشيكن', desc: 'فراخ حارة، هالبينو، جبنة', price: 115, emoji: '🌶️' },
      ]},
      { section: 'إضافات ومشروبات', items: [
        { id: 'bh5', name: 'بطاطس كبيرة', desc: 'بطاطس مقرمشة مع ملح البحر', price: 40, emoji: '🍟' },
        { id: 'bh6', name: 'حلقات بصل', desc: '8 قطع مع صوص باربكيو', price: 45, emoji: '🧅' },
        { id: 'bh7', name: 'مشروب غازي', desc: 'كانز 330 مل', price: 20, emoji: '🥤' },
      ]},
    ],
  },
  {
    id: 'pizza-roma', address: 'مصر الجديدة، الكوربة', phone: '0225550000', location: { lat: 30.089, lng: 31.324 },
    name: 'بيتزا روما', category: 'pizza', emoji: '🍕', color: '#ffd9d9',
    rating: 4.4, reviews: 980, time: [30, 45], minOrder: 100,
    tags: ['بيتزا', 'إيطالي'], promo: 'توصيل مجاني فوق 250 ج',
    menu: [
      { section: 'بيتزا', items: [
        { id: 'pr1', name: 'مارجريتا', desc: 'صوص طماطم، موتزاريلا، ريحان', price: 130, emoji: '🍕' },
        { id: 'pr2', name: 'بيبروني', desc: 'بيبروني بقري، موتزاريلا', price: 160, emoji: '🍕' },
        { id: 'pr3', name: 'خضروات', desc: 'فلفل، زيتون، مشروم، بصل', price: 140, emoji: '🫑' },
        { id: 'pr4', name: 'سي فود', desc: 'جمبري، كاليماري، تونة', price: 210, emoji: '🦐' },
      ]},
      { section: 'باستا', items: [
        { id: 'pr5', name: 'ألفريدو فراخ', desc: 'فيتوتشيني بصوص كريمة وفراخ', price: 125, emoji: '🍝' },
        { id: 'pr6', name: 'أرابياتا', desc: 'بيني بصوص طماطم حار', price: 95, emoji: '🍝' },
      ]},
    ],
  },
  {
    id: 'shawarma-sham', address: 'المعادي، شارع 9', phone: '0225550000', location: { lat: 29.9602, lng: 31.2569 },
    name: 'شاورما الشام', category: 'shawarma', emoji: '🌯', color: '#fff0c7',
    rating: 4.7, reviews: 2210, time: [20, 30], minOrder: 60,
    tags: ['شاورما', 'سوري'], promo: null,
    menu: [
      { section: 'سندوتشات', items: [
        { id: 'ss1', name: 'شاورما فراخ', desc: 'صاج، ثومية، مخلل', price: 55, emoji: '🌯' },
        { id: 'ss2', name: 'شاورما لحمة', desc: 'صاج، طحينة، بقدونس', price: 70, emoji: '🌯' },
        { id: 'ss3', name: 'فاهيتا', desc: 'فراخ متبلة، فلفل ألوان', price: 65, emoji: '🌮' },
      ]},
      { section: 'وجبات', items: [
        { id: 'ss4', name: 'وجبة عربي فراخ', desc: 'شاورما مقطعة، بطاطس، ثومية، مخلل', price: 135, emoji: '🍽️' },
        { id: 'ss5', name: 'فتة شاورما', desc: 'عيش محمص، أرز، صوص زبادي', price: 120, emoji: '🥣' },
      ]},
    ],
  },
  {
    id: 'koshary-tahrir', address: 'وسط البلد، ميدان التحرير', phone: '0225550000', location: { lat: 30.0444, lng: 31.2357 },
    name: 'كشري التحرير', category: 'egyptian', emoji: '🥘', color: '#e5f3d6',
    rating: 4.5, reviews: 3100, time: [15, 25], minOrder: 40,
    tags: ['كشري', 'أكل مصري'], promo: 'اطلب 2 والتالت هدية',
    menu: [
      { section: 'كشري', items: [
        { id: 'kt1', name: 'كشري صغير', desc: 'أرز، مكرونة، عدس، صلصة، دقة', price: 30, emoji: '🥘' },
        { id: 'kt2', name: 'كشري وسط', desc: 'الحجم المتوسط', price: 40, emoji: '🥘' },
        { id: 'kt3', name: 'كشري كبير', desc: 'الحجم الكبير مع بصل زيادة', price: 55, emoji: '🥘' },
      ]},
      { section: 'حلو', items: [
        { id: 'kt4', name: 'أرز بلبن', desc: 'بالمكسرات', price: 25, emoji: '🍮' },
        { id: 'kt5', name: 'أم علي', desc: 'ساخنة بالقشطة', price: 35, emoji: '🥧' },
      ]},
    ],
  },
  {
    id: 'crispy-chicken', address: 'مدينة نصر، مكرم عبيد', phone: '0225550000', location: { lat: 30.056, lng: 31.346 },
    name: 'كرسبي تشيكن', category: 'chicken', emoji: '🍗', color: '#fde2c4',
    rating: 4.2, reviews: 760, time: [25, 40], minOrder: 90,
    tags: ['فراخ', 'مقلي'], promo: null,
    menu: [
      { section: 'بوكسات', items: [
        { id: 'cc1', name: 'بوكس 3 قطع', desc: '3 قطع فراخ، بطاطس، عيش، كول سلو', price: 115, emoji: '🍗' },
        { id: 'cc2', name: 'بوكس 5 قطع', desc: '5 قطع فراخ، بطاطس كبيرة، 2 صوص', price: 170, emoji: '🍗' },
        { id: 'cc3', name: 'استربس', desc: '6 قطع استربس مع صوص عسل وخردل', price: 105, emoji: '🍖' },
      ]},
      { section: 'عائلي', items: [
        { id: 'cc4', name: 'باكت عائلي', desc: '12 قطعة، 2 بطاطس كبيرة، لتر بيبسي', price: 420, emoji: '🪣' },
      ]},
    ],
  },
  {
    id: 'sweet-corner', address: 'الزمالك، شارع 26 يوليو', phone: '0225550000', location: { lat: 30.0609, lng: 31.2197 },
    name: 'ركن الحلويات', category: 'sweets', emoji: '🍰', color: '#f6dcf0',
    rating: 4.8, reviews: 540, time: [30, 50], minOrder: 70,
    tags: ['حلويات', 'كيك'], promo: 'خصم 15% يوم الجمعة',
    menu: [
      { section: 'كيك', items: [
        { id: 'sc1', name: 'تشيز كيك', desc: 'بصوص الفراولة', price: 65, emoji: '🍰' },
        { id: 'sc2', name: 'براونيز', desc: 'شوكولاتة غنية', price: 50, emoji: '🍫' },
      ]},
      { section: 'شرقي', items: [
        { id: 'sc3', name: 'كنافة بالمانجو', desc: 'كنافة نابلسية بالمانجو والقشطة', price: 80, emoji: '🥭' },
        { id: 'sc4', name: 'بسبوسة بالقشطة', desc: '4 قطع', price: 45, emoji: '🍯' },
      ]},
    ],
  },
  {
    id: 'bean-cafe', address: 'التجمع الخامس، شارع التسعين', phone: '0225550000', location: { lat: 30.028, lng: 31.47 },
    name: 'بين كافيه', category: 'coffee', emoji: '☕', color: '#eadfd6',
    rating: 4.3, reviews: 410, time: [15, 25], minOrder: 50,
    tags: ['قهوة', 'مشروبات'], promo: null,
    menu: [
      { section: 'قهوة ساخنة', items: [
        { id: 'bc1', name: 'لاتيه', desc: 'إسبريسو وحليب مبخر', price: 55, emoji: '☕' },
        { id: 'bc2', name: 'كابتشينو', desc: 'رغوة كثيفة', price: 55, emoji: '☕' },
        { id: 'bc3', name: 'قهوة تركي', desc: 'مظبوط أو زيادة', price: 35, emoji: '🫖' },
      ]},
      { section: 'مشروبات باردة', items: [
        { id: 'bc4', name: 'آيس لاتيه', desc: 'قهوة مثلجة بالحليب', price: 60, emoji: '🧋' },
        { id: 'bc5', name: 'سموذي فراولة', desc: 'فراولة طازة وزبادي', price: 65, emoji: '🍓' },
      ]},
    ],
  },
  {
    id: 'quick-mart', address: 'مصر الجديدة، الميرغني', phone: '0225550000', location: { lat: 30.087, lng: 31.33 },
    name: 'كويك ماركت', category: 'grocery', emoji: '🛒', color: '#d8ecf7',
    rating: 4.1, reviews: 300, time: [20, 30], minOrder: 100,
    tags: ['بقالة', 'سوبر ماركت'], promo: 'توصيل في 30 دقيقة',
    menu: [
      { section: 'أساسيات', items: [
        { id: 'qm1', name: 'لبن 1 لتر', desc: 'كامل الدسم', price: 38, emoji: '🥛' },
        { id: 'qm2', name: 'عيش فينو', desc: '5 أرغفة', price: 15, emoji: '🥖' },
        { id: 'qm3', name: 'بيض 10 حبات', desc: 'بيض أبيض', price: 55, emoji: '🥚' },
      ]},
      { section: 'خضار وفاكهة', items: [
        { id: 'qm4', name: 'طماطم 1 كيلو', desc: 'طازة', price: 20, emoji: '🍅' },
        { id: 'qm5', name: 'موز 1 كيلو', desc: 'مستورد', price: 35, emoji: '🍌' },
      ]},
    ],
  },
];

// أكواد الخصم: نسبة مئوية أو مبلغ ثابت
// كوبونات للوضع التجريبي بس. في الحقيقي الأدمن بيعملها من تبويب "الكوبونات"
export const SAMPLE_COUPONS = {
  ARRIVO20: { code: 'ARRIVO20', type: 'percent', value: 20, maxDiscount: 100, minOrder: 0, expiresAt: null, limit: 0, used: 0, onePerCustomer: false, active: true },
  WELCOME50: { code: 'WELCOME50', type: 'fixed', value: 50, maxDiscount: 0, minOrder: 150, expiresAt: null, limit: 0, used: 0, onePerCustomer: true, active: true },
  FREEDEL: { code: 'FREEDEL', type: 'delivery', value: 0, maxDiscount: 0, minOrder: 0, expiresAt: null, limit: 100, used: 0, onePerCustomer: false, active: true },
};

export const ORDER_STATUSES = {
  placed: { label: 'تم استلام الطلب', icon: '📝' },
  preparing: { label: 'جاري التحضير', icon: '👨‍🍳' },
  ready: { label: 'جاهز للتسليم', icon: '📦' },
  on_way: { label: 'مع المندوب في الطريق', icon: '🛵' },
  delivered: { label: 'تم التوصيل', icon: '✅' },
  cancelled: { label: 'ملغي', icon: '❌' },
  rejected: { label: 'اعتذر المطعم', icon: '🚫' },
};

// مراحل الطلب الطبيعية بالترتيب
export const ORDER_FLOW = ['placed', 'preparing', 'ready', 'on_way', 'delivered'];
export const FINAL_STATUSES = ['delivered', 'cancelled', 'rejected'];

export const PAYMENT_LABELS = {
  cash: '💵 كاش عند الاستلام',
  card: '💳 بطاقة عند الاستلام (ماكينة مع المندوب)',
};

export const NEW_RESTAURANT = {
  name: '', emoji: '🍽️', color: '#ffe3d1', category: 'burger', tags: [],
  rating: null, reviews: 0, time: [20, 35], minOrder: 50, promo: '',
  isOpen: true, ownerUid: null, ownerEmail: null,
  menu: [{ section: 'الأصناف', items: [] }],
};

// إعدادات المنصة (الأدمن بيغيرها من لوحة الأدمن ← المناطق والنسب)
// كل نسبة: { type: 'percent' | 'fixed', value }
export const DEFAULT_SETTINGS = {
  zones: {}, // { zoneId: { name, fee, active } }
  rates: {
    driverShare: { type: 'percent', value: 30 }, // نصيب المندوب من رسوم التوصيل، والباقي للمنصة
    commission: { type: 'percent', value: 0 }, // عمولة المنصة على سعر الأكل
    serviceFee: { type: 'percent', value: 0 }, // رسوم خدمة على العميل
    driverPaysRestaurant: true, // المندوب بيدفع للمطعم كاش وقت الاستلام
  },
  couponsPerOrder: 1, // عدد كوبونات الخصم المسموح بيها في الطلب (0 = الكوبونات مقفولة)
};

export const SAMPLE_ZONES = {
  nasr_city: { name: 'مدينة نصر', fee: 25, active: true },
  heliopolis: { name: 'مصر الجديدة', fee: 30, active: true },
  downtown: { name: 'وسط البلد', fee: 30, active: true },
  maadi: { name: 'المعادي', fee: 40, active: true },
  zamalek: { name: 'الزمالك', fee: 35, active: true },
  new_cairo: { name: 'التجمع الخامس', fee: 45, active: true },
};
