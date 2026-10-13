import { useEffect, useMemo, useRef, useState } from 'react'
import { StoryCard, topPicks, TopSlider } from '../components/story'
import { CountryBars, Empty, ErrorBox, FilterBar, Loading, PageHead, ShareButton, SignalItem, Tiles, useCountries, VerifBadge } from '../components/ui'
import { greeting, userName, useUser } from '../components/welcome'
import type { Changes, CountrySummary, Event, MarketLatest, Meta, Signal } from '../data'
import { useData } from '../data'
import { t } from '../i18n'
import { setFilters, useFilters, watchStore } from '../store'
import { ago, Badge, byImportance, cat, filterEvents, flag, FOCUS, frontWorthy, RISK } from '../util'

export const PULSE: [string, string][] = [['mkt:BZ=F', 'Brent crude'], ['mkt:CL=F', 'WTI crude'], ['mkt:NG=F', 'Natural gas'], ['mkt:GC=F', 'Gold'],
  ['mkt:^GSPC', 'S&P 500'], ['mkt:^NSEI', 'Nifty 50'], ['fx:USDINR', 'USD / INR'], ['crypto:bitcoin', 'Bitcoin']]

export function useLatest() {
  return useData<MarketLatest[]>('dashboard/markets_latest.json')
}

// When the reader last opened the site (read once per page load), to mark what is new for them.
const LAST = 'worldpulse.lastvisit.v1'
const prevVisit = (() => { try { return Number(localStorage.getItem(LAST) || 0) } catch { return 0 } })()
setTimeout(() => { try { localStorage.setItem(LAST, String(Date.now())) } catch { /* private mode */ } }, 4000)
export const isNew = (e: Event) => prevVisit > 0 && new Date(e.first_detected).getTime() > prevVisit

const SECTIONS: { key: string; title: string; cats: string[]; focus: string }[] = [
  { key: 'war', title: '⚔️ Wars & security', cats: ['military_security'], focus: 'conflict' },
  { key: 'money', title: '💰 Money, trade & energy', cats: ['economics', 'financial_markets', 'trade', 'energy'], focus: 'business' },
  { key: 'pol', title: '🏛️ Politics, sanctions & diplomacy', cats: ['geopolitics', 'diplomacy', 'elections'], focus: 'geo' },
  { key: 'dis', title: '🌋 Disasters & health', cats: ['natural_disasters', 'public_health', 'environment'], focus: 'disasters' },
  { key: 'tech', title: '💻 Tech & cyber', cats: ['technology', 'cybersecurity'], focus: 'cyber' },
]

