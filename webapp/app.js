const tg = window.Telegram?.WebApp || {
    initDataUnsafe: {},
    ready() {}, expand() {}, close() {}, sendData() {},
    HapticFeedback: { impactOccurred(){}, selectionChanged(){}, notificationOccurred(){} }
};
try { if (typeof tg.ready === 'function') tg.ready(); } catch(e) {}
try { if (typeof tg.expand === 'function') tg.expand(); } catch(e) {}
try {
    if (
        typeof tg.requestFullscreen === 'function' &&
        (typeof tg.isVersionAtLeast !== 'function' || tg.isVersionAtLeast('8.0'))
    ) {
        tg.requestFullscreen();
    }
} catch(e) {}

function toCssPx(value) {
    const num = Number(value);
    return Number.isFinite(num) && num > 0 ? `${num}px` : '0px';
}

function applyTelegramSafeInsets() {
    const root = document.documentElement;
    const safe = tg.safeAreaInset || {};
    const content = tg.contentSafeAreaInset || {};
    root.style.setProperty('--tg-safe-area-inset-top', toCssPx(safe.top));
    root.style.setProperty('--tg-safe-area-inset-right', toCssPx(safe.right));
    root.style.setProperty('--tg-safe-area-inset-bottom', toCssPx(safe.bottom));
    root.style.setProperty('--tg-safe-area-inset-left', toCssPx(safe.left));
    root.style.setProperty('--tg-content-safe-area-inset-top', toCssPx(content.top));
    root.style.setProperty('--tg-content-safe-area-inset-right', toCssPx(content.right));
    root.style.setProperty('--tg-content-safe-area-inset-bottom', toCssPx(content.bottom));
    root.style.setProperty('--tg-content-safe-area-inset-left', toCssPx(content.left));
}

applyTelegramSafeInsets();
if (typeof tg.onEvent === 'function') {
    try { tg.onEvent('safeAreaChanged', applyTelegramSafeInsets); } catch(e) {}
    try { tg.onEvent('contentSafeAreaChanged', applyTelegramSafeInsets); } catch(e) {}
    try { tg.onEvent('viewportChanged', applyTelegramSafeInsets); } catch(e) {}
}
setTimeout(applyTelegramSafeInsets, 120);

let cart = [];
let products = [];
let promoBanners = [];
let promoBannerTimer = null;
let promoBannerIndex = 0;
let promoSwipeBound = false;
let promoDragStartX = 0;
let promoDragCurrentX = 0;
let promoDragActive = false;
let deliveryType = 'delivery';
let paymentMethod = 'cash';
let promoApplied = false;
let deliveryAddress = '';
let pickupBranch = null;
let lastSavedAddress = '';
let profileLoaded = false;
let currentUserProfile = null;
let userRole = 'user';
let appSettings = { delivery_mode: 'all' };
let DELIVERY_COST = 15000;
let EVOS_BRANCHES = [];
let APP_CONFIG = {};
let MARKET_SETTINGS = {};
let HOME_SETTINGS = {};
let PRODUCT_CARD_SETTINGS = {};
let SYSTEM_MESSAGES = {};
let PROMO_CODES = {};
let appliedOffer = null;
let appliedPromoType = null;
let latestQuote = null;
let quoteTimer = null;
let MAP_CENTER = [41.2995, 69.2401];
let MAP_ZOOM = 12;
let maintenanceEnabled = false;
let maintenanceText = "Hozir texnik ishlar olib borilmoqda. Iltimos, keyinroq urinib ko'ring.";

const $ = id => document.getElementById(id);
const catalogEl = $('catalog'), cartItemsEl = $('cart-items'), cartEmptyEl = $('cart-empty');
const cartSummaryEl = $('cart-summary'), subtotalEl = $('subtotal'), deliveryCostEl = $('delivery-cost');
const totalPriceEl = $('total-price'), cartBadgeEl = $('cartBadge'), checkoutBtn = $('checkoutBtn');
const promoDiscountRow = $('promo-discount-row'), promoDiscountEl = $('promo-discount');
const segmentSlider = $('segmentSlider'), deliverySection = $('delivery-section');
const pickupSection = $('pickup-section'), promoInput = $('promoInput'), promoMsg = $('promoMsg');
const addressInput = $('addressInput'), suggestDropdown = $('suggestDropdown');
const categoryTabs = $('categoryTabs');

const modalOverlay = $('productModal'), modalClose = $('modalClose');
const modalImage = $('modalImage'), modalTitle = $('modalTitle'), modalDesc = $('modalDesc');
const modalVariants = $('modalVariants'), modalPrice = $('modalPrice'), modalAddBtn = $('modalAddBtn');
if (modalOverlay && modalOverlay.parentElement !== document.body) {
    document.body.appendChild(modalOverlay);
}

