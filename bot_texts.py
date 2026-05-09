import json

import config
import database


CUSTOM_EMOJI = {
    "emoji_star": '<tg-emoji emoji-id="5956561749070057536">⭐️</tg-emoji>',
    "emoji_spark": '<tg-emoji emoji-id="5956148757899776734">⭐️</tg-emoji>',
    "emoji_gift": '<tg-emoji emoji-id="5875180111744995604">🎁</tg-emoji>',
    "emoji_settings": '<tg-emoji emoji-id="5877260593903177342">⚙</tg-emoji>',
    "emoji_note": '<tg-emoji emoji-id="5886330010054168711">📝</tg-emoji>',
}


class _FormatValues(dict):
    def __missing__(self, key):
        return "{" + key + "}"


def _load(raw, default):
    if isinstance(raw, dict):
        return raw
    try:
        parsed = json.loads(raw or "{}")
        return parsed if isinstance(parsed, dict) else default
    except Exception:
        return default


async def get_bot_messages():
    raw = await database.get_setting(
        "bot_messages",
        json.dumps(config.BOT_MESSAGES, ensure_ascii=False),
    )
    return {**config.BOT_MESSAGES, **_load(raw, {})}


def render_from(messages, key, **values):
    template = messages.get(key, config.BOT_MESSAGES.get(key, ""))
    data = _FormatValues({**CUSTOM_EMOJI, **values})
    return str(template).format_map(data)


async def render(key, **values):
    return render_from(await get_bot_messages(), key, **values)
