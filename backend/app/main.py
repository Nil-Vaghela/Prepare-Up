from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware
import os
import uuid

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

app = FastAPI(title=settings.APP_NAME)

COOKIE_SECURE = os.getenv("COOKIE_SECURE", "false").strip().lower() in {"1", "true", "yes", "on"}
COOKIE_DOMAIN = (os.getenv("COOKIE_DOMAIN") or "").strip() or None
ANON_COOKIE_MAX_AGE = 60 * 60 * 24 * 30

# CORS: must allow credentials for cookies to work from 3000 -> 8000
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

# Session cookie (used for Discord OAuth state + tokens)
# IMPORTANT: Set APP_SECRET in your .env to a long random string in production.
app.add_middleware(
    SessionMiddleware,
    secret_key=os.getenv("APP_SECRET", "dev_secret_change_me"),
    session_cookie="prepareup_session",
    same_site="lax",
    https_only=False,  # set True when you are on HTTPS
)

# Anonymous ownership cookie (used for anon chat + claim-on-login)
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