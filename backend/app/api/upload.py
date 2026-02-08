from __future__ import annotations

import time
import uuid
from pathlib import Path
from typing import List

from fastapi import APIRouter, UploadFile, File, HTTPException

from app.core.extractors import extract_text_any

router = APIRouter()

MAX_FILES = 20
MAX_BYTES_PER_FILE = 25 * 1024 * 1024  # 25MB
SESSION_TTL_SECONDS = 60 * 30  # 30 minutes
TMP_DIR = Path("/tmp/prepareup_sessions")
TMP_DIR.mkdir(parents=True, exist_ok=True)

def _session_path(session_id: str) -> Path:
    return TMP_DIR / f"{session_id}.txt"

def _write_session_text(session_id: str, text: str) -> None:
    payload = f"{int(time.time())}\n{text}"
    _session_path(session_id).write_text(payload, encoding="utf-8")

@router.post("/upload")
async def upload_files(files: List[UploadFile] = File(...)):
    if not files:
        raise HTTPException(status_code=400, detail="No files provided.")
    if len(files) > MAX_FILES:
        raise HTTPException(status_code=400, detail=f"Too many files. Max {MAX_FILES}.")

    out = []
    combined_parts: list[str] = []

    for f in files:
        try:
            data = await f.read()
        finally:
            await f.close()
        size = len(data)

        if size == 0:
            out.append({
                "id": str(uuid.uuid4()),
                "name": f.filename,
                "mime": f.content_type or "",
                "size": 0,
                "status": "uploaded",
                "text_len": 0
            })
            continue

        if size > MAX_BYTES_PER_FILE:
            raise HTTPException(status_code=413, detail=f"File too large: {f.filename}")

        try:
            status, text = extract_text_any(
                filename=f.filename or "",
                mime=f.content_type or "",
                data=data,
                ocr=None,  # OCR will be plugged in later (Textract / Tesseract)
            )
        except Exception:
            status, text = "extract_failed", ""

        out.append({
            "id": str(uuid.uuid4()),
            "name": f.filename,
            "mime": f.content_type or "",
            "size": size,
            "status": status,
            "text_len": len(text),
        })

        if text:
            combined_parts.append(f"--- {f.filename} ---\n{text}")

    combined_text = "\n\n".join(combined_parts).strip()

    # If we got no extracted text, allow the upload to succeed when files need OCR
    # (e.g., screenshots / images / scanned PDFs). Otherwise, treat it as a true failure.
    needs_ocr = any(item.get("status") == "needs_ocr" for item in out)
    if not combined_text and not needs_ocr:
        raise HTTPException(status_code=400, detail="Could not extract text from the uploaded files.")

    # For OCR-pending uploads, store an empty session text for now (Sprint 2 will fill this after OCR).
    if not combined_text and needs_ocr:
        combined_text = ""

    session_id = str(uuid.uuid4())
    try:
        _write_session_text(session_id, combined_text)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to store session text: {e}")

    preview = combined_text[:800]  # UI preview only

    return {
        "session_id": session_id,
        "files": out,
        "preview": preview,
        "preview_len": len(preview),
        "ttl_seconds": SESSION_TTL_SECONDS,
    }