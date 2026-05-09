import aiosqlite
import json
import logging
import random
import string
import config
import runtime_storage

logger = logging.getLogger(__name__)


async def _connect():
    return aiosqlite.connect(config.DB_PATH)


async def init_db():
    runtime_storage.prepare_runtime_storage()
    async with await _connect() as db:
        await db.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY,
                first_name TEXT DEFAULT '',
                last_name TEXT DEFAULT '',
                phone TEXT DEFAULT '',
                payment_method TEXT DEFAULT 'cash',
                last_address TEXT DEFAULT '',
                referral_code TEXT DEFAULT '',
                custom_name INTEGER DEFAULT 0,
                admin_password TEXT DEFAULT '',
                role TEXT DEFAULT 'user'
            )
        """)

        await db.execute("""
            CREATE TABLE IF NOT EXISTS products (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                price INTEGER DEFAULT 0,
                category TEXT DEFAULT 'Barchasi',
                description TEXT DEFAULT '',
                discount_percent INTEGER DEFAULT 0,
                is_bogo INTEGER DEFAULT 0,
                stock INTEGER DEFAULT -1,
                active INTEGER DEFAULT 1,
                sort_order INTEGER DEFAULT 0,
                image TEXT DEFAULT '',
                sku TEXT DEFAULT '',
                keywords TEXT DEFAULT '',
                variants TEXT DEFAULT '[]',
                old_price INTEGER DEFAULT 0,
                badges TEXT DEFAULT '[]',
                tags TEXT DEFAULT '[]',
                collection TEXT DEFAULT '',
                featured INTEGER DEFAULT 0,
                bestseller INTEGER DEFAULT 0,
                is_new INTEGER DEFAULT 0,
                limited INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        await db.execute("""
            CREATE TABLE IF NOT EXISTS orders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                items TEXT DEFAULT '[]',
                delivery_type TEXT DEFAULT 'delivery',
                payment_method TEXT DEFAULT 'cash',
                total_price INTEGER DEFAULT 0,
                status TEXT DEFAULT 'pending',
                address TEXT DEFAULT '',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                admin_name TEXT DEFAULT '',
                reject_reason TEXT DEFAULT '',
                phone TEXT DEFAULT '',
                comment TEXT DEFAULT '',
                subtotal INTEGER DEFAULT 0,
                delivery_cost INTEGER DEFAULT 0,
                promo TEXT DEFAULT '',
                discount_amount INTEGER DEFAULT 0,
                promo_snapshot TEXT DEFAULT '{}',
                code TEXT DEFAULT '' UNIQUE
            )
        """)

        await db.execute("""
            CREATE TABLE IF NOT EXISTS admin_settings (
                key TEXT PRIMARY KEY,
                value TEXT DEFAULT ''
            )
        """)

        await db.execute("""
            CREATE TABLE IF NOT EXISTS admin_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                device_info TEXT,
                password_used TEXT,
                success INTEGER,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)

        await db.execute("""
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT DEFAULT ''
            )
        """)

        await db.execute("""
            CREATE TABLE IF NOT EXISTS banners (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                image TEXT NOT NULL,
                active INTEGER DEFAULT 1,
                title TEXT DEFAULT '',
                subtitle TEXT DEFAULT '',
                action_text TEXT DEFAULT '',
                target TEXT DEFAULT '',
                interval_ms INTEGER DEFAULT 4500,
                sort_order INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        await db.execute("""
            CREATE TABLE IF NOT EXISTS promo_codes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                code TEXT NOT NULL UNIQUE,
                title TEXT DEFAULT '',
                description TEXT DEFAULT '',
                promo_type TEXT NOT NULL,
                discount_value INTEGER DEFAULT 0,
                max_discount_amount INTEGER DEFAULT 0,
                min_order_amount INTEGER DEFAULT 0,
                starts_at TEXT DEFAULT '',
                ends_at TEXT DEFAULT '',
                active INTEGER DEFAULT 1,
                total_usage_limit INTEGER DEFAULT 0,
                per_user_limit INTEGER DEFAULT 0,
                used_count INTEGER DEFAULT 0,
                allowed_delivery_types TEXT DEFAULT '[]',
                allowed_payment_methods TEXT DEFAULT '[]',
                product_ids TEXT DEFAULT '[]',
                category_names TEXT DEFAULT '[]',
                first_order_only INTEGER DEFAULT 0,
                new_users_only INTEGER DEFAULT 0,
                stackable INTEGER DEFAULT 0,
                priority INTEGER DEFAULT 100,
                metadata TEXT DEFAULT '{}',
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
                deleted_at TEXT DEFAULT ''
            )
        """)

        await db.execute("""
            CREATE TABLE IF NOT EXISTS promo_redemptions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                promo_id INTEGER,
                code TEXT NOT NULL,
                user_id INTEGER NOT NULL,
                order_id INTEGER,
                status TEXT DEFAULT 'applied',
                discount_amount INTEGER DEFAULT 0,
                subtotal_before_discount INTEGER DEFAULT 0,
                total_after_discount INTEGER DEFAULT 0,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                cancelled_at TEXT DEFAULT ''
            )
        """)

        await db.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_promo_codes_code ON promo_codes(code)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_promo_codes_active ON promo_codes(active)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_promo_redemptions_promo_id ON promo_redemptions(promo_id)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_promo_redemptions_user_id ON promo_redemptions(user_id)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_promo_redemptions_order_id ON promo_redemptions(order_id)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_promo_redemptions_code ON promo_redemptions(code)")

        default_settings = [
            ("delivery_mode", config.DELIVERY_MODE), 
            ("min_order", str(config.MIN_ORDER)),
            ("store_name", config.STORE_NAME),
            ("store_welcome", config.STORE_WELCOME),
            ("store_button", config.STORE_BUTTON),
            ("delivery_base", str(config.DELIVERY_RATES.get("base", 15000))),
            ("delivery_eta_hours", "24"),
            ("map_center", json.dumps(config.DEFAULT_MAP_CENTER)),
            ("map_zoom", str(config.DEFAULT_MAP_ZOOM)),
            ("categories", json.dumps(config.DEFAULT_CATEGORIES, ensure_ascii=False)),
            ("maintenance_enabled", config.MAINTENANCE_ENABLED),
            ("maintenance_text", config.MAINTENANCE_TEXT),
            ("referral_offers", json.dumps(config.REFERRAL_OFFERS, ensure_ascii=False)),
            ("branches", json.dumps(config.BRANCH_ADDRESSES)),
            ("card_number", config.CARD_NUMBER),
            ("card_holder", config.CARD_HOLDER),
            ("theme", json.dumps(config.THEME)),
            ("market_settings", json.dumps(config.MARKET_SETTINGS, ensure_ascii=False)),
            ("home_settings", json.dumps(config.HOME_SETTINGS, ensure_ascii=False)),
            ("product_card_settings", json.dumps(config.PRODUCT_CARD_SETTINGS, ensure_ascii=False)),
            ("system_messages", json.dumps(config.SYSTEM_MESSAGES, ensure_ascii=False)),
            ("bot_messages", json.dumps(config.BOT_MESSAGES, ensure_ascii=False)),
            ("seo", json.dumps(config.SEO, ensure_ascii=False)),
            ("navigation", json.dumps(config.NAVIGATION, ensure_ascii=False)),
            ("page_sections", json.dumps(config.PAGE_SECTIONS, ensure_ascii=False)),
            ("footer", json.dumps(config.FOOTER, ensure_ascii=False)),
        ]
        for k, v in default_settings:
            await db.execute("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)", (k, str(v)))

        async with db.execute("SELECT value FROM settings WHERE key='theme'") as c:
            theme_row = await c.fetchone()
        try:
            current_theme = json.loads(theme_row[0]) if theme_row and theme_row[0] else {}
        except Exception:
            current_theme = {}
        simplified_theme = {
            "background": current_theme.get("background") or current_theme.get("light_background") or config.THEME["background"],
            "accent": current_theme.get("accent") or current_theme.get("light_accent") or config.THEME["accent"],
        }
        await db.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES ('theme', ?)",
            (json.dumps(simplified_theme, ensure_ascii=False),),
        )

        await db.execute(
            "INSERT OR IGNORE INTO admin_settings (key, value) VALUES ('admin_password', ?)",
            (config.ADMIN_PASSWORD,),
        )

        await _ensure_columns(db)
        await _migrate_brand_defaults(db)
        await db.commit()

    logger.info("Database initialized")


async def _ensure_columns(db):
    migrations = [
        ("users", "role", "TEXT DEFAULT 'user'"),
        ("users", "referral_code", "TEXT DEFAULT ''"),
        ("users", "phone", "TEXT DEFAULT ''"),
        ("users", "admin_password", "TEXT DEFAULT ''"),
        ("users", "admin_notes", "TEXT DEFAULT ''"),
        ("users", "client_status", "TEXT DEFAULT 'active'"),
        ("orders", "admin_name", "TEXT DEFAULT ''"),
        ("orders", "reject_reason", "TEXT DEFAULT ''"),
        ("orders", "phone", "TEXT DEFAULT ''"),
        ("orders", "comment", "TEXT DEFAULT ''"),
        ("orders", "subtotal", "INTEGER DEFAULT 0"),
        ("orders", "delivery_cost", "INTEGER DEFAULT 0"),
        ("orders", "promo", "TEXT DEFAULT ''"),
        ("orders", "code", "TEXT DEFAULT ''"),
        ("orders", "discount_amount", "INTEGER DEFAULT 0"),
        ("orders", "promo_snapshot", "TEXT DEFAULT '{}'"),
        ("orders", "payment_status", "TEXT DEFAULT ''"),
        ("orders", "delivery_time", "TEXT DEFAULT ''"),
        ("products", "sku", "TEXT DEFAULT ''"),
        ("products", "keywords", "TEXT DEFAULT ''"),
        ("products", "old_price", "INTEGER DEFAULT 0"),
        ("products", "badges", "TEXT DEFAULT '[]'"),
        ("products", "tags", "TEXT DEFAULT '[]'"),
        ("products", "collection", "TEXT DEFAULT ''"),
        ("products", "featured", "INTEGER DEFAULT 0"),
        ("products", "bestseller", "INTEGER DEFAULT 0"),
        ("products", "is_new", "INTEGER DEFAULT 0"),
        ("products", "limited", "INTEGER DEFAULT 0"),
        ("products", "updated_at", "TEXT DEFAULT ''"),
        ("banners", "title", "TEXT DEFAULT ''"),
        ("banners", "subtitle", "TEXT DEFAULT ''"),
        ("banners", "action_text", "TEXT DEFAULT ''"),
        ("banners", "target", "TEXT DEFAULT ''"),
        ("banners", "interval_ms", "INTEGER DEFAULT 4500"),
        ("banners", "created_at", "TEXT DEFAULT ''"),
        ("banners", "updated_at", "TEXT DEFAULT ''"),
    ]
    for table, column, definition in migrations:
        try:
            await db.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")
        except Exception:
            pass


async def _migrate_brand_defaults(db):
    legacy_values = {
        "Berry & Chocolate Market",
        "Market",
        "Do'konga kirish",
        "Assalomu alaykum! Bizning onlayn do'konimizga xush kelibsiz.",
    }
    direct_settings = {
        "store_name": config.STORE_NAME,
        "store_welcome": config.STORE_WELCOME,
        "store_button": config.STORE_BUTTON,
        "system_messages": json.dumps(config.SYSTEM_MESSAGES, ensure_ascii=False),
        "bot_messages": json.dumps(config.BOT_MESSAGES, ensure_ascii=False),
    }
    for key, value in direct_settings.items():
        async with db.execute("SELECT value FROM settings WHERE key=?", (key,)) as c:
            row = await c.fetchone()
        current = row[0] if row else ""
        should_replace = not current or current in legacy_values
        if key == "system_messages":
            should_replace = (
                not current
                or "Berry & Chocolate Market" in current
                or "Savatda mahsulotlar mavjud emas" in current
                or "Savatda hali shirin boxlar" in current
            )
        if key == "bot_messages":
            should_replace = not current
        if should_replace:
            await db.execute(
                "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
                (key, value),
            )
        elif key == "bot_messages":
            try:
                merged = {**config.BOT_MESSAGES, **json.loads(current or "{}")}
            except Exception:
                merged = config.BOT_MESSAGES
            await db.execute(
                "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
                (key, json.dumps(merged, ensure_ascii=False)),
            )

    json_settings = {
        "market_settings": config.MARKET_SETTINGS,
        "home_settings": config.HOME_SETTINGS,
        "seo": config.SEO,
        "footer": config.FOOTER,
    }
    for key, value in json_settings.items():
        async with db.execute("SELECT value FROM settings WHERE key=?", (key,)) as c:
            row = await c.fetchone()
        current = row[0] if row else ""
        if (not current) or ("Berry & Chocolate Market" in current) or ("yuldashevs_market_bot" in current):
            await db.execute(
                "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
                (key, json.dumps(value, ensure_ascii=False)),
            )


def _json_dump(value, default):
    if value is None:
        value = default
    if isinstance(value, str):
        try:
            parsed = json.loads(value or "")
            value = parsed
        except Exception:
            return value
    return json.dumps(value, ensure_ascii=False)


def generate_order_code():
    return "".join(random.choices(string.ascii_uppercase + string.digits, k=6))


async def get_user(uid):
    async with await _connect() as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM users WHERE id=?", (uid,)) as c:
            u = await c.fetchone()
            if u and uid == int(config.ADMIN_ID) and u["role"] != "owner":
                await db.execute("UPDATE users SET role='owner' WHERE id=?", (uid,))
                await db.commit()
                u = dict(u)
                u["role"] = "owner"
            return u


async def ensure_user(uid, fn, ln):
    async with await _connect() as db:
        async with db.execute("SELECT id, custom_name FROM users WHERE id=?", (uid,)) as c:
            user = await c.fetchone()
            if not user:
                role = "owner" if uid == int(config.ADMIN_ID) else "user"
                await db.execute(
                    "INSERT INTO users (id, first_name, last_name, role) VALUES (?, ?, ?, ?)",
                    (uid, fn or "", ln or "", role),
                )
                await db.commit()
            elif not user[1] and (fn or ln):
                await db.execute(
                    "UPDATE users SET first_name=?, last_name=? WHERE id=?",
                    (fn or "", ln or "", uid),
                )
                await db.commit()


async def get_all_users():
    async with await _connect() as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM users") as c:
            return await c.fetchall()


async def update_user_role(uid, role):
    async with await _connect() as db:
        await db.execute("UPDATE users SET role=? WHERE id=?", (role, uid))
        await db.commit()


async def update_user_admin_profile(uid, first_name=None, last_name=None, phone=None, role=None, client_status=None):
    fields = {}
    if first_name is not None:
        fields["first_name"] = first_name
    if last_name is not None:
        fields["last_name"] = last_name
    if phone is not None:
        fields["phone"] = phone
    if role is not None:
        fields["role"] = role
    if client_status is not None:
        fields["client_status"] = client_status
    if not fields:
        return
    fields["custom_name"] = 1
    async with await _connect() as db:
        sets = ", ".join([f"{k}=?" for k in fields])
        await db.execute(
            f"UPDATE users SET {sets} WHERE id=?",
            (*fields.values(), uid),
        )
        await db.commit()


async def update_user_admin_password(uid, password):
    async with await _connect() as db:
        await db.execute("UPDATE users SET admin_password=? WHERE id=?", (password or "", uid))
        await db.commit()


async def update_user_name(uid, fn, ln):
    async with await _connect() as db:
        await db.execute(
            "UPDATE users SET first_name=?, last_name=?, custom_name=1 WHERE id=?",
            (fn, ln, uid),
        )
        await db.commit()


async def update_user_address(uid, addr):
    async with await _connect() as db:
        await db.execute("UPDATE users SET last_address=? WHERE id=?", (addr, uid))
        await db.commit()


async def update_user_phone(uid, phone):
    async with await _connect() as db:
        await db.execute("UPDATE users SET phone=? WHERE id=?", (phone or "", uid))
        await db.commit()


async def update_user_referral(uid, code):
    async with await _connect() as db:
        await db.execute("UPDATE users SET referral_code=? WHERE id=?", (code, uid))
        await db.commit()


async def get_products(active_only=True):
    async with await _connect() as db:
        db.row_factory = aiosqlite.Row
        condition = " WHERE active=1" if active_only else ""
        sql = f"SELECT * FROM products{condition} ORDER BY sort_order, id"
        async with db.execute(sql) as c:
            return await c.fetchall()


async def get_product(pid):
    async with await _connect() as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM products WHERE id=?", (pid,)) as c:
            return await c.fetchone()


async def add_product(
    name,
    price,
    category="Barchasi",
    description="",
    discount_percent=0,
    is_bogo=0,
    stock=-1,
    image="",
    variants="[]",
    sku="",
    keywords="",
    active=1,
    old_price=0,
    badges="[]",
    tags="[]",
    collection="",
    featured=0,
    bestseller=0,
    is_new=0,
    limited=0,
):
    async with await _connect() as db:
        async with db.execute("SELECT COALESCE(MAX(sort_order), 0) FROM products") as c:
            ms = (await c.fetchone())[0]
        cur = await db.execute(
            "INSERT INTO products (name, price, category, description, discount_percent, "
            "is_bogo, stock, image, variants, sku, keywords, active, sort_order, "
            "old_price, badges, tags, collection, featured, bestseller, is_new, limited) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                name, price, category, description, discount_percent, is_bogo,
                stock, image, variants, sku, keywords, active, ms + 1,
                old_price, badges, tags, collection, featured, bestseller, is_new, limited,
            ),
        )
        pid = cur.lastrowid
        await db.commit()
        return pid


