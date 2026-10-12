import { useMemo } from 'react'
import { CountryBars, ErrorBox, EventList, FilterBar, Loading, PageHead, ShareButton, SignalItem, Tiles, useCountries, VerifBadge } from '../components/ui'
import type { Changes, Event, MarketLatest, Meta, Signal } from '../data'
import { useData } from '../data'
import { greeting, userName, useUser } from '../components/welcome'
import { t } from '../i18n'
import { useFilters, watchStore } from '../store'
import { ago, Badge, cat, filterEvents, flag, FOCUS, pct, RISK, tone } from '../util'

export const PULSE: [string, string][] = [['mkt:BZ=F', 'Brent crude'], ['mkt:CL=F', 'WTI crude'], ['mkt:NG=F', 'Natural gas'], ['mkt:GC=F', 'Gold'],
  ['mkt:^GSPC', 'S&P 500'], ['mkt:^NSEI', 'Nifty 50'], ['fx:USDINR', 'USD / INR'], ['crypto:bitcoin', 'Bitcoin']]

export function useLatest() {
  return useData<MarketLatest[]>('dashboard/markets_latest.json')
}

export function Today() {
  const meta = useData<Meta>('meta.json')
  const ch = useData<Changes>('changes.json')
  const lt = useLatest()
  const ev = useData<{ events: Event[] }>('events.json')
  const sg = useData<{ signals: Signal[] }>('signals.json')
  const f = useFilters()
  const user = useUser()
  const { by, regionOf } = useCountries()
  const rows = useMemo(() => (ev.data ? filterEvents(ev.data.events, f, regionOf) : null), [ev.data, f, regionOf])
  const sigs = useMemo(() => {
    if (!sg.data) return null
    const pri: Record<string, number> = { market: 0, fx: 0, news_volume: 1, topic_volume: 1, disaster_alert: 2, internet: 3, earthquake: 4, quake_cluster: 5 }
    return sg.data.signals.filter((s) => (!f.country || s.country === f.country) && (!f.region || regionOf(s.country) === f.region))
      .sort((a, b) => (pri[a.signal_type] ?? 9) - (pri[b.signal_type] ?? 9) || b.detected_at.localeCompare(a.detected_at)).slice(0, 5)
  }, [sg.data, f, regionOf])
  if (meta.error) return <ErrorBox error={meta.error} />
  const fx = FOCUS.find((x) => x.key === f.focus)!
  return (
    <>
      <PageHead title={userName(user) ? <span className="greet">{greeting(userName(user))} <span className="wave">👋</span></span> : t('Today')} sub={meta.data ? <>{t('Data collected')} {ago(meta.data.generated_at)} · {meta.data.sources.ok}/{meta.data.sources.total} {t('sources OK')} · public sources only</> : t('Loading…')}
        actions={<ShareButton title="WorldPulse — today" path="/" />} />
      {meta.data?.quality_ok === false && <div className="banner warn"><span>🩺</span><div className="small"><b>Automatic checks flagged a problem with the latest data.</b> {meta.data.quality_problems?.join(' · ')}</div></div>}

      <div style={{ marginBottom: 14 }}><Tiles items={lt.data} ids={PULSE} /></div>
      <ChangesCard ch={ch.data} />
      <div style={{ height: 14 }} />
      <WatchPanel latest={lt.data} events={ev.data?.events} />

      <FilterBar events={ev.data?.events} />
      <div className="grid g2">
        <div className="card">
          <div className="card-head"><h3>{t('Key developments')} — {t(fx.label)}</h3></div>
          <p className="sub">Best-supported first. Tap a headline for its timeline and sources.</p>
          {ev.error ? <ErrorBox error={ev.error} /> : <EventList rows={rows} step={8} names={by} />}
        </div>
        <div className="stack">
          <div className="card"><h3>{t('Where it is happening')}</h3><p className="sub">Developments per country for these filters. Tap a country to filter.</p><CountryBars rows={rows} /></div>
          <div className="card">
            <div className="card-head"><h3>{t('Risk signals')}</h3><a href="#/signals" className="small">{t('See all')} →</a></div>
            <p className="sub">Unusual moves in prices and coverage. Not predictions.</p>
            {sigs ? (sigs.length ? <div className="list">{sigs.map((s) => <SignalItem key={s.id} s={s} />)}</div> : <div className="empty">No signal crossed its threshold for these filters.</div>) : <Loading />}
          </div>
        </div>
      </div>
    </>
  )
}

