import { useMemo } from 'react'
import { Sparkline } from '../components/charts'
import { StoryCard } from '../components/story'
import { Empty, ErrorBox, Loading, PageHead, ShareButton, useCountries, VerifBadge } from '../components/ui'
import type { Event, Wiki } from '../data'
import { useData } from '../data'
import { Ext, flag, fmtDate } from '../util'

// "Explain the conflict": one page per long-running crisis, assembled from stored records —
// quoted Wikipedia background, weekly key moments, who is named in the reports, the countries
// involved and this week's best-supported stories.

type Moment = { id: string | null; title: string; date: string; url?: string | null; publisher?: string | null; outlets: number; verification: string }
type Crisis = {
  key: string; title: string; countries: string[]; background: Wiki | null; stories_7d: number; stories_45d: number
  weekly: [string, number][]; moments: Moment[]; latest: string[]; who: { name: string; kind: string; reports: number }[]; where: [string, number][]
}
type Crises = { generated_at: string; note: string; conflicts: Crisis[] }

const ICON: Record<string, string> = { ukraine: '🇺🇦', gaza: '🕊️', redsea: '🚢', iran: '🛢️', taiwan: '🌊', korea: '🚀', sudan: '🏜️', myanmar: '⛰️', congo: '⛏️', indopak: '🏔️', sahel: '🌍', haiti: '🏝️' }

/** Complete weeks only — the current week has just started, so comparing it would always look like "less". */
const fullWeeks = (c: Crisis) => c.weekly.filter((w) => Date.now() - new Date(w[0] + 'T00:00:00Z').getTime() >= 7 * 864e5)
function trend(c: Crisis) {
  const w = fullWeeks(c).map((x) => x[1])
  if (w.length < 2) return ''
  const [a, b] = [w[w.length - 2], w[w.length - 1]]
  return b > a * 1.3 ? '↑ more news than last week' : b < a * 0.7 ? '↓ less news than last week' : '→ about the same as last week'
}

export function Crises() {
  const { data, error } = useData<Crises>('conflicts.json')
  if (error) return <ErrorBox error={error} />
  if (!data) return <Loading rows={6} />
  const active = data.conflicts.filter((c) => c.stories_7d > 0)
  const quiet = data.conflicts.filter((c) => c.stories_7d === 0)
  return (
    <>
      <PageHead title="🧭 Big conflicts, explained" sub="The world’s long-running wars and crises — how they started, what happened recently and who is involved, in simple words." />
      <div className="crisis-grid">
        {active.map((c) => (
          <a key={c.key} href={`#/explain/${c.key}`} className="crisis-card">
            <div className="cc-top"><span className="cc-icon">{ICON[c.key] || '📍'}</span><span className="cc-flags">{c.countries.map((x) => flag(x)).join(' ')}</span></div>
            <b className="cc-title">{c.title}</b>
            <span className="cc-meta">{c.stories_7d} stories in the last 7 days{trend(c) ? ` · ${trend(c)}` : ''}</span>
            {fullWeeks(c).length > 2 && <Sparkline values={fullWeeks(c).map((w) => w[1])} width={140} height={26} color="var(--bad)" />}
            {c.background && <span className="cc-bg">{c.background.extract.split(/(?<=\.)\s/)[0]}</span>}
            <span className="cc-go">Explain it →</span>
          </a>
        ))}
      </div>
      {quiet.length > 0 && <div className="card" style={{ marginTop: 14 }}><h3>Quiet this week</h3><div className="chips wrap" style={{ marginTop: 8 }}>{quiet.map((c) => <a key={c.key} className="chip" href={`#/explain/${c.key}`}>{ICON[c.key]} {c.title}</a>)}</div></div>}
      <p className="small faint" style={{ marginTop: 10 }}>{data.note}</p>
    </>
  )
}

