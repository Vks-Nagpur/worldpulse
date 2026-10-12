"""Business-focused views built from stored records.

Every view here is a transparent count or comparison over stored articles,
events, signals and price series. Each item keeps its source link, and every
view carries a plain-language note on what it does and does not measure.
"""
from __future__ import annotations

import re
import sqlite3
import statistics
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone

from .db import j, tx, uj
from .gazetteer import COUNTRIES
from .processing.classify import LABELS
from .processing.normalize import now_iso, parse_iso, to_iso

EURO = ["DE", "FR", "IT", "ES", "NL", "BE", "AT", "IE", "PT", "FI", "GR", "SK", "SI", "LT", "LV", "EE", "LU", "MT", "CY", "HR"]
CURRENCY_OF: dict[str, str] = {"IN": "INR", "CN": "CNY", "JP": "JPY", "GB": "GBP", "BR": "BRL", "TR": "TRY", "ZA": "ZAR", "MX": "MXN",
                               "KR": "KRW", "CH": "CHF", "ID": "IDR", "SG": "SGD", "HK": "HKD", "AU": "AUD", "CA": "CAD", "TH": "THB", "PL": "PLN",
                               **{c: "EUR" for c in EURO}}

CHOKEPOINTS = {
    "Strait of Hormuz": ["hormuz"],
    "Red Sea & Bab el-Mandeb": ["red sea", "bab el-mandeb", "bab al-mandab"],
    "Suez Canal": ["suez"],
    "Panama Canal": ["panama canal"],
    "Black Sea": ["black sea"],
    "Taiwan Strait": ["taiwan strait"],
    "Strait of Malacca": ["malacca"],
    "Bosporus": ["bosporus", "bosphorus"],
}

SUPPLY = {
    "Oil & gas": r"\b(oil|crude|opec|natural gas|lng|refiner(y|ies)|pipeline)\b",
    "Semiconductors": r"\b(semiconductors?|chips?|chipmakers?|tsmc|nvidia|foundry)\b",
    "Food & grain": r"\b(wheat|grain|rice|corn|maize|food prices?|soybeans?|sugar)\b",
    "Shipping & logistics": r"\b(shipping|freight|container|ports?|tankers?|logistics|cargo)\b",
    "Metals & rare earths": r"\b(copper|lithium|nickel|cobalt|rare earths?|steel|aluminium|aluminum|iron ore)\b",
    "Fertilizer": r"\b(fertili[sz]ers?|potash|urea|ammonia)\b",
    "Pharmaceuticals": r"\b(pharma\w*|drugmakers?|medicines?|vaccines?)\b",
    "Autos & EVs": r"\b(automakers?|carmakers?|electric vehicles?|\bevs?\b|batter(y|ies))\b",
}

SANCTION_RX = re.compile(r"\b(sanction\w*|export controls?|export bans?|embargo\w*|tariffs?|blacklist\w*|entity list|asset freeze)\b", re.I)


def _since(**kw) -> str:
    return to_iso(datetime.now(timezone.utc) - timedelta(**kw))


def _arts(conn, days: int, extra: str = "", args: tuple = ()) -> list[sqlite3.Row]:
    return conn.execute(f"""SELECT a.*, s.tags AS src_tags, s.name AS src_name FROM articles a JOIN sources s ON s.id=a.source_id
                            WHERE a.duplicate_of IS NULL AND coalesce(a.published_at,a.collected_at) >= ? {extra}
                            ORDER BY coalesce(a.published_at,a.collected_at) DESC""", (_since(days=days), *args)).fetchall()


def _item(a) -> dict:
    return {"t": a["title"], "u": a["url"], "p": a["publisher"], "d": a["published_at"] or a["collected_at"], "c": a["category"],
            "k": [k for k, v in uj(a["countries"], {}).items() if v >= 0.9], "o": bool(a["is_official"])}


def _series_last(conn, series: str, n: int = 30) -> list[tuple[str, float]]:
    return [(r["ts"], r["value"]) for r in conn.execute("SELECT ts, value FROM signal_observations WHERE series=? ORDER BY ts DESC LIMIT ?", (series, n))][::-1]


