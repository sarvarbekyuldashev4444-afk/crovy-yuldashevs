import asyncio
import json
import uuid
import logging
import re
import os
from datetime import datetime, time
from aiohttp import web
from aiogram import Bot, Dispatcher
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup, MenuButtonWebApp, WebAppInfo
from aiogram.fsm.context import FSMContext
from aiogram.fsm.storage.base import StorageKey
import config
import database
import bot_texts
from utils import crop_and_save_image
from handlers.bot_handlers import OrderState

logger = logging.getLogger(__name__)

PM_MAP = {
    "cash": "Naqd",
    "card": "Karta",
    "click": "Click",
    "payme": "Payme",
    "transfer": "Bank o'tkazmasi",
}
DT_MAP = {"delivery": "Yetkazib berish", "pickup": "Olib ketish"}


def _safe_json(raw, default):
    try:
        return json.loads(raw) if raw else default
    except Exception:
        return default


def _safe_int(value, default=0):
    try:
        return int(value)
    except Exception:
        return default


def _safe_bool(value):
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    return str(value or "").strip().lower() in ("1", "true", "yes", "on")


def _json_list(value):
    if isinstance(value, list):
        return value
    try:
        parsed = json.loads(value or "[]")
        return parsed if isinstance(parsed, list) else []
    except Exception:
        return []


def _json_dict(value):
    if isinstance(value, dict):
        return value
    try:
        parsed = json.loads(value or "{}")
        return parsed if isinstance(parsed, dict) else {}
    except Exception:
        return {}


def _normalize_promo_code(code):
    code = str(code or "").strip().upper()
    if not re.fullmatch(r"[A-Z0-9_-]{3,32}", code):
        raise ValueError("Промокод должен быть 3-32 символа: A-Z, 0-9, - или _")
    return code


def _parse_datetime(value, end_of_day=False):
    value = str(value or "").strip()
    if not value:
        return None
    normalized = value.replace("Z", "").replace("T", " ")
    try:
        if re.fullmatch(r"\d{4}-\d{2}-\d{2}", normalized):
            dt = datetime.strptime(normalized, "%Y-%m-%d")
            return datetime.combine(dt.date(), time.max if end_of_day else time.min)
        return datetime.fromisoformat(normalized)
    except Exception:
        return None


def _money_error(amount):
    return f"{_fmt(amount)} so'm"


def _role_name(role):
    return {"owner": "super_admin", "admin": "admin", "deliver": "courier"}.get(role, role or "user")


def _order_dict(row):
    data = dict(row)
    data["receipt_id"] = data.get("code") or str(data.get("id"))
    try:
        data["parsed_items"] = json.loads(data.get("items") or "[]")
    except Exception:
        data["parsed_items"] = []
    return data


def _attach_customer(order, users_by_id):
    user = users_by_id.get(order.get("user_id")) or {}
    name = " ".join([str(user.get("first_name") or "").strip(), str(user.get("last_name") or "").strip()]).strip()
    order["user_name"] = name
    if not order.get("phone") and user.get("phone"):
        order["phone"] = user.get("phone")
    return order


def _clean_address(value):
    return str(value or "").replace("\\n", " ").replace("\n", " ").strip()


def _customer_summary(user, orders):
    user = dict(user)
    completed = [o for o in orders if o.get("status") != "cancelled"]
    cancelled = [o for o in orders if o.get("status") == "cancelled"]
    total = sum(_safe_int(o.get("total_price"), 0) for o in completed)
    last_order = max((o.get("created_at") or "" for o in orders), default="")
    addresses = []
    phone = user.get("phone", "")
    for o in orders:
        addr = _clean_address(o.get("address"))
        if addr and addr not in addresses:
            addresses.append(addr)
        if not phone and o.get("phone"):
            phone = o.get("phone")
    return {
        "id": user.get("id"),
        "telegram_id": user.get("id"),
        "first_name": user.get("first_name", ""),
        "last_name": user.get("last_name", ""),
        "name": " ".join([user.get("first_name", ""), user.get("last_name", "")]).strip() or "Ismsiz",
        "phone": phone,
        "registered_at": "",
        "last_activity": last_order,
        "orders_count": len(orders),
        "completed_orders": len(completed),
        "cancelled_orders": len(cancelled),
        "total_spent": total,
        "avg_check": round(total / len(completed)) if completed else 0,
        "addresses": addresses[:8],
        "admin_notes": user.get("admin_notes", ""),
        "client_status": user.get("client_status", "active"),
        "role": user.get("role", "user"),
    }


def _merge_dict(defaults, raw):
    data = _safe_json(raw, {})
    if not isinstance(data, dict):
        data = {}
    return {**defaults, **data}


def _theme_config(raw):
    data = _safe_json(raw, {})
    if not isinstance(data, dict):
        data = {}
    return {
        "background": data.get("background") or config.THEME["background"],
        "accent": data.get("accent") or config.THEME["accent"],
    }


def _sync_brand_content(store_name, store_welcome, market_settings, home_settings):
    name = str(store_name or "").strip() or config.STORE_NAME
    welcome = str(store_welcome or "").strip() or config.STORE_WELCOME
    market = dict(market_settings or {})
    home = dict(home_settings or {})
    market["name"] = name
    market["description"] = welcome
    home["hero_title"] = name
    home["hero_subtitle"] = welcome
    return market, home


def _variant_price(product, requested_variant):
    variants = _safe_json(product["variants"], [])
    if requested_variant and isinstance(variants, list):
        for variant in variants:
            if str(variant.get("size", "")).strip() == str(requested_variant).strip():
                return _safe_int(variant.get("price"), product["price"])
    return product["price"]


def _public_promo(promo):
    if not promo:
        return None
    return {
        "id": promo.get("id"),
        "code": promo.get("code", ""),
        "title": promo.get("title", ""),
        "description": promo.get("description", ""),
        "promo_type": promo.get("promo_type", ""),
        "discount_value": _safe_int(promo.get("discount_value"), 0),
    }


def _promo_to_dict(row):
    if not row:
        return None
    data = dict(row)
    for key in ("allowed_delivery_types", "allowed_payment_methods", "product_ids", "category_names"):
        data[key] = _json_list(data.get(key))
    data["metadata"] = _json_dict(data.get("metadata"))
    for key in ("active", "first_order_only", "new_users_only", "stackable"):
        data[key] = bool(_safe_int(data.get(key), 0))
    for key in ("discount_value", "max_discount_amount", "min_order_amount", "total_usage_limit", "per_user_limit", "used_count", "priority"):
        data[key] = _safe_int(data.get(key), 0)
    data["status"] = _promo_status(data)
    return data


def _promo_status(promo):
    if promo.get("deleted_at"):
        return "deleted"
    if not promo.get("active"):
        return "disabled"
    now = datetime.now()
    starts = _parse_datetime(promo.get("starts_at"))
    ends = _parse_datetime(promo.get("ends_at"), end_of_day=True)
    if starts and now < starts:
        return "not_started"
    if ends and now > ends:
        return "expired"
    limit = _safe_int(promo.get("total_usage_limit"), 0)
    if limit and _safe_int(promo.get("used_count"), 0) >= limit:
        return "limit_reached"
    return "active"


def _normalize_condition_list(values, all_token="all"):
    values = [str(v or "").strip().lower() for v in (values or []) if str(v or "").strip()]
    if not values or all_token in values:
        return []
    return values


