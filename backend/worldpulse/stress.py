"""World Stress Index — how unusual today is compared with the past year.

Seven ingredients, each measured every day from data WorldPulse already stores:

  market   US "fear index" (VIX) closing level
  oil      size of Brent crude's 5-day move, up or down
  fx       average size of 5-day moves of emerging-market currencies against the US dollar
  haven    gold and the US dollar index both rising (money running to safety)
  conflict worldwide news volume about military and border incidents (GDELT)
  disaster strong earthquakes (M6+) in the last 7 days, weighted by strength (USGS)
  internet countries with a major internet outage in the last 3 days (IODA)

Each ingredient becomes a percentile: "today is higher than X% of the days in
the past year" (or since records began, when history is shorter — the page says
so). The index is the weighted average of the available ingredients; missing
ones are left out and the weights re-balanced. Nothing is estimated or filled in.
It measures; it does not predict.
"""
from __future__ import annotations

import sqlite3
from bisect import bisect_left, bisect_right
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone

from .processing.normalize import now_iso

WEIGHTS = {"market": 15, "oil": 15, "fx": 15, "haven": 10, "conflict": 25, "disaster": 10, "internet": 10}
LABELS = {"market": ("😰", "Market fear"), "oil": ("🛢️", "Oil swings"), "fx": ("💱", "Currency swings"), "haven": ("🪙", "Run to safety"),
          "conflict": ("⚔️", "Conflict news"), "disaster": ("🌋", "Disasters"), "internet": ("📡", "Internet shutdowns")}
LINKS = {"market": "/markets?s=mkt%3A%5EVIX", "oil": "/markets?s=mkt%3ABZ%3DF", "fx": "/markets?tab=fx", "haven": "/products",
         "conflict": "/explain", "disaster": "/quakes", "internet": "/signals"}
EM_FX = ["fx:USDINR", "fx:USDBRL", "fx:USDTRY", "fx:USDZAR", "fx:USDMXN", "fx:USDIDR", "fx:USDKRW", "fx:USDTHB", "fx:USDPLN"]
LEVELS = [(30, "Calm"), (50, "Normal"), (65, "Elevated"), (80, "High"), (101, "Extreme")]
MIN_POINTS = 20  # an ingredient needs at least this many past days before it counts
STALE_DAYS = 3   # slow sources (news volume) may lag a few days; their latest value counts for up to 3 days


def level(v: float) -> str:
    return next(name for lim, name in LEVELS if v < lim)


def _series(conn: sqlite3.Connection, name: str) -> dict[date, float]:
    out = {}
    for r in conn.execute("SELECT ts, value FROM signal_observations WHERE series=? ORDER BY ts", (name,)):
        try:
            out[date.fromisoformat(r[0][:10])] = float(r[1])
        except ValueError:
            continue
    return out


def _ffill(s: dict[date, float], days: list[date]) -> dict[date, float]:
    """Carry the last close over weekends and holidays (a market's level stays where it closed)."""
    out, last = {}, None
    for d in days:
        if d in s:
            last = s[d]
        if last is not None:
            out[d] = last
    return out


def _change(s: dict[date, float], days: list[date], back: int = 7) -> dict[date, float]:
    """% change over the last `back` calendar days (about 5 trading days)."""
    f = _ffill(s, days)
    out = {}
    for d in days:
        a, b = f.get(d - timedelta(days=back)), f.get(d)
        if a and b:
            out[d] = (b / a - 1) * 100
    return out


