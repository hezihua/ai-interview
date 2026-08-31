"""Fetch a job posting URL and reduce it to plain text."""

from __future__ import annotations

import re
from html import unescape
from urllib.parse import urlparse

import httpx

_MAX_BYTES = 500_000
_TIMEOUT = 15.0
_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/128.0.0.0 Safari/537.36"
)


def _html_to_text(html: str) -> str:
    html = re.sub(r"(?is)<script[^>]*>.*?</script>", " ", html)
    html = re.sub(r"(?is)<style[^>]*>.*?</style>", " ", html)
    html = re.sub(r"(?is)<noscript[^>]*>.*?</noscript>", " ", html)
    html = re.sub(r"(?is)<br\s*/?>", "\n", html)
    html = re.sub(r"(?is)</(p|div|h[1-6]|li|tr)>", "\n", html)
    html = re.sub(r"(?is)<[^>]+>", " ", html)
    text = unescape(html)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n[ \t]+", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def normalize_url(url: str) -> str:
    raw = (url or "").strip()
    parsed = urlparse(raw)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ValueError("URL must be http(s)")
    return raw.split("#", 1)[0]


def fetch_posting(url: str) -> tuple[str, str | None]:
    """Return (plain_text, error). error is None on success."""
    try:
        target = normalize_url(url)
    except ValueError as exc:
        return "", str(exc)

    try:
        with httpx.Client(
            timeout=_TIMEOUT,
            follow_redirects=True,
            headers={"User-Agent": _UA, "Accept": "text/html,application/xhtml+xml"},
        ) as client:
            response = client.get(target)
    except httpx.HTTPError as exc:
        return "", f"Fetch failed: {exc}"

    if response.status_code >= 400:
        return "", (
            f"HTTP {response.status_code}. "
            "Paste the full job description instead."
        )

    content = response.content[:_MAX_BYTES]
    ctype = (response.headers.get("content-type") or "").lower()
    text = content.decode(response.encoding or "utf-8", errors="replace")
    if "html" in ctype or text.lstrip().startswith("<"):
        text = _html_to_text(text)
    if not text.strip():
        return "", "Fetched page had no extractable text. Paste the JD instead."
    return text.strip(), None
