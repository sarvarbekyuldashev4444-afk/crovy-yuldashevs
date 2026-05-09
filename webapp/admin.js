let admAuthenticated = false;
let admCurrentFilter = 'all';
let admAllOrders = [];
let admLastCustomerProfile = null;
let admCustomersCache = [];
let admSelectedCustomerId = null;
let admPromocodesCache = [];
admAuthenticated = Boolean(window.LOCAL_ADMIN_AUTH);

const accentPresets = ['#c3c7cf', '#ef4444', '#f97316', '#8b5cf6', '#111827', '#64748b'];
const bgPresets = ['#ffffff', '#f8fafc', '#fff7ed', '#f0fdf4', '#f5f3ff', '#f4f6f9'];
let admColorControlsReady = false;

function admShadeHex(hex, percent) {
    if (typeof shadeHex === 'function') return shadeHex(hex, percent);
    const value = String(hex || '').replace('#', '');
    if (!/^[0-9a-f]{6}$/i.test(value)) return hex;
    const amount = Math.round(2.55 * percent);
    return '#' + [0, 2, 4].map(i => {
        const channel = Math.max(0, Math.min(255, parseInt(value.slice(i, i + 2), 16) + amount));
        return channel.toString(16).padStart(2, '0');
    }).join('');
}

function setupAdminColorControls() {
    if (admColorControlsReady || !$('admSetAccent') || !$('admSetBg')) return;
    const bind = (inputId, previewId, valueId, presetsId, presets) => {
        const input = $(inputId), preview = $(previewId), value = $(valueId), list = $(presetsId);
        const sync = () => {
            preview.style.background = input.value;
            value.textContent = input.value.toUpperCase();
            document.querySelectorAll(`#${presetsId} .color-preset`).forEach(btn => {
                btn.classList.toggle('active', btn.dataset.color.toLowerCase() === input.value.toLowerCase());
            });
        };
        list.innerHTML = presets.map(color => (
            `<button type="button" class="color-preset" data-color="${color}" style="--preset:${color}" aria-label="${color}"></button>`
        )).join('');
        list.querySelectorAll('.color-preset').forEach(btn => {
            btn.onclick = () => {
                input.value = btn.dataset.color;
                input.dispatchEvent(new Event('input', { bubbles: true }));
                haptic('selectionChanged');
            };
        });
        input.addEventListener('input', sync);
        sync();
    };
    bind('admSetAccent', 'admAccentPreview', 'admAccentValue', 'admAccentPresets', accentPresets);
    bind('admSetBg', 'admBgPreview', 'admBgValue', 'admBgPresets', bgPresets);
    admColorControlsReady = true;
}

var debounce = window.AppDom?.debounce || function(fn, delay = 250) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), delay);
    };
};

$('openAdminBtn').onclick = () => {
    if (admAuthenticated) { openAdminPanel(); }
    else { $('admAuthInput').value = ''; window.Motion ? window.Motion.open($('admAuthModal')) : $('admAuthModal').classList.add('open'); setTimeout(() => $('admAuthInput').focus(), 100); }
    haptic('impactOccurred', 'medium');
};

$('admAuthBtn').onclick = async () => {
    const pwd = $('admAuthInput').value;
    if (!pwd) return;
    const btn = $('admAuthBtn');
    btn.textContent = '...'; btn.disabled = true;
    try {
        const r = await (await fetch('/api/admin/login', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: tg.initDataUnsafe?.user?.id, password: pwd })
        })).json();
        if (r.success) {
            admAuthenticated = true;
            window.Motion ? window.Motion.close($('admAuthModal')) : $('admAuthModal').classList.remove('open');
            openAdminPanel();
            haptic('notificationOccurred', 'success');
        } else {
            $('admAuthInput').value = '';
            $('admAuthInput').style.borderColor = 'var(--color-accent)';
            setTimeout(() => $('admAuthInput').style.borderColor = '', 1200);
            haptic('notificationOccurred', 'error');
        }
    } catch (e) { alert('Tizimga kirishda xatolik yuz berdi. Iltimos, qaytadan urinib ko\'ring.'); }
    btn.textContent = 'Kirish'; btn.disabled = false;
};
$('admAuthInput').addEventListener('keydown', e => { if (e.key === 'Enter') $('admAuthBtn').click(); });
if ($('admAuthBackBtn')) $('admAuthBackBtn').onclick = () => window.Motion ? window.Motion.close($('admAuthModal')) : $('admAuthModal').classList.remove('open');

