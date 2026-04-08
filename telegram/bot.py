#!/usr/bin/env python3
"""
Mebel Store Telegram Bot
Oshxona modullari savdo boti - Supabase bilan ishlaydi
"""

import json
import os
import sys
import time
import re
from datetime import datetime, timezone, timedelta

try:
    import requests
except ImportError:
    print("requests yo'q: pip install requests")
    sys.exit(1)

try:
    from supabase import create_client, Client
except ImportError:
    print("supabase python yo'q: pip install supabase")
    sys.exit(1)


def load_env(filepath=None):
    if filepath is None:
        filepath = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env")
    if os.path.exists(filepath):
        with open(filepath) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, value = line.split("=", 1)
                    os.environ[key.strip()] = value.strip()

load_env()

# Config
TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
BASE_URL = f"https://api.telegram.org/bot{TOKEN}"
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

if not TOKEN:
    print("TELEGRAM_BOT_TOKEN kerak!")
    sys.exit(1)

if not SUPABASE_URL or not SUPABASE_KEY:
    print("SUPABASE_URL va SUPABASE_SERVICE_KEY kerak!")
    sys.exit(1)

# Supabase client
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# Paths
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INBOX_DIR = os.path.join(BASE_DIR, "inbox")
LOG_DIR = os.path.join(BASE_DIR, "logs")
os.makedirs(INBOX_DIR, exist_ok=True)
os.makedirs(LOG_DIR, exist_ok=True)
LOG_FILE = os.path.join(LOG_DIR, "messages.jsonl")
STATE_FILE = os.path.join(BASE_DIR, "config", "bot.state")

# ============================================================
# UTILS
# ============================================================

def log_print(msg):
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{ts}] {msg}", flush=True)


def api(method, params=None):
    url = f"{BASE_URL}/{method}"
    try:
        if params:
            data = json.dumps(params).encode("utf-8")
            req = requests.post(url, data=data, headers={"Content-Type": "application/json"}, timeout=15)
        else:
            req = requests.get(url, timeout=15)
        return req.json()
    except Exception as e:
        log_print(f"API xatosi {method}: {e}")
        return None


def send(cid, text, reply_to=None, keyboard=None):
    if len(text) > 4000:
        text = text[:4000]
    params = {"chat_id": cid, "text": text}
    if reply_to:
        params["reply_to_message_id"] = reply_to
    if keyboard:
        params["reply_markup"] = json.dumps(keyboard)
    r = api("sendMessage", params)
    return r


def send_photo(cid, photo_url, caption=None, reply_to=None, keyboard=None):
    params = {"chat_id": cid, "photo": photo_url}
    if caption:
        params["caption"] = caption[:1024]
    if reply_to:
        params["reply_to_message_id"] = reply_to
    if keyboard:
        params["reply_markup"] = json.dumps(keyboard)
    return api("sendPhoto", params)


def typing(cid):
    api("sendChatAction", {"chat_id": cid, "action": "typing"})


def format_price(num):
    return f"{num:,} so'm".replace(",", " ")


# ============================================================
# SUPABASE FUNCTIONS
# ============================================================

def get_user_by_telegram(telegram_id):
    result = supabase.table("s_users").select("*").eq("telegram_id", telegram_id).execute()
    return result.data[0] if result.data else None


def create_user(telegram_id, first_name, username=None):
    result = supabase.table("s_users").insert({
        "telegram_id": telegram_id,
        "ism": first_name,
        "role": "customer"
    }).execute()
    return result.data[0] if result.data else None


def get_or_create_user(telegram_id, first_name, username=None):
    user = get_user_by_telegram(telegram_id)
    if not user:
        user = create_user(telegram_id, first_name, username)
    return user


def get_categories():
    result = supabase.table("s_categories").select("*").eq("is_active", True).order("sort_order").execute()
    return result.data or []


def get_products(category_id=None, limit=20):
    query = supabase.table("s_products").select("*, s_categories(name)").eq("is_active", True)
    if category_id:
        query = query.eq("category_id", category_id)
    result = query.order("is_featured", desc=True).limit(limit).execute()
    return result.data or []


def get_product_by_id(product_id):
    result = supabase.table("s_products").select("*, s_categories(name)").eq("id", product_id).execute()
    return result.data[0] if result.data else None


def get_cart(user_id):
    result = supabase.table("s_cart").select("*, s_products(name, price, image_url)").eq("user_id", user_id).execute()
    return result.data or []


