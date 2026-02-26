from __future__ import annotations

from dataclasses import dataclass
import os

from google.oauth2 import id_token as google_id_token
from google.auth.transport import requests as google_requests


@dataclass(frozen=True)
class GoogleProfile:
    sub: str
    email: str | None
    name: str | None
    picture: str | None


def verify_google_id_token(id_token: str) -> GoogleProfile:
    
    client_id = os.getenv("GOOGLE_CLIENT_ID")
    if not client_id:
        raise ValueError("Missing GOOGLE_CLIENT_ID in environment.")

    try:
        # This verifies signature, expiry, issuer, and audience (client_id).
        info = google_id_token.verify_oauth2_token(
            id_token,
            google_requests.Request(),
            audience=client_id,
        )
    except Exception as e:
        # Fail closed: any verification error must reject login
        raise ValueError(f"Invalid Google id_token: {e}") from e

    sub = info.get("sub")
    if not sub:
        raise ValueError("Google token missing 'sub' claim.")

    return GoogleProfile(
        sub=sub,
        email=info.get("email"),
        name=info.get("name"),
        picture=info.get("picture"),
    )