var escAttr = window.AppDom?.escapeAttr || function(value) {
    return String(value ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
};

var escHtml = window.AppDom?.escapeHtml || function(value) {
    return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
};

function admListFromJson(raw) {
    if (Array.isArray(raw)) return raw;
    try {
        const parsed = JSON.parse(raw || '[]');
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
        return String(raw || '').split(',').map(x => x.trim()).filter(Boolean);
    }
}

function admListToJson(value) {
    return JSON.stringify(String(value || '').split(',').map(x => x.trim()).filter(Boolean));
}

function admIntInput(id, fallback = 0) {
    const value = parseInt($(id)?.value, 10);
    return Number.isNaN(value) ? fallback : value;
}

const admSafeJson = window.AppDom?.safeJson || ((value, fallback) => {
    try { return JSON.parse(value || ''); } catch (e) { return fallback; }
});
const admSettingsEditor = {
    categories: [],
    branches: [],
    navigation: [],
    botMessages: {},
};

function admSyncSettingsTextareas() {
    const categories = admSettingsEditor.categories
        .map(x => String(x || '').trim())
        .filter(Boolean);
    const branches = admSettingsEditor.branches
        .map(branch => ({
            name: String(branch.name || '').trim(),
            address: String(branch.address || '').trim(),
            hours: String(branch.hours || '').trim(),
            coords: Array.isArray(branch.coords) ? branch.coords.map(Number).filter(n => !Number.isNaN(n)) : [],
            ...(branch.zoom ? { zoom: Number(branch.zoom) } : {}),
        }))
        .filter(branch => branch.name || branch.address);
    const navigation = admSettingsEditor.navigation
        .map((item, index) => ({
            tab: item.tab || '',
            label: String(item.label || item.tab || '').trim(),
            icon: item.icon || '',
            enabled: item.enabled !== false,
            order: Number(item.order || (index + 1) * 10),
        }));
    if ($('admSetCategories')) $('admSetCategories').value = JSON.stringify(categories);
    if ($('admSetBranches')) $('admSetBranches').value = JSON.stringify(branches);
    if ($('admSetNavigation')) $('admSetNavigation').value = JSON.stringify(navigation);
    if ($('admSetBotMessages')) $('admSetBotMessages').value = JSON.stringify(admSettingsEditor.botMessages || {});
}

function renderAdminCategoryEditor() {
    const root = $('admCategoriesEditor');
    if (!root) return;
    admSettingsEditor.categories = admSettingsEditor.categories
        .map(x => String(x || '').trim())
        .filter(Boolean)
        .filter((x, i, arr) => arr.indexOf(x) === i);
    if (!admSettingsEditor.categories.includes('Barchasi')) {
        admSettingsEditor.categories.unshift('Barchasi');
    }
    root.innerHTML = admSettingsEditor.categories.map((name, index) => `
        <div class="settings-chip-item" data-category-index="${index}">
            <input type="text" class="app-input" value="${escAttr(name)}" data-category-name ${name === 'Barchasi' ? 'readonly' : ''}>
            <button type="button" class="settings-mini-btn danger" data-remove-category ${name === 'Barchasi' ? 'disabled' : ''}>O'chirish</button>
        </div>
    `).join('');
    admSyncSettingsTextareas();
}

function renderAdminBranchEditor() {
    const root = $('admBranchesEditor');
    if (!root) return;
    root.innerHTML = admSettingsEditor.branches.map((branch, index) => {
        const coords = Array.isArray(branch.coords) ? branch.coords : ['', ''];
        return `
            <div class="settings-branch-item" data-branch-index="${index}">
                <input type="text" class="app-input" placeholder="Filial nomi" value="${escAttr(branch.name || '')}" data-branch-field="name">
                <input type="text" class="app-input" placeholder="Manzil" value="${escAttr(branch.address || '')}" data-branch-field="address">
                <div class="settings-branch-grid">
                    <input type="text" class="app-input" placeholder="Ish vaqti" value="${escAttr(branch.hours || '')}" data-branch-field="hours">
                    <input type="number" class="app-input" placeholder="Zoom" value="${escAttr(branch.zoom || '')}" data-branch-field="zoom">
                    <input type="number" step="0.0001" class="app-input" placeholder="Lat" value="${escAttr(coords[0] || '')}" data-branch-field="lat">
                    <input type="number" step="0.0001" class="app-input" placeholder="Lng" value="${escAttr(coords[1] || '')}" data-branch-field="lng">
                </div>
                <button type="button" class="settings-mini-btn danger" data-remove-branch>O'chirish</button>
            </div>
        `;
    }).join('');
    admSyncSettingsTextareas();
}

function renderAdminNavigationEditor() {
    const root = $('admNavigationEditor');
    if (!root) return;
    root.innerHTML = admSettingsEditor.navigation.map((item, index) => `
        <div class="settings-nav-item" data-nav-index="${index}">
            <label class="adm-toggle-mini">
                <input type="checkbox" data-nav-field="enabled" ${item.enabled !== false ? 'checked' : ''}>
            </label>
            <input type="text" class="app-input" value="${escAttr(item.label || item.tab || '')}" data-nav-field="label">
            <input type="number" class="app-input" value="${Number(item.order || (index + 1) * 10)}" data-nav-field="order">
        </div>
    `).join('');
    admSyncSettingsTextareas();
}

function renderAdminBotMessagesEditor() {
    const root = $('admBotMessagesEditor');
    if (!root) return;
    const messages = admSettingsEditor.botMessages || {};
    root.innerHTML = Object.keys(messages).sort().map(key => `
        <div class="settings-bot-message-item" data-bot-message-key="${escAttr(key)}">
            <div class="settings-bot-message-key">${escHtml(key)}</div>
            <textarea class="app-input settings-bot-message-text" data-bot-message-text>${escHtml(messages[key] || '')}</textarea>
        </div>
    `).join('');
    admSyncSettingsTextareas();
}

function setupAdminSettingsEditors() {
    const categoryRoot = $('admCategoriesEditor');
    if (categoryRoot && !categoryRoot.dataset.bound) {
        categoryRoot.dataset.bound = '1';
        categoryRoot.addEventListener('input', e => {
            const item = e.target.closest('[data-category-index]');
            if (!item || !e.target.matches('[data-category-name]')) return;
            admSettingsEditor.categories[Number(item.dataset.categoryIndex)] = e.target.value;
            admSyncSettingsTextareas();
        });
        categoryRoot.addEventListener('click', e => {
            const item = e.target.closest('[data-category-index]');
            if (!item || !e.target.matches('[data-remove-category]')) return;
            admSettingsEditor.categories.splice(Number(item.dataset.categoryIndex), 1);
            renderAdminCategoryEditor();
        });
    }
    if ($('admCategoryAddBtn') && !$('admCategoryAddBtn').dataset.bound) {
        $('admCategoryAddBtn').dataset.bound = '1';
        $('admCategoryAddBtn').onclick = () => {
            const input = $('admCategoryNewInput');
            const value = input.value.trim();
            if (!value) return;
            admSettingsEditor.categories.push(value);
            input.value = '';
            renderAdminCategoryEditor();
            haptic('selectionChanged');
        };
    }

    const branchRoot = $('admBranchesEditor');
    if (branchRoot && !branchRoot.dataset.bound) {
        branchRoot.dataset.bound = '1';
        branchRoot.addEventListener('input', e => {
            const item = e.target.closest('[data-branch-index]');
            const field = e.target.dataset.branchField;
            if (!item || !field) return;
            const branch = admSettingsEditor.branches[Number(item.dataset.branchIndex)] || {};
            if (field === 'lat' || field === 'lng') {
                const coords = Array.isArray(branch.coords) ? branch.coords.slice(0, 2) : ['', ''];
                coords[field === 'lat' ? 0 : 1] = e.target.value === '' ? '' : Number(e.target.value);
                branch.coords = coords;
            } else if (field === 'zoom') {
                branch.zoom = e.target.value === '' ? '' : Number(e.target.value);
            } else {
                branch[field] = e.target.value;
            }
            admSettingsEditor.branches[Number(item.dataset.branchIndex)] = branch;
            admSyncSettingsTextareas();
        });
        branchRoot.addEventListener('click', e => {
            const item = e.target.closest('[data-branch-index]');
            if (!item || !e.target.matches('[data-remove-branch]')) return;
            admSettingsEditor.branches.splice(Number(item.dataset.branchIndex), 1);
            renderAdminBranchEditor();
        });
    }
    if ($('admBranchAddBtn') && !$('admBranchAddBtn').dataset.bound) {
        $('admBranchAddBtn').dataset.bound = '1';
        $('admBranchAddBtn').onclick = () => {
            admSettingsEditor.branches.push({ name: '', address: '', hours: '', coords: ['', ''] });
            renderAdminBranchEditor();
            haptic('selectionChanged');
        };
    }

    const navRoot = $('admNavigationEditor');
    if (navRoot && !navRoot.dataset.bound) {
        navRoot.dataset.bound = '1';
        navRoot.addEventListener('input', e => {
            const item = e.target.closest('[data-nav-index]');
            const field = e.target.dataset.navField;
            if (!item || !field) return;
            const nav = admSettingsEditor.navigation[Number(item.dataset.navIndex)] || {};
            nav[field] = field === 'enabled' ? e.target.checked : (field === 'order' ? Number(e.target.value || 0) : e.target.value);
            admSettingsEditor.navigation[Number(item.dataset.navIndex)] = nav;
            admSyncSettingsTextareas();
        });
        navRoot.addEventListener('change', e => {
            const item = e.target.closest('[data-nav-index]');
            if (!item || e.target.dataset.navField !== 'enabled') return;
            const nav = admSettingsEditor.navigation[Number(item.dataset.navIndex)] || {};
            nav.enabled = e.target.checked;
            admSettingsEditor.navigation[Number(item.dataset.navIndex)] = nav;
            admSyncSettingsTextareas();
        });
    }

    const botMessagesRoot = $('admBotMessagesEditor');
    if (botMessagesRoot && !botMessagesRoot.dataset.bound) {
        botMessagesRoot.dataset.bound = '1';
        botMessagesRoot.addEventListener('input', e => {
            const item = e.target.closest('[data-bot-message-key]');
            if (!item || !e.target.matches('[data-bot-message-text]')) return;
            admSettingsEditor.botMessages[item.dataset.botMessageKey] = e.target.value;
            admSyncSettingsTextareas();
        });
    }
}

const ADM_STATUS_LABELS = {
    pending: 'Kutilmoqda',
    confirmed: 'Tasdiqlangan',
    yetkazilmoqda: "Yo'lda",
    yetkazildi: 'Yakunlangan',
    cancelled: 'Bekor',
    tekshirilmoqda: "To'lov tekshirilmoqda",
    payment_review: "To'lov tekshirilmoqda",
    failed: 'Rad etilgan',
    rejected: 'Rad etilgan',
    fully_cancelled: "Butunlay bekor qilingan",
    "kutilmoqda (to'lov)": "To'lov tekshirilmoqda"
};

const ADM_PAYMENT_LABELS = {
    cash: 'Naqd',
    card: 'Karta',
    click: 'Click',
    payme: 'Payme',
    transfer: "O'tkazma"
};

function admPaymentLabel(value) {
    return ADM_PAYMENT_LABELS[value] || value || '-';
}

function admUid() {
    return tg.initDataUnsafe?.user?.id || 0;
}

function openAdminPanel() {
    $('page-admin').classList.add('active');
    const roleMap = { owner: 'Egasi', admin: 'Admin', deliver: 'Kuryer' };
    $('admRoleBadge').textContent = roleMap[userRole] || 'Admin';
    applyAdminRoleAccess();
    loadAdminStats();
    loadAdminOrders();
}

function applyAdminRoleAccess() {
    const productsBtn = document.querySelector('[data-atab="adm-products"]');
    const promocodesBtn = $('admPromocodesTabBtn');
    const customersBtn = $('admCustomersTabBtn');
    const receiptsBtn = $('admReceiptsTabBtn');
    const usersBtn = $('admUsersTabBtn');
    const settingsBtn = $('admSettingsTabBtn');
    if (productsBtn) productsBtn.style.display = ['admin', 'owner'].includes(userRole) ? 'flex' : 'none';
    if (promocodesBtn) promocodesBtn.style.display = ['admin', 'owner'].includes(userRole) ? 'flex' : 'none';
    if (customersBtn) customersBtn.style.display = ['admin', 'owner'].includes(userRole) ? 'flex' : 'none';
    if (receiptsBtn) receiptsBtn.style.display = ['admin', 'owner'].includes(userRole) ? 'flex' : 'none';
    if (usersBtn) usersBtn.style.display = userRole === 'owner' ? 'flex' : 'none';
    if (settingsBtn) settingsBtn.style.display = userRole === 'owner' ? 'flex' : 'none';
    document.querySelectorAll('.super-only').forEach(el => {
        el.style.display = userRole === 'owner' ? '' : 'none';
    });
    if ($('admCustomerFilterToggle')) $('admCustomerFilterToggle').style.display = userRole === 'owner' ? 'inline-grid' : 'none';
    if (document.querySelector('.adm-customer-tools')) {
        document.querySelector('.adm-customer-tools').classList.toggle('has-filter-toggle', userRole === 'owner');
    }
    if (userRole === 'deliver') {
        document.querySelectorAll('.adm-section').forEach(s => s.style.display = 'none');
        $('adm-orders').style.display = 'flex';
        document.querySelectorAll('.adm-tab-item').forEach(b => b.classList.remove('active'));
        document.querySelector('[data-atab="adm-orders"]').classList.add('active');
    }
}

if (window.LOCAL_ADMIN_AUTH) {
    userRole = 'owner';
    $('adminPanelBtnWrap').style.display = 'block';
    applyAdminRoleAccess();
    if (typeof applyMaintenanceMode === 'function') applyMaintenanceMode();
    setTimeout(() => {
        if (window.LOCAL_OPEN_ADMIN) openAdminPanel();
    }, 500);
}

$('closeAdminBtn').onclick = () => { $('page-admin').classList.remove('active'); };

$('admRefreshBtn').onclick = () => {
    const btn = $('admRefreshBtn');
    btn.classList.add('spinning');
    const active = document.querySelector('.adm-tab-item.active');
    const tab = active ? active.dataset.atab : 'adm-orders';
    loadAdminStats();
    if (tab === 'adm-orders') loadAdminOrders();
    else if (tab === 'adm-products') loadAdminProducts();
    else if (tab === 'adm-promocodes') admLoadPromocodes();
    else if (tab === 'adm-customers') loadAdminCustomers();
    else if (tab === 'adm-receipts') loadAdminReceipts();
    else if (tab === 'adm-users') loadAdminUsers();
    else if (tab === 'adm-settings') loadAdminSettings();
    setTimeout(() => btn.classList.remove('spinning'), 800);
};

document.querySelectorAll('.adm-tab-item').forEach(btn => {
    btn.onclick = () => {
        if (btn.style.display === 'none') return;
        if (userRole === 'deliver' && btn.dataset.atab !== 'adm-orders') return;
        if (userRole === 'admin' && !['adm-orders', 'adm-products', 'adm-promocodes', 'adm-customers', 'adm-receipts'].includes(btn.dataset.atab)) return;
        document.querySelectorAll('.adm-tab-item').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.querySelectorAll('.adm-section').forEach(s => s.style.display = 'none');
        const t = btn.dataset.atab;
        $(t).style.display = 'flex';
        if (t === 'adm-orders') loadAdminOrders();
        if (t === 'adm-products') loadAdminProducts();
        if (t === 'adm-promocodes') admLoadPromocodes();
        if (t === 'adm-customers') loadAdminCustomers();
        if (t === 'adm-receipts') loadAdminReceipts();
        if (t === 'adm-users') loadAdminUsers();
        if (t === 'adm-settings') loadAdminSettings();
        haptic('selectionChanged');
    };
});

document.querySelectorAll('.adm-chip').forEach(chip => {
    chip.onclick = () => {
        document.querySelectorAll('.adm-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        admCurrentFilter = chip.dataset.filter;
        renderAdminOrders();
    };
});

async function loadAdminStats() {
    try {
        const orders = await (await fetch('/api/admin/orders?user_id=' + (tg.initDataUnsafe?.user?.id || 0))).json();
        const pending = orders.filter(o => ['pending', 'tekshirilmoqda', 'payment_review', "kutilmoqda (to'lov)"].includes(o.status)).length;
        const confirmed = orders.filter(o => ['confirmed', 'yetkazilmoqda', 'yetkazildi'].includes(o.status)).length;
        const revenue = orders.filter(o => ['yetkazildi', 'confirmed'].includes(o.status)).reduce((s, o) => s + (o.total_price || 0), 0);
        $('statPending').textContent = pending;
        $('statConfirmed').textContent = confirmed;
        $('statRevenue').textContent = fmtShort(revenue);
    } catch (e) {}
}

let allAdminProducts = [];

$('admSelectImgBtn').onclick = () => $('admProdImageFile').click();
$('admProdImageFile').addEventListener('change', async function() {
    const files = Array.from(this.files);
    if (!files.length) return;
    const btn = $('admSelectImgBtn');
    btn.textContent = 'Yuklanmoqda...';
    btn.disabled = true;
    
    let currentImages = $('admProdImageName').value ? $('admProdImageName').value.split(',') : [];
    
    for (let file of files) {
        const fd = new FormData();
        fd.append('image', file);
        try {
            const uid = tg.initDataUnsafe?.user?.id || 0;
            const res = await (await fetch('/api/admin/upload_image?user_id=' + uid, { method: 'POST', body: fd })).json();
            if (res.filename) currentImages.push(res.filename);
        } catch(e) { console.warn('Upload failed', e); }
    }
    
    $('admProdImageName').value = currentImages.join(',');
    renderAdminImages();
    
    btn.textContent = 'Muvaffaqiyatli yuklandi';
    setTimeout(() => { btn.textContent = 'Rasm yuklash'; btn.disabled = false; }, 2000);
    this.value = '';
});

window.removeAdminImage = function(idx) {
    let arr = $('admProdImageName').value ? $('admProdImageName').value.split(',') : [];
    arr.splice(idx, 1);
    $('admProdImageName').value = arr.join(',');
    renderAdminImages();
};

window.replaceAdminImage = function(idx) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async () => {
        if (!input.files.length) return;
        const fd = new FormData();
        fd.append('image', input.files[0]);
        try {
            const uid = tg.initDataUnsafe?.user?.id || 0;
            const res = await (await fetch('/api/admin/upload_image?user_id=' + uid, { method: 'POST', body: fd })).json();
            if (res.filename) {
                let arr = $('admProdImageName').value ? $('admProdImageName').value.split(',') : [];
                arr[idx] = res.filename;
                $('admProdImageName').value = arr.join(',');
                renderAdminImages();
            }
        } catch(e) {}
    };
    input.click();
};

function renderAdminImages() {
    const container = $('admImagesList');
    container.innerHTML = '';
    const images = $('admProdImageName').value ? $('admProdImageName').value.split(',') : [];
    images.forEach((img, idx) => {
        const div = document.createElement('div');
        div.className = 'adm-product-thumb';
        div.style.position = 'relative';
        div.style.width = '80px'; div.style.height = '80px'; div.style.flexShrink = '0';
        div.style.backgroundImage = `url(/uploads/${img})`;
        div.style.backgroundSize = 'cover'; div.style.backgroundPosition = 'center';
        div.style.borderRadius = '12px'; div.style.overflow = 'hidden';
        div.style.boxShadow = 'none';
        
        const delBtn = document.createElement('button');
        delBtn.innerHTML = '&times;';
        delBtn.type = 'button';
        delBtn.style.position = 'absolute';
        delBtn.style.top = '4px'; delBtn.style.right = '4px';
        delBtn.style.background = 'var(--color-accent)'; delBtn.style.color = 'var(--color-button-text)';
        delBtn.style.border = 'none'; delBtn.style.borderRadius = '50%';
        delBtn.style.width = '24px'; delBtn.style.height = '24px';
        delBtn.style.cursor = 'pointer'; delBtn.style.display = 'flex';
        delBtn.style.alignItems = 'center'; delBtn.style.justifyContent = 'center';
        delBtn.style.fontSize = '16px';
        delBtn.onclick = (e) => { e.stopPropagation(); removeAdminImage(idx); };
        
        const replaceBtn = document.createElement('button');
        replaceBtn.innerHTML = '<i class="fi fi-rr-refresh"></i>';
        replaceBtn.type = 'button';
        replaceBtn.style.position = 'absolute';
        replaceBtn.style.top = '4px'; replaceBtn.style.left = '4px';
        replaceBtn.style.background = 'var(--color-accent)'; replaceBtn.style.color = 'var(--color-button-text)';
        replaceBtn.style.border = 'none'; replaceBtn.style.borderRadius = '50%';
        replaceBtn.style.width = '24px'; replaceBtn.style.height = '24px';
        replaceBtn.style.cursor = 'pointer'; replaceBtn.style.display = 'flex';
        replaceBtn.style.alignItems = 'center'; replaceBtn.style.justifyContent = 'center';
        replaceBtn.style.fontSize = '14px';
        replaceBtn.onclick = (e) => { e.stopPropagation(); replaceAdminImage(idx); };

        const idxLabel = document.createElement('div');
        idxLabel.textContent = idx + 1;
        idxLabel.style.position = 'absolute';
        idxLabel.style.bottom = '4px'; idxLabel.style.right = '4px';
        idxLabel.style.background = 'var(--color-accent)'; idxLabel.style.color = 'var(--color-button-text)';
        idxLabel.style.fontSize = '11px'; idxLabel.style.padding = '2px 6px';
        idxLabel.style.borderRadius = '6px'; idxLabel.style.fontWeight = '600';
        
        div.appendChild(delBtn);
        div.appendChild(replaceBtn);
        div.appendChild(idxLabel);
        container.appendChild(div);
    });
}

function addVariantRow(size='', price='') {
    const row = document.createElement('div');
    row.className = 'adm-variant-row';
    row.innerHTML = `
        <input type="text" class="app-input var-size" placeholder="Hajm (10ml)" value="${size}">
        <input type="number" class="app-input var-price" placeholder="Narx (so'm)" value="${price}">
        <button type="button" class="adm-variant-del" onclick="this.parentElement.remove()">&times;</button>`;
    $('admVariantsList').appendChild(row);
}
$('admAddVariantBtn').onclick = () => addVariantRow();

function getVariants() {
    return [...document.querySelectorAll('.adm-variant-row')].map(row => ({
        size:  row.querySelector('.var-size').value.trim(),
        price: parseInt(row.querySelector('.var-price').value) || 0
    })).filter(v => v.size);
}

async function loadAdminProducts() {
    setAdmLoading('admProductsList');
    try {
        allAdminProducts = await (await fetch('/api/products?all=1&user_id=' + (tg.initDataUnsafe?.user?.id || 0))).json();
        renderAdminProducts();
    } catch (e) { $('admProductsList').innerHTML = '<div class="adm-loading">Ma\'lumotlarni yuklashda xatolik yuz berdi</div>'; }
}

function admPreviewProductCard(product) {
    if (typeof openModal !== 'function' || !product) return;
    const synced = (Array.isArray(products) ? products.find(x => Number(x.id) === Number(product.id)) : null) || product;
    const preview = { ...synced, ...product };
    if (typeof preview.variants === 'string') {
        try { preview.variants = JSON.parse(preview.variants); } catch(e) { preview.variants = []; }
    }
    if (!Array.isArray(preview.variants)) preview.variants = [];
    openModal(preview);
}

function renderAdminProducts() {
        const el = $('admProductsList');
        el.innerHTML = '';
        const q = normalizeText($('admProductSearch')?.value || '');
        const list = q ? allAdminProducts.filter(p => normalizeText([p.name, p.sku, p.category, p.keywords].join(' ')).includes(q)) : allAdminProducts;
        if (!list.length) { el.innerHTML = '<div class="adm-loading">Mahsulotlar mavjud emas</div>'; return; }
        list.forEach(p => {
            const card = document.createElement('div');
            card.className = 'adm-product-card';
            const firstImg = p.image ? p.image.split(',')[0] : '';
            const thumb = firstImg ? `background-image:url(/uploads/${firstImg})` : '';
            const customBadges = admListFromJson(p.badges).slice(0, 3).map(label => `<span class="adm-product-tag tag-bogo">${escHtml(label)}</span>`);
            const tags = [
                p.active ? '<span class="adm-product-tag tag-active">Aktiv</span>' : '<span class="adm-product-tag tag-inactive">Nofaol</span>',
                p.discount_percent > 0 ? `<span class="adm-product-tag tag-discount">-${p.discount_percent}%</span>` : '',
                p.is_bogo ? '<span class="adm-product-tag tag-bogo">1+1</span>' : '',
                p.featured ? '<span class="adm-product-tag tag-bogo">Top</span>' : '',
                p.bestseller ? '<span class="adm-product-tag tag-bogo">Bestseller</span>' : '',
                p.is_new ? '<span class="adm-product-tag tag-bogo">Yangi</span>' : '',
                p.limited ? '<span class="adm-product-tag tag-bogo">Limited</span>' : '',
                ...customBadges
            ].join('');
            card.innerHTML = `
                <div class="adm-product-thumb" style="${thumb}"></div>
                <div class="adm-product-info">
                    <div class="adm-product-name">${p.name}</div>
                    <div class="adm-product-price">${p.category} - ${fmt(p.price)} so'm</div>
                    <div class="adm-product-tags">${tags}</div>
                </div>
                <div class="adm-product-actions">
                    <button class="adm-prod-btn adm-prod-edit" onclick="admEditProduct(${p.id})">Tahrirlash</button>
                    <button class="adm-prod-btn adm-prod-toggle" onclick="admToggleProduct(${p.id}, ${p.active ? 0 : 1})">${p.active ? "O'chirish" : 'Yoqish'}</button>
                </div>`;
            const thumbEl = card.querySelector('.adm-product-thumb');
            const infoEl = card.querySelector('.adm-product-info');
            if (thumbEl) thumbEl.onclick = () => admPreviewProductCard(p);
            if (infoEl) infoEl.onclick = () => admPreviewProductCard(p);
            el.appendChild(card);
        });
}

if ($('admProductSearch')) $('admProductSearch').addEventListener('input', renderAdminProducts);

async function admToggleProduct(pid, act) {
    await fetch('/api/admin/product', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id: tg.initDataUnsafe?.user?.id, id: pid, active: act }) });
    loadAdminProducts();
}

