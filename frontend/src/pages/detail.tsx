import { useMemo, useState } from 'react'
import { DotMap, LineChart, StackedBars } from '../components/charts'
import { CatLabel, Chips, DownloadButton, Empty, ErrorBox, FilterBar, LearnLinks, Loading, measure, PageHead, ShareButton, SignalItem, sigIcon, Stat, useCountries, ReportButton, FollowButton } from '../components/ui'
import type { Article, EventDetail as ED, History, Signal } from '../data'
import { StoryFacts, TOPIC_PLAIN } from '../components/story'
import { ExplainButton } from '../components/explain'
import { useData } from '../data'
import { t } from '../i18n'
import { useFilters } from '../store'
import { Badge, cat, evidenceLabel, Ext, flag, fmtDate, hoursSince, num, pct, SIG_STATUS, VERIF } from '../util'

const REL: Record<string, string> = { same_event: 'Same event', follow_up: 'Possible follow-up', shared_location: 'Same location', shared_organization: 'Same organization',
  shared_country: 'Same country & topic', reported_consequence: 'Reported consequence', possible_context: 'Possible context' }

export function EventDetail({ id }: { id: string }) {
  const { data: e, error } = useData<ED>(`events/${encodeURIComponent(id)}.json`)
  const [view, setView] = useState<'timeline' | 'sources'>('timeline')
  const { by } = useCountries()
  if (error) return <Empty>This development is no longer in the published 7-day window.</Empty>
  if (!e) return <Loading rows={6} />
  const byPublisher = new Map<string, typeof e.timeline>()
  e.timeline.forEach((a) => { const k = a.p || 'Unknown'; byPublisher.set(k, [...(byPublisher.get(k) || []), a]) })
  return (
    <>
      <header className="story-head">
        <div className="story-head-top">
          <CatLabel c={e.category} />
          <span className="head-actions"><FollowButton e={e} /><ShareButton title={e.title} path={`/event/${e.id}`} /><ReportButton title={e.title} path={`/event/${e.id}`} /></span>
        </div>
        <h2>{e.title}</h2>
        <StoryFacts e={e} names={by} />
        <p className="small muted" style={{ margin: '10px 0 14px' }}>{VERIF[e.verification]?.tip}</p>
        <ExplainButton e={e} names={by} />
      </header>
      <div className="grid g2">
        <div className="card"><h3>Details</h3>
          <div className="bg-panel" style={{ marginTop: 6, marginBottom: 10 }}><div className="bg-row"><span className="bg-k">💡 In simple words</span><span>{TOPIC_PLAIN[e.category] || TOPIC_PLAIN.general} {VERIF[e.verification]?.tip}</span></div></div>
          {e.description && <p className="muted">{e.description}</p>}
          <dl className="kv">
            <dt>Countries</dt><dd>{e.countries.length ? e.countries.map((c) => <a key={c} href={`#/country/${c}`} style={{ marginRight: 8 }}>{flag(c)} {by[c]?.name || c}</a>) : 'not identified'}</dd>
            <dt>First reported</dt><dd>{fmtDate(e.started_at)}</dd><dt>Latest report</dt><dd>{fmtDate(e.last_updated)}</dd>
            <dt>Based on</dt><dd>{e.origin === 'news_cluster' ? 'News reports' : e.origin === 'usgs' ? 'US Geological Survey measurements' : e.origin === 'gdacs' ? 'Global Disaster Alert system' : e.origin}</dd>
            {e.magnitude != null && <><dt>Magnitude</dt><dd>{e.magnitude}</dd></>}
            {e.why?.length > 0 && <><dt>Topic keywords</dt><dd>{e.why.map((w) => <Badge key={w}>{w}</Badge>)}</dd></>}
            {e.revisions.length > 0 && <><dt>Updated</dt><dd>details corrected {e.revisions.map((r) => fmtDate(r.changed_at)).join(', ')}</dd></>}
          </dl>
          <LearnLinks text={e.title} />
        </div>
        <div className="card">
          <div className="card-head"><h3>{t('Sources')} — {e.outlets} outlet{e.outlets === 1 ? '' : 's'}</h3></div>
          {e.timeline.length > 0 && <div style={{ margin: '6px 0 10px' }}><Chips value={view} onChange={setView} options={[{ v: 'timeline', label: `🕒 ${t('Timeline')}` }, { v: 'sources', label: '📰 Same story, different sources' }]} /></div>}
          {e.timeline.length === 0 ? (
            <ol className="ref-list">{e.refs.map((r, i) => <li key={i}><Ext href={r.u}>{r.t}</Ext> <span className="faint">— {r.p}{r.d ? `, ${fmtDate(r.d)}` : ''}</span></li>)}</ol>
          ) : view === 'timeline' ? (
            <div className="list" style={{ borderLeft: '2px solid var(--border)', paddingLeft: 12 }}>
              {e.timeline.map((a, i) => (
                <div key={i} className="item" style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: -19, top: 16, width: 10, height: 10, borderRadius: 5, background: i === 0 ? 'var(--accent)' : 'var(--border)' }} />
                  <div><div className="small faint">{fmtDate(a.d)}{i === 0 ? ' · first report' : ''}</div><div className="t" style={{ fontSize: 14 }}><Ext href={a.u}>{a.t}</Ext></div>
                    <div className="m"><span>{a.p}</span>{a.o && <Badge tone="b-info">Official</Badge>}{a.dup && <Badge>duplicate copy</Badge>}</div></div>
                </div>
              ))}
            </div>
          ) : (
            <div>
              <p className="small muted">How each outlet headlined this story. Compare wording; WorldPulse does not decide which is right.</p>
              {[...byPublisher.entries()].map(([p, arts]) => (
                <div key={p} style={{ margin: '10px 0' }}><b className="small">{p}</b>
                  {arts.map((a, i) => <div key={i} className="small" style={{ margin: '3px 0 0 8px' }}>“<Ext href={a.u}>{a.t}</Ext>” <span className="faint">{fmtDate(a.d)}</span></div>)}</div>
              ))}
            </div>
          )}
          {e.outlets > 1 && <div className="small faint" style={{ marginTop: 8 }}>Several outlets can repeat one original report; this is not independent confirmation.</div>}
        </div>
      </div>
      <div className="card" style={{ marginTop: 14 }}><h3>🔗 {t('Related developments')}</h3>
        <p className="sub">Each link is labelled as an observed shared fact or a hypothesis. Happening close in time never proves one caused the other.</p>
        {e.related.length ? <div className="list">{e.related.map((r) => (
          <div key={r.to + r.type} className="item"><div>
            <div className="row small"><Badge tone={r.observed ? 'b-info' : 'b-warn'}>{r.observed ? 'Observed link' : 'Hypothesis'}</Badge><b>{REL[r.type] || r.type}</b><span className="faint">confidence {Math.round(r.confidence * 100)}%</span></div>
            <div className="t" style={{ marginTop: 4 }}><a href={`#/event/${encodeURIComponent(r.to)}`}>{r.title}</a></div><div className="small faint">{r.evidence}</div></div></div>))}</div>
          : <Empty>No related developments detected.</Empty>}
      </div>
    </>
  )
}