var fmt = window.AppDom?.fmtMoney || function(n) { return Number(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' '); };
var escHtml = window.AppDom?.escapeHtml || function(value) {
    return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
};
var fmtShort = window.AppDom?.fmtShort || function(n) {
    n = Number(n) || 0;
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1) + 'M';
    if (n >= 1_000)     return (n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1) + 'k';
    return fmt(n);
};
function getCartQty(id, variant=null) { 
    return cart.filter(x => x.id === id && (variant ? x.variant === variant : true)).reduce((s, c) => s + c.quantity, 0); 
}
function getProductCartQty(product) {
    return cart.filter(x => Number(x.id) === Number(product.id)).reduce((s, c) => s + c.quantity, 0);
}
function productNeedsSelection(product) {
    return Array.isArray(product?.variants) && product.variants.length > 0;
}
var haptic = window.AppDom?.haptic || function(type, val) { try { tg.HapticFeedback[type](val); } catch(e) {} };
function normalizeText(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/[.,;:!?'"`()]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}
function formatPhoneNumber(digits) {
    if (!digits || digits.length === 0) return '';
    if (digits.length <= 2) return `(${digits}`;
    if (digits.length <= 5) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2, 5)}-${digits.slice(5)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 5)}-${digits.slice(5, 7)}-${digits.slice(7, 9)}`;
}

function validatePhoneNumber(phone) {
    const digits = phone.replace(/\D/g, '');
    return digits.length === 12 && digits.startsWith('998');
}

function formatUzbekistanPhone(input) {
    const digits = input.replace(/\D/g, '');
    if (digits.startsWith('998')) {
        const localDigits = digits.slice(3);
        const limitedDigits = localDigits.slice(0, 9);
        return '+998 ' + formatPhoneNumber(limitedDigits);
    } else if (digits.startsWith('9')) {
        const limitedDigits = digits.slice(0, 9);
        return '+998 ' + formatPhoneNumber(limitedDigits);
    } else {
        const limitedDigits = digits.slice(0, 9);
        if (limitedDigits.length > 0) {
            return '+998 ' + formatPhoneNumber(limitedDigits);
        }
        return '+998 ';
    }
}

$('searchInput').addEventListener('input', () => renderProducts());

async function loadProducts() {
    try {
        const resp = await fetch('/api/products');
        if (resp.ok) products = await resp.json();
    } catch(e) { console.warn('Products load fail:', e); }
    products.forEach(p => {
        if (typeof p.variants === 'string') {
            try { p.variants = JSON.parse(p.variants); } catch(e) { p.variants = []; }
        }
    });
    buildCategories();
    renderProducts();
}

async function loadSettings() {
    try {
        const resp = await fetch('/api/settings');
        if (resp.ok) appSettings = await resp.json();
    } catch(e) {}
    applySettings();
}

function applySettings() {
    const deliveryOnly = appSettings.delivery_mode === 'delivery_only';
    const pickupOnly = appSettings.delivery_mode === 'pickup_only';
    
    const officesNav = document.querySelector('[data-tab="offices"]');
    if (officesNav) officesNav.classList.toggle('nav-hidden', deliveryOnly);
    
    const segToggle = document.querySelector('.segment-toggle');
    if (segToggle) {
        if (deliveryOnly || pickupOnly) segToggle.style.display = 'none';
        else segToggle.style.display = 'flex';
    }
    
    if (deliveryOnly) {
        deliveryType = 'delivery';
        segmentSlider.classList.remove('right');
        deliverySection.style.display = 'block';
        pickupSection.style.display = 'none';
        document.querySelectorAll('.segment-btn').forEach(b => b.classList.toggle('active', b.dataset.type === 'delivery'));
    } else if (pickupOnly) {
        deliveryType = 'pickup';
        segmentSlider.classList.add('right');
        deliverySection.style.display = 'none';
        pickupSection.style.display = 'block';
        document.querySelectorAll('.segment-btn').forEach(b => b.classList.toggle('active', b.dataset.type === 'pickup'));
        initPickupMap();
    }
}

function applyTheme() {
    const theme = (window.CurrentTemplateConfig?.theme || APP_CONFIG.theme || {});
    const root = document.documentElement;
    if (window.ColorTheme) window.ColorTheme.apply(theme);
    if (APP_CONFIG.store_name) document.title = APP_CONFIG.store_name;
}
function parseJsonList(raw) {
    if (Array.isArray(raw)) return raw;
    try {
        const parsed = JSON.parse(raw || '[]');
        return Array.isArray(parsed) ? parsed : [];
    } catch(e) {
        return [];
    }
}

function isEmptyPhoneValue(phone) {
    return !phone || phone.trim() === '+998 ' || phone.replace(/\D/g, '').length <= 3;
}

function setupPhoneInput(input) {
    if (!input || input.dataset.phoneReady === '1') return;
    input.dataset.phoneReady = '1';
    if (!input.value) input.value = '+998 ';
    input.addEventListener('input', function() {
        this.value = formatUzbekistanPhone(this.value);
    });
    input.setAttribute('inputmode', 'numeric');
    input.setAttribute('maxlength', '19');
}

function telegramNamePayload() {
    const u = tg.initDataUnsafe?.user || {};
    return {
        first_name: u.first_name || '',
        last_name: u.last_name || ''
    };
}

function shadeHex(hex, percent) {
    const value = String(hex || '').replace('#', '');
    if (!/^[0-9a-f]{6}$/i.test(value)) return hex;
    const amount = Math.round(2.55 * percent);
    const next = [0, 2, 4].map(i => {
        const channel = Math.max(0, Math.min(255, parseInt(value.slice(i, i + 2), 16) + amount));
        return channel.toString(16).padStart(2, '0');
    });
    return '#' + next.join('');
}

function resetMaps() {
    pickupDone = false;
    officesDone = false;
    if (pickupMap) { pickupMap.remove(); pickupMap = null; }
    if (officesMap) { officesMap.remove(); officesMap = null; }
}

function applyMaintenanceMode() {
    const overlay = $('maintenanceOverlay');
    if (!overlay) return;
    const isStaff = ['admin', 'owner', 'deliver'].includes(userRole);
    $('maintenanceText').textContent = maintenanceText;
    overlay.style.display = maintenanceEnabled && !isStaff ? 'flex' : 'none';
}

function applyRuntimeConfig(cfg = APP_CONFIG) {
    APP_CONFIG = cfg || {};
    if (window.TemplateEngine) {
        APP_CONFIG = window.TemplateEngine.apply(APP_CONFIG);
    }
    window.APP_CONFIG = APP_CONFIG;
    MARKET_SETTINGS = APP_CONFIG.market_settings || {};
    HOME_SETTINGS = APP_CONFIG.home_settings || {};
    const storeName = APP_CONFIG.store_name || MARKET_SETTINGS.name || HOME_SETTINGS.hero_title || '';
    const storeWelcome = APP_CONFIG.store_welcome || MARKET_SETTINGS.description || HOME_SETTINGS.hero_subtitle || '';
    MARKET_SETTINGS = { ...MARKET_SETTINGS, ...(storeName ? { name: storeName } : {}), ...(storeWelcome ? { description: storeWelcome } : {}) };
    HOME_SETTINGS = { ...HOME_SETTINGS, ...(storeName ? { hero_title: storeName } : {}), ...(storeWelcome ? { hero_subtitle: storeWelcome } : {}) };
    PRODUCT_CARD_SETTINGS = APP_CONFIG.product_card_settings || {};
    SYSTEM_MESSAGES = APP_CONFIG.system_messages || {};
    EVOS_BRANCHES = APP_CONFIG.branches || [];
    promoBanners = Array.isArray(APP_CONFIG.banners) ? APP_CONFIG.banners : [];
    DELIVERY_COST = APP_CONFIG.delivery_rates?.base || 15000;
    PROMO_CODES = APP_CONFIG.promo_codes || {};
    MAP_CENTER = APP_CONFIG.map_center || [41.2995, 69.2401];
    MAP_ZOOM = APP_CONFIG.map_zoom || 12;
    maintenanceEnabled = String(APP_CONFIG.maintenance_enabled || '0') === '1';
    maintenanceText = APP_CONFIG.maintenance_text || maintenanceText;
    appSettings.delivery_mode = APP_CONFIG.delivery_mode || appSettings.delivery_mode || 'all';
    applyTheme();
    if (window.ColorTheme) {
        window.ColorTheme.syncStoreName(
            storeName || MARKET_SETTINGS.name || HOME_SETTINGS.hero_title,
            storeWelcome || MARKET_SETTINGS.description || HOME_SETTINGS.hero_subtitle
        );
        window.ColorTheme.apply(APP_CONFIG.theme || {});
    }
    if ($('searchInput')) $('searchInput').placeholder = HOME_SETTINGS.search_placeholder || 'Qidirish';
    if ($('cart-empty') && SYSTEM_MESSAGES.empty_cart) {
        const text = $('cart-empty').querySelector('p');
        if (text) text.textContent = SYSTEM_MESSAGES.empty_cart;
    }
    renderPromoCarousel();
    applySettings();
    buildCategories();
    renderProducts();
    resetMaps();
    applyMaintenanceMode();
}

let activeCategory = 'Barchasi';
function buildCategories() {
    const cfgCats = Array.isArray(APP_CONFIG.categories) ? APP_CONFIG.categories : [];
    const cats = ['Barchasi', ...new Set([...cfgCats, ...products.map(p => p.category)].filter(c => c && c !== 'Barchasi'))];
    categoryTabs.innerHTML = '';
    cats.forEach(cat => {
        const btn = document.createElement('button');
        btn.className = 'tab' + (cat === activeCategory ? ' active' : '');
        btn.textContent = cat;
        btn.onclick = () => {
            activeCategory = cat;
            document.querySelectorAll('.category-tabs .tab').forEach(t => t.classList.remove('active'));
            btn.classList.add('active');
            renderProducts();
        };
        categoryTabs.appendChild(btn);
    });
}

function buildProductCard(p) {
    const hasDiscount = p.discount_percent > 0;
    const isBogo = p.is_bogo === 1;
    const outOfStock = p.stock === 0;
    const showPrice = PRODUCT_CARD_SETTINGS.show_price !== false;
    const showDiscount = PRODUCT_CARD_SETTINGS.show_discount !== false;
    const showButton = PRODUCT_CARD_SETTINGS.show_button !== false;
    const showBadges = PRODUCT_CARD_SETTINGS.show_badges !== false;
    let displayPrice = p.price;
    if (p.variants && p.variants.length > 0) displayPrice = p.variants[0].price;
    const discountedPrice = hasDiscount ? Math.round(displayPrice * (1 - p.discount_percent / 100)) : displayPrice;
    const oldPrice = Number(p.old_price || 0);

    const card = document.createElement('article');
    card.className = 'product-card';

    let badges = '';
    const seenBadges = new Set();
    const customBadges = [
        ...parseJsonList(p.badges),
        p.bestseller ? 'Bestseller' : '',
        p.is_new ? 'Yangi' : '',
        p.limited ? 'Limited' : '',
        p.featured ? 'Top' : ''
    ]
        .map(label => String(label || '').trim())
        .filter(Boolean)
        .filter(label => {
            if (hasDiscount && /^-\d+%$/.test(label)) return false;
            const key = label.toLowerCase();
            if (seenBadges.has(key)) return false;
            seenBadges.add(key);
            return true;
        });
    if (showBadges && (hasDiscount || isBogo || outOfStock || customBadges.length)) {
        badges = '<div class="card-badges">';
        if (hasDiscount && showDiscount) badges += `<span class="badge badge-discount">-${p.discount_percent}%</span>`;
        if (isBogo) badges += '<span class="badge badge-bogo">1+1</span>';
        customBadges.slice(0, 2).forEach(label => { badges += `<span class="badge badge-bogo">${escHtml(label)}</span>`; });
        if (outOfStock) badges += `<span class="badge badge-out">Sotuvda yo'q</span>`;
        badges += '</div>';
    }
    let priceHtml;
    if (!showPrice) {
        priceHtml = '';
    } else if (p.variants && p.variants.length > 0) {
        const oldVariantPrice = oldPrice > discountedPrice ? `<p class="card-old-price">${fmt(oldPrice)} so'm</p>` : '';
        priceHtml = `<div class="price-stack">${oldVariantPrice}<p class="card-price"><span>${fmt(discountedPrice)} so'm</span><small>dan</small></p></div>`;
    } else if (hasDiscount && showDiscount) {
        priceHtml = `<div class="price-stack"><p class="card-old-price">${fmt(oldPrice > discountedPrice ? oldPrice : displayPrice)} so'm</p><p class="card-price"><span>${fmt(discountedPrice)} so'm</span></p></div>`;
    } else if (oldPrice > displayPrice) {
        priceHtml = `<div class="price-stack"><p class="card-old-price">${fmt(oldPrice)} so'm</p><p class="card-price"><span>${fmt(displayPrice)} so'm</span></p></div>`;
    } else {
        priceHtml = `<div class="price-stack"><p class="card-price"><span>${fmt(displayPrice)} so'm</span></p></div>`;
    }

    const firstImg = p.image ? p.image.split(',')[0] : '';
    const imageHtml = firstImg
        ? `<img class="card-image-img" src="/uploads/${firstImg}" alt="${escHtml(p.name)}" loading="lazy" onerror="this.closest('.card-image').classList.add('image-fallback'); this.remove();">`
        : '<div class="product-image-placeholder"><i class="fi fi-rr-gift"></i></div>';
    const cartQty = getProductCartQty(p);
    const actionHtml = cartQty > 0
        ? `<div class="card-qty-controls product-card-stepper">
                <button class="card-qty-btn card-minus" type="button"><span class="qty-symbol" aria-hidden="true">-</span></button>
                <span class="card-qty-value">${cartQty}</span>
                <button class="card-qty-btn card-plus" type="button"><span class="qty-symbol" aria-hidden="true">+</span></button>
           </div>`
        : `${showButton ? `<button class="card-btn" ${outOfStock ? 'disabled' : ''}>${outOfStock ? "Sotuvda yo'q" : 'Tanlash'}</button>` : ''}`;
    card.innerHTML = `
        <div class="card-image-wrap">${badges}<div class="card-image ${firstImg ? '' : 'image-fallback'}">${imageHtml}</div></div>
        <div class="card-body">
            <p class="card-name">${p.name}</p>
            <div class="card-bottom">
                <div class="card-price-wrap">${priceHtml}</div>
                ${actionHtml}
            </div>
        </div>`;

    if (!outOfStock) {
        card.onclick = () => openModal(p);
        const cardBtn = card.querySelector('.card-btn');
        if (cardBtn) cardBtn.onclick = (e) => { e.stopPropagation(); openModal(p); };
        const plusBtn = card.querySelector('.card-plus');
        const minusBtn = card.querySelector('.card-minus');
        if (plusBtn) plusBtn.onclick = (e) => {
            e.stopPropagation();
            if (productNeedsSelection(p)) openModal(p);
            else addDefaultProductToCart(p);
        };
        if (minusBtn) minusBtn.onclick = (e) => { e.stopPropagation(); removeDefaultProductFromCart(p); };
    }
    return card;
}

