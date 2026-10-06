import logging
import logging.config


def setup_logging(level=logging.INFO) -> dict:
    level_name = level if isinstance(level, str) else logging.getLevelName(level)

    log_config = {
        "version": 1,
        "disable_existing_loggers": False,
        "formatters": {
            "default": {
                "format": "[{asctime}] [{levelname:<8}] {name}: {message}",
                "datefmt": "%Y-%m-%d %H:%M:%S",
                "style": "{",
            },
            "access": {
                "format": "[{asctime}] [{levelname:<8}] {name}: {message}",
                "datefmt": "%Y-%m-%d %H:%M:%S",
                "style": "{",
            },
        },
        "handlers": {
            "default": {
                "class": "logging.StreamHandler",
                "stream": "ext://sys.stdout",
                "formatter": "default",
            },
            "access": {
                "class": "logging.StreamHandler",
                "stream": "ext://sys.stdout",
                "formatter": "access",
            },
        },
        "loggers": {
            "": {
                "level": level_name,
                "handlers": ["default"],
                "propagate": False,
            },
            "uvicorn.error": {
                "level": level_name,
                "handlers": ["default"],
                "propagate": False,
            },
            "uvicorn.access": {
                "level": level_name,
                "handlers": ["access"],
                "propagate": False,
            },
        },
    }

    logging.config.dictConfig(log_config)
    return log_config