let catDropdownSetup = false;
function setupCategoryDropdown() {
    if (catDropdownSetup) return;
    const input = $('admProdCategory');
    const dropdown = $('admCategoryDropdown');
    if (!input || !dropdown) return;
    
    input.addEventListener('focus', showDropdown);
    input.addEventListener('input', showDropdown);
    
    document.addEventListener('click', e => {
        if (!e.target.closest('#admProdCategory') && !e.target.closest('#admCategoryDropdown')) {
            dropdown.classList.remove('open');
        }
    });

    function showDropdown() {
        const val = input.value.toLowerCase().trim();
        const cats = ['Barchasi', ...new Set(allAdminProducts.map(p => p.category))].filter(Boolean);
        const filtered = cats.filter(c => c.toLowerCase().includes(val));
        
        dropdown.innerHTML = '';
        if (filtered.length > 0) {
            filtered.forEach(c => {
                const div = document.createElement('div');
                div.className = 'suggest-item';
                div.textContent = c;
                div.onclick = () => {
                    input.value = c;
                    dropdown.classList.remove('open');
                };
                dropdown.appendChild(div);
            });
            dropdown.classList.add('open');
        } else {
            dropdown.classList.remove('open');
        }
    }
    catDropdownSetup = true;
}

function openProductModal(p = null) {
    setupCategoryDropdown();
    const isNew = !p;
    $('admProdTitle').textContent = isNew ? 'Yangi tovar' : 'Tovar tahrirlash';
    $('admProdId').value = p ? p.id : '';
    $('admProdName').value = p ? p.name : '';
    $('admProdPrice').value = p ? p.price : '';
    $('admProdOldPrice').value = p ? (p.old_price || '') : '';
    $('admProdCategory').value = p ? (p.category || '') : '';
    $('admProdCollection').value = p ? (p.collection || '') : '';
    $('admProdDesc').value = p ? (p.description || '') : '';
    $('admProdKeywords').value = p ? (p.keywords || '') : '';
    $('admProdSku').value = p ? (p.sku || '') : '';
    $('admProdBadges').value = p ? admListFromJson(p.badges).join(', ') : '';
    $('admProdTags').value = p ? admListFromJson(p.tags).join(', ') : '';
    $('admProdDiscount').value = p ? (p.discount_percent || 0) : 0;
    $('admProdStock').value = p ? (p.stock !== undefined ? p.stock : -1) : -1;
    $('admProdBogo').checked = p ? p.is_bogo === 1 : false;
    $('admProdFeatured').checked = p ? p.featured === 1 : false;
    $('admProdBestseller').checked = p ? p.bestseller === 1 : false;
    $('admProdNew').checked = p ? p.is_new === 1 : false;
    $('admProdLimited').checked = p ? p.limited === 1 : false;
    $('admProdActive').checked = p ? p.active === 1 : true;
    $('admProdImageName').value = p ? (p.image || '') : '';
    $('admProdImageFile').value = '';
    renderAdminImages();
    $('admVariantsList').innerHTML = '';
    if (p && p.variants) {
        let vars = p.variants;
        if (typeof vars === 'string') try { vars = JSON.parse(vars); } catch(e) { vars = []; }
        vars.forEach(v => addVariantRow(v.size, v.price));
    }
    window.Motion ? window.Motion.open($('admProductModal')) : $('admProductModal').classList.add('open');
}

function admEditProduct(pid) {
    const p = allAdminProducts.find(x => x.id === pid);
    if (!p) return;
    openProductModal(p);
}

