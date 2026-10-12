// Word-aware search used by the Search page and the top-bar suggestions.
// Matches whole words or word beginnings (so "oil" finds "oil", "oils" but
// not "turmoil" or "soil"), works for Hindi (Devanagari) and English, and
// ranks items containing every query word above partial matches.

const WORD = /[\p{L}\p{N}][\p{L}\p{N}\p{M}'’-]*/gu

const stem = (w: string) => {
  if (w.length > 5 && w.endsWith('ies')) return w.slice(0, -3) + 'y'
  if (w.length > 4 && /(sses|shes|ches|xes)$/.test(w)) return w.slice(0, -2)
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1)
  return w
}

export const tokens = (text: string): string[] => (text.toLowerCase().normalize('NFKC').match(WORD) || []).map((w) => w.replace(/['’]s$/, ''))

export type Doc = { fields: [string, number][]; date?: string | null; boost?: number }
export type Prepared = { words: Map<string, number>; date?: string | null; boost: number }

/** Precompute each document's words with their best field weight. */
export function prepare(doc: Doc): Prepared {
  const words = new Map<string, number>()
  for (const [text, weight] of doc.fields) {
    if (!text) continue
    for (const w of tokens(text)) {
      for (const form of new Set([w, stem(w)])) words.set(form, Math.max(words.get(form) || 0, weight))
    }
  }
  return { words, date: doc.date, boost: doc.boost || 0 }
}

export type Query = { terms: string[]; raw: string }
const STOP = new Set(['the', 'a', 'an', 'of', 'in', 'on', 'and', 'or', 'for', 'to', 'is', 'are', 'news', 'latest', 'के', 'की', 'का', 'में', 'और'])
export function parseQuery(q: string): Query {
  const terms = [...new Set(tokens(q).filter((w) => !STOP.has(w)).map(stem))]
  return { terms: terms.length ? terms : tokens(q).map(stem), raw: q.trim() }
}

/** Score: 0 = no match. Every term must match a word start; returns {score, all}. */
export function score(p: Prepared, q: Query): { score: number; matched: number } {
  if (!q.terms.length) return { score: 0, matched: 0 }
  let total = 0
  let matched = 0
  for (const t of q.terms) {
    let best = 0
    const exact = p.words.get(t)
    if (exact) best = exact * 2
    else if (t.length >= 2) {
      for (const [w, weight] of p.words) if (w.startsWith(t)) { best = Math.max(best, weight); if (best >= 3) break }
    }
    if (best) { matched++; total += best }
  }
  if (!matched) return { score: 0, matched: 0 }
  const ageDays = p.date ? Math.max(0, (Date.now() - new Date(p.date).getTime()) / 864e5) : 30
  return { score: total * (matched === q.terms.length ? 3 : 1) + p.boost + Math.max(0, 3 - ageDays / 3), matched }
}

/** Split text into [plain, highlighted] parts for display (React-safe, no HTML). */
export function highlight(text: string, q: Query): { s: string; hit: boolean }[] {
  if (!q.terms.length) return [{ s: text, hit: false }]
  const out: { s: string; hit: boolean }[] = []
  let last = 0
  for (const m of text.matchAll(WORD)) {
    const w = m[0].toLowerCase()
    const hit = q.terms.some((t) => w.startsWith(t) || stem(w) === t)
    if (hit) {
      if (m.index! > last) out.push({ s: text.slice(last, m.index), hit: false })
      out.push({ s: m[0], hit: true })
      last = m.index! + m[0].length
    }
  }
  if (last < text.length) out.push({ s: text.slice(last), hit: false })
  return out
}