function renderProducts() {
    catalogEl.innerHTML = '';
    const search = normalizeText($('searchInput').value);
    let filtered = activeCategory === 'Barchasi' ? products : products.filter(p => p.category === activeCategory);
    if (search) {
        const tokens = search.split(' ').filter(Boolean);
        filtered = filtered.filter(p => {
            const haystack = normalizeText([
                p.name, p.category, p.description, p.sku, p.keywords,
                Array.isArray(p.variants) ? p.variants.map(v => v.size).join(' ') : p.variants
            ].join(' '));
            return tokens.every(token => haystack.includes(token));
        });
    }

    if (activeCategory === 'Barchasi') {
        const groups = {};
        filtered.forEach(p => { if (!groups[p.category]) groups[p.category] = []; groups[p.category].push(p); });
        Object.entries(groups).forEach(([cat, prods]) => {
            const groupEl = document.createElement('div');
            groupEl.className = 'catalog-group';
            const titleEl = document.createElement('div');
            titleEl.className = 'catalog-group-title';
            titleEl.textContent = cat;
            groupEl.appendChild(titleEl);
            const grid = document.createElement('div');
            grid.className = 'product-grid';
            prods.forEach(p => {
                const card = buildProductCard(p);
                grid.appendChild(card);
            });
            groupEl.appendChild(grid);
            catalogEl.appendChild(groupEl);
        });
    } else {
        const grid = document.createElement('div');
        grid.className = 'product-grid';
        catalogEl.appendChild(grid);
        filtered.forEach(p => {
            const card = buildProductCard(p);
            grid.appendChild(card);
        });
    }
}


let currentProduct = null;
let currentVariant = null;
let currentProductImages = [];
let currentImageIndex = 0;

function updateModalImage() {
    if (currentProductImages.length === 0) {
        modalImage.style.backgroundImage = '';
        $('modalImageIndicators').innerHTML = '';
        return;
    }
    const img = currentProductImages[currentImageIndex];
    modalImage.style.backgroundImage = `url(/uploads/${img})`;
    
    if (currentProductImages.length > 1) {
        $('modalImageIndicators').innerHTML = currentProductImages.map((_, i) => 
            `<div class="modal-img-dot ${i === currentImageIndex ? 'active' : ''}"></div>`
        ).join('');
    } else {
        $('modalImageIndicators').innerHTML = '';
    }
}

let touchStartX = 0;
let touchEndX = 0;

$('modalImageWrap').addEventListener('touchstart', e => {
    touchStartX = e.changedTouches[0].screenX;
}, {passive: true});

