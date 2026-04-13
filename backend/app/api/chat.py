from __future__ import annotations

import json
import os
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal, Optional

from fastapi import APIRouter, HTTPException, Request
from jose import JWTError, jwt
from openai import OpenAI
from pydantic import BaseModel, Field
from sqlalchemy import JSON, Column, DateTime, MetaData, String, Table, Text, create_engine, select

router = APIRouter()


# ---------------------------
# OpenAI client getter
# ---------------------------
def _get_client() -> OpenAI:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY is not set in the backend environment.")
    return OpenAI(api_key=api_key)


# ---------------------------
# DB persistence
# ---------------------------
# Requires DATABASE_URL, e.g. postgresql+psycopg://user:pass@db:5432/prepareup
DATABASE_URL = os.getenv("DATABASE_URL")
_ENGINE = None
_METADATA = MetaData()

conversations = Table(
    "chat_conversations",
    _METADATA,
    Column("id", String(36), primary_key=True),
    Column("title", String(255), nullable=True),
    # Owner: either logged-in user id, or anon cookie id.
    Column("owner_user_id", String(128), nullable=True),
    Column("owner_anon_id", String(128), nullable=True),
    # Source metadata needed to reopen a saved thread.
    Column("source_session_id", String(128), nullable=True),
    Column("source_files", JSON, nullable=True),
    Column("combined_text_len", String(32), nullable=True),
    Column("created_at", DateTime(timezone=True), nullable=False),
    Column("updated_at", DateTime(timezone=True), nullable=False),
)

messages_tbl = Table(
    "chat_messages",
    _METADATA,
    Column("id", String(36), primary_key=True),
    Column("conversation_id", String(36), nullable=False),
    Column("role", String(16), nullable=False),
    Column("content", Text, nullable=False),
    Column("meta", JSON, nullable=True),
    Column("created_at", DateTime(timezone=True), nullable=False),
)


def _get_engine():
    global _ENGINE
    if _ENGINE is not None:
        return _ENGINE
    if not DATABASE_URL:
        return None
    _ENGINE = create_engine(DATABASE_URL, pool_pre_ping=True)
    _METADATA.create_all(_ENGINE)
    return _ENGINE


def _require_engine():
    engine = _get_engine()
    if engine is None:
        raise HTTPException(
            status_code=500,
            detail="DATABASE_URL is not set; cannot persist or retrieve chats from the database.",
        )
    return engine


# ---------------------------
# Helpers
# ---------------------------
def _now() -> datetime:
    return datetime.now(timezone.utc)


def _jwt_secret() -> str:
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


def _try_decode(token: str) -> dict[str, Any]:
    try:
        return jwt.decode(token, _jwt_secret(), algorithms=[_jwt_alg()])
    except JWTError:
        return {}


def _get_owner_ids(request: Request) -> tuple[str | None, str | None]:
    anon_id = (request.cookies.get("pu_session_id") or "").strip() or None

    owner_user_id = None
    token = _extract_bearer_token(request) or request.cookies.get("pu_refresh_token")
    if token:
        payload = _try_decode(token)
        sub = payload.get("sub")
        if sub:
            owner_user_id = str(sub).strip()

    return owner_user_id, anon_id


def _ensure_conversation(
    engine,
    conversation_id: str,
    title: Optional[str],
    owner_user_id: Optional[str],
    owner_anon_id: Optional[str],
    source_session_id: Optional[str] = None,
    source_files: Optional[list[dict[str, Any]]] = None,
    combined_text_len: Optional[int] = None,
):
    now = _now()
    with engine.begin() as conn:
        row = conn.execute(select(conversations.c.id).where(conversations.c.id == conversation_id)).first()
        if row is None:
            conn.execute(
                conversations.insert().values(
                    id=conversation_id,
                    title=title,
                    owner_user_id=owner_user_id,
                    owner_anon_id=owner_anon_id,
                    source_session_id=source_session_id,
                    source_files=source_files,
                    combined_text_len=str(combined_text_len) if combined_text_len is not None else None,
                    created_at=now,
                    updated_at=now,
                )
            )
        else:
            values: dict[str, Any] = {"updated_at": now}
            if title:
                values["title"] = title
            if owner_user_id:
                values["owner_user_id"] = owner_user_id
            if owner_anon_id:
                values["owner_anon_id"] = owner_anon_id
            if source_session_id:
                values["source_session_id"] = source_session_id
            if source_files is not None:
                values["source_files"] = source_files
            if combined_text_len is not None:
                values["combined_text_len"] = str(combined_text_len)

            conn.execute(
                conversations.update().where(conversations.c.id == conversation_id).values(**values)
            )


