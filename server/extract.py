"""Extract plain text from uploaded resume / JD files."""

from __future__ import annotations

from io import BytesIO

MAX_FILE_BYTES = 8 * 1024 * 1024
MAX_TEXT_CHARS = 80_000
ALLOWED_SUFFIXES = {".pdf", ".docx", ".md", ".markdown", ".txt"}


class ExtractError(ValueError):
    pass


def _suffix(filename: str) -> str:
    name = (filename or "").strip().lower()
    if "." not in name:
        return ""
    return "." + name.rsplit(".", 1)[-1]


def extract_text(filename: str, data: bytes) -> str:
    if len(data) > MAX_FILE_BYTES:
        raise ExtractError(f"{filename} 超过 8MB 上限")
    suffix = _suffix(filename)
    if suffix == ".doc":
        raise ExtractError("不支持旧版 .doc，请另存为 .docx、PDF 或 Markdown")
    if suffix not in ALLOWED_SUFFIXES:
        raise ExtractError("仅支持 PDF、Word（.docx）或 Markdown（.md）")
    if suffix == ".pdf":
        text = _from_pdf(data)
    elif suffix == ".docx":
        text = _from_docx(data)
    else:
        text = data.decode("utf-8", errors="replace")
    text = text.replace("\x00", "").strip()
    if not text:
        raise ExtractError(f"{filename} 没有提取到文本（可能是扫描件）")
    if len(text) > MAX_TEXT_CHARS:
        text = text[:MAX_TEXT_CHARS] + "\n\n[正文过长，已截断]"
    return text


def _from_pdf(data: bytes) -> str:
    from pypdf import PdfReader

    reader = PdfReader(BytesIO(data))
    parts: list[str] = []
    for page in reader.pages:
        parts.append(page.extract_text() or "")
    return "\n".join(parts)


def _from_docx(data: bytes) -> str:
    from docx import Document

    document = Document(BytesIO(data))
    return "\n".join(paragraph.text for paragraph in document.paragraphs)