$('modalImageWrap').addEventListener('touchend', e => {
    touchEndX = e.changedTouches[0].screenX;
    handleSwipe();
}, {passive: true});

function handleSwipe() {
    if (currentProductImages.length <= 1) return;
    const threshold = 40;
    if (touchEndX < touchStartX - threshold) {
        currentImageIndex = (currentImageIndex + 1) % currentProductImages.length;
        updateModalImage();
        haptic('selectionChanged');
    }
    if (touchEndX > touchStartX + threshold) {
        currentImageIndex = (currentImageIndex - 1 + currentProductImages.length) % currentProductImages.length;
        updateModalImage();
        haptic('selectionChanged');
    }
}

function openModal(p) {
    currentProduct = p;
    modalTitle.textContent = p.name;
    modalDesc.textContent = p.description || '';
    
    currentProductImages = p.image ? p.image.split(',') : [];
    currentImageIndex = 0;
    updateModalImage();

    modalVariants.innerHTML = '';
    currentVariant = null;

    if (p.variants && p.variants.length > 0) {
        p.variants.forEach((v, i) => {
            const btn = document.createElement('button');
            btn.className = 'variant-btn' + (i === 0 ? ' active' : '');
            btn.textContent = v.size;
            btn.onclick = () => {
                document.querySelectorAll('.variant-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentVariant = v;
                updateModalPrice();
            };
            modalVariants.appendChild(btn);
        });
        currentVariant = p.variants[0];
    }

    updateModalPrice();
    window.Motion ? window.Motion.open(modalOverlay) : modalOverlay.classList.add('open');
    document.body.classList.add('modal-lock');
    haptic('impactOccurred', 'light');
}

function renderPromoCarousel() {
    const wrap = $('promoCarousel'), track = $('promoCarouselTrack'), dots = $('promoCarouselDots');
    if (!wrap || !track || !dots) return;
    clearInterval(promoBannerTimer);
    track.innerHTML = '';
    dots.innerHTML = '';
    const banners = promoBanners.filter(b => b.image);
    if (wrap.dataset.templateHidden === 'true') {
        wrap.style.display = 'none';
        return;
    }
    wrap.style.display = banners.length ? 'block' : 'none';
    if (!banners.length) return;
    promoBannerIndex = Math.min(promoBannerIndex, banners.length - 1);
    banners.forEach((banner, i) => {
        const slide = document.createElement('div');
        slide.className = 'promo-slide';
        slide.style.backgroundImage = `url(/uploads/${banner.image})`;
        if (banner.title || banner.subtitle || banner.action_text) {
            slide.innerHTML = `
                <span class="promo-slide-copy">
                    ${banner.title ? `<b>${escHtml(banner.title)}</b>` : ''}
                    ${banner.subtitle ? `<small>${escHtml(banner.subtitle)}</small>` : ''}
                    ${banner.action_text ? `<em>${escHtml(banner.action_text)}</em>` : ''}
                </span>`;
        }
        if (banner.target) {
            slide.classList.add('clickable');
            slide.onclick = () => {
                const target = String(banner.target || '');
                const category = target.startsWith('category:') ? target.slice(9) : '';
                const productId = target.startsWith('product:') ? Number(target.slice(8)) : 0;
                if (category) {
                    activeCategory = category;
                    buildCategories();
                    renderProducts();
                    document.querySelector('[data-tab="home"]')?.click();
                } else if (productId) {
                    const product = products.find(p => Number(p.id) === productId);
                    if (product) openModal(product);
                } else if (target.startsWith('#')) {
                    document.querySelector(target)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                } else if (/^https?:\/\//i.test(target)) {
                    window.open(target, '_blank');
                }
            };
        }
        track.appendChild(slide);
        const dot = document.createElement('button');
        dot.className = 'promo-dot' + (i === promoBannerIndex ? ' active' : '');
        dot.onclick = () => setPromoSlide(i, banners);
        dots.appendChild(dot);
    });
    setPromoSlide(promoBannerIndex, banners);
    bindPromoCarouselSwipe();
    const interval = Math.max(1500, Number(banners[promoBannerIndex]?.interval_ms || 4500));
    if (banners.length > 1) {
        promoBannerTimer = setInterval(() => setPromoSlide((promoBannerIndex + 1) % banners.length, banners), interval);
    }
}

function setPromoSlide(index, banners = promoBanners) {
    const track = $('promoCarouselTrack'), dots = $('promoCarouselDots');
    if (!track || !dots) return;
    const count = Math.max(1, banners.filter ? banners.filter(b => b.image).length : banners.length);
    promoBannerIndex = Math.max(0, Math.min(index, count - 1));
    track.style.transform = `translateX(${-promoBannerIndex * 100}%)`;
    [...dots.children].forEach((dot, i) => dot.classList.toggle('active', i === promoBannerIndex));
}

function bindPromoCarouselSwipe() {
    const wrap = $('promoCarousel'), track = $('promoCarouselTrack');
    if (!wrap || !track || promoSwipeBound) return;
    promoSwipeBound = true;
    const pointX = e => e.touches ? e.touches[0].clientX : e.clientX;
    const start = e => {
        const slides = promoBanners.filter(b => b.image);
        if (slides.length <= 1) return;
        promoDragActive = true;
        promoDragStartX = pointX(e);
        promoDragCurrentX = promoDragStartX;
        clearInterval(promoBannerTimer);
        track.classList.add('dragging');
    };
    const move = e => {
        if (!promoDragActive) return;
        promoDragCurrentX = pointX(e);
        const width = wrap.clientWidth || 1;
        const delta = promoDragCurrentX - promoDragStartX;
        track.style.transform = `translateX(calc(${-promoBannerIndex * 100}% + ${delta}px))`;
        if (Math.abs(delta) > 8 && e.cancelable) e.preventDefault();
    };
    const end = () => {
        if (!promoDragActive) return;
        const slides = promoBanners.filter(b => b.image);
        const delta = promoDragCurrentX - promoDragStartX;
        const threshold = Math.max(48, (wrap.clientWidth || 320) * 0.18);
        track.classList.remove('dragging');
        if (delta <= -threshold) setPromoSlide(Math.min(promoBannerIndex + 1, slides.length - 1), slides);
        else if (delta >= threshold) setPromoSlide(Math.max(promoBannerIndex - 1, 0), slides);
        else setPromoSlide(promoBannerIndex, slides);
        promoDragActive = false;
        haptic('selectionChanged');
    };
    wrap.addEventListener('touchstart', start, { passive: true });
    wrap.addEventListener('touchmove', move, { passive: false });
    wrap.addEventListener('touchend', end, { passive: true });
    wrap.addEventListener('pointerdown', e => {
        if (e.pointerType === 'touch') return;
        start(e);
        wrap.setPointerCapture?.(e.pointerId);
    });
    wrap.addEventListener('pointermove', move);
    wrap.addEventListener('pointerup', end);
    wrap.addEventListener('pointercancel', end);
}

function closeProductModal() {
    const unlock = () => document.body.classList.remove('modal-lock');
    if (window.Motion) window.Motion.close(modalOverlay, 'open', unlock);
    else {
        modalOverlay.classList.remove('open');
        unlock();
    }
}

function updateModalPrice() {
    if (!currentProduct) return;
    let base = currentProduct.price;
    if (currentVariant) base = currentVariant.price;
    const hasDiscount = currentProduct.discount_percent > 0;
    const dp = hasDiscount ? Math.round(base * (1 - currentProduct.discount_percent / 100)) : base;
    const oldPrice = Number(currentProduct.old_price || 0);
    const crossed = hasDiscount ? base : (oldPrice > dp ? oldPrice : 0);
    modalPrice.innerHTML = crossed ? `<span style="text-decoration:line-through;color:#888;font-size:14px;margin-right:6px">${fmt(crossed)}</span>${fmt(dp)} so'm` : `${fmt(dp)} so'm`;
}

modalClose.onclick = closeProductModal;
modalOverlay.onclick = e => { if (e.target === modalOverlay) closeProductModal(); };

modalAddBtn.onclick = () => {
    if (!currentProduct) return;
    const p = currentProduct;
    let basePrice = p.price;
    let variantName = '';
    if (currentVariant) {
        basePrice = currentVariant.price;
        variantName = currentVariant.size;
    }
    const finalPrice = p.discount_percent > 0 ? Math.round(basePrice * (1 - p.discount_percent / 100)) : basePrice;

    const firstImage = currentProductImages.length > 0 ? currentProductImages[0] : '';
    const e = cart.find(x => x.id === p.id && x.variant === variantName);
    if (e) e.quantity++; else {
        cart.push({ id: p.id, name: p.name, price: finalPrice, originalPrice: basePrice, quantity: 1, variant: variantName, image: firstImage });
    }
    updateCartBadge();
    renderProducts();
    renderCart();
    closeProductModal();
    haptic('notificationOccurred', 'success');
};

function addToCartObj(item) {
    const e = cart.find(x => x.id === item.id && x.variant === item.variant);
    if (e) e.quantity++;
    updateCartBadge(); renderCart(); renderProducts(); haptic('impactOccurred', 'light');
}
function removeFromCartObj(item) {
    const i = cart.findIndex(x => x.id === item.id && x.variant === item.variant);
    if (i !== -1) { cart[i].quantity--; if (cart[i].quantity <= 0) cart.splice(i, 1); }
    updateCartBadge(); renderCart(); renderProducts(); haptic('impactOccurred', 'light');
}
function updateCartBadge() {
    const t = cart.reduce((s, c) => s + c.quantity, 0);
    cartBadgeEl.style.display = t > 0 ? 'flex' : 'none'; cartBadgeEl.textContent = t;
}

function addDefaultProductToCart(product) {
    if (!product || product.stock === 0) return;
    let basePrice = product.price;
    let variantName = '';
    if (product.variants && product.variants.length > 0) {
        basePrice = product.variants[0].price;
        variantName = product.variants[0].size;
    }
    const finalPrice = product.discount_percent > 0 ? Math.round(basePrice * (1 - product.discount_percent / 100)) : basePrice;
    const firstImage = product.image ? product.image.split(',')[0] : '';
    const item = cart.find(x => Number(x.id) === Number(product.id) && x.variant === variantName);
    if (item) item.quantity++;
    else cart.push({ id: product.id, name: product.name, price: finalPrice, originalPrice: basePrice, quantity: 1, variant: variantName, image: firstImage });
    updateCartBadge();
    renderProducts();
    renderCart();
    haptic('impactOccurred', 'light');
}

function removeDefaultProductFromCart(product) {
    if (!product) return;
    let index = -1;
    for (let i = cart.length - 1; i >= 0; i--) {
        if (Number(cart[i].id) === Number(product.id)) {
            index = i;
            break;
        }
    }
    if (index !== -1) {
        cart[index].quantity--;
        if (cart[index].quantity <= 0) cart.splice(index, 1);
    }
    updateCartBadge();
    renderProducts();
    renderCart();
    haptic('impactOccurred', 'light');
}

function cartQuotePayload(promoCode = null) {
    return {
        user_id: tg.initDataUnsafe?.user?.id || 0,
        items: cart.map(c => ({ id: c.id, variant: c.variant, quantity: c.quantity })),
        delivery_type: deliveryType,
        payment_method: paymentMethod,
        promo: promoCode
    };
}

function renderQuoteSummary(quote) {
    if (!quote || !quote.success) return false;
    subtotalEl.textContent = fmt(Math.max(0, (quote.subtotal || 0) - (quote.discount_amount || 0))) + " so'm";
    if (promoDiscountRow && promoDiscountEl) {
        const anyDiscount = (quote.discount_amount || 0) > 0 || (quote.delivery_discount || 0) > 0;
        promoDiscountRow.style.display = anyDiscount ? 'flex' : 'none';
        const parts = [];
        if (quote.discount_amount) parts.push('-' + fmt(quote.discount_amount) + " so'm");
        if (quote.delivery_discount) parts.push('delivery -' + fmt(quote.delivery_discount) + " so'm");
        promoDiscountEl.textContent = parts.join(', ');
    }
    deliveryCostEl.textContent = deliveryType === 'delivery' ? (quote.delivery_cost ? fmt(quote.delivery_cost) + " so'm" : 'Bepul') : 'Bepul';
    totalPriceEl.textContent = fmt(quote.total || 0) + " so'm";
    return true;
}

async function requestOrderQuote(showPromoMessage = false) {
    if (!cart.length) return null;
    const code = promoInput.value.trim().toUpperCase();
    try {
        const resp = await fetch('/api/order/quote', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(cartQuotePayload(code || null))
        });
        const quote = await resp.json();
        if (!quote.success) throw new Error(quote.error || 'Quote error');
        latestQuote = quote;
        if (code) {
            promoApplied = Boolean(quote.promo_valid);
            appliedOffer = quote.price_details?.promo_snapshot || null;
            appliedPromoType = appliedOffer?.promo_type || null;
            promoMsg.textContent = quote.promo_message || (quote.promo_valid ? "Promokod qo'llandi" : "Promokod qo'llanmadi");
            promoMsg.className = 'promo-msg ' + (quote.promo_valid ? 'success' : 'error');
        } else if (showPromoMessage) {
            promoApplied = false;
            appliedOffer = null;
            appliedPromoType = null;
            promoMsg.textContent = '';
            promoMsg.className = 'promo-msg';
        }
        updateSummary();
        return quote;
    } catch (e) {
        if (showPromoMessage) {
            promoApplied = false;
            appliedOffer = null;
            appliedPromoType = null;
            promoMsg.textContent = e.message || "Promo kodni tekshirishda xatolik";
            promoMsg.className = 'promo-msg error';
        }
        return null;
    }
}

