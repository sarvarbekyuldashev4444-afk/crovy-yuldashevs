import os
import json

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_TXT_PATH = os.path.join(BASE_DIR, "config.txt")


def _read_config_txt():
    values = {}
    if not os.path.exists(CONFIG_TXT_PATH):
        return values
    with open(CONFIG_TXT_PATH, "r", encoding="utf-8") as f:
        for raw_line in f:
            line = raw_line.strip().lstrip("\ufeff")
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            values[key.strip()] = value.strip()
    return values


FILE_CONFIG = _read_config_txt()


def _cfg(key, default=""):
    env_value = os.environ.get(key)
    if env_value not in (None, ""):
        return env_value
    file_value = FILE_CONFIG.get(key)
    if file_value not in (None, ""):
        return file_value
    return default


def _int_cfg(key, default=0):
    try:
        return int(_cfg(key, str(default)))
    except (TypeError, ValueError):
        return int(default)


def _path_cfg(key, default):
    value = os.path.expandvars(os.path.expanduser(_cfg(key, default)))
    if os.path.isabs(value):
        return value
    return os.path.join(BASE_DIR, value)


def _json_cfg(key, default):
    raw = _cfg(key, "")
    if not raw:
        return default
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return default


BOT_TOKEN = _cfg("BOT_TOKEN", "")
if not BOT_TOKEN or BOT_TOKEN == "YOUR_BOT_TOKEN":
    raise RuntimeError("BOT_TOKEN is required in config.txt")
BOT_USERNAME = _cfg("BOT_USERNAME", "crovybot")
ADMIN_ID = _int_cfg("ADMIN_ID", 0)
if not ADMIN_ID:
    raise RuntimeError("ADMIN_ID is required in config.txt")
APP_URL = _cfg("APP_URL", "").rstrip("/")
WEBAPP_URL = _cfg("WEBAPP_URL", APP_URL).rstrip("/")
PORT = _int_cfg("PORT", 8080)
LOCAL_USER_ID = _int_cfg("LOCAL_USER_ID", 777000)

ADMIN_PASSWORD = _cfg("ADMIN_PASSWORD", "7618")
CARD_NUMBER = _cfg("CARD_NUMBER", "8600 1234 5678 9012")
CARD_HOLDER = _cfg("CARD_HOLDER", "Crovy")

STORE_NAME = _cfg("STORE_NAME", "Crovy")
STORE_WELCOME = _cfg("STORE_WELCOME", "Crovy'ga xush kelibsiz. Shokoladdagi qulupnay va sovg'a boxlarini bir necha bosishda buyurtma qiling.")
STORE_BUTTON = _cfg("STORE_BUTTON", "Crovy katalogini ochish")

DELIVERY_RATES = _json_cfg("DELIVERY_RATES", {"base": 15000})
DEFAULT_MAP_CENTER = _json_cfg("DEFAULT_MAP_CENTER", [41.2995, 69.2401])
DEFAULT_MAP_ZOOM = int(_cfg("DEFAULT_MAP_ZOOM", "12"))
DEFAULT_CATEGORIES = _json_cfg("DEFAULT_CATEGORIES", ["Barchasi"])
BRANCH_ADDRESSES = _json_cfg("BRANCH_ADDRESSES", [])
PROMO_CODES = _json_cfg("PROMO_CODES", {"DOSTAVKA": "free_delivery"})
REFERRAL_OFFERS = _json_cfg("REFERRAL_OFFERS", {})
DELIVERY_MODE = _cfg("DELIVERY_MODE", "all")
MIN_ORDER = int(_cfg("MIN_ORDER", "0"))
MAINTENANCE_ENABLED = _cfg("MAINTENANCE_ENABLED", "0")
MAINTENANCE_TEXT = _cfg(
    "MAINTENANCE_TEXT",
    "Hozir texnik ishlar olib borilmoqda. Iltimos, keyinroq urinib ko'ring.",
)
THEME = {
    "background": _cfg("THEME_BACKGROUND", "#f4f6f9"),
    "accent": _cfg("THEME_ACCENT", "#2faa4f"),
}

MARKET_SETTINGS = _json_cfg("MARKET_SETTINGS", {
    "name": STORE_NAME,
    "description": STORE_WELCOME,
    "logo": "",
    "favicon": "",
    "language": "uz",
    "currency": "so'm",
    "timezone": "Asia/Tashkent",
    "contacts": "",
    "telegram_username": BOT_USERNAME,
    "telegram_channel": "",
    "support": "",
    "social_links": [],
})