# ------------------------------------------------------------------ risk

def country_risk(conn: sqlite3.Connection) -> dict:
    """Traffic-light indicators per country. Each component is a count or
    change with its thresholds shown; the overall level is the highest one."""
    ev7 = conn.execute("SELECT * FROM events WHERE last_updated >= ?", (_since(days=7),)).fetchall()
    ev30 = conn.execute("SELECT * FROM events WHERE last_updated >= ?", (_since(days=30),)).fetchall()
    sig7 = conn.execute("SELECT * FROM signals WHERE detected_at >= ?", (_since(days=7),)).fetchall()
    conflict, sanc = Counter(), Counter()
    for e in ev7:
        cs = set(uj(e["related_countries"], [])) | ({e["country"]} if e["country"] else set())
        w = 0.5 if e["verification"] == "single_source_report" else 1.0
        for c in cs:
            if e["category"] == "military_security":
                conflict[c] += w
            if SANCTION_RX.search(e["title"]):
                sanc[c] += w
    disaster: dict[str, list[str]] = defaultdict(list)
    for e in ev30:
        if e["origin"] == "gdacs" and e["country"]:
            disaster[e["country"]].append(("red" if "red " in e["title"].lower() else "orange") + "|" + e["title"])
        if e["origin"] == "usgs" and e["country"] and (e["magnitude"] or 0) >= 6:
            disaster[e["country"]].append(("red" if e["magnitude"] >= 7 else "orange") + "|" + e["title"])
    internet = defaultdict(list)
    coverage = defaultdict(list)
    for s in sig7:
        if s["country"] and s["signal_type"] == "internet":
            internet[s["country"]].append(s)
        if s["country"] and s["signal_type"] == "news_volume":
            coverage[s["country"]].append(s)
    fx = {}
    for cur in set(CURRENCY_OF.values()):
        pts = _series_last(conn, f"fx:USD{cur}", 25)
        if len(pts) >= 15 and pts[0][1]:
            fx[cur] = ((pts[-1][1] / pts[0][1] - 1) * 100, pts[0][0], pts[-1][0])
    out = []
    for iso2 in COUNTRIES:
        comps = []

        def add(name, level, reason):
            comps.append({"component": name, "level": level, "reason": reason})

        c = conflict.get(iso2, 0)
        if c:
            add("Conflict & military", 2 if c >= 6 else 1 if c >= 2 else 0, f"{c:g} weighted military/security developments in 7 days (single-outlet reports count half)")
        s = sanc.get(iso2, 0)
        if s:
            add("Sanctions & trade restrictions", 2 if s >= 6 else 1 if s >= 2 else 0, f"{s:g} weighted developments mentioning sanctions, tariffs or export controls in 7 days")
        cur = CURRENCY_OF.get(iso2)
        if cur and cur in fx:
            chg, d0, d1 = fx[cur]
            add("Currency", 2 if abs(chg) >= 7 else 1 if abs(chg) >= 3 else 0,
                f"US dollar {'up' if chg > 0 else 'down'} {abs(chg):.1f}% against {cur} from {d0} to {d1} (ECB reference rates)"
                + (" — local currency weaker" if chg > 0 else " — local currency stronger" if chg < 0 else ""))
        if disaster.get(iso2):
            lv = 2 if any(x.startswith("red|") for x in disaster[iso2]) else 1
            add("Natural hazards", lv, f"{len(disaster[iso2])} orange/red disaster alert(s) or M6+ earthquake(s) in 30 days")
        if internet.get(iso2):
            high = any(x["confidence"] == "high" for x in internet[iso2])
            add("Internet disruption", 2 if high else 1, f"{len(internet[iso2])} measured connectivity drop(s) in 7 days ({'several measurement methods agree' if high else 'single method, unconfirmed'})")
        if coverage.get(iso2):
            add("News coverage spike", 1, f"unusual rise in news coverage detected {len(coverage[iso2])} time(s) in 7 days")
        if not comps:
            continue
        level = max(x["level"] for x in comps)
        out.append({"iso2": iso2, "name": COUNTRIES[iso2].name, "region": COUNTRIES[iso2].region, "level": level,
                    "score": round(sum(x["level"] for x in comps) + level, 1), "components": sorted(comps, key=lambda x: -x["level"])})
    out.sort(key=lambda r: (-r["level"], -r["score"], r["name"]))
    return {"generated_at": now_iso(), "levels": {"0": "Low", "1": "Elevated", "2": "High"},
            "method": "Each component compares a count or price change with fixed thresholds shown in its reason. The overall level is the highest component. "
                      "It reflects monitored reporting and public data, not a forecast or a verdict on a country.",
            "countries": out}