function ChangesCard({ ch }: { ch?: Changes }) {
  if (!ch) return <Loading rows={3} />
  return (
    <div className="card">
      <div className="card-head"><h3>🔄 {t('What changed since yesterday')}</h3></div>
      <div className="note">{ch.note}</div>
      <div className="grid g4" style={{ marginTop: 8 }}>
        <div>
          <div className="small muted" style={{ fontWeight: 600, marginBottom: 6 }}>{t('Price moves')}</div>
          {ch.price_moves.slice(0, 5).map((m, i) => (
            <a key={m.id} href={`#/markets?s=${encodeURIComponent(m.id)}`} className={`kv-line ${i >= 3 ? 'changes-more' : ''}`}>
              <span>{m.name}</span><b className={tone(m.chg)}>{pct(m.chg)}</b></a>))}
          {!ch.price_moves.length && <div className="small faint">No fresh prices.</div>}
        </div>
        <div className="changes-wide">
          <div className="small muted" style={{ fontWeight: 600, marginBottom: 6 }}>{t('New developments')}</div>
          {ch.new_developments.slice(0, 5).map((d, i) => (
            <div key={d.id} className={`small changes-dev ${i >= 3 ? 'changes-more' : ''}`} style={{ padding: '3px 0' }}>
              <a href={`#/event/${encodeURIComponent(d.id)}`} style={{ color: 'var(--text)', fontWeight: 600 }}>{d.title}</a> <span className="faint">· {d.category} · {d.outlets} outlets</span></div>))}
          {!ch.new_developments.length && <div className="small faint">No new multi-source developments in 24 hours.</div>}
        </div>
        <div>
          <div className="small muted" style={{ fontWeight: 600, marginBottom: 6 }}>{t('Countries in the news')}</div>
          {ch.rising_countries.slice(0, 5).map((c, i) => (
            <a key={c.iso2} href={`#/country/${c.iso2}`} className={`kv-line ${i >= 3 ? 'changes-more' : ''}`}>
              <span>{flag(c.iso2)} {c.name}</span><span className="faint">{c.last_24h} vs ~{c.daily_avg_prev}/day</span></a>))}
          {!ch.rising_countries.length && <div className="small faint">No unusual jumps.</div>}
          {ch.new_signals.length > 0 && <a href="#/signals" className="small" style={{ display: 'block', marginTop: 6 }}>⚡ {ch.new_signals.length} {t('New signals')} →</a>}
        </div>
      </div>
    </div>
  )
}

function WatchPanel({ latest, events }: { latest?: MarketLatest[]; events?: Event[] }) {
  const w = watchStore.use()
  const risk = useData<{ countries: { iso2: string; level: number }[] }>(w.countries.length ? 'risk.json' : null)
  const { by } = useCountries()
  if (!w.countries.length && !w.markets.length && !w.topics.length) {
    return <div className="banner info no-print"><span>⭐</span><div className="small"><b>{t('My watchlist')}:</b> tap ☆ on any market, country or topic to pin it here. It is saved only in this browser.</div></div>
  }
  const lv = (iso: string) => risk.data?.countries.find((c) => c.iso2 === iso)?.level
  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div className="card-head"><h3>⭐ {t('My watchlist')}</h3><a className="small" href="#/watch">Manage →</a></div>
      {w.markets.length > 0 && <div style={{ margin: '8px 0 12px' }}><Tiles items={latest} ids={w.markets.map((m) => [m] as [string])} /></div>}
      <div className="grid g3">
        {w.countries.map((iso) => {
          const last = events?.filter((e) => e.country === iso).sort((a, b) => b.last_updated.localeCompare(a.last_updated))[0]
          const l = lv(iso)
          return (
            <a key={iso} href={`#/country/${iso}`} className="card" style={{ color: 'var(--text)', textDecoration: 'none', boxShadow: 'none' }}>
              <div className="row spread"><b>{flag(iso)} {by[iso]?.name || iso}</b>{l != null && <Badge tone={RISK[l].tone}>{t(RISK[l].label)}</Badge>}</div>
              {last ? <div className="small muted" style={{ marginTop: 6 }}>{last.title}</div> : <div className="small faint" style={{ marginTop: 6 }}>No developments this week.</div>}
            </a>
          )
        })}
        {w.topics.map((tp) => {
          const items = events?.filter((e) => e.category === tp && e.verification !== 'single_source_report').slice(0, 3) || []
          return (
            <div key={tp} className="card" style={{ boxShadow: 'none' }}>
              <b style={{ color: cat(tp).color }}>{cat(tp).icon} {cat(tp).label}</b>
              {items.map((e) => <div key={e.id} className="small" style={{ marginTop: 6 }}><a href={`#/event/${encodeURIComponent(e.id)}`} style={{ color: 'var(--text)' }}>{e.title}</a> <VerifBadge v={e.verification} /></div>)}
              {!items.length && <div className="small faint" style={{ marginTop: 6 }}>No multi-source developments.</div>}
            </div>
          )
        })}
      </div>
      {latest && w.markets.length > 0 && <div className="fresh" style={{ marginTop: 6 }}>Prices are delayed daily closes; latest {latest[0] ? latest.map((x) => x.as_of).sort().at(-1) : ''}.</div>}
    </div>
  )
}
