import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Briefing, CountrySummary, Event, MarketLatest, Signal } from '../data'
import { useData } from '../data'
import { t } from '../i18n'
import { DEFAULT_FILTERS, setFilters, toggleWatch, useFilters, watchStore, type Watch } from '../store'
import { Badge, cat, downloadCSV, evidenceLabel, Ext, FOCUS, flag, fmtDate, num, pct, SIG_STATUS, sortEvents, tone, VERIF } from '../util'
import { Sparkline } from './charts'
import { ExplainButton } from './explain'

// ---------------------------------------------------------------- layout bits
export function PageHead({ title, sub, actions }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page-head">
      <div><div className="print-head">WorldPulse · {location.href}</div><h2>{title}</h2>{sub && <p>{sub}</p>}</div>
      {actions && <div className="head-actions">{actions}</div>}
    </div>
  )
}
export function Loading({ rows = 4 }: { rows?: number }) {
  return <div className="card">{Array.from({ length: rows }).map((_, i) => <div key={i} className="skeleton" style={{ height: 16, margin: '12px 0', width: `${92 - i * 13}%` }} />)}</div>
}
export function ErrorBox({ error }: { error: string }) {
  return <div className="banner bad"><span>⚠️</span><div><b>This section could not be loaded right now.</b><div className="small">Please check your connection and refresh the page.</div></div></div>
}
export function Empty({ children }: { children: ReactNode }) { return <div className="empty">{children}</div> }
export function Stat({ label, value, note }: { label: string; value: ReactNode; note?: ReactNode }) {
  return <div className="card stat"><div className="label">{label}</div><div className="value">{value}</div>{note && <div className="note">{note}</div>}</div>
}
export function Chips<T extends string>({ options, value, onChange, scroll }: { options: { v: T; label: ReactNode }[]; value: T; onChange: (v: T) => void; scroll?: boolean }) {
  return <div className={`chips ${scroll ? 'scroll' : ''}`}>{options.map((o) => <button key={o.v} type="button" className={`chip ${o.v === value ? 'on' : ''}`} onClick={() => onChange(o.v)}>{o.label}</button>)}</div>
}

// ---------------------------------------------------------------- toast
let toastFn: ((s: string) => void) | null = null
export const toast = (s: string) => toastFn?.(s)
export function ToastHost() {
  const [msg, setMsg] = useState<string | null>(null)
  useEffect(() => { toastFn = (s) => { setMsg(s); setTimeout(() => setMsg(null), 2200) }; return () => { toastFn = null } }, [])
  return msg ? <div className="toast" role="status">{msg}</div> : null
}

// ---------------------------------------------------------------- share / print / download
export function ShareButton({ title, path }: { title: string; path?: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const url = path ? `${location.origin}${location.pathname}#${path}` : location.href
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [open])
  const click = async () => {
    if (navigator.share) { try { await navigator.share({ title: `${title} — WorldPulse`, url }); return } catch { /* cancelled */ } }
    setOpen(!open)
  }
  const text = encodeURIComponent(`${title} — WorldPulse`)
  const u = encodeURIComponent(url)
  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <button type="button" className="icon-btn" onClick={click} aria-label={t('Share')}>↗<span className="lbl"> {t('Share')}</span></button>
      {open && (
        <div className="share-menu">
          <a href={`https://wa.me/?text=${text}%20${u}`} target="_blank" rel="noopener noreferrer">WhatsApp</a>
          <a href={`https://www.linkedin.com/sharing/share-offsite/?url=${u}`} target="_blank" rel="noopener noreferrer">LinkedIn</a>
          <a href={`https://twitter.com/intent/tweet?text=${text}&url=${u}`} target="_blank" rel="noopener noreferrer">X / Twitter</a>
          <a href={`mailto:?subject=${text}&body=${u}`}>Email</a>
          <button type="button" onClick={() => { navigator.clipboard?.writeText(url).then(() => toast('Link copied')); setOpen(false) }}>Copy link</button>
        </div>
      )}
    </div>
  )
}
export const PrintButton = () => <button type="button" className="icon-btn" onClick={() => window.print()} aria-label={t('Print / PDF')}>🖨<span className="lbl"> {t('Print / PDF')}</span></button>
export function DownloadButton({ name, rows }: { name: string; rows: () => Record<string, unknown>[] }) {
  return <button type="button" className="icon-btn" onClick={() => downloadCSV(name, rows())} title="Download as CSV (opens in Excel)" aria-label={t('Download')}>⬇<span className="lbl"> {t('Download')}</span></button>
}

