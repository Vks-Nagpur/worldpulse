"""Background context for "Understand this news".

Two kinds of context, both factual and attributed:

1. Background articles from Wikipedia (free, CC BY-SA): a curated list of
   long-running issues (wars, disputes, trade conflicts, institutions) plus a
   short introduction for each country. Matched by keywords in the headline,
   resolved through Wikipedia's search API, cached in the database.
2. The story's arc in WorldPulse's own records: when related reports first
   appeared (up to 45 days back) and how many appeared each week.

Nothing here is generated text: extracts are quoted from Wikipedia with a
link, and the arc is a count over stored headlines.
"""
from __future__ import annotations

import json
import re
import sqlite3
from collections import Counter
from datetime import datetime, timedelta, timezone
from urllib.parse import quote

from .db import tx, uj
from .gazetteer import COUNTRIES
from .http import fetch
from .processing.dedup import STOP
from .processing.normalize import clean_text, now_iso, parse_iso, to_iso

# keyword pattern -> Wikipedia search phrase for long-running issues
TOPICS: list[tuple[str, str]] = [
    (r"ukrain|kyiv|zelensk|donbas|crimea", "Russian invasion of Ukraine"),
    (r"gaza|hamas", "Gaza war"),
    (r"west bank", "Israeli occupation of the West Bank"),
    (r"houthi|red sea attack|bab el-mandeb", "Red Sea crisis Houthi attacks on shipping"),
    (r"hezbollah", "Hezbollah"),
    (r"taiwan", "Cross-Strait relations"),
    (r"south china sea", "Territorial disputes in the South China Sea"),
    (r"\bsudan|darfur|el fasher|rapid support forces|\brsf\b", "Sudanese civil war (2023–present)"),
    (r"iran.*nuclear|nuclear.*iran|uranium enrichment", "Nuclear program of Iran"),
    (r"iran.*israel|israel.*iran", "Iran–Israel proxy conflict"),
    (r"north korea.*missile|pyongyang.*missile|ballistic missile.*north korea", "North Korea and weapons of mass destruction"),
    (r"(china|chinese|beijing).*(tariff|trade war|export control)|(tariff|trade war|export control).*(china|chinese|beijing)", "China–United States trade war"),
    (r"kashmir", "Kashmir conflict"),
    (r"india.*pakistan|pakistan.*india", "India–Pakistan relations"),
    (r"syria", "Syrian civil war"),
    (r"yemen", "Yemeni civil war (2014–present)"),
    (r"myanmar|burma", "Myanmar civil war (2021–present)"),
    (r"venezuela|maduro", "Crisis in Venezuela"),
    (r"haiti", "Haitian crisis (2018–present)"),
    (r"\bm23\b|goma|eastern congo|dr congo|drc", "M23 campaign (2022–present)"),
    (r"sahel|mali|burkina faso|niger junta", "Insurgency in the Sahel"),
    (r"brexit", "Brexit"),
    (r"\bnato\b", "NATO"),
    (r"\bopec", "OPEC"),
    (r"hormuz", "Strait of Hormuz"),
    (r"suez", "Suez Canal"),
    (r"panama canal", "Panama Canal"),
    (r"sanction.*russia|russia.*sanction", "International sanctions during the Russian invasion of Ukraine"),
    (r"\bbrics\b", "BRICS"),
    (r"\bg20\b", "G20"),
    (r"\bcop\d{2}\b|climate summit|climate conference", "United Nations Climate Change Conference"),
    (r"semiconductor|chipmaker|tsmc", "Semiconductor industry"),
    (r"rare earth", "Rare-earth element"),
    (r"bitcoin|crypto", "Cryptocurrency"),
    (r"inflation", "Inflation"),
    (r"recession", "Recession"),
    (r"tariff", "Tariff"),
    (r"\bwto\b|world trade organization", "World Trade Organization"),
    (r"\bimf\b|international monetary fund", "International Monetary Fund"),
    (r"federal reserve|\bthe fed\b", "Federal Reserve"),
    (r"reserve bank of india|\brbi\b", "Reserve Bank of India"),
    (r"european central bank|\becb\b", "European Central Bank"),
    (r"ransomware", "Ransomware"),
]
_TOPIC_RX = [(re.compile(p, re.I), q) for p, q in TOPICS]

