from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Literal, Optional

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
SESSION_TTL_SECONDS = 60 * 30

def _read_session_text(session_id: str) -> str:
    p = TMP_DIR / f"{session_id}.txt"
    if not p.exists():
        raise HTTPException(status_code=404, detail="Session not found or expired.")

    raw = p.read_text(encoding="utf-8")
    first_nl = raw.find("\n")
    if first_nl == -1:
        raise HTTPException(status_code=500, detail="Corrupt session store.")

    created_ts = int(raw[:first_nl])
    if (int(time.time()) - created_ts) > SESSION_TTL_SECONDS:
        try:
            p.unlink(missing_ok=True)
        except Exception:
            pass
        raise HTTPException(status_code=404, detail="Session expired.")

    return raw[first_nl + 1 :]


class GenerateRequest(BaseModel):
    session_id: str
    # Match the frontend OutputType keys exactly
    output_type: Literal["flash_card", "study_guide", "podcast", "narrative"]
    # Only used for flashcards; ignored otherwise
    count: Optional[int] = Field(default=20, ge=5, le=50)


@router.post("/generate")
def generate(req: GenerateRequest):
    corpus = _read_session_text(req.session_id).strip()
    if not corpus:
        raise HTTPException(status_code=400, detail="No extracted text available for this session.")

    # Keep it sane — you can do smarter chunking later
    corpus = corpus[:60_000]

    # Default count for flashcards
    count = int(req.count or 20)

    # Build prompt + schema per output type
    if req.output_type == "flash_card":
        schema = {
            "name": "flashcards_schema",
            "schema": {
                "type": "object",
                "properties": {
                    "type": {"type": "string", "enum": ["flash_card"]},
                    "cards": {
                        "type": "array",
                        "minItems": count,
                        "maxItems": count,
                        "items": {
                            "type": "object",
                            "properties": {
                                "front": {"type": "string"},
                                "back": {"type": "string"},
                            },
                            "required": ["front", "back"],
                            "additionalProperties": False,
                        },
                    },
                },
                "required": ["type", "cards"],
                "additionalProperties": False,
            },
        }

        prompt = (
            "You are a study assistant. Create high-quality flashcards strictly from the provided content. "
            "NO outside facts. "
            "Each flashcard answer MUST be extremely short: a maximum of THREE WORDS. "
            "If an answer would be longer than three words, compress it to the shortest correct phrase possible."
        )

        user_instruction = f"CONTENT:\n{corpus}\n\nMake exactly {count} flashcards."

    elif req.output_type == "podcast":
        # Podcast output: return a 2-person dialogue script for TTS
        schema = {
            "name": "podcast_schema",
            "schema": {
                "type": "object",
                "properties": {
                    "type": {"type": "string", "enum": ["podcast"]},
                    "speakers": {
                        "type": "array",
                        "minItems": 2,
                        "maxItems": 2,
                        "items": {"type": "string"},
                    },
                    "script": {
                        "type": "array",
                        "minItems": 12,
                        "items": {
                            "type": "object",
                            "properties": {
                                "speaker": {"type": "string"},
                                "text": {"type": "string"},
                            },
                            "required": ["speaker", "text"],
                            "additionalProperties": False,
                        },
                    },
                },
                "required": ["type", "speakers", "script"],
                "additionalProperties": False,
            },
        }

        prompt = (
            "You are a study assistant. Create a podcast-style dialogue STRICTLY from the provided content. "
            "No outside facts. Use exactly two speakers (e.g., Host and Guest). "
            "Make it engaging and natural for text-to-speech: short turns, clear phrasing, and occasional recaps. "
            "Include a brief intro and outro."
        )

        user_instruction = (
            f"CONTENT:\n{corpus}\n\n"
            "Return JSON matching the schema: speakers (2 names) and script (array of turns)."
        )

    else:
        # Text-based outputs: return a structured object {type, text}
        schema = {
            "name": "text_output_schema",
            "schema": {
                "type": "object",
                "properties": {
                    "type": {"type": "string", "enum": ["study_guide", "narrative"]},
                    "text": {"type": "string"},
                },
                "required": ["type", "text"],
                "additionalProperties": False,
            },
        }

        if req.output_type == "study_guide":
            prompt = (
                "You are a study assistant. Create a clear, well-structured study guide using ONLY the provided content. "
                "Use headings and bullet points. Include key definitions, formulas (if any), and a short summary at the end."
            )
            user_instruction = f"CONTENT:\n{corpus}\n\nReturn a study guide as plain text in the 'text' field."

        else:  # narrative
            prompt = (
                "You are a study assistant. Rewrite the provided content into an easy-to-read narrative explanation. "
                "Use simple language, but do not add outside facts."
            )
            user_instruction = f"CONTENT:\n{corpus}\n\nReturn the narrative as plain text in the 'text' field."

    resp = _get_client().responses.create(
        model="gpt-5-nano",  # or whatever model you’re using
        input=[
            {"role": "system", "content": prompt},
            {"role": "user", "content": user_instruction},
        ],
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

    # Ensure the 'type' matches the requested output type
    payload_type = payload.get("type")
    if req.output_type in ("study_guide", "narrative") and payload_type != req.output_type:
        # Force-correct for text outputs to keep UI consistent
        payload["type"] = req.output_type

    return payload