def _metrics(conn: sqlite3.Connection, days: list[date]) -> dict[str, dict[date, float]]:
    m: dict[str, dict[date, float]] = {}
    m["market"] = {d: v for d, v in _ffill(_series(conn, "mkt:^VIX"), days).items()}
    m["oil"] = {d: abs(v) for d, v in _change(_series(conn, "mkt:BZ=F"), days).items()}
    moves = defaultdict(list)
    for s in EM_FX:
        for d, v in _change(_series(conn, s), days).items():
            moves[d].append(abs(v))
    m["fx"] = {d: sum(v) / len(v) for d, v in moves.items() if len(v) >= 4}
    gold, dxy = _change(_series(conn, "mkt:GC=F"), days), _change(_series(conn, "mkt:DX-Y.NYB"), days)
    m["haven"] = {d: max(0.0, gold[d]) + max(0.0, dxy[d]) for d in days if d in gold and d in dxy}
    mil, bor = _series(conn, "vol:topic:military_incidents"), _series(conn, "vol:topic:border_incidents")
    m["conflict"] = {d: mil.get(d, 0) + bor.get(d, 0) for d in days if d in mil}
    quakes = [(datetime.fromisoformat(r[0].replace("Z", "+00:00")).date(), r[1]) for r in
              conn.execute("SELECT time, mag FROM quakes WHERE mag >= 6")]
    first_q = conn.execute("SELECT min(time) FROM quakes").fetchone()[0]
    if first_q:
        start = date.fromisoformat(first_q[:10]) + timedelta(days=7)
        m["disaster"] = {d: sum(max(0.0, mg - 5.5) for qd, mg in quakes if d - timedelta(days=7) < qd <= d) for d in days if d >= start}
    out_days = defaultdict(set)
    for r in conn.execute("SELECT series, ts FROM signal_observations WHERE series LIKE 'ioda:%'"):
        out_days[date.fromisoformat(r[1][:10])].add(r[0].split(":")[1])
    if out_days:
        first = min(out_days)
        m["internet"] = {d: float(len(set().union(*(out_days.get(d - timedelta(days=k), set()) for k in range(3))))) for d in days if d >= first + timedelta(days=2)}
    return m


def _pct(values: list[float], v: float) -> float:
    """Share of past values below v (ties count half), 0–100."""
    lo, hi = bisect_left(values, v), bisect_right(values, v)
    return 100.0 * (lo + 0.5 * (hi - lo)) / len(values)


def build(conn: sqlite3.Connection, risk: dict | None = None) -> dict:
    today = datetime.now(timezone.utc).date()
    days = [today - timedelta(days=i) for i in range(400, -1, -1)]
    m = _metrics(conn, days)
    history, comp_today = [], {}
    for d in days[-366:]:
        parts = {}
        for k, series in m.items():
            at = next((d - timedelta(days=i) for i in range(STALE_DAYS + 1) if d - timedelta(days=i) in series), None)
            if at is None:
                continue
            past = sorted(v for dd, v in series.items() if d - timedelta(days=365) <= dd <= at)
            if len(past) < MIN_POINTS:
                continue
            parts[k] = (_pct(past, series[at]), len(past), series[at])
        if parts:
            w = sum(WEIGHTS[k] for k in parts)
            score = sum(WEIGHTS[k] * v[0] for k, v in parts.items()) / w
            history.append([d.isoformat(), round(score, 1), len(parts)])
        if d == today:
            comp_today = parts
    if not history:
        return {"generated_at": now_iso(), "available": False, "note": "Not enough data yet."}
    cur = history[-1][1]
    week = next((h[1] for h in reversed(history) if h[0] <= (today - timedelta(days=7)).isoformat()), None)
    comps = []
    for k in WEIGHTS:
        icon, label = LABELS[k]
        series = m.get(k, {})
        if k in comp_today:
            p, n, raw = comp_today[k]
            comps.append({"key": k, "icon": icon, "label": label, "score": round(p), "weight": WEIGHTS[k], "raw": None if raw is None else round(raw, 2),
                          "days": n, "text": _text(k, raw, p, n), "link": LINKS[k]})
        else:
            comps.append({"key": k, "icon": icon, "label": label, "score": None, "weight": WEIGHTS[k], "raw": None, "days": len(series),
                          "text": f"Not enough history yet ({len(series)} of {MIN_POINTS} days needed) — left out of today’s score.", "link": LINKS[k]})
    return {
        "generated_at": now_iso(), "available": True,
        "today": {"date": history[-1][0], "score": round(cur), "level": level(cur), "delta7": None if week is None else round(cur - week),
                  "ingredients_used": history[-1][2]},
        "components": comps,
        "history": [[h[0], h[1]] for h in history if h[2] >= 3],  # a day needs 3+ ingredients to be charted
        "countries": _countries(conn, today, days, risk or {}),
        "levels": [[lim, name] for lim, name in LEVELS],
        "method": ("Each ingredient is compared with its own past year: a score of 80 means today is higher than 80% of days. "
                   "The index is the weighted average of the ingredients that have enough history (weights shown). "
                   "Missing ingredients are left out, never estimated. It measures how unusual today is — it is not a forecast."),
    }


