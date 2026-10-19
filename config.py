"""
Centralized application configuration.

All secrets and environment-specific values are read from environment
variables (optionally loaded from a local `.env` file). Nothing sensitive
should ever be hard-coded in application modules — import from here instead.
"""
import os
import secrets
from datetime import timedelta

try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))
except ImportError:
    _env_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
    if os.path.exists(_env_file):
        with open(_env_file, "r", encoding="utf-8") as _f:
            for _line in _f:
                _line = _line.strip()
                if _line and not _line.startswith("#") and "=" in _line:
                    _k, _v = _line.split("=", 1)
                    os.environ.setdefault(_k.strip(), _v.strip())


def _env_bool(name, default=False):
    val = os.environ.get(name)
    if val is None:
        return default
    return str(val).strip().lower() in ("1", "true", "yes", "on")


def _env_int(name, default):
    try:
        return int(os.environ.get(name, default))
    except (TypeError, ValueError):
        return default


def _env_list(name, default=""):
    raw = os.environ.get(name, default) or ""
    return [item.strip() for item in raw.split(",") if item.strip()]


FLASK_ENV = os.environ.get("FLASK_ENV", "development").strip().lower()
IS_PRODUCTION = FLASK_ENV == "production"

# Known insecure values that must never be used in production
_INSECURE_SECRET_KEYS = {
    "",
    "changeme",
    "change-me",
    "thiskeyissupposedtobeprivateandonlyknowbytheadmin",
}

# ---------------------------------------------------------------- SECURITY
SECRET_KEY = os.environ.get("SECRET_KEY", "").strip()
if SECRET_KEY in _INSECURE_SECRET_KEYS:
    if IS_PRODUCTION:
        raise RuntimeError(
            "SECRET_KEY is missing or insecure. Set a strong SECRET_KEY in the "
            "environment / .env file before running in production."
        )
    # Development fallback: random per-process key (sessions reset on restart)
    SECRET_KEY = secrets.token_hex(32)
    print("⚠️  SECRET_KEY not set — using a temporary random key (development only).")

SESSION_LIFETIME_HOURS = _env_int("SESSION_LIFETIME_HOURS", 2)
SESSION_COOKIE_SECURE = _env_bool("SESSION_COOKIE_SECURE", False)
SESSION_COOKIE_SAMESITE = os.environ.get("SESSION_COOKIE_SAMESITE", "Lax")

# Comma-separated list, e.g. "https://chat.example.com,https://admin.example.com"
# Defaults to "*" in development only.
CORS_ORIGINS = _env_list("CORS_ORIGINS") or (["*"] if not IS_PRODUCTION else [])

# ---------------------------------------------------------------- DATABASE
MONGO_URI = os.environ.get("MONGO_URI", "mongodb://localhost:27017/chatDatabase").strip()
MONGO_DB_NAME = os.environ.get("MONGO_DB_NAME", "chatDatabase").strip()

# ---------------------------------------------------------------- MESSAGES
MESSAGES_PAGE_SIZE = _env_int("MESSAGES_PAGE_SIZE", 50)
MESSAGES_MAX_PAGE_SIZE = _env_int("MESSAGES_MAX_PAGE_SIZE", 200)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# ---------------------------------------------------------------- WEB PUSH (VAPID)
VAPID_PUBLIC_KEY = os.environ.get("VAPID_PUBLIC_KEY", "").strip()
VAPID_PRIVATE_KEY = os.environ.get("VAPID_PRIVATE_KEY", "").strip()
if VAPID_PRIVATE_KEY and not os.path.isabs(VAPID_PRIVATE_KEY):
    pem_candidate = os.path.join(BASE_DIR, VAPID_PRIVATE_KEY)
    if os.path.exists(pem_candidate):
        VAPID_PRIVATE_KEY = pem_candidate
elif not VAPID_PRIVATE_KEY:
    default_pem = os.path.join(BASE_DIR, "vapid_private.pem")
    if os.path.exists(default_pem):
        VAPID_PRIVATE_KEY = default_pem

VAPID_CLAIM_EMAIL = os.environ.get("VAPID_CLAIM_EMAIL", "mailto:info@delspacelab.ng").strip()
WEB_PUSH_ENABLED = bool(VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY)

# ---------------------------------------------------------------- SERVER
HOST = os.environ.get("HOST", "0.0.0.0")
PORT = _env_int("PORT", 5005)
DEBUG = _env_bool("FLASK_DEBUG", not IS_PRODUCTION)


class Config:
    """Flask config object (app.config.from_object(Config))."""
    ENV = FLASK_ENV
    DEBUG = DEBUG
    SECRET_KEY = SECRET_KEY
    MONGO_URI = MONGO_URI
    PERMANENT_SESSION_LIFETIME = timedelta(hours=SESSION_LIFETIME_HOURS)
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SECURE = SESSION_COOKIE_SECURE
    SESSION_COOKIE_SAMESITE = SESSION_COOKIE_SAMESITE
    MAX_CONTENT_LENGTH = _env_int("MAX_UPLOAD_MB", 100) * 1024 * 1024