# ------------------------------------------------------------------ chokepoints

def chokepoints(conn: sqlite3.Connection) -> dict:
    arts = _arts(conn, 7)
    days = [(datetime.now(timezone.utc) - timedelta(days=i)).date().isoformat() for i in range(6, -1, -1)]
    out = []
    for name, kws in CHOKEPOINTS.items():
        hits = [a for a in arts if any(k in a["title"].lower() for k in kws)]
        per_day = Counter((a["published_at"] or a["collected_at"])[:10] for a in hits)
        clusters = {}
        for a in hits:
            clusters.setdefault(a["cluster_id"], a)
        cats = Counter(a["category"] for a in hits if a["category"] != "general")
        out.append({"name": name, "keywords": kws, "articles_7d": len(hits), "stories_7d": len(clusters),
                    "daily": [[d, per_day.get(d, 0)] for d in days], "top_topics": [LABELS.get(c, c) for c, _ in cats.most_common(3)],
                    "latest": [_item(a) for a in list(clusters.values())[:8]]})
    out.sort(key=lambda r: -r["stories_7d"])
    return {"generated_at": now_iso(), "note": "Counts headlines that name each route in WorldPulse feeds (7 days). Measures reporting, not traffic or disruption.",
            "routes": out}


# ------------------------------------------------------------------ sanctions

def sanctions(conn: sqlite3.Connection) -> dict:
    arts = [a for a in _arts(conn, 30) if SANCTION_RX.search(a["title"])]
    seen, rows = set(), []
    for a in sorted(arts, key=lambda a: (not a["is_official"], ), reverse=False):
        if a["cluster_id"] in seen:
            continue
        seen.add(a["cluster_id"])
        m = SANCTION_RX.search(a["title"]).group(1).lower()
        kind = ("Tariffs" if m.startswith("tariff") else "Export controls" if "export" in m or m == "entity list" else
                "Embargo" if m.startswith("embargo") else "Sanctions")
        rows.append({**_item(a), "kind": kind})
    rows.sort(key=lambda r: r["d"] or "", reverse=True)
    return {"generated_at": now_iso(), "note": "Headlines from the last 30 days that mention sanctions, tariffs, export controls or embargoes; one per story. "
                                               "“Official” marks government or institutional sources. Reports are not legal notices — check the official text before acting.",
            "items": rows[:400]}


# ------------------------------------------------------------------ supply chains

def supply_chains(conn: sqlite3.Connection) -> dict:
    arts = _arts(conn, 7)
    out = []
    for name, rx in SUPPLY.items():
        r = re.compile(rx, re.I)
        hits = [a for a in arts if r.search(a["title"])]
        clusters = {}
        for a in hits:
            clusters.setdefault(a["cluster_id"], a)
        cc = Counter(k for a in clusters.values() for k in [k for k, v in uj(a["countries"], {}).items() if v >= 0.9])
        out.append({"name": name, "stories_7d": len(clusters), "countries": [[k, n] for k, n in cc.most_common(8)],
                    "latest": [_item(a) for a in list(clusters.values())[:8]]})
    out.sort(key=lambda r: -r["stories_7d"])
    return {"generated_at": now_iso(), "note": "Stories in the last 7 days whose headline mentions each supply chain, with the countries they name. "
                                               "Shows where reporting is concentrated, not actual supply volumes.", "chains": out}


