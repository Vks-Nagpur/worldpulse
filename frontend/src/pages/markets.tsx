import { useMemo, useState } from 'react'
import { LineChart, Sparkline } from '../components/charts'
import { Chips, DownloadButton, Empty, ErrorBox, EventList, FilterBar, Loading, PageHead, ShareButton, Tiles, useCountries, WatchStar } from '../components/ui'
import type { Event, Market, MarketLatest } from '../data'
import { useData } from '../data'
import { t } from '../i18n'
import { useFilters } from '../store'
import { filterEvents, fmtDate, num, pct, tone } from '../util'
import { useLatest } from './today'

const PERIODS = [{ v: '21', label: '1M' }, { v: '63', label: '3M' }, { v: '126', label: '6M' }, { v: '260', label: '1Y' }] as const
type Period = (typeof PERIODS)[number]['v']

function useMarkers(events?: Event[], cats = ['energy', 'financial_markets', 'trade']) {
  return useMemo(() => (events || []).filter((e) => cats.includes(e.category) && e.outlets >= 3).slice(0, 14)
    .map((e) => ({ day: (e.started_at || e.first_detected).slice(0, 10), label: e.title.slice(0, 80) })), [events, cats])
}

export function PriceChart({ series, id, period, markers }: { series?: Market[]; id: string; period: Period; markers?: { day: string; label: string }[] }) {
  if (!series) return <div className="skeleton" style={{ height: 240 }} />
  const m = series.find((x) => x.id === id) || series.find((x) => x.points.length)
  if (!m || !m.points.length) return <Empty>No price history for this instrument (its source may have failed).</Empty>
  const pts = m.points.slice(-Number(period))
  return (
    <>
      <div className="row spread" style={{ marginBottom: 6 }}>
        <div><b style={{ fontSize: 17 }}>{m.name}</b> <span className="fresh">{m.unit} · daily closes · latest {fmtDate(pts.at(-1)?.[0], false)}</span></div>
        <div className="row"><b style={{ fontSize: 20 }}>{num(pts.at(-1)?.[1])}</b>
          <span className={`chg ${tone(pts.length > 1 ? (pts.at(-1)![1] / pts[0][1] - 1) * 100 : null)}`}>{pts.length > 1 ? pct((pts.at(-1)![1] / pts[0][1] - 1) * 100) : ''}</span></div>
      </div>
      <LineChart series={[{ name: m.name, color: 'var(--c1)', points: pts }]} markers={markers} fmt={(v) => num(v, 2)} />
      <div className="fresh">Source: {m.source || 'n/a'}{markers?.length ? ' · ⚑ dashed lines mark widely reported related developments — context only, not cause.' : ''}</div>
    </>
  )
}

