/* ============================================================
   Mebel Store - Main Application JS
   ============================================================ */

// Mock Telegram WebApp for browser testing
if (typeof window.Telegram === 'undefined') {
    window.Telegram = { WebApp: { 
        initDataUnsafe: { user: { id: 380004653, first_name: 'Test Foydalanuvchi' } },
        ready: () => {},
        expand: () => {},
        HapticFeedback: { impactOccurred: () => {} }
    }};
}

// Config - GitHub Secrets dan inject qilinadi
const CONFIG = {
    SUPABASE_URL: 'https://hgisisjblsegtnybjkhn.supabase.co',
    SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhnaXNpc2pibHNlZ3RueWJqa2huIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1NzM3NjYsImV4cCI6MjA5MTE0OTc2Nn0.dragZi69rzDyBjR_5qxm2DS5izedGn22R7la6tAO4vQ'
};

// Browser testing uchun fallback
if (!CONFIG.SUPABASE_URL) {
    CONFIG.SUPABASE_URL = 'https://hgisisjblsegtnybjkhn.supabase.co';
    CONFIG.SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhnaXNpc2pibHNlZ3RueWJqa2huIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1NzM3NjYsImV4cCI6MjA5MTE0OTc2Nn0.dragZi69rzDyBjR_5qxm2DS5izedGn22R7la6tAO4vQ';
}

// Telegram WebApp init
const tg = window.Telegram?.WebApp;
function getTelegramUser() {
  const u = tg?.initDataUnsafe?.user;
  if (u && u.id != null) return u;
  // Fallback for browser testing
  return { id: 380004653, first_name: 'Test Foydalanuvchi' };
}
const user = getTelegramUser();
console.log('TELEGRAM USER (for testing):', user);

if (tg) {
  tg.ready();
  tg.expand();
}

// Helper to access user consistently
function getUser() {
  return user;
}

const state = {
    user: null,
    categories: [],
    products: [],
    cart: [],
    orders: [],
    activeCategory: null
};

let supabaseClient = null;

function initSupabase() {
    if (typeof window.supabase !== 'undefined') {
        supabaseClient = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
    }
}

function formatPrice(num) {
    return new Intl.NumberFormat('uz-UZ').format(num) + " so'm";
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

async function getOrCreateUser() {
    if (!supabaseClient) return null;
    
    const telegramUser = getUser();
    const telegramId = telegramUser?.id;
    if (!telegramId) {
        console.log('Telegram user ID topilmadi');
        return null;
    }

    let { data: existingUser } = await supabaseClient
        .from('s_users')
        .select('*')
        .eq('telegram_id', telegramId)
        .single();

    if (existingUser) {
        state.user = existingUser;
        console.log('User topildi:', existingUser);
        return existingUser;
    }

    const { data: newUser, error } = await supabaseClient
        .from('s_users')
        .insert({
            telegram_id: telegramId,
            ism: telegramUser?.first_name || 'Mijoz',
            role: 'customer'
        })
        .select()
        .single();

    if (!error && newUser) {
        state.user = newUser;
        console.log('Yangi user yaratildi:', newUser);
    } else {
        console.log('User yaratishda xatolik:', error);
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

function renderCategories(containerId = 'categoryList') {
    const container = document.getElementById(containerId);
    if (!container) return;

    const allActive = !state.activeCategory;
    
    container.innerHTML = `
        <div class="category-chip ${allActive ? 'active' : ''}" data-id="">📦 Hammasi</div>
        ${state.categories.map(cat => `
            <div class="category-chip ${state.activeCategory === cat.id ? 'active' : ''}" data-id="${cat.id}">
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
        container.innerHTML = `<div class="empty-state" style="grid-column: 1/-1;"><div class="icon">📦</div><h3>Mahsulotlar yo'q</h3><p>Bu kategoriyada hozircha mahsulotlar mavjud emas</p></div>`;
        return;
    }

    container.innerHTML = state.products.map(prod => `
        <div class="product-card" data-id="${prod.id}">
            <div class="product-image">${prod.image_url ? `<img src="${prod.image_url}" alt="${prod.name}">` : '🏠'}</div>
            <div class="product-info">
                <div class="product-name">${prod.name}</div>
                <div class="product-price">${formatPrice(prod.price)} <span class="product-unit">/ ${prod.unit}</span></div>
            </div>
        </div>
    `).join('');
}

function navigateTo(page) {
    document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
    document.getElementById(`page-${page}`)?.classList.remove('hidden');
    
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.querySelector(`.nav-item[data-page="${page}"]`)?.classList.add('active');

    if (page === 'cart') { if (typeof renderCart === 'function') renderCart(); }
    if (page === 'orders') loadOrders().then(() => { if (typeof renderOrders === 'function') renderOrders(); });
}

function openModal(modalId) {
    document.getElementById(modalId)?.classList.add('active');
}

function closeModal(modalId) {
    document.getElementById(modalId)?.classList.remove('active');
}

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
        document.getElementById('productGrid').innerHTML = `<div class="empty-state" style="grid-column:1/-1;"><div class="icon">⚙️</div><h3>Supabase ulanganda</h3><p>Konfiguratsiyani to'ldiring</p></div>`;
    }
}

document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal')) {
        e.target.classList.remove('active');
    }
});

window.app = {
    state,
    CONFIG,
    addToCart,
    updateCartQuantity,
    removeFromCart,
    createOrder,
    navigateTo,
    openModal,
    closeModal,
    showToast,
    updateUserProfile
};
