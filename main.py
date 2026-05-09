import asyncio
import logging

from aiohttp import web
from aiogram import Bot, Dispatcher
from aiogram.types import MenuButtonWebApp, WebAppInfo

import config
import database
from handlers.api_handlers import create_api_app
from handlers.bot_handlers import router as bot_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

bot = Bot(token=config.BOT_TOKEN)
dp = Dispatcher()
dp.include_router(bot_router)


async def update_bot_menu():
    try:
        if config.WEBAPP_URL:
            store_name = await database.get_setting("store_name", config.STORE_NAME)
            await bot.set_chat_menu_button(
                menu_button=MenuButtonWebApp(
                    text=store_name,
                    web_app=WebAppInfo(url=config.WEBAPP_URL),
                )
            )
    except Exception as e:
        logger.error("Menu error: %s", e)


async def bootstrap_services(app):
    delay = 5
    while True:
        try:
            await database.init_db()
            db_ready_event = app.get("db_ready_event")
            if db_ready_event and not db_ready_event.is_set():
                db_ready_event.set()
            await update_bot_menu()
            logger.info("Bootstrap complete; starting Telegram bot polling in background")
            await dp.start_polling(bot)
            logger.info("Telegram bot polling stopped")
            return
        except asyncio.CancelledError:
            raise
        except Exception as e:
            logger.exception("Bootstrap failed: %s", e)
            await asyncio.sleep(delay)
            delay = min(delay * 2, 60)


async def on_startup(app):
    app["bootstrap_task"] = asyncio.create_task(bootstrap_services(app))
    logger.info("HTTP server started; background bootstrap scheduled")


async def on_cleanup(app):
    task = app.get("bootstrap_task")
    if task:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.debug("Bootstrap task finished with error during shutdown: %s", e)
    await bot.session.close()


def main():
    app = create_api_app(bot, dp)
    app.on_startup.append(on_startup)
    app.on_cleanup.append(on_cleanup)
    web.run_app(app, host="0.0.0.0", port=config.PORT)


if __name__ == "__main__":
    main()
