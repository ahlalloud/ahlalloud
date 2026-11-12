(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const config = window.AHL_CONFIG || {};
  const PROMO_START = new Date('2026-11-13T00:00:00+03:00').getTime();
  const PROMO_END = new Date('2026-11-16T00:00:00+03:00').getTime();
  const state = {
    db: null,
    products: [],
    cart: [],
    filter: 'all',
    search: '',
    promoPhase: '',
    lastFocusedElement: null
  };

  const money = value => new Intl.NumberFormat('ar-JO', {
    style: 'currency',
    currency: 'JOD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Number(value) || 0);

  const text = value => String(value ?? '');
  const cleanSize = value => text(value)
    .replace(/[_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+مل/g, ' مل')
    .trim();

  const promoPhase = (now = Date.now()) => {
    if (now < PROMO_START) return 'upcoming';
    if (now < PROMO_END) return 'active';
    return 'ended';
  };

  const unitPrice = product => {
    const base = Number(product?.price_jod);
    if (!Number.isFinite(base) || base < 0) return null;
    return promoPhase() === 'active' ? Math.round(base * 50) / 100 : base;
  };

  function categoryFor(product) {
    const category = text(product.category).trim();
    if (category) return category;
    if (/بوكس|هدية|هدايا/i.test(text(product.name_ar))) return 'بوكسات وهدايا';
    return 'منتجات مميزة';
  }

  function shortDescription(product) {
    const raw = text(product.description_short || product.description);
    const parts = raw.split(/\r?\n/).map(part => cleanSize(part)).filter(Boolean);
    const name = text(product.name_ar).trim().toLocaleLowerCase('ar');
    const useful = parts.find(part => {
      const normalized = part.toLocaleLowerCase('ar');
      return normalized !== name && !/^\d+\s*(مل|غرام|جم|كغ)/.test(normalized);
    });
    return useful || '';
  }

  function createElement(tag, className, content) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (content !== undefined && content !== null) element.textContent = content;
    return element;
  }

  function setText(selector, value) {
    const element = $(selector);
    if (element) element.textContent = value;
  }

  function updatePromotion() {
    const phase = promoPhase();
    const changed = state.promoPhase !== phase;
    state.promoPhase = phase;

    let headline = '';
    let subline = '';
    let kicker = '';
    let title = '';
    let target = null;
    let foot = 'من الجمعة 13 نوفمبر حتى نهاية الأحد 15 نوفمبر';

    if (phase === 'upcoming') {
      headline = 'بكرا الجمعة يبدأ خصم 50% على جميع الأصناف';
      subline = 'الجمعة 13 نوفمبر — الأحد 15 نوفمبر';
      kicker = 'استعدّوا للعرض';
      title = 'باقي على انطلاق الخصم';
      target = PROMO_START;
    } else if (phase === 'active') {
      headline = 'خصم 50% على جميع الأصناف — العرض مستمر لثلاثة أيام';
      subline = 'حتى نهاية الأحد 15 نوفمبر';
      kicker = 'العرض متاح الآن';
      title = 'ينتهي الخصم بعد';
      target = PROMO_END;
      foot = 'الجمعة 13 نوفمبر — حتى نهاية الأحد 15 نوفمبر';
    } else {
      headline = 'شكرًا لثقتكم بأهل العود — ترقبوا عروضنا القادمة';
      subline = 'العطر ذاكرة لا تغيب';
      kicker = 'أهل العود';
      title = 'انتهى عرض الـ 50%';
      foot = 'نلتقي بكم في عروض قادمة';
    }

    $$('.announcement-message').forEach(element => { element.textContent = headline; });
    $$('.announcement-submessage').forEach(element => { element.textContent = subline; });
    setText('#countdownKicker', kicker);
    setText('#countdownTitle', title);
    setText('#countdownFoot', foot);

    const grid = $('.countdown-grid');
    if (grid) grid.hidden = phase === 'ended';

    if (target) {
      const remaining = Math.max(0, target - Date.now());
      const days = Math.floor(remaining / 86400000);
      const hours = Math.floor((remaining % 86400000) / 3600000);
      const minutes = Math.floor((remaining % 3600000) / 60000);
      const seconds = Math.floor((remaining % 60000) / 1000);
      setText('#countDays', String(days).padStart(2, '0'));
      setText('#countHours', String(hours).padStart(2, '0'));
      setText('#countMinutes', String(minutes).padStart(2, '0'));
      setText('#countSeconds', String(seconds).padStart(2, '0'));
    }

    if (changed) {
      renderProducts();
      renderCart();
    }
  }

  function renderCategoryFilters() {
    const root = $('#categoryFilters');
    if (!root) return;
    root.replaceChildren();

    const order = ['رجالي', 'نسائي', 'للجنسين', 'مسك', 'بخور', 'مباخر', 'بوكسات وهدايا', 'منتجات مميزة'];
    const found = new Set(state.products.map(categoryFor));
    const categories = order.filter(category => found.has(category));
    [...found].filter(category => !order.includes(category)).sort().forEach(category => categories.push(category));

    const filters = [{ value: 'all', label: 'كل المنتجات' }, ...categories.map(value => ({ value, label: value }))];
    filters.forEach(filter => {
      const button = createElement('button', 'filter-chip', filter.label);
      button.type = 'button';
      button.dataset.filter = filter.value;
      button.setAttribute('aria-pressed', String(state.filter === filter.value));
      if (state.filter === filter.value) button.classList.add('active');
      button.addEventListener('click', () => {
        state.filter = filter.value;
        renderCategoryFilters();
        renderProducts();
      });
      root.append(button);
    });
  }

  function appendPrice(container, product, compact = false) {
    const price = Number(product.price_jod);
    if (!Number.isFinite(price)) {
      container.append(createElement('span', 'price-unavailable', 'السعر عند الطلب'));
      return;
    }

    if (promoPhase() === 'active') {
      const old = createElement('s', 'old-price', money(price));
      const current = createElement('strong', 'sale-price', money(unitPrice(product)));
      const badge = createElement('span', 'sale-badge', 'خصم 50%');
      container.classList.add(compact ? 'price-line-compact' : 'price-line-sale');
      container.append(old, current, badge);
    } else {
      container.append(createElement('strong', 'regular-price', money(price)));
    }
  }

  function imageFallback(container, name) {
    const fallback = createElement('div', 'image-fallback');
    fallback.setAttribute('aria-label', 'صورة ' + name);
    fallback.innerHTML = '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M16 14h16l3 7v14H13V21l3-7Z"/><path d="M19 14V9h10v5M18 26h12"/></svg>';
    container.append(fallback);
  }

  function productImage(product, className, eager = false) {
    const frame = createElement('div', className);
    if (product.image_url) {
      const image = createElement('img');
      image.src = product.image_url;
      image.alt = text(product.name_ar) || 'منتج أهل العود';
      image.loading = eager ? 'eager' : 'lazy';
      image.decoding = 'async';
      image.addEventListener('error', () => {
        image.remove();
        imageFallback(frame, text(product.name_ar));
      }, { once: true });
      frame.append(image);
    } else {
      imageFallback(frame, text(product.name_ar));
    }
    return frame;
  }

  function renderProductCard(product) {
    const card = createElement('article', 'product-card');
    const category = createElement('span', 'product-category', categoryFor(product));
    const photo = productImage(product, 'product-photo');
    const name = createElement('h3', 'product-name', text(product.name_ar) || 'منتج أهل العود');
    const description = createElement('p', 'product-description', shortDescription(product));
    const size = cleanSize(product.size);
    const sizeNode = size && size !== 'اختياري' ? createElement('span', 'product-size', size) : null;
    const price = createElement('div', 'product-price');
    appendPrice(price, product);

    const actions = createElement('div', 'product-actions');
    const detailButton = createElement('button', 'product-detail-button', 'التفاصيل');
    detailButton.type = 'button';
    detailButton.addEventListener('click', () => openProductDialog(product.id));
    const addButton = createElement('button', 'product-add-button', 'أضف للسلة');
    addButton.type = 'button';
    addButton.innerHTML = 'أضف للسلة <span aria-hidden="true">＋</span>';
    addButton.addEventListener('click', () => addToCart(product.id));
    actions.append(detailButton, addButton);

    card.append(category, photo, name);
    if (description) card.append(description);
    if (sizeNode) card.append(sizeNode);
    card.append(price, actions);
    return card;
  }

  function renderProducts() {
    const root = $('#products');
    if (!root) return;
    const query = state.search.trim().toLocaleLowerCase('ar');
    const visible = state.products.filter(product => {
      const matchesCategory = state.filter === 'all' || categoryFor(product) === state.filter;
      const searchable = [
        product.name_ar, product.description_short, product.description, product.category, product.size
      ].map(value => text(value).replace(/[_]+/g, ' ').toLocaleLowerCase('ar')).join(' ');
      return matchesCategory && (!query || searchable.includes(query));
    });

    root.replaceChildren();
    root.setAttribute('aria-busy', 'false');
    setText('#resultCount', visible.length + ' من ' + state.products.length + ' منتج');

    if (!visible.length) {
      const empty = createElement('div', 'empty-state');
      empty.append(createElement('strong', '', 'ما لقينا منتجات مطابقة'));
      empty.append(createElement('p', '', 'جرّب كلمة بحث ثانية أو اختر تصنيفًا مختلفًا.'));
      const reset = createElement('button', 'button button-outline', 'عرض كل المنتجات');
      reset.type = 'button';
      reset.addEventListener('click', () => {
        state.filter = 'all';
        state.search = '';
        setSearchValue('');
        renderCategoryFilters();
        renderProducts();
      });
      empty.append(reset);
      root.append(empty);
      return;
    }

    visible.forEach(product => root.append(renderProductCard(product)));
  }

  function setSearchValue(value) {
    const input = $('#searchInput');
    if (input) input.value = value;
  }

  function getCartProducts() {
    return state.cart.map(item => {
      const product = state.products.find(candidate => String(candidate.id) === String(item.id));
      return product ? { ...item, product } : null;
    }).filter(Boolean);
  }

  function persistCart() {
    try {
      localStorage.setItem('ahl-oud-cart-v2', JSON.stringify(state.cart));
    } catch (error) {
      console.warn('AHL cart storage unavailable:', error);
    }
  }

  function loadCart() {
    try {
      const raw = JSON.parse(localStorage.getItem('ahl-oud-cart-v2') || '[]');
      if (Array.isArray(raw)) {
        state.cart = raw.filter(item =>
          item && typeof item.id === 'string' && Number.isInteger(item.qty) && item.qty > 0
        );
      }
    } catch {
      state.cart = [];
    }
  }

  function updateCartCount() {
    const count = state.cart.reduce((total, item) => total + item.qty, 0);
    setText('#cartCount', String(count));
    $('#cartOpen')?.setAttribute('aria-label', 'سلة التسوق، ' + count + ' منتجات');
    setText('#cartItemsCount', count + ' منتجات');
  }

  function openCart() {
    $('#cartDrawer')?.classList.add('open');
    $('#cartDrawer')?.setAttribute('aria-hidden', 'false');
    $('#pageOverlay').hidden = false;
    document.body.classList.add('drawer-open');
    $('#cartClose')?.focus();
  }

  function closeCart() {
    $('#cartDrawer')?.classList.remove('open');
    $('#cartDrawer')?.setAttribute('aria-hidden', 'true');
    $('#pageOverlay').hidden = true;
    document.body.classList.remove('drawer-open');
  }

  function renderCart() {
    const root = $('#cartItems');
    if (!root) return;
    const items = getCartProducts();
    root.replaceChildren();
    updateCartCount();

    if (!items.length) {
      root.append(createElement('p', 'cart-empty', 'سلتك فارغة حاليًا. أضف عطرًا من المجموعة لتبدأ.'));
    }

    items.forEach(item => {
      const row = createElement('div', 'cart-row');
      const photo = productImage(item.product, 'cart-photo');
      const info = createElement('div', 'cart-item-info');
      const name = createElement('strong', 'cart-item-name', text(item.product.name_ar));
      const price = createElement('div', 'cart-item-price');
      const current = unitPrice(item.product);
      if (current === null) {
        price.textContent = 'السعر عند الطلب';
      } else if (promoPhase() === 'active') {
        price.append(
          createElement('s', 'old-price', money(item.product.price_jod)),
          createElement('strong', 'sale-price', money(current))
        );
      } else {
        price.textContent = money(current);
      }

      const controls = createElement('div', 'quantity-controls');
      const decrease = createElement('button', 'quantity-button', '−');
      decrease.type = 'button';
      decrease.setAttribute('aria-label', 'تقليل كمية ' + text(item.product.name_ar));
      decrease.addEventListener('click', () => changeQuantity(item.id, -1));
      const quantity = createElement('span', 'quantity-value', String(item.qty));
      const increase = createElement('button', 'quantity-button', '+');
      increase.type = 'button';
      increase.setAttribute('aria-label', 'زيادة كمية ' + text(item.product.name_ar));
      increase.addEventListener('click', () => changeQuantity(item.id, 1));
      controls.append(decrease, quantity, increase);
      info.append(name, price, controls);

      const remove = createElement('button', 'remove-item', 'حذف');
      remove.type = 'button';
      remove.setAttribute('aria-label', 'حذف ' + text(item.product.name_ar) + ' من السلة');
      remove.addEventListener('click', () => removeFromCart(item.id));
      row.append(photo, info, remove);
      root.append(row);
    });

    const before = items.reduce((sum, item) => sum + (Number(item.product.price_jod) || 0) * item.qty, 0);
    const total = items.reduce((sum, item) => sum + (unitPrice(item.product) || 0) * item.qty, 0);
    const savings = Math.max(0, before - total);
    setText('#cartSubtotal', money(total));
    const discountRow = $('#cartDiscountRow');
    if (discountRow) {
      discountRow.hidden = promoPhase() !== 'active' || !items.length;
      setText('#cartSavings', '−' + money(savings));
    }
  }

  function addToCart(id) {
    const product = state.products.find(item => String(item.id) === String(id));
    if (!product) return;
    if (!Number.isFinite(Number(product.price_jod))) {
      alert('سعر هذا المنتج غير محدد حاليًا. تواصل معنا لتأكيد السعر.');
      return;
    }
    const existing = state.cart.find(item => String(item.id) === String(id));
    if (existing) existing.qty += 1;
    else state.cart.push({ id: String(id), qty: 1 });
    persistCart();
    renderCart();
    openCart();
  }

  function changeQuantity(id, delta) {
    const item = state.cart.find(candidate => String(candidate.id) === String(id));
    if (!item) return;
    item.qty = Math.max(0, item.qty + delta);
    state.cart = state.cart.filter(candidate => candidate.qty > 0);
    persistCart();
    renderCart();
  }

  function removeFromCart(id) {
    state.cart = state.cart.filter(item => String(item.id) !== String(id));
    persistCart();
    renderCart();
  }

  function openProductDialog(id) {
    const product = state.products.find(item => String(item.id) === String(id));
    if (!product) return;
    state.lastFocusedElement = document.activeElement;

    const root = $('#dialogContent');
    root.replaceChildren();
    const layout = createElement('div', 'dialog-layout');
    const photo = productImage(product, 'dialog-photo', true);
    const details = createElement('div', 'dialog-details');
    details.append(
      createElement('span', 'product-category', categoryFor(product)),
      createElement('h2', '', text(product.name_ar))
    );

    const price = createElement('div', 'product-price dialog-price');
    appendPrice(price, product);
    details.append(price);

    const size = cleanSize(product.size);
    if (size && size !== 'اختياري') details.append(createElement('p', 'dialog-size', 'الحجم: ' + size));

    const summary = shortDescription(product);
    if (summary) details.append(createElement('p', 'dialog-summary', summary));
    if (text(product.description)) {
      details.append(createElement('p', 'dialog-description', text(product.description).replace(/[_]+/g, ' ')));
    }

    const button = createElement('button', 'button button-primary dialog-add', 'أضف للسلة');
    button.type = 'button';
    button.addEventListener('click', () => {
      closeProductDialog();
      addToCart(product.id);
    });
    details.append(button);
    layout.append(photo, details);
    root.append(layout);

    const dialog = $('#productDialog');
    dialog.hidden = false;
    document.body.classList.add('dialog-open');
    $('#dialogClose')?.focus();
  }

  function closeProductDialog() {
    const dialog = $('#productDialog');
    if (!dialog || dialog.hidden) return;
    dialog.hidden = true;
    document.body.classList.remove('dialog-open');
    if (state.lastFocusedElement && typeof state.lastFocusedElement.focus === 'function') {
      state.lastFocusedElement.focus();
    }
  }

  function submitOrder(event) {
    event.preventDefault();
    const items = getCartProducts();
    if (!items.length) {
      alert('السلة فارغة. أضف منتجًا أولًا.');
      return;
    }

    const name = $('#customerName').value.trim();
    const phone = $('#customerPhone').value.trim();
    const method = $('#deliveryMethod').value;
    const address = $('#customerAddress').value.trim();

    if (!name || !phone || (method === 'delivery' && !address)) {
      alert('يرجى تعبئة بيانات الطلب كاملة.');
      return;
    }

    const invalidItem = items.some(item => !Number.isFinite(Number(item.product.price_jod)));
    if (invalidItem) {
      alert('يوجد منتج بلا سعر محدد. تواصل معنا لتأكيد السعر قبل إرسال الطلب.');
      return;
    }

    const before = items.reduce((sum, item) => sum + Number(item.product.price_jod) * item.qty, 0);
    const total = items.reduce((sum, item) => sum + (unitPrice(item.product) || 0) * item.qty, 0);
    const discount = Math.max(0, before - total);
    const active = promoPhase() === 'active';
    const lines = [
      'السلام عليكم، أريد تأكيد طلبي من أهل العود.',
      '',
      'الاسم: ' + name,
      'رقم الهاتف: ' + phone,
      'طريقة الاستلام: ' + (method === 'pickup' ? 'استلام من الفرع' : 'توصيل'),
      ...(method === 'delivery' ? ['العنوان: ' + address] : []),
      '',
      'تفاصيل الطلب:',
      ...items.map(item => {
        const current = (unitPrice(item.product) || 0) * item.qty;
        const original = Number(item.product.price_jod) * item.qty;
        return '• ' + text(item.product.name_ar) + ' × ' + item.qty + ' — ' + money(current) +
          (active ? ' (قبل الخصم: ' + money(original) + ')' : '');
      }),
      '',
      ...(active ? ['المجموع قبل الخصم: ' + money(before), 'خصم 50%: −' + money(discount)] : []),
      'المجموع النهائي للمنتجات: ' + money(total),
      ...(method === 'delivery' ? ['رسوم التوصيل: تُحدد من المتجر'] : ['الاستلام من الفرع']),
      '',
      'يرجى تأكيد الطلب والتفاصيل. شكرًا لكم.'
    ];

    const wa = text(config.whatsappNumber).replace(/\D/g, '');
    if (!wa) {
      alert('رقم واتساب المتجر غير مضبوط. لم يتم فتح رابط غير مؤكد.');
      return;
    }
    const url = 'https://wa.me/' + wa + '?text=' + encodeURIComponent(lines.join('\n'));
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  async function loadProducts() {
    const root = $('#products');
    const errorBox = $('#productsError');
    if (!root) return;
    if (errorBox) errorBox.hidden = true;
    root.setAttribute('aria-busy', 'true');

    try {
      if (!config.supabaseUrl || !config.supabaseAnonKey) {
        throw new Error('Store configuration is incomplete.');
      }
      if (!window.supabase) throw new Error('Supabase client did not load.');

      state.db = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
      });

      const { data, error } = await state.db
        .from('products')
        .select('id,name_ar,description_short,description,price_jod,size,category,image_url,status,sort_order,created_at')
        .eq('status', 'published')
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: false });

      if (error) throw error;
      state.products = Array.isArray(data) ? data : [];
      state.cart = state.cart.filter(item => state.products.some(product => String(product.id) === String(item.id)));
      persistCart();
      renderCategoryFilters();
      renderProducts();
      renderCart();

      if (!state.products.length) {
        root.append(createElement('div', 'empty-state', 'لا توجد منتجات منشورة حاليًا.'));
      }
    } catch (error) {
      console.error('AHL storefront load failed:', error);
      root.setAttribute('aria-busy', 'false');
      root.replaceChildren();
      if (errorBox) errorBox.hidden = false;
    }
  }

  function initSearch() {
    const panel = $('#searchPanel');
    const input = $('#searchInput');
    $('#searchToggle')?.addEventListener('click', () => {
      if (!panel) return;
      panel.hidden = !panel.hidden;
      if (!panel.hidden) input?.focus();
      else {
        state.search = '';
        setSearchValue('');
        renderProducts();
      }
    });
    $('#searchClear')?.addEventListener('click', () => {
      if (panel) panel.hidden = true;
      state.search = '';
      setSearchValue('');
      renderProducts();
    });
    input?.addEventListener('input', event => {
      state.search = event.target.value.trim().toLocaleLowerCase('ar');
      renderProducts();
    });
  }

  function initNavigation() {
    const nav = $('#mainNav');
    const menu = $('#menuToggle');
    menu?.addEventListener('click', () => {
      const expanded = menu.getAttribute('aria-expanded') === 'true';
      menu.setAttribute('aria-expanded', String(!expanded));
      nav?.classList.toggle('open', !expanded);
    });
    nav?.querySelectorAll('a').forEach(link => link.addEventListener('click', () => {
      nav.classList.remove('open');
      menu?.setAttribute('aria-expanded', 'false');
    }));
  }

  function initCart() {
    $('#cartOpen')?.addEventListener('click', openCart);
    $('#cartClose')?.addEventListener('click', closeCart);
    $('#pageOverlay')?.addEventListener('click', closeCart);
    $('#checkoutForm')?.addEventListener('submit', submitOrder);
    $('#deliveryMethod')?.addEventListener('change', event => {
      const isDelivery = event.target.value === 'delivery';
      $('#addressWrap').hidden = !isDelivery;
      $('#customerAddress').required = isDelivery;
    });
  }

  function initDialog() {
    $('#dialogClose')?.addEventListener('click', closeProductDialog);
    $('#productDialog')?.addEventListener('click', event => {
      if (event.target === $('#productDialog')) closeProductDialog();
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        closeCart();
        closeProductDialog();
        const search = $('#searchPanel');
        if (search && !search.hidden) search.hidden = true;
      }
    });
  }

  function init() {
    setText('#year', String(new Date().getFullYear()));
    loadCart();
    initSearch();
    initNavigation();
    initCart();
    initDialog();
    $('#retryProducts')?.addEventListener('click', loadProducts);
    updatePromotion();
    window.setInterval(updatePromotion, 1000);
    renderCart();
    loadProducts();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();