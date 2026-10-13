import { useMemo, useState } from 'react'
import { routeStatus, type Route } from '../routes'
import { RouteBoard } from '../components/routeboard'
import { LineChart, Sparkline } from '../components/charts'
import { Chips, CountryBars, DownloadButton, Empty, ErrorBox, EventList, FilterBar, LearnLinks, Loading, PageHead, ShareButton, useCountries } from '../components/ui'
import type { Event, History, Item } from '../data'
import { useData } from '../data'
import { t } from '../i18n'
import { setFilters, useFilters } from '../store'
import { Badge, cat, Ext, filterEvents, flag, fmtDate } from '../util'

function ItemRow({ a, extra }: { a: Item; extra?: React.ReactNode }) {
  return (
    <div className="item">
      <div className="cat-bar" style={{ background: cat(a.c).color }} />
      <div style={{ minWidth: 0 }}>
        <div className="t"><Ext href={a.u}>{a.t}</Ext></div>
        <div className="m">{extra}{a.o && <Badge tone="b-info">Official</Badge>}<span>{a.p}</span><span>{fmtDate(a.d)}</span>
          {a.k.slice(0, 4).map((k) => <a key={k} className="muted" href={`#/country/${k}`}>{flag(k)} {k}</a>)}</div>
      </div>
    </div>
  )
}

type Sanctions = { note: string; items: (Item & { kind: string })[] }
type Routes = { note: string; routes: Route[] }
type Supply = { note: string; chains: { name: string; stories_7d: number; countries: [string, number][]; latest: Item[] }[] }

export function Trade({ query }: { query: string }) {
  const [tab, setTab] = useState<'sanctions' | 'routes' | 'supply' | 'news'>((new URLSearchParams(query).get('tab') as 'sanctions') || 'sanctions')
  return (
    <>
      <PageHead title={`🚢 ${t('Trade & shipping')}`} sub="Sanctions, import taxes (tariffs), busy shipping routes and supply chains — what affects buying and selling between countries."
        actions={<ShareButton title="WorldPulse trade" path={`/trade?tab=${tab}`} />} />
      <div className="tabs">
        <button type="button" className={tab === 'sanctions' ? 'on' : ''} onClick={() => setTab('sanctions')}>⚖️ {t('Sanctions tracker')}</button>
        <button type="button" className={tab === 'routes' ? 'on' : ''} onClick={() => setTab('routes')}>⚓ {t('Chokepoint watch')}</button>
        <button type="button" className={tab === 'supply' ? 'on' : ''} onClick={() => setTab('supply')}>🔗 {t('Supply chains')}</button>
        <button type="button" className={tab === 'news' ? 'on' : ''} onClick={() => setTab('news')}>📰 Trade news</button>
      </div>
      {tab === 'sanctions' && <SanctionsTab />}
      {tab === 'routes' && <RoutesTab />}
      {tab === 'supply' && <SupplyTab />}
      {tab === 'news' && <TradeNews />}
    </>
  )
}