def _insert_message(
    engine,
    conversation_id: str,
    role: str,
    content: str,
    meta: Optional[dict[str, Any]] = None,
):
    now = _now()
    with engine.begin() as conn:
        conn.execute(
            messages_tbl.insert().values(
                id=str(uuid.uuid4()),
                conversation_id=conversation_id,
                role=role,
                content=content,
                meta=meta,
                created_at=now,
            )
        )
        conn.execute(
            conversations.update().where(conversations.c.id == conversation_id).values(updated_at=now)
        )


def _replace_messages(engine, conversation_id: str, messages: list[dict[str, Any]]):
    now = _now()
    with engine.begin() as conn:
        conn.execute(messages_tbl.delete().where(messages_tbl.c.conversation_id == conversation_id))
        for m in messages:
            content = str(m.get("content") or "").strip()
            role = str(m.get("role") or "").strip()
            if not content or role not in ("user", "ai"):
                continue
            conn.execute(
                messages_tbl.insert().values(
                    id=str(uuid.uuid4()),
                    conversation_id=conversation_id,
                    role=role,
                    content=content,
                    meta={"source": "sync"},
                    created_at=now,
                )
            )
        conn.execute(
            conversations.update().where(conversations.c.id == conversation_id).values(updated_at=now)
        )


TMP_DIR = Path("/tmp/prepareup_sessions")
SESSION_TTL_SECONDS = 60 * 30


def _read_session_text(session_id: str) -> str:
    p = TMP_DIR / f"{session_id}.txt"
    if not p.exists():
        raise HTTPException(status_code=404, detail="Session not found or expired.")

    raw = p.read_text(encoding="utf-8")
    first_nl = raw.find("\n")
    if first_nl == -1:
        raise HTTPException(status_code=500, detail="Corrupt session store.")

    try:
        created_ts = int(raw[:first_nl])
    except Exception:
        raise HTTPException(status_code=500, detail="Corrupt session timestamp.")

    if (int(time.time()) - created_ts) > SESSION_TTL_SECONDS:
        try:
            p.unlink(missing_ok=True)
        except Exception:
            pass
        raise HTTPException(status_code=404, detail="Session expired.")

    return raw[first_nl + 1 :]


class ChatTurn(BaseModel):
    role: Literal["user", "ai"]
    content: str = Field(min_length=1, max_length=10_000)


class ChatRequest(BaseModel):
    session_id: str
    thread_id: Optional[str] = None
    thread_title: Optional[str] = None
    message: str = Field(min_length=1, max_length=10_000)
    history: Optional[list[ChatTurn]] = Field(default=None)


class ThreadOut(BaseModel):
    id: str
    title: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class MessageOut(BaseModel):
    id: str
    role: Literal["user", "ai"]
    content: str
    created_at: datetime


class SyncMessage(BaseModel):
    role: Literal["user", "ai"]
    content: str = Field(min_length=1, max_length=50_000)


class ChatSyncRequest(BaseModel):
    session_id: str
    thread_id: Optional[str] = None
    thread_title: Optional[str] = None
    messages: list[SyncMessage] = Field(default_factory=list)
    source_session_id: Optional[str] = None
    source_files: list[dict[str, Any]] = Field(default_factory=list)
    combined_text_len: Optional[int] = None


