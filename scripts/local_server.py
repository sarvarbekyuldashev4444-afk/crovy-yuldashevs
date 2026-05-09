import argparse
import asyncio
import errno
import logging
import os
import sys
import webbrowser
from pathlib import Path

from aiohttp import web
from aiogram import Dispatcher

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

import config
import database
from handlers.api_handlers import create_api_app


LOCAL_USER_ID = config.LOCAL_USER_ID


def apply_data_dir(data_dir):
    if not data_dir:
        return
    root = os.path.abspath(data_dir)
    config.DATA_DIR = root
    config.DB_PATH = os.path.join(root, "market.db")
    config.UPLOAD_DIR = os.path.join(root, "uploads")


class LocalBotSession:
    async def close(self):
        return None


class LocalBot:
    id = 1
    session = LocalBotSession()

    async def send_message(self, chat_id, text, **kwargs):
        logging.info("Local bot message to %s:\n%s", chat_id, text)
        return None

    async def set_chat_menu_button(self, *args, **kwargs):
        return None


def local_bootstrap_script(open_admin=False):
    return f"""
<script>
window.LOCAL_ADMIN_AUTH = true;
window.LOCAL_OPEN_ADMIN = {str(open_admin).lower()};
window.Telegram = window.Telegram || {{}};
window.Telegram.WebApp = {{
    initData: "local",
    initDataUnsafe: {{
        user: {{
            id: {LOCAL_USER_ID},
            first_name: "Local",
            last_name: "Admin",
            username: "local_admin",
            language_code: "uz"
        }}
    }},
    colorScheme: "default",
    themeParams: {{}},
    expand() {{}},
    close() {{
        console.log("Telegram.WebApp.close() ignored in local mode");
    }},
    sendData(data) {{
        console.log("Telegram.WebApp.sendData()", data);
    }},
    ready() {{}},
    requestFullscreen() {{}},
    HapticFeedback: {{
        impactOccurred() {{}},
        selectionChanged() {{}},
        notificationOccurred() {{}}
    }},
    MainButton: {{
        show() {{}},
        hide() {{}},
        setText() {{}},
        onClick() {{}},
        offClick() {{}}
    }},
    BackButton: {{
        show() {{}},
        hide() {{}},
        onClick() {{}},
        offClick() {{}}
    }}
}};
</script>
"""


@web.middleware
async def local_index_middleware(request, handler):
    if request.path in ("/", "/index.html"):
        index_path = os.path.join(config.WEBAPP_DIR, "index.html")
        with open(index_path, "r", encoding="utf-8") as file:
            html = file.read()

        open_admin = request.query.get("admin") == "1"
        bootstrap = local_bootstrap_script(open_admin=open_admin)
        marker = '<script src="app.js'
        if marker in html:
            html = html.replace(marker, bootstrap + "\n    " + marker, 1)
        else:
            html = html.replace("</head>", bootstrap + "\n</head>", 1)

        return web.Response(text=html, content_type="text/html")

    return await handler(request)


async def ensure_local_owner():
    await database.init_db()
    await database.ensure_user(LOCAL_USER_ID, "Local", "Admin")
    await database.update_user_admin_profile(
        LOCAL_USER_ID,
        first_name="Local",
        last_name="Admin",
        role="owner",
    )


async def _start_site_with_fallback(runner, host, port, strict_port=False, attempts=20):
    for offset in range(attempts):
        candidate = port + offset
        site = web.TCPSite(runner, host, candidate)
        try:
            await site.start()
            if candidate != port:
                logging.warning(
                    "Port %s is busy; local server started on %s instead.",
                    port,
                    candidate,
                )
            return site, candidate
        except OSError as exc:
            if strict_port or exc.errno not in (errno.EADDRINUSE, 10048):
                raise
            logging.warning("Port %s is already in use, trying %s...", candidate, candidate + 1)
    raise OSError(
        errno.EADDRINUSE,
        f"Could not find a free port in range {port}-{port + attempts - 1}",
    )


async def run_server(host, port, open_browser, strict_port=False):
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )

    await ensure_local_owner()

    app = create_api_app(LocalBot(), Dispatcher())
    app.middlewares.append(local_index_middleware)

    runner = web.AppRunner(app)
    await runner.setup()
    try:
        site, port = await _start_site_with_fallback(
            runner,
            host,
            port,
            strict_port=strict_port,
        )
    except Exception:
        await runner.cleanup()
        raise

    url = f"http://{host}:{port}/"
    admin_url = f"{url}?admin=1"
    logging.info("Local WebApp: %s", url)
    logging.info("Local admin:  %s", admin_url)
    logging.info("Local user id: %s", LOCAL_USER_ID)

    if open_browser:
        webbrowser.open(url)

    try:
        while True:
            await asyncio.sleep(3600)
    finally:
        await runner.cleanup()


def main():
    parser = argparse.ArgumentParser(description="Run Crovy WebApp locally without Telegram.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8081)
    parser.add_argument("--data-dir", default="")
    parser.add_argument("--strict-port", action="store_true", help="Fail instead of trying the next free port.")
    parser.add_argument("--open", action="store_true", help="Open the local WebApp in the default browser.")
    args = parser.parse_args()

    apply_data_dir(args.data_dir)
    asyncio.run(run_server(args.host, args.port, args.open, args.strict_port))


if __name__ == "__main__":
    main()
