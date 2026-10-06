import os
from configparser import ConfigParser
from pathlib import Path

CONFIG_PATH = Path(os.environ.get("CONFIG_PATH") or Path(__file__).resolve().parent / "config.ini")


def load_config(path: Path = CONFIG_PATH) -> ConfigParser:
    parser = ConfigParser()
    if not parser.read(path, encoding="utf-8"):
        raise FileNotFoundError(f"Config file not found: {path} (copy config.sample.ini)")
    return parser


config = load_config()
