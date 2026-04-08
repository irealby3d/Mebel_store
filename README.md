# Mebel Store - Oshxona Modullari Savdo Platformasi

## 📋 Loyiha Haqida

Telegram Bot + WebApp orqali oshxona mebellari savdo platformasi.

## 🛠️ Texnologiyalar

- **Frontend:** HTML5, CSS3, JavaScript (Vanilla)
- **Backend:** Python (Telegram Bot)
- **Database:** Supabase (PostgreSQL)
- **Hosting:** GitHub Pages
- **Auth:** Supabase Auth (Telegram ID + Email)

## 📁 Strukturasi

```
Mebel_store/
├── webapp/
│   ├── index.html      # Landing page
│   ├── app.html        # Telegram WebApp
│   ├── admin.html      # Admin panel
│   └── assets/
├── supabase/
│   └── schema.sql      # Database schema
├── telegram/
│   └── bot.py          # Telegram bot
└── .github/
    └── workflows/
        └── deploy.yml  # CI/CD
```

## 🚀 Ishga Tushirish

### 1. GitHub Pages ni yoqish
1. Repository → **Settings** → **Pages**
2. **Source**: "GitHub Actions" ni tanlang
3. **Save** tugmasini bosing

### 2. Supabase sozlash
1. [supabase.com](https://supabase.com) da yangi loyiha yarating
2. **SQL Editor** da `supabase/schema.sql` ni copy-paste qiling va **Run**
3. **Auth** → **Providers** → **Email** ni yoqing

### 3. GitHub Secrets qo'shish
Repository → **Settings** → **Secrets and variables** → **Actions**:
| Secret Name | Qiymat |
|-------------|--------|
| `SUPABASE_URL` | `https://xxx.supabase.co` |
| `SUPABASE_ANON_KEY` | `eyJ...` (Project API keys dan) |
| `SUPABASE_SERVICE_KEY` | `eyJ...` (service_role key) |
| `TELEGRAM_BOT_TOKEN` | BotFather dan olingan token |

### 4. Botni ishga tushirish
```bash
cd Mebel_store/telegram
pip install -r requirements.txt
python bot.py
```

### 5. BotFather sozlash
1. @BotFather ga kiring
2. `/setmenu` → WebApp tugmasini qo'shing
3. WebApp URL: `https://irealby3d.github.io/Mebel_store/app.html`

## 🎨 Dizayn

OpenClaw uslubida:
- Qora tema (#0a0a1a)
- Apelsin (#ff6b00) + Magenta (#ff006b) gradient
