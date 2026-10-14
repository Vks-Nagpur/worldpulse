import { useEffect, useId, useRef, useState } from 'react'

// World Stress Index visuals: an animated dial, level colours and a compact front-page strip.

export type StressComp = { key: string; icon: string; label: string; score: number | null; weight: number; raw: number | null; days: number; text: string; link: string }
export type Stress = {
  available: boolean; generated_at: string
  today: { date: string; score: number; level: string; delta7: number | null; ingredients_used: number }
  components: StressComp[]; history: [string, number][]
  countries: Record<string, { score: number; level: string; parts: [string, number][] }>
  levels: [number, string][]; method: string
}

export const LEVEL_COLOR: Record<string, string> = { Calm: '#22c55e', Normal: '#3b82f6', Elevated: '#eab308', High: '#f97316', Extreme: '#ef4444' }
export const levelOf = (v: number) => (v < 30 ? 'Calm' : v < 50 ? 'Normal' : v < 65 ? 'Elevated' : v < 80 ? 'High' : 'Extreme')
export const levelColor = (v: number) => LEVEL_COLOR[levelOf(v)]

/** Counts up from 0 to `to` with an ease-out, once per change of `to`. */
export function useCountUp(to: number, ms = 1300) {
  const [v, setV] = useState(0)
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { setV(to); return }
    let raf = 0
    const t0 = performance.now()
    const step = (t: number) => { const p = Math.min(1, (t - t0) / ms); setV(to * (1 - Math.pow(1 - p, 3))); if (p < 1) raf = requestAnimationFrame(step) }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [to, ms])
  return v
}

/** Half-circle dial, green → red, with a marker that glides to the score. */
export function StressGauge({ score, size = 260, label = true }: { score: number; size?: number; label?: boolean }) {
  const id = useId().replace(/:/g, '')
  const v = useCountUp(score)
  const ang = Math.PI * (1 - v / 100) // 180° → 0°
  const r = 110, cx = 130, cy = 130
  const mx = cx + r * Math.cos(ang), my = cy - r * Math.sin(ang)
  const col = levelColor(v)
  return (
    <div className="sg" style={{ width: size, height: size * 0.6 }}>
      <svg viewBox="0 0 260 156" width={size} height={size * 0.6} aria-hidden="true">
        <defs>
          <linearGradient id={`g${id}`} x1="0" x2="1">
            <stop offset="0" stopColor="#22c55e" /><stop offset=".33" stopColor="#3b82f6" /><stop offset=".55" stopColor="#eab308" /><stop offset=".75" stopColor="#f97316" /><stop offset="1" stopColor="#ef4444" />
          </linearGradient>
          <filter id={`s${id}`} x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="2" stdDeviation="3" floodColor={col} floodOpacity=".55" /></filter>
        </defs>
        <path d="M20 130 A110 110 0 0 1 240 130" fill="none" stroke="var(--border)" strokeWidth="20" strokeLinecap="round" />
        <path d="M20 130 A110 110 0 0 1 240 130" fill="none" stroke={`url(#g${id})`} strokeWidth="20" strokeLinecap="round" opacity=".95" />
        {[30, 50, 65, 80].map((t) => { const a = Math.PI * (1 - t / 100); return <line key={t} x1={cx + 96 * Math.cos(a)} y1={cy - 96 * Math.sin(a)} x2={cx + 124 * Math.cos(a)} y2={cy - 124 * Math.sin(a)} stroke="var(--panel)" strokeWidth="2.5" /> })}
        <circle cx={mx} cy={my} r="14" fill="var(--panel)" stroke={col} strokeWidth="5" filter={`url(#s${id})`} />
      </svg>
      {label && <div className="sg-num"><b>{Math.round(v)}</b><span className="sg-lvl" style={{ background: col }}>{levelOf(score)}</span></div>}
    </div>
  )
}

/** Front-page strip: mini dial + one line + the top drivers. */
export function StressStrip({ s }: { s: Stress }) {
  const top = s.components.filter((c) => c.score != null).sort((a, b) => (b.score! - a.score!)).slice(0, 2)
  const col = LEVEL_COLOR[s.today.level]
  const ref = useRef<HTMLAnchorElement>(null)
  return (
    <a ref={ref} href="#/stress" className="stress-strip" style={{ ['--lvl' as string]: col }}>
      <StressGauge score={s.today.score} size={118} label={false} />
      <div className="ss-body">
        <div className="ss-k">🌡️ World Stress today</div>
        <div className="ss-v"><b>{s.today.score}</b> <span className="sg-lvl" style={{ background: col }}>{s.today.level}</span>
          {s.today.delta7 != null && s.today.delta7 !== 0 && <span className={`ss-d ${s.today.delta7 > 0 ? 'up' : 'dn'}`}>{s.today.delta7 > 0 ? '▲' : '▼'} {Math.abs(s.today.delta7)} this week</span>}</div>
        <div className="ss-why">Pushing it: {top.map((c) => <span key={c.key} className="ss-chip">{c.icon} {c.label}</span>)}</div>
      </div>
      <span className="ss-go">→</span>
    </a>
  )
}