function scheduleQuoteRefresh() {
    clearTimeout(quoteTimer);
    latestQuote = null;
    quoteTimer = setTimeout(() => requestOrderQuote(false), 250);
}

function renderCart() {
    if (cart.length === 0) {
        cartItemsEl.innerHTML = '';
        cartEmptyEl.style.display = 'flex';
        cartSummaryEl.style.display = 'none';
        latestQuote = null;
        if (promoDiscountRow) promoDiscountRow.style.display = 'none';
        return;
    }
    cartEmptyEl.style.display = 'none'; cartSummaryEl.style.display = 'block';
    cartItemsEl.innerHTML = '';
    cart.forEach(item => {
        const el = document.createElement('div'); el.className = 'cart-item';
        el.dataset.productId = item.id;
        const firstImg = item.image ? item.image.split(',')[0] : '';
        const bgImg = firstImg ? `background-image:url(/uploads/${firstImg});background-size:cover` : '';
        const varTxt = item.variant ? `<span style="font-size:11px;color:var(--text-secondary)">${item.variant}</span>` : '';
        el.innerHTML = `
            <div class="cart-item-img" style="${bgImg}"></div>
            <div class="cart-item-info">
                <p class="cart-item-name">${item.name} ${varTxt}</p>
                <p class="cart-item-price">${fmt(item.price * item.quantity)} so'm</p>
            </div>
            <div class="cart-item-controls">
                <button class="qty-btn minus"><span class="qty-symbol" aria-hidden="true">-</span></button>
                <span class="qty-value">${item.quantity}</span>
                <button class="qty-btn plus"><span class="qty-symbol" aria-hidden="true">+</span></button>
            </div>`;
        el.querySelector('.minus').onclick = () => removeFromCartObj(item);
        el.querySelector('.plus').onclick = () => addToCartObj(item);
        el.querySelector('.cart-item-img').onclick = () => {
            const product = products.find(p => Number(p.id) === Number(item.id));
            if (product) openModal(product);
        };
        el.querySelector('.cart-item-info').onclick = () => {
            const product = products.find(p => Number(p.id) === Number(item.id));
            if (product) openModal(product);
        };
        cartItemsEl.appendChild(el);
    });
    updateSummary();
    scheduleQuoteRefresh();
}
function updateSummary() {
    if (renderQuoteSummary(latestQuote)) {
        if (deliveryType === 'delivery') {
            if (!deliveryAddress) { checkoutBtn.textContent = 'Manzilni kiriting'; checkoutBtn.disabled = true; }
            else { checkoutBtn.textContent = 'Buyurtma berish'; checkoutBtn.disabled = false; }
        } else {
            if (!pickupBranch) { checkoutBtn.textContent = 'Filialni tanlang'; checkoutBtn.disabled = true; }
            else { checkoutBtn.textContent = 'Buyurtma berish'; checkoutBtn.disabled = false; }
        }
        return;
    }
    subtotalEl.textContent = '...';
    deliveryCostEl.textContent = '...';
    totalPriceEl.textContent = '...';
    if (promoDiscountRow) promoDiscountRow.style.display = 'none';

    if (deliveryType === 'delivery') {
        if (!deliveryAddress) { checkoutBtn.textContent = 'Manzilni kiriting'; checkoutBtn.disabled = true; }
        else { checkoutBtn.textContent = 'Buyurtma berish'; checkoutBtn.disabled = false; }
    } else {
        if (!pickupBranch) { checkoutBtn.textContent = 'Filialni tanlang'; checkoutBtn.disabled = true; }
        else { checkoutBtn.textContent = 'Buyurtma berish'; checkoutBtn.disabled = false; }
    }
}

