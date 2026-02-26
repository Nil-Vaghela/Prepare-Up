from __future__ import annotations

from datetime import datetime, timedelta
import os
import uuid

from jose import jwt
from sqlalchemy.orm import Session

from app.core.security.google import verify_google_id_token
from app.models.oauth_account import OAuthAccount
from app.models.user import User

JWT_SECRET = os.getenv("JWT_SECRET", "dev_jwt_secret_change_me")
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 15
REFRESH_TOKEN_EXPIRE_DAYS = 7


def create_access_token(user_id: uuid.UUID) -> str:
    exp = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    return jwt.encode(
        {"sub": str(user_id), "exp": exp, "type": "access"},
        JWT_SECRET,
        algorithm=JWT_ALGORITHM,
    )


def create_refresh_token(user_id: uuid.UUID) -> str:
    exp = datetime.utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    return jwt.encode(
        {"sub": str(user_id), "exp": exp, "type": "refresh"},
        JWT_SECRET,
        algorithm=JWT_ALGORITHM,
    )


def _as_dict(obj):
    if isinstance(obj, dict):
        return obj
    if hasattr(obj, "model_dump"):
        return obj.model_dump()
    if hasattr(obj, "dict"):
        return obj.dict()
    return {
        "sub": getattr(obj, "sub", None),
        "email": getattr(obj, "email", None),
        "name": getattr(obj, "name", None),
        "picture": getattr(obj, "picture", None),
    }


def login_with_google(*, db: Session, id_token: str, session_id: str | None = None):
    google = _as_dict(verify_google_id_token(id_token))

    sub = google.get("sub")
    email = google.get("email")
    name = google.get("name")
    picture = google.get("picture")

    if not sub:
        raise ValueError("Invalid Google id_token payload (missing sub)")

    # ✅ DB UNIQUE key is (provider, provider_subject)
    oauth = (
        db.query(OAuthAccount)
        .filter(OAuthAccount.provider == "google")
        .filter(OAuthAccount.provider_subject == sub)
        .first()
    )

    if oauth:
        user = db.query(User).filter(User.id == oauth.user_id).first()
        if not user:
            raise ValueError("OAuth account exists but user row is missing")

        # Optional: update profile fields
        if name and getattr(user, "display_name", None) != name:
            user.display_name = name
        if picture and getattr(user, "avatar_url", None) != picture:
            user.avatar_url = picture

        # Optional: update email_at_auth
        if email and oauth.email_at_auth != email:
            oauth.email_at_auth = email

        db.commit()
    else:
        # Create user
        user = User(display_name=name, avatar_url=picture)
        db.add(user)
        db.commit()
        db.refresh(user)

        # Create oauth account
        oauth = OAuthAccount(
            user_id=user.id,
            provider="google",
            provider_subject=sub,     # ✅ required
            email_at_auth=email,      # ✅ correct column name
            provider_user_id=sub,     # optional, but useful for your existing index
        )
        db.add(oauth)
        db.commit()

    _ = session_id  # reserved for Flow B (claim anon chats)

    return {
        "access_token": create_access_token(user.id),
        "refresh_token": create_refresh_token(user.id),
        "user": {
            "id": str(user.id),
            "name": getattr(user, "display_name", None),
            "avatar_url": getattr(user, "avatar_url", None),
        },
    }