def add_to_cart(user_id, product_id, quantity=1):
    existing = supabase.table("s_cart").select("*").eq("user_id", user_id).eq("product_id", product_id).execute()
    if existing.data:
        new_qty = existing.data[0]["quantity"] + quantity
        supabase.table("s_cart").update({"quantity": new_qty}).eq("id", existing.data[0]["id"]).execute()
    else:
        supabase.table("s_cart").insert({
            "user_id": user_id,
            "product_id": product_id,
            "quantity": quantity
        }).execute()


def update_cart_quantity(cart_id, quantity):
    if quantity <= 0:
        supabase.table("s_cart").delete().eq("id", cart_id).execute()
    else:
        supabase.table("s_cart").update({"quantity": quantity}).eq("id", cart_id).execute()


def remove_from_cart(cart_id):
    supabase.table("s_cart").delete().eq("id", cart_id).execute()


def clear_cart(user_id):
    supabase.table("s_cart").delete().eq("user_id", user_id).execute()


def create_order(user_id, telefon, address, izoh=None):
    cart_items = get_cart(user_id)
    if not cart_items:
        return None

    total = sum(item["quantity"] * item["s_products"]["price"] for item in cart_items)

    order_result = supabase.table("s_orders").insert({
        "user_id": user_id,
        "telefon": telefon,
        "address": address,
        "izoh": izoh,
        "total": total,
        "status": "new"
    }).execute()

    if not order_result.data:
        return None

    order_id = order_result.data[0]["id"]

    for item in cart_items:
        supabase.table("s_order_items").insert({
            "order_id": order_id,
            "product_id": item["product_id"],
            "product_name": item["s_products"]["name"],
            "quantity": item["quantity"],
            "price": item["s_products"]["price"]
        }).execute()

    clear_cart(user_id)
    return order_result.data[0]


def get_orders(user_id):
    result = supabase.table("s_orders").select("*, s_order_items(*, s_products(name))").eq("user_id", user_id).order("created_at", desc=True).execute()
    return result.data or []


# ============================================================
# KEYBOARDS
# ============================================================

def main_keyboard():
    return {
        "inline_keyboard": [
            [{"text": "🛒 Katalog", "callback_data": "catalog"}],
            [{"text": "🛍️ Savatim", "callback_data": "cart"}, {"text": "📋 Buyurtmalarim", "callback_data": "orders"}],
            [{"text": "👤 Profil", "callback_data": "profile"}, {"text": "📞 Aloqa", "callback_data": "contact"}]
        ]
    }


def catalog_keyboard(categories):
    buttons = []
    row = []
    for i, cat in enumerate(categories):
        row.append({"text": f"{cat['icon']} {cat['name']}", "callback_data": f"cat_{cat['id']}"})
        if len(row) == 2:
            buttons.append(row)
            row = []
    if row:
        buttons.append(row)
    buttons.append([{"text": "◀️ Orqaga", "callback_data": "back"}])
    return {"inline_keyboard": buttons}


def products_keyboard(products, page=0):
    buttons = []
    per_page = 8
    start = page * per_page
    end = start + per_page

    for prod in products[start:end]:
        stock_emoji = "✅" if prod["stock"] > 0 else "❌"
        text = f"{stock_emoji} {prod['name']} - {format_price(prod['price'])}"
        buttons.append([{"text": text, "callback_data": f"prod_{prod['id']}"}])

    nav = []
    if page > 0:
        nav.append({"text": "◀️", "callback_data": f"page_{page-1}"})
    if end < len(products):
        nav.append({"text": "▶️", "callback_data": f"page_{page+1}"})
    if nav:
        buttons.append(nav)

    buttons.append([{"text": "◀️ Kategoriyalarga", "callback_data": "catalog"}])
    return {"inline_keyboard": buttons}


def cart_keyboard():
    return {
        "inline_keyboard": [
            [{"text": "✅ Buyurtma berish", "callback_data": "checkout"}],
            [{"text": "🗑️ Savatni tozalash", "callback_data": "clear_cart"}],
            [{"text": "◀️ Orqaga", "callback_data": "back"}]
        ]
    }


def back_keyboard():
    return {
        "inline_keyboard": [
            [{"text": "◀️ Orqaga", "callback_data": "back"}]
        ]
    }


# ============================================================
# HANDLERS
# ============================================================

def handle_start(cid, msg_id, user_info):
    text = f"""🏠 Mebel Storega xush kelibsiz!

Oshxona mebellari — stollar, stullar, shkaflar va jihozlar.

Sizga qanday yordam bera olishim mumkin?"""
    send(cid, text, reply_to=msg_id, keyboard=main_keyboard())


def handle_help(cid, msg_id):
    text = """📋 Bot buyruqlari:

🛒 /catalog — Mahsulotlar katalogi
🛍️ /cart — Savatim
📋 /orders — Mening buyurtmalarim
👤 /profile — Profil

Yoki pastdagi tugmalardan foydalaning!"""
    send(cid, text, reply_to=msg_id, keyboard=main_keyboard())