const TYPES: Record<string, string> = { all: 'All', market: 'Markets', fx: 'Currencies', news_volume: 'News coverage', topic_volume: 'Reporting topics', internet: 'Internet', disaster_alert: 'Disaster alerts', earthquake: 'Earthquakes', quake_cluster: 'Quake clusters' }

export function Signals() {
  const { data, error } = useData<{ signals: Signal[] }>('signals.json')
  const hist = useData<History>('history.json')
  const [tp, setTp] = useState('all')
  const [weak, setWeak] = useState(false)
  const f = useFilters()
  const { regionOf } = useCountries()
  if (error) return <ErrorBox error={error} />
  if (!data) return <Loading />
  const counts = data.signals.reduce<Record<string, number>>((a, s) => ({ ...a, [s.signal_type]: (a[s.signal_type] || 0) + 1 }), {})
  const all = data.signals.filter((s) => (tp === 'all' || s.signal_type === tp) && (!f.country || s.country === f.country) && (!f.region || regionOf(s.country) === f.region))
  const strong = all.filter((s) => s.confidence !== 'low')
  const list = weak ? all : strong
  const days = hist.data ? [...new Set(hist.data.signals_per_day.map((r) => r[0]))].sort().slice(-30) : []
  const types = hist.data ? [...new Set(hist.data.signals_per_day.map((r) => r[1]))] : []
  return (
    <>
      <PageHead title={`⚡ ${t('Signals')}`} sub="Numbers that suddenly moved far from normal — prices, news volume, internet access, earthquakes. A warning light, not a prediction."
        actions={<DownloadButton name="signals" rows={() => list.map((s) => ({ detected: s.detected_at, type: s.signal_type, title: s.title, country: s.country, observed: s.observed, baseline: s.baseline, pct_change: s.pct_change, confidence: s.confidence, data_as_of: s.data_freshness, limitations: s.limitations }))} />} />
      <div style={{ marginBottom: 12 }}><Chips scroll value={tp} onChange={setTp} options={Object.entries(TYPES).filter(([k]) => k === 'all' || counts[k]).map(([v, l]) => ({ v, label: `${v !== 'all' ? sigIcon(v) + ' ' : ''}${l}${v !== 'all' ? ` (${counts[v]})` : ''}` }))} /></div>
      <div className="grid g2">
        <div className="card"><h3>Detections (30 days)</h3>
          {!weak && <p className="sub">Showing the {strong.length} with good evidence.</p>}
          <div className="list">{list.map((s) => <SignalItem key={s.id} s={s} />)}</div>{!list.length && <Empty>No strong signals for this selection.</Empty>}
          {all.length > strong.length && <button type="button" className="icon-btn more-btn" onClick={() => setWeak(!weak)}>{weak ? 'Show only strong evidence' : `Show ${all.length - strong.length} weaker signals too`}</button>}</div>
        <div className="card"><h3>Signal history</h3><p className="sub">Detections per day by type.</p>
          <StackedBars days={days} stacks={types.map((x, i) => ({ name: TYPES[x] || x, color: `var(--c${(i % 8) + 1})`, values: days.map((d) => hist.data!.signals_per_day.find((r) => r[0] === d && r[1] === x)?.[2] || 0) }))} /></div>
      </div>
    </>
  )
}

