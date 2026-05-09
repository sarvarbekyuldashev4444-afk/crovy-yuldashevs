import json
import re
import logging
from aiogram import Router, F
from aiogram.types import (
    Message, InlineKeyboardMarkup, InlineKeyboardButton,
    WebAppInfo, CallbackQuery,
)
from aiogram.filters import CommandStart, Command
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import StatesGroup, State
import config
import database
import bot_texts
from utils import save_photo_cropped, is_admin

logger = logging.getLogger(__name__)
router = Router()


def _fmt(n):
    return f"{int(n or 0):,}".replace(",", " ")


def _items_text(items):
    rows = []
    for idx, item in enumerate(items, 1):
        total = int(item.get("price", 0)) * int(item.get("quantity", 0))
        rows.append(
            f"{idx}. {item.get('name', '-')}\n"
            f"   {item.get('quantity', 0)} x {_fmt(item.get('price', 0))} = {_fmt(total)} so'm"
        )
    return "\n".join(rows) or "-"


def _order_details_text(o, u, title="Buyurtma tafsilotlari"):
    st_map = {
        "pending": "Kutilmoqda", "confirmed": "Tasdiqlandi",
        "cancelled": "Bekor qilindi", "yetkazilmoqda": "Yetkazib berilmoqda",
        "yetkazildi": "Yetkazib berildi", "tekshirilmoqda": "To'lov tekshirilmoqda",
    }
    pm_map = {"cash": "Naqd", "card": "Karta"}
    dt_map = {"delivery": "Yetkazib berish", "pickup": "Olib ketish"}
    items = json.loads(o["items"] or "[]")
    order_label = o["code"] or str(o["id"])
    name = f"{u['first_name']} {u['last_name']}".strip() if u else "Mijoz"
    lines = [
        f"<b>{title}: #{order_label}</b>",
        f"Holati: <b>{st_map.get(o['status'], o['status'])}</b>",
        "",
        f"Mijoz: {name} (ID: {o['user_id']})",
        f"Telefon: {o['phone'] or '-'}",
        f"Yetkazish: {dt_map.get(o['delivery_type'], o['delivery_type'])}",
        f"To'lov: {pm_map.get(o['payment_method'], o['payment_method'])}",
        f"Manzil: {o['address']}",
    ]
    if o["comment"]:
        lines.append(f"Izoh: {o['comment']}")
    lines.extend([
        "",
        "<b>Buyurtma tarkibi:</b>",
        _items_text(items),
        "",
    ])
    if o["subtotal"]:
        lines.append(f"Mahsulotlar: {_fmt(o['subtotal'])} so'm")
    delivery_text = "Bepul" if not o["delivery_cost"] else f"{_fmt(o['delivery_cost'])} so'm"
    lines.append(f"Yetkazish narxi: {delivery_text}")
    if o["promo"]:
        lines.append(f"Promo: {o['promo']}")
    lines.append(f"Jami summa: <b>{_fmt(o['total_price'])} so'm</b>")
    return "\n".join(lines)


class OrderState(StatesGroup):
    waiting_for_location = State()
    waiting_for_receipt = State()


class AdminState(StatesGroup):
    add_name = State()
    add_price = State()
    add_category = State()
    add_discount = State()
    add_bogo = State()
    add_photo = State()
    add_desc = State()
    add_extras = State()
    edit_field = State()
    add_banner = State()


@router.message(CommandStart())
async def start_handler(message: Message, state: FSMContext):
    await state.clear()
    await database.ensure_user(
        message.from_user.id,
        message.from_user.first_name or "",
        message.from_user.last_name or "",
    )
    parts = (message.text or "").split(maxsplit=1)
    if len(parts) == 2 and parts[1].strip():
        await database.update_user_referral(message.from_user.id, parts[1].strip().upper())
    store_button = await database.get_setting("store_button", config.STORE_BUTTON)
    store_name = await database.get_setting("store_name", config.STORE_NAME)
    store_welcome = await database.get_setting("store_welcome", config.STORE_WELCOME)
    markup = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(
            text=store_button,
            web_app=WebAppInfo(url=config.WEBAPP_URL),
        )]
    ])
    welcome = await bot_texts.render("start", store_name=store_name, store_welcome=store_welcome)
    await message.answer(welcome, reply_markup=markup, parse_mode="HTML")


