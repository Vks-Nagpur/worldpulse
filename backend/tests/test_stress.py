import sqlite3
from datetime import date, timedelta

from worldpulse import stress
from worldpulse.db import connect


def test_stress_percentiles_and_missing_ingredients(tmp_path):
    conn = connect(str(tmp_path / "t.sqlite"))
    today = date.today()
    rows = []
    for i in range(60):
        d = (today - timedelta(days=60 - i)).isoformat()
        rows.append(("mkt:^VIX", d, 15.0 + (i % 5), "t", d))
    rows.append(("mkt:^VIX", today.isoformat(), 40.0, "t", today.isoformat()))  # unusually high today
    conn.executemany("INSERT INTO signal_observations VALUES (?,?,?,?,?)", rows)
    conn.commit()
    out = stress.build(conn, {})
    assert out["available"]
    market = next(c for c in out["components"] if c["key"] == "market")
    assert market["score"] >= 95
    assert next(c for c in out["components"] if c["key"] == "conflict")["score"] is None  # no data → left out, not guessed
    assert out["today"]["ingredients_used"] == 1
    assert isinstance(sqlite3, object)