ALLOWED_PRODUCT_FIELDS = {
    "name", "price", "category", "description", "discount_percent",
    "is_bogo", "stock", "active", "sort_order", "image", "variants",
    "sku", "keywords", "old_price", "badges", "tags", "collection",
    "featured", "bestseller", "is_new", "limited", "updated_at",
}


async def update_product(pid, **kw):
    kw = {k: v for k, v in kw.items() if k in ALLOWED_PRODUCT_FIELDS}
    if not kw:
        return
    async with await _connect() as db:
        columns = ", ".join(f"{k}=?" for k in kw)
        await db.execute(
            f"UPDATE products SET {columns}, updated_at=CURRENT_TIMESTAMP WHERE id=?",
            [*kw.values(), pid],
        )
        await db.commit()


async def delete_product(pid):
    async with await _connect() as db:
        await db.execute("DELETE FROM products WHERE id=?", (pid,))
        await db.commit()


async def create_order(
    uid,
    items,
    dt,
    total,
    pm="cash",
    addr="",
    phone="",
    comment="",
    subtotal=0,
    delivery_cost=0,
    promo="",
    discount_amount=0,
    promo_snapshot=None,
    code="",
):
    code = str(code or "").strip().upper() or generate_order_code()
    async with await _connect() as db:
        for _ in range(100):
            async with db.execute("SELECT id FROM orders WHERE code=?", (code,)) as c:
                if not await c.fetchone():
                    break
            code = generate_order_code()
        else:
            raise RuntimeError("Could not generate unique order code")

        cur = await db.execute(
            "INSERT INTO orders (user_id, items, delivery_type, payment_method, total_price, address, code, phone, comment, subtotal, delivery_cost, promo, discount_amount, promo_snapshot) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                uid,
                json.dumps(items, ensure_ascii=False),
                dt,
                pm,
                total,
                addr,
                code,
                phone or "",
                comment or "",
                subtotal or 0,
                delivery_cost or 0,
                promo or "",
                max(0, int(discount_amount or 0)),
                json.dumps(promo_snapshot or {}, ensure_ascii=False),
            ),
        )
        oid = cur.lastrowid
        await db.commit()
        return oid, code