@router.message(F.caption | F.text)
async def auto_parse_product(message: Message, state: FSMContext):
    if not is_admin(message.from_user.id):
        return

    curr_st = await state.get_state()
    if curr_st is not None:
        return

    text = message.caption if message.caption else message.text
    if not text or "Narxlar" not in text:
        return

    lines = text.strip().split("\n")
    name = lines[0].strip()

    desc_lines = []
    variants = []

    parsing_variants = False
    for line in lines[1:]:
        if "Narxlar" in line:
            parsing_variants = True
            continue
        if parsing_variants:
            if any(c in line for c in ["Buyurtma", "Tel:", "http"]):
                break
            if any(c in line for c in ["•", "-", "–"]):
                match = re.search(r"(\d+ml)[^\d]+([\d\.\s]+)", line)
                if match:
                    size = match.group(1)
                    price_str = match.group(2).replace(".", "").replace(" ", "")
                    try:
                        price = int(price_str)
                        variants.append({"size": size, "price": price})
                    except ValueError:
                        pass
        else:
            if line.strip():
                desc_lines.append(line.strip())

    description = "\n".join(desc_lines).strip()

    cat = "Barchasi"
    if "Erkak" in description:
        cat = "Erkaklar"
    if "Ayol" in description:
        cat = "Ayollar"

    image_name = ""
    if message.photo:
        try:
            image_name = await save_photo_cropped(message.bot, message.photo[-1])
        except Exception as e:
            logger.error("Crop photo error: %s", e)

    variants_json = json.dumps(variants)
    base_price = variants[0]["price"] if variants else 0

    pid = await database.add_product(
        name, base_price, cat, description, 0, 0, -1, image_name, variants_json
    )
    await message.answer(
        await bot_texts.render("product_auto_added", name=name, category=cat, variants_count=len(variants)),
        parse_mode="HTML",
    )


@router.message(Command("admin"))
async def admin_cmd(message: Message, state: FSMContext):
    if not is_admin(message.from_user.id):
        return await message.answer(await bot_texts.render("no_permission"))
    await state.clear()
    await show_admin_menu(message)


async def show_admin_menu(target):
    stats = await database.get_order_stats()
    mode = await database.get_setting("delivery_mode", "all")
    mode_text = "Barchasi (Yetkazib berish va Olib ketish)" if mode == "all" else "Faqat yetkazib berish"
    text = await bot_texts.render(
        "admin_menu",
        total_orders=stats["total_orders"],
        pending_orders=stats["pending"],
        total_revenue=_fmt(stats["total_revenue"]),
        mode_text=mode_text,
    )
    kb = InlineKeyboardMarkup(inline_keyboard=[
        [
            InlineKeyboardButton(text="Mahsulotlar ro'yxati", callback_data="adm_products"),
            InlineKeyboardButton(text="Buyurtmalar ro'yxati", callback_data="adm_orders"),
        ],
        [
            InlineKeyboardButton(text="Reklama bannerlari", callback_data="adm_banners"),
            InlineKeyboardButton(text="Ish rejimini o'zgartirish", callback_data="adm_toggle_mode"),
        ],
    ])
    if hasattr(target, "edit_text"):
        try:
            await target.edit_text(text, reply_markup=kb, parse_mode="HTML")
        except Exception:
            await target.answer(text, reply_markup=kb, parse_mode="HTML")
    else:
        await target.answer(text, reply_markup=kb, parse_mode="HTML")


@router.callback_query(F.data == "adm_toggle_mode")
async def toggle_mode(cb: CallbackQuery):
    if not is_admin(cb.from_user.id):
        return await cb.answer(await bot_texts.render("no_permission"))
    cur = await database.get_setting("delivery_mode", "all")
    new = "delivery_only" if cur == "all" else "all"
    await database.set_setting("delivery_mode", new)
    await cb.answer(await bot_texts.render("mode_changed", mode_text="Barchasi" if new == "all" else "Faqat yetkazish"))
    await show_admin_menu(cb.message)