document.querySelectorAll('.segment-btn').forEach(btn => {
    btn.onclick = () => {
        if (appSettings.delivery_mode === 'delivery_only') return;
        document.querySelectorAll('.segment-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active'); deliveryType = btn.dataset.type;
        if (deliveryType === 'pickup') {
            segmentSlider.classList.add('right'); deliverySection.style.display = 'none'; pickupSection.style.display = 'block'; initPickupMap();
        } else {
            segmentSlider.classList.remove('right'); deliverySection.style.display = 'block'; pickupSection.style.display = 'none';
        }
        latestQuote = null;
        updateSummary();
        scheduleQuoteRefresh();
    };
});

document.querySelectorAll('[data-pay]').forEach(btn => {
    btn.onclick = () => {
        document.querySelectorAll('[data-pay]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active'); paymentMethod = btn.dataset.pay;
        scheduleQuoteRefresh();
    };
});

$('applyPromoBtn').onclick = async () => {
    const code = promoInput.value.trim().toUpperCase();
    if (code === '') {
        promoApplied = false; appliedOffer = null; appliedPromoType = null; latestQuote = null; promoMsg.textContent = ''; promoMsg.className = 'promo-msg';
        updateSummary();
        return;
    }
    promoInput.value = code;
    $('applyPromoBtn').disabled = true;
    await requestOrderQuote(true);
    $('applyPromoBtn').disabled = false;
    updateSummary();
};

let suggestTimer = null;
addressInput.addEventListener('input', function() {
    clearTimeout(suggestTimer); const q = this.value.trim();
    if (q.length < 3) { closeSuggest(); return; }
    suggestTimer = setTimeout(() => searchAddress(q), 350);
});
addressInput.addEventListener('focus', function() {
    const q = this.value.trim();
    if (q.length >= 3) { clearTimeout(suggestTimer); suggestTimer = setTimeout(() => searchAddress(q), 200); }
});
document.addEventListener('click', e => { if (!e.target.closest('.address-wrap')) closeSuggest(); });
const hasLeaflet = typeof window.L !== 'undefined';
const redIcon = hasLeaflet ? L.icon({
    iconUrl: '/vendor/leaflet/images/marker-icon-2x-red.png',
    shadowUrl: '/vendor/leaflet/images/marker-shadow.png',
    iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
}) : null;
const mapTileUrl = 'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}';

async function geocodeCoordinates(lat, lon) {
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1&accept-language=uz`);
        const data = await res.json();
        return data.display_name;
    } catch(e) { return `${lat.toFixed(5)}, ${lon.toFixed(5)}`; }
}

async function searchAddress(query) {
    const q = query.toLowerCase().includes('toshkent') ? query : 'Toshkent, ' + query;
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&countrycodes=uz&viewbox=69.10,41.45,69.45,41.10&bounded=1&limit=5&accept-language=uz`);
        const data = await res.json();
        const items = data.map(obj => {
            const parts = obj.display_name.split(', ');
            return {
                name: obj.display_name,
                title: parts.slice(0, 2).join(', '),
                description: parts.slice(2).join(', '),
                coords: [parseFloat(obj.lat), parseFloat(obj.lon)]
            };
        });
        showSuggest(items);
    } catch(e) { console.error(e); closeSuggest(); }
}

function showSuggest(items) {
    if (!items.length) { closeSuggest(); return; }
    suggestDropdown.innerHTML = '';
    items.forEach(item => {
        const div = document.createElement('div'); div.className = 'suggest-item';
        div.innerHTML = `<div>${item.title}</div><div class="suggest-item-sub">${item.description}</div>`;
        div.onclick = () => {
            addressInput.value = item.title; deliveryAddress = item.title;
            closeSuggest();
            if (item.coords) {
                deliveryCoords = item.coords;
                if (hasLeaflet && deliveryMap) {
                    deliveryMap.setView(item.coords, 16);
                    setDeliveryPin(item.coords);
                }
            }
            updateSummary();
            haptic('impactOccurred', 'light');
        };
        suggestDropdown.appendChild(div);
    });
    suggestDropdown.classList.add('open');
}
function closeSuggest() { suggestDropdown.classList.remove('open'); suggestDropdown.innerHTML = ''; }

let deliveryMap = null, deliveryPlacemark = null, pickupMap = null, officesMap = null, deliveryCoords = null;

$('sendLocationBtn').onclick = () => {
    if (!hasLeaflet) {
        console.warn('Leaflet is not loaded; delivery map disabled');
        return;
    }
    const w = $('deliveryMapWrap');
    if (w.style.display === 'none') { w.style.display = 'block'; initDeliveryMap(); } else { w.style.display = 'none'; }
};

function setDeliveryPin(c) {
    if (!hasLeaflet || !deliveryMap) return;
    if (deliveryPlacemark) deliveryPlacemark.setLatLng(c);
    else { deliveryPlacemark = L.marker(c, {icon: redIcon}).addTo(deliveryMap); }
}