PROMO_FIELDS = {
    "code", "title", "description", "promo_type", "discount_value",
    "max_discount_amount", "min_order_amount", "starts_at", "ends_at",
    "active", "total_usage_limit", "per_user_limit", "used_count",
    "allowed_delivery_types", "allowed_payment_methods", "product_ids",
    "category_names", "first_order_only", "new_users_only", "stackable",
    "priority", "metadata",
}


async def get_promo_codes(include_deleted=False):
    async with await _connect() as db:
        db.row_factory = aiosqlite.Row
        where = "" if include_deleted else "WHERE COALESCE(deleted_at, '')=''"
        async with db.execute(
            f"SELECT * FROM promo_codes {where} ORDER BY active DESC, priority ASC, id DESC"
        ) as c:
            return await c.fetchall()


async def get_promo_code(pid):
    async with await _connect() as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM promo_codes WHERE id=?", (pid,)) as c:
            return await c.fetchone()


async def get_promo_code_by_code(code):
    async with await _connect() as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM promo_codes WHERE code=? AND COALESCE(deleted_at, '')=''",
            (str(code or "").strip().upper(),),
        ) as c:
            return await c.fetchone()


async def save_promo_code(payload, pid=0):
    data = {k: payload[k] for k in PROMO_FIELDS if k in payload}
    data.pop("used_count", None)
    if not data:
        return await get_promo_code(pid) if pid else None
    async with await _connect() as db:
        db.row_factory = aiosqlite.Row
        if pid:
            sets = ", ".join([f"{k}=?" for k in data])
            await db.execute(
                f"UPDATE promo_codes SET {sets}, updated_at=CURRENT_TIMESTAMP WHERE id=?",
                (*data.values(), pid),
            )
            await db.commit()
            async with db.execute("SELECT * FROM promo_codes WHERE id=?", (pid,)) as c:
                return await c.fetchone()
        columns = ", ".join(data.keys())
        placeholders = ", ".join(["?"] * len(data))
        cur = await db.execute(
            f"INSERT INTO promo_codes ({columns}) VALUES ({placeholders})",
            tuple(data.values()),
        )
        await db.commit()
        async with db.execute("SELECT * FROM promo_codes WHERE id=?", (cur.lastrowid,)) as c:
            return await c.fetchone()