$('admProdCancelBtn').onclick = () => window.Motion ? window.Motion.close($('admProductModal')) : $('admProductModal').classList.remove('open');
$('admProdSaveBtn').onclick = async () => {
    if (!$('admProdName').value.trim()) { $('admProdName').focus(); return; }
    const btn = $('admProdSaveBtn');
    btn.textContent = 'Saqlanmoqda...'; btn.disabled = true;
    const variants = getVariants();
    const pid = $('admProdId').value;
    const data = {
        user_id: tg.initDataUnsafe?.user?.id,
        id: pid ? parseInt(pid) : 0,
        name: $('admProdName').value.trim(),
        price: admIntInput('admProdPrice', variants[0]?.price || 0),
        old_price: admIntInput('admProdOldPrice', 0),
        category: $('admProdCategory').value.trim() || 'Umumiy',
        collection: $('admProdCollection').value.trim(),
        description: $('admProdDesc').value.trim(),
        keywords: $('admProdKeywords').value.trim(),
        sku: $('admProdSku').value.trim(),
        badges: admListToJson($('admProdBadges').value),
        tags: admListToJson($('admProdTags').value),
        discount_percent: admIntInput('admProdDiscount', 0),
        stock: admIntInput('admProdStock', -1),
        is_bogo: $('admProdBogo').checked ? 1 : 0,
        featured: $('admProdFeatured').checked ? 1 : 0,
        bestseller: $('admProdBestseller').checked ? 1 : 0,
        is_new: $('admProdNew').checked ? 1 : 0,
        limited: $('admProdLimited').checked ? 1 : 0,
        active: $('admProdActive').checked ? 1 : 0,
        image: $('admProdImageName').value || '',
        variants: JSON.stringify(variants)
    };
    await fetch('/api/admin/product', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    window.Motion ? window.Motion.close($('admProductModal')) : $('admProductModal').classList.remove('open');
    haptic('notificationOccurred', 'success');
    loadAdminProducts(); loadProducts();
    btn.textContent = 'Saqlash'; btn.disabled = false;
};

$('admAddProductBtn').onclick = () => openProductModal(null);
if ($('admBadgePresets')) {
    $('admBadgePresets').onclick = e => {
        const btn = e.target.closest('[data-badge]');
        if (!btn || !$('admProdBadges')) return;
        const existing = $('admProdBadges').value.split(',').map(x => x.trim()).filter(Boolean);
        if (!existing.includes(btn.dataset.badge)) existing.push(btn.dataset.badge);
        $('admProdBadges').value = existing.join(', ');
        haptic('selectionChanged');
    };
}
if ($('admCarouselBtn')) $('admCarouselBtn').onclick = () => openCarouselModal();

async function openCarouselModal() {
    window.Motion ? window.Motion.open($('admCarouselModal')) : $('admCarouselModal').classList.add('open');
    await loadAdminBanners();
}

if ($('admCarouselCloseBtn')) $('admCarouselCloseBtn').onclick = () => window.Motion ? window.Motion.close($('admCarouselModal')) : $('admCarouselModal').classList.remove('open');
if ($('admCarouselUploadBtn')) $('admCarouselUploadBtn').onclick = () => $('admCarouselFiles').click();
if ($('admCarouselResetBtn')) $('admCarouselResetBtn').onclick = () => admResetCarouselForm();
if ($('admCarouselSaveBtn')) $('admCarouselSaveBtn').onclick = () => admSaveBanner();

function admResetCarouselForm() {
    ['admCarouselEditId', 'admCarouselImageName', 'admCarouselTitle', 'admCarouselSubtitle', 'admCarouselActionText', 'admCarouselTargetValue'].forEach(id => { if ($(id)) $(id).value = ''; });
    if ($('admCarouselInterval')) $('admCarouselInterval').value = '4500';
    if ($('admCarouselSort')) $('admCarouselSort').value = '0';
    if ($('admCarouselTargetType')) $('admCarouselTargetType').value = 'anchor';
    if ($('admCarouselActive')) $('admCarouselActive').checked = true;
    if ($('admCarouselSaveBtn')) $('admCarouselSaveBtn').textContent = 'Saqlash';
}

function admFillTargetInputs(target) {
    target = String(target || '');
    if (target.startsWith('product:')) {
        $('admCarouselTargetType').value = 'product_id';
        $('admCarouselTargetValue').value = target.slice(8);
    } else if (target.startsWith('category:')) {
        $('admCarouselTargetType').value = 'category';
        $('admCarouselTargetValue').value = target.slice(9);
    } else if (/^https?:\/\//i.test(target)) {
        $('admCarouselTargetType').value = 'external_link';
        $('admCarouselTargetValue').value = target;
    } else {
        $('admCarouselTargetType').value = 'anchor';
        $('admCarouselTargetValue').value = target || '#catalog';
    }
}

function admEditBannerFromCache(id) {
    const banner = (window.admBannersCache || []).find(b => Number(b.id) === Number(id));
    if (!banner) return;
    $('admCarouselEditId').value = banner.id;
    $('admCarouselImageName').value = banner.image || '';
    $('admCarouselTitle').value = banner.title || '';
    $('admCarouselSubtitle').value = banner.subtitle || '';
    $('admCarouselActionText').value = banner.action_text || '';
    $('admCarouselInterval').value = banner.interval_ms || 4500;
    $('admCarouselSort').value = banner.sort_order || 0;
    $('admCarouselActive').checked = Number(banner.active) === 1;
    admFillTargetInputs(banner.target);
    $('admCarouselSaveBtn').textContent = 'Yangilash';
    $('admCarouselTitle').focus();
}

async function admSaveBanner() {
    const id = parseInt($('admCarouselEditId')?.value || '0', 10);
    const image = ($('admCarouselImageName')?.value || '').trim();
    if (!id && !image) {
        alert('Avval rasm yuklang yoki mavjud bannerni tanlang.');
        return;
    }
    const btn = $('admCarouselSaveBtn');
    btn.disabled = true;
    btn.textContent = 'Saqlanmoqda...';
    const payload = {
        user_id: tg.initDataUnsafe?.user?.id,
        id,
        image,
        title: $('admCarouselTitle').value.trim(),
        subtitle: $('admCarouselSubtitle').value.trim(),
        action_text: $('admCarouselActionText').value.trim(),
        target: admBuildBannerTarget(),
        interval_ms: parseInt($('admCarouselInterval').value, 10) || 4500,
        sort_order: parseInt($('admCarouselSort').value, 10) || 0,
        active: $('admCarouselActive').checked ? 1 : 0,
    };
    try {
        await fetch('/api/admin/banners', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        admResetCarouselForm();
        await loadAdminBanners();
        await loadConfig();
        renderPromoCarousel();
        haptic('notificationOccurred', 'success');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Saqlash';
    }
}

function admBuildBannerTarget() {
    const type = $('admCarouselTargetType')?.value || 'anchor';
    const value = ($('admCarouselTargetValue')?.value || '').trim();
    if (!value) return '';
    if (type === 'product_id') return `product:${parseInt(value, 10) || 0}`;
    if (type === 'category') return `category:${value}`;
    if (type === 'external_link') return value;
    return value.startsWith('#') ? value : `#${value}`;
}

function admBannerTargetLabel(target) {
    target = String(target || '');
    if (!target) return 'Target yoq';
    if (target.startsWith('product:')) return `Product ID: ${target.slice(8)}`;
    if (target.startsWith('category:')) return `Kategoriya: ${target.slice(9)}`;
    if (target.startsWith('#')) return `Anchor: ${target}`;
    return `Link: ${target}`;
}

if ($('admCarouselFiles')) $('admCarouselFiles').addEventListener('change', async function() {
    const files = Array.from(this.files || []);
    if (!files.length) return;
    const btn = $('admCarouselUploadBtn');
    btn.textContent = 'Yuklanmoqda...';
    btn.disabled = true;
    for (const file of files) {
        const fd = new FormData();
        fd.append('image', file);
        try {
            const uid = tg.initDataUnsafe?.user?.id || 0;
            const upload = await (await fetch('/api/admin/upload_image?user_id=' + uid, { method: 'POST', body: fd })).json();
            if (upload.filename) {
                $('admCarouselImageName').value = upload.filename;
                if (!parseInt($('admCarouselEditId')?.value || '0', 10)) {
                    await admSaveBanner();
                }
            }
        } catch(e) { console.warn(e); }
    }
    this.value = '';
    btn.textContent = 'Rasm yuklash';
    btn.disabled = false;
    await loadAdminBanners();
    await loadConfig();
});

async function loadAdminBanners() {
    const el = $('admCarouselList');
    if (!el) return;
    el.innerHTML = '<div class="adm-loading"><div class="adm-spinner"></div><span>Yuklanmoqda...</span></div>';
    try {
        const banners = await (await fetch('/api/admin/banners?user_id=' + (tg.initDataUnsafe?.user?.id || 0))).json();
        window.admBannersCache = Array.isArray(banners) ? banners : [];
        if (!Array.isArray(banners) || !banners.length) {
            el.innerHTML = '<div class="adm-loading">Karusel rasmlari mavjud emas</div>';
            return;
        }
        el.innerHTML = '';
        banners.forEach(b => {
            const row = document.createElement('div');
            row.className = 'adm-carousel-item';
            row.innerHTML = `
                <div class="adm-carousel-thumb" style="background-image:url(/uploads/${b.image})"></div>
                <div class="adm-carousel-meta">
                    <b>${escHtml(b.title || 'Aksiya banneri')}</b>
                    ${b.subtitle ? `<small>${escHtml(b.subtitle)}</small>` : ''}
                    ${b.action_text ? `<em>${escHtml(b.action_text)}</em>` : ''}
                    <span>${b.interval_ms || 4500} ms - ${b.active ? 'Aktiv' : 'Nofaol'} - ${admBannerTargetLabel(b.target)}</span>
                </div>
                <div class="adm-product-actions">
                    <button class="adm-prod-btn adm-prod-edit" onclick="admEditBannerFromCache(${b.id})">Tahrirlash</button>
                    <button class="adm-prod-btn adm-prod-toggle" onclick="admDeleteBanner(${b.id})">O'chirish</button>
                </div>`;
            el.appendChild(row);
        });
    } catch(e) {
        el.innerHTML = '<div class="adm-loading">Karuselni yuklashda xatolik</div>';
    }
}

async function admToggleBanner(id, active) {
    await fetch('/api/admin/banners', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: tg.initDataUnsafe?.user?.id, id, active, interval_ms: parseInt($('admCarouselInterval').value) || 4500 })
    });
    await loadAdminBanners();
    await loadConfig();
}

async function admDeleteBanner(id) {
    if (!confirm('Banner o\'chirilsinmi?')) return;
    await fetch('/api/admin/banners', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: tg.initDataUnsafe?.user?.id, id })
    });
    await loadAdminBanners();
    await loadConfig();
}

function admPromoStatusLabel(status) {
    return {
        active: 'Aktiv',
        disabled: "O'chirilgan",
        expired: 'Muddati tugagan',
        not_started: 'Boshlanmagan',
        limit_reached: 'Limit tugagan',
        deleted: "O'chirilgan"
    }[status] || status || '-';
}

function admPromoTypeLabel(type) {
    return {
        percent: 'Foiz',
        fixed_amount: 'Fiks summa',
        free_delivery: 'Bepul yetkazish'
    }[type] || type || '-';
}

function admPromoList(value) {
    return Array.isArray(value) ? value : admListFromJson(value);
}

function admCheckedValues(name) {
    return [...document.querySelectorAll(`input[name="${name}"]:checked`)].map(x => x.value);
}

function admSetCheckedValues(name, values) {
    const set = new Set(admPromoList(values).map(String));
    document.querySelectorAll(`input[name="${name}"]`).forEach(input => {
        input.checked = set.has(input.value);
    });
}

async function admLoadPromocodes() {
    setAdmLoading('admPromocodesList');
    try {
        const data = await (await fetch('/api/admin/promocodes?user_id=' + admUid())).json();
        admPromocodesCache = Array.isArray(data) ? data : (data.promocodes || []);
        admRenderPromocodes(admPromocodesCache);
    } catch (e) {
        $('admPromocodesList').innerHTML = '<div class="adm-loading">Promokodlarni yuklashda xatolik</div>';
    }
}

function admRenderPromocodes(list) {
    const el = $('admPromocodesList');
    if (!el) return;
    el.innerHTML = '';
    if (!list.length) {
        el.innerHTML = '<div class="adm-loading">Promokodlar mavjud emas</div>';
        return;
    }
    list.forEach((p, idx) => {
        const card = document.createElement('div');
        card.className = 'adm-product-card adm-promo-card';
        const limit = p.total_usage_limit ? `${p.used_count || 0}/${p.total_usage_limit}` : `${p.used_count || 0}/∞`;
        const userLimit = p.per_user_limit ? p.per_user_limit : '∞';
        const dates = [p.starts_at || '...', p.ends_at || '...'].join(' - ');
        card.innerHTML = `
            <div class="adm-promo-icon"><i class="fi fi-rr-ticket"></i></div>
            <div class="adm-product-info">
                <div class="adm-product-name">${escHtml(p.code)} - ${escHtml(p.title || '')}</div>
                <div class="adm-product-price">${admPromoTypeLabel(p.promo_type)} · ishlatilgan ${limit} · user ${userLimit}</div>
                <div class="adm-product-price">${escHtml(dates)}</div>
                <div class="adm-product-tags">
                    <span class="adm-product-tag ${p.status === 'active' ? 'tag-active' : 'tag-inactive'}">${admPromoStatusLabel(p.status)}</span>
                    ${p.min_order_amount ? `<span class="adm-product-tag tag-bogo">min ${fmt(p.min_order_amount)}</span>` : ''}
                    ${admPromoList(p.product_ids).length ? '<span class="adm-product-tag tag-discount">products</span>' : ''}
                    ${admPromoList(p.category_names).length ? '<span class="adm-product-tag tag-discount">categories</span>' : ''}
                </div>
            </div>
            <div class="adm-product-actions">
                <button class="adm-prod-btn adm-prod-edit" onclick="admOpenPromoFormById(${p.id})">Tahrirlash</button>
                <button class="adm-prod-btn adm-prod-edit" onclick="admTogglePromo(${p.id}, ${p.active ? 0 : 1})">${p.active ? "O'chirish" : 'Yoqish'}</button>
                <button class="adm-prod-btn adm-prod-toggle" onclick="admDeletePromo(${p.id})">Delete</button>
            </div>`;
        el.appendChild(card);
    });
}

async function admEnsurePromoRefs() {
    if (!allAdminProducts.length) {
        try {
            allAdminProducts = await (await fetch('/api/products?all=1&user_id=' + admUid())).json();
        } catch (e) {
            allAdminProducts = [];
        }
    }
    const cats = [...new Set(allAdminProducts.map(p => p.category).filter(Boolean))];
    const sampleProducts = allAdminProducts.slice(0, 8).map(p => `${p.id}: ${p.name}`).join('<br>');
    if ($('admPromoHelp')) {
        $('admPromoHelp').innerHTML = [
            cats.length ? `<b>Kategoriyalar:</b> ${cats.map(escHtml).join(', ')}` : '',
            sampleProducts ? `<b>Product ID:</b><br>${sampleProducts}` : ''
        ].filter(Boolean).join('<br>');
    }
}

