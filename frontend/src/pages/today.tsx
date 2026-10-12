import { useEffect, useMemo, useState } from 'react'
import { LeadStory, StoryCard } from '../components/story'
import { CountryBars, Empty, ErrorBox, FilterBar, Loading, PageHead, ShareButton, SignalItem, Tiles, useCountries, VerifBadge } from '../components/ui'
import { greeting, userName, useUser } from '../components/welcome'
import type { Changes, Event, MarketLatest, Meta, Signal } from '../data'
import { useData } from '../data'
import { t } from '../i18n'
import { useFilters, watchStore } from '../store'
import { ago, Badge, cat, filterEvents, flag, FOCUS, RISK, sortEvents } from '../util'

export const PULSE: [string, string][] = [['mkt:BZ=F', 'Brent crude'], ['mkt:CL=F', 'WTI crude'], ['mkt:NG=F', 'Natural gas'], ['mkt:GC=F', 'Gold'],
  ['mkt:^GSPC', 'S&P 500'], ['mkt:^NSEI', 'Nifty 50'], ['fx:USDINR', 'USD / INR'], ['crypto:bitcoin', 'Bitcoin']]

export function useLatest() {
  return useData<MarketLatest[]>('dashboard/markets_latest.json')
}

export function Today() {
  const meta = useData<Meta>('meta.json')
  const ch = useData<Changes>('changes.json')
  const ev = useData<{ events: Event[] }>('events.json')
  const sg = useData<{ signals: Signal[] }>('signals.json')
  const f = useFilters()
  const user = useUser()
  const { by, regionOf } = useCountries()
  const [n, setN] = useState(10)
  useEffect(() => setN(10), [f])
  const rows = useMemo(() => (ev.data ? sortEvents(filterEvents(ev.data.events, f, regionOf)) : null), [ev.data, f, regionOf])
  const sigs = useMemo(() => sg.data?.signals.filter((s) => !['market', 'fx'].includes(s.signal_type) && (!f.country || s.country === f.country) && (!f.region || regionOf(s.country) === f.region))
    .sort((a, b) => b.detected_at.localeCompare(a.detected_at)).slice(0, 4), [sg.data, f, regionOf])
  if (meta.error) return <ErrorBox error={meta.error} />
  const fx = FOCUS.find((x) => x.key === f.focus) || FOCUS[0]
  const where = f.country ? by[f.country]?.name || f.country : f.region || ''
  return (
    <>
      <PageHead
        title={userName(user) ? <span className="greet">{greeting(userName(user))} <span className="wave">👋</span></span> : t('Today')}
        sub={<>Here is what’s going on in the world{meta.data ? <> · {t('Updated')} {ago(meta.data.generated_at)}</> : ''}</>}
        actions={<ShareButton title="WorldPulse — what's going on in the world" path="/" />} />

      <FilterBar events={ev.data?.events} />

      <div className="today-grid">
        <section>
          <div className="section-head">
            <h2 className="section-title">{fx.icon} {f.focus === 'all' ? 'What’s going on in the world' : t(fx.label)}{where ? ` — ${where}` : ''}</h2>
            <span className="small muted">Best-supported first · tap 🧠 for a simple explanation</span>
          </div>
          {ev.error ? <ErrorBox error={ev.error} /> : !rows ? <Loading rows={6} /> : !rows.length ? <Empty>{t('Nothing matches these filters.')} Try a longer time window or another topic.</Empty> : (
            <div className="stories">
              <LeadStory e={rows[0]} names={by} />
              {rows.slice(1, n).map((e, i) => <StoryCard key={e.id} e={e} names={by} rank={i + 2} />)}
              {rows.length > n && <button type="button" className="icon-btn more-btn" onClick={() => setN(n + 15)}>{t('Show more')} ({rows.length - n})</button>}
            </div>
          )}
        </section>
        <aside className="stack">
          {rows && rows.length > 0 && <Glance rows={rows} />}
          <WatchPanel events={ev.data?.events} />
          <ChangesCard ch={ch.data} />
          <div className="card"><h3>{t('Where it is happening')}</h3><p className="sub">Stories per country for these filters. Tap a country to see only its news.</p><CountryBars rows={rows} /></div>
          <div className="card">
            <div className="card-head"><h3>⚡ Unusual activity</h3><a href="#/signals" className="small">{t('See all')} →</a></div>
            <p className="sub">Things that changed unusually fast — for example a sudden jump in news about a country. Not predictions.</p>
            {sigs ? (sigs.length ? <div className="list">{sigs.map((s) => <SignalItem key={s.id} s={s} />)}</div> : <Empty>Nothing unusual for these filters.</Empty>) : <Loading rows={2} />}
          </div>
        </aside>
      </div>
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