async def soft_delete_promo_code(pid):
    async with await _connect() as db:
        cur = await db.execute(
            "UPDATE promo_codes SET deleted_at=CURRENT_TIMESTAMP, active=0, updated_at=CURRENT_TIMESTAMP WHERE id=?",
            (pid,),
        )
        await db.commit()
        return cur.rowcount > 0


async def toggle_promo_code(pid, active):
    async with await _connect() as db:
        cur = await db.execute(
            "UPDATE promo_codes SET active=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND COALESCE(deleted_at, '')=''",
            (1 if active else 0, pid),
        )
        await db.commit()
        return cur.rowcount > 0


async def get_promo_redemption_count(promo_id=None, user_id=None, code=None):
    clauses = ["status='applied'"]
    params = []
    if promo_id is not None:
        clauses.append("promo_id=?")
        params.append(promo_id)
    if user_id is not None:
        clauses.append("user_id=?")
        params.append(user_id)
    if code is not None:
        clauses.append("code=?")
        params.append(str(code or "").upper())
    async with await _connect() as db:
        async with db.execute(f"SELECT COUNT(*) FROM promo_redemptions WHERE {' AND '.join(clauses)}", params) as c:
            return (await c.fetchone())[0]


async def create_promo_redemption(promo, user_id, order_id, discount_amount, subtotal_before_discount, total_after_discount):
    async with await _connect() as db:
        await db.execute(
            """
            INSERT INTO promo_redemptions (
                promo_id, code, user_id, order_id, status, discount_amount,
                subtotal_before_discount, total_after_discount
            ) VALUES (?, ?, ?, ?, 'applied', ?, ?, ?)
            """,
            (
                promo["id"],
                promo["code"],
                user_id,
                order_id,
                max(0, int(discount_amount or 0)),
                max(0, int(subtotal_before_discount or 0)),
                max(0, int(total_after_discount or 0)),
            ),
        )
        await db.execute("UPDATE promo_codes SET used_count=used_count+1, updated_at=CURRENT_TIMESTAMP WHERE id=?", (promo["id"],))
        await db.commit()


