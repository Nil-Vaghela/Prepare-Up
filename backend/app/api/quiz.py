"""
Mock Quiz / MCQ generation endpoint.
Generates multiple-choice questions grounded in uploaded content.
"""
from __future__ import annotations

import json
import os
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from openai import OpenAI
from app.api.chat import _read_session_text

router = APIRouter()


def _get_client() -> OpenAI:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY is not set.")
    return OpenAI(api_key=api_key)


class QuizRequest(BaseModel):
    session_id: str
    count: Optional[int] = Field(default=10, ge=3, le=30)


@router.post("/quiz/generate")
def generate_quiz(req: QuizRequest):
    corpus = _read_session_text(req.session_id).strip()
    if not corpus:
        raise HTTPException(status_code=400, detail="No extracted text available for this session.")

    corpus = corpus[:50_000]
    count = int(req.count or 10)

    schema = {
        "name": "quiz_schema",
        "schema": {
            "type": "object",
            "properties": {
                "type": {"type": "string", "enum": ["quiz"]},
                "questions": {
                    "type": "array",
                    "minItems": count,
                    "maxItems": count,
                    "items": {
                        "type": "object",
                        "properties": {
                            "prompt": {"type": "string"},
                            "options": {
                                "type": "array",
                                "minItems": 4,
                                "maxItems": 4,
                                "items": {"type": "string"},
                            },
                            "answer": {
                                "type": "integer",
                                "description": "0-indexed index of the correct option",
                            },
                            "explanation": {"type": "string"},
                        },
                        "required": ["prompt", "options", "answer", "explanation"],
                        "additionalProperties": False,
                    },
                },
            },
            "required": ["type", "questions"],
            "additionalProperties": False,
        },
    }

    prompt = (
        "You are a study assistant. Create a multiple-choice quiz STRICTLY from the provided content. "
        "No outside facts. Each question must have exactly 4 options with exactly one correct answer. "
        "Include a brief explanation for each correct answer. "
        "Make questions vary in difficulty: some straightforward, some requiring deeper understanding."
    )

    user_instruction = (
        f"CONTENT:\n{corpus}\n\n"
        f"Make exactly {count} multiple-choice questions. "
        "Return JSON matching the schema. 'answer' is the 0-indexed position of the correct option."
    )

    model_name = os.getenv("OPENAI_MODEL", "gpt-4o-mini")

    resp = _get_client().chat.completions.create(
        model=model_name,
        messages=[
            {"role": "system", "content": prompt},
            {
                "role": "user",
                "content": (
                    "Return ONLY valid JSON. No extra text.\n\n"
                    f"Schema:\n{json.dumps(schema, ensure_ascii=False)}\n\n"
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

    return payload
