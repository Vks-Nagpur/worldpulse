"""Calendar of known upcoming events, taken only from the bodies that publish them.

Sources (each optional — a source that cannot be read is skipped, never guessed):
  * US Federal Reserve — FOMC meeting calendar (federalreserve.gov)
  * European Central Bank — Governing Council monetary policy meetings (ecb.europa.eu)
  * Bank of England — upcoming MPC announcement dates (bankofengland.co.uk)
  * National elections — Wikipedia "national electoral calendar" pages (labelled as Wikipedia)

Results are cached in the database and refreshed at most every 12 hours.
"""
from __future__ import annotations

import html as htmlmod
import json
import re
import sqlite3
from datetime import date, datetime, timedelta, timezone

from .db import tx
from .gazetteer import resolve_country
from .http import fetch
from .processing.normalize import now_iso, parse_iso

MONTHS = {m: i for i, m in enumerate(["january", "february", "march", "april", "may", "june", "july", "august", "september", "october",
                                      "november", "december"], 1)}
FED = ("US Federal Reserve", "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm")
ECB = ("European Central Bank", "https://www.ecb.europa.eu/press/calendars/mgcgc/html/index.en.html")
BOE = ("Bank of England", "https://www.bankofengland.co.uk/monetary-policy/upcoming-mpc-dates")
WIKI = "https://en.wikipedia.org/api/rest_v1/page/html/{year}_national_electoral_calendar"
REFRESH_HOURS = 12


def _text(s: str) -> str:
    return re.sub(r"\s+", " ", htmlmod.unescape(re.sub(r"<[^>]+>", " ", s))).strip()


def parse_fed(page: str) -> list[dict]:
    """Year panels titled 'YYYY FOMC Meetings', each with month + day-range rows ('27-28', 'Apr/May 28-1')."""
    out = []
    parts = re.split(r"(\d{4}) FOMC Meetings", page)
    for i in range(1, len(parts) - 1, 2):
        year, body = int(parts[i]), parts[i + 1]
        for mon, days in re.findall(r'fomc-meeting__month[^>]*>\s*(?:<[^>]+>\s*)*([A-Za-z/]+)\s*(?:<[^>]+>\s*)*</div>.*?fomc-meeting__date[^>]*>\s*([^<]+)<', body, re.S):
            last_mon = mon.split("/")[-1].strip().lower()
            m = next((v for k, v in MONTHS.items() if k.startswith(last_mon[:3])), None)
            dd = re.findall(r"\d{1,2}", days)
            if not m or not dd:
                continue
            try:
                d = date(year, m, int(dd[-1]))  # decision is announced on the last day
            except ValueError:
                continue
            out.append({"date": d.isoformat(), "title": "US Federal Reserve interest-rate decision (FOMC)", "kind": "central_bank", "country": "US",
                        "source": FED[0], "url": FED[1], "note": "Projections published" if "*" in days else ""})
    return out


def parse_ecb(page: str) -> list[dict]:
    """<dt>DD/MM/YYYY</dt><dd>Monetary policy meeting ... (Day 2), followed by press conference</dd>"""
    out = []
    for d, desc in re.findall(r"<dt[^>]*>\s*(?:<[^>]+>\s*)*(\d{2}/\d{2}/\d{4})\s*(?:<[^>]+>\s*)*</dt>\s*<dd[^>]*>(.*?)</dd>", page, re.S):
        t = _text(desc).lower()
        if "monetary policy" in t and ("press conference" in t or "day 2" in t):
            dd, mm, yy = d.split("/")
            out.append({"date": f"{yy}-{mm}-{dd}", "title": "European Central Bank interest-rate decision", "kind": "central_bank", "country": "EU",
                        "source": ECB[0], "url": ECB[1], "note": ""})
    return out


def parse_boe(page: str) -> list[dict]:
    """Year headings followed by dates like 'Thursday 5 February'."""
    out, year = [], None
    for tok in re.finditer(r"\b(20\d{2})\b|(Monday|Tuesday|Wednesday|Thursday|Friday)\s+(\d{1,2})\s+(" + "|".join(m.capitalize() for m in MONTHS) + r")", _text(page)):
        if tok.group(1):
            year = int(tok.group(1))
        elif year:
            try:
                d = date(year, MONTHS[tok.group(4).lower()], int(tok.group(3)))
            except ValueError:
                continue
            out.append({"date": d.isoformat(), "title": "Bank of England interest-rate decision (MPC)", "kind": "central_bank", "country": "GB",
                        "source": BOE[0], "url": BOE[1], "note": ""})
    return list({x["date"]: x for x in out}.values())