# ------------------------------------------------------------------ what changed

def changes(conn: sqlite3.Connection, registry: dict) -> dict:
    now = datetime.now(timezone.utc)
    names = {f"mkt:{m['symbol']}": (m["name"], m["unit"]) for m in registry.get("markets", [])}
    names.update({f"fx:USD{c}": (f"USD/{c}", f"{c} per USD") for c in registry.get("fx_quotes", [])})
    names.update({f"crypto:{c}": (c.title(), "USD") for c in registry.get("crypto", [])})
    moves = []
    for sid, (name, unit) in names.items():
        pts = _series_last(conn, sid, 2)
        if len(pts) == 2 and pts[0][1] and (now - parse_iso(pts[1][0] + "T00:00:00Z")).days <= 4:
            moves.append({"id": sid, "name": name, "unit": unit, "last": pts[1][1], "as_of": pts[1][0], "chg": round((pts[1][1] / pts[0][1] - 1) * 100, 2)})
    moves.sort(key=lambda m: -abs(m["chg"]))
    ev = conn.execute("SELECT * FROM events WHERE first_detected >= ? AND verification != 'single_source_report' AND origin='news_cluster'",
                      (_since(hours=24),)).fetchall()
    ev = sorted(ev, key=lambda e: -len(uj(e["source_refs"], [])))[:8]
    cnt24, cnt_prev = Counter(), Counter()
    for e in conn.execute("SELECT country, first_detected FROM events WHERE country IS NOT NULL AND first_detected >= ?", (_since(days=7),)):
        if e["first_detected"] >= _since(hours=24):
            cnt24[e["country"]] += 1
        else:
            cnt_prev[e["country"]] += 1
    rising = [{"iso2": c, "name": COUNTRIES[c].name, "last_24h": n, "daily_avg_prev": round(cnt_prev.get(c, 0) / 6, 1)}
              for c, n in cnt24.items() if c in COUNTRIES and n >= 3 and n >= 2 * (cnt_prev.get(c, 0) / 6 + 0.5)]
    rising.sort(key=lambda r: -(r["last_24h"] - r["daily_avg_prev"]))
    sigs = conn.execute("SELECT id, title, signal_type, country, confidence, status FROM signals WHERE detected_at >= ? ORDER BY score DESC LIMIT 8",
                        (_since(hours=24),)).fetchall()
    return {"generated_at": now_iso(), "price_moves": moves[:8],
            "new_developments": [{"id": e["id"], "title": e["title"], "category": LABELS.get(e["category"], e["category"]), "country": e["country"],
                                  "verification": e["verification"], "outlets": len({r.get("publisher") for r in uj(e["source_refs"], [])}),
                                  "url": (uj(e["source_refs"], [{}])[0] or {}).get("url")} for e in ev],
            "rising_countries": rising[:6], "new_signals": [dict(s) for s in sigs],
            "note": "Compares the last 24 hours with the previous 6 days. Price moves compare the two latest daily closes."}


# ------------------------------------------------------------------ elections, official, corrections

def elections(conn: sqlite3.Connection) -> dict:
    by = defaultdict(list)
    for e in conn.execute("SELECT * FROM events WHERE category='elections' AND last_updated >= ? ORDER BY last_updated DESC", (_since(days=30),)):
        if e["country"]:
            by[e["country"]].append(e)
    out = []
    for c, evs in by.items():
        out.append({"iso2": c, "name": COUNTRIES[c].name if c in COUNTRIES else c, "developments_30d": len(evs),
                    "latest": [{"title": e["title"], "date": e["started_at"] or e["first_detected"], "verification": e["verification"],
                                "url": (uj(e["source_refs"], [{}])[0] or {}).get("url"), "publisher": (uj(e["source_refs"], [{}])[0] or {}).get("publisher")}
                               for e in evs[:4]]})
    out.sort(key=lambda r: -r["developments_30d"])
    return {"generated_at": now_iso(), "note": "Countries with election-related reporting in the last 30 days. Election dates are not taken from an official calendar; "
                                               "check the national election authority for dates.", "countries": out}


