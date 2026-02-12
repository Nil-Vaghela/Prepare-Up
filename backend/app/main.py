from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware
import os

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

app = FastAPI(title=settings.APP_NAME)

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

app.include_router(health_router)
app.include_router(hello_router)
app.include_router(dashboard_router, prefix="/api")
app.include_router(upload_router, prefix="/api")
app.include_router(generate_router, prefix="/api")
app.include_router(chat_router, prefix="/api")
app.include_router(discord_router, prefix="/api")