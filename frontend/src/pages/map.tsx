import { geoEqualEarth, geoPath } from 'd3-geo'
import type { Feature, FeatureCollection, Geometry } from 'geojson'
import { useEffect, useMemo, useRef, useState } from 'react'
import { feature } from 'topojson-client'
import type { GeometryCollection, Topology } from 'topojson-specification'
import world from 'world-atlas/countries-110m.json'
import { StoryCard } from '../components/story'
import { Chips, Empty, ErrorBox, Loading, PageHead, useCountries } from '../components/ui'
import type { Event } from '../data'
import { useData } from '../data'
import { t } from '../i18n'
import { NAME2ISO, NUM2ISO } from '../isoNumeric'
import { ROUTE_POINTS, routeStatus, type Route } from '../routes'
import { Badge, byImportance, flag, frontWorthy, RISK } from '../util'

type Layer = 'news' | 'conflict' | 'risk' | 'disasters' | 'routes'
const LAYERS: { v: Layer; label: string; help: string }[] = [
  { v: 'news', label: '📰 News', help: 'How many confirmed stories mention each country this week.' },
  { v: 'conflict', label: '⚔️ Conflict', help: 'Stories about wars, attacks and security this week.' },
  { v: 'risk', label: '🚦 Risk', help: 'WorldPulse risk level from conflict, sanctions, disasters and unusual signals.' },
  { v: 'routes', label: '🚢 Shipping routes', help: 'Major sea routes, coloured by how much news names them this week (news level, not ship traffic). Tap one for its stories.' },
  { v: 'disasters', label: '🌋 Disasters', help: 'Earthquakes of magnitude 4.5+ in the last 7 days (dots sized by strength) and disaster alerts.' },
]
const W = 960, H = 500

type Shape = { iso: string; name: string; d: string }

const topo = world as unknown as Topology<{ countries: GeometryCollection<{ name: string }> }>
const projection = geoEqualEarth().fitExtent([[6, 6], [W - 6, H - 6]], { type: 'Sphere' })
const path = geoPath(projection)
const SHAPES: Shape[] = (feature(topo, topo.objects.countries) as unknown as FeatureCollection<Geometry, { name: string }>).features
  .filter((f) => f.properties.name !== 'Antarctica')
  .map((f: Feature<Geometry, { name: string }>) => ({ iso: NUM2ISO[String(f.id)] || NAME2ISO[f.properties.name] || '', name: f.properties.name, d: path(f) || '' }))
const SPHERE = path({ type: 'Sphere' }) || ''

/** 0 = none, 1..5 = light → strong */
function bucket(v: number, max: number) {
  if (!v || max <= 0) return 0
  return Math.min(5, 1 + Math.floor((Math.log1p(v) / Math.log1p(max)) * 4.999))
}