def official(conn: sqlite3.Connection) -> dict:
    rows = []
    for a in _arts(conn, 14):
        tags = uj(a["src_tags"], [])
        if not ({"official", "central_bank", "government"} & set(tags)) and not a["is_official"]:
            continue
        rows.append({**_item(a), "source": a["src_name"], "tags": tags})
    return {"generated_at": now_iso(), "note": "Announcements published by central banks, governments and international institutions (14 days).", "items": rows[:400]}


def corrections(conn: sqlite3.Connection) -> dict:
    out = []
    for r in conn.execute("""SELECT r.event_id, r.revision, r.changed_at, r.snapshot, e.title, e.verification, e.magnitude, e.country, e.description
                             FROM event_revisions r JOIN events e ON e.id=r.event_id WHERE r.changed_at >= ? ORDER BY r.changed_at DESC LIMIT 300""",
                          (_since(days=14),)):
        old = uj(r["snapshot"], {})
        diffs = [{"field": f, "before": old.get(f), "after": r[f]} for f in ("verification", "magnitude", "country")
                 if str(old.get(f)) != str(r[f])]
        if diffs:
            out.append({"event_id": r["event_id"], "title": r["title"], "revision": r["revision"] + 1, "changed_at": r["changed_at"], "changes": diffs})
    return {"generated_at": now_iso(), "note": "Developments whose support level, earthquake magnitude or country changed after first publication (14 days). Earlier values are kept.",
            "items": out}


# ------------------------------------------------------------------ weekly review

