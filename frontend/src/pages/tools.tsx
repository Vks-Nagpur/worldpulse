import { useEffect, useMemo, useState } from 'react'
import { CatLabel, Chips, Empty, EventItem, Loading, PageHead, Tiles, useCountries, VerifBadge } from '../components/ui'
import type { Article, CountrySummary, Event, MarketLatest, Signal } from '../data'
import { API, apiQuery, load, useData } from '../data'
import { highlight, parseQuery, prepare, score, type Prepared, type Query } from '../search'
import { t } from '../i18n'
import { toggleWatch, watchStore } from '../store'
import { resetName, userName, useUser } from '../components/welcome'
import { ago, Badge, CAT, cat, Ext, flag, fmtDate } from '../util'

// ---------------------------------------------------------------- Ask
const REGIONS: Record<string, string[]> = {
  'middle east': ['IL', 'PS', 'LB', 'SY', 'JO', 'IQ', 'IR', 'SA', 'YE', 'OM', 'AE', 'QA', 'BH', 'KW', 'EG', 'TR'],
  europe: ['GB', 'FR', 'DE', 'IT', 'ES', 'PL', 'NL', 'BE', 'SE', 'NO', 'FI', 'DK', 'AT', 'CH', 'IE', 'PT', 'GR', 'CZ', 'HU', 'RO', 'BG', 'UA', 'BY', 'MD'],
  africa: [], 'latin america': [], 'south asia': ['IN', 'PK', 'BD', 'LK', 'NP', 'AF', 'BT', 'MV'], 'east asia': ['CN', 'JP', 'KR', 'KP', 'TW', 'MN'],
  'southeast asia': ['ID', 'MY', 'SG', 'TH', 'VN', 'PH', 'MM', 'KH', 'LA'], 'north america': ['US', 'CA', 'MX'], gulf: ['SA', 'AE', 'QA', 'BH', 'KW', 'OM'],
}
const CAT_WORDS: Record<string, string[]> = {
  economics: ['economy', 'economic', 'inflation', 'gdp', 'recession'], financial_markets: ['market', 'markets', 'stocks', 'currency', 'crypto'],
  energy: ['oil', 'gas', 'energy', 'opec', 'crude'], trade: ['trade', 'tariff', 'tariffs', 'exports', 'shipping'],
  natural_disasters: ['earthquake', 'earthquakes', 'quake', 'flood', 'floods', 'cyclone', 'disaster', 'disasters', 'wildfire'],
  military_security: ['war', 'military', 'conflict', 'attack', 'security', 'missile'], diplomacy: ['diplomacy', 'diplomatic', 'talks', 'summit', 'relations'],
  elections: ['election', 'elections', 'vote'], cybersecurity: ['cyber', 'hack', 'ransomware'], public_health: ['health', 'outbreak', 'disease'],
  environment: ['climate', 'environment', 'pollution'], technology: ['technology', 'tech', 'ai', 'chips'], geopolitics: ['sanctions', 'geopolitical', 'protest', 'protests', 'coup'],
}
const HAZ: [RegExp, RegExp][] = [[/earthquake|quake|tremor/, /earthquake|quake|tremor|seismic/i], [/flood/, /flood/i], [/cyclone|hurricane|typhoon|storm/, /cyclone|hurricane|typhoon|storm/i],
  [/wildfire|forest fire|bushfire/, /fire/i], [/volcan|eruption/, /volcan|eruption/i], [/tsunami/, /tsunami/i], [/drought/, /drought/i]]
const STOP = new Set('what which who when where how why is are was were did do does happened happening show me tell list give the a an in on of for about during last past this that today yesterday week month day days hours recent latest major significant important any all and or with involving between affecting summarize summarise developments news events countries country experienced'.split(' '))
type Answer = { summary: string; items: Event[]; gaps: string[]; interp: { hours: number; countries: string[]; categories: string[]; keywords: string[] } }

