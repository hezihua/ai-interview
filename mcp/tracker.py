"""CSV tracker for applications."""

from __future__ import annotations

import csv
from typing import Any

from workspace import safe_path, utc_now

TRACKER_REL = "tracker.csv"
FIELDS = [
    "id",
    "company",
    "role",
    "status",
    "job_id",
    "source",
    "deadline",
    "created_at",
    "updated_at",
    "notes",
]


def _ensure() -> None:
    path = safe_path(TRACKER_REL)
    if path.is_file():
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as fh:
        csv.DictWriter(fh, fieldnames=FIELDS).writeheader()


def load_rows() -> list[dict[str, str]]:
    _ensure()
    path = safe_path(TRACKER_REL)
    with path.open(encoding="utf-8", newline="") as fh:
        return [{key: (row.get(key) or "") for key in FIELDS} for row in csv.DictReader(fh)]


def _save(rows: list[dict[str, str]]) -> None:
    path = safe_path(TRACKER_REL)
    with path.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=FIELDS)
        writer.writeheader()
        for row in rows:
            writer.writerow({key: row.get(key, "") for key in FIELDS})


def upsert_row(payload: dict[str, Any]) -> dict[str, str]:
    rows = load_rows()
    app_id = str(payload.get("id") or "").strip()
    if not app_id:
        raise ValueError("tracker row needs id")
    now = utc_now()
    found: dict[str, str] | None = None
    for row in rows:
        if row["id"] == app_id:
            found = row
            break
    if found is None:
        found = {key: "" for key in FIELDS}
        found["id"] = app_id
        found["created_at"] = now
        rows.append(found)
    for key in FIELDS:
        if key in {"id", "created_at"}:
            continue
        if key in payload and payload[key] is not None:
            found[key] = str(payload[key])
    found["updated_at"] = now
    _save(rows)
    return found


def get_row(app_id: str) -> dict[str, str] | None:
    for row in load_rows():
        if row["id"] == app_id:
            return row
    return None