COUNTRY_TITLES = {"GE": "Georgia (country)", "CG": "Republic of the Congo", "CD": "Democratic Republic of the Congo", "PS": "State of Palestine",
                  "TR": "Turkey", "KR": "South Korea", "KP": "North Korea", "US": "United States", "GB": "United Kingdom", "CI": "Ivory Coast",
                  "MM": "Myanmar", "VA": "Vatican City", "CZ": "Czech Republic", "SZ": "Eswatini", "TL": "East Timor", "CV": "Cape Verde"}

TOPIC_TTL_DAYS, COUNTRY_TTL_DAYS = 7, 30
MAX_FETCHES_PER_RUN = 70


def topics_for(text: str) -> list[str]:
    return [q for rx, q in _TOPIC_RX if rx.search(text)][:3]


class Wiki:
    """Wikipedia summaries with a database cache and a per-run fetch budget."""

    def __init__(self, conn: sqlite3.Connection, log=print):
        self.conn = conn
        self.log = log
        self.fetches = 0
        conn.execute("""CREATE TABLE IF NOT EXISTS context_cache (key TEXT PRIMARY KEY, title TEXT, extract TEXT, url TEXT,
                        fetched_at TEXT NOT NULL, ok INTEGER NOT NULL)""")

    def get(self, key: str, search: str, ttl_days: int, direct_title: str | None = None) -> dict | None:
        row = self.conn.execute("SELECT * FROM context_cache WHERE key=?", (key,)).fetchone()
        fresh = row and parse_iso(row["fetched_at"]) and datetime.now(timezone.utc) - parse_iso(row["fetched_at"]) < timedelta(days=ttl_days)
        if fresh or (row and self.fetches >= MAX_FETCHES_PER_RUN):
            return {"title": row["title"], "extract": row["extract"], "url": row["url"]} if row["ok"] else None
        if self.fetches >= MAX_FETCHES_PER_RUN:
            return None
        self.fetches += 1
        out = None
        try:
            title = direct_title
            if not title:
                r = fetch("https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&srlimit=1&srsearch=" + quote(search), retries=1, timeout=(8, 15))
                hits = json.loads(r.content).get("query", {}).get("search", [])
                title = hits[0]["title"] if hits else None
            if title:
                r = fetch("https://en.wikipedia.org/api/rest_v1/page/summary/" + quote(title.replace(" ", "_"), safe=""), retries=1, timeout=(8, 15))
                d = json.loads(r.content)
                if d.get("type") != "disambiguation" and d.get("extract"):
                    out = {"title": d.get("title") or title, "extract": clean_text(d["extract"], 900),
                           "url": (d.get("content_urls", {}).get("desktop", {}) or {}).get("page") or f"https://en.wikipedia.org/wiki/{quote(title)}"}
        except Exception as e:  # context is optional; never fail the run
            self.log(f"  wikipedia {key}: {type(e).__name__}: {str(e)[:80]}")
        with tx(self.conn):
            self.conn.execute("INSERT OR REPLACE INTO context_cache VALUES (?,?,?,?,?,?)",
                              (key, out and out["title"], out and out["extract"], out and out["url"], now_iso(), int(bool(out))))
        return out

    def topic(self, phrase: str) -> dict | None:
        return self.get(f"topic:{phrase}", phrase, TOPIC_TTL_DAYS)

    def country(self, iso2: str) -> dict | None:
        c = COUNTRIES.get(iso2)
        if not c:
            return None
        return self.get(f"country:{iso2}", c.name, COUNTRY_TTL_DAYS, direct_title=COUNTRY_TITLES.get(iso2, c.name))


