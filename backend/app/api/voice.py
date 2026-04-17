from __future__ import annotations

import os
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from app.api.chat import _read_session_text, _verify_session_owner

router = APIRouter(tags=["voice"])

REALTIME_MODEL = "gpt-4o-realtime-preview"

# ---------------------------------------------------------------------------
# System instructions for the voice tutor
# ---------------------------------------------------------------------------

_TUTOR_BASE_NO_DOC = """You are PrepareUp — an AI study tutor in real-time voice mode.

No study material has been uploaded for this session.

Tell the student clearly: "It looks like no document has been uploaded yet. Please go back and upload your study material — a PDF, notes, or any document — and then start a new voice session. I can only teach from your uploaded content."

Do not answer any general knowledge questions. Do not make up study material.
If the student asks anything, repeat the same message kindly and encourage them to upload first.
"""

_TUTOR_WITH_DOC = """You are PrepareUp — a warm, expert AI study tutor in real-time voice mode.

Your job is to teach the student using the study material provided below as your primary source.

GROUNDING RULES:
- The uploaded document defines the SCOPE of this session — its topics, concepts, and subject matter.
- Any concept, term, or subject that the document mentions, references, or is about is FAIR GAME to explain fully. Use your knowledge to explain it clearly and deeply.
- Example: if the document is about machine learning, you can fully explain what machine learning is, how it works, its algorithms, etc. — even if the document only briefly mentions a term.
- Example: if the document is a resume listing "Python" and "data science", you can explain Python and data science as they relate to that person's background.
- ONLY refuse and redirect if the student asks about something COMPLETELY unrelated to the document's subject matter — for example, asking for a pasta recipe when the document is about machine learning. In that case say: "That's a bit outside what we're studying today. Let's stay focused on your material — what would you like to explore?"
- Never refuse a question that is about a topic the document covers, even if the exact answer isn't a direct quote from the document.
- Always anchor your answers to the document when possible: "Your document covers this — here's what that means in practice..."

Speaking style rules (CRITICAL — you are speaking aloud, not writing):
- Keep each response to 2–4 sentences maximum. Audio must be concise and listenable.
- Never use bullet points, markdown, or formatted lists. Speak in natural flowing sentences.
- Use natural transitions: "So basically...", "Here's the key idea...", "In your document...", "Does that click?"
- Ask a check-in question every 3rd response: "Want me to go deeper on that?" / "Should I explain it differently?"
- If the student seems confused, say "Let me try a simpler angle on this."
- Celebrate genuine progress: "Exactly right." / "You've got it." / "That's a great connection."

Teaching rules:
- Reference the document whenever you can: "Your flyer mentions X, which means..."
- Break complex topics into short spoken turns. Never dump everything at once.
- Never respond longer than 45 seconds of speech.
- Use everyday analogies to explain technical concepts from the document.

--- STUDENT'S STUDY MATERIAL ---
{corpus}
--- END OF STUDY MATERIAL ---

Teach everything within the scope of the above document. Use the document as your anchor, but explain its topics fully.
"""


def _build_instructions(corpus: Optional[str] = None) -> str:
    if corpus and corpus.strip():
        return _TUTOR_WITH_DOC.format(corpus=corpus.strip()[:8_000])
    return _TUTOR_BASE_NO_DOC


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

ALLOWED_VOICES = {"alloy", "ash", "ballad", "coral", "echo", "sage", "shimmer", "verse", "marin", "cedar"}


class VoiceSessionRequest(BaseModel):
    session_id: Optional[str] = Field(default=None, description="PrepareUp upload session to ground the tutor in")
    voice: str = Field(default="alloy", description="OpenAI voice name")


class VoiceSessionResponse(BaseModel):
    client_secret: str
    expires_at: int
    openai_session_id: str
    model: str


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------

@router.post("/voice/session", response_model=VoiceSessionResponse)
async def create_voice_session(req: VoiceSessionRequest, request: Request):
    """
    Creates an OpenAI Realtime ephemeral session token.
    The frontend uses this token directly for WebRTC — the permanent API key
    never leaves the backend.
    """
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY is not configured on the server.")

    voice = req.voice if req.voice in ALLOWED_VOICES else "alloy"

    # Optionally ground the tutor in the student's uploaded material
    corpus: Optional[str] = None
    if req.session_id:
        try:
            _verify_session_owner(req.session_id, request)
            raw = _read_session_text(req.session_id).strip()
            if raw:
                corpus = raw
        except Exception:
            # Session not found or not owned — silently continue without context
            pass

    instructions = _build_instructions(corpus)

    payload = {
        "model": REALTIME_MODEL,
        "voice": voice,
        "instructions": instructions,
        "modalities": ["audio", "text"],
        "input_audio_transcription": {"model": "whisper-1"},
        "turn_detection": {
            "type": "server_vad",
            "threshold": 0.65,
            "prefix_padding_ms": 300,
            "silence_duration_ms": 700,
            "create_response": True,
        },
        "temperature": 0.8,
    }

    async with httpx.AsyncClient(timeout=20.0) as client:
        resp = await client.post(
            "https://api.openai.com/v1/realtime/sessions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json=payload,
        )

    if resp.status_code != 200:
        raise HTTPException(
            status_code=502,
            detail=f"OpenAI Realtime session creation failed ({resp.status_code}): {resp.text[:400]}",
        )

    data = resp.json()

    client_secret = data.get("client_secret", {})
    if not client_secret.get("value"):
        raise HTTPException(status_code=502, detail="OpenAI returned no ephemeral token.")

    return VoiceSessionResponse(
        client_secret=client_secret["value"],
        expires_at=int(client_secret.get("expires_at", 0)),
        openai_session_id=data.get("id", ""),
        model=REALTIME_MODEL,
    )
