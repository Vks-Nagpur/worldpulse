// Small persistent stores kept in the reader's own browser (no account, no server).
import { useSyncExternalStore } from 'react'

function persisted<T>(key: string, initial: T) {
  let value: T = initial
  try { const raw = localStorage.getItem(key); if (raw) value = { ...initial, ...JSON.parse(raw) } } catch { /* private mode or blocked storage */ }
  const subs = new Set<() => void>()
  return {
    get: () => value,
    set(next: T) {
      value = next
      try { localStorage.setItem(key, JSON.stringify(next)) } catch { /* ignore */ }
      subs.forEach((f) => f())
    },
    use(): T { return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f) }, () => value) },
  }
}

// ---- watchlist
export type Watch = { countries: string[]; markets: string[]; topics: string[] }
export const watchStore = persisted<Watch>('worldpulse.watch.v1', { countries: [], markets: [], topics: [] })
export function toggleWatch(kind: keyof Watch, id: string) {
  const w = watchStore.get()
  const list = w[kind].includes(id) ? w[kind].filter((x) => x !== id) : [...w[kind], id]
  watchStore.set({ ...w, [kind]: list })
}

// ---- global filters (kept for the session, shared by every page)
export type Filters = { focus: string; region: string; country: string; hours: number; support: 'all' | 'multi' | 'official'; q: string }
export const DEFAULT_FILTERS: Filters = { focus: 'all', region: '', country: '', hours: 168, support: 'all', q: '' }
let filters: Filters = (() => { try { return { ...DEFAULT_FILTERS, ...JSON.parse(sessionStorage.getItem('worldpulse.filters.v2') || '{}') } } catch { return DEFAULT_FILTERS } })()
const fsubs = new Set<() => void>()
export function setFilters(patch: Partial<Filters>) {
  filters = { ...filters, ...patch }
  try { sessionStorage.setItem('worldpulse.filters.v2', JSON.stringify(filters)) } catch { /* ignore */ }
  fsubs.forEach((f) => f())
}
export function useFilters(): Filters {
  return useSyncExternalStore((f) => { fsubs.add(f); return () => fsubs.delete(f) }, () => filters)
}
export const getFilters = () => filters