// ---------------------------------------------------------------- watchlist star
export function WatchStar({ kind, id, label }: { kind: keyof Watch; id: string; label: string }) {
  const w = watchStore.use()
  const on = w[kind].includes(id)
  return <button type="button" className={`star ${on ? 'on' : ''}`} aria-pressed={on} title={on ? `Remove ${label} from watchlist` : `Add ${label} to watchlist`}
    onClick={(e) => { e.stopPropagation(); toggleWatch(kind, id); toast(on ? `Removed ${label} from watchlist` : `Added ${label} to watchlist`) }}>{on ? '★' : '☆'}</button>
}

// ---------------------------------------------------------------- countries lookup
export function useCountries() {
  const { data } = useData<{ countries: CountrySummary[] }>('countries.json')
  return useMemo(() => {
    const by: Record<string, CountrySummary> = {}
    data?.countries.forEach((c) => { by[c.iso2] = c })
    return { list: data?.countries || [], by, regionOf: (iso?: string | null) => (iso ? by[iso]?.region : undefined) }
  }, [data])
}

// ---------------------------------------------------------------- global filter bar
export function FilterBar({ events, hideFocus }: { events?: Event[]; hideFocus?: boolean }) {
  const f = useFilters()
  const { list, by } = useCountries()
  const regions = useMemo(() => [...new Set(list.map((c) => c.region))].sort(), [list])
  const counts = useMemo(() => {
    const m = new Map<string, number>()
    events?.forEach((e) => e.country && (!f.region || by[e.country]?.region === f.region) && m.set(e.country, (m.get(e.country) || 0) + 1))
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [events, f.region, by])
  const [more, setMore] = useState(false)
  const extra = (f.region ? 1 : 0) + (f.hours !== 168 ? 1 : 0) + (f.support !== 'all' ? 1 : 0) + (f.q ? 1 : 0)
  const pills: [string, () => void][] = []
  if (f.region) pills.push([f.region, () => setFilters({ region: '' })])
  if (f.country) pills.push([`${flag(f.country)} ${by[f.country]?.name || f.country}`, () => setFilters({ country: '' })])
  if (f.support !== 'all') pills.push([f.support === 'multi' ? t('2+ outlets or official') : t('Official or measured only'), () => setFilters({ support: 'all' })])
  if (f.q) pills.push([`“${f.q}”`, () => setFilters({ q: '' })])
  if (f.hours !== 168) pills.push([f.hours === 24 ? t('Last 24 hours') : t('Last 3 days'), () => setFilters({ hours: 168 })])
  return (
    <section className="filters no-print" aria-label="Filters">
      {!hideFocus && <div className="focus">{FOCUS.map((x) => <button key={x.key} type="button" className={`chip ${f.focus === x.key ? 'on' : ''}`} onClick={() => setFilters({ focus: x.key })}>{x.icon} {t(x.label)}</button>)}</div>}
      <div className="filter-line">
        <select className="input" value={f.country} aria-label="Country" onChange={(e) => setFilters({ country: e.target.value })}>
          <option value="">🌍 {t('All countries')}</option>
          {f.country && !counts.some((c) => c[0] === f.country) && <option value={f.country}>{flag(f.country)} {by[f.country]?.name || f.country}</option>}
          {counts.map(([iso, n]) => <option key={iso} value={iso}>{flag(iso)} {by[iso]?.name || iso} ({n})</option>)}</select>
        <button type="button" className={`filter-toggle ${more ? 'on' : ''}`} onClick={() => setMore(!more)} aria-expanded={more}>⚙ {t('More filters')}{extra ? ` (${extra})` : ''}</button>
      </div>
      {more && (
        <div className="filter-more">
          <select className="input" value={f.region} aria-label="Region" onChange={(e) => setFilters({ region: e.target.value, country: '' })}>
            <option value="">🗺 {t('All regions')}</option>{regions.map((r) => <option key={r}>{r}</option>)}</select>
          <select className="input" value={f.hours} aria-label="Time window" onChange={(e) => setFilters({ hours: Number(e.target.value) })}>
            <option value={24}>⏱ {t('Last 24 hours')}</option><option value={72}>⏱ {t('Last 3 days')}</option><option value={168}>⏱ {t('Last 7 days')}</option></select>
          <select className="input" value={f.support} aria-label="Support" onChange={(e) => setFilters({ support: e.target.value as typeof f.support })}>
            <option value="all">✔ {t('Any support')}</option><option value="multi">✔ {t('2+ outlets or official')}</option><option value="official">✔ {t('Official or measured only')}</option></select>
          <input className="input" type="search" placeholder={`🔎 ${t('Search words…')}`} value={f.q} onChange={(e) => setFilters({ q: e.target.value })} aria-label="Search words" />
        </div>
      )}
      {pills.length > 0 && (
        <div className="active-filters">{t('Filtered by:')}
          {pills.map(([l, clear]) => <button key={l} type="button" className="pill" onClick={clear}>{l} ✕</button>)}
          <button type="button" className="pill" onClick={() => setFilters({ ...DEFAULT_FILTERS, focus: f.focus })}>{t('Reset all')}</button>
        </div>
      )}
    </section>
  )
}

// ---------------------------------------------------------------- developments
export function VerifBadge({ v }: { v: string }) {
  const x = VERIF[v] || { label: v, tone: 'b-mute', tip: '' }
  return <Badge tone={x.tone} title={x.tip}><span className="dot" />{t(x.label)}</Badge>
}
export function CatLabel({ c }: { c: string }) {
  const x = cat(c)
  return <span style={{ color: x.color, fontWeight: 600 }}>{x.icon} {x.label}</span>
}
export function EventItem({ e, names }: { e: Event; names?: Record<string, CountrySummary> }) {
  const ref = e.refs[0]
  return (
    <div className="item">
      <div className="cat-bar" style={{ background: cat(e.category).color }} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="t"><a href={`#/event/${encodeURIComponent(e.id)}`}>{e.title}</a></div>
        <div className="m">
          <VerifBadge v={e.verification} />
          <CatLabel c={e.category} />
          {e.country && <a href={`#/country/${e.country}`} className="muted">{flag(e.country)} {names?.[e.country]?.name || e.country}</a>}
          {e.outlets > 1 && <span>{e.outlets} outlets</span>}
          <span title={e.started_at || ''}>{fmtDate(e.started_at || e.first_detected)}</span>
          {ref && <Ext href={ref.u}>{ref.p || 'source'} ↗</Ext>}
          {e.n_related > 0 && <span>🔗 {e.n_related}</span>}
          {names && <ExplainButton e={e} names={names} small />}
        </div>
      </div>
    </div>
  )
}
export function EventList({ rows, step = 10, names, empty }: { rows?: Event[] | null; step?: number; names?: Record<string, CountrySummary>; empty?: string }) {
  const [n, setN] = useState(step)
  useEffect(() => setN(step), [rows, step])
  if (!rows) return <Loading />
  const sorted = sortEvents(rows)
  if (!sorted.length) return <Empty>{empty || `${t('Nothing matches these filters.')} Try a longer time window, “Any support” or another region.`}</Empty>
  return (
    <div className="list">
      {sorted.slice(0, n).map((e) => <EventItem key={e.id} e={e} names={names} />)}
      {sorted.length > n && <button type="button" className="icon-btn more-btn" onClick={() => setN(n + step * 2)}>{t('Show more')} ({sorted.length - n})</button>}
    </div>
  )
}
export function CountryBars({ rows, color, onPick }: { rows?: Event[] | null; color?: string; onPick?: (iso: string) => void }) {
  const { by } = useCountries()
  if (!rows) return <Loading rows={5} />
  const m = new Map<string, number>()
  rows.forEach((e) => e.country && m.set(e.country, (m.get(e.country) || 0) + 1))
  const top = [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
  if (!top.length) return <Empty>No located developments for these filters.</Empty>
  const max = top[0][1]
  return (
    <div className="hb">
      {top.map(([iso, n]) => [
        <button key={iso + 'n'} type="button" onClick={() => (onPick ? onPick(iso) : setFilters({ country: iso }))} title="Filter to this country">{flag(iso)} {by[iso]?.name || iso}</button>,
        <div key={iso + 'b'} className="bar-bg"><div className="bar-fg" style={{ width: `${(n / max) * 100}%`, background: color }} /></div>,
        <b key={iso + 'v'} className="num">{n}</b>,
      ])}
    </div>
  )
}

// ---------------------------------------------------------------- signals
export const sigIcon = (tp: string) => ({ news_volume: '📰', topic_volume: '📣', earthquake: '🌍', quake_cluster: '〰️', market: '📉', fx: '💱', disaster_alert: '🚨', internet: '📡' } as Record<string, string>)[tp] || '◆'
export function measure(s: Signal) {
  if (s.signal_type === 'news_volume' || s.signal_type === 'topic_volume') return `${Math.round(s.observed || 0)} articles in a day — normally about ${Math.round(s.baseline || 0)}`
  if (s.signal_type === 'market' || s.signal_type === 'fx') return `${pct(s.pct_change)} — a bigger move than usual (prices of ${s.data_freshness})`
  if (s.signal_type === 'earthquake') return `magnitude ${s.observed?.toFixed(1)}`
  if (s.signal_type === 'quake_cluster') return `${s.observed} earthquakes in 24 hours — normally about ${s.baseline} a day`
  if (s.signal_type === 'internet') return 'internet connections dropped'
  return ''
}
export function SignalItem({ s }: { s: Signal }) {
  const st = SIG_STATUS[s.status] || { label: s.status, tone: 'b-mute', tip: '' }
  return (
    <div className="item">
      <div style={{ fontSize: 20, lineHeight: 1 }}>{sigIcon(s.signal_type)}</div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="t"><a href={`#/signal/${encodeURIComponent(s.id)}`}>{s.title}</a></div>
        <div className="m">
          <Badge tone={st.tone} title={st.tip}>{st.label}</Badge>
          <Badge tone={s.confidence === 'high' ? 'b-ok' : s.confidence === 'medium' ? 'b-info' : 'b-warn'} title="How solid the data behind this is (not whether anything will happen)">{evidenceLabel(s.confidence)}</Badge>
          {s.country && <a className="muted" href={`#/country/${s.country}`}>{flag(s.country)} {s.country}</a>}
          <span>{measure(s)}</span>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- price tiles
export function Tiles({ items, ids, selected, onPick }: { items?: MarketLatest[]; ids: [string, string?][]; selected?: string; onPick?: (id: string) => void }) {
  if (!items) return <div className="tiles">{ids.map(([id]) => <div key={id} className="tile"><div className="skeleton" style={{ height: 54 }} /></div>)}</div>
  return (
    <div className="tiles">
      {ids.map(([id, label]) => {
        const r = items.find((x) => x.id === id)
        if (!r) return null
        return (
          <button type="button" key={id} className={`tile ${selected === id ? 'sel' : ''}`} onClick={() => (onPick ? onPick(id) : (location.hash = `/markets?s=${encodeURIComponent(id)}`))}>
            <div className="tile-name">{label || r.name}</div>
            <div className="tile-row">
              <div><div className="tile-val">{num(r.last, 2)}</div><span className={`chg ${tone(r.chg_1d)}`}>{pct(r.chg_1d)}</span></div>
              <Sparkline values={r.spark || []} color={(r.chg_21d || 0) >= 0 ? 'var(--ok)' : 'var(--bad)'} width={64} height={30} />
            </div>
            <div className="fresh">{r.unit} · {fmtDate(r.as_of, false)}</div>
          </button>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------- briefing
export function BriefingView({ b }: { b: Briefing }) {
  const id = `${b.kind}-${b.scope || 'w'}-${b.period_hours}`
  return (
    <div>
      {b.ai_summary && <div className="banner info"><span>🤖</span><div><b>AI summary (local model, citations checked)</b><div>{b.ai_summary}</div></div></div>}
      {b.sections.map((s) => (
        <div key={s.heading} style={{ marginBottom: 14 }}>
          <h3 style={{ fontSize: 15, marginBottom: 6 }}>{s.heading}</h3>
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            {s.items.map((it, i) => (
              <li key={i} style={{ margin: '5px 0' }}>
                {it.event_id ? <a href={`#/event/${encodeURIComponent(it.event_id)}`} style={{ color: 'var(--text)' }}>{it.text}</a> : it.text}
                {it.refs.map((r) => <sup key={r} className="ref"><a href={`#ref-${id}-${r}`} onClick={(e) => { e.preventDefault(); document.getElementById(`ref-${id}-${r}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }) }}>{r}</a></sup>)}
              </li>
            ))}
          </ul>
        </div>
      ))}
      <details open={b.references.length < 12}>
        <summary>{t('Sources')} ({b.references.length})</summary>
        <ol className="ref-list">{b.references.map((r) => <li key={r.id} id={`ref-${id}-${r.id}`}><Ext href={r.url}>{r.title}</Ext> <span className="faint">— {r.publisher || r.kind}{r.date ? `, ${fmtDate(r.date)}` : ''}</span></li>)}</ol>
      </details>
      <div className="banner warn" style={{ marginTop: 12 }}><span>ℹ️</span><div className="small"><b>Data limitations</b><ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{b.limitations.map((l) => <li key={l}>{l}</li>)}</ul>
        <div className="faint" style={{ marginTop: 4 }}>Generated {fmtDate(b.generated_at)} · {b.mode === 'deterministic' ? 'template mode (no AI)' : b.mode}</div></div></div>
    </div>
  )
}

// ---------------------------------------------------------------- learn links
export const EXPLAINER_KEYS: [RegExp, string, string][] = [
  [/hormuz/i, 'hormuz', 'Strait of Hormuz'], [/red sea|bab el-mandeb|houthi/i, 'red-sea', 'Red Sea route'], [/suez/i, 'suez', 'Suez Canal'],
  [/opec/i, 'opec', 'OPEC+'], [/sanction|export control|embargo/i, 'sanctions', 'Sanctions & export controls'], [/tariff/i, 'tariffs', 'Tariffs'],
  [/rate (cut|hike)|repo rate|interest rate|central bank/i, 'rates', 'Central bank rates'], [/brent|wti|crude/i, 'oil-benchmarks', 'Oil benchmarks'],
  [/rupee|yuan|currency|exchange rate|dollar/i, 'fx', 'Exchange rates'], [/natural gas|lng|henry hub/i, 'gas', 'Natural gas prices'],
  [/\bnato\b/i, 'nato', 'NATO'], [/security council|\bun\b|united nations/i, 'unsc', 'UN Security Council'], [/ceasefire|truce/i, 'ceasefire', 'Ceasefire'],
  [/inflation|consumer prices/i, 'inflation', 'Inflation'], [/\bgdp\b|economic growth/i, 'gdp', 'GDP'], [/recession/i, 'recession', 'Recession'],
  [/houthi/i, 'houthis', 'Houthis'], [/gaza|hamas/i, 'gaza', 'Gaza'], [/taiwan/i, 'taiwan', 'Taiwan & China'],
]
export function LearnLinks({ text }: { text: string }) {
  const hits = EXPLAINER_KEYS.filter(([rx]) => rx.test(text))
  if (!hits.length) return null
  return <div className="row small" style={{ marginTop: 6 }}><span className="muted">📘 {t('Learn')}:</span>{hits.map(([, id, label]) => <a key={id} href={`#/learn/${id}`}>{label}</a>)}</div>
}
