import { useMemo, useRef, useState } from 'react'
import { LEVEL_COLOR, levelColor, levelOf, StressGauge, type Stress } from '../components/stress'
import { Empty, ErrorBox, Loading, PageHead, ShareButton, useCountries } from '../components/ui'
import { useData } from '../data'
import { flag, fmtDate } from '../util'
import { readMe } from './impact'

export function StressPage() {
  const { data, error } = useData<Stress>('stress.json')
  const { by } = useCountries()
  const home = readMe()?.home
  const [view, setView] = useState<string>('world')
  const [open, setOpen] = useState<string | null>(null)
  if (error) return <ErrorBox error={error} />
  if (!data) return <Loading rows={6} />
  if (!data.available) return <Empty>The World Stress Index will appear after the next data update.</Empty>
  const country = view !== 'world' ? data.countries[view] : null
  const score = country ? country.score : data.today.score
  const lvl = country ? country.level : data.today.level
  const col = LEVEL_COLOR[lvl]
  const used = data.components.filter((c) => c.score != null)
  const top = [...used].sort((a, b) => b.score! - a.score!).slice(0, 3)
  const calm = used.filter((c) => c.score! < 40).map((c) => `${c.icon} ${c.label.toLowerCase()}`)
  const ranked = Object.entries(data.countries).filter(([, c]) => c.parts.length >= 3).sort((a, b) => b[1].score - a[1].score)
  const allCountries = Object.entries(data.countries).sort((a, b) => (by[a[0]]?.name || a[0]).localeCompare(by[b[0]]?.name || b[0]))
  const choices = [...new Set([home, 'IN', 'US', 'CN', 'GB'].filter(Boolean) as string[])].filter((c) => data.countries[c]).slice(0, 4)
  return (
    <>
      <PageHead title="🌡️ World Stress Index" sub="One number for how tense the world is today — compared with the past year. It measures; it does not predict."
        actions={<ShareButton title={`World Stress today: ${data.today.score} (${data.today.level})`} path="/stress" />} />

      <div className="stress-hero" style={{ ['--lvl' as string]: col }}>
        <div className="sh-top">
          <div className="chips">
            <button type="button" className={`chip ${view === 'world' ? 'on' : ''}`} onClick={() => setView('world')}>🌍 World</button>
            {choices.map((c) => <button key={c} type="button" className={`chip ${view === c ? 'on' : ''}`} onClick={() => setView(c)}>{flag(c)} {by[c]?.name || c}</button>)}
            <select className="input sh-sel" aria-label="Pick a country" value={view !== 'world' && !choices.includes(view) ? view : ''} onChange={(e) => e.target.value && setView(e.target.value)}>
              <option value="">More countries…</option>{allCountries.map(([iso]) => <option key={iso} value={iso}>{flag(iso)} {by[iso]?.name || iso}</option>)}</select>
          </div>
        </div>
        <div className="sh-main" key={view}>
          <StressGauge score={score} size={280} />
          <div className="sh-side">
            <div className="sh-title">{country ? `${flag(view)} ${by[view]?.name || view}` : '🌍 The world'} today</div>
            {!country && data.today.delta7 != null && <div className={`sh-delta ${data.today.delta7 > 0 ? 'up' : 'dn'}`}>{data.today.delta7 > 0 ? '▲' : data.today.delta7 < 0 ? '▼' : '•'} {Math.abs(data.today.delta7)} since last week</div>}
            <p className="sh-say">{say(score)}</p>
            <div className="small muted">{fmtDate(data.today.date, false)} · {country ? `${country.parts.length} measures` : `${data.today.ingredients_used} of 7 ingredients`}</div>
          </div>
        </div>
      </div>

      {!country ? <>
        <h3 className="section-title st-h">What’s pushing it today</h3>
        <div className="drivers">{top.map((c, i) => (
          <button key={c.key} type="button" className={`driver ${open === c.key ? 'open' : ''}`} onClick={() => setOpen(open === c.key ? null : c.key)} style={{ animationDelay: `${i * 0.08}s` }}>
            <div className="dr-row"><span className="dr-name">{c.icon} {c.label}</span><b style={{ color: levelColor(c.score!) }}>{c.score}</b></div>
            <div className="dr-bar"><i style={{ width: `${c.score}%`, background: levelColor(c.score!) }} /></div>
            <div className="dr-more">{c.text} <a href={`#${c.link}`} onClick={(e) => e.stopPropagation()}>See more →</a></div>
          </button>))}</div>
        {calm.length > 0 && <p className="st-calm">😌 Calm today: {calm.join(', ')}</p>}

        <h3 className="section-title st-h">The past 12 months</h3>
        <div className="card"><StressChart history={data.history} /></div>

        <h3 className="section-title st-h">All 7 ingredients</h3>
        <div className="ingr">{data.components.map((c) => (
          <div key={c.key} className={`ing ${c.score == null ? 'off' : ''}`}>
            <div className="ing-top"><span>{c.icon}</span><b>{c.score ?? '—'}</b></div>
            <div className="ing-name">{c.label}</div>
            <div className="dr-bar"><i style={{ width: `${c.score ?? 0}%`, background: c.score != null ? levelColor(c.score) : 'transparent' }} /></div>
            <div className="small muted ing-t">{c.text}</div>
            <div className="small faint">Weight {c.weight}%</div>
          </div>))}</div>
      </> : (
        <div className="card" style={{ marginTop: 14 }}>
          <h3>What makes up {by[view]?.name || view}’s score</h3>
          <div className="drivers" style={{ marginTop: 10 }}>{country.parts.map(([name, v]) => (
            <div key={name} className="driver static"><div className="dr-row"><span className="dr-name">{name}</span><b style={{ color: levelColor(v) }}>{v}</b></div><div className="dr-bar"><i style={{ width: `${v}%`, background: levelColor(v) }} /></div></div>))}</div>
          <a className="btn ghost" href={`#/country/${view}`} style={{ marginTop: 12, display: 'inline-flex' }}>Open {by[view]?.name || view} →</a>
        </div>
      )}

      <h3 className="section-title st-h">Most stressed countries now</h3>
      <div className="card">{ranked.slice(0, 10).map(([iso, c], i) => (
        <button key={iso} type="button" className="rank-row" onClick={() => { setView(iso); scrollTo({ top: 0, behavior: 'smooth' }) }}>
          <span className="rk">{i + 1}</span><span className="rk-name">{flag(iso)} {by[iso]?.name || iso}</span>
          <span className="rk-bar"><i style={{ width: `${c.score}%`, background: LEVEL_COLOR[c.level] }} /></span><b style={{ color: LEVEL_COLOR[c.level] }}>{c.score}</b>
        </button>))}
        <a href="#/map" className="small" style={{ display: 'inline-block', marginTop: 8 }}>See it on the world map →</a></div>

      <details className="card st-method">
        <summary><b>How is this calculated?</b></summary>
        <p className="small">{data.method}</p>
        <ul className="small">{data.components.map((c) => <li key={c.key}>{c.icon} <b>{c.label}</b> — weight {c.weight}%{c.score == null ? ' (not counted today: history still building)' : ` · ${c.days} days of history`}</li>)}</ul>
        <p className="small">Levels: {data.levels.map(([lim, name], i) => `${name} ${i ? data.levels[i - 1][0] : 0}–${Math.min(100, lim - 1)}`).join(' · ')}</p>
        <p className="small muted">Country scores are simpler: risk level, how much more news there is about the country than usual, its currency’s swing and internet outages.</p>
      </details>
    </>
  )
}

