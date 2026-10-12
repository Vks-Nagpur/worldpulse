"""The AI layer — free, open models, optional, and always checked.

Runs only when WORLDPULSE_AI=1 (the GitHub workflow sets it). Every stage
fails soft: if a model cannot be downloaded or loaded, the rest of the
pipeline continues exactly as before.

1. Meaning-based story matching (multilingual sentence embeddings):
   merges clusters that describe the same story in different words or
   languages, and re-sorts articles whose keyword topic was "general".
2. Who's involved (spaCy named-entity recognition): people, organisations,
   places per development.
3. Where reports disagree (no model): different casualty / count figures
   reported by different outlets for the same story.
4. Plain-language summaries (small local LLM via llama.cpp): written only
   from stored facts and rejected unless every number, name and claim can
   be found in those facts. Optional Hindi version, also checked.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import sqlite3
import time
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone

from .db import j, tx, uj
from .processing.classify import LABELS
from .processing.normalize import now_iso, parse_iso, to_iso

EMBED_MODEL = os.environ.get("WORLDPULSE_EMBED_MODEL", "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2")
LLM_REPO = os.environ.get("WORLDPULSE_LLM_REPO", "Qwen/Qwen2.5-1.5B-Instruct-GGUF")
LLM_FILE = os.environ.get("WORLDPULSE_LLM_FILE", "qwen2.5-1.5b-instruct-q4_k_m.gguf")


def enabled() -> bool:
    return os.environ.get("WORLDPULSE_AI") == "1"


def ensure_tables(conn: sqlite3.Connection) -> None:
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS article_vecs (id TEXT PRIMARY KEY, vec BLOB NOT NULL);
        CREATE TABLE IF NOT EXISTS event_entities (event_id TEXT NOT NULL, name TEXT NOT NULL, kind TEXT NOT NULL, mentions INTEGER NOT NULL,
            PRIMARY KEY (event_id, name, kind));
        CREATE TABLE IF NOT EXISTS event_summaries (event_id TEXT PRIMARY KEY, evidence_hash TEXT NOT NULL, text TEXT NOT NULL, text_hi TEXT,
            model TEXT NOT NULL, created_at TEXT NOT NULL);
    """)


def _since(**kw) -> str:
    return to_iso(datetime.now(timezone.utc) - timedelta(**kw))


# =================================================================== 1. embeddings

TOPIC_PROTOTYPES = {
    "military_security": "armed forces, military attack, missiles, airstrike, war, troops, terrorism, security forces",
    "geopolitics": "sanctions, coup, protests, government crisis, territorial dispute, political unrest",
    "diplomacy": "diplomatic talks, summit, foreign minister, peace negotiations, treaty, ambassador",
    "elections": "election, voters, ballot, candidates, referendum, election results",
    "economics": "economy, inflation, interest rates, central bank, unemployment, GDP growth, budget",
    "financial_markets": "stock market, shares, investors, currency exchange rate, bonds, cryptocurrency",
    "energy": "oil prices, natural gas, OPEC, electricity supply, refinery, pipeline, energy",
    "trade": "tariffs, exports and imports, trade deal, shipping, supply chain, customs",
    "natural_disasters": "earthquake, flood, cyclone, hurricane, wildfire, volcano eruption, disaster",
    "technology": "technology company, artificial intelligence, semiconductors, software, smartphones",
    "cybersecurity": "cyberattack, hackers, ransomware, data breach, malware",
    "public_health": "disease outbreak, virus, hospital, vaccine, epidemic, health ministry",
    "environment": "climate change, emissions, pollution, deforestation, environment",
}


class Embedder:
    def __init__(self):
        from sentence_transformers import SentenceTransformer  # optional dependency
        self.model = SentenceTransformer(EMBED_MODEL, device="cpu")

    def encode(self, texts: list[str]):
        return self.model.encode(texts, batch_size=64, normalize_embeddings=True, show_progress_bar=False)


def _to_blob(v) -> bytes:
    import numpy as np
    return np.asarray(v, dtype=np.float16).tobytes()


def _from_blob(b: bytes):
    import numpy as np
    return np.frombuffer(b, dtype=np.float16).astype(np.float32)