@router.callback_query(F.data == "adm_products")
async def admin_products(cb: CallbackQuery):
    if not is_admin(cb.from_user.id):
        return await cb.answer(await bot_texts.render("no_permission"))
    products = await database.get_products(active_only=False)
    rows = []
    for p in products:
        status = "" if p["active"] else "❌"
        badge = ""
        if p["discount_percent"] > 0:
            badge = f" -{p['discount_percent']}%"
        if p["is_bogo"]:
            badge += " 1+1"
        rows.append([InlineKeyboardButton(
            text=f"{status} {p['name']} - {p['price']} so'm{badge}",
            callback_data=f"adm_ep_{p['id']}",
        )])
    rows.append([InlineKeyboardButton(text="➕ Qo'lda qo'shish", callback_data="adm_add")])
    rows.append([InlineKeyboardButton(text="Asosiy menyu", callback_data="adm_back")])
    await cb.message.edit_text(
        await bot_texts.render("admin_products_title"),
        reply_markup=InlineKeyboardMarkup(inline_keyboard=rows),
        parse_mode="HTML",
    )


@router.callback_query(F.data == "adm_back")
async def admin_back(cb: CallbackQuery):
    await show_admin_menu(cb.message)


@router.callback_query(F.data == "adm_add")
async def admin_add_start(cb: CallbackQuery, state: FSMContext):
    if not is_admin(cb.from_user.id):
        return
    await state.set_state(AdminState.add_name)
    await state.set_data({})
    await cb.message.edit_text(await bot_texts.render("product_add_name"), parse_mode="HTML")
    await cb.answer()


@router.message(AdminState.add_name)
async def admin_add_name(message: Message, state: FSMContext):
    if not is_admin(message.from_user.id):
        return
    await state.update_data(name=message.text.strip())
    await state.set_state(AdminState.add_price)
    await message.answer(await bot_texts.render("product_add_price"), parse_mode="HTML")


@router.message(AdminState.add_price)
async def admin_add_price(message: Message, state: FSMContext):
    if not is_admin(message.from_user.id):
        return
    try:
        price = int(message.text.strip())
    except ValueError:
        return await message.answer(await bot_texts.render("product_add_price_error"))
    await state.update_data(price=price)
    await state.set_state(AdminState.add_category)
    await message.answer(await bot_texts.render("product_add_category"), parse_mode="HTML")


@router.message(AdminState.add_category)
async def admin_add_cat(message: Message, state: FSMContext):
    if not is_admin(message.from_user.id):
        return
    cat = "Barchasi" if message.text.strip() == "/skip" else message.text.strip()
    await state.update_data(category=cat)
    await state.set_state(AdminState.add_discount)
    await message.answer(await bot_texts.render("product_add_discount"), parse_mode="HTML")


@router.message(AdminState.add_discount)
async def admin_add_disc(message: Message, state: FSMContext):
    if not is_admin(message.from_user.id):
        return
    try:
        disc = max(0, min(99, int(message.text.strip())))
    except ValueError:
        return await message.answer(await bot_texts.render("product_add_discount_error"))
    await state.update_data(discount=disc)
    await state.set_state(AdminState.add_bogo)
    kb = InlineKeyboardMarkup(inline_keyboard=[
        [
            InlineKeyboardButton(text="Ha ", callback_data="adm_bogo_1"),
            InlineKeyboardButton(text="Yo'q ❌", callback_data="adm_bogo_0"),
        ]
    ])
    await message.answer(await bot_texts.render("product_add_bogo"), reply_markup=kb, parse_mode="HTML")


@router.callback_query(F.data.startswith("adm_bogo_"))
async def admin_add_bogo(cb: CallbackQuery, state: FSMContext):
    if not is_admin(cb.from_user.id):
        return
    bogo = int(cb.data.split("_")[-1])
    await state.update_data(bogo=bogo)
    await state.set_state(AdminState.add_photo)
    await cb.message.edit_text(await bot_texts.render("product_add_photo"), parse_mode="HTML")
    await cb.answer()


@router.message(AdminState.add_photo)
async def admin_add_photo(message: Message, state: FSMContext):
    if not is_admin(message.from_user.id):
        return
    image_name = ""
    if message.photo:
        try:
            image_name = await save_photo_cropped(message.bot, message.photo[-1])
        except Exception as e:
            logger.error("Save photo fail: %s", e)
    await state.update_data(image=image_name)
    await state.set_state(AdminState.add_desc)
    await message.answer(await bot_texts.render("product_add_desc"), parse_mode="HTML")


@router.message(AdminState.add_desc)
async def admin_add_desc(message: Message, state: FSMContext):
    if not is_admin(message.from_user.id):
        return
    desc = "" if message.text.strip() == "/skip" else message.text.strip()
    await state.update_data(description=desc)
    await state.set_state(AdminState.add_extras)
    await message.answer(
        await bot_texts.render("product_add_variants"),
        parse_mode="HTML",
    )


