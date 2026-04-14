"""
Mock Quiz / MCQ generation endpoint.
Generates multiple-choice questions grounded in uploaded content.
Uses OpenAI structured outputs (json_schema) to guarantee question array is always returned.
"""
from __future__ import annotations

import json
import os
from typing import Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from openai import OpenAI
from app.api.chat import _read_session_text, _verify_session_owner

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
def generate_quiz(req: QuizRequest, request: Request):
    _verify_session_owner(req.session_id, request)
    corpus = _read_session_text(req.session_id).strip()
    if not corpus:
        raise HTTPException(status_code=400, detail="No extracted text available for this session.")

    corpus = corpus[:50_000]
    count = int(req.count or 10)

    # Use OpenAI structured outputs (json_schema) for guaranteed compliance
    json_schema = {
        "name": "quiz_output",
        "strict": True,
        "schema": {
            "type": "object",
            "properties": {
                "questions": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "prompt":      {"type": "string"},
                            "options":     {"type": "array", "items": {"type": "string"}},
                            "answer":      {"type": "integer"},
                            "explanation": {"type": "string"},
                        },
                        "required": ["prompt", "options", "answer", "explanation"],
                        "additionalProperties": False,
                    },
                },
            },
            "required": ["questions"],
            "additionalProperties": False,
        },
    }

    system_prompt = (
        "You are a study assistant. Create a multiple-choice quiz STRICTLY from the provided content. "
        "No outside facts. Each question must have exactly 4 options with exactly one correct answer. "
        "The 'answer' field is the 0-indexed position of the correct option (0, 1, 2, or 3). "
        "Include a brief explanation (1–2 sentences) for each correct answer. "
        "Vary difficulty: some questions straightforward, some requiring deeper understanding."
    )

    user_message = (
        f"CONTENT:\n{corpus}\n\n"
        f"Generate exactly {count} multiple-choice questions from the content above."
    )

    model_name = os.getenv("OPENAI_MODEL", "gpt-4o-mini")

    try:
        resp = _get_client().chat.completions.create(
            model=model_name,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user",   "content": user_message},
            ],
            response_format={"type": "json_schema", "json_schema": json_schema},
        )
    except Exception as exc:
        # Fallback to json_object if the model doesn't support json_schema
        error_str = str(exc).lower()
        if "json_schema" in error_str or "response_format" in error_str or "unsupported" in error_str:
            resp = _get_client().chat.completions.create(
                model=model_name,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {
                        "role": "user",
                        "content": (
                            "Return ONLY valid JSON with this structure:\n"
                            '{"questions": [{"prompt": "...", "options": ["A","B","C","D"], "answer": 0, "explanation": "..."}]}\n\n'
                            f"Generate exactly {count} questions.\n\n"
                            f"CONTENT:\n{corpus}"
                        ),
                    },
                ],
                response_format={"type": "json_object"},
            )
        else:
            raise HTTPException(status_code=502, detail=f"Quiz generation failed: {exc}")

    content = (resp.choices[0].message.content or "").strip()
    try:
        payload = json.loads(content)
    except Exception:
        raise HTTPException(status_code=502, detail=f"Model returned invalid JSON: {content[:300]}")

    questions = payload.get("questions")
    if not isinstance(questions, list) or len(questions) == 0:
        raise HTTPException(
            status_code=502,
            detail=(
                "The AI could not generate questions from this content. "
                "Make sure you uploaded text-rich files (PDFs, notes, etc.) and try again."
            ),
        )

    # Clamp: ensure each question has exactly 4 options and a valid answer index
    clean = []
    for q in questions:
        opts = (q.get("options") or [])[:4]
        while len(opts) < 4:
            opts.append("(option not provided)")
        answer_idx = int(q.get("answer") or 0)
        answer_idx = max(0, min(3, answer_idx))
        clean.append({
            "prompt":      str(q.get("prompt") or ""),
            "options":     opts,
            "answer":      answer_idx,
            "explanation": str(q.get("explanation") or ""),
        })

    return {"questions": clean}
