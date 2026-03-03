from __future__ import annotations

import os

from fastapi import APIRouter, Request, HTTPException, Depends, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from jose import JWTError, jwt

from app.db.session import get_db
from app.core.security.auth_service import login_with_google as login_with_google_service
from app.models.user import User

router = APIRouter(tags=["auth"])


# ---------------------------
# JWT helpers (minimal)
# ---------------------------

def _jwt_secret() -> str:
    # Prefer config/env; keep a dev fallback so local runs don't crash.
    return os.getenv("JWT_SECRET", os.getenv("APP_SECRET", "dev_secret_change_me"))


def _jwt_alg() -> str:
    return os.getenv("JWT_ALGORITHM", "HS256")


def _extract_bearer_token(request: Request) -> str | None:
    auth = request.headers.get("authorization") or request.headers.get("Authorization")
    if not auth:
        return None
    parts = auth.split(" ", 1)
    if len(parts) != 2:
        return None
    scheme, token = parts[0].strip().lower(), parts[1].strip()
    if scheme != "bearer" or not token:
        return None
    return token


def _decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, _jwt_secret(), algorithms=[_jwt_alg()])
    except JWTError as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {str(e)}")


# ---------------------------
# Request/Response Schemas
# ---------------------------

class GoogleLoginRequest(BaseModel):
    id_token: str


class UserOut(BaseModel):
    id: str
    display_name: str | None = None
    avatar_url: str | None = None


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# ---------------------------
# Endpoints
# ---------------------------

@router.post("/auth/google", response_model=LoginResponse)
async def login_with_google(
    payload: GoogleLoginRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    """
    Google Sign-In using ID token from frontend (GIS button).
    Flow A: Login from Home → redirect to dashboard.
    Flow B later: Dashboard login → claim anon session chats.
    """
    try:
        result = login_with_google_service(
            db=db,
            id_token=payload.id_token,
            session_id=request.cookies.get("pu_session_id"),  # ok now (optional)
        )
    except Exception as e:
        raise HTTPException(status_code=401, detail=str(e))

    access_token = result["access_token"]
    refresh_token = result["refresh_token"]
    user = result["user"]  # <-- this is a dict

    # Set refresh token as HttpOnly cookie (7 days)
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=False,  # True in production (HTTPS)
        samesite="lax",
        max_age=7 * 24 * 60 * 60,
        path="/",
    )

    return LoginResponse(
        access_token=access_token,
        user=UserOut(
            id=str(user.get("id")),
            display_name=user.get("name"),
            avatar_url=user.get("avatar_url"),
        ),
    )


@router.get("/auth/me", response_model=UserOut)
async def me(
    request: Request,
    db: Session = Depends(get_db),
):
    """Return the current logged-in user.

    We support two ways:
    1) Authorization: Bearer <access_token>
    2) refresh_token HttpOnly cookie (used by the frontend with credentials: 'include')

    For Sprint 2, we keep this minimal: decode token, read user_id from `sub`, return user.
    """

    token = _extract_bearer_token(request) or request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    payload = _decode_token(token)

    # We expect JWT to contain `sub` = user_id (uuid string)
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token: missing subject")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    return UserOut(
        id=str(user.id),
        display_name=getattr(user, "display_name", None),
        avatar_url=getattr(user, "avatar_url", None),
    )


@router.post("/auth/refresh")
async def refresh(request: Request):
    raise HTTPException(status_code=501, detail="Not implemented yet (Task 90).")


@router.post("/auth/logout")
async def logout(request: Request):
    raise HTTPException(status_code=501, detail="Not implemented yet (Task 92).")