def handle_catalog(cid, user_id, page=0):
    categories = get_categories()
    if not categories:
        send(cid, "⚠️ Hozircha kategoriya yo'q", keyboard=main_keyboard())
        return
    text = "📂 Kategoriyalarni tanlang:"
    send(cid, text, keyboard=catalog_keyboard(categories))


def handle_category(cid, category_id, page=0):
    products = get_products(category_id)
    if not products:
        send(cid, "⚠️ Bu kategoriyada mahsulotlar yo'q", keyboard=back_keyboard())
        return
    text = f"📦 {len(products)} ta mahsulot topildi:\n\nMahsulotni tanlang:"
    send(cid, text, keyboard=products_keyboard(products, page))


def handle_product(cid, product_id):
    product = get_product_by_id(product_id)
    if not product:
        send(cid, "⚠️ Mahsulot topilmadi", keyboard=back_keyboard())
        return

    stock_text = "✅ Mavjud" if product["stock"] > 0 else "❌ Tugagan"
    stock_color = "🟢" if product["stock"] > 0 else "🔴"

    text = f"""🏠 {product['name']}

💰 Narxi: {format_price(product['price'])}
📦 Birligi: {product['unit']}
{stock_color} Omborda: {stock_text}

📝 Tavsif:
{product.get('description') or 'Tavsif mavjud emas'}"""

    keyboard = {
        "inline_keyboard": [
            [{"text": "🛒 Savatga qo'shish", "callback_data": f"add_{product_id}"}],
            [{"text": "◀️ Orqaga", "callback_data": f"cat_{product.get('category_id') or ''}"}]
        ]
    }

    if product.get("image_url"):
        send_photo(cid, product["image_url"], caption=text[:1024], keyboard=keyboard)
    else:
        send(cid, text, keyboard=keyboard)


def handle_cart(cid, user_id):
    cart_items = get_cart(user_id)
    if not cart_items:
        send(cid, "🛒 Savat bo'sh", keyboard=main_keyboard())
        return

    total = sum(item["quantity"] * item["s_products"]["price"] for item in cart_items)

    text = f"🛒 Savatim ({len(cart_items)} ta mahsulot)\n\n"
    for i, item in enumerate(cart_items, 1):
        prod = item["s_products"]
        subtotal = item["quantity"] * prod["price"]
        text += f"{i}. {prod['name']}\n"
        text += f"   {format_price(prod['price'])} x {item['quantity']} = {format_price(subtotal)}\n\n"

    text += f"💰 Jami: {format_price(total)}"

    send(cid, text, keyboard=cart_keyboard())


def handle_checkout_start(cid, user_id):
    text = """📦 Buyurtma rasmiylashtirish

Iltimos, quyidagi ma'lumotlarni kiriting:

📱 Telefon raqamingiz:
(Masalan: +998901234567)"""
    send(cid, text, keyboard=back_keyboard())
    return "waiting_phone"


def handle_orders(cid, user_id):
    orders = get_orders(user_id)
    if not orders:
        send(cid, "📋 Sizda buyurtmalar yo'q", keyboard=main_keyboard())
        return

    status_emoji = {
        "new": "🆕",
        "processing": "🔄",
        "ready": "✅",
        "delivered": "📦",
        "cancelled": "❌"
    }
    status_text = {
        "new": "Yangi",
        "processing": "Jarayonda",
        "ready": "Tayyor",
        "delivered": "Yetkazildi",
        "cancelled": "Bekor qilingan"
    }

    text = "📋 Sizning buyurtmalaringiz:\n\n"
    for order in orders[:10]:
        emoji = status_emoji.get(order["status"], "📋")
        text += f"{emoji} Buyurtma #{order['id'][:8]}\n"
        text += f"   💰 {format_price(order['total'])}\n"
        text += f"   📊 Status: {status_text.get(order['status'], order['status'])}\n"
        text += f"   📅 {order['created_at'][:10]}\n\n"

    send(cid, text, keyboard=main_keyboard())


def handle_profile(cid, user):
    text = f"""👤 Profil

📛 Ism: {user.get('ism') or 'Noma\'lum'}
📱 Telefon: {user.get('telefon') or 'Kiritilmagan'}
📧 Email: {user.get('email') or 'Kiritilmagan'}

📊 Statistika:
• Jami buyurtmalar: (kutilmoqda)"""
    send(cid, text, keyboard=main_keyboard())


# ============================================================
# CALLBACK HANDLER
# ============================================================

