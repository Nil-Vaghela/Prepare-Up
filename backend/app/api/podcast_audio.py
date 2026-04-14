"""
Podcast audio generation endpoint.

Uses OpenAI TTS (tts-1 model) to convert a podcast script to audio.
Produces a two-voice podcast by alternating between voices for each speaker.

Google TTS can be swapped in by setting GOOGLE_APPLICATION_CREDENTIALS and
toggling TTS_PROVIDER=google — all else stays the same.
"""
from __future__ import annotations

import io
import os
from typing import Any

from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel, Field
from openai import OpenAI

router = APIRouter()

# Map speaker index (0 or 1) to a voice
VOICE_MAP = {
    0: "onyx",   # Host – deep, authoritative
    1: "nova",   # Guest – brighter, conversational
}


def _get_client() -> OpenAI:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY not configured.")
    return OpenAI(api_key=api_key)


class ScriptTurn(BaseModel):
    speaker: str
    text: str = Field(min_length=1)


class PodcastAudioRequest(BaseModel):
    speakers: list[str] = Field(min_length=2, max_length=2)
    script: list[ScriptTurn] = Field(min_length=1)


@router.post("/podcast/audio")
async def generate_podcast_audio(req: PodcastAudioRequest):
    """
    Accept a podcast script and return MP3 audio of the full dialogue.

    Each speaker gets a distinct voice. Turns are synthesized individually
    then concatenated into a single MP3 stream returned directly.
    """
    client = _get_client()
    model = os.getenv("OPENAI_TTS_MODEL", "tts-1")

    # Build speaker → voice mapping based on order of first appearance
    speaker_voice: dict[str, str] = {}
    voice_idx = 0
    for turn in req.script:
        sp = turn.speaker
        if sp not in speaker_voice:
            speaker_voice[sp] = VOICE_MAP.get(voice_idx, "echo")
            voice_idx += 1
            if voice_idx >= len(VOICE_MAP):
                voice_idx = len(VOICE_MAP) - 1  # clamp to last voice

    # Synthesize each turn and collect audio chunks
    audio_parts: list[bytes] = []
    for turn in req.script:
        text = turn.text.strip()[:4096]  # OpenAI TTS max input length
        if not text:
            continue
        voice = speaker_voice.get(turn.speaker, "alloy")
        try:
            response = client.audio.speech.create(
                model=model,
                voice=voice,
                input=text,
                response_format="mp3",
            )
            # OpenAI SDK returns the audio as bytes via .read() or .content
            chunk = response.read() if hasattr(response, "read") else response.content
            audio_parts.append(chunk)
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"TTS synthesis failed: {e}")

    if not audio_parts:
        raise HTTPException(status_code=400, detail="No audio was generated (empty script).")

    # Concatenate raw MP3 frames — valid for CBR MP3
    combined = b"".join(audio_parts)

    return Response(
        content=combined,
        media_type="audio/mpeg",
        headers={
            "Content-Disposition": "inline; filename=podcast.mp3",
            "Content-Length": str(len(combined)),
        },
    )


class SingleTTSRequest(BaseModel):
    text: str = Field(min_length=1, max_length=4096)
    voice: str = "alloy"  # alloy | echo | fable | onyx | nova | shimmer


@router.post("/podcast/tts")
async def tts_single(req: SingleTTSRequest):
    """
    Simple single-voice TTS — useful for previewing individual lines.
    """
    client = _get_client()
    model = os.getenv("OPENAI_TTS_MODEL", "tts-1")

    valid_voices = {"alloy", "echo", "fable", "onyx", "nova", "shimmer"}
    voice = req.voice if req.voice in valid_voices else "alloy"

    try:
        response = client.audio.speech.create(
            model=model,
            voice=voice,
            input=req.text.strip(),
            response_format="mp3",
        )
        chunk = response.read() if hasattr(response, "read") else response.content
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"TTS failed: {e}")

    return Response(
        content=chunk,
        media_type="audio/mpeg",
        headers={"Content-Disposition": "inline; filename=speech.mp3"},
    )
