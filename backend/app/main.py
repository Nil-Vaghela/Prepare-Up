from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware
from starlette.responses import Response
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
from app.api.auth import router as auth_router  # ✅ NEW

app = FastAPI(title=settings.APP_NAME)

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
    sid = request.cookies.get("pu_session_id")
    response: Response = await call_next(request)

    if not sid:
        new_sid = str(uuid.uuid4())
        response.set_cookie(
            key="pu_session_id",
            value=new_sid,
            httponly=True,
            samesite="lax",
            secure=False,  # set True when you are on HTTPS
            path="/",
            max_age=60 * 60 * 24 * 30,  # 30 days
        )

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