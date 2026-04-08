/* ============================================================
   Mebel Store - Main Application JS
   ============================================================ */

// Configuration
const CONFIG = {
    SUPABASE_URL: 'YOUR_SUPABASE_URL',
    SUPABASE_ANON_KEY: 'YOUR_ANON_KEY',
    TELEGRAM_BOT_TOKEN: 'YOUR_BOT_TOKEN'
};

// State
const state = {
    user: null,
    categories: [],
    products: [],
    cart: [],
    orders: [],
    activeCategory: null
};

// Supabase Client
let supabaseClient = null;

function initSupabase() {
    if (typeof window.supabase !== 'undefined') {
        supabaseClient = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
    }
}

// Telegram WebApp
const tg = window.Telegram?.WebApp;
const user = tg?.initDataUnsafe?.user;

if (tg) {
    tg.ready();
    tg.expand();
}

// ============================================================
// UTILS
// ============================================================

function formatPrice(num) {
    return new Intl.NumberFormat('uz-UZ').format(num) + ' so\'m';
}

function showToast(message, type = 'success') {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span>${type === 'success' ? '✅' : '❌'}</span> ${message}`;
    document.body.appendChild(toast);

    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => toast.classList.remove('show'), 3000);
}

function showLoading() {
    const el = document.createElement('div');
    el.className = 'loading';
    el.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:9999;';
    el.id = 'globalLoading';
    document.body.appendChild(el);
}

function hideLoading() {
    document.getElementById('globalLoading')?.remove();
}

function haptic(type = 'light') {
    tg?.HapticFeedback?.impactOccurred(type);
}

// ============================================================
// API CALLS
// ============================================================

async function apiCall(endpoint, method = 'GET', body = null) {
    try {
        const opts = {
            method,
            headers: { 'Content-Type': 'application/json' }
        };
        if (body) opts.body = JSON.stringify(body);

        const r = await fetch(`/api/${endpoint}`, opts);
        if (!r.ok) throw new Error(r.status);
        return await r.json();
    } catch (e) {
        console.error('API Error:', e);
        return null;
    }
}

async function loadCategories() {
    if (!supabaseClient) return;
    const { data, error } = await supabaseClient
        .from('s_categories')
        .select('*')
        .eq('is_active', true)
        .order('sort_order');

    if (!error) state.categories = data || [];
    return state.categories;
}

async function loadProducts(categoryId = null) {
    if (!supabaseClient) return [];
    
    let query = supabaseClient
        .from('s_products')
        .select('*, s_categories(name)')
        .eq('is_active', true)
        .order('is_featured', { ascending: false });

    if (categoryId) {
        query = query.eq('category_id', categoryId);
    }

    const { data, error } = await query.limit(50);
    if (!error) state.products = data || [];
    return state.products;
}

async function loadCart() {
    if (!supabaseClient || !state.user) return [];
    
    const { data, error } = await supabaseClient
        .from('s_cart')
        .select('*, s_products(name, price, image_url)')
        .eq('user_id', state.user.id);

    if (!error) state.cart = data || [];
    return state.cart;
}

async function addToCart(productId, quantity = 1) {
    if (!supabaseClient || !state.user) {
        showToast('Avval ro\'yxatdan o\'ting', 'error');
        return;
    }

    const existing = state.cart.find(c => c.product_id === productId);
    
    if (existing) {
        const { error } = await supabaseClient
            .from('s_cart')
            .update({ quantity: existing.quantity + quantity })
            .eq('id', existing.id);
        
        if (!error) {
            existing.quantity += quantity;
            showToast('Savat yangilandi ✅');
        }
    } else {
        const { data, error } = await supabaseClient
            .from('s_cart')
            .insert({ user_id: state.user.id, product_id: productId, quantity })
            .select('*, s_products(name, price)')
            .single();

        if (!error && data) {
            state.cart.push(data);
            showToast('Savatga qo\'shildi ✅');
        }
    }
    
    updateCartBadge();
    haptic();
}

async function updateCartQuantity(cartId, quantity) {
    if (!supabaseClient) return;

    if (quantity <= 0) {
        await removeFromCart(cartId);
        return;
    }

    const { error } = await supabaseClient
        .from('s_cart')
        .update({ quantity })
        .eq('id', cartId);

    if (!error) {
        const item = state.cart.find(c => c.id === cartId);
        if (item) item.quantity = quantity;
        updateCartBadge();
    }
}

async function removeFromCart(cartId) {
    if (!supabaseClient) return;

    const { error } = await supabaseClient
        .from('s_cart')
        .delete()
        .eq('id', cartId);

    if (!error) {
        state.cart = state.cart.filter(c => c.id !== cartId);
        updateCartBadge();
        showToast('Olib tashlandi');
    }
}

async function createOrder(orderData) {
    if (!supabaseClient || !state.user) return null;
    if (state.cart.length === 0) {
        showToast('Savat bo\'sh', 'error');
        return;
    }

    const total = state.cart.reduce((sum, item) => 
        sum + (item.quantity * item.s_products?.price || 0), 0);

    const { data: order, error: orderError } = await supabaseClient
        .from('s_orders')
        .insert({
            user_id: state.user.id,
            telefon: orderData.phone,
            address: orderData.address,
            izoh: orderData.izoh,
            total,
            status: 'new'
        })
        .select()
        .single();

    if (orderError) {
        showToast('Buyurtma yaratilmadi', 'error');
        return null;
    }

    const items = state.cart.map(item => ({
        order_id: order.id,
        product_id: item.product_id,
        product_name: item.s_products?.name,
        quantity: item.quantity,
        price: item.s_products?.price
    }));

    await supabaseClient.from('s_order_items').insert(items);
    await supabaseClient.from('s_cart').delete().eq('user_id', state.user.id);
    
    state.cart = [];
    updateCartBadge();
    showToast('Buyurtma qabul qilindi! ✅');
    
    return order;
}

async function loadOrders() {
    if (!supabaseClient || !state.user) return [];
    
    const { data, error } = await supabaseClient
        .from('s_orders')
        .select('*, s_order_items(*, s_products(name))')
        .eq('user_id', state.user.id)
        .order('created_at', { ascending: false });

    if (!error) state.orders = data || [];
    return state.orders;
}

function updateCartBadge() {
    const badge = document.querySelector('.cart-badge');
    if (badge) {
        const count = state.cart.reduce((sum, item) => sum + item.quantity, 0);
        badge.textContent = count;
        badge.style.display = count > 0 ? 'flex' : 'none';
    }
}

// ============================================================
// USER AUTH
// ============================================================

async function getOrCreateUser() {
    if (!supabaseClient) return null;
    
    const telegramId = user?.id;
    if (!telegramId) return null;

    let { data: existingUser } = await supabaseClient
        .from('s_users')
        .select('*')
        .eq('telegram_id', telegramId)
        .single();

    if (existingUser) {
        state.user = existingUser;
        return existingUser;
    }

    const { data: newUser, error } = await supabaseClient
        .from('s_users')
        .insert({
            telegram_id: telegramId,
            ism: user?.first_name || 'Mijoz',
            role: 'customer'
        })
        .select()
        .single();

    if (!error && newUser) {
        state.user = newUser;
    }

    return newUser;
}

async function updateUserProfile(updates) {
    if (!supabaseClient || !state.user) return;

    const { data, error } = await supabaseClient
        .from('s_users')
        .update(updates)
        .eq('id', state.user.id)
        .select()
        .single();

    if (!error && data) {
        state.user = { ...state.user, ...data };
        showToast('Profil yangilandi ✅');
    }
}

// ============================================================
// RENDER FUNCTIONS
// ============================================================

function renderCategories(containerId = 'categoryList') {
    const container = document.getElementById(containerId);
    if (!container) return;

    const allActive = !state.activeCategory;
    
    container.innerHTML = `
        <div class="category-chip ${allActive ? 'active' : ''}" data-id="">
            📦 Hammasi
        </div>
        ${state.categories.map(cat => `
            <div class="category-chip ${state.activeCategory === cat.id ? 'active' : ''}" 
                 data-id="${cat.id}">
                ${cat.icon} ${cat.name}
            </div>
        `).join('')}
    `;

    container.querySelectorAll('.category-chip').forEach(chip => {
        chip.addEventListener('click', async () => {
            haptic();
            state.activeCategory = chip.dataset.id || null;
            renderCategories();
            await loadProducts(state.activeCategory);
            renderProducts();
        });
    });
}

function renderProducts(containerId = 'productGrid') {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (state.products.length === 0) {
        container.innerHTML = `
            <div class="empty-state" style="grid-column: 1/-1;">
                <div class="icon">📦</div>
                <h3>Mahsulotlar yo'q</h3>
                <p>Bu kategoriyada hozircha mahsulotlar mavjud emas</p>
            </div>
        `;
        return;
    }

    container.innerHTML = state.products.map(prod => {
        const stockClass = prod.stock > 5 ? '' : prod.stock > 0 ? 'low' : 'out';
        const stockText = prod.stock > 5 ? '✓ Mavjud' : prod.stock > 0 ? `✓ ${prod.stock} dona` : '✗ Tugagan';
        
        return `
            <div class="product-card" data-id="${prod.id}">
                <div class="product-image">
                    ${prod.image_url 
                        ? `<img src="${prod.image_url}" alt="${prod.name}">`
                        : '🏠'
                    }
                </div>
                <div class="product-info">
                    <div class="product-name">${prod.name}</div>
                    <div class="product-price">
                        ${formatPrice(prod.price)}
                        <span class="product-unit">/ ${prod.unit}</span>
                    </div>
                    <div class="product-stock ${stockClass}">${stockText}</div>
                </div>
            </div>
        `;
    }).join('');

    container.querySelectorAll('.product-card').forEach(card => {
        card.addEventListener('click', () => {
            haptic();
            const product = state.products.find(p => p.id === card.dataset.id);
            if (product) showProductModal(product);
        });
    });
}

function showProductModal(product) {
    const modal = document.getElementById('productModal');
    if (!modal) return;

    document.getElementById('modalProductName').textContent = product.name;
    document.getElementById('modalProductDesc').textContent = product.description || 'Tavsif mavjud emas';
    document.getElementById('modalProductPrice').textContent = formatPrice(product.price);
    document.getElementById('modalProductImage').innerHTML = product.image_url 
        ? `<img src="${product.image_url}" style="width:100%;height:200px;object-fit:cover;border-radius:12px;">`
        : '<div style="font-size:4em;padding:40px;">🏠</div>';
    
    modal.classList.add('active');
}

function renderCart() {
    const container = document.getElementById('cartItems');
    const totalEl = document.getElementById('cartTotal');
    if (!container) return;

    if (state.cart.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="icon">🛒</div>
                <h3>Savat bo'sh</h3>
                <p>Mahsulotlar savatga qo'shilmagan</p>
                <button class="btn" onclick="navigateTo('home')">Mahsulotlarni ko'rish</button>
            </div>
        `;
        if (totalEl) totalEl.textContent = formatPrice(0);
        return;
    }

    container.innerHTML = state.cart.map(item => `
        <div class="cart-item">
            <div class="cart-item-image">
                ${item.s_products?.image_url 
                    ? `<img src="${item.s_products.image_url}" style="width:100%;height:100%;object-fit:cover;">`
                    : '🏠'
                }
            </div>
            <div class="cart-item-info">
                <div class="cart-item-name">${item.s_products?.name || 'Mahsulot'}</div>
                <div class="cart-item-price">${formatPrice(item.s_products?.price || 0)}</div>
            </div>
            <div class="cart-item-qty">
                <button class="qty-btn" onclick="updateCartQuantity('${item.id}', ${item.quantity - 1})">−</button>
                <span class="qty-value">${item.quantity}</span>
                <button class="qty-btn" onclick="updateCartQuantity('${item.id}', ${item.quantity + 1})">+</button>
            </div>
        </div>
    `).join('');

    const total = state.cart.reduce((sum, item) => 
        sum + (item.quantity * (item.s_products?.price || 0)), 0);
    if (totalEl) totalEl.textContent = formatPrice(total);
}