async def cancel_promo_redemption_for_order(order_id):
    async with await _connect() as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM promo_redemptions WHERE order_id=? AND status='applied'",
            (order_id,),
        ) as c:
            rows = await c.fetchall()
        for row in rows:
            await db.execute(
                "UPDATE promo_redemptions SET status='cancelled', cancelled_at=CURRENT_TIMESTAMP WHERE id=?",
                (row["id"],),
            )
            if row["promo_id"]:
                await db.execute(
                    "UPDATE promo_codes SET used_count=MAX(0, used_count-1), updated_at=CURRENT_TIMESTAMP WHERE id=?",
                    (row["promo_id"],),
                )
        await db.commit()
        return len(rows)


async def user_has_active_orders(uid):
    inactive = ("cancelled", "rejected", "failed", "fully_cancelled")
    placeholders = ",".join(["?"] * len(inactive))
    async with await _connect() as db:
        async with db.execute(
            f"SELECT COUNT(*) FROM orders WHERE user_id=? AND status NOT IN ({placeholders})",
            (uid, *inactive),
        ) as c:
            return (await c.fetchone())[0] > 0


async def get_order(oid):
    async with await _connect() as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM orders WHERE id=?", (oid,)) as c:
            return await c.fetchone()


async def get_order_by_code(code):
    async with await _connect() as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM orders WHERE code=?", (code,)) as c:
            return await c.fetchone()