function SanctionsTab() {
  const { data, error } = useData<Sanctions>('sanctions.json')
  const [kind, setKind] = useState('all')
  const [country, setCountry] = useState('')
  const { by } = useCountries()
  const rows = useMemo(() => (data?.items || []).filter((r) => (kind === 'all' || r.kind === kind) && (!country || r.k.includes(country))), [data, kind, country])
  const countries = useMemo(() => {
    const m = new Map<string, number>(); data?.items.forEach((r) => r.k.forEach((k) => m.set(k, (m.get(k) || 0) + 1)))
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [data])
  if (error) return <ErrorBox error={error} />
  if (!data) return <Loading />
  return (
    <div className="card">
      <div className="card-head"><h3>⚖️ {t('Sanctions tracker')}</h3><DownloadButton name="sanctions" rows={() => rows.map((r) => ({ date: r.d, kind: r.kind, headline: r.t, source: r.p, countries: r.k.join(' '), official: r.o, url: r.u }))} /></div>
      <p className="sub">{data.note}</p>
      <div className="frow" style={{ marginBottom: 8 }}>
        <Chips scroll value={kind} onChange={setKind} options={[{ v: 'all', label: `All (${data.items.length})` }, ...['Sanctions', 'Tariffs', 'Export controls', 'Embargo'].map((k) => ({ v: k, label: `${k} (${data.items.filter((r) => r.kind === k).length})` }))]} />
        <select className="input" value={country} onChange={(e) => setCountry(e.target.value)} aria-label="Country"><option value="">All countries</option>
          {countries.map(([k, n]) => <option key={k} value={k}>{flag(k)} {by[k]?.name || k} ({n})</option>)}</select>
      </div>
      <div className="list">{rows.slice(0, 150).map((r, i) => <ItemRow key={i} a={r} extra={<Badge tone="b-acc">{r.kind}</Badge>} />)}</div>
      {!rows.length && <Empty>No items for this selection.</Empty>}
      <LearnLinks text="sanctions tariffs" />
    </div>
  )
}

function RoutesTab() {
  const { data, error } = useData<Routes>('chokepoints.json')
  if (error) return <ErrorBox error={error} />
  if (!data) return <Loading />
  return (
    <>
      <RouteBoard routes={data.routes} />
      <div className="banner info"><span>⚓</span><div className="small">{data.note}</div></div>
      <div className="grid g2">
        {data.routes.map((r) => (
          <div key={r.name} className="card scroll-anchor" id={`route-${r.name.replace(/\W+/g, '-')}`}>
            <div className="card-head"><h3>{r.name} <Badge tone={routeStatus(r).tone}>{routeStatus(r).label}</Badge></h3><Sparkline values={r.daily.map((d) => d[1])} color="var(--c8)" width={110} height={30} /></div>
            <div className="row small muted" style={{ margin: '4px 0 8px' }}><b style={{ color: 'var(--text)' }}>{r.stories_7d}</b> stories · {r.articles_7d} headlines in 7 days{r.top_topics.length ? ` · ${r.top_topics.join(', ')}` : ''}</div>
            {r.latest.length ? <div className="list">{r.latest.slice(0, 4).map((a, i) => <ItemRow key={i} a={a} />)}</div> : <Empty>No headlines naming this route in 7 days.</Empty>}
            <LearnLinks text={r.name} />
          </div>
        ))}
      </div>
    </>
  )
}

function SupplyTab() {
  const { data, error } = useData<Supply>('supply.json')
  const { by } = useCountries()
  const [open, setOpen] = useState<string | null>(null)
  if (error) return <ErrorBox error={error} />
  if (!data) return <Loading />
  const max = Math.max(1, ...data.chains.map((c) => c.stories_7d))
  return (
    <div className="card">
      <h3>🔗 {t('Supply chains')}</h3>
      <p className="sub">{data.note} Tap a chain to see its stories and countries.</p>
      <div className="list">
        {data.chains.map((c) => (
          <div key={c.name} className="item" style={{ flexDirection: 'column', gap: 6 }}>
            <button type="button" className="row spread" style={{ all: 'unset', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', gap: 10 }} onClick={() => setOpen(open === c.name ? null : c.name)}>
              <b>{c.name}</b><span className="small muted">{c.stories_7d} stories {open === c.name ? '▲' : '▼'}</span></button>
            <div className="bar-bg"><div className="bar-fg" style={{ width: `${(c.stories_7d / max) * 100}%` }} /></div>
            {open === c.name && (
              <div>
                <div className="row small" style={{ margin: '6px 0' }}>{c.countries.map(([k, n]) => <a key={k} href={`#/country/${k}`}>{flag(k)} {by[k]?.name || k} ({n})</a>)}</div>
                <div className="list">{c.latest.map((a, i) => <ItemRow key={i} a={a} />)}</div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function TradeNews() {
  const ev = useData<{ events: Event[] }>('events.json')
  const f = useFilters()
  const { by, regionOf } = useCountries()
  const rows = useMemo(() => (ev.data ? filterEvents(ev.data.events, f, regionOf, 'trade') : null), [ev.data, f, regionOf])
  return (
    <>
      <FilterBar events={ev.data?.events} hideFocus />
      <div className="grid g2">
        <div className="card"><h3>Trade developments</h3><p className="sub">Trade deals, tariffs, export controls, supply chains and shipping.</p><EventList rows={rows} names={by} /></div>
        <div className="card"><h3>Countries in trade news</h3><p className="sub">Tap a country to filter.</p><CountryBars rows={rows} color="#2563eb" /></div>
      </div>
    </>
  )
}

export function Conflict() {
  const ev = useData<{ events: Event[] }>('events.json')
  const hist = useData<History>('history.json')
  const f = useFilters()
  const { by, regionOf } = useCountries()
  const rows = useMemo(() => (ev.data ? [...filterEvents(ev.data.events, f, regionOf, 'conflict'), ...filterEvents(ev.data.events, f, regionOf, 'geo')] : null), [ev.data, f, regionOf])
  const keys = hist.data ? [...Object.keys(hist.data.topic_volume).map((k) => `topic:${k}`), ...Object.keys(hist.data.country_volume).map((k) => `country:${k}`)] : []
  const [series, setSeries] = useState('topic:military_incidents')
  const cur = keys.includes(series) ? series : keys[0]
  const pts = cur && hist.data ? (cur.startsWith('topic:') ? hist.data.topic_volume[cur.slice(6)] : hist.data.country_volume[cur.slice(8)]) || [] : []
  return (
    <>
      <PageHead title={`🛡️ ${t('Conflict & security')}`} sub="Wars, attacks and security news. “One outlet” means only one news source has reported it so far."
        actions={<ShareButton title="WorldPulse conflict & security" path="/conflict" />} />
      <FilterBar events={ev.data?.events} hideFocus />
      {ev.error && <ErrorBox error={ev.error} />}
      <div className="grid g2">
        <div className="card"><h3>Conflict, military &amp; geopolitics</h3><p className="sub">Best-supported first.</p><EventList rows={rows} names={by} /></div>
        <div className="stack">
          <div className="card"><h3>Most-reported countries</h3><p className="sub">Tap a country to filter everything to it.</p><CountryBars rows={rows} color="#dc2626" onPick={(iso) => setFilters({ country: iso })} /></div>
          <div className="card"><h3>Reporting trend</h3><p className="sub">Daily articles in GDELT-monitored media. Measures coverage, not the number of incidents.</p>
            {keys.length ? <>
              <select className="input" value={cur} onChange={(e) => setSeries(e.target.value)} style={{ marginBottom: 8 }} aria-label="Series">
                {keys.map((k) => <option key={k} value={k}>{k.startsWith('topic:') ? `Topic: ${k.slice(6).replace(/_/g, ' ')}` : `Country: ${by[k.slice(8)]?.name || k.slice(8)}`}</option>)}</select>
              <LineChart series={[{ name: 'Articles', color: 'var(--c7)', points: pts }]} height={200} fmt={(v) => Math.round(v).toLocaleString()} /></> : <Empty>Coverage history fills in over several runs (GDELT limits how often it can be asked).</Empty>}
          </div>
        </div>
      </div>
    </>
  )
}
