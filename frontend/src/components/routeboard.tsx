import { routeStatus, type Route } from '../routes'

export function RouteBoard({ routes, compact }: { routes: Route[]; compact?: boolean }) {
  const rows = [...routes].sort((a, b) => b.stories_7d - a.stories_7d)
  return (
    <div className={`route-board ${compact ? 'compact' : ''}`}>
      {rows.map((r) => {
        const st = routeStatus(r)
        return (
          <a key={r.name} className={`route-tile rs-${st.key}`} href={`#/trade?tab=routes`} onClick={() => setTimeout(() => document.getElementById(`route-${r.name.replace(/\W+/g, '-')}`)?.scrollIntoView({ behavior: 'smooth' }), 400)}>
            <span className="rt-dot" />
            <span className="rt-name">{r.name}</span>
            <span className="rt-meta">{st.label} · {r.stories_7d} {r.stories_7d === 1 ? "story" : "stories"}{st.trend === 'rising' ? ' · ↑ rising' : st.trend === 'falling' ? ' · ↓ falling' : ''}</span>
          </a>
        )
      })}
    </div>
  )
}