export function SignalDetail({ id }: { id: string }) {
  const { data, error } = useData<{ signals: Signal[] }>('signals.json')
  const hist = useData<History>('history.json')
  if (error) return <ErrorBox error={error} />
  if (!data) return <Loading />
  const s = data.signals.find((x) => x.id === id)
  if (!s) return <Empty>This signal is no longer in the published 30-day window.</Empty>
  const st = SIG_STATUS[s.status]
  const vol = s.signal_type === 'news_volume' && s.country ? hist.data?.country_volume[s.country] : undefined
  return (
    <>
      <PageHead title={`${sigIcon(s.signal_type)} ${s.title}`} sub={<span className="row"><Badge tone={st?.tone}>{st?.label}</Badge><span className="small">{st?.tip}</span></span>} actions={<ShareButton title={s.title} path={`/signal/${s.id}`} />} />
      <div className="grid g4" style={{ marginBottom: 14 }}>
        <Stat label="Now" value={num(s.observed, 2)} note={s.unit || ''} />
        <Stat label="Normally" value={num(s.baseline, 2)} note="recent typical level" />
        <Stat label="Change" value={pct(s.pct_change)} note={s.deviation != null ? (Math.abs(s.deviation) >= 4 ? 'very unusual' : 'unusual') : ''} />
        <Stat label="Evidence" value={evidenceLabel(s.confidence)} note={`data from ${fmtDate(s.data_freshness, false)}`} />
      </div>
      <div className="grid g2">
        <div className="card"><h3>Supporting evidence</h3><p className="sub">{measure(s)}</p>
          <div className="list">{s.evidence.map((e, i) => (
            <div key={i} className="item"><div><div className="t"><Ext href={e.url}>{e.title}</Ext></div>
              <div className="m">{e.type === 'dataset' ? <Badge tone="b-info">dataset</Badge> : <Badge>article</Badge>}{e.publisher && <span>{e.publisher}</span>}{e.published_at && <span>{fmtDate(e.published_at)}</span>}</div>
              {e.detail && <div className="small faint" style={{ marginTop: 4, wordBreak: 'break-word' }}>{e.detail}</div>}</div></div>))}</div></div>
        <div className="card"><h3>Good to know</h3><p className="muted">{s.limitations}</p>
          {vol && <><h3 style={{ marginTop: 12 }}>Coverage over 30 days</h3><LineChart series={[{ name: 'Articles', color: 'var(--c1)', points: vol }]} height={200} /></>}</div>
      </div>
    </>
  )
}