@router.message(AdminState.add_extras)
async def admin_add_extras(message: Message, state: FSMContext):
    if not is_admin(message.from_user.id):
        return
    variants_json = "[]"
    if message.text.strip() != "/skip":
        try:
            v_list = []
            for part in message.text.split(","):
                size, price = part.split("-")
                v_list.append({"size": size.strip(), "price": int(price.strip())})
            variants_json = json.dumps(v_list)
        except Exception:
            return await message.answer(await bot_texts.render("product_add_variants_error"), parse_mode="HTML")

    data = await state.get_data()
    pid = await database.add_product(
        data["name"], data["price"], data.get("category", "Barchasi"),
        data.get("description", ""), data.get("discount", 0),
        data.get("bogo", 0), -1, data.get("image", ""), variants_json,
    )
    await state.clear()
    await message.answer(await bot_texts.render("product_added_manual", product_id=pid), parse_mode="HTML")


@router.callback_query(F.data == "adm_banners")
async def admin_banners(cb: CallbackQuery, state: FSMContext):
    if not is_admin(cb.from_user.id):
        return
    await state.set_state(AdminState.add_banner)
    await cb.message.edit_text(await bot_texts.render("banner_add_prompt"), parse_mode="HTML")
    await cb.answer()


@router.message(AdminState.add_banner, F.photo)
async def admin_save_banner(message: Message, state: FSMContext):
    if not is_admin(message.from_user.id):
        return
    try:
        image_name = await save_photo_cropped(message.bot, message.photo[-1])
        await database.add_banner(image_name)
        await message.answer(await bot_texts.render("banner_added"))
    except Exception as e:
        await message.answer(await bot_texts.render("generic_error", error=e))
    await state.clear()


@router.callback_query(F.data.startswith("adm_ep_"))
async def admin_edit_product(cb: CallbackQuery):
    if not is_admin(cb.from_user.id):
        return
    pid = int(cb.data.split("_")[-1])
    p = await database.get_product(pid)
    if not p:
        return await cb.answer(await bot_texts.render("not_found"))
    status = "Faol" if p["active"] else "Nofaol"
    bogo = "Ha" if p["is_bogo"] else "Yo'q"
    text = await bot_texts.render(
        "admin_product_details",
        name=p["name"],
        product_id=p["id"],
        price=p["price"],
        category=p["category"],
        discount=p["discount_percent"],
        bogo=bogo,
        stock="Cheksiz" if p["stock"] == -1 else p["stock"],
        status=status,
    )
    kb = InlineKeyboardMarkup(inline_keyboard=[
        [
            InlineKeyboardButton(text="✏️ Nomini o'zg.", callback_data=f"adm_sf_{pid}_name"),
            InlineKeyboardButton(text="Narxni o'zg.", callback_data=f"adm_sf_{pid}_price"),
        ],
        [
            InlineKeyboardButton(text="Kat. o'zg.", callback_data=f"adm_sf_{pid}_category"),
            InlineKeyboardButton(text="Chegirmani o'zg.", callback_data=f"adm_sf_{pid}_discount"),
        ],
        [
            InlineKeyboardButton(text=f"1+1: {bogo}", callback_data=f"adm_tb_{pid}"),
            InlineKeyboardButton(text=f"Holat: {status}", callback_data=f"adm_ta_{pid}"),
        ],
        [InlineKeyboardButton(text="O'chirish", callback_data=f"adm_del_{pid}")],
        [InlineKeyboardButton(text="Asosiy ro'yxat", callback_data="adm_products")],
    ])
    await cb.message.edit_text(text, reply_markup=kb, parse_mode="HTML")


@router.callback_query(F.data.startswith("adm_ta_"))
async def admin_toggle_active(cb: CallbackQuery):
    if not is_admin(cb.from_user.id):
        return
    pid = int(cb.data.split("_")[-1])
    p = await database.get_product(pid)
    await database.update_product(pid, active=1 if p["active"] == 0 else 0)
    await admin_edit_product(cb)


@router.callback_query(F.data.startswith("adm_tb_"))
async def admin_toggle_bogo(cb: CallbackQuery):
    if not is_admin(cb.from_user.id):
        return
    pid = int(cb.data.split("_")[-1])
    p = await database.get_product(pid)
    await database.update_product(pid, is_bogo=1 if p["is_bogo"] == 0 else 0)
    await admin_edit_product(cb)