function say(v: number) {
  const l = levelOf(v)
  return { Calm: 'Quieter than usual. Few unusual moves in markets, news or disasters.', Normal: 'An ordinary day by this year’s standards.',
    Elevated: 'Somewhat tense — a few things are moving more than usual.', High: 'Tense — several measures are well above their normal range.',
    Extreme: 'Very tense — among the most unusual days of the year.' }[l]
}

function StressChart({ history }: { history: [string, number][] }) {
  const W = 720, H = 220, P = 26
  const [hover, setHover] = useState<number | null>(null)
  const ref = useRef<SVGSVGElement>(null)
  // the line shows a 7-day average (easier to read); the reading shows that day's own score
  const pts = useMemo(() => history.map(([d, v], i) => {
    const win = history.slice(Math.max(0, i - 6), i + 1)
    const avg = win.reduce((a, x) => a + x[1], 0) / win.length
    return [P + (i / Math.max(1, history.length - 1)) * (W - 2 * P), H - P - (avg / 100) * (H - 2 * P), v, d] as const
  }), [history])
  if (pts.length < 2) return <Empty>Not enough history yet.</Empty>
  const line = 'M' + pts.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' L')
  const area = `${line} L${pts[pts.length - 1][0]} ${H - P} L${pts[0][0]} ${H - P}Z`
  const bands: [number, number, string][] = [[0, 30, 'Calm'], [30, 50, 'Normal'], [50, 65, 'Elevated'], [65, 80, 'High'], [80, 100, 'Extreme']]
  const y = (v: number) => H - P - (v / 100) * (H - 2 * P)
  const move = (cx: number) => {
    const r = ref.current!.getBoundingClientRect()
    const x = ((cx - r.left) / r.width) * W
    setHover(Math.max(0, Math.min(pts.length - 1, Math.round(((x - P) / (W - 2 * P)) * (pts.length - 1)))))
  }
  const h = hover != null ? pts[hover] : pts[pts.length - 1]
  const peak = pts.reduce((a, b) => (b[2] > a[2] ? b : a))
  return (
    <div className="st-chart">
      <div className="stc-read"><b style={{ color: levelColor(h[2]) }}>{Math.round(h[2])}</b> <span className="sg-lvl" style={{ background: levelColor(h[2]) }}>{levelOf(h[2])}</span> <span className="muted small">{fmtDate(h[3], false)}</span></div>
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} width="100%" onMouseMove={(e) => move(e.clientX)} onMouseLeave={() => setHover(null)}
        onTouchStart={(e) => move(e.touches[0].clientX)} onTouchMove={(e) => move(e.touches[0].clientX)} style={{ touchAction: 'pan-y' }}>
        <defs><linearGradient id="stfill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="var(--accent)" stopOpacity=".35" /><stop offset="1" stopColor="var(--accent)" stopOpacity="0" /></linearGradient></defs>
        {bands.map(([a, b, n]) => <rect key={n} x={P} width={W - 2 * P} y={y(b)} height={y(a) - y(b)} fill={LEVEL_COLOR[n]} opacity=".07" />)}
        {[30, 50, 65, 80].map((t) => <line key={t} x1={P} x2={W - P} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeDasharray="3 4" />)}
        <path d={area} fill="url(#stfill)" />
        <path d={line} fill="none" stroke="var(--accent)" strokeWidth="2.6" strokeLinejoin="round" className="stc-line" pathLength={1} />
        <circle cx={peak[0]} cy={peak[1]} r="4" fill={levelColor(peak[2])} />
        <text x={Math.min(W - 90, peak[0] + 6)} y={peak[1] - 6} className="stc-lbl">Peak {Math.round(peak[2])} · {fmtDate(peak[3], false)}</text>
        <line x1={h[0]} x2={h[0]} y1={P / 2} y2={H - P} stroke="var(--muted)" strokeDasharray="2 3" />
        <circle cx={h[0]} cy={h[1]} r="6" fill="var(--panel)" stroke={levelColor(h[2])} strokeWidth="3" />
        <text x={P} y={H - 6} className="stc-lbl">{fmtDate(pts[0][3], false)}</text>
        <text x={W - P} y={H - 6} className="stc-lbl" textAnchor="end">today</text>
      </svg>
      <div className="small faint">Line: 7-day average. Touch or move over the chart to read any day’s own score. Shaded bands show the levels.</div>
    </div>
  )
}
