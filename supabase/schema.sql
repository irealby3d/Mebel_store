-- ============================================================
-- Mebel Store Database Schema
-- Supabase PostgreSQL
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- USERS - Foydalanuvchilar
-- ============================================================
CREATE TABLE s_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    telegram_id BIGINT UNIQUE,
    email TEXT UNIQUE,
    telefon TEXT,
    ism TEXT,
    role TEXT DEFAULT 'customer' CHECK (role IN ('customer', 'admin')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookups
CREATE INDEX idx_s_users_telegram ON s_users(telegram_id);

-- ============================================================
-- CATEGORIES - Kategoriyalar
-- ============================================================
CREATE TABLE s_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    icon TEXT DEFAULT '📦',
    description TEXT,
    sort_order INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- PRODUCTS - Mahsulotlar
-- ============================================================
CREATE TABLE s_products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    category_id UUID REFERENCES s_categories(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    description TEXT,
    price DECIMAL(12, 0) NOT NULL DEFAULT 0,
    image_url TEXT,
    unit TEXT DEFAULT 'dona',
    stock INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    is_featured BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for category filtering
CREATE INDEX idx_s_products_category ON s_products(category_id);
CREATE INDEX idx_s_products_active ON s_products(is_active);

-- ============================================================
-- CART - Savat
-- ============================================================
CREATE TABLE s_cart (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES s_users(id) ON DELETE CASCADE,
    product_id UUID REFERENCES s_products(id) ON DELETE CASCADE,
    quantity INT DEFAULT 1 CHECK (quantity > 0),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, product_id)
);

-- ============================================================
-- ORDERS - Buyurtmalar
-- ============================================================
CREATE TABLE s_orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES s_users(id) ON DELETE SET NULL,
    status TEXT DEFAULT 'new' CHECK (status IN ('new', 'processing', 'ready', 'delivered', 'cancelled')),
    address TEXT,
    telefon TEXT,
    izoh TEXT,
    total DECIMAL(12, 0) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_s_orders_user ON s_orders(user_id);
CREATE INDEX idx_s_orders_status ON s_orders(status);

-- ============================================================
-- ORDER ITEMS - Buyurtma tarkibi
-- ============================================================
CREATE TABLE s_order_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID REFERENCES s_orders(id) ON DELETE CASCADE,
    product_id UUID REFERENCES s_products(id) ON DELETE SET NULL,
    product_name TEXT,
    quantity INT DEFAULT 1,
    price DECIMAL(12, 0) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_s_order_items_order ON s_order_items(order_id);

-- ============================================================
-- FUNCTIONS - Avtomatik funksiyalar
-- ============================================================

-- Updated_at avtomatik yangilash
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for s_users
CREATE TRIGGER tr_s_users_updated
    BEFORE UPDATE ON s_users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Trigger for s_products
CREATE TRIGGER tr_s_products_updated
    BEFORE UPDATE ON s_products
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Trigger for s_orders
CREATE TRIGGER tr_s_orders_updated
    BEFORE UPDATE ON s_orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================

ALTER TABLE s_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE s_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE s_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE s_cart ENABLE ROW LEVEL SECURITY;
ALTER TABLE s_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE s_order_items ENABLE ROW LEVEL SECURITY;

-- Users: o'ziga oid ma'lumotni ko'rish
CREATE POLICY "Users view own data" ON s_users
    FOR SELECT USING (auth.uid() = id);

-- Products: hamma ko'rish mumkin
CREATE POLICY "Products are viewable by everyone" ON s_products
    FOR SELECT USING (is_active = TRUE);

-- Categories: hamma ko'rish mumkin
CREATE POLICY "Categories are viewable by everyone" ON s_categories
    FOR SELECT USING (is_active = TRUE);

-- Cart: o'ziga oid ko'rish
CREATE POLICY "Users view own cart" ON s_cart
    FOR SELECT USING (user_id = auth.uid());

-- Orders: o'z buyurtmalarini ko'rish
CREATE POLICY "Users view own orders" ON s_orders
    FOR SELECT USING (user_id = auth.uid());

-- ============================================================
-- SEED DATA - Namuna ma'lumotlar
-- ============================================================

-- Kategoriyalar
INSERT INTO s_categories (name, icon, description, sort_order) VALUES
('Oshxona Stollari', '🪑', 'Oshxona uchun stollar', 1),
('Oshxona Stullari', '💺', 'Oshxona uchun stullar', 2),
('Shkaflar', '🗄️', 'Oshxona shkaflari va tutqichlar', 3),
('Polkalar', '📚', 'Oshxona devor polkalari', 4),
('Jihozlar', '🔧', 'Qoshiq-chanaq, ajratgichlar', 5);

-- Mahsulotlar (namuna)
INSERT INTO s_products (category_id, name, description, price, unit, stock, is_featured) 
SELECT 
    c.id,
    'Oshxona stoli Artel',
    'Zamonaviy oshxona stoli, 4 kishi uchun',
    2500000,
    'dona',
    10,
    TRUE
FROM s_categories c WHERE c.name = 'Oshxona Stollari';

INSERT INTO s_products (category_id, name, description, price, unit, stock) 
SELECT 
    c.id,
    'Plastik stul',
    'Oshxona uchun plastik stul, chidamli',
    450000,
    'dona',
    50
FROM s_categories c WHERE c.name = 'Oshxona Stullari';