async function admOpenPromoForm(promo = null) {
    await admEnsurePromoRefs();
    const p = promo || {};
    $('admPromoTitle').textContent = p.id ? 'Promokodni tahrirlash' : 'Yangi promokod';
    $('admPromoId').value = p.id || '';
    $('admPromoCode').value = p.code || '';
    $('admPromoName').value = p.title || '';
    $('admPromoDesc').value = p.description || '';
    $('admPromoType').value = p.promo_type || 'percent';
    $('admPromoValue').value = p.discount_value || 0;
    $('admPromoMax').value = p.max_discount_amount || 0;
    $('admPromoMin').value = p.min_order_amount || 0;
    $('admPromoStarts').value = (p.starts_at || '').slice(0, 10);
    $('admPromoEnds').value = (p.ends_at || '').slice(0, 10);
    $('admPromoTotalLimit').value = p.total_usage_limit || 0;
    $('admPromoUserLimit').value = p.per_user_limit || 0;
    $('admPromoPriority').value = p.priority || 100;
    $('admPromoActive').checked = p.id ? Boolean(p.active) : true;
    $('admPromoFirstOrder').checked = Boolean(p.first_order_only);
    $('admPromoNewUsers').checked = Boolean(p.new_users_only);
    $('admPromoStackable').checked = Boolean(p.stackable);
    $('admPromoProducts').value = admPromoList(p.product_ids).join(', ');
    $('admPromoCategories').value = admPromoList(p.category_names).join(', ');
    admSetCheckedValues('admPromoDelivery', p.allowed_delivery_types || []);
    admSetCheckedValues('admPromoPayment', p.allowed_payment_methods || []);
    window.Motion ? window.Motion.open($('admPromoModal')) : $('admPromoModal').classList.add('open');
}

function admOpenPromoFormById(id) {
    const promo = admPromocodesCache.find(p => p.id === id);
    admOpenPromoForm(promo || null);
}

async function admSavePromo() {
    const btn = $('admPromoSaveBtn');
    btn.textContent = 'Saqlanmoqda...';
    btn.disabled = true;
    const data = {
        user_id: admUid(),
        id: admIntInput('admPromoId', 0),
        code: $('admPromoCode').value.trim(),
        title: $('admPromoName').value.trim(),
        description: $('admPromoDesc').value.trim(),
        promo_type: $('admPromoType').value,
        discount_value: admIntInput('admPromoValue', 0),
        max_discount_amount: admIntInput('admPromoMax', 0),
        min_order_amount: admIntInput('admPromoMin', 0),
        starts_at: $('admPromoStarts').value,
        ends_at: $('admPromoEnds').value,
        active: $('admPromoActive').checked,
        total_usage_limit: admIntInput('admPromoTotalLimit', 0),
        per_user_limit: admIntInput('admPromoUserLimit', 0),
        allowed_delivery_types: admCheckedValues('admPromoDelivery'),
        allowed_payment_methods: admCheckedValues('admPromoPayment'),
        product_ids: $('admPromoProducts').value.split(',').map(x => parseInt(x.trim(), 10)).filter(Boolean),
        category_names: $('admPromoCategories').value.split(',').map(x => x.trim()).filter(Boolean),
        first_order_only: $('admPromoFirstOrder').checked,
        new_users_only: $('admPromoNewUsers').checked,
        stackable: $('admPromoStackable').checked,
        priority: admIntInput('admPromoPriority', 100)
    };
    try {
        const res = await (await fetch('/api/admin/promocode', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        })).json();
        if (!res.success) throw new Error(res.error || 'Promokodni saqlab bo\'lmadi');
        window.Motion ? window.Motion.close($('admPromoModal')) : $('admPromoModal').classList.remove('open');
        haptic('notificationOccurred', 'success');
        await admLoadPromocodes();
        await loadConfig();
    } catch (e) {
        alert(e.message || 'Promokodni saqlashda xatolik');
    }
    btn.textContent = 'Saqlash';
    btn.disabled = false;
}

async function admTogglePromo(id, active) {
    await fetch(`/api/admin/promocode/${id}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: admUid(), active: Boolean(active) })
    });
    await admLoadPromocodes();
    await loadConfig();
}

async function admDeletePromo(id) {
    if (!confirm('Promokod o\'chirilsinmi?')) return;
    await fetch(`/api/admin/promocode/${id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: admUid() })
    });
    await admLoadPromocodes();
    await loadConfig();
}

if ($('admAddPromoBtn')) $('admAddPromoBtn').onclick = () => admOpenPromoForm(null);
if ($('admPromoCancelBtn')) $('admPromoCancelBtn').onclick = () => window.Motion ? window.Motion.close($('admPromoModal')) : $('admPromoModal').classList.remove('open');
if ($('admPromoSaveBtn')) $('admPromoSaveBtn').onclick = admSavePromo;

async function loadAdminUsers() {
    if (userRole !== 'owner') return;
    setAdmLoading('admUsersList');
    try {
        const res = await (await fetch('/api/admin/users?user_id=' + tg.initDataUnsafe?.user?.id)).json();
        const el = $('admUsersList');
        el.innerHTML = '';
        if (!res.length) { el.innerHTML = '<div class="adm-loading">Foydalanuvchilar ma\'lumotlar bazasida mavjud emas</div>'; return; }
        res.forEach((u, idx) => {
            const card = document.createElement('div');
            card.className = 'adm-user-card';
            const name = [u.first_name, u.last_name].filter(Boolean).join(' ') || 'Ismsiz';
            const roleMap = { owner: 'Egasi', admin: 'Admin', deliver: 'Kuryer', user: 'Foydalanuvchi' };
            const roleIconMap = { owner: 'fi-rr-shield-check', admin: 'fi-rr-shield-check', deliver: 'fi-rr-marker', user: 'fi-rr-user' };
            card.innerHTML = `
                <div class="adm-user-head">
                    <div class="adm-user-avatar"><i class="fi ${roleIconMap[u.role] || roleIconMap.user}"></i></div>
                    <div>
                        <div class="adm-user-name">${name}</div>
                        <div class="adm-user-id">ID: ${u.id} - ${roleMap[u.role] || u.role}</div>
                    </div>
                </div>
                <div class="adm-user-edit-grid">
                    <label><span>Ism</span><input type="text" class="app-input adm-user-first" placeholder="Ism" value="${escAttr(u.first_name || '')}"></label>
                    <label><span>Familiya</span><input type="text" class="app-input adm-user-last" placeholder="Familiya" value="${escAttr(u.last_name || '')}"></label>
                    <label><span>Telefon</span><input type="tel" class="app-input adm-user-phone" placeholder="+998..." value="${escAttr(u.phone || '')}"></label>
                    <label><span>Rol</span>
                        <select class="app-input adm-user-role">
                            <option value="user" ${u.role === 'user' ? 'selected' : ''}>Foydalanuvchi</option>
                            <option value="deliver" ${u.role === 'deliver' ? 'selected' : ''}>Kuryer</option>
                            <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin</option>
                            <option value="owner" ${u.role === 'owner' ? 'selected' : ''}>Egasi</option>
                        </select>
                    </label>
                    <label><span>Status</span>
                        <select class="app-input adm-user-status">
                            <option value="active" ${(u.client_status || 'active') === 'active' ? 'selected' : ''}>Aktiv</option>
                            <option value="blocked" ${u.client_status === 'blocked' ? 'selected' : ''}>Bloklangan</option>
                            <option value="vip" ${u.client_status === 'vip' ? 'selected' : ''}>VIP</option>
                        </select>
                    </label>
                    <label class="adm-password-label"><span>Yangi parol</span>
                        <div class="adm-password-field">
                            <input type="password" class="app-input adm-user-password" placeholder="Bo'sh qoldirilsa, parol o'zgarmaydi" autocomplete="new-password">
                            <button class="adm-icon-btn adm-password-toggle" type="button" aria-label="Parolni ko'rsatish" onclick="admTogglePassword(this)">
                                ${admPasswordToggleIcon(false)}
                            </button>
                        </div>
                    </label>
                </div>
                <div class="adm-user-feedback" aria-live="polite"></div>
                <div class="adm-user-actions">
                    <button class="adm-prod-btn adm-prod-edit adm-user-save-btn" onclick="admSaveUserCard(${u.id}, this)">Saqlash</button>
                </div>`;
            el.appendChild(card);
        });
    } catch (e) { $('admUsersList').innerHTML = '<div class="adm-loading">Xatolik</div>'; }
}

function admPasswordToggleIcon(visible) {
    if (visible) {
        return `
            <svg class="adm-password-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M10.6 5.1c.45-.07.91-.1 1.4-.1 4.8 0 8.8 2.8 10 7a11.2 11.2 0 0 1-2.24 3.8" />
                <path d="M6.23 6.23A11.28 11.28 0 0 0 2 12c1.2 4.2 5.2 7 10 7 1.55 0 3-.29 4.29-.82" />
                <path d="M9.88 9.88A3 3 0 0 0 14.12 14.12" />
                <path d="M4.5 4.5 19.5 19.5" />
            </svg>`;
    }
    return `
        <svg class="adm-password-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M2 12c1.2-4.2 5.2-7 10-7s8.8 2.8 10 7c-1.2 4.2-5.2 7-10 7s-8.8-2.8-10-7Z" />
            <circle cx="12" cy="12" r="3" />
        </svg>`;
}

function admSetRole(uid, role) {
    fetch('/api/admin/set_role', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id: tg.initDataUnsafe?.user?.id, target_uid: uid, role }) });
    haptic('impactOccurred', 'light');
}

async function admSaveUserCard(uid, btn) {
    const card = btn.closest('.adm-user-card');
    const role = card.querySelector('.adm-user-role').value;
    const password = card.querySelector('.adm-user-password')?.value.trim() || '';
    const feedback = card.querySelector('.adm-user-feedback');
    if (password && password.length < 6) {
        feedback.textContent = 'Parol kamida 6 belgidan iborat bo\'lishi kerak.';
        feedback.className = 'adm-user-feedback error';
        haptic('notificationOccurred', 'error');
        return;
    }
    if (password && !['admin', 'deliver'].includes(role)) {
        feedback.textContent = 'Parol faqat Admin yoki Kuryer roli uchun ishlaydi.';
        feedback.className = 'adm-user-feedback error';
        haptic('notificationOccurred', 'error');
        return;
    }
    btn.disabled = true;
    const oldText = btn.textContent;
    btn.textContent = 'Saqlanmoqda...';
    try {
        const resp = await fetch('/api/admin/update_user', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: tg.initDataUnsafe?.user?.id,
                target_uid: uid,
                first_name: card.querySelector('.adm-user-first').value.trim(),
                last_name: card.querySelector('.adm-user-last').value.trim(),
                phone: card.querySelector('.adm-user-phone').value.trim(),
                role,
                client_status: card.querySelector('.adm-user-status')?.value || 'active',
                admin_password: password
            })
        });
        const data = await resp.json();
        if (!resp.ok || !data.success) throw new Error(data.error || 'save');
        feedback.textContent = password ? 'Ma\'lumotlar va yangi parol saqlandi.' : 'Ma\'lumotlar saqlandi.';
        feedback.className = 'adm-user-feedback success';
        card.querySelector('.adm-user-password').value = '';
        haptic('notificationOccurred', 'success');
        setTimeout(loadAdminUsers, 650);
    } catch (e) {
        feedback.textContent = 'Saqlashda xatolik yuz berdi.';
        feedback.className = 'adm-user-feedback error';
        haptic('notificationOccurred', 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = oldText;
    }
}

function admTogglePassword(btn) {
    const input = btn.closest('.adm-password-field')?.querySelector('input');
    if (!input) return;
    const nextVisible = input.type !== 'text';
    input.type = nextVisible ? 'text' : 'password';
    btn.setAttribute('aria-label', nextVisible ? 'Parolni yashirish' : "Parolni ko'rsatish");
    btn.innerHTML = admPasswordToggleIcon(nextVisible);
}

function setAdmLoading(id) {
    $(id).innerHTML = '<div class="adm-loading"><div class="adm-spinner"></div><span>Yuklanmoqda...</span></div>';
}


async function loadAdminOrders() {
    setAdmLoading('admOrdersList');
    try {
        admAllOrders = await (await fetch('/api/admin/orders?user_id=' + (tg.initDataUnsafe?.user?.id || 0))).json();
        renderAdminOrders();
    } catch (e) { $('admOrdersList').innerHTML = '<div class="adm-loading">Buyurtmalarni yuklashda xatolik yuz berdi</div>'; }
}

