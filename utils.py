import uuid
import os
import io
import logging
import aiohttp
from PIL import Image
import config

logger = logging.getLogger(__name__)


async def save_photo_cropped(bot, photo_obj):
    f = await bot.get_file(photo_obj.file_id)
    ext = f.file_path.rsplit(".", 1)[-1] if "." in f.file_path else "jpg"
    name = f"{uuid.uuid4().hex}.{ext}"
    out_path = os.path.join(config.UPLOAD_DIR, name)

    url = f"https://api.telegram.org/file/bot{config.BOT_TOKEN}/{f.file_path}"
    async with aiohttp.ClientSession() as session:
        async with session.get(url) as resp:
            img_data = await resp.read()
            img = Image.open(io.BytesIO(img_data))

            width, height = img.size
            if width != height:
                min_dim = min(width, height)
                left = (width - min_dim) / 2
                top = (height - min_dim) / 2
                right = (width + min_dim) / 2
                bottom = (height + min_dim) / 2
                img = img.crop((left, top, right, bottom))

            img.save(out_path)
    return name


def crop_and_save_image(img_data, filename):
    img = Image.open(io.BytesIO(img_data))
    w, h = img.size
    if w != h:
        mn = min(w, h)
        img = img.crop(((w - mn) // 2, (h - mn) // 2, (w + mn) // 2, (h + mn) // 2))
    out_path = os.path.join(config.UPLOAD_DIR, filename)
    img.save(out_path)
    return filename


def is_admin(user_id):
    return user_id == int(config.ADMIN_ID)