HOME_SETTINGS = _json_cfg("HOME_SETTINGS", {
    "hero_title": STORE_NAME,
    "hero_subtitle": STORE_WELCOME,
    "search_placeholder": "Qidirish",
    "sections_order": ["banner-carousel", "categories", "catalog"],
    "cta_blocks": [],
})

PRODUCT_CARD_SETTINGS = _json_cfg("PRODUCT_CARD_SETTINGS", {
    "show_price": True,
    "show_discount": True,
    "show_rating": False,
    "show_button": True,
    "image_format": "square",
    "show_badges": True,
    "layout": "grid",
})

SYSTEM_MESSAGES = _json_cfg("SYSTEM_MESSAGES", {
    "empty_cart": "Savat hozircha bo'sh. Crovy'dan yoqqan boxni tanlang.",
    "empty_orders": "Hozircha buyurtmalar yo'q. Birinchi Crovy boxingiz shu yerda ko'rinadi.",
    "loading": "Yuklanmoqda...",
    "error": "Xatolik yuz berdi. Iltimos, qayta urinib ko'ring.",
})

BOT_MESSAGES = _json_cfg("BOT_MESSAGES", {
    "start": "{emoji_gift} <b>Assalomu alaykum!</b>\n\nCrovy katalogi tayyor: shokoladdagi qulupnay, sovg'a boxlari va tezkor yetkazish.\n\nBuyurtma berish uchun quyidagi tugmani bosing.",
    "no_permission": "Kechirasiz, bu amal faqat Crovy jamoasi uchun ochiq.",
    "admin_menu": "{emoji_settings} <b>Crovy boshqaruv paneli</b>\n\nBuyurtmalar: <b>{total_orders}</b>\nKutilayotgan: <b>{pending_orders}</b>\nDaromad: <b>{total_revenue} so'm</b>\nIsh rejimi: <b>{mode_text}</b>\n\n<i>Yangi mahsulot qo'shish uchun rasm va tavsifni Narxlar formati bilan botga yuboring.</i>",
    "mode_changed": "Rejim yangilandi: {mode_text}",
    "product_auto_added": "{emoji_gift} Mahsulot qo'shildi: <b>{name}</b>\nKategoriya: {category}\nVariantlar: {variants_count} ta",
    "admin_products_title": "<b>Mahsulotlar ro'yxati</b>\nTahrirlash uchun mahsulotni tanlang:",
    "admin_product_details": "<b>Mahsulot:</b> {name} (ID: #{product_id})\n\nNarxi: {price} so'm\nKategoriya: {category}\nChegirma: {discount}%\n1+1 aksiyasi: {bogo}\nOmbordagi qoldiq: {stock}\nHolati: {status}",
    "admin_orders_title": "<b>So'nggi buyurtmalar ro'yxati</b>:",
    "admin_order_details_title": "Buyurtma tafsilotlari",
    "admin_payment_review_title": "To'lov tekshiruvi",
    "product_add_name": "Mahsulot nomini yuboring.",
    "product_add_price": "Narxni faqat raqam bilan yuboring. Masalan: 129000",
    "product_add_price_error": "Narxni raqam bilan yuboring. Masalan: 129000",
    "product_add_category": "Kategoriya nomini yuboring yoki /skip yozing.",
    "product_add_discount": "Chegirma foizini yuboring. Chegirma bo'lmasa 0 yozing.",
    "product_add_discount_error": "Chegirma 0 dan 99 gacha raqam bo'lishi kerak.",
    "product_add_bogo": "Bu mahsulot 1+1 aksiyasidami?",
    "product_add_photo": "Mahsulot rasmini yuboring yoki /skip yozing.",
    "product_add_desc": "Mahsulot tavsifini yuboring yoki /skip yozing.",
    "product_add_variants": "Variantlarni shu formatda yuboring: <code>12 dona-129000, 24 dona-239000</code>. Variant bo'lmasa /skip yozing.",
    "product_add_variants_error": "Variant formati noto'g'ri. Namuna: <code>12 dona-129000, 24 dona-239000</code>",
    "product_added_manual": "Mahsulot saqlandi. ID: #{product_id}",
    "banner_add_prompt": "Aksiya karuseliga qo'shiladigan rasmni yuboring.",
    "banner_added": "Banner saqlandi va karuselga qo'shildi.",
    "generic_error": "Xatolik yuz berdi: {error}",
    "not_found": "Topilmadi.",
    "product_deleted": "Mahsulot o'chirildi.",
    "edit_prompt": "<b>{field}</b> uchun yangi qiymatni yuboring.",
    "number_error": "Qiymat faqat raqam bo'lishi kerak.",
    "saved": "Ma'lumotlar saqlandi.",
    "no_orders": "Hozircha buyurtmalar yo'q.",
    "order_status_changed": "Buyurtma holati yangilandi.",
    "order_confirmed_customer": "{emoji_star} Buyurtmangiz #{order_code} tasdiqlandi.\n\nCrovy jamoasi uni tayyorlash va yetkazish jarayoniga o'tkazdi. Holat o'zgarsa, shu yerda xabar beramiz.",
    "order_cancelled_customer": "Buyurtmangiz #{order_code} bekor qilindi.\n\nSabab: {reason}\n\nSavolingiz bo'lsa, Crovy jamoasi bilan bog'lanishingiz mumkin.",
    "receipt_saved_customer": "{emoji_note} To'lov chekingiz qabul qilindi.\n\nAdminlar uni tekshiradi. Tasdiqlangach, buyurtma tayyorlashga o'tadi.",
    "receipt_invalid": "Iltimos, to'lovni tasdiqlash uchun skrinshot yoki chek rasmini yuboring.",
    "system_error": "Tizimda xatolik yuz berdi. Iltimos, qayta urinib ko'ring.",
    "payment_instruction": "{emoji_note} <b>Karta orqali to'lov</b>\n\nBuyurtma: <b>#{order_code}</b>\nTo'lov summasi: <b>{total} so'm</b>\n\nKarta: <code>{card_number}</code>\nQabul qiluvchi: {card_holder}\n\nTo'lovdan so'ng chek skrinshotini shu botga yuboring.\n\n{order_text}",
    "order_created_customer": "{emoji_gift} Buyurtmangiz #{order_code} qabul qilindi.\n\nJami: <b>{total} so'm</b>\nTo'lov: {payment}\nYetkazish: {delivery}\nTaxminiy muddat: {eta_hours} soat\n\nOperator buyurtmani tekshiradi va holati bo'yicha xabar beradi.",
    "order_receipt": "{emoji_gift} <b>{title}: #{order_code}</b>\n\nMijoz: {customer}\nTo'lov: {payment}\nYetkazish: {delivery}{phone_line}{address_line}{maps_line}{comment_line}\n\n<b>Tarkib:</b>\n{items_text}\n\nMahsulotlar: {subtotal} so'm{discount_line}{promo_line}\nYetkazish narxi: {delivery_cost}{eta_line}\n\n<b>Jami: {total} so'm</b>",
    "payment_review_title": "To'lov tekshiruvi",
})

