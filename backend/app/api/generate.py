from __future__ import annotations

import json
import os
from typing import Literal, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from openai import OpenAI

# Import DB-based session reader from chat module (upload.py stores sessions there)
from app.api.chat import _read_session_text, _verify_session_owner

router = APIRouter()


def _get_client() -> OpenAI:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY is not set in the backend environment.")
    return OpenAI(api_key=api_key)


class GenerateRequest(BaseModel):
    session_id: str
    output_type: Literal["flash_card", "study_guide", "podcast", "narrative"]
    count: Optional[int] = Field(default=20, ge=5, le=50)
    difficulty: Optional[Literal["easy", "medium", "hard"]] = Field(default="medium")
    # Podcast refinement fields — only used when output_type == "podcast"
    refinement_instructions: Optional[str] = Field(default=None, max_length=1000)
    previous_script: Optional[list] = Field(default=None)


@router.post("/generate")
def generate(req: GenerateRequest, request: Request):
    # Verify the requester owns this session before generating content
    _verify_session_owner(req.session_id, request)

    # Use DB-backed session text (matches what upload.py stores)
    corpus = _read_session_text(req.session_id).strip()
    if not corpus:
        raise HTTPException(status_code=400, detail="No extracted text available for this session.")

    corpus = corpus[:60_000]
    count = int(req.count or 20)
    difficulty = req.difficulty or "medium"

    flashcard_difficulty_instruction = {
        "easy": (
            "Focus on basic definitions and key terms. "
            "The front should ask a simple recall question and the back should be a short, direct answer (max 3 words)."
        ),
        "medium": (
            "Mix basic recall with conceptual questions. "
            "Some fronts should ask about relationships or processes. Back answers max 3 words."
        ),
        "hard": (
            "Focus on nuanced concepts, edge cases, and comparisons. "
            "Fronts should require deeper understanding. Back answers max 3 words."
        ),
    }[difficulty]

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
            "If an answer would be longer than three words, compress it to the shortest correct phrase possible. "
            f"Difficulty level: {difficulty.upper()}. {flashcard_difficulty_instruction}"
        )

        user_instruction = f"CONTENT:\n{corpus}\n\nMake exactly {count} flashcards at {difficulty} difficulty."

    elif req.output_type == "podcast":
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

        if req.refinement_instructions and req.previous_script:
            # Regeneration mode: refine the previous script based on user instructions
            import json as _json
            prev_script_str = _json.dumps(req.previous_script, ensure_ascii=False)
            prompt = (
                "You are a study assistant. You previously generated a podcast script from the provided content. "
                "The user wants to refine it. Apply their instructions to produce an improved version "
                "that stays STRICTLY grounded in the original content. "
                "Keep the same two-speaker format (Host and Guest). "
                "Make it engaging and natural for text-to-speech."
            )
            user_instruction = (
                f"ORIGINAL CONTENT:\n{corpus}\n\n"
                f"PREVIOUS SCRIPT:\n{prev_script_str}\n\n"
                f"USER REFINEMENT INSTRUCTIONS:\n{req.refinement_instructions}\n\n"
                "Return JSON matching the schema: speakers (2 names) and script (array of turns)."
            )
        else:
            prompt = (
                "You are a study assistant. Create a podcast-style dialogue STRICTLY from the provided content. "
                "No outside facts. Use exactly two speakers (Host and Guest). "
                "Make it engaging and natural for text-to-speech: short turns, clear phrasing, and occasional recaps. "
                "Include a brief intro and outro."
            )
            user_instruction = (
                f"CONTENT:\n{corpus}\n\n"
                "Return JSON matching the schema: speakers (2 names) and script (array of turns)."
            )

    else:
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
        else:
            prompt = (
                "You are a study assistant. Rewrite the provided content into an easy-to-read narrative explanation. "
                "Use simple language, but do not add outside facts."
            )
            user_instruction = f"CONTENT:\n{corpus}\n\nReturn the narrative as plain text in the 'text' field."

    model_name = os.getenv("OPENAI_MODEL", "gpt-4o-mini")

    resp = _get_client().chat.completions.create(
        model=model_name,
        messages=[
            {"role": "system", "content": prompt},
            {
                "role": "user",
                "content": (
                    "Return ONLY valid JSON. No extra text.\n\n"
                    f"Schema (JSON Schema wrapper):\n{json.dumps(schema, ensure_ascii=False)}\n\n"
                    f"{user_instruction}"
                ),
            },
        ],
        response_format={"type": "json_object"},
    )

    content = (resp.choices[0].message.content or "").strip()
    try:
        payload = json.loads(content)
    except Exception:
        raise HTTPException(status_code=502, detail=f"Model returned invalid JSON: {content[:200]}")

    payload_type = payload.get("type")
    if req.output_type in ("study_guide", "narrative") and payload_type != req.output_type:
        payload["type"] = req.output_type

    return payload
