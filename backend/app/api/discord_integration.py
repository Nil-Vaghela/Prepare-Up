import asyncio
import os
import secrets
from typing import Any, Dict, Optional
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, HTTPException, Request, Query
from fastapi.responses import RedirectResponse, JSONResponse

router = APIRouter()

DISCORD_AUTH_BASE = "https://discord.com/api/oauth2/authorize"
DISCORD_TOKEN_URL = "https://discord.com/api/oauth2/token"
DISCORD_API_BASE = "https://discord.com/api"
DISCORD_API_V10 = "https://discord.com/api/v10"


def _env(name: str, default: Optional[str] = None) -> str:
    v = os.getenv(name, default)
    if v is None:
        raise RuntimeError(f"Missing required env var: {name}")
    return v


def _frontend_base() -> str:
    return os.getenv("FRONTEND_BASE_URL", "http://localhost:3000").rstrip("/")


def _redirect_uri() -> str:
    # Must match the Discord Developer Portal redirect exactly
    return _env("DISCORD_REDIRECT_URI", "http://localhost:8000/api/auth/discord/callback")


def _client_id() -> str:
    return _env("DISCORD_CLIENT_ID")


def _client_secret() -> str:
    return _env("DISCORD_CLIENT_SECRET")


def _bot_token() -> str:
    return _env("DISCORD_BOT_TOKEN")


def _bot_headers() -> Dict[str, str]:
    return {"Authorization": f"Bot {_bot_token()}"}


async def _post_form_with_retries(url: str, data: Dict[str, Any], headers: Dict[str, str], *, max_retries: int = 5):
    """POST x-www-form-urlencoded with basic retry/backoff for Discord rate limits."""
    backoff = 1.0
    async with httpx.AsyncClient(timeout=20) as client:
        for attempt in range(max_retries):
            resp = await client.post(url, data=data, headers=headers)

            # Discord sometimes returns 429 with Retry-After
            if resp.status_code == 429:
                retry_after = resp.headers.get("Retry-After")
                try:
                    wait_s = float(retry_after) if retry_after is not None else backoff
                except ValueError:
                    wait_s = backoff
                await asyncio.sleep(min(wait_s, 15.0))
                backoff = min(backoff * 2.0, 10.0)
                continue

            # Sometimes token endpoint returns 400 invalid_request with a rate limit message
            if resp.status_code == 400:
                txt = resp.text or ""
                if "rate limited" in txt.lower() or "too many tokens" in txt.lower():
                    await asyncio.sleep(min(backoff, 10.0))
                    backoff = min(backoff * 2.0, 10.0)
                    continue

            return resp

    return resp


def _get_session(request: Request) -> Dict[str, Any]:
    sess = getattr(request, "session", None)
    if sess is None:
        raise RuntimeError("SessionMiddleware is not configured. Add SessionMiddleware in main.py.")
    return sess


@router.get("/auth/discord")
async def discord_auth(request: Request):
    """
    Redirect user to Discord OAuth.
    Scopes:
      - identify: basic profile
      - guilds: list servers user is in
    """
    state = secrets.token_urlsafe(32)
    sess = _get_session(request)
    sess["discord_oauth_state"] = state

    params = {
        "client_id": _client_id(),
        "redirect_uri": _redirect_uri(),
        "response_type": "code",
        "scope": "identify guilds",
        "state": state,
        "prompt": "consent",
    }
    url = f"{DISCORD_AUTH_BASE}?{urlencode(params)}"
    return RedirectResponse(url, status_code=302)


@router.get("/auth/discord/callback")
async def discord_callback(
    request: Request,
    code: Optional[str] = None,
    state: Optional[str] = None,
    error: Optional[str] = None,
):
    if error:
        return RedirectResponse(f"{_frontend_base()}/dashboard?discord=error", status_code=302)

    if not code or not state:
        raise HTTPException(status_code=400, detail="Missing code/state from Discord callback")

    sess = _get_session(request)
    expected = sess.get("discord_oauth_state")
    if not expected or expected != state:
        raise HTTPException(status_code=400, detail="Invalid OAuth state")

    data = {
        "client_id": _client_id(),
        "client_secret": _client_secret(),
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": _redirect_uri(),
    }
    headers = {"Content-Type": "application/x-www-form-urlencoded"}

    resp = await _post_form_with_retries(DISCORD_TOKEN_URL, data=data, headers=headers, max_retries=6)
    if resp.status_code >= 400:
        # Avoid showing raw JSON in the browser; send user back with an error flag
        return RedirectResponse(f"{_frontend_base()}/dashboard?discord=error", status_code=302)
    token = resp.json()

    sess["discord"] = {
        "access_token": token.get("access_token"),
        "refresh_token": token.get("refresh_token"),
        "token_type": token.get("token_type", "Bearer"),
        "scope": token.get("scope"),
        "expires_in": token.get("expires_in"),
    }
    sess.pop("discord_oauth_state", None)

    return RedirectResponse(f"{_frontend_base()}/dashboard?discord=connected", status_code=302)


@router.get("/discord/status")
async def discord_status(request: Request):
    sess = _get_session(request)
    connected = bool((sess.get("discord") or {}).get("access_token"))
    return JSONResponse({"connected": connected})