function renderAdminOrders() {
    const el = $('admOrdersList');
    let list = admCurrentFilter === 'all'
        ? admAllOrders
        : admAllOrders.filter(o => admCurrentFilter === 'pending' ? ['pending', 'tekshirilmoqda', 'payment_review', "kutilmoqda (to'lov)"].includes(o.status) : o.status === admCurrentFilter);
    if (!list.length) { el.innerHTML = '<div class="adm-loading">Sizda hali buyurtmalar mavjud emas</div>'; return; }

    el.innerHTML = '';
    list.forEach(o => {
        const card = document.createElement('div');
        card.className = `adm-order-card status-${o.status || 'pending'}`;

        const statusMap = {
            pending:        { text: ADM_STATUS_LABELS.pending, cls: 'pill-pending' },
            confirmed:      { text: 'Tasdiqlandi',  cls: 'pill-confirmed' },
            yetkazilmoqda:  { text: 'Yetkazib berilmoqda', cls: 'pill-yetkazilmoqda' },
            yetkazildi:     { text: 'Yetkazib berildi', cls: 'pill-yetkazildi' },
            cancelled:      { text: 'Bekor qilindi', cls: 'pill-cancelled' },
            tekshirilmoqda: { text: ADM_STATUS_LABELS.tekshirilmoqda, cls: 'pill-pending' },
            payment_review: { text: ADM_STATUS_LABELS.payment_review, cls: 'pill-pending' },
            failed:         { text: ADM_STATUS_LABELS.failed, cls: 'pill-cancelled' },
            rejected:       { text: ADM_STATUS_LABELS.rejected, cls: 'pill-cancelled' },
            fully_cancelled:{ text: ADM_STATUS_LABELS.fully_cancelled, cls: 'pill-cancelled' },
            "kutilmoqda (to'lov)": { text: ADM_STATUS_LABELS["kutilmoqda (to'lov)"], cls: 'pill-pending' }
        };
        const st = statusMap[o.status] || { text: o.status, cls: 'pill-pending' };

        let items = [];
        try { items = JSON.parse(o.items || '[]'); } catch (e) {}
        const itemsHtml = items.map(i =>
            `<div class="adm-item-row">
                <span class="adm-item-name">${i.name}</span>
                <span class="adm-item-qty">x${i.quantity}</span>
                <span class="adm-item-price">${fmt(i.price * i.quantity)} so'm</span>
            </div>`
        ).join('');

        const dateStr = o.created_at ? o.created_at.replace('T', ' ').slice(0, 16) : '';
        const payIcon = '';
        const delivIcon = '';

        let adminNote = '';
        if (o.admin_name && ['confirmed','yetkazilmoqda','yetkazildi'].includes(o.status)) {
            adminNote = `<div class="adm-admin-note"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>Tasdiqladi: <b>${o.admin_name}</b></div>`;
        }
        if (o.status === 'cancelled' && o.admin_name) {
            adminNote = `<div class="adm-admin-note" style="color:var(--color-accent);"><i class="fi fi-rr-cross-circle"></i>Bekor: <b>${o.admin_name}</b>${o.reject_reason ? ' - ' + o.reject_reason : ''}</div>`;
        }

        let actions = '';
        if (o.status === 'pending' && userRole !== 'deliver') {
            actions = `<div class="adm-order-actions adm-order-primary-actions">
                <button class="adm-action-btn adm-action-green" onclick="admConfirmOrder(${o.id})">Tasdiqlash</button>
                <button class="adm-action-btn adm-action-red" onclick="openCancelModal(${o.id})">Bekor qilish</button>
            </div>`;
        } else if (['tekshirilmoqda', 'payment_review', "kutilmoqda (to'lov)"].includes(o.status) && userRole !== 'deliver') {
            actions = `<div class="adm-order-actions adm-order-primary-actions">
                <button class="adm-action-btn adm-action-green" onclick="admConfirmPayment(${o.id})">To'lovni tasdiqlash</button>
                <button class="adm-action-btn adm-action-red" onclick="admRejectPayment(${o.id})">Rad etish</button>
            </div>`;
        } else if (o.status === 'confirmed') {
            actions = `<div class="adm-order-actions adm-order-primary-actions">
                <button class="adm-action-btn adm-action-accent" onclick="admSetStatus(${o.id},'yetkazilmoqda')">Yo'lga chiqdi</button>
                <button class="adm-action-btn adm-action-green" onclick="admSetStatus(${o.id},'yetkazildi')">Yetkazildi</button>
                <button class="adm-action-btn adm-action-red" onclick="openCancelModal(${o.id})">Bekor qilish</button>
            </div>`;
        } else if (o.status === 'yetkazilmoqda') {
            actions = `<div class="adm-order-actions adm-order-primary-actions">
                <button class="adm-action-btn adm-action-green" onclick="admSetStatus(${o.id},'yetkazildi')">Yetkazildi</button>
                <button class="adm-action-btn adm-action-red" onclick="openCancelModal(${o.id})">Bekor qilish</button>
            </div>`;
        }
        if (userRole === 'owner') {
            actions += `<div class="adm-order-actions adm-order-delete-row">
                <button class="adm-action-btn adm-action-red adm-action-delete" onclick="admDeleteOrder(${o.id}, '${o.code || o.id}')">Butunlay o'chirish</button>
            </div>`;
        }

        const addrClean = (o.address || '').replace(/<[^>]*>/g, '').replace(/\\n/g, ' ').trim();
        const orderSub = Number(o.subtotal || 0);
        const orderDelivery = Number(o.delivery_cost || 0);
        const orderPromo = o.promo || '';
        const orderPhone = o.phone || '';
        const orderComment = o.comment || '';

        card.innerHTML = `
            <div class="adm-order-head">
                <div>
                    <div class="adm-order-code">#${o.code || o.id}</div>
                    <div class="adm-order-time">${dateStr}</div>
                </div>
                <span class="adm-status-pill ${st.cls}">${st.text}</span>
            </div>
            <div class="adm-order-divider"></div>
            <div class="adm-order-body">
                <div class="adm-order-meta">
                    <div class="adm-meta-item">
                        <span class="adm-meta-key">Mijoz ID</span>
                        <span class="adm-meta-val">${o.user_id}</span>
                    </div>
                    <div class="adm-meta-item">
                        <span class="adm-meta-key">To'lov</span>
                        <span class="adm-meta-val">${payIcon} ${admPaymentLabel(o.payment_method)}</span>
                    </div>
                    <div class="adm-meta-item">
                        <span class="adm-meta-key">Yetkazish</span>
                        <span class="adm-meta-val">${delivIcon} ${o.delivery_type === 'pickup' ? 'Olib ketish' : 'Yetkazish'}</span>
                    </div>
                    <div class="adm-meta-item">
                        <span class="adm-meta-key">Pozitsiyalar</span>
                        <span class="adm-meta-val">${items.length} ta</span>
                    </div>
                    ${orderPhone ? `<div class="adm-meta-item"><span class="adm-meta-key">Telefon</span><span class="adm-meta-val">${orderPhone}</span></div>` : ''}
                    ${orderPromo ? `<div class="adm-meta-item"><span class="adm-meta-key">Promo</span><span class="adm-meta-val">${orderPromo}</span></div>` : ''}
                </div>
                <div class="adm-order-items">${itemsHtml || '<div class="adm-item-row"><span class="adm-item-name" style="color:var(--text-secondary)">-</span></div>'}</div>
                <div class="adm-order-breakdown">
                    ${orderSub ? `<div><span>Mahsulotlar</span><b>${fmt(orderSub)} so'm</b></div>` : ''}
                    <div><span>Yetkazish</span><b>${orderDelivery ? fmt(orderDelivery) + " so'm" : 'Bepul'}</b></div>
                </div>
                <div class="adm-order-total">
                    <span class="adm-total-label">Jami summa</span>
                    <span class="adm-total-price">${fmt(o.total_price)} so'm</span>
                </div>
                ${addrClean ? `<div class="adm-order-address"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>${addrClean}</div>` : ''}
                ${orderComment ? `<div class="adm-order-address"><i class="fi fi-rr-comment"></i>${orderComment}</div>` : ''}
                ${adminNote}
            </div>
            ${actions}
        `;
        el.appendChild(card);
    });
}

function openCancelModal(oid) {
    $('cancelOrderId').value = oid;
    document.querySelectorAll('input[name="cancelReason"]').forEach(r => r.checked = false);
    window.Motion ? window.Motion.open($('admCancelModal')) : $('admCancelModal').classList.add('open');
}
$('cancelModalClose').onclick = () => window.Motion ? window.Motion.close($('admCancelModal')) : $('admCancelModal').classList.remove('open');
$('cancelModalConfirm').onclick = async () => {
    const oid = $('cancelOrderId').value;
    const sel = document.querySelector('input[name="cancelReason"]:checked');
    if (!sel) { haptic('notificationOccurred', 'error'); return; }
    await fetch('/api/admin/update_order', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: tg.initDataUnsafe?.user?.id, order_id: parseInt(oid), status: 'cancelled', reject_reason: sel.value })
    });
    window.Motion ? window.Motion.close($('admCancelModal')) : $('admCancelModal').classList.remove('open');
    haptic('notificationOccurred', 'success');
    loadAdminStats(); loadAdminOrders();
};

async function admConfirmOrder(oid) {
    await fetch('/api/admin/update_order', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: tg.initDataUnsafe?.user?.id, order_id: oid, status: 'confirmed' })
    });
    haptic('notificationOccurred', 'success');
    loadAdminStats(); loadAdminOrders();
}

async function admConfirmPayment(oid) {
    await fetch('/api/admin/update_order', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: tg.initDataUnsafe?.user?.id, order_id: oid, status: 'confirmed' })
    });
    haptic('notificationOccurred', 'success');
    loadAdminStats();
    loadAdminOrders();
}

async function admRejectPayment(oid) {
    await fetch('/api/admin/update_order', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: tg.initDataUnsafe?.user?.id, order_id: oid, status: 'cancelled', reject_reason: "To'lov rad etildi" })
    });
    haptic('notificationOccurred', 'success');
    loadAdminStats();
    loadAdminOrders();
}

async function admSetStatus(oid, st) {
    await fetch('/api/admin/update_order', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: tg.initDataUnsafe?.user?.id, order_id: oid, status: st })
    });
    haptic('impactOccurred', 'medium');
    loadAdminStats(); loadAdminOrders();
}

async function admDeleteOrder(oid, label) {
    if (userRole !== 'owner') return;
    const ok = confirm(`#${label} buyurtmasi va cheki bazadan butunlay o'chirilsinmi?`);
    if (!ok) return;
    const resp = await fetch('/api/admin/order', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: tg.initDataUnsafe?.user?.id, order_id: oid })
    });
    if (resp.ok && (await resp.json()).success) {
        haptic('notificationOccurred', 'success');
        loadAdminStats();
        loadAdminOrders();
    } else {
        haptic('notificationOccurred', 'error');
        alert("Buyurtmani o'chirishda xatolik yuz berdi.");
    }
}

function admStatusLabel(status) {
    return ADM_STATUS_LABELS[status] || status || '-';
}

function admFormatDate(value) {
    return value ? String(value).replace('T', ' ').slice(0, 16) : '-';
}

function admValidValue(value) {
    const text = String(value ?? '').trim();
    return text && text !== '-';
}

function admOrderItems(order) {
    if (Array.isArray(order.parsed_items)) return order.parsed_items;
    try { return JSON.parse(order.items || '[]'); } catch (e) { return []; }
}

function admOrderItemsHtml(order) {
    const items = admOrderItems(order);
    if (!items.length) return '<div class="adm-mini-empty">Tovarlar ko\'rsatilmagan</div>';
    return items.map(item => `
        <div class="adm-receipt-item">
            <span>${escHtml(item.name || 'Tovar')}</span>
            <small>${Number(item.quantity || 1)} x ${fmt(Number(item.price || 0))}</small>
            <strong>${fmt(Number(item.price || 0) * Number(item.quantity || 1))} so'm</strong>
        </div>
    `).join('');
}

