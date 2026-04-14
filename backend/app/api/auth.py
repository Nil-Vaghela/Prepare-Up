from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Request, HTTPException, Depends, Response
from jose import JWTError, jwt
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.core.security.auth_service import (
    login_with_google as login_with_google_service,
    create_access_token,
    create_refresh_token,
    JWT_SECRET,
    JWT_ALGORITHM,
)
from app.models.user import User
from app.models.oauth_account import OAuthAccount

router = APIRouter(tags=["auth"])


# ---------------------------
# Schemas
# ---------------------------

class GoogleLoginRequest(BaseModel):
    id_token: str


class UserOut(BaseModel):
    id: str
    display_name: str | None = None
    avatar_url: str | None = None
    email: str | None = None


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# ---------------------------
# Helpers
# ---------------------------

def _get_jwt_secret() -> str:
    return os.getenv("JWT_SECRET", os.getenv("APP_SECRET", "dev_secret_change_me"))


def _decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, _get_jwt_secret(), algorithms=[JWT_ALGORITHM])
    except JWTError as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {e}")


def _extract_bearer(request: Request) -> str | None:
    auth = request.headers.get("authorization", "")
    if auth.lower().startswith("bearer "):
        return auth[7:].strip() or None
    return None


def _user_from_token(token: str, db: Session) -> User:
    payload = _decode_token(token)
    sub = payload.get("sub")
    if not sub:
        raise HTTPException(status_code=401, detail="Token missing sub claim.")
    user = db.query(User).filter(User.id == sub).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found.")
    return user


def _email_for_user(user_id, db: Session) -> str | None:
    oauth = db.query(OAuthAccount).filter(OAuthAccount.user_id == user_id).first()
    return oauth.email_at_auth if oauth else None


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
    Verifies the token, upserts user, issues JWT access + refresh tokens.
    """
    try:
        result = login_with_google_service(
            db=db,
            id_token=payload.id_token,
            session_id=request.cookies.get("pu_session_id"),
        )
    except Exception as e:
        raise HTTPException(status_code=401, detail=str(e))

    access_token = result["access_token"]
    refresh_token = result["refresh_token"]
    user = result["user"]

    response.set_cookie(
        key="pu_refresh_token",
        value=refresh_token,
        httponly=True,
        secure=False,
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
            email=user.get("email"),
        ),
    )


@router.get("/auth/me", response_model=UserOut)
async def me(request: Request, db: Session = Depends(get_db)):
    """Return profile for the authenticated user."""
    token = _extract_bearer(request)
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated.")

    user = _user_from_token(token, db)
    email = _email_for_user(user.id, db)

    return UserOut(
        id=str(user.id),
        display_name=user.display_name,
        avatar_url=user.avatar_url,
        email=email,
    )


@router.post("/auth/refresh")
async def refresh(request: Request, response: Response, db: Session = Depends(get_db)):
    """Issue a new access token using the HttpOnly refresh token cookie."""
    refresh_token = request.cookies.get("pu_refresh_token")
    if not refresh_token:
        raise HTTPException(status_code=401, detail="No refresh token.")

    payload = _decode_token(refresh_token)

    token_type = payload.get("type")
    if token_type != "refresh":
        raise HTTPException(status_code=401, detail="Not a refresh token.")

    sub = payload.get("sub")
    if not sub:
        raise HTTPException(status_code=401, detail="Token missing sub.")

    user = db.query(User).filter(User.id == sub).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found.")

    # Issue new tokens (rotate refresh token)
    new_access = create_access_token(user.id)
    new_refresh = create_refresh_token(user.id)

    response.set_cookie(
        key="pu_refresh_token",
        value=new_refresh,
        httponly=True,
        secure=False,
        samesite="lax",
        max_age=7 * 24 * 60 * 60,
        path="/",
    )

    email = _email_for_user(user.id, db)

    return {
        "access_token": new_access,
        "token_type": "bearer",
        "user": {
            "id": str(user.id),
            "display_name": user.display_name,
            "avatar_url": user.avatar_url,
            "email": email,
        },
    }


@router.post("/auth/logout")
async def logout(response: Response):
    """Clear the refresh token cookie."""
    response.delete_cookie(key="pu_refresh_token", path="/")
    return {"detail": "Logged out successfully."}