def embed_and_merge(conn: sqlite3.Connection, log=print, embedder=None, threshold: float = 0.87) -> dict:
    """Embed new headlines, merge clusters about the same story (any language),
    and give 'general' articles a topic when the meaning clearly fits one."""
    import numpy as np
    ensure_tables(conn)
    emb = embedder or Embedder()
    rows = conn.execute("""SELECT a.id, a.title, a.excerpt FROM articles a LEFT JOIN article_vecs v ON v.id=a.id
                           WHERE v.id IS NULL AND a.collected_at >= ? AND a.duplicate_of IS NULL""", (_since(hours=96),)).fetchall()
    if rows:
        vecs = emb.encode([r["title"] for r in rows])
        with tx(conn):
            conn.executemany("INSERT OR REPLACE INTO article_vecs VALUES (?,?)", [(r["id"], _to_blob(v)) for r, v in zip(rows, vecs)])
    # cluster centroids for the last 72 hours
    arts = conn.execute("""SELECT a.id, a.cluster_id, a.countries, a.category, a.category_scores, coalesce(a.published_at,a.collected_at) d, v.vec
                           FROM articles a JOIN article_vecs v ON v.id=a.id
                           WHERE a.duplicate_of IS NULL AND a.collected_at >= ?""", (_since(hours=72),)).fetchall()
    by: dict[str, list] = defaultdict(list)
    for a in arts:
        by[a["cluster_id"]].append(a)
    ids = list(by)
    if len(ids) < 2:
        return {"embedded": len(rows), "merged": 0, "retopic": 0}
    cents = np.stack([np.mean([_from_blob(a["vec"]) for a in by[c]], axis=0) for c in ids])
    cents /= np.linalg.norm(cents, axis=1, keepdims=True) + 1e-9
    first = {c: min(a["d"] for a in by[c]) for c in ids}
    cset = {c: set(k for a in by[c] for k, v in uj(a["countries"], {}).items() if v >= 0.9) for c in ids}
    cat = {c: Counter(a["category"] for a in by[c]).most_common(1)[0][0] for c in ids}
    sims = cents @ cents.T
    parent = {c: c for c in ids}

    def root(c):
        while parent[c] != c:
            parent[c] = parent[parent[c]]
            c = parent[c]
        return c

    merged = 0
    for i in range(len(ids)):
        for k in np.where(sims[i, i + 1:] >= threshold)[0]:
            a, b = ids[i], ids[i + 1 + k]
            ta, tb = parse_iso(first[a]), parse_iso(first[b])
            if ta and tb and abs(ta - tb) > timedelta(hours=48):
                continue
            if cset[a] and cset[b] and not (cset[a] & cset[b]):
                continue  # same wording about different countries is a different story
            if cat[a] == "natural_disasters" or cat[b] == "natural_disasters":
                continue  # alerts share wording but are about different places
            ra, rb = root(a), root(b)
            if ra != rb:
                keep, drop = (ra, rb) if first[ra] <= first[rb] else (rb, ra)
                parent[drop] = keep
                merged += 1
    with tx(conn):
        for c in ids:
            r = root(c)
            if r != c:
                conn.execute("UPDATE articles SET cluster_id=? WHERE cluster_id=?", (r, c))
                conn.execute("DELETE FROM events WHERE cluster_id=?", (c,))
    # meaning-based topic for 'general' articles
    protos = list(TOPIC_PROTOTYPES)
    pv = emb.encode([TOPIC_PROTOTYPES[p] for p in protos])
    retopic = 0
    gen = [a for a in arts if a["category"] == "general"]
    if gen:
        m = np.stack([_from_blob(a["vec"]) for a in gen]) @ np.asarray(pv).T
        with tx(conn):
            for a, row in zip(gen, m):
                order = np.argsort(row)[::-1]
                best, second = row[order[0]], row[order[1]]
                if best >= 0.38 and best - second >= 0.04:
                    conn.execute("UPDATE articles SET category=?, category_terms=? WHERE id=?", (protos[order[0]], j(["meaning match"]), a["id"]))
                    retopic += 1
    conn.execute("DELETE FROM article_vecs WHERE id NOT IN (SELECT id FROM articles WHERE collected_at >= ?)", (_since(days=5),))
    conn.commit()
    log(f"  ai: embedded {len(rows)} headlines, merged {merged} duplicate stories, re-topiced {retopic}")
    return {"embedded": len(rows), "merged": merged, "retopic": retopic}


# =================================================================== 2. entities

ENT_KINDS = {"PERSON": "person", "ORG": "organisation", "GPE": "place", "NORP": "group", "LOC": "place", "FAC": "place"}
_ENT_STOP = {"reuters", "ap", "afp", "bbc", "cnn", "video", "live", "watch", "the", "monday", "tuesday", "wednesday", "thursday", "friday",
             "saturday", "sunday", "today", "news", "breaking"}