export function WorldMap() {
  const ev = useData<{ events: Event[] }>('events.json')
  const risk = useData<{ countries: { iso2: string; level: number }[] }>('risk.json')
  const qk = useData<{ quakes: (string | number | null)[][] }>('quakes.json')
  const { by } = useCountries()
  const [layer, setLayer] = useState<Layer>('news')
  const [sel, setSel] = useState<string | null>(null)
  const rt = useData<{ routes: Route[] }>(layer === 'routes' ? 'chokepoints.json' : null)
  const [view, setView] = useState({ k: 1, x: 0, y: 0 })
  const svgRef = useRef<SVGSVGElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const counts = useMemo(() => {
    const news: Record<string, number> = {}, conflict: Record<string, number> = {}
    for (const e of ev.data?.events || []) {
      if (!frontWorthy(e)) continue
      for (const c of new Set([e.country, ...e.countries].filter(Boolean) as string[])) {
        news[c] = (news[c] || 0) + 1
        if (e.category === 'military_security') conflict[c] = (conflict[c] || 0) + 1
      }
    }
    return { news, conflict }
  }, [ev.data])
  const riskBy = useMemo(() => Object.fromEntries((risk.data?.countries || []).map((c) => [c.iso2, c.level])), [risk.data])
  const quakes = useMemo(() => (qk.data?.quakes || []).filter((q) => Number(q[2]) >= 4.5 && Date.now() - new Date(String(q[1])).getTime() < 7 * 864e5)
    .map((q) => ({ id: String(q[0]), mag: Number(q[2]), place: String(q[3]), xy: projection([Number(q[5]), Number(q[4])]), url: String(q[10]) })), [qk.data])
  const alerts = useMemo(() => (ev.data?.events || []).filter((e) => e.origin !== 'news_cluster' && e.category === 'natural_disasters' && e.verification === 'official_alert' && e.lat != null && e.lon != null)
    .map((e) => ({ e, xy: projection([Number(e.lon), Number(e.lat)]) })), [ev.data])

  const value = (iso: string) => layer === 'news' ? counts.news[iso] || 0 : layer === 'conflict' ? counts.conflict[iso] || 0 : layer === 'risk' ? riskBy[iso] ?? -1 : 0
  const max = layer === 'news' ? Math.max(0, ...Object.values(counts.news)) : layer === 'conflict' ? Math.max(0, ...Object.values(counts.conflict)) : 3
  const cls = (iso: string) => {
    if (layer === 'disasters' || layer === 'routes') return 'm0'
    if (layer === 'risk') { const l = riskBy[iso]; return l == null ? 'm0' : `r${l}` }
    return `m${bucket(value(iso), max)}`
  }

  // zoom & pan: buttons, mouse wheel, one-finger drag, two-finger pinch
  const ptrs = useRef(new Map<number, { x: number; y: number }>())
  const last = useRef<{ x: number; y: number; dist?: number } | null>(null)
  const moved = useRef(false)
  const clamp = (v: { k: number; x: number; y: number }) => {
    const k = Math.min(8, Math.max(1, v.k))
    return { k, x: Math.min(0, Math.max(W - W * k, v.x)), y: Math.min(0, Math.max(H - H * k, v.y)) }
  }
  const zoomAt = (f: number, cx = W / 2, cy = H / 2) => setView((v) => { const k = Math.min(8, Math.max(1, v.k * f)); const r = k / v.k; return clamp({ k, x: cx - (cx - v.x) * r, y: cy - (cy - v.y) * r }) })
  const toSvg = (cx: number, cy: number) => {
    const r = svgRef.current!.getBoundingClientRect()
    return { x: ((cx - r.left) / r.width) * W, y: ((cy - r.top) / r.height) * H }
  }
  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const wheel = (e: WheelEvent) => { e.preventDefault(); const p = toSvg(e.clientX, e.clientY); zoomAt(e.deltaY < 0 ? 1.25 : 0.8, p.x, p.y) }
    el.addEventListener('wheel', wheel, { passive: false })
    return () => el.removeEventListener('wheel', wheel)
  }, [])
  const down = (e: React.PointerEvent) => { ptrs.current.set(e.pointerId, toSvg(e.clientX, e.clientY)); moved.current = false; last.current = null }
  const move = (e: React.PointerEvent) => {
    if (!ptrs.current.has(e.pointerId)) return
    ptrs.current.set(e.pointerId, toSvg(e.clientX, e.clientY))
    const pts = [...ptrs.current.values()]
    if (pts.length === 1) {
      const p = pts[0]
      if (last.current && view.k > 1) { const dx = p.x - last.current.x, dy = p.y - last.current.y; if (Math.abs(dx) + Math.abs(dy) > 2) moved.current = true; setView((v) => clamp({ ...v, x: v.x + dx, y: v.y + dy })) }
      last.current = { x: p.x, y: p.y }
    } else if (pts.length === 2) {
      const [a, b] = pts
      const dist = Math.hypot(a.x - b.x, a.y - b.y), cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2
      if (last.current?.dist) { moved.current = true; zoomAt(dist / last.current.dist, cx, cy) }
      last.current = { x: cx, y: cy, dist }
    }
  }
  const up = (e: React.PointerEvent) => { ptrs.current.delete(e.pointerId); last.current = null }
  const pick = (iso: string) => {
    if (moved.current || !iso) return
    setSel(iso)
    setTimeout(() => { if (panelRef.current && panelRef.current.getBoundingClientRect().top > innerHeight - 120) panelRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' }) }, 50)
  }

  if (ev.error) return <ErrorBox error={ev.error} />
  const L = LAYERS.find((x) => x.v === layer)!
  return (
    <>
      <PageHead title={`🗺️ ${t('World map')}`} sub="Tap any country to see what is happening there. Pinch or use + / − to zoom." />
      <div className="map-tools">
        <Chips scroll value={layer} onChange={setLayer} options={LAYERS.map((x) => ({ v: x.v, label: x.label }))} />
      </div>
      <div className="map-grid">
        <div className="card map-card">
          <div className="map-wrap">
            <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className={`worldmap layer-${layer}`} role="img" aria-label={`World map — ${L.label}`}
              onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerLeave={up}>
              <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
                <path d={SPHERE} className="sphere" />
                {SHAPES.map((s, i) => (
                  <path key={s.iso + i} d={s.d} className={`land ${cls(s.iso)} ${sel === s.iso ? 'sel' : ''}`} style={{ strokeWidth: 0.6 / view.k }}
                    onClick={() => pick(s.iso)}>
                    <title>{`${by[s.iso]?.name || s.name}${layer === 'risk' ? (riskBy[s.iso] != null ? ` — ${RISK[riskBy[s.iso]]?.label}` : '') : !['disasters', 'routes'].includes(layer) ? ` — ${value(s.iso)} stories` : ''}`}</title>
                  </path>
                ))}
                {layer === 'disasters' && quakes.map((q) => q.xy && (
                  <circle key={q.id} cx={q.xy[0]} cy={q.xy[1]} r={(1.5 + (q.mag - 4.5) * 2.2) / Math.sqrt(view.k)} className={`quake ${q.mag >= 6 ? 'big' : ''}`}>
                    <title>{`M${q.mag.toFixed(1)} — ${q.place}`}</title>
                  </circle>
                ))}
                {layer === 'routes' && (rt.data?.routes || []).map((r) => {
                  const pt = ROUTE_POINTS[r.name] && projection(ROUTE_POINTS[r.name])
                  if (!pt) return null
                  const st = routeStatus(r)
                  return (
                    <a key={r.name} href="#/trade?tab=routes" className={`route-pt rs-${st.key}`}>
                      <circle cx={pt[0]} cy={pt[1]} r={(5 + Math.min(10, Math.sqrt(r.stories_7d) * 1.3)) / Math.sqrt(view.k)} />
                      <text x={pt[0] + 9 / view.k} y={pt[1] + 3 / view.k} style={{ fontSize: 11 / view.k }}>{r.name.replace('Red Sea & ', '')}</text>
                      <title>{`${r.name}: ${st.label} — ${r.stories_7d} stories this week`}</title>
                    </a>
                  )
                })}
                {layer === 'disasters' && alerts.map(({ e, xy }) => xy && (
                  <a key={e.id} href={`#/event/${encodeURIComponent(e.id)}`}><rect x={xy[0] - 4 / view.k} y={xy[1] - 4 / view.k} width={8 / view.k} height={8 / view.k} className="alert-pt"><title>{e.title}</title></rect></a>
                ))}
              </g>
            </svg>
            <div className="map-zoom">
              <button type="button" onClick={() => zoomAt(1.5)} aria-label="Zoom in">+</button>
              <button type="button" onClick={() => zoomAt(1 / 1.5)} aria-label="Zoom out">−</button>
              {view.k > 1 && <button type="button" onClick={() => setView({ k: 1, x: 0, y: 0 })} aria-label="Reset zoom">⟲</button>}
            </div>
          </div>
          <div className="map-legend">
            <span className="small muted">{L.help}</span>
            {layer === 'risk' ? (
              <span className="legend-row">{[0, 1, 2, 3].map((l) => <span key={l}><i className={`sw r${l}`} />{RISK[l]?.label}</span>)}</span>
            ) : layer === 'routes' ? (
              <span className="legend-row"><span><i className="sw dot" style={{ background: '#22c55e' }} />Quiet</span><span><i className="sw dot" style={{ background: '#f59e0b' }} />In the news</span><span><i className="sw dot" style={{ background: '#ef4444' }} />Very busy</span></span>
            ) : layer === 'disasters' ? (
              <span className="legend-row"><span><i className="sw dot" />Earthquake</span><span><i className="sw sq" />Disaster alert</span></span>
            ) : (
              <span className="legend-row"><span>Fewer</span>{[1, 2, 3, 4, 5].map((b) => <i key={b} className={`sw m${b}`} />)}<span>More</span></span>
            )}
          </div>
        </div>
        <div ref={panelRef} className="scroll-anchor">
          {sel ? <CountryPanel iso={sel} events={ev.data?.events} riskLevel={riskBy[sel]} onClose={() => setSel(null)} /> : (
            <div className="card map-hint"><div style={{ fontSize: 34 }}>👆</div><h3>Tap a country</h3><p className="sub">See its biggest stories this week, its risk level and a link to its full profile.</p>
              {!ev.data && <Loading rows={2} />}
              {ev.data && <TopCountries counts={layer === 'conflict' ? counts.conflict : counts.news} onPick={pick} />}</div>
          )}
        </div>
      </div>
    </>
  )
}

function TopCountries({ counts, onPick }: { counts: Record<string, number>; onPick: (iso: string) => void }) {
  const { by } = useCountries()
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8)
  return (
    <div className="list" style={{ marginTop: 10, textAlign: 'left' }}>
      <div className="small muted" style={{ fontWeight: 700 }}>Most in the news</div>
      {top.map(([iso, n]) => <button key={iso} type="button" className="kv-line map-top" onClick={() => onPick(iso)}><span>{flag(iso)} {by[iso]?.name || iso}</span><span className="faint">{n} stories</span></button>)}
    </div>
  )
}