function admReceiptCardHtml(o, options = {}) {
    const compact = Boolean(options.compact);
    const itemsHtml = admOrderItemsHtml(o);
    const total = Number(o.total_price || 0);
    const subtotal = Number(o.subtotal || Math.max(total - Number(o.delivery_cost || 0), 0));
    const deliveryCost = Number(o.delivery_cost || 0);
    const discountAmount = Number(o.discount_amount || 0);
    const status = admStatusLabel(o.status);
    const delivery = o.delivery_type === 'pickup' ? 'Olib ketish' : 'Yetkazish';
    const payment = admPaymentLabel(o.payment_method);
    const customer = o.user_name || o.user_id || 'Mijoz';
    return `
        <article class="adm-receipt-row ${compact ? 'compact' : ''}">
            <div class="adm-receipt-top">
                <div class="adm-receipt-title">
                    <b>#${escHtml(o.code || o.receipt_id || o.id)}</b>
                    ${!compact ? `<span class="adm-status-pill">${escHtml(status)}</span>` : ''}
                </div>
                <span>${fmt(total)} so'm</span>
            </div>
            <div class="adm-receipt-meta">
                <span>${escHtml(admFormatDate(o.created_at))}</span>
                ${compact ? `<span>${escHtml(status)}</span>` : ''}
                <span>${escHtml(delivery)}</span>
                <span>${escHtml(payment)}</span>
            </div>
            ${!compact ? `<div class="adm-receipt-meta"><span>Mijoz: ${escHtml(customer)}</span><span>TG ${escHtml(o.user_id || '')}</span>${o.phone ? `<span>${escHtml(o.phone)}</span>` : ''}</div>` : ''}
            <div class="adm-receipt-items">${itemsHtml}</div>
            ${o.comment ? `<div class="adm-profile-note">${escHtml(o.comment)}</div>` : ''}
            <div class="adm-receipt-footer">
                <span>Mahsulotlar: ${fmt(subtotal)} so'm</span>
                ${discountAmount ? `<span>Chegirma: -${fmt(discountAmount)} so'm</span>` : ''}
                <span>Yetkazish: ${deliveryCost ? fmt(deliveryCost) + " so'm" : 'Bepul'}</span>
                <b>Jami: ${fmt(total)} so'm</b>
            </div>
        </article>
    `;
}

async function loadAdminCustomers() {
    if (userRole === 'deliver') {
        $('admCustomersList').innerHTML = '<div class="adm-access-denied">Kuryerlar uchun mijoz profillari yopiq.</div>';
        return;
    }
    setAdmLoading('admCustomersList');
    if ($('admCustomerProfile')) $('admCustomerProfile').style.display = 'none';
    const params = new URLSearchParams({ user_id: admUid() });
    if ($('admCustomerSearch')?.value.trim()) params.set('q', $('admCustomerSearch').value.trim());
    if (userRole === 'owner') {
        if ($('admCustomerMinOrders')?.value) params.set('min_orders', $('admCustomerMinOrders').value);
        if ($('admCustomerMinTotal')?.value) params.set('min_total', $('admCustomerMinTotal').value);
        if ($('admCustomerSort')?.value) params.set('sort', $('admCustomerSort').value);
    }
    try {
        const resp = await fetch('/api/admin/customers?' + params.toString());
        const data = await resp.json();
        if (!resp.ok || data.error) throw new Error(data.error || 'customers');
        admCustomersCache = data.customers || [];
        if (!admCustomersCache.some(c => Number(c.id) === Number(admSelectedCustomerId))) admSelectedCustomerId = null;
        renderAdminCustomers(data);
    } catch (e) {
        $('admCustomersList').innerHTML = '<div class="adm-loading">Mijozlarni yuklashda xatolik yuz berdi</div>';
    }
}

function renderAdminCustomers(data) {
    const list = data.customers || admCustomersCache || [];
    const note = $('admCustomerAccess');
    note.style.display = userRole === 'admin' ? 'block' : 'none';
    note.textContent = userRole === 'admin'
        ? 'Admin rejimi: faqat telefon yoki Telegram ID orqali aniq mijoz qidiriladi.'
        : '';
    if (!list.length) {
        $('admCustomersList').innerHTML = '<div class="adm-loading">Mijoz topilmadi</div>';
        return;
    }
    $('admCustomersList').innerHTML = list.map(c => {
        const selected = Number(c.id) === Number(admSelectedCustomerId);
        return `
            <div class="adm-customer-entry" data-customer-id="${Number(c.id)}">
                <button type="button" class="adm-customer-card ${selected ? 'selected' : ''}" onclick="loadCustomerProfile(${Number(c.id)})">
                    <span class="adm-customer-avatar">${escHtml((c.name || '?').slice(0, 1).toUpperCase())}</span>
                    <span class="adm-customer-main">
                        <b>${escHtml(c.name || 'Nomsiz mijoz')}</b>
                        <small>${escHtml(c.phone || 'Telefon yoq')} · TG ${escHtml(c.telegram_id || c.id)}</small>
                        ${admValidValue(c.last_activity) ? `<small>${escHtml(admFormatDate(c.last_activity))}</small>` : ''}
                    </span>
                    <span class="adm-customer-metrics">
                        <b>${Number(c.orders_count || 0)} ta</b>
                        <small>${fmt(Number(c.total_spent || 0))} so'm</small>
                    </span>
                </button>
                <div class="adm-customer-inline" id="admCustomerInline-${Number(c.id)}"></div>
            </div>
        `;
    }).join('');
    const cachedProfileId = admLastCustomerProfile?.customer?.id || admLastCustomerProfile?.id;
    if (cachedProfileId) renderCustomerProfile(admLastCustomerProfile);
}

async function loadCustomerProfile(uid) {
    if (userRole === 'deliver') return;
    const same = Number(admSelectedCustomerId) === Number(uid);
    admSelectedCustomerId = same ? null : Number(uid);
    admLastCustomerProfile = null;
    renderAdminCustomers({ customers: admCustomersCache });
    if (same) return;
    const slot = $(`admCustomerInline-${uid}`);
    if (slot) slot.innerHTML = admCustomerStateHtml('loading', 'Profil yuklanmoqda...');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    try {
        const params = new URLSearchParams({ user_id: admUid() });
        const search = $('admCustomerSearch')?.value.trim();
        if (search) params.set('q', search);
        const resp = await fetch(`/api/admin/customer/${uid}?${params.toString()}`, { signal: controller.signal });
        const data = await resp.json();
        if (!resp.ok || data.error) throw new Error(data.error || 'profile');
        if (Number(admSelectedCustomerId) !== Number(uid)) return;
        admLastCustomerProfile = data;
        renderCustomerProfile(data);
    } catch (e) {
        const errorSlot = $(`admCustomerInline-${uid}`);
        if (errorSlot && Number(admSelectedCustomerId) === Number(uid)) {
            errorSlot.innerHTML = admCustomerStateHtml('error', e.name === 'AbortError' ? 'Profil yuklanmadi. Qayta urinib ko\'ring.' : 'Mijoz profilini ochib bo\'lmadi.');
        }
    } finally {
        clearTimeout(timeoutId);
    }
}

function admCustomerStateHtml(type, text) {
    const spinner = type === 'loading' ? '<div class="adm-spinner"></div>' : '<i class="fi fi-rr-exclamation"></i>';
    return `<div class="adm-customer-profile inline state-${type}"><div class="adm-profile-state">${spinner}<span>${escHtml(text)}</span></div></div>`;
}

function renderCustomerProfile(data) {
    const c = data.customer || data || {};
    const orders = data.orders || [];
    const slot = $(`admCustomerInline-${c.id}`);
    if (!slot) return;
    const statItems = [
        Number(c.orders_count || 0) ? `<div><b>${Number(c.orders_count || 0)}</b><span>Buyurtma</span></div>` : '',
        Number(c.total_spent || 0) ? `<div><b>${fmt(Number(c.total_spent || 0))}</b><span>Jami</span></div>` : '',
        Number(c.avg_check || 0) ? `<div><b>${fmt(Number(c.avg_check || 0))}</b><span>O'rtacha chek</span></div>` : '',
        Number(c.cancelled_orders || 0) ? `<div><b>${Number(c.cancelled_orders || 0)}</b><span>Bekor qilingan</span></div>` : '',
    ].filter(Boolean).join('');
    const metaItems = [
        admValidValue(c.last_activity) ? `<span>So'nggi faollik: <b>${escHtml(admFormatDate(c.last_activity))}</b></span>` : '',
        (c.addresses || []).length ? `<span>Manzil: <b>${escHtml((c.addresses || []).join(' · '))}</b></span>` : '',
    ].filter(Boolean).join('');
    slot.innerHTML = `
        <div class="adm-customer-profile inline">
        <div class="adm-profile-head">
            <div>
                <h3>${escHtml(c.name || 'Mijoz')}</h3>
                <p>${escHtml(c.phone || 'Telefon yoq')} · TG ${escHtml(c.telegram_id || c.id)}</p>
            </div>
            <span class="adm-status-pill">${escHtml(c.client_status || 'active')}</span>
        </div>
        ${statItems ? `<div class="adm-profile-stats">${statItems}</div>` : '<div class="adm-muted-line">Hozircha buyurtmalar yoq.</div>'}
        ${metaItems ? `<div class="adm-profile-meta">${metaItems}</div>` : ''}
        ${c.admin_notes ? `<div class="adm-profile-note">${escHtml(c.admin_notes)}</div>` : ''}
        <div class="adm-inline-filters">
            <select id="custOrderStatus-${c.id}" class="app-input cust-order-filter">
                <option value="">Status</option><option value="pending">Kutilmoqda</option><option value="tekshirilmoqda">To'lov tekshirilmoqda</option><option value="confirmed">Tasdiqlangan</option><option value="yetkazilmoqda">Yo'lda</option><option value="yetkazildi">Yakunlangan</option><option value="cancelled">Bekor</option>
            </select>
            <select id="custOrderPay-${c.id}" class="app-input cust-order-filter"><option value="">To'lov</option><option value="cash">Naqd</option><option value="card">Karta</option><option value="click">Click</option><option value="payme">Payme</option><option value="transfer">O'tkazma</option></select>
            <select id="custOrderDelivery-${c.id}" class="app-input cust-order-filter"><option value="">Olish turi</option><option value="delivery">Yetkazish</option><option value="pickup">Olib ketish</option></select>
        </div>
        <div id="custOrdersList-${c.id}" class="adm-compact-list"></div>
        </div>
    `;
    [`custOrderStatus-${c.id}`, `custOrderPay-${c.id}`, `custOrderDelivery-${c.id}`].forEach(id => {
        const el = $(id);
        if (el) el.onchange = () => renderCustomerOrders(orders, c.id);
    });
    renderCustomerOrders(orders, c.id);
}

function renderCustomerOrders(orders, customerId) {
    const filters = {
        status: $(`custOrderStatus-${customerId}`)?.value || '',
        pay: $(`custOrderPay-${customerId}`)?.value || '',
        delivery: $(`custOrderDelivery-${customerId}`)?.value || '',
    };
    const list = orders.filter(o => {
        if (filters.status && o.status !== filters.status) return false;
        if (filters.pay && o.payment_method !== filters.pay) return false;
        if (filters.delivery && o.delivery_type !== filters.delivery) return false;
        return true;
    });
    const target = $(`custOrdersList-${customerId}`);
    if (!target) return;
    target.innerHTML = list.length ? list.map(o => admReceiptCardHtml(o, { compact: true })).join('') : '<div class="adm-loading">Bu filtr bo\'yicha buyurtma yoq</div>';
}

async function loadAdminReceipts() {
    if (userRole === 'deliver') {
        $('admReceiptsList').innerHTML = '<div class="adm-access-denied">Kuryerlar uchun cheklar yopiq.</div>';
        return;
    }
    setAdmLoading('admReceiptsList');
    const map = {
        admReceiptQ: 'q',
        admReceiptFrom: 'total_from',
        admReceiptTo: 'total_to',
        admReceiptDateFrom: 'date_from',
        admReceiptDateTo: 'date_to',
        admReceiptUser: 'client_id',
        admReceiptPhone: 'phone',
        admReceiptAdmin: 'admin',
        admReceiptCourier: 'courier',
        admReceiptStatus: 'status',
        admReceiptPayment: 'payment_method',
        admReceiptDelivery: 'delivery_type',
        admReceiptSort: 'sort'
    };
    const params = new URLSearchParams({ user_id: admUid() });
    Object.entries(map).forEach(([id, key]) => {
        const value = $(id)?.value;
        if (value) params.set(key, value);
    });
    try {
        const resp = await fetch('/api/admin/receipts?' + params.toString());
        const data = await resp.json();
        if (!resp.ok || data.error) throw new Error(data.error || 'receipts');
        renderAdminReceipts(data);
    } catch (e) {
        $('admReceiptsList').innerHTML = '<div class="adm-loading">Cheklarni yuklashda xatolik yuz berdi</div>';
    }
}

function renderAdminReceipts(data) {
    const summary = data.summary || {};
    $('admReceiptSummary').innerHTML = `
        <div><b>${Number(summary.count || 0)}</b><span>Cheklar</span></div>
        <div><b>${fmt(Number(summary.total || 0))}</b><span>Jami summa</span></div>
        <div><b>${fmt(Number(summary.avg || 0))}</b><span>O'rtacha chek</span></div>
    `;
    const receipts = data.receipts || [];
    if (!receipts.length) {
        $('admReceiptsList').innerHTML = '<div class="adm-loading">Filtr bo\'yicha chek topilmadi</div>';
        return;
    }
    $('admReceiptsList').innerHTML = receipts.map(o => admReceiptCardHtml(o)).join('');
}

function setReceiptQuickRange(type) {
    const now = new Date();
    const iso = d => d.toISOString().slice(0, 10);
    const start = new Date(now);
    if (type === 'yesterday') start.setDate(start.getDate() - 1);
    if (type === 'week') start.setDate(start.getDate() - 6);
    if (type === 'month') start.setMonth(start.getMonth() - 1);
    $('admReceiptDateFrom').value = iso(start);
    $('admReceiptDateTo').value = type === 'yesterday' ? iso(start) : iso(now);
    loadAdminReceipts();
}

