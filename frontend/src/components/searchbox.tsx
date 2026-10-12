import { useEffect, useMemo, useRef, useState } from 'react'
import type { CountrySummary, MarketLatest } from '../data'
import { load } from '../data'
import { t } from '../i18n'
import { parseQuery, prepare, score, type Prepared } from '../search'
import { flag } from '../util'

type Sug = { label: string; sub: string; href: string; icon: string; prep: Prepared }
const PAGES: [string, string, string, string][] = [
  ['Markets', '/markets', '📈', 'prices stocks indices commodities gold oil crypto bitcoin'], ['Energy', '/energy', '🛢️', 'oil gas brent wti opec lng power'],
  ['Trade & shipping', '/trade', '🚢', 'tariffs exports shipping freight'], ['Sanctions tracker', '/trade?tab=sanctions', '⚖️', 'sanctions embargo export controls'],
  ['Chokepoint watch', '/trade?tab=routes', '⚓', 'hormuz red sea suez panama canal strait shipping routes'], ['Supply chains', '/trade?tab=supply', '🔗', 'semiconductors chips grain fertilizer'],
  ['Conflict & security', '/conflict', '🛡️', 'war military missile attack defence'], ['Country risk', '/risk', '🚦', 'risk scorecard'],
  ['Currency watch', '/markets?tab=fx', '💱', 'currency rupee inr yuan euro dollar exchange rate forex'], ['Compare prices', '/markets?tab=compare', '⚖️', 'compare chart'],
  ['Central banks', '/policy?tab=banks', '🏦', 'rbi fed ecb interest rate repo central bank'], ['Elections in the news', '/policy?tab=elections', '🗳️', 'election vote'],
  ['Weekly review', '/briefings?b=weekly', '🗓️', 'week summary review'], ['Signals', '/signals', '⚡', 'anomaly alert unusual'], ['Watchlist & alerts', '/watch', '⭐', 'watchlist alert notify'],
  ['Earthquakes', '/quakes', '🌋', 'earthquake quake usgs'], ['Learn', '/learn', '📘', 'explainer what is'],
]

export function SearchBox() {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [sel, setSel] = useState(-1)
  const [docs, setDocs] = useState<Sug[]>(() => PAGES.map(([l, href, icon, kw]) => ({ label: t(l), sub: 'Page', href, icon, prep: prepare({ fields: [[l, 4], [kw, 2]], boost: 1 }) })))
  const box = useRef<HTMLDivElement>(null)
  const loaded = useRef(false)
  const ensure = () => {
    if (loaded.current) return
    loaded.current = true
    Promise.all([load<{ countries: CountrySummary[] }>('countries.json'), load<MarketLatest[]>('dashboard/markets_latest.json')]).then(([c, m]) => setDocs((d) => [
      ...d,
      ...c.countries.map((x) => ({ label: `${flag(x.iso2)} ${x.name}`, sub: `Country · ${x.region}`, href: `/country/${x.iso2}`, icon: '', prep: prepare({ fields: [[x.name, 4], [x.iso2, 4], [x.capital || '', 2]], boost: 2 }) })),
      ...m.map((x) => ({ label: x.name, sub: `Price · ${x.last.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${x.unit}`, href: `/markets?s=${encodeURIComponent(x.id)}`, icon: '💹', prep: prepare({ fields: [[x.name, 4], [x.id.replace(/^\w+:/, ''), 3], ['price prices rate', 3]], boost: 2 }) })),
    ])).catch(() => undefined)
  }
  const query = useMemo(() => parseQuery(q), [q])
  const sugs = useMemo(() => (query.terms.length ? docs.map((d) => ({ d, ...score(d.prep, query) })).filter((x) => x.matched === query.terms.length).sort((a, b) => b.score - a.score).slice(0, 6).map((x) => x.d) : []), [docs, query])
  useEffect(() => {
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])
  useEffect(() => { const f = () => { setOpen(false); setQ('') }; addEventListener('hashchange', f); return () => removeEventListener('hashchange', f) }, [])
  const go = (href: string) => { location.hash = href; (document.activeElement as HTMLElement)?.blur() }
  const submit = () => { if (sel >= 0 && sugs[sel]) go(sugs[sel].href); else if (q.trim()) go(`/search?q=${encodeURIComponent(q.trim())}`) }
  return (
    <div className="search" ref={box}>
      <form role="search" onSubmit={(e) => { e.preventDefault(); submit() }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        <input type="search" enterKeyHint="search" autoComplete="off" placeholder={t('Search countries, events, headlines…')} value={q} aria-label="Search" aria-expanded={open && q.length > 0} aria-controls="search-sugs"
          onFocus={() => { ensure(); setOpen(true) }} onChange={(e) => { setQ(e.target.value); setOpen(true); setSel(-1); ensure() }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, sugs.length)) }
            if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, -1)) }
            if (e.key === 'Escape') setOpen(false)
          }} />
        {q && <button type="submit" className="search-go" aria-label="Search">→</button>}
      </form>
      {open && q.trim().length > 0 && (
        <div className="search-sugs" id="search-sugs" role="listbox">
          {sugs.map((s, i) => (
            <button type="button" key={s.href} role="option" aria-selected={sel === i} className={sel === i ? 'on' : ''} onMouseDown={(e) => e.preventDefault()} onClick={() => go(s.href)}>
              <span className="sug-icon">{s.icon}</span><span className="sug-main"><b>{s.label}</b><small>{s.sub}</small></span></button>
          ))}
          <button type="button" role="option" aria-selected={sel === sugs.length} className={`sug-all ${sel === sugs.length ? 'on' : ''}`} onMouseDown={(e) => e.preventDefault()} onClick={() => go(`/search?q=${encodeURIComponent(q.trim())}`)}>
            🔎 Search all news for “{q.trim()}”</button>
        </div>
      )}
    </div>
  )
}
