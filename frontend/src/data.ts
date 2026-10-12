// Data access. The public site reads the JSON published by the data workflow
// (./data/*.json). With VITE_API_URL set (self-hosted engine), Ask also
// queries the local API.
import { useEffect, useState } from 'react'

export const API = (import.meta.env.VITE_API_URL as string | undefined) || ''
export const REPO = (import.meta.env.VITE_REPO_URL as string | undefined) || 'https://github.com/Vks-Nagpur/worldpulse'
export const BASE = `${import.meta.env.BASE_URL}data/`

export type Ref = { t: string; u?: string | null; p?: string | null; d?: string | null }
export type Rel = { to: string; type: string; evidence: string; method: string; confidence: number; observed: boolean; title?: string }
export type Event = {
  id: string; title: string; category: string; country?: string | null; countries: string[]; lat?: number | null; lon?: number | null
  started_at?: string | null; first_detected: string; last_updated: string; origin: string; verification: string; confidence: number
  magnitude?: number | null; revision: number; outlets: number; why: string[]; refs: Ref[]; n_related: number
}
export type Wiki = { title: string; extract: string; url: string; source?: string; license?: string }
export type Arc = { reports: number; first_seen: string; first_title: string; first_url?: string | null; first_publisher?: string | null
  earlier: { id: string; title: string; date: string; url?: string | null; publisher?: string | null; verification: string }[]; weekly: [string, number][] }
export type EventDetail = Event & { description?: string | null; timeline: (Ref & { o: boolean; dup: boolean })[]; related: Rel[]; revisions: { revision: number; changed_at: string }[]
  context?: { background: Wiki[]; places: (Wiki & { iso2: string })[]; arc: Arc | null } }
export type Article = { id: string; t: string; u: string; p?: string; x?: string | null; d: string; c: string; k: string[]; cl: string; n: number; o: boolean; s: string; l?: string; w?: string[] }
export type Item = { t: string; u: string; p?: string; d: string; c: string; k: string[]; o: boolean }
export type Evidence = { type: string; title: string; url?: string; publisher?: string; published_at?: string; detail?: string }
export type Signal = {
  id: string; signal_type: string; category: string; country?: string | null; region?: string | null; title: string; detected_at: string
  observed?: number | null; baseline?: number | null; baseline_std?: number | null; deviation?: number | null; pct_change?: number | null
  score?: number | null; unit?: string | null; evidence: Evidence[]; data_freshness?: string | null; confidence: string; limitations: string; status: string
}
export type Indicator = { label: string; value: number; unit: string; period: string; source: string; url: string; retrieved: string }
export type RiskComp = { component: string; level: number; reason: string }
export type Risk = { iso2: string; name: string; region: string; level: number; score: number; components: RiskComp[] }
export type CountrySummary = {
  iso2: string; iso3: string; name: string; region: string; wb_region?: string; income?: string; capital?: string; lat?: number; lon?: number
  population?: { value: number; period: string } | null; gdp?: { value: number; period: string } | null
  events_24h: number; events_7d: number; news_72h: number; signals_30d: number; top_category?: string | null; risk?: number | null
}
export type BriefingItem = { text: string; refs: number[]; event_id?: string; signal_id?: string; verification?: string }
export type Briefing = {
  kind: string; scope?: string | null; period_hours: number; generated_at: string; mode: string
  sections: { heading: string; items: BriefingItem[] }[]
  references: { id: number; title: string; url?: string | null; publisher?: string | null; date?: string | null; kind: string }[]
  limitations: string[]; ai_summary?: string
}
export type CountryProfile = {
  generated_at: string; country: CountrySummary; meta_source?: string; meta_updated?: string; currency?: string | null
  indicators: Record<string, Indicator>; events: Event[]; news: Article[]; signals: Signal[]; volume: [string, number][]
  briefings: Record<string, Briefing>; risk?: Risk | null; about?: Wiki | null
}
export type Source = {
  id: string; name: string; kind: string; type?: string; category?: string | null; country?: string | null; url: string; enabled: boolean; tags: string[]
  interval_minutes: number; last_success?: string | null; last_attempt?: string | null; last_error?: string | null; failures: number
  last_items?: number | null; status: string
}
export type Market = { id: string; name: string; kind: string; unit: string; country?: string | null; source?: string | null; points: [string, number][] }
export type MarketLatest = { id: string; name: string; kind: string; unit: string; last: number; as_of: string; chg_1d: number | null; chg_5d: number | null
  chg_21d: number | null; chg_63d?: number | null; chg_252d?: number | null; source: string; spark?: number[]; country?: string | null }
export type Meta = {
  generated_at: string; app_version: string; processing_version: string; stale_after_hours: number
  counts: Record<string, number>; sources: { total: number; ok: number; failing: number; disabled: number }
  quality_ok?: boolean; quality_problems?: string[]; site_url?: string
}
export type History = {
  category_per_day: [string, string, number][]; quakes_per_day: [string, number, number, number][]; signals_per_day: [string, string, number][]
  topic_volume: Record<string, [string, number][]>; country_volume: Record<string, [string, number][]>
}
export type Changes = {
  generated_at: string; note: string
  price_moves: { id: string; name: string; unit: string; last: number; as_of: string; chg: number }[]
  new_developments: { id: string; title: string; category: string; country?: string; verification: string; outlets: number; url?: string }[]
  rising_countries: { iso2: string; name: string; last_24h: number; daily_avg_prev: number }[]
  new_signals: { id: string; title: string; signal_type: string; country?: string; confidence: string; status: string }[]
}

const cache = new Map<string, Promise<unknown>>()
export function load<T>(file: string): Promise<T> {
  if (!cache.has(file)) {
    const p = fetch(BASE + file, { cache: 'no-cache' }).then((r) => {
      if (!r.ok) throw new Error(`${file}: HTTP ${r.status}`)
      return r.json()
    })
    p.catch(() => cache.delete(file))
    cache.set(file, p)
  }
  return cache.get(file) as Promise<T>
}

export function useData<T>(file: string | null): { data?: T; error?: string; loading: boolean } {
  const [state, setState] = useState<{ data?: T; error?: string; loading: boolean }>({ loading: !!file })
  useEffect(() => {
    if (!file) return
    let live = true
    setState((s) => ({ ...s, loading: true }))
    load<T>(file).then((data) => live && setState({ data, loading: false }), (e) => live && setState({ error: String(e.message || e), loading: false }))
    return () => { live = false }
  }, [file])
  return state
}

export async function apiQuery(question: string) {
  const r = await fetch(`${API}/api/query`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question }) })
  if (!r.ok) throw new Error(`API ${r.status}`)
  return r.json()
}
