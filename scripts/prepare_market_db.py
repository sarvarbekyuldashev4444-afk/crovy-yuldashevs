import os
import shutil
import zipfile


def _resolve_member_name(names):
    for name in names:
        if os.path.basename(name) == "market.db":
            return name
    db_files = [name for name in names if name.lower().endswith(".db")]
    if len(db_files) == 1:
        return db_files[0]
    return ""


def main():
    project_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    zip_path = os.environ.get("MARKET_ZIP_PATH", os.path.join(project_dir, "market.zip"))
    seed_db_path = os.environ.get("SEED_DB_PATH", os.path.join(project_dir, "market.db"))
    runtime_db_path = os.environ.get("DB_PATH", "/data/market.db")

    os.makedirs(os.path.dirname(seed_db_path), exist_ok=True)
    os.makedirs(os.path.dirname(runtime_db_path), exist_ok=True)

    if os.path.exists(zip_path):
        with zipfile.ZipFile(zip_path, "r") as archive:
            member_name = _resolve_member_name(archive.namelist())
            if not member_name:
                raise RuntimeError(f"market.db was not found inside zip: {zip_path}")

            with archive.open(member_name, "r") as src, open(seed_db_path, "wb") as dst:
                shutil.copyfileobj(src, dst)
        print(f"[prepare_market_db] extracted {member_name} -> {seed_db_path}")
    elif not os.path.exists(seed_db_path):
        raise FileNotFoundError(f"Neither zip nor seed db exists: {zip_path}, {seed_db_path}")
    else:
        print(f"[prepare_market_db] zip not found, using existing seed db: {seed_db_path}")

    if os.path.exists(seed_db_path) and not os.path.exists(runtime_db_path):
        shutil.copy2(seed_db_path, runtime_db_path)
        print(f"[prepare_market_db] copied seed db -> runtime db: {runtime_db_path}")
    else:
        print(f"[prepare_market_db] runtime db already exists: {runtime_db_path}")


if __name__ == "__main__":
    main()
