import { useState } from 'react'
import { BriefingView, Chips, DownloadButton, Empty, ErrorBox, Loading, PageHead, PrintButton, ShareButton, useCountries, VerifBadge } from '../components/ui'
import type { Briefing, Item } from '../data'
import { useData } from '../data'
import { t } from '../i18n'
import { Badge, cat, Ext, flag, fmtDate, pct, tone } from '../util'

type Official = { note: string; items: (Item & { source: string; tags: string[] })[] }
type Elections = { note: string; countries: { iso2: string; name: string; developments_30d: number; latest: { title: string; date: string; verification: string; url?: string; publisher?: string }[] }[] }
type Corrections = { note: string; items: { event_id: string; title: string; revision: number; changed_at: string; changes: { field: string; before: unknown; after: unknown }[] }[] }

export function Policy({ query }: { query: string }) {
  const [tab, setTab] = useState<'official' | 'banks' | 'elections' | 'corrections'>((new URLSearchParams(query).get('tab') as 'official') || 'official')
  return (
    <>
      <PageHead title={`🏛️ ${t('Policy & elections')}`} sub="What governments, central banks and bodies like the UN announced, plus election news."
        actions={<ShareButton title="WorldPulse policy" path={`/policy?tab=${tab}`} />} />
      <div className="tabs">
        <button type="button" className={tab === 'official' ? 'on' : ''} onClick={() => setTab('official')}>📜 {t('Official announcements')}</button>
        <button type="button" className={tab === 'banks' ? 'on' : ''} onClick={() => setTab('banks')}>🏦 {t('Central banks')}</button>
        <button type="button" className={tab === 'elections' ? 'on' : ''} onClick={() => setTab('elections')}>🗳️ {t('Elections in the news')}</button>
        <button type="button" className={tab === 'corrections' ? 'on' : ''} onClick={() => setTab('corrections')}>✏️ {t('Corrections log')}</button>
      </div>
      {(tab === 'official' || tab === 'banks') && <OfficialTab banks={tab === 'banks'} />}
      {tab === 'elections' && <ElectionsTab />}
      {tab === 'corrections' && <CorrectionsTab />}
    </>
  )
}

function OfficialTab({ banks }: { banks: boolean }) {
  const { data, error } = useData<Official>('official.json')
  const [src, setSrc] = useState('all')
  if (error) return <ErrorBox error={error} />
  if (!data) return <Loading />
  const base = data.items.filter((r) => !banks || r.tags.includes('central_bank'))
  const sources = [...new Set(base.map((r) => r.source))].sort()
  const rows = base.filter((r) => src === 'all' || r.source === src)
  return (
    <div className="card">
      <div className="card-head"><h3>{banks ? `🏦 ${t('Central banks')}` : `📜 ${t('Official announcements')}`}</h3>
        <DownloadButton name={banks ? 'central-banks' : 'official'} rows={() => rows.map((r) => ({ date: r.d, source: r.source, headline: r.t, url: r.u }))} /></div>
      <p className="sub">{banks ? 'Press releases from the US Federal Reserve, European Central Bank, Bank of England and Reserve Bank of India (14 days). Interest-rate decisions appear here when the bank publishes them.' : data.note}</p>
      <select className="input" value={src} onChange={(e) => setSrc(e.target.value)} style={{ maxWidth: 360, marginBottom: 8 }} aria-label="Source">
        <option value="all">All sources ({base.length})</option>{sources.map((s) => <option key={s} value={s}>{s} ({base.filter((r) => r.source === s).length})</option>)}</select>
      <div className="list">{rows.slice(0, 200).map((r, i) => (
        <div key={i} className="item"><div className="cat-bar" style={{ background: cat(r.c).color }} /><div style={{ minWidth: 0 }}>
          <div className="t"><Ext href={r.u}>{r.t}</Ext></div><div className="m"><Badge tone="b-info">{r.source}</Badge><span>{fmtDate(r.d)}</span>{r.k.slice(0, 3).map((k) => <span key={k}>{flag(k)} {k}</span>)}</div></div></div>))}</div>
      {!rows.length && <Empty>No announcements in the last 14 days from these sources. A source may be failing — see About &amp; sources.</Empty>}
    </div>
  )
}

function ElectionsTab() {
  const { data, error } = useData<Elections>('elections.json')
  const { by } = useCountries()
  if (error) return <ErrorBox error={error} />
  if (!data) return <Loading />
  return (
    <>
      <div className="banner warn"><span>🗳️</span><div className="small">{data.note}</div></div>
      <div className="grid g2">
        {data.countries.map((c) => (
          <div key={c.iso2} className="card">
            <div className="card-head"><h3><a href={`#/country/${c.iso2}`} style={{ color: 'var(--text)' }}>{flag(c.iso2)} {by[c.iso2]?.name || c.name}</a></h3><span className="small muted">{c.developments_30d} developments (30 days)</span></div>
            <div className="list">{c.latest.map((e, i) => <div key={i} className="item"><div><div className="t" style={{ fontSize: 14 }}><Ext href={e.url}>{e.title}</Ext></div><div className="m"><VerifBadge v={e.verification} /><span>{e.publisher}</span><span>{fmtDate(e.date)}</span></div></div></div>)}</div>
          </div>
        ))}
      </div>
      {!data.countries.length && <Empty>No election-related reporting in the last 30 days.</Empty>}
    </>
  )
}