_ENT_JUNK = re.compile(r"\b(invasion|expansion|attack|cyberattack|hackers?|heat|coastal|district|update|breaking|exclusive|explainer|watch|"
                       r"live|video|photos?|says|report|reports|news|largest|biggest|new|latest|first|fridges?|ceasefire|war|crisis|deal)\b", re.I)


def _good_entity(name: str, kind: str) -> bool:
    """Drop headline fragments and common words that a small model mistakes for names."""
    from .gazetteer import COUNTRIES
    low = name.lower()
    if not 2 < len(name) < 50 or low in _ENT_STOP or not re.search(r"[A-Za-z]", name):
        return False
    if kind in ("person", "organisation"):
        if _ENT_JUNK.search(name) or len(name.split()) > 4:
            return False
        if any(low == c.name.lower() for c in COUNTRIES.values()):
            return False
    return True


def extract_entities(conn: sqlite3.Connection, log=print, nlp=None) -> int:
    ensure_tables(conn)
    if nlp is None:
        import spacy  # optional dependency
        nlp = spacy.load("en_core_web_sm", disable=["lemmatizer"])
    evs = conn.execute("SELECT id, cluster_id FROM events WHERE origin='news_cluster' AND last_updated >= ?", (_since(days=7),)).fetchall()
    n = 0
    with tx(conn):
        for e in evs:
            texts = [f"{a['title']}. {a['excerpt'] or ''}" for a in conn.execute(
                "SELECT title, excerpt FROM articles WHERE cluster_id=? AND (language IS NULL OR language='en') LIMIT 12", (e["cluster_id"],))]
            if not texts:
                continue
            cnt: Counter = Counter()
            for doc in nlp.pipe(texts):
                found = set()
                for ent in doc.ents:
                    kind = ENT_KINDS.get(ent.label_)
                    name = ent.text.strip(" '\"‘’“”").replace("’s", "").replace("'s", "")
                    if kind and _good_entity(name, kind):
                        found.add((name, kind))
                cnt.update(found)  # mentions = number of reports naming it
            conn.execute("DELETE FROM event_entities WHERE event_id=?", (e["id"],))
            for (name, kind), c in cnt.most_common(12):
                conn.execute("INSERT OR REPLACE INTO event_entities VALUES (?,?,?,?)", (e["id"], name, kind, c))
            n += 1
    log(f"  ai: entities for {n} developments")
    return n


def entities_for(conn: sqlite3.Connection, event_id: str) -> list[dict]:
    try:
        return [{"name": r["name"], "kind": r["kind"], "mentions": r["mentions"]} for r in
                conn.execute("SELECT * FROM event_entities WHERE event_id=? ORDER BY mentions DESC LIMIT 10", (event_id,))]
    except sqlite3.OperationalError:
        return []


# =================================================================== 3. disagreements (no model)

_NUM_WORDS = {"one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10, "eleven": 11,
              "twelve": 12, "dozen": 12, "dozens": None, "hundreds": None, "thousands": None}
_CLAIM = re.compile(r"\b(?:at least |more than |over |nearly |around |about |some )?(\d[\d,]*|" + "|".join(k for k, v in _NUM_WORDS.items() if v) +
                    r")\s+(?:people\s+|civilians\s+|soldiers\s+|persons\s+|others\s+)?(?:were\s+|are\s+|have been\s+|been\s+)?"
                    r"(killed|dead|died|deaths|injured|wounded|hurt|missing|displaced|arrested|detained|evacuated)\b", re.I)
_KIND = {"killed": "killed", "dead": "killed", "died": "killed", "deaths": "killed", "injured": "injured", "wounded": "injured", "hurt": "injured",
         "missing": "missing", "displaced": "displaced", "evacuated": "displaced", "arrested": "arrested", "detained": "arrested"}


def numeric_claims(text: str) -> list[tuple[str, int]]:
    out = []
    for m in _CLAIM.finditer(text or ""):
        raw = m.group(1).lower().replace(",", "")
        val = _NUM_WORDS.get(raw) if not raw.isdigit() else int(raw)
        if val:
            out.append((_KIND[m.group(2).lower()], val))
    return out