async def validate_and_apply_promo(
    user_id,
    code,
    order_items,
    delivery_type,
    payment_method,
    subtotal,
    delivery_cost,
):
    try:
        normalized = _normalize_promo_code(code)
    except ValueError:
        return {"valid": False, "promo": None, "discount_amount": 0, "delivery_discount": 0, "reason": "format", "message": "Промокод не найден", "snapshot": {}}

    row = await database.get_promo_code_by_code(normalized)
    if not row:
        return {"valid": False, "promo": None, "discount_amount": 0, "delivery_discount": 0, "reason": "not_found", "message": "Промокод не найден", "snapshot": {}}
    promo = _promo_to_dict(row)
    status = _promo_status(promo)
    status_messages = {
        "disabled": ("inactive", "Промокод выключен"),
        "deleted": ("deleted", "Промокод не найден"),
        "not_started": ("not_started", "Промокод ещё не начал действовать"),
        "expired": ("expired", "Срок действия промокода истёк"),
        "limit_reached": ("usage_limit", "Лимит промокода исчерпан"),
    }
    if status != "active":
        reason, message = status_messages.get(status, ("inactive", "Промокод недоступен"))
        return {"valid": False, "promo": promo, "discount_amount": 0, "delivery_discount": 0, "reason": reason, "message": message, "snapshot": promo}

    per_user_limit = _safe_int(promo.get("per_user_limit"), 0)
    if per_user_limit:
        used_by_user = await database.get_promo_redemption_count(promo_id=promo["id"], user_id=user_id)
        if used_by_user >= per_user_limit:
            return {"valid": False, "promo": promo, "discount_amount": 0, "delivery_discount": 0, "reason": "per_user_limit", "message": "Промокод уже использован", "snapshot": promo}

    if promo.get("first_order_only") or promo.get("new_users_only"):
        if await database.user_has_active_orders(user_id):
            reason = "first_order_only" if promo.get("first_order_only") else "new_users_only"
            message = "Промокод действует только для первого заказа" if promo.get("first_order_only") else "Промокод действует только для новых пользователей"
            return {"valid": False, "promo": promo, "discount_amount": 0, "delivery_discount": 0, "reason": reason, "message": message, "snapshot": promo}

    min_order = _safe_int(promo.get("min_order_amount"), 0)
    if min_order and subtotal < min_order:
        return {
            "valid": False,
            "promo": promo,
            "discount_amount": 0,
            "delivery_discount": 0,
            "reason": "min_order",
            "message": f"Минимальная сумма заказа: {_money_error(min_order)}",
            "snapshot": promo,
        }

    allowed_delivery = _normalize_condition_list(promo.get("allowed_delivery_types"))
    if allowed_delivery and delivery_type not in allowed_delivery:
        target = "доставку" if "delivery" in allowed_delivery and "pickup" not in allowed_delivery else "самовывоз"
        return {"valid": False, "promo": promo, "discount_amount": 0, "delivery_discount": 0, "reason": "delivery_type", "message": f"Промокод действует только на {target}", "snapshot": promo}

    allowed_payments = _normalize_condition_list(promo.get("allowed_payment_methods"))
    if allowed_payments and payment_method not in allowed_payments:
        return {"valid": False, "promo": promo, "discount_amount": 0, "delivery_discount": 0, "reason": "payment_method", "message": "Промокод не действует для выбранного способа оплаты", "snapshot": promo}

    if promo.get("promo_type") == "free_delivery":
        if delivery_type != "delivery":
            return {"valid": False, "promo": promo, "discount_amount": 0, "delivery_discount": 0, "reason": "delivery_type", "message": "Промокод действует только на доставку", "snapshot": promo}
        return {
            "valid": True,
            "promo": promo,
            "discount_amount": 0,
            "delivery_discount": delivery_cost,
            "reason": "",
            "message": "Promokod qo'llandi",
            "snapshot": promo,
        }

    product_ids = {_safe_int(x, 0) for x in (promo.get("product_ids") or []) if _safe_int(x, 0)}
    category_names = {str(x or "").strip().lower() for x in (promo.get("category_names") or []) if str(x or "").strip()}
    eligible = []
    for item in order_items:
        by_product = bool(product_ids and item.get("id") in product_ids)
        by_category = bool(category_names and str(item.get("category") or "").strip().lower() in category_names)
        if (not product_ids and not category_names) or by_product or by_category:
            eligible.append(item)
    eligible_subtotal = sum(_safe_int(item.get("line_total"), _safe_int(item.get("price"), 0) * _safe_int(item.get("quantity"), 0)) for item in eligible)
    if eligible_subtotal <= 0:
        return {"valid": False, "promo": promo, "discount_amount": 0, "delivery_discount": 0, "reason": "not_applicable_products", "message": "Промокод не действует для выбранных товаров", "snapshot": promo}

    discount = 0
    if promo.get("promo_type") == "percent":
        discount = round(eligible_subtotal * _safe_int(promo.get("discount_value"), 0) / 100)
        max_discount = _safe_int(promo.get("max_discount_amount"), 0)
        if max_discount:
            discount = min(discount, max_discount)
    elif promo.get("promo_type") == "fixed_amount":
        discount = _safe_int(promo.get("discount_value"), 0)
    else:
        return {"valid": False, "promo": promo, "discount_amount": 0, "delivery_discount": 0, "reason": "type", "message": "Промокод недоступен", "snapshot": promo}

    discount = max(0, min(discount, eligible_subtotal))
    if discount <= 0:
        return {"valid": False, "promo": promo, "discount_amount": 0, "delivery_discount": 0, "reason": "zero_discount", "message": "Промокод не даёт скидку для этой корзины", "snapshot": promo}
    return {
        "valid": True,
        "promo": promo,
        "discount_amount": discount,
        "delivery_discount": 0,
        "reason": "",
        "message": "Promokod qo'llandi",
        "snapshot": promo,
    }