async def get_orders(uid):
    async with await _connect() as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM orders WHERE user_id=? ORDER BY created_at DESC LIMIT 50",
            (uid,),
        ) as c:
            return await c.fetchall()


async def get_recent_orders(limit=10):
    async with await _connect() as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM orders ORDER BY created_at DESC LIMIT ?", (limit,)
        ) as c:
            return await c.fetchall()


async def get_all_orders(limit=5000):
    async with await _connect() as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM orders ORDER BY id DESC LIMIT ?", (limit,)
        ) as c:
            return await c.fetchall()


async def delete_order(oid):
    async with await _connect() as db:
        cur = await db.execute("DELETE FROM orders WHERE id=?", (oid,))
        await db.commit()
        return cur.rowcount > 0


async def update_order_status(oid, st, admin_name="", reject_reason=""):
    async with await _connect() as db:
        if admin_name and reject_reason:
            await db.execute(
                "UPDATE orders SET status=?, admin_name=?, reject_reason=? WHERE id=?",
                (st, admin_name, reject_reason, oid),
            )
        elif admin_name:
            await db.execute(
                "UPDATE orders SET status=?, admin_name=? WHERE id=?",
                (st, admin_name, oid),
            )
        else:
            await db.execute(
                "UPDATE orders SET status=? WHERE id=?",
                (st, oid),
            )
        await db.commit()