def disagreements(conn: sqlite3.Connection, cluster_id: str | None) -> list[dict]:
    """Different figures for the same kind of count, from different outlets."""
    if not cluster_id:
        return []
    claims: dict[str, dict[int, set]] = defaultdict(lambda: defaultdict(set))
    for a in conn.execute("SELECT title, excerpt, publisher FROM articles WHERE cluster_id=?", (cluster_id,)):
        for kind, val in numeric_claims(f"{a['title']}. {a['excerpt'] or ''}"):
            claims[kind][val].add(a["publisher"] or "an outlet")
    out = []
    for kind, vals in claims.items():
        if len(vals) < 2:
            continue
        nums = sorted(vals)
        if nums[-1] < 1.15 * nums[0]:
            continue  # close figures are normal updates, not a disagreement
        out.append({"kind": kind, "figures": [{"value": v, "reported_by": sorted(vals[v])[:4]} for v in nums][:5],
                    "note": "Figures often change as more information arrives; later reports may be more complete."})
    return out


# =================================================================== 4. summaries

_SPECULATIVE = re.compile(r"\b(likely|probably|might|could|may|perhaps|possibly|predict\w*|expected to|is set to|will)\b", re.I)
_SELF = re.compile(r"\b(I|I'm|as an ai|language model|my knowledge)\b", re.I)
_COMMON_CAPS = set("""The A An This That These Those It Its In On At For From With And But Or As After Before During While When Where What Who Why How
Officials Authorities Government President Prime Minister Ministry Police Army Military Reports Report According Meanwhile However Background
Monday Tuesday Wednesday Thursday Friday Saturday Sunday January February March April May June July August September October November December
News Outlets Several Some Many Both Other Others There They He She We""".split())


def build_facts(conn: sqlite3.Connection, e: sqlite3.Row, background: list[dict], places: list[dict]) -> str:
    lines = []
    arts = conn.execute("""SELECT title, excerpt, publisher, coalesce(published_at,collected_at) d FROM articles WHERE cluster_id=?
                           AND duplicate_of IS NULL AND (language IS NULL OR language='en') ORDER BY d LIMIT 8""", (e["cluster_id"],)).fetchall()
    for a in arts:
        lines.append(f"- {a['publisher'] or 'An outlet'} ({(a['d'] or '')[:10]}): {a['title']}" + (f" — {a['excerpt']}" if a["excerpt"] else ""))
    for b in background[:1]:
        lines.append(f"- Background (Wikipedia, {b['title']}): " + " ".join(re.split(r"(?<=\.)\s", b["extract"])[:3]))
    return "\n".join(lines)


_FILLER = re.compile(r"\b(is a country|located in|federal republic|news outlets|different outlets|in different locations|various sources|"
                     r"stay tuned|in conclusion|overall,)\b", re.I)
_TITLE_STOP = set("says said after amid over with from that this what when will have been more about into than their they update live".split())


def validate_summary(text: str, facts: str, title: str = "") -> tuple[bool, str]:
    t = text.strip()
    sents = [s for s in re.split(r"(?<=[.!?])\s+", t) if s.strip()]
    if not 2 <= len(sents) <= 6:
        return False, "sentence count"
    if len(t) > 900:
        return False, "too long"
    if _SELF.search(t):
        return False, "talks about itself"
    if _SPECULATIVE.search(t):
        return False, "speculation"
    words = re.findall(r"[a-z0-9]+", t.lower())
    grams = [" ".join(words[i:i + 3]) for i in range(len(words) - 2)]
    if len(grams) != len(set(grams)) and len(grams) - len(set(grams)) > 1:
        return False, "repeats itself"
    if _FILLER.search(t):
        return False, "filler"
    if title:
        tw = {w for w in re.findall(r"[a-z]{4,}", title.lower())} - _TITLE_STOP
        if tw and len(tw & set(words)) < min(2, len(tw)):
            return False, "off topic"
    fl = facts.lower().replace(",", "")
    for n in re.findall(r"\d+(?:[.,]\d+)?", t):
        if n.replace(",", "") not in fl:
            return False, f"number not in facts: {n}"
    for s in sents:
        for w in re.findall(r"\b[A-Z][a-zA-Z'’-]{2,}\b", s):
            if w in _COMMON_CAPS:
                continue
            if w.lower().rstrip("’'s") not in fl and w.lower() not in fl:
                return False, f"name not in facts: {w}"
    return True, "ok"


class Writer:
    def __init__(self):
        from huggingface_hub import hf_hub_download  # optional dependencies
        from llama_cpp import Llama
        path = hf_hub_download(LLM_REPO, LLM_FILE)
        self.llm = Llama(model_path=path, n_ctx=2048, n_threads=max(2, (os.cpu_count() or 2)), verbose=False)

    def chat(self, system: str, user: str, max_tokens: int = 220) -> str:
        r = self.llm.create_chat_completion(messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
                                            temperature=0.2, top_p=0.9, max_tokens=max_tokens)
        return r["choices"][0]["message"]["content"].strip()