const debouncedCustomerSearch = debounce(loadAdminCustomers, 300);
['admCustomerSearch', 'admCustomerMinOrders', 'admCustomerMinTotal'].forEach(id => {
    if ($(id)) {
        $(id).addEventListener('input', debouncedCustomerSearch);
        $(id).addEventListener('keydown', e => { if (e.key === 'Enter') loadAdminCustomers(); });
    }
});
if ($('admCustomerSort')) $('admCustomerSort').addEventListener('change', loadAdminCustomers);
if ($('admCustomerFilterToggle')) $('admCustomerFilterToggle').onclick = () => {
    const panel = $('admCustomerAdvanced');
    const btn = $('admCustomerFilterToggle');
    const open = !panel.classList.contains('open');
    panel.classList.toggle('open', open);
    btn.classList.toggle('active', open);
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    btn.setAttribute('aria-label', open ? 'Mijoz filtrlarini yopish' : 'Mijoz filtrlarini ochish');
    haptic('selectionChanged');
};

const debouncedReceiptSearch = debounce(loadAdminReceipts, 300);
['admReceiptQ','admReceiptFrom','admReceiptTo','admReceiptDateFrom','admReceiptDateTo','admReceiptUser','admReceiptPhone','admReceiptAdmin','admReceiptCourier'].forEach(id => {
    if ($(id)) {
        $(id).addEventListener('input', debouncedReceiptSearch);
        $(id).addEventListener('keydown', e => { if (e.key === 'Enter') loadAdminReceipts(); });
    }
});
['admReceiptStatus','admReceiptPayment','admReceiptDelivery','admReceiptSort'].forEach(id => {
    if ($(id)) $(id).addEventListener('change', loadAdminReceipts);
});
if ($('admReceiptFilterToggle')) $('admReceiptFilterToggle').onclick = () => {
    const panel = $('admReceiptAdvanced');
    const btn = $('admReceiptFilterToggle');
    const open = !panel.classList.contains('open');
    panel.classList.toggle('open', open);
    btn.classList.toggle('active', open);
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    btn.setAttribute('aria-label', open ? 'Filtrlarni yopish' : 'Filtrlarni ochish');
    haptic('selectionChanged');
};
if ($('admReceiptResetBtn')) $('admReceiptResetBtn').onclick = () => {
    ['admReceiptFrom','admReceiptTo','admReceiptDateFrom','admReceiptDateTo','admReceiptUser','admReceiptPhone','admReceiptAdmin','admReceiptCourier','admReceiptStatus','admReceiptPayment','admReceiptDelivery'].forEach(id => { if ($(id)) $(id).value = ''; });
    if ($('admReceiptSort')) $('admReceiptSort').value = 'date_desc';
    loadAdminReceipts();
};
document.querySelectorAll('[data-receipt-range]').forEach(btn => {
    btn.onclick = () => setReceiptQuickRange(btn.dataset.receiptRange);
});



async function loadAdminSettings() {
    try {
        setupAdminColorControls();
        setupAdminSettingsEditors();
        const resp = await fetch('/api/settings?user_id=' + (tg.initDataUnsafe?.user?.id || 0));
        if (!resp.ok) return;
        const s = await resp.json();
        let theme = {};
        const storeName = s.store_name || '';
        const storeWelcome = s.store_welcome || '';
        const marketSettings = admSafeJson(s.market_settings, {});
        const homeSettings = admSafeJson(s.home_settings, {});
        marketSettings.name = storeName || marketSettings.name || '';
        marketSettings.description = storeWelcome || marketSettings.description || '';
        homeSettings.hero_title = storeName || homeSettings.hero_title || '';
        homeSettings.hero_subtitle = storeWelcome || homeSettings.hero_subtitle || '';
        try { theme = JSON.parse(s.theme || '{}'); } catch(e) {}
        
        $('admSetDeliveryMode').value = s.delivery_mode || 'all';
        $('admSetStoreName').value = storeName;
        $('admSetWelcome').value = storeWelcome;
        $('admSetButton').value = s.store_button || '';
        $('admSetDeliveryBase').value = s.delivery_base || '15000';
        if ($('admSetDeliveryEtaHours')) $('admSetDeliveryEtaHours').value = s.delivery_eta_hours || '24';
        $('admSetMinOrder').value = s.min_order || '0';
        $('admSetMapZoom').value = s.map_zoom || '12';
        $('admSetCardNumber').value = s.card_number || '';
        $('admSetCardHolder').value = s.card_holder || '';
        $('admSetAccent').value = theme.accent || '#c3c7cf';
        $('admSetBg').value = theme.background || '#ffffff';
        $('admSetAccent').dispatchEvent(new Event('input', { bubbles: true }));
        $('admSetBg').dispatchEvent(new Event('input', { bubbles: true }));
        $('admSetMaintenanceEnabled').checked = String(s.maintenance_enabled || '0') === '1';
        $('admSetMaintenanceText').value = s.maintenance_text || "Hozir texnik ishlar olib borilmoqda. Iltimos, keyinroq urinib ko'ring.";
        $('admSetCategories').value = s.categories || '["Barchasi"]';
        $('admSetBranches').value = s.branches || '[]';
        $('admSetReferral').value = s.referral_offers || '{}';
        const defaults = window.TemplateDefaults || {};
        if ($('admSetSeo')) $('admSetSeo').value = s.seo || JSON.stringify(defaults.seo || {}, null, 2);
        if ($('admSetNavigation')) $('admSetNavigation').value = s.navigation || JSON.stringify(defaults.navigation || [], null, 2);
        if ($('admSetPageSections')) $('admSetPageSections').value = s.page_sections || JSON.stringify(defaults.page_sections || [], null, 2);
        if ($('admSetFooter')) $('admSetFooter').value = s.footer || JSON.stringify(defaults.footer || {}, null, 2);
        if ($('admSetMarketSettings')) $('admSetMarketSettings').value = JSON.stringify(marketSettings, null, 2);
        if ($('admSetHomeSettings')) $('admSetHomeSettings').value = JSON.stringify(homeSettings, null, 2);
        if ($('admSetProductCardSettings')) $('admSetProductCardSettings').value = s.product_card_settings || '{}';
        if ($('admSetSystemMessages')) $('admSetSystemMessages').value = s.system_messages || '{}';
        if ($('admSetBotMessages')) $('admSetBotMessages').value = s.bot_messages || '{}';
        admSettingsEditor.categories = admSafeJson($('admSetCategories').value, ['Barchasi']);
        admSettingsEditor.branches = admSafeJson($('admSetBranches').value, []);
        admSettingsEditor.navigation = admSafeJson($('admSetNavigation')?.value, defaults.navigation || []);
        admSettingsEditor.botMessages = admSafeJson($('admSetBotMessages')?.value, {});
        renderAdminCategoryEditor();
        renderAdminBranchEditor();
        renderAdminNavigationEditor();
        renderAdminBotMessagesEditor();
    } catch(e) { console.error(e); }
}

if ($('admSaveSettingsBtn')) {
    $('admSaveSettingsBtn').onclick = async () => {
            $('admSaveSettingsBtn').textContent = 'Saqlanmoqda...';
            try {
            admSyncSettingsTextareas();
            let referrals = {};
            let categories = [];
            let branches = [];
            let seo = {};
            let navigation = [];
            let pageSections = [];
            let footer = {};
            let marketSettings = {};
            let homeSettings = {};
            let productCardSettings = {};
            let systemMessages = {};
            let botMessages = {};
            try { referrals = JSON.parse($('admSetReferral').value); } catch(e) { alert("Referal kodlar xato JSON formatida!"); $('admSaveSettingsBtn').textContent = 'Saqlash'; return; }
            try { categories = JSON.parse($('admSetCategories').value); } catch(e) { alert("Kategoriyalar xato JSON formatida!"); $('admSaveSettingsBtn').textContent = 'Saqlash'; return; }
            try { branches = JSON.parse($('admSetBranches').value); } catch(e) { alert("Filiallar xato JSON formatida!"); $('admSaveSettingsBtn').textContent = 'Saqlash'; return; }
            try { seo = $('admSetSeo') ? JSON.parse($('admSetSeo').value || '{}') : {}; } catch(e) { alert("SEO xato JSON formatida!"); $('admSaveSettingsBtn').textContent = 'Saqlash'; return; }
            try { navigation = $('admSetNavigation') ? JSON.parse($('admSetNavigation').value || '[]') : []; } catch(e) { alert("Menyu xato JSON formatida!"); $('admSaveSettingsBtn').textContent = 'Saqlash'; return; }
            try { pageSections = $('admSetPageSections') ? JSON.parse($('admSetPageSections').value || '[]') : []; } catch(e) { alert("Sahifa bloklari xato JSON formatida!"); $('admSaveSettingsBtn').textContent = 'Saqlash'; return; }
            try { footer = $('admSetFooter') ? JSON.parse($('admSetFooter').value || '{}') : {}; } catch(e) { alert("Footer xato JSON formatida!"); $('admSaveSettingsBtn').textContent = 'Saqlash'; return; }
            try { marketSettings = $('admSetMarketSettings') ? JSON.parse($('admSetMarketSettings').value || '{}') : {}; } catch(e) { alert("Market settings xato JSON formatida!"); $('admSaveSettingsBtn').textContent = 'Saqlash'; return; }
            try { homeSettings = $('admSetHomeSettings') ? JSON.parse($('admSetHomeSettings').value || '{}') : {}; } catch(e) { alert("Home settings xato JSON formatida!"); $('admSaveSettingsBtn').textContent = 'Saqlash'; return; }
            try { productCardSettings = $('admSetProductCardSettings') ? JSON.parse($('admSetProductCardSettings').value || '{}') : {}; } catch(e) { alert("Product cards xato JSON formatida!"); $('admSaveSettingsBtn').textContent = 'Saqlash'; return; }
            try { systemMessages = $('admSetSystemMessages') ? JSON.parse($('admSetSystemMessages').value || '{}') : {}; } catch(e) { alert("System messages xato JSON formatida!"); $('admSaveSettingsBtn').textContent = 'Saqlash'; return; }
            try { botMessages = $('admSetBotMessages') ? JSON.parse($('admSetBotMessages').value || '{}') : {}; } catch(e) { alert("Bot messages xato JSON formatida!"); $('admSaveSettingsBtn').textContent = 'Saqlash'; return; }
            const storeName = $('admSetStoreName').value.trim();
            const storeWelcome = $('admSetWelcome').value.trim();
            marketSettings.name = storeName || marketSettings.name || '';
            marketSettings.description = storeWelcome || marketSettings.description || '';
            homeSettings.hero_title = storeName || homeSettings.hero_title || '';
            homeSettings.hero_subtitle = storeWelcome || homeSettings.hero_subtitle || '';
            const themeTokens = {
                background: $('admSetBg').value,
                accent: $('admSetAccent').value
            };
            
            const data = {
                user_id: tg.initDataUnsafe?.user?.id,
                delivery_mode: $('admSetDeliveryMode').value,
                store_name: storeName,
                store_welcome: storeWelcome,
                store_button: $('admSetButton').value.trim(),
                delivery_base: $('admSetDeliveryBase').value.trim(),
                delivery_eta_hours: $('admSetDeliveryEtaHours') ? ($('admSetDeliveryEtaHours').value.trim() || '24') : '24',
                min_order: $('admSetMinOrder').value.trim() || '0',
                map_zoom: $('admSetMapZoom').value.trim() || '12',
                maintenance_enabled: $('admSetMaintenanceEnabled').checked ? '1' : '0',
                maintenance_text: $('admSetMaintenanceText').value.trim(),
                card_number: $('admSetCardNumber').value.trim(),
                card_holder: $('admSetCardHolder').value.trim(),
                categories: JSON.stringify(categories),
                branches: JSON.stringify(branches),
                referral_offers: JSON.stringify(referrals),
                seo: JSON.stringify(seo),
                navigation: JSON.stringify(navigation),
                page_sections: JSON.stringify(pageSections),
                footer: JSON.stringify(footer),
                market_settings: JSON.stringify(marketSettings),
                home_settings: JSON.stringify(homeSettings),
                product_card_settings: JSON.stringify(productCardSettings),
                system_messages: JSON.stringify(systemMessages),
                bot_messages: JSON.stringify(botMessages),
                theme: JSON.stringify(themeTokens)
            };
            const resp = await fetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            if (resp.ok) {
                haptic('notificationOccurred', 'success');
                await loadConfig();
                await loadSettings();
                await loadProducts();
                renderCart();
                alert("Sozlamalar saqlandi va darhol qo'llandi.");
            } else {
                alert('Xatolik yuz berdi');
            }
        } catch(e) { console.error(e); }
        $('admSaveSettingsBtn').textContent = 'Saqlash';
    };
}