async def calculate_order_pricing(data, strict_promo=False):
    settings = await database.get_all_settings()
    promo_code = str(data.get("promo") or "").strip().upper()

    order_items = []
    subtotal = 0
    for item in data.get("items", []):
        pid = _safe_int(item.get("id"), 0)
        qty = max(1, _safe_int(item.get("quantity"), 1))
        product = await database.get_product(pid)
        if not product or not product["active"]:
            continue
        if product["stock"] >= 0 and qty > product["stock"]:
            raise ValueError(f"{product['name']} omborda yetarli emas")

        variant = item.get("variant", "")
        variants = _safe_json(product["variants"], [])
        if not variant and item.get("variantIndex") is not None and isinstance(variants, list):
            idx = _safe_int(item.get("variantIndex"), -1)
            if 0 <= idx < len(variants):
                variant = str(variants[idx].get("size") or "")
        unit_price = _variant_price(product, variant)
        if product["discount_percent"] > 0:
            unit_price = round(unit_price * (1 - product["discount_percent"] / 100))

        charged_qty = (qty + 1) // 2 if product["is_bogo"] else qty
        line_total = unit_price * charged_qty
        subtotal += line_total
        item_name = product["name"] + (f" ({variant})" if variant else "")
        order_items.append({
            "id": pid,
            "name": item_name,
            "price": unit_price,
            "quantity": qty,
            "charged_quantity": charged_qty,
            "line_total": line_total,
            "category": product["category"],
        })

    if not order_items:
        raise ValueError("Savat bo'sh")

    delivery_base = _safe_int(settings.get("delivery_base", config.DELIVERY_RATES.get("base", 15000)), 15000)
    delivery_type = data.get("delivery_type") or "delivery"
    payment_method = data.get("payment_method") or "cash"
    delivery_cost_before_promo = delivery_base if delivery_type == "delivery" else 0

    promo_result = {"valid": False, "promo": None, "discount_amount": 0, "delivery_discount": 0, "reason": "", "message": "", "snapshot": {}}
    if promo_code:
        promo_result = await validate_and_apply_promo(
            _safe_int(data.get("user_id"), 0),
            promo_code,
            order_items,
            delivery_type,
            payment_method,
            subtotal,
            delivery_cost_before_promo,
        )
        if strict_promo and not promo_result["valid"]:
            raise ValueError(promo_result["message"])

    discount = promo_result["discount_amount"] if promo_result["valid"] else 0
    delivery_discount = promo_result["delivery_discount"] if promo_result["valid"] else 0
    subtotal_after_discount = max(0, subtotal - discount)
    delivery_cost = max(0, delivery_cost_before_promo - delivery_discount)

    min_order = _safe_int(settings.get("min_order", "0"), 0)
    if min_order and subtotal_after_discount < min_order:
        raise ValueError(f"Minimal buyurtma summasi {min_order} so'm")

    total = subtotal_after_discount + delivery_cost
    return order_items, total, _public_promo(promo_result.get("promo")) if promo_result.get("valid") else {}, {
        "subtotal": subtotal,
        "discount": discount,
        "discount_amount": discount,
        "subtotal_after_discount": subtotal_after_discount,
        "subtotal_before_promo": subtotal,
        "delivery_cost": delivery_cost,
        "delivery_cost_before_promo": delivery_cost_before_promo,
        "delivery_discount": delivery_discount,
        "promo": promo_code if promo_result.get("valid") else "",
        "promo_valid": bool(promo_result.get("valid")),
        "promo_message": promo_result.get("message", ""),
        "promo_reason": promo_result.get("reason", ""),
        "promo_snapshot": promo_result.get("snapshot") or {},
        "promo_id": promo_result.get("promo", {}).get("id") if promo_result.get("promo") else 0,
        "offer_type": (promo_result.get("promo") or {}).get("promo_type", ""),
        "delivery_eta_hours": _safe_int(settings.get("delivery_eta_hours", "24"), 24),
    }


async def _calculate_order_payload(data):
    return await calculate_order_pricing(data, strict_promo=True)


def _fmt(n):
    return f"{int(n or 0):,}".replace(",", " ")


def _order_items_text(items):
    rows = []
    for idx, item in enumerate(items, 1):
        line_total = _safe_int(item.get("line_total"), int(item.get("price", 0)) * int(item.get("quantity", 0)))
        qty_text = item.get("quantity", 0)
        if item.get("charged_quantity") and item.get("charged_quantity") != item.get("quantity"):
            qty_text = f"{item.get('quantity', 0)} ({item.get('charged_quantity')} paid)"
        rows.append(
            f"{idx}. {item.get('name', '-')}\n"
            f"   {qty_text} x {_fmt(item.get('price', 0))} = {_fmt(line_total)} so'm"
        )
    return "\n".join(rows) or "-"


async def _order_receipt_text(code, user, items, total, delivery_type, payment_method, address, phone="", comment="", details=None, admin=False):
    details = details or {}
    name = " ".join([str(user.get("first_name") or "").strip(), str(user.get("last_name") or "").strip()]).strip() if user else ""
    uid = user.get("id") if user else "-"
    customer = f"<a href='tg://user?id={uid}'>{name or 'Mijoz'}</a> (ID: {uid})" if admin and uid != "-" else f"{name or 'Mijoz'} (ID: {uid})"
    subtotal = details.get("subtotal", sum(int(i.get("price", 0)) * int(i.get("quantity", 0)) for i in items))
    delivery_cost = details.get("delivery_cost", 0)
    discount = details.get("discount", 0)
    promo = details.get("promo", "")
    delivery_text = "Bepul" if not delivery_cost else f"{_fmt(delivery_cost)} so'm"
    return await bot_texts.render(
        "order_receipt",
        title="Yangi buyurtma" if admin else "Buyurtma cheki",
        order_code=code,
        customer=customer,
        payment=PM_MAP.get(payment_method, payment_method),
        delivery=DT_MAP.get(delivery_type, delivery_type),
        phone_line=f"\nTelefon: {phone}" if phone else "",
        address_line=f"\nManzil: {address}" if address else "",
        maps_line=f"\nXarita: <a href='{details['maps_url']}'>Google Maps orqali ochish</a>" if admin and details.get("maps_url") else "",
        comment_line=f"\nIzoh: {comment}" if comment else "",
        items_text=_order_items_text(items),
        subtotal=_fmt(subtotal),
        discount_line=f"\nChegirma: -{_fmt(discount)} so'm" if discount else "",
        promo_line=f"\nPromo: {promo}" if promo else "",
        delivery_cost=delivery_text,
        eta_line=f"\nTaxminiy yetkazish vaqti: {details['delivery_eta_hours']} soat" if details.get("delivery_eta_hours") else "",
        total=_fmt(total),
    )


def _order_actions_markup(oid):
    return InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(text="Tasdiqlash", callback_data=f"adm_os_{oid}_confirmed"),
        InlineKeyboardButton(text="Bekor qilish", callback_data=f"adm_os_{oid}_cancelled"),
    ]])


async def _notify_admins(bot, text, oid):
    try:
        users = await database.get_all_users()
    except Exception:
        users = []
    admin_ids = [int(u["id"]) for u in users if u["role"] in ("admin", "owner")]
    for admin_id in admin_ids:
        try:
            await bot.send_message(admin_id, text, reply_markup=_order_actions_markup(oid), parse_mode="HTML")
        except Exception:
            pass


def _csv_or_list(value, as_int=False):
    if isinstance(value, str):
        items = [x.strip() for x in value.split(",") if x.strip()]
    elif isinstance(value, list):
        items = value
    else:
        items = []
    if as_int:
        return [max(0, _safe_int(x, 0)) for x in items if _safe_int(x, 0) > 0]
    return [str(x).strip() for x in items if str(x).strip()]