@router.post("/chat")
def chat(req: ChatRequest, request: Request):
    corpus = _read_session_text(req.session_id).strip()
    if not corpus:
        raise HTTPException(status_code=400, detail="No extracted text available for this session.")

    corpus = corpus[:60_000]

    history = req.history or []
    history = [t for t in history if getattr(t, "role", None) in ("user", "ai") and getattr(t, "content", "").strip()]
    history = history[-12:]

    engine = _require_engine()
    conversation_id = (req.thread_id or "").strip() or str(uuid.uuid4())
    title = (req.thread_title or "").strip() or None

    owner_user_id, owner_anon_id = _get_owner_ids(request)
    if not owner_user_id and not owner_anon_id:
        raise HTTPException(status_code=401, detail="No user or anonymous session found.")

    _ensure_conversation(
        engine,
        conversation_id,
        title,
        owner_user_id,
        owner_anon_id,
        source_session_id=req.session_id,
        source_files=None,
        combined_text_len=len(corpus),
    )

    _insert_message(engine, conversation_id, role="user", content=req.message, meta={"source": "dashboard"})

    system_prompt = (
        "You are Prepare-Up, a study assistant. The user's uploaded DOCUMENTS are the primary source and the topic boundary. "
        "Answer questions in a way that directly helps the user understand, study, or work with the DOCUMENTS and any generated outputs (study guide/flashcards/podcast/script). "
        "\n\n"
        "Rules:\n"
        "1) Prefer DOCUMENTS first: when the answer is present in the DOCUMENTS, answer ONLY from them.\n"
        "2) Limited outside knowledge is allowed ONLY to clarify, define, or give helpful context for something that is already in the DOCUMENTS (e.g., define a term, explain a concept, provide an example).\n"
        "3) If you use outside/general knowledge, label it clearly with 'General knowledge:' and keep it brief.\n"
        "4) Do NOT go off-topic: if the user's question is unrelated to the DOCUMENTS, refuse and say: 'That seems unrelated to your uploaded documents. Ask about the documents or upload relevant material.'\n"
        "5) If the answer cannot be found in the DOCUMENTS and outside knowledge would be speculative or unsafe, say: 'I can't find that in your uploaded documents.' and suggest what to upload or what to clarify.\n"
        "6) When the user asks to modify a previous output (study guide/flashcards/podcast/script), apply the modification but keep it faithful to the DOCUMENTS; any additions beyond the documents must be explicitly labeled as General knowledge."
    )

    input_messages: list[dict[str, str]] = [
        {"role": "system", "content": system_prompt},
        {
            "role": "user",
            "content": (
                "Return ONLY valid JSON. No extra text.\n\n"
                'You MUST respond with a JSON object of the form: {"type":"chat","answer":"..."}.\n\n'
                "DOCUMENTS (use as the only source):\n"
                f"{corpus}\n\n"
                "Conversation so far (may reference outputs you generated):"
            ),
        },
    ]

    for t in history:
        input_messages.append(
            {
                "role": "assistant" if t.role == "ai" else "user",
                "content": t.content,
            }
        )

    input_messages.append({"role": "user", "content": req.message})

    model_name = os.getenv("OPENAI_CHAT_MODEL", os.getenv("OPENAI_MODEL", "gpt-5-nano"))

    resp = _get_client().chat.completions.create(
        model=model_name,
        messages=input_messages,
        response_format={"type": "json_object"},
    )

    content = (resp.choices[0].message.content or "").strip()
    try:
        payload = json.loads(content)
    except Exception:
        raise HTTPException(status_code=502, detail=f"Model returned invalid JSON: {content[:500]}")

    if not isinstance(payload, dict):
        raise HTTPException(status_code=502, detail="Model returned non-object JSON.")

    if payload.get("type") != "chat":
        payload["type"] = "chat"

    if "answer" not in payload:
        payload["answer"] = payload.get("text") or payload.get("message") or ""

    answer = str(payload.get("answer", "")).strip()
    if not answer:
        raise HTTPException(status_code=502, detail="Model returned empty answer.")

    _insert_message(engine, conversation_id, role="ai", content=answer, meta={"model": model_name})

    payload["thread_id"] = conversation_id
    return payload


@router.get("/chat/threads")
def list_threads(request: Request):
    engine = _get_engine()
    if engine is None:
        raise HTTPException(status_code=500, detail="DATABASE_URL is not set; cannot persist chats to the database.")

    owner_user_id, owner_anon_id = _get_owner_ids(request)

    with engine.begin() as conn:
        q = select(
            conversations.c.id,
            conversations.c.title,
            conversations.c.updated_at,
            conversations.c.source_session_id,
            conversations.c.source_files,
            conversations.c.combined_text_len,
        )

        if owner_user_id:
            q = q.where(conversations.c.owner_user_id == owner_user_id)
        else:
            q = q.where(conversations.c.owner_anon_id == owner_anon_id)

        q = q.order_by(conversations.c.updated_at.desc())
        rows = conn.execute(q).all()

    return {
        "threads": [
            {
                "id": r.id,
                "title": r.title,
                "updated_at": r.updated_at.isoformat(),
                "source_session_id": r.source_session_id,
                "source_files": r.source_files or [],
                "combined_text_len": int(r.combined_text_len) if r.combined_text_len not in (None, "") else 0,
            }
            for r in rows
        ]
    }