async def get_order_stats():
    async with await _connect() as db:
        s = {}
        async with db.execute("SELECT COUNT(*) FROM orders") as c:
            s["total_orders"] = (await c.fetchone())[0]
        async with db.execute(
            "SELECT COALESCE(SUM(total_price), 0) FROM orders WHERE status IN ('confirmed', 'paid', 'yetkazilmoqda', 'yetkazildi')"
        ) as c:
            s["total_revenue"] = (await c.fetchone())[0]
        async with db.execute("SELECT COUNT(*) FROM orders WHERE status IN ('pending', 'tekshirilmoqda')") as c:
            s["pending"] = (await c.fetchone())[0]
        return s


async def get_setting(key, default=""):
    async with await _connect() as db:
        async with db.execute("SELECT value FROM settings WHERE key=?", (key,)) as c:
            r = await c.fetchone()
            return r[0] if r else default


async def set_setting(key, val):
    async with await _connect() as db:
        await db.execute(
            "INSERT INTO settings (key, value) VALUES (?, ?) "
            "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            (key, str(val)),
        )
        await db.commit()


async def get_all_settings():
    async with await _connect() as db:
        async with db.execute("SELECT key, value FROM settings") as c:
            return {r[0]: r[1] for r in await c.fetchall()}


async def add_banner(image, title="", interval_ms=4500, active=1, subtitle="", action_text="", target=""):
    async with await _connect() as db:
        async with db.execute("SELECT COALESCE(MAX(sort_order), 0) FROM banners") as c:
            ms = (await c.fetchone())[0]
        cur = await db.execute(
            "INSERT INTO banners (image, title, subtitle, action_text, target, interval_ms, active, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (image, title or "", subtitle or "", action_text or "", target or "", int(interval_ms or 4500), int(active), ms + 1),
        )
        bid = cur.lastrowid
        await db.commit()
        return bid


