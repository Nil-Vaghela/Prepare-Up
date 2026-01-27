from __future__ import annotations

import uuid
from typing import List

from fastapi import APIRouter, UploadFile, File, HTTPException

from app.core.extractors import pick_extractor

router = APIRouter()


MAX_FILES = 20
MAX_BYTES_PER_FILE = 25 * 1024 * 1024  # 25MB per file (adjust later)


@router.post("/upload")
async def upload_files(files: List[UploadFile] = File(...)):
    if not files:
        raise HTTPException(status_code=400, detail="No files provided.")
    if len(files) > MAX_FILES:
        raise HTTPException(status_code=400, detail=f"Too many files. Max {MAX_FILES}.")

    out = []
    combined_parts: list[str] = []

    for f in files:
        data = await f.read()
        size = len(data)

        if size == 0:
            out.append({
                "id": str(uuid.uuid4()),
                "name": f.filename,
                "mime": f.content_type or "",
                "size": 0,
                "status": "uploaded",
                "text": "",
                "text_len": 0
            })
            continue

        if size > MAX_BYTES_PER_FILE:
            raise HTTPException(
                status_code=413,
                detail=f"File too large: {f.filename}. Max {MAX_BYTES_PER_FILE} bytes."
            )

        extractor = pick_extractor(f.filename or "", f.content_type or "")
        status = "uploaded"
        text = ""

        if extractor:
            try:
                status, text = extractor(data)
            except Exception:
                # Don’t crash whole request if one file fails
                status, text = "uploaded", ""

        rec = {
            "id": str(uuid.uuid4()),
            "name": f.filename,
            "mime": f.content_type or "",
            "size": size,
            "status": status,
            "text": text,
            "text_len": len(text)
        }
        out.append(rec)

        if text:
            combined_parts.append(f"--- {f.filename} ---\n{text}")

    combined_text = "\n\n".join(combined_parts).strip()
    combined_len = len(combined_text)

    return {
        "files": out,              # canonical source of extracted text (per file)
        "combined_text": combined_text,  # derived convenience field (preview / prototype)
        "combined_len": combined_len
    }
