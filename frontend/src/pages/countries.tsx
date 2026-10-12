import { useMemo, useState } from 'react'
import { LineChart } from '../components/charts'
import { BriefingView, Chips, DownloadButton, Empty, ErrorBox, EventItem, Loading, PageHead, PrintButton, ShareButton, SignalItem, Stat, useCountries, WatchStar } from '../components/ui'
import type { CountryProfile, Risk } from '../data'
import { useData } from '../data'
import { t } from '../i18n'
import { Badge, cat, compact, Ext, flag, fmtDate, go, num, RISK } from '../util'

type RiskFile = { method: string; countries: Risk[]; generated_at: string }

export function RiskCard({ r }: { r: Risk }) {
  return (
    <div className="card" style={{ boxShadow: 'none' }}>
      <div className="row spread"><a href={`#/country/${r.iso2}`} style={{ color: 'var(--text)', fontWeight: 700 }}>{flag(r.iso2)} {r.name}</a>
        <Badge tone={RISK[r.level].tone}><span className={`risk-dot rd-${r.level}`} style={{ width: 8, height: 8 }} />{t(RISK[r.level].label)}</Badge></div>
      <ul style={{ margin: '8px 0 0', paddingLeft: 0, listStyle: 'none' }}>
        {r.components.map((c) => (
          <li key={c.component} className="small" style={{ display: 'flex', gap: 8, margin: '6px 0' }}>
            <span className={`risk-dot rd-${c.level}`} style={{ marginTop: 4, width: 9, height: 9 }} />
            <span><b>{c.component}:</b> <span className="muted">{c.reason}</span></span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function RiskPage() {
  const { data, error } = useData<RiskFile>('risk.json')
  const [lv, setLv] = useState('all')
  const [region, setRegion] = useState('')
  if (error) return <ErrorBox error={error} />
  if (!data) return <Loading rows={6} />
  const regions = [...new Set(data.countries.map((c) => c.region))].sort()
  const rows = data.countries.filter((c) => (lv === 'all' || String(c.level) === lv) && (!region || c.region === region))
  return (
    <>
      <PageHead title={`🚦 ${t('Country risk')}`} sub={data.method}
        actions={<><ShareButton title="WorldPulse country risk" path="/risk" /><DownloadButton name="country-risk" rows={() => data.countries.map((c) => ({ country: c.name, iso2: c.iso2, region: c.region, level: RISK[c.level].label, reasons: c.components.map((x) => `${x.component}: ${x.reason}`).join(' | ') }))} /><PrintButton /></>} />
      <div className="grid g4" style={{ marginBottom: 14 }}>
        {[2, 1, 0].map((l) => <Stat key={l} label={`${t(RISK[l].label)}`} value={data.countries.filter((c) => c.level === l).length} note={l === 0 ? 'countries with minor flags only' : 'countries'} />)}
        <Stat label="Updated" value={fmtDate(data.generated_at, false)} note="recomputed every run" />
      </div>
      <div className="frow" style={{ marginBottom: 12 }}>
        <Chips value={lv} onChange={setLv} options={[{ v: 'all', label: 'All' }, { v: '2', label: '🔴 High' }, { v: '1', label: '🟠 Elevated' }, { v: '0', label: '🟢 Low' }]} />
        <select className="input" value={region} onChange={(e) => setRegion(e.target.value)} aria-label="Region"><option value="">All regions</option>{regions.map((r) => <option key={r}>{r}</option>)}</select>
      </div>
      <div className="grid g3">{rows.map((r) => <RiskCard key={r.iso2} r={r} />)}</div>
      {!rows.length && <Empty>No countries in this selection.</Empty>}
      <p className="small faint" style={{ marginTop: 12 }}>Countries not listed had no flagged component. That means nothing crossed a threshold in monitored data — not that a country is risk-free.</p>
    </>
  )
}

export function Countries() {
  const { list } = useCountries()
  const [q, setQ] = useState('')
  const [region, setRegion] = useState('')
  const [sort, setSort] = useState<'activity' | 'name' | 'population' | 'risk'>('activity')
  const rows = useMemo(() => list.filter((c) => (!region || c.region === region) && (!q || c.name.toLowerCase().includes(q.toLowerCase()) || c.iso2 === q.toUpperCase() || (c.capital || '').toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name) : sort === 'population' ? (b.population?.value || 0) - (a.population?.value || 0) :
      sort === 'risk' ? (b.risk ?? -1) - (a.risk ?? -1) : (b.events_7d * 3 + b.news_72h + b.signals_30d * 5) - (a.events_7d * 3 + a.news_72h + a.signals_30d * 5)), [list, q, region, sort])
  if (!list.length) return <Loading />
  const regions = [...new Set(list.map((c) => c.region))].sort()
  const max = Math.max(1, ...rows.map((c) => c.events_7d))
  return (
    <>
      <PageHead title={`🌐 ${t('Countries')}`} sub="A profile for every country: risk indicators, developments, World Bank indicators, signals and a sourced briefing."
        actions={<DownloadButton name="countries" rows={() => rows.map((c) => ({ country: c.name, iso2: c.iso2, region: c.region, capital: c.capital, developments_7d: c.events_7d, headlines_72h: c.news_72h, signals_30d: c.signals_30d, risk: c.risk == null ? '' : RISK[c.risk].label, population: c.population?.value, population_year: c.population?.period, gdp_usd: c.gdp?.value, gdp_year: c.gdp?.period }))} />} />
      <div className="frow" style={{ marginBottom: 12 }}>
        <input className="input" placeholder="Search a country, code or capital…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input" value={region} onChange={(e) => setRegion(e.target.value)} aria-label="Region"><option value="">All regions</option>{regions.map((r) => <option key={r}>{r}</option>)}</select>
        <Chips value={sort} onChange={setSort} options={[{ v: 'activity', label: 'Most active' }, { v: 'risk', label: 'Risk' }, { v: 'name', label: 'A–Z' }, { v: 'population', label: 'Population' }]} />
      </div>
      <div className="grid g3">
        {rows.map((c) => (
          <div key={c.iso2} className="card" role="link" tabIndex={0} style={{ cursor: 'pointer' }} onClick={() => go(`/country/${c.iso2}`)} onKeyDown={(e) => e.key === 'Enter' && go(`/country/${c.iso2}`)}>
            <div className="row spread">
              <div className="row"><span className="flag">{flag(c.iso2)}</span><div><b>{c.name}</b><div className="small faint">{c.region}{c.capital ? ` · ${c.capital}` : ''}</div></div></div>
              <div className="row">{c.risk != null && <span className={`risk-dot rd-${c.risk}`} title={`Risk: ${RISK[c.risk].label}`} />}<WatchStar kind="countries" id={c.iso2} label={c.name} /></div>
            </div>
            <div className="row small muted" style={{ marginTop: 8, gap: 12 }}><span><b style={{ color: 'var(--text)' }}>{c.events_7d}</b> developments</span><span><b style={{ color: 'var(--text)' }}>{c.news_72h}</b> headlines</span>{c.signals_30d > 0 && <span>⚡ {c.signals_30d}</span>}</div>
            <div className="bar-bg" style={{ marginTop: 8 }}><div className="bar-fg" style={{ width: `${(c.events_7d / max) * 100}%` }} /></div>
            <div className="row small faint spread" style={{ marginTop: 8 }}><span>{c.population ? `Pop. ${compact(c.population.value)} (${c.population.period})` : 'Population n/a'}</span>
              {c.top_category && <span style={{ color: cat(c.top_category).color }}>{cat(c.top_category).icon} {cat(c.top_category).label}</span>}</div>
          </div>
        ))}
      </div>
      {!rows.length && <Empty>No country matches “{q}”.</Empty>}
    </>
  )
}

const KEY_INDICATORS = ['NY.GDP.MKTP.CD', 'NY.GDP.MKTP.KD.ZG', 'NY.GDP.PCAP.CD', 'FP.CPI.TOTL.ZG', 'SL.UEM.TOTL.ZS', 'NE.RSB.GNFS.ZS', 'GC.DOD.TOTL.GD.ZS', 'PA.NUS.FCRF', 'SP.POP.TOTL']
const fmtInd = (v: number, unit: string) => unit.startsWith('current US$') ? '$' + compact(v) : unit === 'people' ? compact(v) : unit.startsWith('%') ? `${v.toFixed(1)}%` : num(v, 2)

export function Country({ code }: { code: string }) {
  const { data, error } = useData<CountryProfile>(`countries/${code.toUpperCase()}.json`)
  const [period, setPeriod] = useState<'24' | '168' | '720'>('168')
  const [tab, setTab] = useState<'brief' | 'events' | 'news' | 'econ' | 'signals'>('brief')
  if (error) return <ErrorBox error={`No profile for ${code}: ${error}`} />
  if (!data) return <Loading rows={8} />
  const c = data.country
  const ind = data.indicators
  const b = data.briefings[period]
  const evs = data.events.filter((e) => (Date.now() - new Date(e.last_updated).getTime()) / 3.6e6 <= Number(period))
  return (
    <>
      <div className="hero" style={{ background: 'linear-gradient(120deg, #0f766e 0%, #4338ca 65%, #6d28d9 100%)' }}>
        <div className="row spread">
          <div className="row"><span style={{ fontSize: 44 }}>{flag(c.iso2)}</span>
            <div><h2>{c.name}</h2><p style={{ margin: 0 }}>{[c.region, c.capital && `Capital: ${c.capital}`, c.income, data.currency && `Currency: ${data.currency}`].filter(Boolean).join(' · ')}</p></div></div>
          <div className="row no-print"><WatchStar kind="countries" id={c.iso2} label={c.name} /><ShareButton title={`${c.name} — WorldPulse`} path={`/country/${c.iso2}`} /><PrintButton /></div>
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <span className="badge">ISO {c.iso2} / {c.iso3}</span><span className="badge">Profile updated {fmtDate(data.generated_at)}</span>
          {data.meta_source && <span className="badge">Facts: {data.meta_source}</span>}
        </div>
      </div>
      {data.about && <div className="card" style={{ marginBottom: 14 }}><h3>📖 About {c.name}</h3><p className="muted" style={{ margin: '6px 0' }}>{data.about.extract}</p>
        <a className="small" href={data.about.url} target="_blank" rel="noopener noreferrer">From Wikipedia (CC BY-SA) ↗</a></div>}
      {data.risk ? <div style={{ marginBottom: 14 }}><RiskCard r={data.risk} /></div> :
        <div className="banner info"><span>🟢</span><div className="small">No risk component crossed its threshold for {c.name} in monitored data.</div></div>}
      <div className="grid g4" style={{ marginBottom: 14 }}>
        <Stat label="Developments (7 days)" value={c.events_7d} />
        <Stat label="Headlines (72 h)" value={c.news_72h} />
        <Stat label="Signals (30 days)" value={c.signals_30d} />
        <Stat label="Population" value={c.population ? compact(c.population.value) : '—'} note={c.population ? `World Bank, ${c.population.period} (annual)` : 'not available'} />
      </div>
      <div className="tabs">
        {([['brief', '📋 Briefing'], ['events', '🗞️ Developments'], ['news', '📰 Headlines'], ['econ', '📊 Economy'], ['signals', '⚡ Signals']] as const).map(([k, l]) =>
          <button type="button" key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}
      </div>
      {(tab === 'brief' || tab === 'events') && <div style={{ marginBottom: 12 }}><Chips value={period} onChange={setPeriod} options={[{ v: '24', label: t('Last 24 hours') }, { v: '168', label: t('Last 7 days') }, { v: '720', label: 'Last 30 days' }]} /></div>}
      {tab === 'brief' && <div className="card">{b ? <BriefingView b={b} /> : <Empty>No developments or signals about {c.name} in the published window, so no briefing was generated. This reflects source coverage, not necessarily an absence of events.</Empty>}</div>}
      {tab === 'events' && <div className="card"><div className="list">{evs.map((e) => <EventItem key={e.id} e={e} />)}</div>{!evs.length && <Empty>None recorded in this period.</Empty>}</div>}
      {tab === 'news' && (
        <div className="card"><div className="list">{data.news.map((a) => (
          <div className="item" key={a.id}><div className="cat-bar" style={{ background: cat(a.c).color }} />
            <div><div className="t"><Ext href={a.u}>{a.t}</Ext></div><div className="m"><span>{a.p}</span><span>{fmtDate(a.d)}</span><span style={{ color: cat(a.c).color }}>{cat(a.c).label}</span>
              {a.w && a.w.length > 0 && <span className="faint" title={t('Why this topic')}>🏷 {a.w.join(', ')}</span>}</div></div></div>))}
        </div>{!data.news.length && <Empty>No headlines mention {c.name} in the last 72 hours.</Empty>}</div>
      )}
      {tab === 'econ' && (
        <div className="grid g2">
          <div className="card">
            <div className="card-head"><h3>Economic indicators</h3><DownloadButton name={`${c.iso2}-indicators`} rows={() => Object.entries(ind).map(([k, i]) => ({ code: k, indicator: i.label, value: i.value, unit: i.unit, year: i.period, source: i.source, url: i.url }))} /></div>
            <p className="sub">Latest available annual values from the World Bank. These are not live measurements.</p>
            {Object.keys(ind).length ? (
              <div className="table-wrap"><table><thead><tr><th>Indicator</th><th style={{ textAlign: 'right' }}>Value</th><th>Year</th></tr></thead>
                <tbody>{[...KEY_INDICATORS, ...Object.keys(ind).filter((k) => !KEY_INDICATORS.includes(k))].filter((k) => ind[k]).map((k) => {
                  const i = ind[k]
                  const old = new Date().getFullYear() - Number(i.period) >= 3
                  return <tr key={k}><td>{i.label}<div className="fresh">{i.unit} · <Ext href={i.url}>{i.source}</Ext></div></td><td className="num"><b>{fmtInd(i.value, i.unit)}</b></td>
                    <td>{i.period}{old && <Badge tone="b-warn" title="3+ years old">old</Badge>}</td></tr>
                })}</tbody></table></div>
            ) : <Empty>World Bank returned no indicators for this country.</Empty>}
          </div>
          <div className="card">
            <h3>News coverage over time</h3>
            <p className="sub">Daily articles mentioning “{c.name}” in GDELT-monitored media (measures reporting, not events).</p>
            {data.volume.length ? <LineChart series={[{ name: 'Articles', color: 'var(--c1)', points: data.volume }]} /> : <Empty>Coverage history is collected for watch-list countries only.</Empty>}
            {data.currency && <a className="small" href={`#/markets?s=${encodeURIComponent(`fx:USD${data.currency}`)}`}>💱 See USD/{data.currency} price history →</a>}
          </div>
        </div>
      )}
      {tab === 'signals' && <div className="card"><div className="list">{data.signals.map((s) => <SignalItem key={s.id} s={s} />)}</div>{!data.signals.length && <Empty>No signals for {c.name} in the last 30 days.</Empty>}</div>}
    </>
  )
}
