from __future__ import annotations
from io import BytesIO
from typing import Tuple

from pypdf import PdfReader
from docx import Document
from pptx import Presentation

TEXT_MIME_PREFIXES = ("text/",)
TEXT_EXTS = (
    ".txt", ".md", ".csv", ".json", ".log", ".py", ".js", ".ts", ".tsx", ".jsx",
    ".html", ".css", ".sql", ".yaml", ".yml"
)


PDF_MIME = "application/pdf"
DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation"


def _safe_decode(raw:bytes) ->str:
    try:
        return raw.decode("'utf-8'")
    except UnicodeDecodeError:
        return raw.decode("latix-1",errors="replace")
    
def extract_text_from_pdf(data:bytes) -> Tuple[str, str]:
    reader =  PdfReader(BytesIO(data))
    parts: list[str] = []

    for page in reader.pages:
        t = page.extract_text() or ""
        t = t.strip()
        if t:
            parts.append(t)

    text = "\n\n".join(parts).strip()
    if not text:
        return "needs_ocr", ""
    return "extracted" , text

def extract_text_from_docx(data: bytes) -> Tuple[str, str]:
    doc = Document(BytesIO(data))
    parts: list[str] = []
    for p in doc.paragraphs:
        t = (p.text or "").strip()
        if t:
            parts.append(t)

    for table in doc.tables:
        for row in table.rows:
            row_text = " | ".join((cell.text or "").strip() for cell in row.cells).strip()
            if row_text:
                parts.append(row_text)

    text = "\n".join(parts).strip()
    return ("extracted", text) if text else ("extracted", "")   


def extract_text_from_pptx(data: bytes) -> Tuple[str, str]:
    prs = Presentation(BytesIO(data))
    parts: list[str] = []

    for si, slide in enumerate(prs.slides, start=1):
        slide_parts: list[str] = []
        for shape in slide.shapes:
            # shape.text exists only for some shapes
            if hasattr(shape, "text"):
                t = (shape.text or "").strip()
                if t:
                    slide_parts.append(t)
        if slide_parts:
            parts.append(f"[Slide {si}]\n" + "\n".join(slide_parts))

    text = "\n\n".join(parts).strip()
    return ("extracted", text) if text else ("extracted", "")


def extract_text_from_textlike(data: bytes) -> Tuple[str, str]:
    text = _safe_decode(data).strip()
    return ("extracted", text) if text else ("extracted", "")


def pick_extractor(filename: str, mime: str):
    name = (filename or "").lower()

    # PDF
    if mime == PDF_MIME or name.endswith(".pdf"):
        return extract_text_from_pdf

    # DOCX
    if mime == DOCX_MIME or name.endswith(".docx"):
        return extract_text_from_docx

    # PPTX
    if mime == PPTX_MIME or name.endswith(".pptx"):
        return extract_text_from_pptx

    # Text-like (by mime prefix or extension)
    if mime.startswith(TEXT_MIME_PREFIXES) or name.endswith(TEXT_EXTS):
        return extract_text_from_textlike

    # Unknown/binary: accept, but no extraction
    return None