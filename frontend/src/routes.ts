// Shipping route status from WorldPulse's own reporting counts. It measures how much news
// names a route — not ship traffic — so the labels say "news level", never "blocked" or "safe".
import type { Item } from './data'

export type Route = { name: string; articles_7d: number; stories_7d: number; daily: [string, number][]; top_topics: string[]; latest: Item[] }
export type RouteState = { key: 'quiet' | 'active' | 'very'; label: string; tone: string; trend: 'rising' | 'falling' | 'steady' }

export function routeStatus(r: Route): RouteState {
  const d = r.daily.map((x) => x[1])
  const recent = d.slice(-2).reduce((a, b) => a + b, 0) / 2
  const before = d.slice(0, -2).reduce((a, b) => a + b, 0) / Math.max(1, d.length - 2)
  const trend = recent > before * 1.5 + 1 ? 'rising' : recent < before * 0.6 && before >= 1 ? 'falling' : 'steady'
  if (r.stories_7d >= 30) return { key: 'very', label: 'Very busy in the news', tone: 'b-bad', trend }
  if (r.stories_7d >= 5) return { key: 'active', label: 'In the news', tone: 'b-warn', trend }
  return { key: 'quiet', label: 'Quiet', tone: 'b-ok', trend }
}

// Approximate centre points of each route (degrees), used only to place markers on the map.
export const ROUTE_POINTS: Record<string, [number, number]> = {
  'Strait of Hormuz': [56.4, 26.6], 'Black Sea': [34.0, 43.2], 'Red Sea & Bab el-Mandeb': [43.3, 12.7], 'Panama Canal': [-79.7, 9.1],
  'Suez Canal': [32.4, 30.6], 'Taiwan Strait': [119.6, 24.2], 'Strait of Malacca': [100.9, 2.9], Bosporus: [29.05, 41.1],
}