function answerStatic(q: string, events: Event[], countries: CountrySummary[]): Answer {
  const ql = q.toLowerCase()
  let hours = 168
  const m = ql.match(/(?:last|past)\s+(\d+)\s*(hour|day|week|month)/)
  if (m) hours = Number(m[1]) * ({ h: 1, d: 24, w: 168, m: 720 } as Record<string, number>)[m[2][0]]
  else if (/\btoday\b|24 hours/.test(ql)) hours = 24
  else if (/yesterday/.test(ql)) hours = 48
  else if (/month/.test(ql)) hours = 720
  const cs = new Set<string>()
  for (const c of countries) if (new RegExp(`\\b${c.name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(ql)) cs.add(c.iso2)
  for (const [r, list] of Object.entries(REGIONS)) if (ql.includes(r)) (list.length ? list : countries.filter((c) => (r === 'africa' ? c.region === 'Sub-Saharan Africa' : c.region.startsWith('Latin'))).map((c) => c.iso2)).forEach((x) => cs.add(x))
  const cats = Object.entries(CAT_WORDS).filter(([, ws]) => ws.some((w) => new RegExp(`\\b${w}\\b`).test(ql))).map(([k]) => k)
  const names = new Set([...cs].flatMap((c) => countries.find((x) => x.iso2 === c)?.name.toLowerCase().split(' ') || []))
  const kws = (q.match(/[a-zA-Z][a-zA-Z-]{2,}/g) || []).filter((w) => !STOP.has(w.toLowerCase()) && !names.has(w.toLowerCase()) && !Object.values(CAT_WORDS).flat().includes(w.toLowerCase()) && !Object.keys(REGIONS).some((r) => r.includes(w.toLowerCase())))
  const since = Date.now() - hours * 3.6e6
  let hits = events.filter((e) => new Date(e.last_updated).getTime() >= since)
  if (cs.size) hits = hits.filter((e) => (e.country && cs.has(e.country)) || e.countries.some((c) => cs.has(c)))
  if (cs.size >= 2 && cs.size <= 4) { const both = hits.filter((e) => [...cs].every((c) => e.countries.includes(c))); if (both.length) hits = both }
  if (cats.length) hits = hits.filter((e) => cats.includes(e.category))
  const haz = HAZ.filter(([qq]) => qq.test(ql)).map(([, tt]) => tt)
  if (haz.length) hits = hits.filter((e) => haz.some((tt) => tt.test(e.title)))
  if (/significant/.test(ql) && cats.includes('natural_disasters')) hits = hits.filter((e) => e.origin !== 'usgs' || (e.magnitude || 0) >= 5.5)
  if (kws.length && !cs.size && !cats.length) hits = hits.filter((e) => kws.some((k) => e.title.toLowerCase().includes(k.toLowerCase())))
  const bonus: Record<string, number> = { instrument_observation: 3, official_alert: 2.5, official_statement: 2, multi_source_reporting: 1.5, single_source_report: 1 }
  const score = (e: Event) => (1 + kws.filter((k) => e.title.toLowerCase().includes(k.toLowerCase())).length * 2) * (bonus[e.verification] || 1) * (1 + e.outlets / 6) * Math.exp(-(Date.now() - new Date(e.last_updated).getTime()) / 3.6e6 / Math.max(hours, 24))
  hits.sort((a, b) => score(b) - score(a))
  const scope = cs.size ? [...cs].slice(0, 5).map((c) => countries.find((x) => x.iso2 === c)?.name).join(', ') + (cs.size > 5 ? '…' : '') : 'worldwide'
  const period = hours >= 48 ? `the last ${Math.round(hours / 24)} days` : `the last ${hours} hours`
  const topic = cats.map((c) => cat(c).label.toLowerCase()).join(', ') || 'all topics'
  const gaps: string[] = []
  if (!hits.length) gaps.push('Nothing in the published data matched. Try a longer period or fewer words. The public dataset holds 7 days of developments.')
  if (hours > 168) gaps.push('The public dataset keeps 7 days of developments; the self-hosted engine keeps 45 days.')
  if (hits.length && hits.slice(0, 12).every((e) => e.verification === 'single_source_report')) gaps.push('All matches are single-outlet reports and remain unverified.')
  if (cats.includes('energy') || cats.includes('financial_markets')) gaps.push('For prices see Markets. News next to a price move does not show that one caused the other.')
  return { summary: hits.length ? `Found ${hits.length} recorded developments (${scope}; ${topic}; ${period}). The most relevant are listed with their sources.` : `No recorded developments matched (${scope}; ${topic}; ${period}).`,
    items: hits.slice(0, 12), gaps, interp: { hours, countries: [...cs], categories: cats, keywords: kws } }
}

const EXAMPLES = ['What happened in the Middle East during the last 24 hours?', 'Show major economic developments in India this week.', 'Which countries experienced significant earthquakes today?',
  'What major events are affecting global oil markets?', 'Summarize recent developments involving China and Taiwan.', 'Any new sanctions this week?']

export function Ask() {
  const ev = useData<{ events: Event[] }>('events.json')
  const { list, by } = useCountries()
  const [q, setQ] = useState('')
  const [a, setA] = useState<Answer | null>(null)
  const [apiAns, setApiAns] = useState<{ summary: string } | null>(null)
  const run = async (text: string) => {
    setQ(text)
    if (!ev.data || !list.length) return
    setA(answerStatic(text, ev.data.events, list))
    if (API) { try { setApiAns(await apiQuery(text)) } catch { setApiAns(null) } }
  }
  return (
    <>
      <PageHead title={`💬 ${t('Ask WorldPulse')}`} sub="Ask in plain English. Answers are built only from stored records and always show their sources. No AI is needed and nothing is made up." />
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="row" style={{ flexWrap: 'nowrap' }}><input className="input" style={{ fontSize: 16, padding: '12px 14px' }} placeholder="e.g. What happened in Ukraine this week?" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && q.trim().length > 2 && run(q)} />
          <button type="button" className="btn" disabled={!ev.data} onClick={() => q.trim().length > 2 && run(q)}>{t('Ask')}</button></div>
        <div className="chips" style={{ marginTop: 10 }}>{EXAMPLES.map((x) => <button type="button" key={x} className="chip" onClick={() => run(x)}>{x}</button>)}</div>
      </div>
      {a && (
        <div className="card">
          <h3>Answer</h3><p>{a.summary}</p>
          <div className="row small muted" style={{ marginBottom: 8 }}><span>Understood as →</span><Badge tone="b-acc">⏱ last {a.interp.hours >= 48 ? `${Math.round(a.interp.hours / 24)} days` : `${a.interp.hours} h`}</Badge>
            {a.interp.countries.slice(0, 8).map((c) => <Badge key={c}>{flag(c)} {c}</Badge>)}{a.interp.categories.map((c) => <Badge key={c}>{cat(c).icon} {cat(c).label}</Badge>)}{a.interp.keywords.map((k) => <Badge key={k}>“{k}”</Badge>)}</div>
          <div className="list">{a.items.map((e) => <EventItem key={e.id} e={e} names={by} />)}</div>
          {a.gaps.length > 0 && <div className="banner warn" style={{ marginTop: 12 }}><span>ℹ️</span><div className="small"><b>What is missing or uncertain</b><ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{a.gaps.map((g) => <li key={g}>{g}</li>)}</ul></div></div>}
          {apiAns && <div className="small faint">Self-hosted engine: {apiAns.summary}</div>}
        </div>
      )}
    </>
  )
}

// ---------------------------------------------------------------- Search
type Hit = { type: string; title: string; desc?: string | null; date?: string | null; source?: string | null; countries: string[]; category?: string; url?: string | null; internal?: string; verification?: string; prep: Prepared }

function Marked({ text, q }: { text: string; q: Query }) {
  return <>{highlight(text, q).map((p, i) => (p.hit ? <mark key={i} className="hl">{p.s}</mark> : <span key={i}>{p.s}</span>))}</>
}

export function Search({ initial }: { initial: string }) {
  const [q, setQ] = useState(initial)
  const [type, setType] = useState('all')
  const [sort, setSort] = useState<'relevance' | 'date'>('relevance')
  const [all, setAll] = useState<Hit[] | null>(null)
  useEffect(() => setQ(initial), [initial])
  useEffect(() => {
    Promise.all([load<{ events: Event[] }>('events.json'), load<{ articles: Article[] }>('news.json'), load<{ countries: CountrySummary[] }>('countries.json'),
      load<MarketLatest[]>('dashboard/markets_latest.json'), load<{ signals: Signal[] }>('signals.json')]).then(([ev, n, c, m, s]) => {
      const name: Record<string, string> = {}
      c.countries.forEach((x) => { name[x.iso2] = x.name })
      const cn = (codes: string[]) => codes.map((k) => name[k] || k).join(' ')
      const rank: Record<string, number> = { instrument_observation: 3, official_alert: 2.5, official_statement: 2, multi_source_reporting: 1.5, single_source_report: 0.5 }
      setAll([
        ...c.countries.map((x) => ({ type: 'country', title: x.name, desc: `${x.region}${x.capital ? ' · capital ' + x.capital : ''}`, countries: [x.iso2], internal: `/country/${x.iso2}`,
          prep: prepare({ fields: [[x.name, 4], [x.iso2, 4], [x.iso3, 3], [x.capital || '', 2], [x.region, 1]], boost: 6 }) })),
        ...m.map((x) => ({ type: 'price', title: x.name, desc: `${x.unit} · latest ${x.as_of}`, source: x.source, countries: x.country ? [x.country] : [], internal: `/markets?s=${encodeURIComponent(x.id)}`, date: x.as_of,
          prep: prepare({ fields: [[x.name, 4], [x.id.replace(/^\w+:/, ''), 3], ['price prices rate chart', 3], [x.unit, 1], [x.kind, 1]], boost: 5 }) })),
        ...ev.events.map((e) => ({ type: 'development', title: e.title, date: e.started_at || e.first_detected, source: e.refs[0]?.p, countries: e.countries, category: e.category, internal: `/event/${e.id}`, verification: e.verification,
          prep: prepare({ fields: [[e.title, 3], [cn(e.countries), 2], [cat(e.category).label, 1], [e.refs[0]?.p || '', 1], [(e.why || []).join(' '), 1]], date: e.started_at || e.first_detected, boost: (rank[e.verification] || 0) + Math.min(e.outlets, 6) * 0.3 }) })),
        ...n.articles.map((a) => ({ type: 'headline', title: a.t, desc: a.x, date: a.d, source: a.p, countries: a.k, category: a.c, url: a.u,
          prep: prepare({ fields: [[a.t, 3], [a.x || '', 1], [a.p || '', 1], [cn(a.k), 2]], date: a.d }) })),
        ...s.signals.map((x) => ({ type: 'signal', title: x.title, date: x.detected_at, source: 'OpenSignals', countries: x.country ? [x.country] : [], internal: `/signal/${x.id}`,
          prep: prepare({ fields: [[x.title, 3], [cn(x.country ? [x.country] : []), 2], [x.signal_type.replace('_', ' '), 1]], date: x.detected_at, boost: 1 }) })),
      ])
    }, () => setAll([]))
  }, [])
  const query = useMemo(() => parseQuery(q), [q])
  const { full, partial } = useMemo(() => {
    if (!all || !query.terms.length) return { full: [] as Hit[], partial: [] as Hit[] }
    const scored = all.filter((h) => type === 'all' || h.type === type).map((h) => ({ h, ...score(h.prep, query) })).filter((x) => x.score > 0)
    const order = (a: typeof scored[number], b: typeof scored[number]) => (sort === 'date' ? (b.h.date || '').localeCompare(a.h.date || '') : b.score - a.score)
    const f = scored.filter((x) => x.matched === query.terms.length).sort(order)
    const p = query.terms.length > 1 ? scored.filter((x) => x.matched < query.terms.length && x.matched >= Math.ceil(query.terms.length / 2)).sort(order) : []
    return { full: f.slice(0, 200).map((x) => x.h), partial: f.length < 15 ? p.slice(0, 30).map((x) => x.h) : [] }
  }, [all, query, type, sort])
  const row = (h: Hit, i: number, part = false) => (
    <div key={`${part}-${i}`} className="item"><div style={{ minWidth: 0 }}>
      <div className="t">{h.internal ? <a href={`#${h.internal}`}><Marked text={h.title} q={query} /></a> : <Ext href={h.url}><Marked text={h.title} q={query} /></Ext>}</div>
      {h.desc && <div className="small muted"><Marked text={h.desc} q={query} /></div>}
      <div className="m"><Badge tone="b-acc">{h.type}</Badge>{part && <Badge>partial match</Badge>}{h.verification && <VerifBadge v={h.verification} />}{h.category && <CatLabel c={h.category} />}
        {h.countries.slice(0, 4).map((c) => <span key={c}>{flag(c)} {c}</span>)}{h.source && <span>{h.source}</span>}{h.date && <span>{fmtDate(h.date)}</span>}</div></div></div>
  )
  return (
    <>
      <PageHead title={`🔎 ${t('Search')}`} sub="Countries, developments, headlines, prices and signals in the published data. Whole words are matched; country tags count too." />
      <div className="card" style={{ marginBottom: 14 }}>
        <form role="search" onSubmit={(e) => { e.preventDefault(); location.hash = `/search?q=${encodeURIComponent(q.trim())}` }}>
          <input className="input" type="search" enterKeyHint="search" style={{ fontSize: 16, padding: '12px 14px' }} autoFocus placeholder={t('Search countries, events, headlines…')} value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
        </form>
        <div className="row" style={{ marginTop: 10 }}>
          <Chips scroll value={type} onChange={setType} options={[['all', 'All'], ['country', 'Countries'], ['development', 'Developments'], ['headline', 'Headlines'], ['price', 'Prices'], ['signal', 'Signals']].map(([v, label]) => ({ v, label }))} />
          <Chips value={sort} onChange={setSort} options={[{ v: 'relevance', label: 'Best match' }, { v: 'date', label: 'Newest' }]} />
        </div>
      </div>
      {!all ? <Loading /> : !query.terms.length ? <Empty>Type a word — for example a country, a commodity or a company.</Empty> : (
        <div className="card"><div className="small muted">{full.length}{full.length === 200 ? '+' : ''} result{full.length === 1 ? '' : 's'} containing {query.terms.length > 1 ? 'all words' : `“${query.raw}”`}</div>
          <div className="list">{full.map((h, i) => row(h, i))}</div>
          {partial.length > 0 && <><div className="small muted" style={{ marginTop: 12 }}>Close matches (some of the words)</div><div className="list">{partial.map((h, i) => row(h, i, true))}</div></>}
          {!full.length && !partial.length && <Empty>No results for “{query.raw}”. Try fewer or different words.</Empty>}</div>
      )}
    </>
  )
}

// ---------------------------------------------------------------- Watchlist & alerts
type Rule = { id: string; name: string; type: 'quake' | 'keyword' | 'country' | 'category' | 'market' | 'fxweek'; value: string; threshold?: number }
type Fired = { key: string; rule: string; text: string; link: string; at: string }
const LS = 'worldpulse.alerts.v1'
const readStore = (): { rules: Rule[]; fired: Fired[] } => { try { const v = JSON.parse(localStorage.getItem(LS) || ''); return { rules: v.rules || [], fired: v.fired || [] } } catch { return { rules: [], fired: [] } } }
const writeStore = (s: { rules: Rule[]; fired: Fired[] }) => { try { localStorage.setItem(LS, JSON.stringify(s)) } catch { /* ignore */ } }

export async function evaluateAlerts(notify = true): Promise<Fired[]> {
  const st = readStore()
  if (!st.rules.length) return []
  const [ev, sig, mk] = await Promise.all([load<{ events: Event[] }>('events.json'), load<{ signals: Signal[] }>('signals.json'), load<MarketLatest[]>('dashboard/markets_latest.json')])
  const known = new Set(st.fired.map((f) => f.key))
  const fresh: Fired[] = []
  const add = (r: Rule, key: string, text: string, link: string) => { const k = `${r.id}:${key}`; if (!known.has(k)) { known.add(k); fresh.push({ key: k, rule: r.name, text, link, at: new Date().toISOString() }) } }
  for (const r of st.rules) {
    if (r.type === 'quake') ev.events.filter((e) => e.origin === 'usgs' && (e.magnitude || 0) >= (r.threshold || 6)).forEach((e) => add(r, e.id, e.title, `/event/${e.id}`))
    if (r.type === 'keyword') ev.events.filter((e) => e.title.toLowerCase().includes(r.value.toLowerCase())).forEach((e) => add(r, e.id, e.title, `/event/${e.id}`))
    if (r.type === 'category') ev.events.filter((e) => e.category === r.value && e.outlets >= 2).forEach((e) => add(r, e.id, e.title, `/event/${e.id}`))
    if (r.type === 'country') sig.signals.filter((s) => s.country === r.value.toUpperCase()).forEach((s) => add(r, s.id, s.title, `/signal/${s.id}`))
    if (r.type === 'market' || r.type === 'fxweek') {
      const m = mk.find((x) => x.id === r.value)
      const c = m ? (r.type === 'market' ? m.chg_1d : m.chg_5d) : null
      if (m && c != null && Math.abs(c) >= (r.threshold || 3)) add(r, `${m.as_of}`, `${m.name} moved ${c.toFixed(2)}% (${r.type === 'market' ? '1 day' : '1 week'}) to ${m.as_of}`, `/markets?s=${encodeURIComponent(m.id)}`)
    }
  }
  if (fresh.length) {
    writeStore({ rules: st.rules, fired: [...fresh, ...st.fired].slice(0, 300) })
    if (notify && 'Notification' in window && Notification.permission === 'granted') fresh.slice(0, 3).forEach((f) => new Notification(`WorldPulse: ${f.rule}`, { body: f.text }))
  }
  return fresh
}

export function Watch() {
  const user = useUser()
  const [st, setSt] = useState(readStore())
  const w = watchStore.use()
  const lt = useData<MarketLatest[]>('dashboard/markets_latest.json')
  const { by } = useCountries()
  const [form, setForm] = useState<Rule>({ id: '', name: '', type: 'fxweek', value: 'fx:USDINR', threshold: 1 })
  const save = (s: typeof st) => { writeStore(s); setSt(s) }
  useEffect(() => { evaluateAlerts(false).then(() => setSt(readStore())) }, [])
  const label = (id: string) => lt.data?.find((m) => m.id === id)?.name || id
  const describe = (r: Rule) => ({ quake: `Earthquakes ≥ M${r.threshold}`, keyword: `Mentions “${r.value}”`, country: `Unusual activity: ${r.value.toUpperCase()}`, category: `${cat(r.value).label} (2+ outlets)`,
    market: `${label(r.value)} moves ≥ ${r.threshold}% in a day`, fxweek: `${label(r.value)} moves ≥ ${r.threshold}% in a week` }[r.type])
  const addRule = () => {
    const r = { ...form, id: Math.random().toString(36).slice(2, 9) }
    r.name = form.name || describe(r)
    save({ ...st, rules: [...st.rules, r] })
    evaluateAlerts().then(() => setSt(readStore()))
  }
  return (
    <>
      <PageHead title={`⭐ ${t('Watchlist & alerts')}`} sub="Saved only in this browser — no account needed. Alerts are checked each time you open WorldPulse."
        actions={<button type="button" className="icon-btn" onClick={resetName}>👤 {userName(user) ? `${userName(user)} · ${t('Change name')}` : t('Change name')}</button>} />
      <div className="banner warn"><span>🔔</span><div className="small">This free site has no server, so it cannot alert you while it is closed. Installing it as an app and enabling notifications shows alerts when you open it. For continuous alerts, run the free self-hosted engine (see About &amp; sources).</div></div>
      <div className="grid g2">
        <div className="card">
          <h3>⭐ {t('My watchlist')}</h3><p className="sub">Tap ☆ on any market, country or topic to add it. Watched items appear first on Today.</p>
          {w.markets.length > 0 && <div style={{ marginBottom: 10 }}><Tiles items={lt.data} ids={w.markets.map((m) => [m] as [string])} /></div>}
          <div className="row" style={{ margin: '6px 0' }}>{w.countries.map((c) => <button type="button" key={c} className="pill" onClick={() => toggleWatch('countries', c)}>{flag(c)} {by[c]?.name || c} ✕</button>)}
            {w.markets.map((m) => <button type="button" key={m} className="pill" onClick={() => toggleWatch('markets', m)}>{label(m)} ✕</button>)}
            {w.topics.map((tp) => <button type="button" key={tp} className="pill" onClick={() => toggleWatch('topics', tp)}>{cat(tp).label} ✕</button>)}</div>
          <div className="small muted" style={{ margin: '10px 0 6px' }}>Add a topic:</div>
          <div className="chips">{Object.entries(CAT).filter(([k]) => k !== 'general').map(([k, x]) => <button type="button" key={k} className={`chip ${w.topics.includes(k) ? 'on' : ''}`} onClick={() => toggleWatch('topics', k)}>{x.icon} {x.label}</button>)}</div>
        </div>
        <div className="card">
          <h3>🔔 New alert</h3>
          <div className="frow" style={{ marginTop: 8 }}>
            <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as Rule['type'], value: e.target.value === 'fxweek' ? 'fx:USDINR' : '', threshold: e.target.value === 'quake' ? 6 : e.target.value === 'fxweek' ? 1 : 3 })}>
              <option value="fxweek">Currency moves in a week</option><option value="market">Price moves in a day</option><option value="quake">Earthquake above magnitude</option>
              <option value="keyword">Keyword in a development</option><option value="country">Unusual activity in a country</option><option value="category">Topic (2+ outlets)</option></select>
            {(form.type === 'market' || form.type === 'fxweek') && <select className="input" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })}><option value="">Choose…</option>
              {lt.data?.filter((m) => form.type !== 'fxweek' || m.kind === 'fx').map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>}
            {['quake', 'market', 'fxweek'].includes(form.type) && <input className="input" type="number" step="0.1" min="0.1" value={form.threshold} onChange={(e) => setForm({ ...form, threshold: Number(e.target.value) })} aria-label="Threshold" />}
            {form.type === 'keyword' && <input className="input" placeholder="e.g. sanctions" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />}
            {form.type === 'country' && <input className="input" placeholder="Country code, e.g. IN" maxLength={2} value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />}
            {form.type === 'category' && <select className="input" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })}><option value="">Choose…</option>{Object.entries(CAT).map(([k, x]) => <option key={k} value={k}>{x.label}</option>)}</select>}
          </div>
          <div className="row" style={{ marginTop: 10 }}>
            <button type="button" className="btn" disabled={form.type !== 'quake' && !form.value} onClick={addRule}>Add alert</button>
            {'Notification' in window && Notification.permission !== 'granted' && <button type="button" className="btn ghost" onClick={() => Notification.requestPermission().then(() => setSt(readStore()))}>Enable notifications</button>}
          </div>
          <h3 style={{ marginTop: 16 }}>Your alerts</h3>
          <div className="list">{st.rules.map((r) => <div key={r.id} className="item" style={{ alignItems: 'center' }}><div style={{ flex: 1 }}><b>{r.name}</b></div><button type="button" className="btn ghost" onClick={() => save({ ...st, rules: st.rules.filter((x) => x.id !== r.id) })}>Remove</button></div>)}</div>
          {!st.rules.length && <Empty>No alerts yet.</Empty>}
        </div>
      </div>
      <div className="card" style={{ marginTop: 14 }}>
        <div className="card-head"><h3>Alert history</h3>{st.fired.length > 0 && <button type="button" className="btn ghost" onClick={() => save({ ...st, fired: [] })}>Clear</button>}</div>
        <div className="list">{st.fired.map((f) => <div key={f.key} className="item"><div><div className="t"><a href={`#${f.link}`}>{f.text}</a></div><div className="m"><Badge tone="b-acc">{f.rule}</Badge><span>{ago(f.at)}</span></div></div></div>)}</div>
        {!st.fired.length && <Empty>Nothing has matched your alerts yet.</Empty>}
      </div>
    </>
  )
}