function CorrectionsTab() {
  const { data, error } = useData<Corrections>('corrections.json')
  if (error) return <ErrorBox error={error} />
  if (!data) return <Loading />
  const show = (v: unknown) => (v == null || v === '' ? '—' : String(v).replace(/_/g, ' '))
  return (
    <div className="card">
      <h3>✏️ {t('Corrections log')}</h3><p className="sub">{data.note}</p>
      <div className="list">{data.items.map((r) => (
        <div key={r.event_id + r.revision} className="item"><div>
          <div className="t" style={{ fontSize: 14 }}><a href={`#/event/${encodeURIComponent(r.event_id)}`}>{r.title}</a></div>
          <div className="m"><span>Revision {r.revision}</span><span>{fmtDate(r.changed_at)}</span>
            {r.changes.map((c) => <span key={c.field}><b>{c.field}</b>: <s className="faint">{show(c.before)}</s> → {show(c.after)}</span>)}</div></div></div>))}</div>
      {!data.items.length && <Empty>No corrections in the last 14 days.</Empty>}
    </div>
  )
}

type Weekly = { weeks: { week: string; from: string; to: string; complete: boolean; generated_at: string; developments: number; signals: number
  top: { title: string; category: string; country?: string; verification: string; url?: string; publisher?: string }[]; price_moves: { name: string; chg: number; from: string; to: string }[]; countries: [string, number][] }[] }

export function Briefings({ query }: { query: string }) {
  const { data, error } = useData<{ briefings: Briefing[] }>('briefings.json')
  const wk = useData<Weekly>('weekly.json')
  const [k, setK] = useState(new URLSearchParams(query).get('b') || 'global-24')
  const [week, setWeek] = useState<string | null>(null)
  const { by } = useCountries()
  if (error) return <ErrorBox error={error} />
  if (!data) return <Loading />
  const opts = [...data.briefings.map((b) => ({ v: `${b.kind}-${b.period_hours}`, label: ({ global: '🌍 Global', geopolitical: '🏛️ Geopolitical', market: '💹 Markets', signals: '⚡ Signals' } as Record<string, string>)[b.kind] + (b.period_hours === 168 ? ' (week)' : b.period_hours === 72 ? ' (3 days)' : ' (24 h)') })), { v: 'weekly', label: `🗓️ ${t('Weekly review')}` }]
  const b = data.briefings.find((x) => `${x.kind}-${x.period_hours}` === k)
  const w = wk.data?.weeks.find((x) => x.week === week) || wk.data?.weeks[0]
  return (
    <>
      <PageHead title={`📋 ${t('Briefings')}`} sub="Short written summaries of the day and week. Every line has a number you can tap to see its source."
        actions={<><ShareButton title="WorldPulse briefing" path={`/briefings?b=${k}`} /><PrintButton /></>} />
      <div style={{ marginBottom: 12 }}><Chips scroll value={k} onChange={setK} options={opts} /></div>
      {k !== 'weekly' ? <div className="card">{b ? <BriefingView b={b} /> : <Empty>No briefing.</Empty>}</div> : !w ? <Loading /> : (
        <div className="card">
          <div className="card-head"><h3>🗓️ Week {w.week} <span className="small muted">({w.from} – {w.to}{w.complete ? '' : ', in progress'})</span></h3>
            {wk.data && wk.data.weeks.length > 1 && <select className="input" style={{ maxWidth: 200 }} value={w.week} onChange={(e) => setWeek(e.target.value)} aria-label="Week">{wk.data.weeks.map((x) => <option key={x.week}>{x.week}</option>)}</select>}</div>
          <p className="sub">{w.developments} developments · {w.signals} signals. Archive keeps the last 12 weeks.</p>
          <div className="grid g2">
            <div><h3 style={{ fontSize: 15 }}>Biggest developments</h3>
              <ol style={{ paddingLeft: 20 }}>{w.top.map((e, i) => <li key={i} style={{ margin: '6px 0' }}><Ext href={e.url}>{e.title}</Ext> <span className="small faint">— {e.category}{e.country ? ` · ${flag(e.country)} ${by[e.country]?.name || e.country}` : ''} · {e.publisher}</span></li>)}</ol></div>
            <div><h3 style={{ fontSize: 15 }}>Biggest price moves</h3>
              {w.price_moves.map((m) => <div key={m.name} className="row spread small" style={{ padding: '4px 0', borderBottom: '1px solid var(--border)' }}><span>{m.name}</span><b className={tone(m.chg)}>{pct(m.chg)}</b></div>)}
              <h3 style={{ fontSize: 15, marginTop: 14 }}>Most-reported countries</h3>
              <div className="row small">{w.countries.map(([c, n]) => <a key={c} href={`#/country/${c}`}>{flag(c)} {by[c]?.name || c} ({n})</a>)}</div></div>
          </div>
        </div>
      )}
    </>
  )
}