export function CrisisPage({ id }: { id: string }) {
  const { data, error } = useData<Crises>('conflicts.json')
  const ev = useData<{ events: Event[] }>('events.json')
  const { by } = useCountries()
  const c = data?.conflicts.find((x) => x.key === id)
  const latest = useMemo(() => (c && ev.data ? c.latest.map((i) => ev.data!.events.find((e) => e.id === i)).filter(Boolean) as Event[] : []), [c, ev.data])
  if (error) return <ErrorBox error={error} />
  if (!data) return <Loading rows={6} />
  if (!c) return <Empty>We don’t have an explainer called “{id}”. <a href="#/explain">See all conflicts</a>.</Empty>
  const maxW = Math.max(1, ...c.weekly.map((w) => w[1]))
  return (
    <>
      <div className="crisis-hero">
        <div className="row spread"><a href="#/explain" className="small" style={{ color: 'rgba(255,255,255,.85)' }}>← All conflicts</a><ShareButton title={`${c.title} — explained`} path={`/explain/${c.key}`} /></div>
        <div className="ch-icon">{ICON[c.key] || '📍'}</div>
        <h2>{c.title}</h2>
        <div className="facts">
          {c.countries.map((x) => <a key={x} className="fact" href={`#/country/${x}`}>{flag(x)} {by[x]?.name || x}</a>)}
          <span className="fact">📰 {c.stories_7d} stories this week</span>
          {trend(c) && <span className="fact">{trend(c)}</span>}
        </div>
      </div>

      <div className="grid g2" style={{ marginTop: 14 }}>
        <div className="card">
          <h3>📖 How it started</h3>
          {c.background ? <>
            <blockquote className="ex-quote" style={{ marginTop: 8 }}>{c.background.extract}</blockquote>
            <div className="ex-note"><Ext href={c.background.url}>From Wikipedia — “{c.background.title}” (CC BY-SA) ↗</Ext></div>
          </> : <p className="sub">Background is not available yet. It is added automatically on the next update.</p>}
        </div>
        <div className="card">
          <h3>👥 Who is involved</h3>
          <p className="sub">People and groups most often named in this week’s reports.</p>
          {c.who.length ? <div className="chips wrap" style={{ marginTop: 8 }}>{c.who.map((w) => <a key={w.name} className="chip" href={`#/search?q=${encodeURIComponent(w.name)}`}>{w.kind === 'person' ? '👤' : '🏛️'} {w.name} <span className="faint">· {w.reports}</span></a>)}</div>
            : <p className="small muted">Not enough reports this week to list names.</p>}
          {c.where.length > 0 && <>
            <h4 className="ex-h" style={{ marginTop: 14 }}>🌍 Countries in this week’s reports</h4>
            <div className="chips wrap">{c.where.map(([iso, n]) => <a key={iso} className="chip" href={`#/country/${iso}`}>{flag(iso)} {by[iso]?.name || iso} <span className="faint">· {n}</span></a>)}</div>
          </>}
        </div>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <h3>🗓️ Key moments, week by week</h3>
        <p className="sub">The most widely reported story of each week (WorldPulse records go back up to 45 days).</p>
        {c.moments.length ? <div className="timeline" style={{ marginTop: 10 }}>{[...c.moments].reverse().map((m, i) => {
          const wk = c.weekly.find((w) => m.date.slice(0, 10) >= w[0])
          return (
            <div key={i} className="tl-item">
              <div className="tl-date">{fmtDate(m.date, false)}</div>
              <div className="tl-body">
                {m.id ? <a href={`#/event/${encodeURIComponent(m.id)}`}><b>{m.title}</b></a> : <Ext href={m.url}><b>{m.title}</b></Ext>}
                <div className="small muted">{m.publisher || 'News report'} · {m.outlets} outlet{m.outlets === 1 ? '' : 's'} <VerifBadge v={m.verification} /></div>
              </div>
              {wk && <div className="tl-bar" title={`${wk[1]} stories that week`}><i style={{ width: `${(wk[1] / maxW) * 100}%` }} /></div>}
            </div>
          )
        })}</div> : <Empty>No stories recorded yet.</Empty>}
      </div>

      <h3 className="section-title" style={{ margin: '18px 2px 8px' }}>📰 Latest developments</h3>
      {!ev.data ? <Loading rows={3} /> : latest.length ? <div className="stack">{latest.slice(0, 6).map((e) => <StoryCard key={e.id} e={e} names={by} />)}</div> : <Empty>No confirmed stories this week.</Empty>}
      <p className="small faint" style={{ marginTop: 10 }}>{data.note}</p>
    </>
  )
}
