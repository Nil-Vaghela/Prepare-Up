from __future__ import annotations

from fastapi import APIRouter, Request, HTTPException, Depends, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.core.security.auth_service import login_with_google as login_with_google_service

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
async def me(request: Request):
    raise HTTPException(status_code=501, detail="Not implemented yet (Task 91).")


@router.post("/auth/refresh")
async def refresh(request: Request):
    raise HTTPException(status_code=501, detail="Not implemented yet (Task 90).")


@router.post("/auth/logout")
async def logout(request: Request):
    raise HTTPException(status_code=501, detail="Not implemented yet (Task 92).")