"""AI layer: logic tested with stand-ins (real models run in the workflow)."""
import pytest

np = pytest.importorskip("numpy")

from worldpulse import ai, collect
from worldpulse.db import connect


def test_numeric_claims_and_disagreements(tmp_path):
    assert ai.numeric_claims("At least 12 people were killed and 30 injured") == [("killed", 12), ("injured", 30)]
    assert ai.numeric_claims("Three soldiers killed") == [("killed", 3)]
    c = connect(tmp_path / "d.sqlite"); collect.seed_countries(c)
    c.execute("INSERT INTO sources(id,name,kind,url) VALUES ('s','S','rss','https://x')")
    for i, (t, p) in enumerate([("Blast kills: 12 people killed in city", "A"), ("20 killed in city blast", "B"), ("12 killed in blast", "C")]):
        c.execute("""INSERT INTO articles(id,source_id,url,canonical_url,title,norm_title,publisher,collected_at,cluster_id,processing_version)
                     VALUES (?,?,?,?,?,?,?,?,?,?)""", (f"a{i}", "s", f"https://x/{i}", f"https://x/{i}", t, t.lower(), p, "2026-10-12T00:00:00Z", "c1", "t"))
    d = ai.disagreements(c, "c1")
    assert d and d[0]["kind"] == "killed" and [f["value"] for f in d[0]["figures"]] == [12, 20]


def test_validate_summary():
    facts = "- BBC: Earthquake of magnitude 6.4 hits Chile near Valparaiso — 12 people injured\n- Background (Wikipedia, Chile): Chile is a country in South America."
    ok, _ = ai.validate_summary("A strong earthquake hit Chile near Valparaiso. Officials said 12 people were injured. Chile is in South America.", facts)
    assert ok
    assert not ai.validate_summary("A strong earthquake hit Chile. It killed 40 people.", facts)[0]  # invented number
    assert not ai.validate_summary("A strong earthquake hit Chile. Peru sent help quickly.", facts)[0]  # invented name
    assert not ai.validate_summary("A strong earthquake hit Chile. More quakes will likely follow.", facts)[0]  # speculation


class FakeEmbedder:
    """Maps headlines to vectors: same story -> same direction, any language."""
    def encode(self, texts):
        out = []
        for t in texts:
            tl = t.lower()
            v = np.zeros(8)
            v[0 if ("quake" in tl or "भूकंप" in t) else 1 if "election" in tl else 2] = 1
            out.append(v / np.linalg.norm(v))
        return np.array(out)


def test_embed_and_merge(tmp_path):
    c = connect(tmp_path / "e.sqlite"); collect.seed_countries(c)
    c.execute("INSERT INTO sources(id,name,kind,url) VALUES ('s','S','rss','https://x')")
    rows = [("a1", "Strong quake hits Chile", "c1", '{"CL": 0.9}'), ("a2", "चिली में भूकंप", "c2", '{"CL": 0.9}'), ("a3", "Election results in Peru", "c3", '{"PE": 0.9}'),
            ("a4", "Weekend roundup", "c4", "{}")]
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc).isoformat()[:19] + "Z"
    for i, t, cl, cs in rows:
        c.execute("""INSERT INTO articles(id,source_id,url,canonical_url,title,norm_title,collected_at,published_at,cluster_id,countries,category,processing_version)
                     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""", (i, "s", "https://x/" + i, "https://x/" + i, t, t.lower(), now, now, cl, cs, "general", "t"))
    c.commit()
    r = ai.embed_and_merge(c, log=lambda *_: None, embedder=FakeEmbedder())
    assert r["merged"] == 1
    cl = dict(c.execute("SELECT id, cluster_id FROM articles").fetchall())
    assert cl["a1"] == cl["a2"] and cl["a3"] != cl["a1"]