async def get_banners(active_only=True):
    async with await _connect() as db:
        db.row_factory = aiosqlite.Row
        condition = " WHERE active=1" if active_only else ""
        sql = f"SELECT * FROM banners{condition} ORDER BY sort_order"
        async with db.execute(sql) as c:
            return await c.fetchall()


async def delete_banner(bid):
    async with await _connect() as db:
        await db.execute("DELETE FROM banners WHERE id=?", (bid,))
        await db.commit()


async def update_banner(bid, **kwargs):
    allowed = {"image", "title", "subtitle", "action_text", "target", "interval_ms", "active", "sort_order"}
    fields = {k: v for k, v in kwargs.items() if k in allowed}
    if not fields:
        return
    async with await _connect() as db:
        sets = ", ".join([f"{k}=?" for k in fields])
        await db.execute(f"UPDATE banners SET {sets}, updated_at=CURRENT_TIMESTAMP WHERE id=?", (*fields.values(), bid))
        await db.commit()


async def get_admin_password():
    async with await _connect() as db:
        async with db.execute(
            "SELECT value FROM admin_settings WHERE key='admin_password'"
        ) as c:
            row = await c.fetchone()
            return row[0] if row else config.ADMIN_PASSWORD


async def get_login_password(uid):
    async with await _connect() as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT role, admin_password FROM users WHERE id=?", (uid,)) as c:
            user = await c.fetchone()
        if user and user["admin_password"] and user["role"] in ("admin", "deliver"):
            return user["admin_password"]
        return await get_admin_password()


async def set_admin_password(new_pwd):
    async with await _connect() as db:
        await db.execute(
            "INSERT OR REPLACE INTO admin_settings (key, value) VALUES ('admin_password', ?)",
            (new_pwd,),
        )
        await db.commit()


async def log_admin_access(uid, device, password, success):
    async with await _connect() as db:
        await db.execute(
            "INSERT INTO admin_logs (user_id, device_info, password_used, success) VALUES (?, ?, ?, ?)",
            (uid, device, password, success),
        )
        await db.commit()


async def get_admin_logs(limit=50):
    async with await _connect() as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM admin_logs ORDER BY timestamp DESC LIMIT ?", (limit,)
        ) as c:
            return [dict(r) for r in await c.fetchall()]