function CountryPanel({ iso, events, riskLevel, onClose }: { iso: string; events?: Event[]; riskLevel?: number; onClose: () => void }) {
  const { by } = useCountries()
  const c = by[iso]
  const stories = useMemo(() => byImportance((events || []).filter((e) => e.country === iso || e.countries.includes(iso))).slice(0, 4), [events, iso])
  const confirmed = (events || []).filter((e) => (e.country === iso || e.countries.includes(iso)) && e.verification !== 'single_source_report').length
  return (
    <div className="card map-panel">
      <div className="row spread" style={{ alignItems: 'flex-start' }}>
        <div><div style={{ fontSize: 34, lineHeight: 1 }}>{flag(iso)}</div><h3 style={{ fontSize: 20, margin: '6px 0 2px' }}>{c?.name || iso}</h3>
          <div className="small muted">{c ? `${c.region}${c.capital ? ` · capital ${c.capital}` : ''}` : ''}</div></div>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
      </div>
      <div className="facts" style={{ margin: '10px 0' }}>
        {riskLevel != null && <Badge tone={RISK[riskLevel].tone}>{t(RISK[riskLevel].label)}</Badge>}
        <span className="fact">📰 {confirmed} confirmed stories this week</span>
      </div>
      {stories.length ? <div className="stack">{stories.map((e) => <StoryCard key={e.id} e={e} names={by} />)}</div> : <Empty>No stories about {c?.name || iso} this week.</Empty>}
      <a className="btn" href={`#/country/${iso}`} style={{ marginTop: 12, display: 'inline-flex' }}>Open {c?.name || iso} profile →</a>
    </div>
  )
}