export function Today() {
  const meta = useData<Meta>('meta.json')
  const ch = useData<Changes>('changes.json')
  const fr = useData<{ events: Event[] }>('front.json')
  const f = useFilters()
  const isDefault = f.focus === 'all' && !f.country && !f.region && !f.q && f.support === 'all' && f.hours === 168
  // the small front-page file shows at once; the full list loads right after (or at once when filtering)
  const [wantFull, setWantFull] = useState(!isDefault)
  useEffect(() => { if (!isDefault) setWantFull(true); else { const id = setTimeout(() => setWantFull(true), 1200); return () => clearTimeout(id) } }, [isDefault])
  const ev = useData<{ events: Event[] }>(wantFull || fr.error ? 'events.json' : null)
  const sg = useData<{ signals: Signal[] }>('signals.json')
  const user = useUser()
  const { by, regionOf } = useCountries()
  const [n, setN] = useState(12)
  useEffect(() => setN(12), [f])
  const all = ev.data?.events || fr.data?.events
  const rows = useMemo(() => {
    if (!all) return null
    const r = filterEvents(all, f, regionOf)
    // whole-world view: only world-relevant, confirmed stories; a country/topic view shows everything, best first
    return byImportance(isDefault || f.support === 'all' && !f.country && !f.q ? r.filter(frontWorthy) : r)
  }, [all, f, regionOf, isDefault])
  const top = useMemo(() => (rows ? topPicks(rows) : []), [rows])
  const rest = useMemo(() => (rows ? rows.filter((e) => !top.includes(e)) : []), [rows, top])
  const sigs = useMemo(() => sg.data?.signals.filter((s) => s.confidence === 'high' && !['market', 'fx'].includes(s.signal_type) && (!f.country || s.country === f.country) && (!f.region || regionOf(s.country) === f.region))
    .sort((a, b) => b.detected_at.localeCompare(a.detected_at)).slice(0, 4), [sg.data, f, regionOf])
  // when the reader changes a filter, bring the stories into view
  const listRef = useRef<HTMLDivElement>(null)
  const firstRun = useRef(true)
  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return }
    const el = listRef.current
    if (el && el.getBoundingClientRect().top < 0 || (el && el.getBoundingClientRect().top > innerHeight * 0.6)) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [f.focus, f.country, f.region, f.q, f.hours, f.support])
  if (meta.error) return <ErrorBox error={meta.error} />
  const fx = FOCUS.find((x) => x.key === f.focus) || FOCUS[0]
  const where = f.country ? by[f.country]?.name || f.country : f.region || ''
  const newCount = rows ? rows.filter(isNew).length : 0
  return (
    <>
      <PageHead
        title={userName(user) ? <span className="greet">{greeting(userName(user))} <span className="wave">👋</span></span> : t('Today')}
        sub={<>Here is what’s going on in the world{meta.data ? <> · {t('Updated')} {ago(meta.data.generated_at)}</> : ''}{newCount > 0 && <> · <b className="new-count">{newCount} new since your last visit</b></>}</>}
        actions={<ShareButton title="WorldPulse — what's going on in the world" path="/" />} />

      <FilterBar events={ev.data?.events || fr.data?.events} />

      <div className="today-grid">
        <section>
          <div className="section-head scroll-anchor" ref={listRef}>
            <h2 className="section-title">{fx.icon} {f.focus === 'all' ? 'What’s going on in the world' : t(fx.label)}{where ? ` — ${where}` : ''}</h2>
            <span className="small muted">Most important first · tap 🧠 for a simple explanation</span>
          </div>
          {(ev.error && fr.error) ? <ErrorBox error={ev.error} /> : !rows ? <Loading rows={6} /> : !rows.length ? <Empty>{t('Nothing matches these filters.')} Try a longer time window or another topic.</Empty> : (
            <div className="stories">
              <TopSlider items={top} names={by} />
              {isDefault ? <Sections rows={rest} names={by} /> : <>
                {rest.slice(0, n).map((e) => <StoryCard key={e.id} e={e} names={by} fresh={isNew(e)} />)}
                {rest.length > n && <button type="button" className="icon-btn more-btn" onClick={() => setN(n + 15)}>{t('Show more')} ({rest.length - n})</button>}
              </>}
            </div>
          )}
        </section>
        <aside className="stack">
          <a className="card me-teaser" href="#/me"><span style={{ fontSize: 28 }}>🎯</span><div><b>How does this affect me?</b><div className="small muted">Pick who you are — get a short note on prices and news that matter to you.</div></div><span className="me-go">→</span></a>
          {rows && rows.length > 0 && <Glance rows={rows} />}
          <WatchPanel events={all} />
          <ChangesCard ch={ch.data} />
          <div className="card"><h3>{t('Where it is happening')}</h3><p className="sub">Stories per country. Tap a country to see only its news.</p><CountryBars rows={rows} /></div>
          <div className="card">
            <div className="card-head"><h3>⚡ Unusual activity</h3><a href="#/signals" className="small">{t('See all')} →</a></div>
            <p className="sub">Numbers that changed much faster than normal — for example a sudden jump in news about a country. Not predictions.</p>
            {sigs ? (sigs.length ? <div className="list">{sigs.map((s) => <SignalItem key={s.id} s={s} />)}</div> : <Empty>Nothing unusual right now.</Empty>) : <Loading rows={2} />}
          </div>
        </aside>
      </div>
    </>
  )
}

function Sections({ rows, names }: { rows: Event[]; names: Record<string, CountrySummary> }) {
  const used = new Set<string>()
  return (
    <>
      {SECTIONS.map((sec) => {
        const items = rows.filter((e) => sec.cats.includes(e.category) && !used.has(e.id))
        if (!items.length) return null
        items.slice(0, 3).forEach((e) => used.add(e.id))
        return (
          <div key={sec.key} className="sec">
            <div className="sec-head"><h3>{sec.title}</h3>
              {items.length > 3 && <button type="button" className="sec-all" onClick={() => setFilters({ focus: sec.focus })}>{t('See all')} {items.length} →</button>}</div>
            {items.slice(0, 3).map((e) => <StoryCard key={e.id} e={e} names={names} fresh={isNew(e)} />)}
          </div>
        )
      })}
    </>
  )
}