def parse_elections(page: str, year: int) -> list[dict]:
    """Month sections (h2/h3 'October') with list items like '12 October – Country, presidential election'."""
    out, month = [], None
    for tok in re.finditer(r"<h[23][^>]*>(.*?)</h[23]>|<li[^>]*>(.*?)</li>", page, re.S):
        if tok.group(1) is not None:
            h = _text(tok.group(1)).lower()
            month = MONTHS.get(h.split()[0]) if h else None
            continue
        if not month:
            continue
        line = re.sub(r"\[\s*[\w\s]{1,12}\s*\]", "", _text(tok.group(2))).strip()  # drop footnote marks like [ 64 ]
        m = re.match(r"(\d{1,2})(?:\s*[–-]\s*\d{1,2})?\s+([A-Z][a-z]+)?\s*[:–-]?\s*(.+)", line)
        if not m or len(line) > 220:
            continue
        day, rest = int(m.group(1)), m.group(3)
        mon = MONTHS.get((m.group(2) or "").lower(), month)
        place = re.split(r"[,:(]", rest)[0].strip()
        iso = resolve_country(place)
        if not iso:
            continue
        kind = re.search(r"(presidential|parliamentary|general|legislative|referendum|local|regional|senate|gubernatorial)[^,;]*", rest, re.I)
        try:
            d = date(year, mon, day)
        except ValueError:
            continue
        what = re.sub(r"\s+", " ", kind.group(0)).strip(" ,;") if kind else "national election"
        out.append({"date": d.isoformat(), "title": f"{place}: {what}", "kind": "election", "country": iso,
                    "source": "Wikipedia — national electoral calendar", "url": WIKI.format(year=year).replace("/api/rest_v1/page/html/", "/wiki/"), "note": ""})
    return out


def refresh(conn: sqlite3.Connection, log=print) -> int:
    conn.execute("CREATE TABLE IF NOT EXISTS calendar_cache (source TEXT PRIMARY KEY, items TEXT NOT NULL, fetched_at TEXT NOT NULL)")
    now = datetime.now(timezone.utc)
    jobs = [("fed", FED[1], parse_fed), ("ecb", ECB[1], parse_ecb), ("boe", BOE[1], parse_boe)]
    for y in (now.year, now.year + 1):
        jobs.append((f"elections{y}", WIKI.format(year=y), lambda p, y=y: parse_elections(p, y)))
    total = 0
    for key, url, parser in jobs:
        row = conn.execute("SELECT fetched_at, items FROM calendar_cache WHERE source=?", (key,)).fetchone()
        if row and parse_iso(row["fetched_at"]) and now - parse_iso(row["fetched_at"]) < timedelta(hours=REFRESH_HOURS):
            total += len(json.loads(row["items"]))
            continue
        try:
            r = fetch(url, retries=1, timeout=(10, 25))
            items = parser(r.content.decode("utf-8", "replace"))
            log(f"  calendar: {key} → {len(items)} dates")
            if items or not row:  # keep the last good copy if a page suddenly parses to nothing
                with tx(conn):
                    conn.execute("INSERT OR REPLACE INTO calendar_cache VALUES (?,?,?)", (key, json.dumps(items), now_iso()))
            total += len(items) if items else len(json.loads(row["items"])) if row else 0
        except Exception as e:  # optional source
            log(f"  calendar: {key} skipped — {type(e).__name__}: {str(e)[:100]}")
            if row:
                total += len(json.loads(row["items"]))
    return total


def upcoming(conn: sqlite3.Connection, days: int = 150) -> dict:
    today = datetime.now(timezone.utc).date()
    items = []
    try:
        for r in conn.execute("SELECT items FROM calendar_cache"):
            items += json.loads(r["items"])
    except sqlite3.OperationalError:
        pass
    keep = sorted({(x["date"], x["title"]): x for x in items if today.isoformat() <= x["date"] <= (today + timedelta(days=days)).isoformat()}.values(),
                  key=lambda x: (x["date"], x["kind"]))
    return {"generated_at": now_iso(), "days": days, "items": keep,
            "note": "Dates come from the official calendars of each central bank; elections from Wikipedia’s national electoral calendar. Dates can change — check the source."}
