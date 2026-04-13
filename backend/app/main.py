from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware
import os
import uuid
import logging

from dotenv import load_dotenv
load_dotenv()

from app.core.config import settings
from app.api.health import router as health_router
from app.api.hello import router as hello_router
from app.api.dahsboard import router as dashboard_router
from app.api.upload import router as upload_router
from app.api.generate import router as generate_router
from app.api.chat import router as chat_router
from app.api.discord_integration import router as discord_router
from app.api.auth import router as auth_router
from app.api.podcast_audio import router as podcast_audio_router
from app.api.quiz import router as quiz_router

logger = logging.getLogger("prepareup.startup")


def _run_migrations() -> None:
    """Run Alembic migrations programmatically on startup.

    This avoids requiring a manual `alembic upgrade head` and ensures
    migrations run inside the Docker network where DB DNS resolution works.
    """
    try:
        from alembic.config import Config
        from alembic import command

        alembic_cfg = Config("/app/alembic.ini")
        alembic_cfg.set_main_option("sqlalchemy.url", os.environ["DATABASE_URL"])
        command.upgrade(alembic_cfg, "head")
        logger.info("Alembic migrations applied successfully.")
    except Exception as exc:
        # Log but do not crash — if tables already exist this is non-fatal,
        # and we don't want a migration hiccup to take down the whole service.
        logger.warning("Alembic migration step encountered an issue: %s", exc)


app = FastAPI(title=settings.APP_NAME, on_startup=[_run_migrations])

COOKIE_SECURE = os.getenv("COOKIE_SECURE", "false").strip().lower() in {"1", "true", "yes", "on"}
COOKIE_DOMAIN = (os.getenv("COOKIE_DOMAIN") or "").strip() or None
ANON_COOKIE_MAX_AGE = 60 * 60 * 24 * 30

# CORS: allow credentials so cookies work across localhost:3000 → localhost:8000
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Session cookie (Discord OAuth state + tokens)
app.add_middleware(
    SessionMiddleware,
    secret_key=os.getenv("APP_SECRET", "dev_secret_change_me"),
    session_cookie="prepareup_session",
    same_site="lax",
    https_only=False,
)

# Anonymous ownership cookie (anon chat + claim-on-login)
@app.middleware("http")
async def ensure_anon_session(request: Request, call_next):
    sid = (request.cookies.get("pu_session_id") or "").strip()
    response: Response = await call_next(request)

    if sid:
        return response

    new_sid = str(uuid.uuid4())
    cookie_kwargs = {
        "key": "pu_session_id",
        "value": new_sid,
        "httponly": True,
        "samesite": "lax",
        "secure": COOKIE_SECURE,
        "path": "/",
        "max_age": ANON_COOKIE_MAX_AGE,
    }
    if COOKIE_DOMAIN:
        cookie_kwargs["domain"] = COOKIE_DOMAIN

    response.set_cookie(**cookie_kwargs)
    return response

# Routers
app.include_router(health_router)
app.include_router(hello_router)
app.include_router(auth_router, prefix="/api")
app.include_router(dashboard_router, prefix="/api")
app.include_router(upload_router, prefix="/api")
app.include_router(generate_router, prefix="/api")
app.include_router(chat_router, prefix="/api")
app.include_router(discord_router, prefix="/api")
app.include_router(podcast_audio_router, prefix="/api")
app.include_router(quiz_router, prefix="/api")