@router.post("/discord/logout")
async def discord_logout(request: Request):
    sess = _get_session(request)
    sess.pop("discord", None)
    return JSONResponse({"ok": True})


async def _discord_api_get(access_token: str, path: str):
    url = f"{DISCORD_API_BASE}{path}"
    headers = {"Authorization": f"Bearer {access_token}"}
    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.get(url, headers=headers)
        if resp.status_code >= 400:
            raise HTTPException(status_code=resp.status_code, detail=resp.text)
        return resp.json()


@router.get("/discord/me")
async def discord_me(request: Request):
    sess = _get_session(request)
    access = (sess.get("discord") or {}).get("access_token")
    if not access:
        raise HTTPException(status_code=401, detail="Discord not connected")
    return await _discord_api_get(access, "/users/@me")


@router.get("/discord/guilds")
async def discord_guilds(request: Request):
    sess = _get_session(request)
    access = (sess.get("discord") or {}).get("access_token")
    if not access:
        raise HTTPException(status_code=401, detail="Discord not connected")

    guilds = await _discord_api_get(access, "/users/@me/guilds")

    simplified = [
        {"id": g.get("id"), "name": g.get("name"), "owner": g.get("owner"), "permissions": g.get("permissions")}
        for g in (guilds or [])
    ]
    return JSONResponse({"guilds": simplified})


@router.get("/discord/bot/install-url")
async def discord_bot_install_url():
    """Returns a URL that lets the user add the PrepareUp bot to a server."""
    client_id = _client_id()
    # Minimal read access: View Channels (1024) + Read Message History (65536) = 66560
    permissions = int(os.getenv("DISCORD_BOT_PERMISSIONS", "66560"))
    scopes = "bot applications.commands"

    params = {
        "client_id": client_id,
        "permissions": str(permissions),
        "scope": scopes,
    }
    return JSONResponse({"url": f"{DISCORD_AUTH_BASE}?{urlencode(params)}"})


@router.get("/discord/bot/guilds/{guild_id}/channels")
async def discord_bot_list_channels(guild_id: str):
    """Lists channels in a guild that the bot can see."""
    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.get(f"{DISCORD_API_V10}/guilds/{guild_id}/channels", headers=_bot_headers())

    if resp.status_code == 429:
        raise HTTPException(status_code=429, detail="Discord rate limited. Try again in a moment.")
    if resp.status_code >= 400:
        raise HTTPException(status_code=resp.status_code, detail=resp.text)

    chans = resp.json() or []
    # Keep text + announcement channels
    filtered = [c for c in chans if c.get("type") in (0, 5)]
    simplified = [
        {"id": c.get("id"), "name": c.get("name"), "type": c.get("type"), "parent_id": c.get("parent_id")}
        for c in filtered
    ]
    return JSONResponse({"channels": simplified})


@router.get("/discord/bot/channels/{channel_id}/messages")
async def discord_bot_get_messages(
    channel_id: str,
    limit: int = Query(100, ge=1, le=100),
    before: Optional[str] = None,
):
    """Fetch up to 100 messages from a channel (bot token). Use `before` for pagination."""
    params: Dict[str, Any] = {"limit": limit}
    if before:
        params["before"] = before

    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.get(
            f"{DISCORD_API_V10}/channels/{channel_id}/messages",
            headers=_bot_headers(),
            params=params,
        )

    if resp.status_code == 429:
        raise HTTPException(status_code=429, detail="Discord rate limited. Try again in a moment.")
    if resp.status_code >= 400:
        raise HTTPException(status_code=resp.status_code, detail=resp.text)

    return JSONResponse({"messages": resp.json()})


@router.post("/discord/bot/channels/{channel_id}/import")
async def discord_bot_import_channel(
    channel_id: str,
    max_messages: int = Query(500, ge=1, le=5000),
):
    """Fetch messages from a channel and return a plain-text transcript for ingestion."""
    collected: list[Dict[str, Any]] = []
    before: Optional[str] = None

    async with httpx.AsyncClient(timeout=30) as client:
        while len(collected) < max_messages:
            params: Dict[str, Any] = {"limit": 100}
            if before:
                params["before"] = before

            resp = await client.get(
                f"{DISCORD_API_V10}/channels/{channel_id}/messages",
                headers=_bot_headers(),
                params=params,
            )

            if resp.status_code == 429:
                retry_after = resp.headers.get("Retry-After")
                try:
                    wait_s = float(retry_after) if retry_after else 1.0
                except ValueError:
                    wait_s = 1.0
                await asyncio.sleep(min(wait_s, 15.0))
                continue

            if resp.status_code >= 400:
                raise HTTPException(status_code=resp.status_code, detail=resp.text)

            batch = resp.json() or []
            if not batch:
                break

            collected.extend(batch)
            before = batch[-1].get("id")

            if len(batch) < 100:
                break

    # Oldest -> newest for readable transcript
    collected = list(reversed(collected))

    lines: list[str] = []
    for m in collected:
        ts = m.get("timestamp") or ""
        author = (m.get("author") or {}).get("username") or "unknown"
        content = (m.get("content") or "").strip()

        # Skip empty messages (attachments only) for now
        if not content:
            continue

        lines.append(f"{ts} - {author}: {content}")

    transcript = "\n".join(lines)
    return JSONResponse({"channel_id": channel_id, "count": len(collected), "text": transcript})