def _sanitize_promo_payload(data):
    code = _normalize_promo_code(data.get("code", ""))
    promo_type = str(data.get("promo_type") or data.get("type") or "").strip()
    if promo_type not in ("percent", "fixed_amount", "free_delivery"):
        raise ValueError("Promo type is invalid")
    discount_value = max(0, _safe_int(data.get("discount_value"), 0))
    if promo_type == "percent":
        if discount_value <= 0 or discount_value > 100:
            raise ValueError("Percent discount must be 1-100")
    elif promo_type == "fixed_amount":
        if discount_value <= 0:
            raise ValueError("Fixed discount must be positive")
    else:
        discount_value = 0

    delivery_types = _csv_or_list(data.get("allowed_delivery_types"))
    payment_methods = _csv_or_list(data.get("allowed_payment_methods"))
    valid_delivery = {"all", "delivery", "pickup"}
    valid_payments = {"all", "cash", "card", "click", "payme", "transfer"}
    delivery_types = [x for x in delivery_types if x in valid_delivery]
    payment_methods = [x for x in payment_methods if x in valid_payments]
    if "all" in delivery_types:
        delivery_types = []
    if "all" in payment_methods:
        payment_methods = []

    per_user_limit = max(0, _safe_int(data.get("per_user_limit"), 0))
    if _safe_bool(data.get("one_per_user")):
        per_user_limit = 1

    return {
        "code": code,
        "title": str(data.get("title") or "").strip()[:120],
        "description": str(data.get("description") or "").strip()[:1000],
        "promo_type": promo_type,
        "discount_value": discount_value,
        "max_discount_amount": max(0, _safe_int(data.get("max_discount_amount"), 0)),
        "min_order_amount": max(0, _safe_int(data.get("min_order_amount"), 0)),
        "starts_at": str(data.get("starts_at") or "").strip()[:32],
        "ends_at": str(data.get("ends_at") or "").strip()[:32],
        "active": 1 if _safe_bool(data.get("active", True)) else 0,
        "total_usage_limit": max(0, _safe_int(data.get("total_usage_limit"), 0)),
        "per_user_limit": per_user_limit,
        "allowed_delivery_types": json.dumps(delivery_types, ensure_ascii=False),
        "allowed_payment_methods": json.dumps(payment_methods, ensure_ascii=False),
        "product_ids": json.dumps(_csv_or_list(data.get("product_ids"), as_int=True), ensure_ascii=False),
        "category_names": json.dumps(_csv_or_list(data.get("category_names")), ensure_ascii=False),
        "first_order_only": 1 if _safe_bool(data.get("first_order_only")) else 0,
        "new_users_only": 1 if _safe_bool(data.get("new_users_only")) else 0,
        "stackable": 1 if _safe_bool(data.get("stackable")) else 0,
        "priority": max(0, _safe_int(data.get("priority"), 100)),
        "metadata": json.dumps(data.get("metadata") if isinstance(data.get("metadata"), dict) else {}, ensure_ascii=False),
    }


