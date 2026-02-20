from __future__ import annotations

from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel

router = APIRouter(tags=["auth"])


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
# Endpoints (stubs for now)
# ---------------------------

@router.post("/auth/google", response_model=LoginResponse)
async def login_with_google(payload: GoogleLoginRequest, request: Request):
    """
    Sprint 2: Google OAuth login endpoint.

    In Task 89 we will:
      - Verify the Google ID token (Task 88)
      - Upsert user + oauth_account
      - Issue access JWT + refresh cookie (JWT access + refresh)
      - Claim any anon-session data owned by pu_session_id
    """
    # STUB for Task 85 scaffolding
    raise HTTPException(status_code=501, detail="Not implemented yet (Task 89).")


@router.get("/auth/me", response_model=UserOut)
async def me(request: Request):
    """
    Returns current user (requires valid access token).
    Task 91 will implement access token parsing and return the real user.
    """
    raise HTTPException(status_code=501, detail="Not implemented yet (Task 91).")


@router.post("/auth/refresh")
async def refresh(request: Request):
    """
    Refresh endpoint (Task 90). Will:
      - Read refresh cookie
      - Validate + rotate refresh token
      - Return new access token
    """
    raise HTTPException(status_code=501, detail="Not implemented yet (Task 90).")


@router.post("/auth/logout")
async def logout(request: Request):
    """
    Logout endpoint (Task 92). Will revoke refresh token and clear cookie.
    """
    raise HTTPException(status_code=501, detail="Not implemented yet (Task 92).")