SYSTEM_EN = ("You explain world news to a general reader who knows nothing about the topic. Write 3 or 4 short, simple sentences in plain English: "
             "what happened, where, and (only if the facts include background) how it started. Use ONLY the FACTS given. Do not add any name, "
             "number, date, quote or claim that is not in the FACTS. Do not guess, predict or give opinions. If outlets disagree, say so. "
             "Write the summary only, with no heading.")
SYSTEM_HI = ("Translate the English text into simple Hindi (Devanagari script). Keep every number exactly as written. Keep names of people, "
             "places and organisations. Do not add or remove information. Output only the Hindi translation.")


SUMMARY_RULES = "v2"

# automatic alerts and guides read the same every time; a summary adds nothing
_TEMPLATED = re.compile(r"\b(advisory|forecast|warning for|watch for|magnitude|earthquake of|general election:|polling place|how to vote|live updates?)\b", re.I)


def write_summaries(conn: sqlite3.Connection, log=print, writer=None, budget_s: float = 420, max_items: int = 30, hindi: bool = False) -> int:
    from . import context
    ensure_tables(conn)
    rank = {"official_statement": 3, "multi_source_reporting": 2}
    evs = conn.execute("""SELECT * FROM events WHERE origin='news_cluster' AND verification IN ('official_statement','multi_source_reporting')
                          AND last_updated >= ?""", (_since(hours=48),)).fetchall()
    skip = [e["id"] for e in evs if e["category"] == "natural_disasters" or _TEMPLATED.search(e["title"])]
    with tx(conn):
        conn.executemany("DELETE FROM event_summaries WHERE event_id=?", [(i,) for i in skip])
    evs = [e for e in evs if e["id"] not in set(skip)]
    evs = sorted(evs, key=lambda e: -(rank[e["verification"]] * 2 + len(uj(e["source_refs"], []))))[:max_items * 2]
    w = writer
    deadline = time.monotonic() + budget_s
    done = rejected = 0
    for e in evs:
        if done >= max_items or time.monotonic() > deadline:
            break
        bg = [b for b in (context.cached(conn, f"topic:{q}") for q in context.topics_for(e["title"])) if b]
        pl = [b for c in [e["country"]] if c and (b := context.cached(conn, f"country:{c}"))]
        facts = build_facts(conn, e, bg, pl)
        h = hashlib.sha1((SUMMARY_RULES + facts).encode()).hexdigest()[:16]  # new rules → re-check old summaries
        old = conn.execute("SELECT evidence_hash FROM event_summaries WHERE event_id=?", (e["id"],)).fetchone()
        if old and old["evidence_hash"] == h:
            continue
        if w is None:
            w = Writer()
        text = w.chat(SYSTEM_EN, f"FACTS:\n{facts}\n\nWrite the summary.")
        ok, why = validate_summary(text, facts, e["title"])
        if not ok:
            rejected += 1
            log(f"  ai: rejected summary ({why}) for “{e['title'][:60]}”")
            with tx(conn):
                conn.execute("DELETE FROM event_summaries WHERE event_id=?", (e["id"],))
            continue
        hi = None
        if hindi and time.monotonic() < deadline:
            cand = w.chat(SYSTEM_HI, text, max_tokens=400)
            nums_en = sorted(re.findall(r"\d+", text))
            if re.search(r"[ऀ-ॿ]", cand) and sorted(re.findall(r"\d+", cand)) == nums_en and len(cand) < 1500:
                hi = cand
        with tx(conn):
            conn.execute("INSERT OR REPLACE INTO event_summaries VALUES (?,?,?,?,?,?)", (e["id"], h, text, hi, LLM_FILE, now_iso()))
        done += 1
    log(f"  ai: wrote {done} checked summaries, rejected {rejected}")
    return done


def summary_for(conn: sqlite3.Connection, event_id: str) -> dict | None:
    try:
        r = conn.execute("SELECT * FROM event_summaries WHERE event_id=?", (event_id,)).fetchone()
    except sqlite3.OperationalError:
        return None
    return {"text": r["text"], "text_hi": None, "model": r["model"], "created_at": r["created_at"]} if r else None


def run_all(conn: sqlite3.Connection, log=print) -> dict:
    """Entry point used by the pipeline. Each part is independent."""
    out = {}
    for name, fn in (("entities", lambda: extract_entities(conn, log)), ("summaries", lambda: write_summaries(conn, log))):
        try:
            out[name] = fn()
        except Exception as ex:  # optional layer: never break the run
            log(f"  ai: {name} skipped — {type(ex).__name__}: {str(ex)[:160]}")
    return out