export function Markets({ query }: { query: string }) {
  const params = new URLSearchParams(query)
  const [sel, setSel] = useState(params.get('s') || 'mkt:BZ=F')
  const [tab, setTab] = useState<'prices' | 'compare' | 'fx'>((params.get('tab') as 'prices') || 'prices')
  const [period, setPeriod] = useState<Period>('126')
  const [kind, setKind] = useState('all')
  const lt = useLatest()
  const mk = useData<{ series: Market[]; note: string }>('markets.json')
  const ev = useData<{ events: Event[] }>('events.json')
  const f = useFilters()
  const { by, regionOf } = useCountries()
  const markers = useMarkers(ev.data?.events)
  const news = useMemo(() => (ev.data ? filterEvents(ev.data.events, f, regionOf, 'markets') : null), [ev.data, f, regionOf])
  const rows = useMemo(() => {
    const order: Record<string, number> = { commodity: 0, index: 1, fx: 2, crypto: 3 }
    return (lt.data || []).filter((r) => kind === 'all' || r.kind === kind).sort((a, b) => order[a.kind] - order[b.kind] || a.name.localeCompare(b.name))
  }, [lt.data, kind])
  return (
    <>
      <PageHead title={t('Markets')} sub="Delayed end-of-day prices from free public sources (Yahoo Finance chart endpoint with Stooq backup, ECB reference rates, CoinGecko). Not live — every value shows its date."
        actions={<><ShareButton title="WorldPulse markets" path={`/markets?s=${encodeURIComponent(sel)}`} /><DownloadButton name="markets" rows={() => (lt.data || []).map(({ spark, ...r }) => (void spark, r))} /></>} />
      <div className="tabs">
        <button type="button" className={tab === 'prices' ? 'on' : ''} onClick={() => setTab('prices')}>📈 Prices</button>
        <button type="button" className={tab === 'compare' ? 'on' : ''} onClick={() => setTab('compare')}>⚖️ {t('Compare prices')}</button>
        <button type="button" className={tab === 'fx' ? 'on' : ''} onClick={() => setTab('fx')}>💱 {t('Currency watch')}</button>
      </div>
      {lt.error && <ErrorBox error={lt.error} />}
      {tab === 'prices' && (
        <div className="stack">
          <div className="card">
            <div className="row spread" style={{ marginBottom: 8 }}><Chips options={PERIODS.map((p) => ({ v: p.v, label: p.label }))} value={period} onChange={setPeriod} /></div>
            <PriceChart series={mk.data?.series} id={sel} period={period} markers={markers} />
          </div>
          <div className="card">
            <div className="card-head"><h3>All instruments</h3></div>
            <div style={{ margin: '8px 0' }}><Chips scroll value={kind} onChange={setKind} options={[{ v: 'all', label: 'All' }, { v: 'commodity', label: '🛢️ Commodities' }, { v: 'index', label: '📊 Indices' }, { v: 'fx', label: '💱 Currencies' }, { v: 'crypto', label: '🪙 Crypto' }]} /></div>
            {!lt.data ? <Loading /> : (
              <div>
                <div className="mrow mhead"><div>Instrument</div><div className="num">Last</div><div className="num">1 day</div><div className="num hide-sm">1 month</div><div className="hide-sm">Trend</div><div /></div>
                {rows.map((r) => (
                  <div key={r.id} className={`mrow ${sel === r.id ? 'sel' : ''}`} role="button" tabIndex={0}
                    onClick={() => { setSel(r.id); window.scrollTo({ top: 0, behavior: 'smooth' }) }} onKeyDown={(e) => e.key === 'Enter' && setSel(r.id)}>
                    <div style={{ minWidth: 0 }}><div style={{ fontWeight: 600, fontSize: 14 }}>{r.name}</div><div className="fresh">{r.unit} · {fmtDate(r.as_of, false)}</div></div>
                    <div className="num">{num(r.last)}</div>
                    <div className={`num chg ${tone(r.chg_1d)}`}>{pct(r.chg_1d)}</div>
                    <div className={`num chg hide-sm ${tone(r.chg_21d)}`}>{pct(r.chg_21d)}</div>
                    <div className="hide-sm"><Sparkline values={r.spark || []} color={(r.chg_21d || 0) >= 0 ? 'var(--ok)' : 'var(--bad)'} width={88} height={28} /></div>
                    <WatchStar kind="markets" id={r.id} label={r.name} />
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="card"><h3>Markets &amp; economy news</h3><p className="sub">Financial-market and economic developments for the filters below.</p>
            <FilterBar events={ev.data?.events} hideFocus />
            <EventList rows={news} names={by} /></div>
        </div>
      )}
      {tab === 'compare' && <Compare series={mk.data?.series} />}
      {tab === 'fx' && <CurrencyWatch latest={lt.data} />}
    </>
  )
}

function Compare({ series }: { series?: Market[] }) {
  const [a, setA] = useState('mkt:BZ=F')
  const [b, setB] = useState('fx:USDINR')
  const [period, setPeriod] = useState<Period>('126')
  if (!series) return <Loading />
  const opts = series.filter((s) => s.points.length)
  const norm = (id: string) => {
    const s = series.find((x) => x.id === id)
    const pts = s?.points.slice(-Number(period)) || []
    return pts.length ? pts.map(([d, v]) => [d, (v / pts[0][1]) * 100] as [string, number]) : []
  }
  const na = series.find((x) => x.id === a)?.name || a, nb = series.find((x) => x.id === b)?.name || b
  return (
    <div className="card">
      <h3>⚖️ {t('Compare prices')}</h3>
      <p className="sub">Both series start at 100 on the first day of the period, so you can compare their moves directly. Moving together does not mean one causes the other.</p>
      <div className="frow" style={{ marginBottom: 10 }}>
        <select className="input" value={a} onChange={(e) => setA(e.target.value)} aria-label="First instrument">{opts.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        <select className="input" value={b} onChange={(e) => setB(e.target.value)} aria-label="Second instrument">{opts.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        <Chips options={PERIODS.map((p) => ({ v: p.v, label: p.label }))} value={period} onChange={setPeriod} />
      </div>
      <LineChart series={[{ name: na, color: 'var(--c1)', points: norm(a) }, { name: nb, color: 'var(--c3)', points: norm(b) }]} fmt={(v) => v.toFixed(1)} height={280} />
      <div className="row small" style={{ marginTop: 8 }}>
        {[[na, norm(a)], [nb, norm(b)]].map(([n, p]) => {
          const pts = p as [string, number][]
          const c = pts.length ? pts.at(-1)![1] - 100 : null
          return <span key={n as string}><b>{n as string}</b>: <span className={tone(c)}>{pct(c)}</span></span>
        })}
      </div>
    </div>
  )
}

const CUR_COUNTRY: Record<string, string> = { INR: 'IN', CNY: 'CN', JPY: 'JP', GBP: 'GB', EUR: 'EU', BRL: 'BR', TRY: 'TR', ZAR: 'ZA', MXN: 'MX', KRW: 'KR', CHF: 'CH', IDR: 'ID', SGD: 'SG', HKD: 'HK', AUD: 'AU', CAD: 'CA', THB: 'TH', PLN: 'PL' }

function CurrencyWatch({ latest }: { latest?: MarketLatest[] }) {
  if (!latest) return <Loading />
  const fx = latest.filter((r) => r.kind === 'fx').sort((a, b) => Math.abs(b.chg_21d || 0) - Math.abs(a.chg_21d || 0))
  return (
    <div className="card">
      <div className="card-head"><h3>💱 {t('Currency watch')}</h3><DownloadButton name="currencies" rows={() => fx.map(({ spark, ...r }) => (void spark, r))} /></div>
      <p className="sub">Units of each currency per 1 US dollar (ECB reference rates). A rise means the currency got weaker against the dollar. Sorted by the largest 1-month move.</p>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Currency</th><th className="num">Per USD</th><th className="num">1 week</th><th className="num">1 month</th><th className="num hide-sm">3 months</th><th className="num hide-sm">1 year</th><th>Meaning</th><th /></tr></thead>
          <tbody>
            {fx.map((r) => {
              const cur = r.id.replace('fx:USD', '')
              const m = r.chg_21d || 0
              return (
                <tr key={r.id} className="click" onClick={() => (location.hash = `/markets?s=${encodeURIComponent(r.id)}`)}>
                  <td><b>{cur}</b> <span className="faint small">{CUR_COUNTRY[cur] || ''}</span><div className="fresh">{fmtDate(r.as_of, false)}</div></td>
                  <td className="num">{num(r.last, 4)}</td>
                  {[r.chg_5d, r.chg_21d].map((v, i) => <td key={i} className={`num ${tone(v)}`}>{pct(v)}</td>)}
                  {[r.chg_63d, r.chg_252d].map((v, i) => <td key={i} className={`num hide-sm ${tone(v)}`}>{pct(v)}</td>)}
                  <td className="small">{Math.abs(m) < 0.5 ? 'steady' : m > 0 ? `${cur} weaker` : `${cur} stronger`}</td>
                  <td onClick={(e) => e.stopPropagation()}><WatchStar kind="markets" id={r.id} label={`USD/${cur}`} /></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="banner info" style={{ marginTop: 12 }}><span>🔔</span><div className="small">Want to know when a currency moves? Set a free alert in <a href="#/watch">{t('Watchlist & alerts')}</a> (for example “USD/INR moves more than 1% in a week”).</div></div>
    </div>
  )
}

export function Energy() {
  const [sel, setSel] = useState('mkt:BZ=F')
  const [period, setPeriod] = useState<Period>('126')
  const lt = useLatest()
  const mk = useData<{ series: Market[] }>('markets.json')
  const ev = useData<{ events: Event[] }>('events.json')
  const f = useFilters()
  const { by, regionOf } = useCountries()
  const markers = useMarkers(ev.data?.events, ['energy'])
  const news = useMemo(() => (ev.data ? filterEvents(ev.data.events, f, regionOf, 'energy') : null), [ev.data, f, regionOf])
  return (
    <>
      <PageHead title={`🛢️ ${t('Energy')}`} sub="Oil, gas and power: prices and supply news side by side. Showing them together does not mean one caused the other."
        actions={<ShareButton title="WorldPulse energy" path="/energy" />} />
      <Tiles items={lt.data} ids={[['mkt:BZ=F', 'Brent crude'], ['mkt:CL=F', 'WTI crude'], ['mkt:NG=F', 'Natural gas (Henry Hub)']]} selected={sel} onPick={setSel} />
      <div className="card" style={{ marginTop: 14 }}>
        <div style={{ marginBottom: 8 }}><Chips options={PERIODS.map((p) => ({ v: p.v, label: p.label }))} value={period} onChange={setPeriod} /></div>
        <PriceChart series={mk.data?.series} id={sel} period={period} markers={markers} />
      </div>
      <div className="card" style={{ marginTop: 14 }}><h3>Energy developments</h3><p className="sub">OPEC, oil and gas supply, refineries, pipelines and power. See also <a href="#/trade?tab=routes">{t('Chokepoint watch')}</a>.</p>
        <FilterBar events={ev.data?.events} hideFocus />
        <EventList rows={news} names={by} /></div>
    </>
  )
}