function initDeliveryMap() {
    if (!hasLeaflet) {
        console.warn('Leaflet is not loaded; delivery map disabled');
        return;
    }
    if (deliveryMap) return;
    deliveryMap = L.map('deliveryMap', { zoomControl: false, attributionControl: false }).setView(MAP_CENTER, MAP_ZOOM);
    L.tileLayer(mapTileUrl, { maxZoom: 20, detectRetina: true }).addTo(deliveryMap);
    deliveryMap.on('click', async e => {
        const c = [e.latlng.lat, e.latlng.lng];
        deliveryCoords = c;
        setDeliveryPin(c);
        const addr = await geocodeCoordinates(c[0], c[1]);
        const shortAddr = addr.split(', ').slice(0, 2).join(', ');
        deliveryAddress = shortAddr; addressInput.value = shortAddr;
        updateSummary();
    });
}

$('deliveryLocateBtn').onclick = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(async pos => {
        const c = [pos.coords.latitude, pos.coords.longitude];
        deliveryCoords = c;
        if (hasLeaflet && deliveryMap) {
            deliveryMap.setView(c, 16);
            setDeliveryPin(c);
        }
        const addr = await geocodeCoordinates(c[0], c[1]);
        const shortAddr = addr.split(', ').slice(0, 2).join(', ');
        deliveryAddress = shortAddr; addressInput.value = shortAddr;
        updateSummary();
        haptic('impactOccurred', 'medium');
    }, () => {}, { enableHighAccuracy: true });
};

let pickupDone = false;
function initPickupMap() {
    if (!hasLeaflet) {
        console.warn('Leaflet is not loaded; pickup map disabled');
        return;
    }
    if (pickupDone) return;
    let center = EVOS_BRANCHES.length > 0 ? EVOS_BRANCHES[0].coords : MAP_CENTER;
    pickupMap = L.map('pickupMap', { zoomControl: false, attributionControl: false }).setView(center, MAP_ZOOM);
    L.tileLayer(mapTileUrl, { maxZoom: 20, detectRetina: true }).addTo(pickupMap);
    EVOS_BRANCHES.forEach(b => {
        const pm = L.marker(b.coords, {icon: redIcon}).addTo(pickupMap);
        pm.on('click', () => { 
            pickupBranch = b; 
            $('branchInfo').style.display = 'block'; 
            $('branchName').textContent = b.name; 
            $('branchAddress').textContent = b.address; 
            $('branchHours').textContent = ' ' + b.hours; 
            updateSummary();
            haptic('impactOccurred', 'medium'); 
        });
    });
    pickupDone = true;
}

let officesDone = false;
function initOfficesMap() {
    if (!hasLeaflet) {
        console.warn('Leaflet is not loaded; offices map disabled');
        return;
    }
    if (officesDone) return;
    let center = EVOS_BRANCHES.length > 0 ? EVOS_BRANCHES[0].coords : MAP_CENTER;
    officesMap = L.map('officesMap', { zoomControl: false, attributionControl: false }).setView(center, MAP_ZOOM);
    L.tileLayer(mapTileUrl, { maxZoom: 20, detectRetina: true }).addTo(officesMap);
    const list = $('officesList'); list.innerHTML = '';
    EVOS_BRANCHES.forEach(b => {
        L.marker(b.coords, {icon: redIcon}).addTo(officesMap);
        const c = document.createElement('div'); c.className = 'office-card';
        c.innerHTML = `<div class="office-icon"><i class="fi fi-rr-marker"></i></div><div class="office-info"><p class="office-name">${b.name}</p><p class="office-addr">${b.address}</p><p class="office-hours">${b.hours}</p></div>`;
        c.onclick = () => { officesMap.setView(b.coords, 15); haptic('impactOccurred', 'light'); };
        list.appendChild(c);
    });
    officesDone = true;
}
async function loadUserData() {
    const uid = tg.initDataUnsafe?.user?.id; if (!uid) return;
    try {
        const tgName = telegramNamePayload();
        const qs = new URLSearchParams({ user_id: uid, first_name: tgName.first_name, last_name: tgName.last_name });
        const resp = await fetch('/api/user?' + qs.toString());
        if (!resp.ok) return;
        const u = await resp.json();
        currentUserProfile = u;
        userRole = u.role || 'user';
        if (['admin', 'owner', 'deliver'].includes(userRole)) {
            $('adminPanelBtnWrap').style.display = 'block';
            if (userRole === 'owner') $('admUsersTabBtn').style.display = 'block';
        }
        applyMaintenanceMode();
        if (u.last_address) { lastSavedAddress = u.last_address; $('lastAddressHint').style.display = 'flex'; $('useLastAddress').textContent = u.last_address; }
        if (u.phone && validatePhoneNumber(u.phone)) {
            if ($('editPhone')) $('editPhone').value = u.phone;
            if ($('phoneInput') && isEmptyPhoneValue($('phoneInput').value)) $('phoneInput').value = u.phone;
            localStorage.setItem(`phone_${uid}`, u.phone);
        } else {
            loadLastPhoneNumber();
        }
        if (u.referral_code && PROMO_CODES[String(u.referral_code).toUpperCase()] && !promoInput.value) {
            promoInput.value = String(u.referral_code).toUpperCase();
            $('applyPromoBtn').click();
        }
        if (u.first_name) $('editFirstName').value = u.first_name;
        if (u.last_name) $('editLastName').value = u.last_name;
        if (u.phone && $('editPhone')) $('editPhone').value = u.phone;
        profileLoaded = true;
    } catch(e) {}
}
$('useLastAddress').onclick = () => {
    addressInput.value = lastSavedAddress; deliveryAddress = lastSavedAddress;
    updateSummary();
    haptic('impactOccurred', 'light');
};

document.querySelectorAll('.nav-item').forEach(item => {
    item.onclick = () => {
        const tab = item.dataset.tab;
        if (item.classList.contains('nav-hidden')) return;
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        item.classList.add('active');
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        $('page-' + tab).classList.add('active');
        if (tab === 'cart') { loadUserData(); renderCart(); }
        if (tab === 'profile') renderProfile();
        if (tab === 'offices') initOfficesMap();
        haptic('selectionChanged');
    };
});

checkoutBtn.onclick = async () => {
    if (cart.length === 0) return;
    const uid = tg.initDataUnsafe?.user?.id; if (!uid) { alert('Iltimos, ilovadan Telegram orqali foydalaning.'); return; }
    
    const phone = $('phoneInput').value.trim();
    if (!phone || phone === '+998 ') { 
        alert('Iltimos, aloqa uchun telefon raqamingizni kiriting.'); 
        $('phoneInput').focus();
        return; 
    }
    
    if (!validatePhoneNumber(phone)) {
        alert('Telefon raqami noto\'g\'ri. Iltimos +998 bilan boshlanib 12 ta raqamdan iborat bo\'lishi kerak.\nNamuna: +998 (91) 234-56-78');
        $('phoneInput').focus();
        return;
    }
    
    const comment = $('commentInput').value.trim();
    
    const quote = latestQuote || await requestOrderQuote(false);
    if (!quote || !quote.success) {
        alert('Narxni hisoblab bo\'lmadi. Iltimos, qayta urinib ko\'ring.');
        checkoutBtn.textContent = 'Buyurtma berish';
        checkoutBtn.disabled = false;
        return;
    }
    const orderData = {
        user_id: uid,
        ...telegramNamePayload(),
        items: cart.map(c => ({ id: c.id, variant: c.variant, quantity: c.quantity })),
        total: quote.total, delivery_type: deliveryType, payment_method: paymentMethod,
        promo: promoApplied ? promoInput.value.trim().toUpperCase() : null,
        address: deliveryType === 'delivery' ? deliveryAddress : (pickupBranch?.address || ''),
        phone: phone,
        comment: comment,
        coords: deliveryType === 'delivery' ? deliveryCoords : (pickupBranch?.coords || null)
    };
    checkoutBtn.textContent = 'Yuborilmoqda...'; checkoutBtn.disabled = true;
    try {
        const resp = await fetch('/api/order', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(orderData) });
        const result = await resp.json();
        if (result.success) {
            cart = []; promoApplied = false; appliedOffer = null; appliedPromoType = null; promoInput.value = ''; promoMsg.textContent = ''; promoMsg.className = 'promo-msg';
            savePhoneNumber(phone);
            updateCartBadge(); renderProducts(); renderCart(); haptic('notificationOccurred', 'success'); tg.close();
        } else { alert(result.error || 'Buyurtmani rasmiylashtirishda xatolik yuz berdi.'); }
    } catch(err) { console.error(err); alert('Server bilan ulanishda xatolik yuz berdi.'); }
    checkoutBtn.textContent = 'Buyurtma berish'; checkoutBtn.disabled = false;
};