export function News() {
  const { data, error } = useData<{ articles: Article[]; duplicates_removed: number; duplicate_methods: Record<string, number> }>('news.json')
  const f = useFilters()
  const { regionOf } = useCountries()
  const [lang, setLang] = useState('all')
  const rows = useMemo(() => {
    const q = f.q.toLowerCase()
    return (data?.articles || []).filter((a) => (lang === 'all' || (a.l || 'en') === lang) && (!f.country || a.k.includes(f.country)) && (!f.region || a.k.some((k) => regionOf(k) === f.region)) &&
      hoursSince(a.d) <= f.hours && (!q || a.t.toLowerCase().includes(q)))
  }, [data, f, lang, regionOf])
  if (error) return <ErrorBox error={error} />
  return (
    <>
      <PageHead title={`📰 ${t('All news')}`} sub="Every headline from the last 3 days, duplicates removed. Tap one to read it on the original site."
        actions={<DownloadButton name="headlines" rows={() => rows.map((a) => ({ published: a.d, headline: a.t, publisher: a.p, topic: cat(a.c).label, countries: a.k.join(' '), language: a.l, url: a.u }))} />} />
      <FilterBar hideFocus />
      <div style={{ marginBottom: 10 }}><Chips value={lang} onChange={setLang} options={[{ v: 'all', label: 'All languages' }, { v: 'en', label: 'English' }, { v: 'hi', label: 'हिन्दी' }]} /></div>
      {!data ? <Loading /> : (
        <div className="card">
          <div className="small muted" style={{ marginBottom: 6 }}>{data.duplicates_removed} duplicate copies removed in 72 h ({Object.entries(data.duplicate_methods).map(([k, n]) => `${n} by ${k.replace('_', ' ')}`).join(', ') || 'none'}).</div>
          <div className="list">{rows.slice(0, 300).map((a) => (
            <div className="item" key={a.id}><div className="cat-bar" style={{ background: cat(a.c).color }} />
              <div style={{ minWidth: 0 }}><div className="t"><Ext href={a.u}>{a.t}</Ext></div>
                <div className="m"><span>{a.p}</span><span>{fmtDate(a.d)}</span><span style={{ color: cat(a.c).color }}>{cat(a.c).label}</span>
                  {a.w && a.w.length > 0 && <span className="faint" title={t('Why this topic')}>🏷 {a.w.join(', ')}</span>}
                  {a.k.map((k) => <a key={k} href={`#/country/${k}`} className="muted">{flag(k)} {k}</a>)}{a.o && <Badge tone="b-info">Official</Badge>}</div></div></div>))}</div>
          {!rows.length && <Empty>{t('Nothing matches these filters.')}</Empty>}
          {rows.length > 300 && <div className="small faint">Showing 300 of {rows.length}. Narrow the filters to see more.</div>}
        </div>
      )}
    </>
  )
}

export function Quakes() {
  const { data, error } = useData<{ quakes: (string | number | null)[][]; note: string; source: string }>('quakes.json')
  const hist = useData<History>('history.json')
  const [min, setMin] = useState<'2.5' | '4.5' | '6'>('4.5')
  if (error) return <ErrorBox error={error} />
  if (!data) return <Loading />
  const qs = data.quakes.filter((q) => (q[2] as number) >= Number(min))
  const day = data.quakes.filter((q) => hoursSince(q[1] as string) < 24)
  const hd = hist.data?.quakes_per_day.slice(-30) || []
  return (
    <>
      <PageHead title={`🌋 ${t('Earthquakes')}`} sub={`${data.source}. ${data.note} Magnitudes and locations can be revised after an event.`} />
      <div className="grid g4" style={{ marginBottom: 14 }}>
        <Stat label="Last 24 hours" value={day.length} note="M2.5+ worldwide" />
        <Stat label="M4.5+ last 24 h" value={day.filter((q) => (q[2] as number) >= 4.5).length} />
        <Stat label="M6+ in 30 days" value={data.quakes.filter((q) => (q[2] as number) >= 6).length} />
        <Stat label="Strongest (7 days)" value={`M${Math.max(0, ...data.quakes.filter((q) => hoursSince(q[1] as string) < 168).map((q) => q[2] as number))}`} />
      </div>
      <div className="grid g2" style={{ marginBottom: 14 }}>
        <div className="card"><h3>Map</h3><DotMap points={qs.map((q) => ({ lat: q[4] as number, lon: q[5] as number, r: Math.max(1.5, ((q[2] as number) - 2) * 2), color: (q[2] as number) >= 6 ? 'var(--c7)' : '#ea580c', label: `M${q[2]} — ${q[3]}` }))} /></div>
        <div className="card"><h3>Per day</h3><StackedBars days={hd.map((r) => r[0])} stacks={[{ name: 'M2.5–4.5', color: 'var(--c3)', values: hd.map((r) => r[1]) }, { name: 'M4.5–6', color: '#ea580c', values: hd.map((r) => r[2]) }, { name: 'M6+', color: 'var(--c7)', values: hd.map((r) => r[3]) }]} /></div>
      </div>
      <div className="card"><div className="row spread"><h3>Event list</h3><Chips value={min} onChange={setMin} options={[{ v: '2.5', label: 'M2.5+' }, { v: '4.5', label: 'M4.5+' }, { v: '6', label: 'M6+' }]} /></div>
        <div className="table-wrap" style={{ marginTop: 8 }}><table><thead><tr><th>Time</th><th style={{ textAlign: 'right' }}>Mag.</th><th>Place</th></tr></thead>
          <tbody>{qs.slice(0, 300).map((q) => <tr key={q[0] as string}><td>{fmtDate(q[1] as string)}</td><td className="num"><b>{q[2]}</b></td><td><Ext href={q[10] as string}>{q[3]}</Ext></td></tr>)}</tbody></table></div></div>
    </>
  )
}