def weekly(conn: sqlite3.Connection, registry: dict) -> dict:
    now = datetime.now(timezone.utc)
    start = (now - timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
    week = f"{start.isocalendar().year}-W{start.isocalendar().week:02d}"
    s, e = to_iso(start), to_iso(start + timedelta(days=7))
    evs = conn.execute("SELECT * FROM events WHERE first_detected >= ? AND first_detected < ? AND origin != 'gdacs'", (s, e)).fetchall()
    rank = {"instrument_observation": 5, "official_alert": 4, "official_statement": 3, "multi_source_reporting": 2, "single_source_report": 1}
    top = sorted(evs, key=lambda x: -(rank.get(x["verification"], 0) * 2 + len(uj(x["source_refs"], []))))[:12]
    names = {f"mkt:{m['symbol']}": m["name"] for m in registry.get("markets", [])}
    names.update({f"fx:USD{c}": f"USD/{c}" for c in registry.get("fx_quotes", [])})
    moves = []
    for sid, name in names.items():
        pts = [(r["ts"], r["value"]) for r in conn.execute("SELECT ts, value FROM signal_observations WHERE series=? AND ts >= ? ORDER BY ts", (sid, (start - timedelta(days=3)).date().isoformat()))]
        before = [p for p in pts if p[0] < start.date().isoformat()]
        during = [p for p in pts if p[0] >= start.date().isoformat()]
        if before and during and before[-1][1]:
            moves.append({"name": name, "from": before[-1][0], "to": during[-1][0], "chg": round((during[-1][1] / before[-1][1] - 1) * 100, 2)})
    moves.sort(key=lambda m: -abs(m["chg"]))
    cc = Counter(x["country"] for x in evs if x["country"])
    review = {"week": week, "from": s[:10], "to": (start + timedelta(days=6)).date().isoformat(), "complete": now >= start + timedelta(days=7),
              "generated_at": now_iso(), "developments": len(evs),
              "top": [{"title": x["title"], "category": LABELS.get(x["category"], x["category"]), "country": x["country"], "verification": x["verification"],
                       "url": (uj(x["source_refs"], [{}])[0] or {}).get("url"), "publisher": (uj(x["source_refs"], [{}])[0] or {}).get("publisher")} for x in top],
              "price_moves": moves[:10], "countries": [[c, n] for c, n in cc.most_common(10)],
              "signals": conn.execute("SELECT count(*) FROM signals WHERE detected_at >= ? AND detected_at < ?", (s, e)).fetchone()[0]}
    with tx(conn):
        conn.execute("INSERT OR REPLACE INTO briefings(id,kind,scope,period_hours,generated_at,mode,body) VALUES (?,?,?,?,?,?,?)",
                     (f"weekly-{week}", "weekly", week, 168, review["generated_at"], "deterministic", j(review)))
    past = [uj(r["body"]) for r in conn.execute("SELECT body FROM briefings WHERE kind='weekly' ORDER BY scope DESC LIMIT 12")]
    return {"generated_at": now_iso(), "note": "One page per week (Monday–Sunday, UTC). The current week is updated on every run until it ends.", "weeks": past}


# ------------------------------------------------------------------ quality checks

def quality(conn: sqlite3.Connection, registry: dict) -> dict:
    run_at = now_iso()
    stats = {
        "articles_24h": conn.execute("SELECT count(*) FROM articles WHERE collected_at >= ?", (_since(hours=24),)).fetchone()[0],
        "new_articles_run": conn.execute("SELECT count(*) FROM articles WHERE collected_at >= ?", (_since(minutes=40),)).fetchone()[0],
        "sources_failing": conn.execute("SELECT count(*) FROM sources WHERE enabled=1 AND consecutive_failures > 0").fetchone()[0],
        "sources_enabled": conn.execute("SELECT count(*) FROM sources WHERE enabled=1").fetchone()[0],
        "duplicates_24h": conn.execute("SELECT count(*) FROM articles WHERE duplicate_of IS NOT NULL AND collected_at >= ?", (_since(hours=24),)).fetchone()[0],
    }
    # Compare the rolling 24-hour article count with earlier runs that are at least
    # a day old, so run spacing and first-day backlogs do not cause false alarms.
    prev = [r["value"] for r in conn.execute(
        "SELECT value FROM run_stats WHERE key='articles_24h' AND run_at <= ? ORDER BY run_at DESC LIMIT 8", (_since(hours=24),))]
    problems, checks = [], []

    def check(name, ok, detail):
        checks.append({"check": name, "ok": ok, "detail": detail})
        if not ok:
            problems.append(f"{name}: {detail}")

    med = statistics.median(prev) if len(prev) >= 4 else None
    check("News volume", not (med and stats["articles_24h"] < 0.35 * med),
          f"{stats['articles_24h']} articles collected in the last 24 hours" + (f" (typical: about {med:.0f})" if med else " (not enough history to compare yet)"))
    ratio = stats["sources_failing"] / max(1, stats["sources_enabled"])
    check("Sources", ratio <= 0.25, f"{stats['sources_failing']} of {stats['sources_enabled']} enabled sources failed on their latest attempt")
    stale = []
    weekday = datetime.now(timezone.utc).weekday() < 5
    for m in registry.get("markets", [])[:10]:
        pts = _series_last(conn, f"mkt:{m['symbol']}", 1)
        if pts and (datetime.now(timezone.utc) - parse_iso(pts[0][0] + "T00:00:00Z")).days > (4 if weekday else 5):
            stale.append(m["name"])
    check("Market prices fresh", not stale, "all checked series updated within 4 days" if not stale else "stale: " + ", ".join(stale))
    dup_ratio = stats["duplicates_24h"] / max(1, stats["articles_24h"])
    check("Duplicates", dup_ratio < 0.6, f"{dup_ratio:.0%} of articles collected in 24 h were duplicates")
    with tx(conn):
        for k, v in stats.items():
            conn.execute("INSERT OR REPLACE INTO run_stats VALUES (?,?,?)", (run_at, k, v))
        conn.execute("DELETE FROM run_stats WHERE run_at < ?", (_since(days=60),))
    return {"generated_at": run_at, "ok": not problems, "problems": problems, "checks": checks, "stats": stats}
