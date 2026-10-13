"""Explainer pages for long-running conflicts and crises.

Everything is assembled from stored records: matching stories from the last
45 days (counted per week, with the best-supported story of each week as a
"key moment"), the people and organisations named in this week's reports, the
countries involved, and the Wikipedia background already cached by context.py.
Nothing is generated; the background is quoted with its link.
"""
from __future__ import annotations

import re
import sqlite3
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone

from . import context
from .db import uj
from .processing.normalize import parse_iso, to_iso

# key, title, headline pattern, Wikipedia phrase (same phrases as context.TOPICS so the cache is shared), main countries
CONFLICTS = [
    ("ukraine", "Russia–Ukraine war", r"ukrain|kyiv|zelensk|donbas|crimea|kremlin.*(war|strike)", "Russian invasion of Ukraine", ["UA", "RU"]),
    ("gaza", "Israel–Gaza war", r"gaza|hamas|west bank", "Gaza war", ["IL", "PS"]),
    ("redsea", "Red Sea & Houthi attacks", r"houthi|red sea|bab el-mandeb", "Red Sea crisis Houthi attacks on shipping", ["YE"]),
    ("iran", "Iran, Israel & the Gulf", r"\biran\b.*\b(israel|strike|missile|nuclear|hormuz|attack)|hormuz|\birgc\b", "Iran–Israel proxy conflict", ["IR", "IL"]),
    ("taiwan", "China–Taiwan tensions", r"taiwan", "Cross-Strait relations", ["TW", "CN"]),
    ("korea", "North Korea weapons", r"north korea|pyongyang|kim jong", "North Korea and weapons of mass destruction", ["KP"]),
    ("sudan", "Sudan civil war", r"\bsudan\b|darfur|el fasher|rapid support forces", "Sudanese civil war (2023–present)", ["SD"]),
    ("myanmar", "Myanmar civil war", r"myanmar|burma", "Myanmar civil war (2021–present)", ["MM"]),
    ("congo", "Eastern Congo (M23)", r"\bm23\b|goma|eastern congo|dr congo|\bdrc\b", "M23 campaign (2022–present)", ["CD"]),
    ("indopak", "India–Pakistan tensions", r"kashmir|india.*pakistan|pakistan.*india", "India–Pakistan relations", ["IN", "PK"]),
    ("sahel", "Sahel insurgency", r"sahel|\bmali\b|burkina faso|niger junta", "Insurgency in the Sahel", ["ML", "BF", "NE"]),
    ("haiti", "Haiti crisis", r"\bhaiti", "Haitian crisis (2018–present)", ["HT"]),
]
RANK = {"official_statement": 3, "multi_source_reporting": 2, "single_source_report": 0.5}


def wiki_phrases() -> list[str]:
    return [c[3] for c in CONFLICTS]


def build(conn: sqlite3.Connection, exported_ids: set[str]) -> dict:
    from .ai import _good_entity, load_places  # filter shared with who-is-involved
    load_places(conn)
    now = datetime.now(timezone.utc)
    since45, since7 = now - timedelta(days=45), now - timedelta(days=7)
    rows = conn.execute("""SELECT id, title, country, related_countries, started_at, first_detected, verification, source_refs
                           FROM events WHERE origin='news_cluster' AND coalesce(started_at, first_detected) >= ?""", (to_iso(since45),)).fetchall()
    out = []
    for key, title, rx, phrase, main in CONFLICTS:
        pat = re.compile(rx, re.I)
        hits = [r for r in rows if pat.search(r["title"])]
        weeks: dict[str, list] = defaultdict(list)
        countries: Counter = Counter()
        recent = []
        for r in hits:
            d = parse_iso(r["started_at"] or r["first_detected"])
            if not d:
                continue
            refs = uj(r["source_refs"], [])
            item = {"id": r["id"] if r["id"] in exported_ids else None, "title": r["title"], "date": to_iso(d),
                    "url": refs[0].get("url") if refs else None, "publisher": refs[0].get("publisher") if refs else None,
                    "outlets": len({x.get("publisher") for x in refs}), "verification": r["verification"]}
            weeks[(d - timedelta(days=d.weekday())).date().isoformat()].append(item)
            if d >= since7:
                recent.append(r["id"])
                for c in {r["country"], *uj(r["related_countries"], [])} - {None}:
                    countries[c] += 1
        score = lambda it: RANK.get(it["verification"], 1) * 2 + min(it["outlets"], 15)  # noqa: E731
        moments = [max(items, key=score) for _, items in sorted(weeks.items())]
        who: Counter = Counter()
        if recent:
            qs = ",".join("?" * len(recent))
            for e in conn.execute(f"SELECT name, kind FROM event_entities WHERE event_id IN ({qs}) AND kind IN ('person','organisation')", recent) \
                    if _table(conn, "event_entities") else []:
                if _good_entity(e["name"], e["kind"]):
                    who[(e["name"], e["kind"])] += 1
        who = _merge_names(who, _publishers(conn))
        bg = context.cached(conn, f"topic:{phrase}")
        out.append({
            "key": key, "title": title, "countries": main, "background": bg,
            "stories_7d": len(recent), "stories_45d": len(hits),
            "weekly": [[w, len(items)] for w, items in sorted(weeks.items())][-7:],
            "moments": moments[-7:],
            "latest": [i["id"] for i in sorted((it for items in weeks.values() for it in items if it["id"]), key=lambda it: -score(it))][:8],
            "who": [{"name": n, "kind": k, "reports": c} for (n, k), c in who.most_common(8) if c >= 3],
            "where": countries.most_common(6),
        })
    out.sort(key=lambda c: -c["stories_7d"])
    return {"generated_at": to_iso(now), "window_days": 45,
            "note": "Stories are matched by words in the headline. Weekly counts measure reporting, not fighting. Background is quoted from Wikipedia (CC BY-SA).",
            "conflicts": out}


def _table(conn: sqlite3.Connection, name: str) -> bool:
    return bool(conn.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (name,)).fetchone())


def _publishers(conn: sqlite3.Connection) -> set[str]:
    try:
        return {(r[0] or "").lower() for r in conn.execute("SELECT DISTINCT publisher FROM articles WHERE publisher IS NOT NULL")}
    except sqlite3.OperationalError:
        return set()


def _merge_names(who: Counter, publishers: set[str]) -> Counter:
    """'Trump' + 'Donald Trump' → 'Donald Trump'; 'Houthi' + 'Houthis' → one; drop news outlets and places."""
    out: Counter = Counter()
    names = sorted(who, key=lambda nk: -len(nk[0]))
    for (n, k) in names:
        low = n.lower()
        if low in publishers or re.search(r"\b(strait|hormuz|sea|canal|gulf)\b", low):
            continue
        key = _norm(low)
        target = next(((m, mk) for (m, mk) in out if _norm(m.lower()).endswith(" " + key) or _norm(m.lower()).rstrip("s") == key.rstrip("s")), (n, k))
        out[target] += who[(n, k)]
    return out


def _norm(s: str) -> str:
    """Spelling variants: Zelenskyy / Zelenskiy → zelensky."""
    return re.sub(r"(iy|yy)\b", "y", s)
