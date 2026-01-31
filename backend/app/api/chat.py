

from __future__ import annotations

import json
import time
from pathlib import Path
from typing import List, Literal, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from openai import OpenAI

router = APIRouter()


def _get_client() -> OpenAI:
    try:
        return OpenAI()
    except Exception:
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY is not set in the backend environment.")

TMP_DIR = Path("/tmp/prepareup_sessions")
SESSION_TTL_SECONDS = 60 * 30  # 30 minutes; keep consistent with upload/generate


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
    message: str = Field(min_length=1, max_length=10_000)
    history: Optional[List[ChatTurn]] = Field(default=None)


@router.post("/chat")
def chat(req: ChatRequest):
    corpus = _read_session_text(req.session_id).strip()
    if not corpus:
        raise HTTPException(status_code=400, detail="No extracted text available for this session.")

    # Keep it sane; later you can do RAG/chunking.
    corpus = corpus[:60_000]

    # Keep only the most recent turns to avoid token blowups.
    history = req.history or []
    history = history[-12:]

    # Strong grounding rules: only answer from the uploaded docs, with limited outside knowledge for clarification.
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

    # Structured output for predictable UI.
    schema = {
        "name": "chat_answer_schema",
        "schema": {
            "type": "object",
            "properties": {
                "type": {"type": "string", "enum": ["chat"]},
                "answer": {"type": "string"},
            },
            "required": ["type", "answer"],
            "additionalProperties": False,
        },
    }

    # Build model input.
    input_messages = [{"role": "system", "content": system_prompt}]

    # Provide documents once per request.
    input_messages.append(
        {
            "role": "user",
            "content": (
                "DOCUMENTS (use as the only source):\n"
                f"{corpus}\n\n"
                "Conversation so far (may reference outputs you generated):"
            ),
        }
    )

    # Add short history (map ai->assistant for the model).
    for t in history:
        input_messages.append(
            {
                "role": "assistant" if t.role == "ai" else "user",
                "content": t.content,
            }
        )

    # Current user message.
    input_messages.append(
        {
            "role": "user",
            "content": req.message,
        }
    )

    resp = _get_client().responses.create(
        model="gpt-5-nano",  # keep consistent with generate.py; adjust if needed
        input=input_messages,
        text={
            "format": {
                "type": "json_schema",
                "name": schema["name"],
                "schema": schema["schema"],
            }
        },
    )

    try:
        payload = json.loads(resp.output_text)
    except Exception:
        raise HTTPException(status_code=502, detail="Model returned invalid JSON.")

    return payload