@router.get("/chat/threads/{thread_id}")
def get_thread(thread_id: str, request: Request):
    engine = _require_engine()
    owner_user_id, owner_anon_id = _get_owner_ids(request)
    if not owner_user_id and not owner_anon_id:
        raise HTTPException(status_code=401, detail="Not authenticated")

    with engine.begin() as conn:
        convo = conn.execute(
            select(
                conversations.c.id,
                conversations.c.title,
                conversations.c.owner_user_id,
                conversations.c.owner_anon_id,
                conversations.c.source_session_id,
                conversations.c.source_files,
                conversations.c.combined_text_len,
                conversations.c.created_at,
                conversations.c.updated_at,
            ).where(conversations.c.id == thread_id)
        ).mappings().first()

        if convo is None:
            raise HTTPException(status_code=404, detail="Thread not found.")

        if owner_user_id:
            if convo["owner_user_id"] != owner_user_id:
                raise HTTPException(status_code=403, detail="Not allowed.")
        else:
            if not owner_anon_id or convo["owner_anon_id"] != owner_anon_id:
                raise HTTPException(status_code=403, detail="Not allowed.")

        msgs = conn.execute(
            select(
                messages_tbl.c.id,
                messages_tbl.c.role,
                messages_tbl.c.content,
                messages_tbl.c.created_at,
            )
            .where(messages_tbl.c.conversation_id == thread_id)
            .order_by(messages_tbl.c.created_at.asc())
        ).mappings().all()

    return {
        "thread": {
            "id": convo["id"],
            "title": convo["title"],
            "source_session_id": convo["source_session_id"],
            "source_files": convo["source_files"] or [],
            "combined_text_len": int(convo["combined_text_len"]) if convo["combined_text_len"] not in (None, "") else 0,
            "created_at": convo["created_at"],
            "updated_at": convo["updated_at"],
        },
        "messages": [
            {
                "id": m["id"],
                "role": m["role"],
                "content": m["content"],
                "created_at": m["created_at"],
            }
            for m in msgs
        ],
    }


@router.post("/chat/claim")
def claim(request: Request):
    engine = _get_engine()
    if engine is None:
        raise HTTPException(status_code=500, detail="DATABASE_URL is not set; cannot persist chats to the database.")

    owner_user_id, owner_anon_id = _get_owner_ids(request)

    if not owner_user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")

    if not owner_anon_id:
        return {"ok": True, "claimed": 0}

    now = _now()

    with engine.begin() as conn:
        res = conn.execute(
            conversations.update()
            .where(conversations.c.owner_anon_id == owner_anon_id)
            .where(conversations.c.owner_user_id.is_(None))
            .values(owner_user_id=owner_user_id, updated_at=now)
        )
        claimed = int(getattr(res, "rowcount", 0) or 0)

    return {"ok": True, "claimed": claimed}


class SyncMessage(BaseModel):
    role: Literal["user", "ai"]
    content: str = Field(min_length=1, max_length=50_000)


class ChatSyncRequest(BaseModel):
    session_id: str
    thread_id: Optional[str] = None
    thread_title: Optional[str] = None
    messages: list[SyncMessage] = Field(default_factory=list)
    source_session_id: Optional[str] = None
    source_files: list[dict[str, Any]] = Field(default_factory=list)
    combined_text_len: Optional[int] = None


@router.post("/chat/sync")
def sync_chat(req: ChatSyncRequest, request: Request):
    _ = _read_session_text(req.session_id).strip()

    engine = _require_engine()

    conversation_id = (req.thread_id or "").strip() or str(uuid.uuid4())
    title = (req.thread_title or "").strip() or None

    owner_user_id, owner_anon_id = _get_owner_ids(request)
    _ensure_conversation(
        engine,
        conversation_id,
        title,
        owner_user_id,
        owner_anon_id,
        source_session_id=(req.source_session_id or req.session_id),
        source_files=req.source_files,
        combined_text_len=req.combined_text_len,
    )

    snapshot = [
        {"role": m.role, "content": (m.content or "").strip()}
        for m in req.messages
        if (m.content or "").strip()
    ]
    _replace_messages(engine, conversation_id, snapshot)

    return {"ok": True, "thread_id": conversation_id, "inserted": len(snapshot)}