import os
import shutil

import config


def _same_path(left, right):
    try:
        return os.path.abspath(left) == os.path.abspath(right)
    except Exception:
        return False


def _copy_missing_file(source, target):
    if not source or not os.path.exists(source):
        return False
    if os.path.exists(target) or _same_path(source, target):
        return False
    os.makedirs(os.path.dirname(target), exist_ok=True)
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


def prepare_runtime_storage():
    os.makedirs(config.DATA_DIR, exist_ok=True)
    os.makedirs(config.UPLOAD_DIR, exist_ok=True)
    db_copied = _copy_missing_file(config.SEED_DB_PATH, config.DB_PATH)
    uploads_copied = _copy_missing_tree(config.SEED_UPLOAD_DIR, config.UPLOAD_DIR)
    return {"db_copied": db_copied, "uploads_copied": uploads_copied}