def handle_callback(cid, msg_id, data, user_id):
    typing(cid)

    if data == "catalog":
        handle_catalog(cid, user_id)
    elif data.startswith("cat_"):
        category_id = data.replace("cat_", "")
        handle_category(cid, category_id or None)
    elif data.startswith("prod_"):
        product_id = data.replace("prod_", "")
        handle_product(cid, product_id)
    elif data.startswith("add_"):
        product_id = data.replace("add_", "")
        add_to_cart(user_id, product_id)
        send(cid, "✅ Mahsulot savatga qo'shildi!", keyboard=back_keyboard())
    elif data == "cart":
        handle_cart(cid, user_id)
    elif data == "clear_cart":
        clear_cart(user_id)
        send(cid, "🗑️ Savat tozalandi", keyboard=main_keyboard())
    elif data == "checkout":
        handle_checkout_start(cid, user_id)
    elif data == "orders":
        handle_orders(cid, user_id)
    elif data == "profile":
        user = get_user_by_telegram(user_id)
        if user:
            handle_profile(cid, user)
    elif data == "contact":
        text = """📞 Aloqa

📱 Telefon: +998 90 123 45 67
✈️ Telegram: @your_username
🌐 Web: https://mebel-store.uz"""
        send(cid, text, keyboard=main_keyboard())
    elif data == "back":
        handle_start(cid, msg_id, None)
    elif data.startswith("page_"):
        page = int(data.replace("page_", ""))
        handle_category(cid, None, page)


# ============================================================
# MAIN
# ============================================================

def load_state():
    try:
        return json.load(open(STATE_FILE))
    except:
        return {"offset": 0, "processed": []}


def save_state(offset, processed):
    json.dump({"offset": offset, "processed": sorted(processed)[-500:]}, open(STATE_FILE, "w"))


def main():
    log_print("🏠 Mebel Store Bot ishga tushdi!")
    api("deleteWebhook", {"drop_pending_updates": True})

    state = load_state()
    offset = state.get("offset", 0)
    processed = set(state.get("processed", []))

    if offset < 10000:
        r = api("getUpdates", {"limit": 1, "timeout": 1})
        if r and r.get("result"):
            offset = r["result"][-1]["update_id"] + 1
            save_state(offset, processed)

    log_print(f"✅ Offset: {offset} | Processed: {len(processed)}")

    while True:
        try:
            result = api("getUpdates", {"offset": offset, "limit": 10, "timeout": 5})
            if not result or not result.get("ok"):
                time.sleep(2)
                continue

            for u in result.get("result", []):
                uid = u.get("update_id", 0)
                if uid in processed:
                    offset = max(offset, uid + 1)
                    continue

                msg = u.get("message")
                cb = u.get("callback_query")

                if cb:
                    cid = cb.get("message", {}).get("chat", {}).get("id")
                    msg_id = cb.get("message", {}).get("message_id")
                    data = cb.get("data")
                    user_id = cb.get("from", {}).get("id")

                    if cid and data and user_id:
                        get_or_create_user(user_id, cb["from"].get("first_name", "User"))
                        handle_callback(cid, msg_id, data, user_id)
                        api("answerCallbackQuery", {"callback_query_id": cb["id"]})

                    offset = max(offset, uid + 1)
                    processed.add(uid)
                    continue

                if msg:
                    text = msg.get("text", "").strip()
                    cid = msg.get("chat", {}).get("id")
                    msg_id = msg.get("message_id")
                    user_id = msg.get("from", {}).get("id")
                    first_name = msg.get("from", {}).get("first_name", "User")

                    if not text or not cid:
                        offset = max(offset, uid + 1)
                        continue

                    typing(cid)
                    log_print(f"📨 {first_name}: {text}")

                    user = get_or_create_user(user_id, first_name)

                    if text.startswith("/start"):
                        handle_start(cid, msg_id, user)
                    elif text.startswith("/help"):
                        handle_help(cid, msg_id)
                    elif text.startswith("/catalog") or text.startswith("/menu"):
                        handle_catalog(cid, user_id)
                    elif text.startswith("/cart"):
                        handle_cart(cid, user_id)
                    elif text.startswith("/orders"):
                        handle_orders(cid, user_id)
                    elif text.startswith("/profile"):
                        if user:
                            handle_profile(cid, user)
                    else:
                        send(cid, "🏠 Mebel Store — /help buyrug'i bilan yordam oling!", reply_to=msg_id, keyboard=main_keyboard())

                    offset = max(offset, uid + 1)
                    processed.add(uid)

            save_state(offset, processed)

            if not result.get("result"):
                time.sleep(2)

        except KeyboardInterrupt:
            break
        except Exception as e:
            log_print(f"❌ Xato: {e}")
            time.sleep(5)


if __name__ == "__main__":
    main()