function renderProfile() {
    const u = tg.initDataUnsafe?.user;
    if (u) {
        const fn = $('editFirstName').value || currentUserProfile?.first_name || u.first_name || '', ln = $('editLastName').value || currentUserProfile?.last_name || u.last_name || '';
        const name = [fn, ln].filter(Boolean).join(' ') || 'Foydalanuvchi';
        $('profileName').textContent = name; $('profileId').textContent = 'ID: ' + u.id;
        $('profileAvatar').textContent = name.charAt(0).toUpperCase();
        if (!profileLoaded) { if (!$('editFirstName').value) $('editFirstName').value = u.first_name || ''; if (!$('editLastName').value) $('editLastName').value = u.last_name || ''; }
        if (currentUserProfile?.phone && $('editPhone') && isEmptyPhoneValue($('editPhone').value)) $('editPhone').value = currentUserProfile.phone;
    }
    loadOrderHistory();
}
$('saveNameBtn').onclick = async () => {
    const uid = tg.initDataUnsafe?.user?.id; if (!uid) return;
    const fn = $('editFirstName').value.trim(), ln = $('editLastName').value.trim();
    const phone = $('editPhone') ? $('editPhone').value.trim() : '';
    if (!fn) { $('saveMsg').textContent = 'Foydalanuvchi ismi kiritilishi shart'; $('saveMsg').className = 'save-msg error'; return; }
    if (!isEmptyPhoneValue(phone) && !validatePhoneNumber(phone)) {
        $('saveMsg').textContent = 'Telefon raqami noto\'g\'ri formatda';
        $('saveMsg').className = 'save-msg error';
        $('editPhone').focus();
        return;
    }
    try {
        const r = await fetch('/api/user', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id: uid, first_name: fn, last_name: ln, phone: isEmptyPhoneValue(phone) ? '' : phone }) });
        if ((await r.json()).success) {
            currentUserProfile = { ...(currentUserProfile || {}), first_name: fn, last_name: ln, phone: isEmptyPhoneValue(phone) ? '' : phone };
            $('profileName').textContent = [fn, ln].filter(Boolean).join(' ');
            $('profileAvatar').textContent = fn.charAt(0).toUpperCase();
            if (!isEmptyPhoneValue(phone)) {
                localStorage.setItem(`phone_${uid}`, phone);
                if ($('phoneInput')) $('phoneInput').value = phone;
            }
            $('saveMsg').textContent = 'Ma\'lumotlar muvaffaqiyatli saqlandi.'; $('saveMsg').className = 'save-msg success';
            haptic('notificationOccurred', 'success');
        } else { $('saveMsg').textContent = 'Xatolik yuz berdi'; $('saveMsg').className = 'save-msg error'; }
    } catch(e) { $('saveMsg').textContent = 'Server bilan ulanishda xatolik yuz berdi.'; $('saveMsg').className = 'save-msg error'; }
};
async function loadOrderHistory() {
    const uid = tg.initDataUnsafe?.user?.id; if (!uid) return;
    try {
        const orders = await (await fetch('/api/orders?user_id=' + uid)).json();
        const el = $('orderHistory');
        if (Array.isArray(orders) && orders.length > 0) {
            el.innerHTML = '';
            orders.forEach(o => {
                const st = o.status || 'Kutilmoqda', div = document.createElement('div'); div.className = 'order-history-item';
                div.innerHTML = `<p class="order-id">Buyurtma #${o.id}</p><p class="order-total">${fmt(o.total_price || 0)} so'm</p><p class="order-date">${o.created_at || ''}</p><span class="order-status ${st}">${st}</span>`;
                el.appendChild(div);
            });
        } else { el.innerHTML = `<div class="empty-state small"><p>${SYSTEM_MESSAGES.empty_orders || 'Buyurtmalar tarixi mavjud emas'}</p></div>`; }
    } catch(e) {}
}

async function loadConfig() {
    try {
        const resp = await fetch('/api/config');
        if (resp.ok) {
            applyRuntimeConfig(await resp.json());
        }
    } catch(e) { console.warn('Config load fail:', e); }
}

function loadLastPhoneNumber() {
    const uid = tg.initDataUnsafe?.user?.id;
    if (!uid) return;
    
    const phoneInput = $('phoneInput');
    if (!phoneInput) return;
    
    const lastPhone = localStorage.getItem(`phone_${uid}`);
    if (currentUserProfile?.phone && validatePhoneNumber(currentUserProfile.phone)) {
        if (isEmptyPhoneValue(phoneInput.value)) phoneInput.value = currentUserProfile.phone;
        if ($('editPhone') && isEmptyPhoneValue($('editPhone').value)) $('editPhone').value = currentUserProfile.phone;
        return;
    }
    
    fetch(`/api/orders?user_id=${uid}`)
        .then(r => r.json())
        .then(orders => {
            if (orders && orders.length > 0) {
                const lastOrderPhone = orders[0]?.phone;
                if (lastOrderPhone && validatePhoneNumber(lastOrderPhone)) {
                    localStorage.setItem(`phone_${uid}`, lastOrderPhone);
                    if (!phoneInput.value || phoneInput.value === '+998 ' || phoneInput.value.length < 10) {
                        phoneInput.value = lastOrderPhone;
                    }
                }
            }
            if (lastPhone && validatePhoneNumber(lastPhone) && isEmptyPhoneValue(phoneInput.value)) {
                phoneInput.value = lastPhone;
                if ($('editPhone') && isEmptyPhoneValue($('editPhone').value)) $('editPhone').value = lastPhone;
            }
        })
        .catch(() => {
            if (lastPhone && validatePhoneNumber(lastPhone)) {
                if (!phoneInput.value || phoneInput.value === '+998 ' || phoneInput.value.length < 10) {
                    phoneInput.value = lastPhone;
                }
            }
        });
}

function savePhoneNumber(phone) {
    const uid = tg.initDataUnsafe?.user?.id;
    if (uid && validatePhoneNumber(phone)) {
        localStorage.setItem(`phone_${uid}`, phone);
        currentUserProfile = { ...(currentUserProfile || {}), phone };
        if ($('editPhone')) $('editPhone').value = phone;
        fetch('/api/user', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: uid, phone })
        }).catch(() => {});
    }
}

(async () => {
    await loadConfig();
    await Promise.all([loadProducts(), loadSettings(), loadUserData()]);
    applyMaintenanceMode();
    
    const phoneInput = $('phoneInput');
    setupPhoneInput(phoneInput);
    setupPhoneInput($('editPhone'));
    if (phoneInput) {
        loadLastPhoneNumber();
    }
})();
