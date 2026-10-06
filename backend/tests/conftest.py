import os
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))
os.environ.setdefault("CONFIG_PATH", str(Path(__file__).with_name("config.test.ini")))
