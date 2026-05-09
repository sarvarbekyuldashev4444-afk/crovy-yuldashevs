import logging
import os
import sys

PROJECT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_DIR not in sys.path:
    sys.path.insert(0, PROJECT_DIR)

import runtime_storage


logger = logging.getLogger(__name__)


def main():
    result = runtime_storage.prepare_runtime_storage()
    logger.info("[prepare_market_db] runtime storage prepared: %s", result)


if __name__ == "__main__":
    main()