def _text(k: str, raw: float | None, p: float, n: int) -> str:
    span = "days this year" if n >= 300 else f"the {n} days on record"
    higher = f"higher than {round(p)}% of {span}"
    if raw is None:
        return higher.capitalize() + "."
    return {
        "market": f"The US fear index (VIX) is at {raw:.1f} — {higher}.",
        "oil": f"Brent crude moved {raw:.1f}% in the past week — a bigger swing than on {round(p)}% of {span}.",
        "fx": f"Emerging-market currencies moved {raw:.2f}% on average in a week — {higher}.",
        "haven": "Gold and the US dollar are both rising — money moving to safety." if raw > 0 else "No rush to safety: gold and the dollar are not both rising.",
        "conflict": f"Worldwide news about military and border incidents is {higher}.",
        "disaster": "Strong earthquakes (M6+) struck in the past week." if raw > 0 else "No strong earthquakes (M6+) in the past week.",
        "internet": f"{int(raw)} countries had major internet outages in the past 3 days — {higher}.",
    }[k]


def _countries(conn: sqlite3.Connection, today: date, days: list[date], risk: dict) -> dict:
    """Simpler per-country score from what exists per country: risk level, news-volume
    surprise (GDELT), currency swing and internet outages. Parts are listed."""
    out = {}
    risk_by = {c["iso2"]: c for c in risk.get("countries", [])}
    cur_series = {r[0].split("USD")[-1]: r[0] for r in conn.execute("SELECT DISTINCT series FROM signal_observations WHERE series LIKE 'fx:USD%'")}
    currency_of = {}
    try:
        from .insights import CURRENCY_OF
        currency_of = CURRENCY_OF
    except ImportError:
        pass
    outages = {r[0].split(":")[1] for r in conn.execute("SELECT series FROM signal_observations WHERE series LIKE 'ioda:%' AND ts >= ?",
                                                         ((today - timedelta(days=3)).isoformat(),))}
    vols = {r[0].split(":")[2]: r[0] for r in conn.execute("SELECT DISTINCT series FROM signal_observations WHERE series LIKE 'vol:country:%'")}
    isos = set(risk_by) | set(vols) | outages
    for iso in isos:
        parts = []
        if iso in risk_by:
            parts.append(("Risk level", [10, 45, 70, 92][min(3, risk_by[iso]["level"])], 40))
        if iso in vols:
            s = _series(conn, vols[iso])
            if len(s) >= MIN_POINTS:
                last = s[max(s)]
                parts.append(("News about it vs normal", _pct(sorted(s.values()), last), 25))
        cur = currency_of.get(iso)
        if cur and cur in cur_series:
            ch = _change(_series(conn, cur_series[cur]), days)
            vals = sorted(abs(v) for v in ch.values())
            if len(vals) >= MIN_POINTS and today in ch:
                parts.append(("Currency swing", _pct(vals, abs(ch[today])), 20))
        parts.append(("Internet outage", 85.0 if iso in outages else 15.0, 15))
        if len(parts) < 2:
            continue
        w = sum(p[2] for p in parts)
        score = sum(p[1] * p[2] for p in parts) / w
        out[iso] = {"score": round(score), "level": level(score), "parts": [[p[0], round(p[1])] for p in parts]}
    return out