function ChangesCard({ ch }: { ch?: Changes }) {
  if (!ch) return <Loading rows={3} />
  return (
    <div className="card">
      <h3>🔄 {t('What changed since yesterday')}</h3>
      <div className="note" style={{ marginBottom: 8 }}>Last 24 hours compared with the 6 days before.</div>
      {ch.new_developments.slice(0, 4).map((d) => (
        <div key={d.id} className="small changes-dev" style={{ padding: '4px 0' }}>
          <a href={`#/event/${encodeURIComponent(d.id)}`} style={{ color: 'var(--text)', fontWeight: 600 }}>{d.title}</a> <span className="faint">· {d.outlets} outlets</span></div>))}
      {!ch.new_developments.length && <div className="small faint">No new multi-source stories in 24 hours.</div>}
      {ch.rising_countries.length > 0 && <>
        <div className="small muted" style={{ fontWeight: 600, margin: '10px 0 4px' }}>{t('Countries in the news')} (more than usual)</div>
        {ch.rising_countries.slice(0, 4).map((c) => (
          <a key={c.iso2} href={`#/country/${c.iso2}`} className="kv-line"><span>{flag(c.iso2)} {c.name}</span><span className="faint">{c.last_24h} stories vs ~{c.daily_avg_prev}/day</span></a>))}
      </>}
    </div>
  )
}

function WatchPanel({ events }: { events?: Event[] }) {
  const w = watchStore.use()
  const lt = useData<MarketLatest[]>(w.markets.length ? 'dashboard/markets_latest.json' : null)
  const risk = useData<{ countries: { iso2: string; level: number }[] }>(w.countries.length ? 'risk.json' : null)
  const { by } = useCountries()
  if (!w.countries.length && !w.markets.length && !w.topics.length) return null
  const lv = (iso: string) => risk.data?.countries.find((c) => c.iso2 === iso)?.level
  return (
    <div className="card">
      <div className="card-head"><h3>⭐ {t('My watchlist')}</h3><a className="small" href="#/watch">Manage →</a></div>
      {w.markets.length > 0 && <div style={{ margin: '8px 0' }}><Tiles items={lt.data} ids={w.markets.map((m) => [m] as [string])} /></div>}
      {w.countries.map((iso) => {
        const last = events?.filter((e) => e.country === iso).sort((a, b) => b.last_updated.localeCompare(a.last_updated))[0]
        const l = lv(iso)
        return (
          <a key={iso} href={`#/country/${iso}`} style={{ display: 'block', color: 'var(--text)', padding: '8px 0', borderTop: '1px solid var(--border)' }}>
            <div className="row spread"><b>{flag(iso)} {by[iso]?.name || iso}</b>{l != null && <Badge tone={RISK[l].tone}>{t(RISK[l].label)}</Badge>}</div>
            <div className="small muted" style={{ marginTop: 3 }}>{last ? last.title : 'No developments this week.'}</div>
          </a>
        )
      })}
      {w.topics.map((tp) => {
        const e = events?.filter((x) => x.category === tp && x.verification !== 'single_source_report')[0]
        return <div key={tp} style={{ padding: '8px 0', borderTop: '1px solid var(--border)' }}><b style={{ color: cat(tp).color }}>{cat(tp).icon} {cat(tp).label}</b>
          {e && <div className="small" style={{ marginTop: 3 }}><a href={`#/event/${encodeURIComponent(e.id)}`} style={{ color: 'var(--text)' }}>{e.title}</a> <VerifBadge v={e.verification} /></div>}</div>
      })}
    </div>
  )
}

function Glance({ rows }: { rows: Event[] }) {
  const countries = new Set(rows.map((e) => e.country).filter(Boolean)).size
  const confirmed = rows.filter((e) => e.verification !== 'single_source_report').length
  return (
    <div className="card">
      <h3>📊 {t('At a glance')}</h3>
      <div className="glance" style={{ marginTop: 8 }}>
        <div><b>{rows.length}</b><span>stories</span></div>
        <div><b>{countries}</b><span>countries</span></div>
        <div><b>{confirmed}</b><span>confirmed by 2+ sources or official</span></div>
      </div>
    </div>
  )
}