def refresh(conn: sqlite3.Connection, log=print) -> int:
    """Fetch (or reuse cached) background for the issues and countries that
    appear in this week's best-supported stories."""
    wiki = Wiki(conn, log)
    evs = conn.execute("""SELECT title, country, related_countries, verification FROM events WHERE last_updated >= ?
                          AND verification != 'single_source_report' ORDER BY last_updated DESC LIMIT 600""",
                       (to_iso(datetime.now(timezone.utc) - timedelta(days=7)),)).fetchall()
    topics, countries = Counter(), Counter()
    for e in evs:
        for q in topics_for(e["title"]):
            topics[q] += 1
        for c in {e["country"], *uj(e["related_countries"], [])} - {None}:
            countries[c] += 1
    n = 0
    for q, _ in topics.most_common():
        n += bool(wiki.topic(q))
    for c, _ in countries.most_common(80):
        n += bool(wiki.country(c))
    log(f"  context: {n} background summaries available ({wiki.fetches} fetched this run)")
    return n


def cached(conn: sqlite3.Connection, key: str) -> dict | None:
    try:
        r = conn.execute("SELECT * FROM context_cache WHERE key=? AND ok=1", (key,)).fetchone()
    except sqlite3.OperationalError:
        return None
    return {"title": r["title"], "extract": r["extract"], "url": r["url"], "source": "Wikipedia", "license": "CC BY-SA 4.0"} if r else None


# ------------------------------------------------------------ story arc

_WORD = re.compile(r"[a-z0-9]+")
GENERIC = set("""says said say despite claim claims everything need know new news latest live update updates report reports reported amid after
before over under ahead offer offers offered cut cuts million millions billion year years week weeks day days today first last next big
make makes made take takes took get gets got calls call called urges urge warns warn plans plan set sets could would may might will
just also still more most less many much top key major minor deal deals talk talks hit hits move moves back down off out time times people
what how why who where when which there here their them they this that these those your you our its his her than with from into about
watch video photos explainer analysis opinion""".split())


def _content(title: str) -> set[str]:
    return {w for w in _WORD.findall(title.lower()) if len(w) > 2 and w not in STOP and w not in GENERIC}


class ArcIndex:
    """Earlier developments (up to 45 days) that involve the same country and
    share subject words — "how did this story build up?"."""

    def __init__(self, conn: sqlite3.Connection):
        since = to_iso(datetime.now(timezone.utc) - timedelta(days=45))
        self.rows = []
        for r in conn.execute("""SELECT id, title, category, country, related_countries, started_at, first_detected, source_refs, verification
                                 FROM events WHERE origin='news_cluster' AND coalesce(started_at, first_detected) >= ?""", (since,)):
            refs = uj(r["source_refs"], [])
            self.rows.append({"id": r["id"], "title": r["title"], "cat": r["category"], "d": r["started_at"] or r["first_detected"],
                              "cs": {r["country"], *uj(r["related_countries"], [])} - {None}, "w": _content(r["title"]),
                              "url": refs[0].get("url") if refs else None, "p": refs[0].get("publisher") if refs else None, "v": r["verification"]})

    def arc(self, title: str, country: str | None, event_id: str | None = None) -> dict | None:
        words = _content(title)
        if len(words) < 2 or not country:
            return None
        me = next((r for r in self.rows if r["id"] == event_id), None)
        cats = {me["cat"]} if me else set()
        hits = []
        for r in self.rows:
            if r["id"] == event_id or country not in r["cs"]:
                continue
            shared = words & r["w"]
            if len(shared) < 2:
                continue
            score = len(shared) / len(words | r["w"]) + (0.15 if r["cat"] in cats else 0)
            if score >= 0.25:
                hits.append(r)
        if not hits:
            return None
        hits.sort(key=lambda r: r["d"])
        weeks = Counter()
        for r in hits:
            dt = parse_iso(r["d"])
            if dt:
                weeks[(dt - timedelta(days=dt.weekday())).date().isoformat()] += 1
        first = hits[0]
        return {"reports": len(hits), "first_seen": first["d"], "first_title": first["title"], "first_url": first["url"], "first_publisher": first["p"],
                "earlier": [{"id": r["id"], "title": r["title"], "date": r["d"], "url": r["url"], "publisher": r["p"], "verification": r["v"]} for r in hits[-6:]],
                "weekly": sorted(weeks.items())[-7:], "window_days": 45}