def create_api_app(bot: Bot, dp: Dispatcher):
    @web.middleware
    async def db_ready_middleware(request, handler):
        if not request.path.startswith("/api/") or request.path == "/api/health":
            return await handler(request)
        event = request.app.get("db_ready_event")
        if event and not event.is_set():
            try:
                await asyncio.wait_for(asyncio.shield(event.wait()), timeout=60)
            except asyncio.TimeoutError:
                return web.json_response({"error": "Service warming up"}, status=503)
        return await handler(request)

    app = web.Application(middlewares=[db_ready_middleware])
    app["db_ready_event"] = asyncio.Event()

    async def api_health(request):
        return web.json_response({"ok": True})

    async def api_config(request):
        s = await database.get_all_settings()
        promo_rows = [_promo_to_dict(r) for r in await database.get_promo_codes()]
        public_promos = {
            p["code"]: {
                "type": "free_delivery" if p["promo_type"] == "free_delivery" else "product_discount",
                "promo_type": p["promo_type"],
                "discount_percent": p["discount_value"] if p["promo_type"] == "percent" else 0,
                "discount_amount": p["discount_value"] if p["promo_type"] == "fixed_amount" else 0,
                "product_ids": p.get("product_ids") or [],
                "category_names": p.get("category_names") or [],
                "label": p.get("title") or p["code"],
                "active": p.get("active") and p.get("status") == "active",
                "min_order": p.get("min_order_amount", 0),
            }
            for p in promo_rows
            if p and p.get("active") and p.get("status") == "active"
        }
        store_name = s.get("store_name", config.STORE_NAME)
        store_welcome = s.get("store_welcome", config.STORE_WELCOME)
        market_settings, home_settings = _sync_brand_content(
            store_name,
            store_welcome,
            _merge_dict(config.MARKET_SETTINGS, s.get("market_settings", "")),
            _merge_dict(config.HOME_SETTINGS, s.get("home_settings", "")),
        )
        return web.json_response({
            "branches": _safe_json(s.get("branches", ""), config.BRANCH_ADDRESSES),
            "banners": [dict(r) for r in await database.get_banners(active_only=True)],
            "delivery_rates": {"base": _safe_int(s.get("delivery_base"), config.DELIVERY_RATES.get("base", 15000))},
            "map_center": _safe_json(s.get("map_center", ""), config.DEFAULT_MAP_CENTER),
            "map_zoom": _safe_int(s.get("map_zoom"), config.DEFAULT_MAP_ZOOM),
            "categories": _safe_json(s.get("categories", ""), config.DEFAULT_CATEGORIES),
            "promo_codes": public_promos,
            "referral_offers": _safe_json(s.get("referral_offers", ""), config.REFERRAL_OFFERS),
            "theme": _theme_config(s.get("theme", "")),
            "market_settings": market_settings,
            "home_settings": home_settings,
            "product_card_settings": _merge_dict(config.PRODUCT_CARD_SETTINGS, s.get("product_card_settings", "")),
            "system_messages": _merge_dict(config.SYSTEM_MESSAGES, s.get("system_messages", "")),
            "seo": _merge_dict(config.SEO, s.get("seo", "")),
            "navigation": _safe_json(s.get("navigation", ""), config.NAVIGATION),
            "page_sections": _safe_json(s.get("page_sections", ""), config.PAGE_SECTIONS),
            "footer": _safe_json(s.get("footer", ""), config.FOOTER),
            "store_name": store_name,
            "store_welcome": store_welcome,
            "store_button": s.get("store_button", config.STORE_BUTTON),
            "delivery_mode": s.get("delivery_mode", "all"),
            "delivery_eta_hours": _safe_int(s.get("delivery_eta_hours", "24"), 24),
            "min_order": _safe_int(s.get("min_order", "0"), 0),
            "maintenance_enabled": s.get("maintenance_enabled", "0"),
            "maintenance_text": s.get(
                "maintenance_text",
                "Hozir texnik ishlar olib borilmoqda. Iltimos, keyinroq urinib ko'ring.",
            ),
        })

    async def api_products(request):
        include_inactive = request.query.get("all") == "1" and await require_role(request, ["admin", "owner"])
        return web.json_response([dict(r) for r in await database.get_products(active_only=not include_inactive)])

    async def api_settings(request):
        if request.method == "POST":
            if not await require_role(request, ["owner"]):
                return web.json_response({"error": "Forbidden"}, status=403)
            d = await request.json()
            store_name = str(d.get("store_name") or config.STORE_NAME).strip()
            store_welcome = str(d.get("store_welcome") or config.STORE_WELCOME).strip()
            market_settings, home_settings = _sync_brand_content(
                store_name,
                store_welcome,
                _json_dict(d.get("market_settings")),
                _json_dict(d.get("home_settings")),
            )
            d["store_name"] = store_name
            d["store_welcome"] = store_welcome
            d["market_settings"] = market_settings
            d["home_settings"] = home_settings
            for k, v in d.items():
                if k == "user_id":
                    continue
                if isinstance(v, (dict, list)):
                    v = json.dumps(v, ensure_ascii=False)
                await database.set_setting(k, str(v))
            try:
                store_name = await database.get_setting("store_name", config.STORE_NAME)
                if config.WEBAPP_URL:
                    await bot.set_chat_menu_button(
                        menu_button=MenuButtonWebApp(
                            text=store_name,
                            web_app=WebAppInfo(url=config.WEBAPP_URL),
                        )
                    )
            except Exception:
                pass
            return web.json_response({"success": True})
        settings = await database.get_all_settings()
        settings.pop("promo_codes", None)
        settings["bot_messages"] = json.dumps(
            _merge_dict(config.BOT_MESSAGES, settings.get("bot_messages", "")),
            ensure_ascii=False,
        )
        if not await require_role(request, ["admin", "owner"]):
            settings.pop("card_number", None)
            settings.pop("card_holder", None)
        return web.json_response(settings)

    async def api_user(request):
        if request.method == "POST":
            d = await request.json()
            uid = d["user_id"]
            await database.ensure_user(uid, d.get("first_name", ""), d.get("last_name", ""))
            if "first_name" in d or "last_name" in d:
                await database.update_user_name(uid, d.get("first_name", ""), d.get("last_name", ""))
            if "phone" in d:
                await database.update_user_phone(uid, d.get("phone", ""))
            return web.json_response({"success": True})
        uid = int(request.query.get("user_id", 0))
        if uid:
            await database.ensure_user(
                uid,
                request.query.get("first_name", ""),
                request.query.get("last_name", ""),
            )
        u = await database.get_user(uid)
        return web.json_response(dict(u) if u else {})

    async def api_orders(request):
        uid = int(request.query.get("user_id", 0))
        return web.json_response([dict(r) for r in await database.get_orders(uid)])

    async def api_order(request):
        d = await request.json()
        await database.ensure_user(
            d["user_id"],
            d.get("first_name", ""),
            d.get("last_name", ""),
        )
        try:
            items, total, applied_offer, price_details = await _calculate_order_payload(d)
        except ValueError as e:
            return web.json_response({"success": False, "error": str(e)}, status=400)

        addr = d.get("address", "")
        phone = d.get("phone", "Kiritilmagan")
        comment = d.get("comment", "Yo'q")
        coords = d.get("coords")

        full_addr = addr
        maps_url = ""
        if coords and isinstance(coords, list) and len(coords) == 2:
            lat, lon = coords[0], coords[1]
            maps_url = f"https://maps.google.com/?q={lat},{lon}"
            full_addr += f"\n <a href='{maps_url}'>Google Maps orqali ko'rish</a>"

        if phone or comment:
            full_addr += f"\n Tel: {phone}"
            if comment:
                full_addr += f"\n Izoh: {comment}"

        oid, code = await database.create_order(
            d["user_id"], items, d["delivery_type"], total, d["payment_method"], full_addr,
            phone=phone,
            comment=comment if comment != "Yo'q" else "",
            subtotal=price_details["subtotal_before_promo"],
            delivery_cost=price_details["delivery_cost"],
            promo=price_details["promo"],
            discount_amount=price_details["discount_amount"],
            promo_snapshot=price_details["promo_snapshot"],
        )
        if price_details.get("promo_valid") and price_details.get("promo_snapshot"):
            await database.create_promo_redemption(
                price_details["promo_snapshot"],
                d["user_id"],
                oid,
                price_details["discount_amount"],
                price_details["subtotal_before_promo"],
                total,
            )
        if phone and phone != "Kiritilmagan":
            await database.update_user_phone(d["user_id"], phone)
        if addr and d["delivery_type"] == "delivery":
            await database.update_user_address(d["user_id"], addr)

        if d["payment_method"] == "card":
            await database.update_order_status(oid, "tekshirilmoqda")
            settings = await database.get_all_settings()
            card_number = settings.get("card_number", config.CARD_NUMBER)
            card_holder = settings.get("card_holder", config.CARD_HOLDER)
            user = await database.get_user(d["user_id"])
            state = FSMContext(
                storage=dp.storage,
                key=StorageKey(bot_id=bot.id, chat_id=d["user_id"], user_id=d["user_id"]),
            )
            await state.set_state(OrderState.waiting_for_receipt)
            await state.update_data(receipt_oid=oid)
            clean_comment = comment if comment != "Yo'q" else ""
            price_details["maps_url"] = maps_url

            order_text = await _order_receipt_text(
                code,
                dict(user) if user else {"id": d["user_id"]},
                items,
                total,
                d["delivery_type"],
                d["payment_method"],
                addr,
                phone,
                clean_comment,
                price_details,
            )
            msg = await bot_texts.render(
                "payment_instruction",
                order_code=code,
                total=_fmt(total),
                card_number=card_number,
                card_holder=card_holder,
                order_text=order_text,
            )
            try:
                await bot.send_message(d["user_id"], msg, parse_mode="HTML")
            except Exception:
                pass
            admin_msg = await _order_receipt_text(code, dict(user) if user else {"id": d["user_id"]}, items, total, d["delivery_type"], d["payment_method"], addr, phone, clean_comment, price_details, admin=True)
            await _notify_admins(bot, admin_msg, oid)
        else:
            user = await database.get_user(d["user_id"])
            price_details["maps_url"] = maps_url
            msg = await _order_receipt_text(code, dict(user) if user else {"id": d["user_id"]}, items, total, d["delivery_type"], d["payment_method"], addr, phone, comment if comment != "Yo'q" else "", price_details, admin=True)
            await _notify_admins(bot, msg, oid)
            try:
                await bot.send_message(
                    d["user_id"],
                    await bot_texts.render(
                        "order_created_customer",
                        order_code=code,
                        total=_fmt(total),
                        payment=PM_MAP.get(d["payment_method"], d["payment_method"]),
                        delivery=DT_MAP.get(d["delivery_type"], d["delivery_type"]),
                        eta_hours=price_details.get("delivery_eta_hours", 24),
                    ),
                    parse_mode="HTML",
                )
            except Exception:
                pass

        return web.json_response({
            "success": True,
            "order_id": oid,
            "order_code": code,
            "total": total,
            "offer": applied_offer,
            "discount_amount": price_details["discount_amount"],
            "promo": price_details["promo"],
            "price_details": price_details,
        })

    async def require_role(request, roles=None):
        if roles is None:
            roles = ["admin", "owner"]
        try:
            uid = int(request.query.get("user_id") or (await request.json()).get("user_id", 0))
        except Exception:
            return False
        u = await database.get_user(uid)
        return u and dict(u).get("role", "user") in roles

    async def current_admin(request):
        try:
            uid = int(request.query.get("user_id") or (await request.json()).get("user_id", 0))
        except Exception:
            return None
        u = await database.get_user(uid)
        return dict(u) if u else None

    async def api_admin_promocodes(request):
        if not await require_role(request, ["admin", "owner"]):
            return web.json_response({"error": "Forbidden"}, status=403)
        promos = [_promo_to_dict(r) for r in await database.get_promo_codes()]
        return web.json_response(promos)

    async def api_admin_promocode_get(request):
        if not await require_role(request, ["admin", "owner"]):
            return web.json_response({"error": "Forbidden"}, status=403)
        promo = _promo_to_dict(await database.get_promo_code(_safe_int(request.match_info.get("id"), 0)))
        if not promo or promo.get("deleted_at"):
            return web.json_response({"error": "Not found"}, status=404)
        return web.json_response({"promo": promo})

    async def api_admin_promocode_save(request):
        if not await require_role(request, ["admin", "owner"]):
            return web.json_response({"error": "Forbidden"}, status=403)
        data = await request.json()
        try:
            payload = _sanitize_promo_payload(data)
        except ValueError as e:
            return web.json_response({"success": False, "error": str(e)}, status=400)
        pid = _safe_int(data.get("id"), 0)
        try:
            saved = await database.save_promo_code(payload, pid=pid)
        except Exception as e:
            message = "Promocode already exists" if "UNIQUE" in str(e).upper() else "Could not save promocode"
            return web.json_response({"success": False, "error": message}, status=400)
        return web.json_response({"success": True, "promo": _promo_to_dict(saved)})

    async def api_admin_promocode_delete(request):
        if not await require_role(request, ["admin", "owner"]):
            return web.json_response({"error": "Forbidden"}, status=403)
        ok = await database.soft_delete_promo_code(_safe_int(request.match_info.get("id"), 0))
        return web.json_response({"success": bool(ok)})

    async def api_admin_promocode_toggle(request):
        if not await require_role(request, ["admin", "owner"]):
            return web.json_response({"error": "Forbidden"}, status=403)
        data = await request.json()
        ok = await database.toggle_promo_code(_safe_int(request.match_info.get("id"), 0), _safe_bool(data.get("active")))
        return web.json_response({"success": bool(ok)})

    async def api_promocode_validate(request):
        data = await request.json()
        try:
            items, total, _offer, details = await calculate_order_pricing(data, strict_promo=False)
        except ValueError as e:
            return web.json_response({"valid": False, "error": str(e), "reason": "cart"}, status=400)
        if not str(data.get("promo") or data.get("code") or "").strip():
            return web.json_response({"valid": False, "error": "Промокод не найден", "reason": "not_found"})
        if data.get("code") and not data.get("promo"):
            data["promo"] = data.get("code")
            try:
                items, total, _offer, details = await calculate_order_pricing(data, strict_promo=False)
            except ValueError as e:
                return web.json_response({"valid": False, "error": str(e), "reason": "cart"}, status=400)
        if not details.get("promo_valid"):
            return web.json_response({
                "valid": False,
                "error": details.get("promo_message") or "Промокод не найден",
                "reason": details.get("promo_reason") or "not_found",
            })
        return web.json_response({
            "valid": True,
            "promo": _public_promo(details.get("promo_snapshot")),
            "discount_amount": details["discount_amount"],
            "subtotal": details["subtotal"],
            "delivery_cost": details["delivery_cost"],
            "total": total,
            "message": details.get("promo_message") or "Promokod qo'llandi",
        })

    async def api_order_quote(request):
        data = await request.json()
        try:
            items, total, _offer, details = await calculate_order_pricing(data, strict_promo=False)
        except ValueError as e:
            return web.json_response({"success": False, "error": str(e)}, status=400)
        return web.json_response({
            "success": True,
            "items": items,
            "subtotal": details["subtotal"],
            "discount_amount": details["discount_amount"],
            "delivery_cost": details["delivery_cost"],
            "delivery_discount": details["delivery_discount"],
            "total": total,
            "promo": details["promo"],
            "promo_valid": details["promo_valid"],
            "promo_message": details.get("promo_message", ""),
            "promo_reason": details.get("promo_reason", ""),
            "price_details": details,
        })

    async def api_admin_customers(request):
        admin = await current_admin(request)
        role = admin.get("role") if admin else "user"
        if role == "deliver":
            return web.json_response({"error": "Access denied"}, status=403)
        if role not in ("owner", "admin"):
            return web.json_response({"error": "Forbidden"}, status=403)

        query = str(request.query.get("q", "")).strip().lower()
        phone = str(request.query.get("phone", "")).strip().lower()
        telegram_id = str(request.query.get("telegram_id", "")).strip()
        sort = request.query.get("sort", "activity")
        min_orders = _safe_int(request.query.get("min_orders"), 0)
        min_total = _safe_int(request.query.get("min_total"), 0)

        if role == "admin" and not (phone or telegram_id or query):
            return web.json_response({"mode": "search_only", "customers": []})

        users = [dict(u) for u in await database.get_all_users()]
        orders = [_order_dict(o) for o in await database.get_all_orders()]
        orders_by_user = {}
        for order in orders:
            orders_by_user.setdefault(order.get("user_id"), []).append(order)

        customers = []
        for user in users:
            summary = _customer_summary(user, orders_by_user.get(user.get("id"), []))
            haystack = " ".join([
                summary["name"], summary["phone"], str(summary["id"]), str(summary["telegram_id"])
            ]).lower()
            if query:
                if role == "admin":
                    admin_haystack = " ".join([summary["phone"], str(summary["telegram_id"])]).lower()
                    if query not in admin_haystack:
                        continue
                elif query not in haystack:
                    continue
            if phone and phone not in summary["phone"].lower():
                continue
            if telegram_id and telegram_id != str(summary["telegram_id"]):
                continue
            if summary["orders_count"] < min_orders:
                continue
            if summary["total_spent"] < min_total:
                continue
            if role == "admin" and not (phone or telegram_id or query):
                continue
            customers.append(summary)

        if sort == "total":
            customers.sort(key=lambda c: c["total_spent"], reverse=True)
        elif sort == "orders":
            customers.sort(key=lambda c: c["orders_count"], reverse=True)
        elif sort == "registered":
            customers.sort(key=lambda c: c["id"], reverse=True)
        else:
            customers.sort(key=lambda c: c["last_activity"] or "", reverse=True)

        return web.json_response({
            "mode": "full" if role == "owner" else "search_only",
            "customers": customers[:300],
        })

    async def api_admin_customer_profile(request):
        admin = await current_admin(request)
        role = admin.get("role") if admin else "user"
        if role == "deliver":
            return web.json_response({"error": "Access denied"}, status=403)
        if role not in ("owner", "admin"):
            return web.json_response({"error": "Forbidden"}, status=403)

        target_uid = _safe_int(request.match_info.get("uid"), 0)
        user = await database.get_user(target_uid)
        if not user:
            return web.json_response({"error": "Not found"}, status=404)
        if role == "admin":
            query = str(request.query.get("q", "")).strip().lower()
            phone = str(request.query.get("phone", "")).strip().lower()
            telegram_id = str(request.query.get("telegram_id", "")).strip()
            user_dict = dict(user)
            allowed_haystack = " ".join([str(user_dict.get("phone") or "").lower(), str(user_dict.get("id") or "")])
            if not ((query and query in allowed_haystack) or (phone and phone in allowed_haystack) or (telegram_id and telegram_id == str(user_dict.get("id")))):
                return web.json_response({"error": "Search required"}, status=403)
        orders = [_order_dict(o) for o in await database.get_orders(target_uid)]
        profile = _customer_summary(dict(user), orders)
        profile["orders"] = orders
        profile["receipts"] = orders
        return web.json_response(profile)

    async def api_admin_receipts(request):
        if not await require_role(request, ["owner", "admin"]):
            return web.json_response({"error": "Forbidden"}, status=403)
        users_by_id = {u["id"]: dict(u) for u in await database.get_all_users()}
        orders = [_attach_customer(_order_dict(o), users_by_id) for o in await database.get_all_orders()]
        q = str(request.query.get("q", "")).strip().lower()
        status = request.query.get("status", "")
        payment = request.query.get("payment_method", "")
        delivery = request.query.get("delivery_type", "")
        uid = request.query.get("client_id", request.query.get("target_user_id", ""))
        phone = request.query.get("phone", "").lower()
        total_from = _safe_int(request.query.get("total_from"), 0)
        total_to = _safe_int(request.query.get("total_to"), 0)
        admin_name = request.query.get("admin", "").lower()
        courier_name = request.query.get("courier", "").lower()
        date_from = request.query.get("date_from", "")
        date_to = request.query.get("date_to", "")
        sort = request.query.get("sort", "date_desc")

        def keep(o):
            hay = " ".join([str(o.get("id")), str(o.get("code")), str(o.get("receipt_id")), str(o.get("user_id")), str(o.get("phone"))]).lower()
            if q and q not in hay:
                return False
            if status and o.get("status") != status:
                return False
            if payment and o.get("payment_method") != payment:
                return False
            if delivery and o.get("delivery_type") != delivery:
                return False
            if uid and uid != str(o.get("user_id")):
                return False
            if phone and phone not in str(o.get("phone", "")).lower():
                return False
            if admin_name and admin_name not in str(o.get("admin_name", "")).lower():
                return False
            if courier_name and courier_name not in str(o.get("courier_name", "")).lower():
                return False
            total = _safe_int(o.get("total_price"), 0)
            if total_from and total < total_from:
                return False
            if total_to and total > total_to:
                return False
            created = str(o.get("created_at") or "")[:10]
            if date_from and created < date_from:
                return False
            if date_to and created > date_to:
                return False
            return True

        receipts = [o for o in orders if keep(o)]
        if sort == "sum_desc":
            receipts.sort(key=lambda o: _safe_int(o.get("total_price"), 0), reverse=True)
        elif sort == "sum_asc":
            receipts.sort(key=lambda o: _safe_int(o.get("total_price"), 0))
        elif sort == "date_asc":
            receipts.sort(key=lambda o: o.get("created_at") or "")
        else:
            receipts.sort(key=lambda o: o.get("created_at") or "", reverse=True)
        total_sum = sum(_safe_int(o.get("total_price"), 0) for o in receipts)
        return web.json_response({
            "receipts": receipts[:500],
            "summary": {
                "count": len(receipts),
                "total": total_sum,
                "avg": round(total_sum / len(receipts)) if receipts else 0,
            }
        })

    async def api_admin_users(request):
        if not await require_role(request, ["owner"]):
            return web.json_response({"error": "Forbidden"}, status=403)
        return web.json_response([dict(r) for r in await database.get_all_users()])

    async def api_admin_set_role(request):
        if not await require_role(request, ["owner"]):
            return web.json_response({"error": "Forbidden"}, status=403)
        d = await request.json()
        await database.update_user_role(d["target_uid"], d["role"])
        return web.json_response({"success": True})

    async def api_admin_update_user(request):
        if not await require_role(request, ["owner"]):
            return web.json_response({"error": "Forbidden"}, status=403)
        d = await request.json()
        target_uid = int(d.get("target_uid", 0))
        role = d.get("role")
        if role not in ("user", "deliver", "admin", "owner"):
            role = None
        await database.update_user_admin_profile(
            target_uid,
            first_name=d.get("first_name"),
            last_name=d.get("last_name"),
            phone=d.get("phone"),
            role=role,
            client_status=d.get("client_status"),
        )
        new_password = str(d.get("admin_password", "") or "")
        if new_password:
            if role not in ("admin", "deliver"):
                return web.json_response({"success": False, "error": "Password is only for admins and couriers"}, status=400)
            if len(new_password) < 6:
                return web.json_response({"success": False, "error": "Password must be at least 6 characters"}, status=400)
            await database.update_user_admin_password(target_uid, new_password)
        return web.json_response({"success": True})

    async def api_admin_staff_password(request):
        if not await require_role(request, ["owner"]):
            return web.json_response({"error": "Forbidden"}, status=403)
        d = await request.json()
        target_uid = int(d.get("target_uid", 0))
        u = await database.get_user(target_uid)
        if not u or u["role"] not in ("admin", "deliver"):
            return web.json_response({"success": False, "error": "Only admins and couriers can have separate passwords"}, status=400)
        await database.update_user_admin_password(target_uid, d.get("password", ""))
        return web.json_response({"success": True})

    async def api_admin_banners(request):
        if request.method == "GET":
            if not await require_role(request, ["admin", "owner"]):
                return web.json_response({"error": "Forbidden"}, status=403)
            return web.json_response([dict(r) for r in await database.get_banners(active_only=False)])
        if not await require_role(request, ["admin", "owner"]):
            return web.json_response({"error": "Forbidden"}, status=403)
        d = await request.json()
        if request.method == "DELETE":
            await database.delete_banner(int(d.get("id", 0)))
            return web.json_response({"success": True})
        bid = int(d.get("id", 0) or 0)
        payload = {}
        for key in ("image", "title", "subtitle", "action_text", "target"):
            if key in d:
                payload[key] = str(d.get(key) or "")
        if "sort_order" in d:
            payload["sort_order"] = int(d.get("sort_order", 0) or 0)
        if "interval_ms" in d:
            payload["interval_ms"] = int(d.get("interval_ms", 4500) or 4500)
        if "active" in d:
            payload["active"] = int(d.get("active", 1) or 0)
        if bid:
            if not payload.get("image"):
                payload.pop("image", None)
            await database.update_banner(bid, **payload)
            return web.json_response({"success": True, "id": bid})
        if not payload.get("image"):
            return web.json_response({"success": False, "error": "Image is required"}, status=400)
        payload.setdefault("title", "")
        payload.setdefault("subtitle", "")
        payload.setdefault("action_text", "")
        payload.setdefault("target", "")
        payload.setdefault("interval_ms", 4500)
        payload.setdefault("active", 1)
        bid = await database.add_banner(**payload)
        return web.json_response({"success": True, "id": bid})

    async def api_admin_all_orders(request):
        if not await require_role(request, ["admin", "owner", "deliver"]):
            return web.json_response({"error": "Forbidden"}, status=403)
        users_by_id = {u["id"]: dict(u) for u in await database.get_all_users()}
        orders = [_attach_customer(_order_dict(o), users_by_id) for o in await database.get_all_orders()]
        return web.json_response(orders)

    async def api_admin_product(request):
        if not await require_role(request, ["admin", "owner"]):
            return web.json_response({"error": "Forbidden"}, status=403)
        d = await request.json()
        extended_fields = {
            "old_price": lambda v: int(v or 0),
            "badges": lambda v: v or "[]",
            "tags": lambda v: v or "[]",
            "collection": lambda v: v or "",
            "featured": lambda v: int(v or 0),
            "bestseller": lambda v: int(v or 0),
            "is_new": lambda v: int(v or 0),
            "limited": lambda v: int(v or 0),
        }
        if request.method == "DELETE":
            await database.delete_product(d["id"])
        else:
            if d.get("id"):
                kwargs = {}
                if "name" in d:
                    kwargs["name"] = d.get("name", "")
                if "price" in d:
                    kwargs["price"] = int(d.get("price", 0))
                if "active" in d:
                    kwargs["active"] = int(d.get("active", 1))
                if "discount_percent" in d:
                    kwargs["discount_percent"] = int(d.get("discount_percent", 0))
                if "is_bogo" in d:
                    kwargs["is_bogo"] = int(d.get("is_bogo", 0))
                if "category" in d:
                    kwargs["category"] = d.get("category", "Barchasi")
                if "description" in d:
                    kwargs["description"] = d.get("description", "")
                if "stock" in d:
                    kwargs["stock"] = int(d.get("stock", -1))
                if "image" in d:
                    kwargs["image"] = d.get("image", "")
                if "variants" in d:
                    kwargs["variants"] = d.get("variants", "[]")
                if "sku" in d:
                    kwargs["sku"] = d.get("sku", "")
                if "keywords" in d:
                    kwargs["keywords"] = d.get("keywords", "")
                for field, normalizer in extended_fields.items():
                    if field in d:
                        kwargs[field] = normalizer(d.get(field))
                await database.update_product(d["id"], **kwargs)
            else:
                kwargs = {
                    "name": d.get("name", ""),
                    "price": int(d.get("price", 0)),
                    "active": int(d.get("active", 1)),
                    "discount_percent": int(d.get("discount_percent", 0)),
                    "is_bogo": int(d.get("is_bogo", 0)),
                    "category": d.get("category", "Barchasi"),
                    "description": d.get("description", ""),
                    "stock": int(d.get("stock", -1)),
                    "image": d.get("image", ""),
                    "variants": d.get("variants", "[]"),
                    "sku": d.get("sku", ""),
                    "keywords": d.get("keywords", ""),
                }
                for field, normalizer in extended_fields.items():
                    kwargs[field] = normalizer(d.get(field))
                await database.add_product(**kwargs)
        return web.json_response({"success": True})

    async def api_admin_update_order(request):
        if not await require_role(request, ["admin", "owner", "deliver"]):
            return web.json_response({"error": "Forbidden"}, status=403)
        d = await request.json()
        oid, st = d["order_id"], d["status"]

        uid = int(d.get("user_id", 0))
        u = await database.get_user(uid)
        admin_name = f"{u['first_name']} {u['last_name']}".strip() if u else "Admin"
        if not admin_name:
            admin_name = "Admin"

        if st == "confirmed":
            await database.update_order_status(oid, st, admin_name=admin_name)
            o = await database.get_order(oid)
            if o:
                order_label = o["code"] or str(oid)
                try:
                    await bot.send_message(
                        o["user_id"],
                        await bot_texts.render("order_confirmed_customer", order_code=order_label),
                        parse_mode="HTML",
                    )
                except Exception:
                    pass
        elif st == "cancelled":
            reason = d.get("reject_reason", "Sabab ko'rsatilmadi")
            await database.update_order_status(oid, st, admin_name=admin_name, reject_reason=reason)
            o = await database.get_order(oid)
            if o:
                order_label = o["code"] or str(oid)
                try:
                    await bot.send_message(
                        o["user_id"],
                        await bot_texts.render("order_cancelled_customer", order_code=order_label, reason=reason),
                        parse_mode="HTML",
                    )
                except Exception:
                    pass
        else:
            await database.update_order_status(oid, st)

        if st in ("cancelled", "rejected", "failed", "fully_cancelled"):
            await database.cancel_promo_redemption_for_order(oid)

        return web.json_response({"success": True})

    async def api_admin_delete_order(request):
        if not await require_role(request, ["owner"]):
            return web.json_response({"error": "Forbidden"}, status=403)
        d = await request.json()
        oid = int(d.get("order_id", 0))
        if not oid:
            return web.json_response({"success": False, "error": "Order id is required"}, status=400)
        deleted = await database.delete_order(oid)
        return web.json_response({"success": deleted})

    async def api_admin_login(request):
        d = await request.json()
        pwd = d.get("password", "")
        uid = d.get("user_id", 0)
        device = request.headers.get("User-Agent", "Unknown")[:250]

        real_pwd = await database.get_login_password(uid)
        success = 1 if pwd == real_pwd else 0
        await database.log_admin_access(uid, device, pwd, success)

        if success:
            return web.json_response({"success": True})
        return web.json_response({"success": False, "error": "Xato parol"})

    async def api_admin_security(request):
        if not await require_role(request, ["owner"]):
            return web.json_response({"error": "Forbidden"}, status=403)
        if request.method == "GET":
            logs = await database.get_admin_logs()
            pwd = await database.get_admin_password()
            return web.json_response({"logs": logs, "password": pwd})
        elif request.method == "POST":
            d = await request.json()
            new_pwd = d.get("new_password")
            if new_pwd:
                await database.set_admin_password(new_pwd)
            return web.json_response({"success": True})

    async def api_admin_upload_image(request):
        if not await require_role(request, ["admin", "owner"]):
            return web.json_response({"error": "Forbidden"}, status=403)
        try:
            reader = await request.multipart()
            field = await reader.next()
            if not field:
                return web.json_response({"error": "No file"}, status=400)
            ext = field.filename.rsplit(".", 1)[-1].lower() if "." in (field.filename or "") else "jpg"
            if ext not in ["jpg", "jpeg", "png", "webp", "gif"]:
                ext = "jpg"
            name = f"{uuid.uuid4().hex}.{ext}"
            img_data = await field.read()
            crop_and_save_image(img_data, name)
            return web.json_response({"success": True, "filename": name})
        except Exception as e:
            logger.error("Upload error: %s", e)
            return web.json_response({"error": str(e)}, status=500)

    app.router.add_get("/api/health", api_health)
    app.router.add_get("/api/config", api_config)
    app.router.add_get("/api/products", api_products)
    app.router.add_get("/api/settings", api_settings)
    app.router.add_post("/api/settings", api_settings)
    app.router.add_get("/api/user", api_user)
    app.router.add_post("/api/user", api_user)
    app.router.add_get("/api/orders", api_orders)
    app.router.add_post("/api/order/quote", api_order_quote)
    app.router.add_post("/api/order", api_order)
    app.router.add_post("/api/promocode/validate", api_promocode_validate)
    app.router.add_get("/api/admin/users", api_admin_users)
    app.router.add_get("/api/admin/promocodes", api_admin_promocodes)
    app.router.add_get("/api/admin/promocode/{id}", api_admin_promocode_get)
    app.router.add_post("/api/admin/promocode", api_admin_promocode_save)
    app.router.add_delete("/api/admin/promocode/{id}", api_admin_promocode_delete)
    app.router.add_post("/api/admin/promocode/{id}/toggle", api_admin_promocode_toggle)
    app.router.add_get("/api/admin/customers", api_admin_customers)
    app.router.add_get("/api/admin/customer/{uid}", api_admin_customer_profile)
    app.router.add_get("/api/admin/receipts", api_admin_receipts)
    app.router.add_post("/api/admin/set_role", api_admin_set_role)
    app.router.add_post("/api/admin/update_user", api_admin_update_user)
    app.router.add_post("/api/admin/staff_password", api_admin_staff_password)
    app.router.add_get("/api/admin/orders", api_admin_all_orders)
    app.router.add_post("/api/admin/update_order", api_admin_update_order)
    app.router.add_delete("/api/admin/order", api_admin_delete_order)
    app.router.add_post("/api/admin/product", api_admin_product)
    app.router.add_delete("/api/admin/product", api_admin_product)
    app.router.add_post("/api/admin/login", api_admin_login)
    app.router.add_get("/api/admin/security", api_admin_security)
    app.router.add_post("/api/admin/security", api_admin_security)
    app.router.add_post("/api/admin/upload_image", api_admin_upload_image)
    app.router.add_get("/api/admin/banners", api_admin_banners)
    app.router.add_post("/api/admin/banners", api_admin_banners)
    app.router.add_delete("/api/admin/banners", api_admin_banners)
    async def index(request):
        return web.FileResponse(os.path.join(config.WEBAPP_DIR, 'index.html'))

    app.router.add_get("/", index)
    app.router.add_static("/uploads", config.UPLOAD_DIR, name="uploads")
    app.router.add_static("/", config.WEBAPP_DIR, name="webapp")

    return app