@router.callback_query(F.data.startswith("adm_del_"))
async def admin_del_product(cb: CallbackQuery):
    if not is_admin(cb.from_user.id):
        return
    pid = int(cb.data.split("_")[-1])
    await database.delete_product(pid)
    await cb.answer(await bot_texts.render("product_deleted"), show_alert=True)
    await admin_products(cb)


@router.callback_query(F.data.startswith("adm_sf_"))
async def admin_set_field(cb: CallbackQuery, state: FSMContext):
    if not is_admin(cb.from_user.id):
        return
    _, _, pid, field = cb.data.split("_", 3)
    await state.set_state(AdminState.edit_field)
    await state.update_data(edit_pid=int(pid), edit_field=field)
    await cb.message.edit_text(await bot_texts.render("edit_prompt", field=field), parse_mode="HTML")
    await cb.answer()


@router.message(AdminState.edit_field)
async def admin_save_field(message: Message, state: FSMContext):
    if not is_admin(message.from_user.id):
        return
    data = await state.get_data()
    pid, field = data["edit_pid"], data["edit_field"]
    val = message.text.strip()
    if field in ["price", "discount_percent", "stock"]:
        try:
            val = int(val)
        except ValueError:
            return await message.answer(await bot_texts.render("number_error"))
    await database.update_product(pid, **{field: val})
    await state.clear()
    await message.answer(await bot_texts.render("saved"))


@router.callback_query(F.data == "adm_orders")
async def admin_orders(cb: CallbackQuery):
    if not is_admin(cb.from_user.id):
        return await cb.answer()
    orders = await database.get_recent_orders(10)
    if not orders:
        return await cb.message.edit_text(
            await bot_texts.render("no_orders"),
            reply_markup=InlineKeyboardMarkup(inline_keyboard=[
                [InlineKeyboardButton(text="Asosiy menyu", callback_data="adm_back")]
            ]),
        )
    rows = []
    for o in orders:
        st = "OK" if o["status"] == "confirmed" else ("NO" if o["status"] == "cancelled" else "WAIT")
        label = o["code"] or str(o["id"])
        rows.append([InlineKeyboardButton(
            text=f"{st} #{label} - {o['total_price']} sum",
            callback_data=f"adm_eo_{o['id']}",
        )])
    rows.append([InlineKeyboardButton(text="Asosiy menyu", callback_data="adm_back")])
    await cb.message.edit_text(
        await bot_texts.render("admin_orders_title"),
        reply_markup=InlineKeyboardMarkup(inline_keyboard=rows),
        parse_mode="HTML",
    )


@router.callback_query(F.data.startswith("adm_eo_"))
async def admin_view_order(cb: CallbackQuery):
    if not is_admin(cb.from_user.id):
        return
    oid = int(cb.data.split("_")[-1])
    o = await database.get_order(oid)
    if not o:
        return await cb.answer(await bot_texts.render("not_found"))
    u = await database.get_user(o["user_id"])
    st_map = {
        "pending": "Kutilmoqda", "confirmed": "Tasdiqlandi",
        "cancelled": "Bekor qilindi", "yetkazilmoqda": "Yetkazib berilmoqda",
        "yetkazildi": "Yetkazib berildi", "tekshirilmoqda": "To'lov tekshirilmoqda",
    }
    pm_map = {"cash": "Naqd", "card": "Karta"}
    dt_map = {"delivery": "Yetkazib berish", "pickup": "Olib ketish"}

    items = json.loads(o["items"])
    items_str = "\n".join([f"• {i['name']} x{i['quantity']} ({i['price']} so'm)" for i in items])
    order_label = o["code"] or str(o["id"])
    text = (
        f"<b>Buyurtma tafsilotlari: #{order_label}</b>\n"
        f"Holati: <b>{st_map.get(o['status'], o['status'])}</b>\n\n"
        f"Mijoz: {u['first_name']} {u['last_name']} (ID: {u['id']})\n"
        f"Yetkazib berish turi: {dt_map.get(o['delivery_type'], o['delivery_type'])} | "
        f"To'lov usuli: {pm_map.get(o['payment_method'], o['payment_method'])}\n"
        f"Manzil: {o['address']}\n\n"
        f"<b>Buyurtma tarkibi:</b>\n{items_str}\n\n"
        f"Jami summa: <b>{o['total_price']} so'm</b>"
    )
    text = _order_details_text(o, u, await bot_texts.render("admin_order_details_title"))
    kb = InlineKeyboardMarkup(inline_keyboard=[
        [
            InlineKeyboardButton(text=" Tasdiqlash", callback_data=f"adm_os_{oid}_confirmed"),
            InlineKeyboardButton(text="Bekor qilish", callback_data=f"adm_os_{oid}_cancelled"),
        ],
        [InlineKeyboardButton(text="Buyurtmalar ro'yxatiga qaytish", callback_data="adm_orders")],
    ])
    await cb.message.edit_text(text, reply_markup=kb, parse_mode="HTML")