SEO = _json_cfg("SEO", {
    "title": STORE_NAME,
    "description": STORE_WELCOME,
    "image": "",
})
NAVIGATION = _json_cfg("NAVIGATION", [
    {"tab": "home", "label": "Asosiy", "icon": "fi-rr-home", "enabled": True, "order": 10},
    {"tab": "cart", "label": "Savat", "icon": "fi-rr-shopping-cart", "enabled": True, "order": 20},
    {"tab": "offices", "label": "Filiallar", "icon": "fi-rr-marker", "enabled": True, "order": 30},
    {"tab": "profile", "label": "Profil", "icon": "fi-rr-user", "enabled": True, "order": 40},
])
PAGE_SECTIONS = _json_cfg("PAGE_SECTIONS", [
    {"id": "promo", "type": "banner-carousel", "enabled": True, "title": "Aksiyalar", "order": 10},
    {"id": "catalog", "type": "catalog", "enabled": True, "title": "Mahsulotlar", "order": 20},
])
FOOTER = _json_cfg("FOOTER", {"text": STORE_NAME, "links": []})

WEBAPP_DIR = os.path.join(BASE_DIR, "webapp")
DATA_DIR = _path_cfg("DATA_DIR", "/data")
DB_PATH = _path_cfg("DB_PATH", os.path.join(DATA_DIR, "market.db"))
UPLOAD_DIR = _path_cfg("UPLOAD_DIR", os.path.join(DATA_DIR, "uploads"))
SEED_DB_PATH = _path_cfg("SEED_DB_PATH", "market.db")
SEED_UPLOAD_DIR = _path_cfg("SEED_UPLOAD_DIR", os.path.join("webapp", "uploads"))

os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(UPLOAD_DIR, exist_ok=True)
