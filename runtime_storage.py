import logging
import os
import shutil
import zipfile

import config

logger = logging.getLogger(__name__)
PROJECT_DIR = os.path.dirname(os.path.abspath(__file__))


def _same_path(left, right):
    try:
        return os.path.abspath(left) == os.path.abspath(right)
    except Exception:
        return False


def _ensure_parent_dir(path, fallback_dir=None):
    directory = os.path.dirname(path) or fallback_dir or PROJECT_DIR
    os.makedirs(directory, exist_ok=True)
    return directory


def _copy_missing_file(source, target):
    if not source or not os.path.exists(source):
        return False
    if os.path.exists(target) or _same_path(source, target):
        return False
    _ensure_parent_dir(target)
    shutil.copy2(source, target)
    return True


def _copy_missing_tree(source_dir, target_dir):
    if not source_dir or not os.path.isdir(source_dir):
        return 0
    copied = 0
    os.makedirs(target_dir, exist_ok=True)
    for root, _dirs, files in os.walk(source_dir):
        rel_root = os.path.relpath(root, source_dir)
        dest_root = target_dir if rel_root == "." else os.path.join(target_dir, rel_root)
        os.makedirs(dest_root, exist_ok=True)
        for filename in files:
            source = os.path.join(root, filename)
            target = os.path.join(dest_root, filename)
            if not os.path.exists(target):
                shutil.copy2(source, target)
                copied += 1
    return copied


def _resolve_zip_member(names):
    for name in names:
        if os.path.basename(name) == "market.db":
            return name
    db_files = [name for name in names if name.lower().endswith(".db")]
    if len(db_files) == 1:
        return db_files[0]
    return ""


def _extract_market_db(zip_path, target_path):
    if not zip_path or not os.path.exists(zip_path):
        return False
    try:
        with zipfile.ZipFile(zip_path, "r") as archive:
            member_name = _resolve_zip_member(archive.namelist())
            if not member_name:
                logger.warning("No market.db found inside zip: %s", zip_path)
                return False
            _ensure_parent_dir(target_path)
            with archive.open(member_name, "r") as src, open(target_path, "wb") as dst:
                shutil.copyfileobj(src, dst)
        return True
    except Exception:
        logger.exception("Failed to extract seed db from zip: %s", zip_path)
        return False


def _ensure_seed_db():
    _ensure_parent_dir(config.DB_PATH, config.DATA_DIR)
    _ensure_parent_dir(config.SEED_DB_PATH, PROJECT_DIR)
    if os.path.exists(config.DB_PATH):
        return False
    if os.path.exists(config.SEED_DB_PATH):
        return _copy_missing_file(config.SEED_DB_PATH, config.DB_PATH)
    zip_path = os.environ.get("MARKET_ZIP_PATH", os.path.join(PROJECT_DIR, "market.zip"))
    if _extract_market_db(zip_path, config.SEED_DB_PATH):
        return _copy_missing_file(config.SEED_DB_PATH, config.DB_PATH)
    return False


def prepare_runtime_storage():
    _ensure_parent_dir(config.DB_PATH, config.DATA_DIR)
    os.makedirs(config.UPLOAD_DIR, exist_ok=True)
    db_copied = _ensure_seed_db()
    if not os.path.exists(config.DB_PATH):
        _ensure_parent_dir(config.DB_PATH, config.DATA_DIR)
        with open(config.DB_PATH, "ab"):
            pass
        db_copied = True
    uploads_copied = _copy_missing_tree(config.SEED_UPLOAD_DIR, config.UPLOAD_DIR)
    return {"db_copied": db_copied, "uploads_copied": uploads_copied}