function renderOrders() {
    const container = document.getElementById('orderList');
    if (!container) return;

    if (state.orders.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="icon">📋</div>
                <h3>Buyurtmalar yo'q</h3>
                <p>Siz hali buyurtma bermagansiz</p>
            </div>
        `;
        return;
    }

    container.innerHTML = state.orders.map(order => `
        <div class="card" style="cursor:pointer;" onclick="showOrderDetail('${order.id}')">
            <div class="flex justify-between items-center">
                <div>
                    <strong>#${order.id.slice(0, 8)}</strong>
                    <div style="font-size:0.8em;color:var(--text-secondary)">
                        ${new Date(order.created_at).toLocaleDateString('uz-UZ')}
                    </div>
                </div>
                <span class="badge badge-${order.status}">${getStatusText(order.status)}</span>
            </div>
            <div class="mt-8">
                <strong style="color:var(--primary)">${formatPrice(order.total)}</strong>
            </div>
            <div style="font-size:0.85em;color:var(--text-secondary);margin-top:8px;">
                ${order.address || 'Manzil kiritilmagan'}
            </div>
        </div>
    `).join('');
}

function getStatusText(status) {
    const map = {
        new: 'Yangi',
        processing: 'Jarayonda',
        ready: 'Tayyor',
        delivered: 'Yetkazildi',
        cancelled: 'Bekor'
    };
    return map[status] || status;
}

// ============================================================
// NAVIGATION
// ============================================================

function navigateTo(page) {
    document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
    document.getElementById(`page-${page}`)?.classList.remove('hidden');
    
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.querySelector(`.nav-item[data-page="${page}"]`)?.classList.add('active');

    if (page === 'cart') renderCart();
    if (page === 'orders') loadOrders().then(renderOrders);
}

function openModal(modalId) {
    document.getElementById(modalId)?.classList.add('active');
}

function closeModal(modalId) {
    document.getElementById(modalId)?.classList.remove('active');
}

// ============================================================
// INIT
// ============================================================

async function initApp() {
    initSupabase();
    
    if (supabaseClient) {
        await getOrCreateUser();
        await loadCategories();
        await loadProducts();
        await loadCart();
        
        renderCategories();
        renderProducts();
        updateCartBadge();
    } else {
        document.getElementById('productGrid').innerHTML = `
            <div class="empty-state" style="grid-column:1/-1;">
                <div class="icon">⚙️</div>
                <h3>Supabase ulanganda</h3>
                <p>Konfiguratsiyani to'ldiring</p>
            </div>
        `;
    }
}

// Close modals on outside click
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal')) {
        e.target.classList.remove('active');
    }
});

// Export for global access
window.app = {
    state,
    addToCart,
    updateCartQuantity,
    removeFromCart,
    createOrder,
    navigateTo,
    openModal,
    closeModal,
    showToast,
    renderCart,
    renderOrders
};