@router.callback_query(F.data.startswith("adm_os_"))
async def admin_set_order_status(cb: CallbackQuery):
    actor = await database.get_user(cb.from_user.id)
    if not (actor and actor["role"] in ("admin", "owner")):
        return
    parts = cb.data.split("_", 3)
    oid, st = int(parts[2]), parts[3]
    await database.update_order_status(oid, st)
    await cb.answer(await bot_texts.render("order_status_changed"))

    if st == "confirmed":
        o = await database.get_order(oid)
        if o:
            order_label = o["code"] or str(oid)
            try:
                await cb.bot.send_message(
                    o["user_id"],
                    await bot_texts.render("order_confirmed_customer", order_code=order_label),
                    parse_mode="HTML",
                )
            except Exception:
                pass
    elif st == "cancelled":
        o = await database.get_order(oid)
        if o:
            order_label = o["code"] or str(oid)
            try:
                await cb.bot.send_message(
                    o["user_id"],
                    await bot_texts.render("order_cancelled_customer", order_code=order_label, reason="Admin tomonidan bekor qilindi"),
                    parse_mode="HTML",
                )
            except Exception:
                pass
    await admin_view_order(cb)


@router.message(OrderState.waiting_for_receipt, F.photo)
async def process_receipt(message: Message, state: FSMContext):
    data = await state.get_data()
    oid = data.get("receipt_oid")
    if not oid:
        return await state.clear()

    photo_id = message.photo[-1].file_id
    o = await database.get_order(oid)

    if not o:
        return await message.answer(await bot_texts.render("system_error"))

    u = await database.get_user(o["user_id"])
    items = json.loads(o["items"])
    items_str = "\n".join([f"• {i['name']} x{i['quantity']} ({i['price']} so'm)" for i in items])

    dt_map = {"delivery": "Yetkazib berish", "pickup": "Olib ketish"}
    order_label = o["code"] or str(oid)
    admin_msg = (
        f"<b>To'lov tasdiqlash so'rovi: #{order_label}</b>\n\n"
        f"Mijoz: {u['first_name']} (ID: {u['id']})\n"
        f"Yetkazib berish: {dt_map.get(o['delivery_type'], o['delivery_type'])} | To'lov: Karta\n"
        f"Manzil: {o['address']}\n\n"
        f"<b>Buyurtma tarkibi:</b>\n{items_str}\n\n"
        f"Jami summa: <b>{o['total_price']} so'm</b>"
    )
    admin_msg = _order_details_text(o, u, await bot_texts.render("payment_review_title"))

    kb = InlineKeyboardMarkup(inline_keyboard=[
        [
            InlineKeyboardButton(text=" Tasdiqlash", callback_data=f"adm_os_{oid}_confirmed"),
            InlineKeyboardButton(text="Bekor qilish", callback_data=f"adm_os_{oid}_cancelled"),
        ]
    ])

    try:
        users = await database.get_all_users()
        for admin in users:
            if admin["role"] != "admin":
                continue
            try:
                await message.bot.send_photo(
                    int(admin["id"]), photo=photo_id,
                    caption=admin_msg, reply_markup=kb, parse_mode="HTML",
                )
            except Exception:
                pass
    except Exception:
        pass
    await database.update_order_status(oid, "tekshirilmoqda")
    await state.clear()
    await message.answer(
        await bot_texts.render("receipt_saved_customer"),
        parse_mode="HTML",
    )


@router.message(OrderState.waiting_for_receipt)
async def process_receipt_invalid(message: Message):
    await message.answer(
        await bot_texts.render("receipt_invalid"),
    )
