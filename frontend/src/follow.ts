// Stories the reader follows, kept on this device only. Each remembers what it looked like
// when last seen so the site can say "updated" when more outlets report it or details change.
import { useEffect, useState } from 'react'
import type { Event } from './data'

export type Followed = { id: string; title: string; seen: string; outlets: number; revision: number; added: string }
const KEY = 'worldpulse.follow.v1'
const subs = new Set<() => void>()
function read(): Followed[] { try { return JSON.parse(localStorage.getItem(KEY) || '[]') } catch { return [] } }
function write(v: Followed[]) { try { localStorage.setItem(KEY, JSON.stringify(v.slice(0, 50))) } catch { /* private mode */ } subs.forEach((f) => f()) }

export const followStore = {
  list: read,
  has: (id: string) => read().some((f) => f.id === id),
  toggle(e: Event) {
    const cur = read()
    write(cur.some((f) => f.id === e.id) ? cur.filter((f) => f.id !== e.id)
      : [{ id: e.id, title: e.title, seen: e.last_updated, outlets: e.outlets, revision: e.revision, added: new Date().toISOString() }, ...cur])
  },
  markSeen(e: Event) {
    const cur = read()
    if (!cur.some((f) => f.id === e.id)) return
    write(cur.map((f) => (f.id === e.id ? { ...f, seen: e.last_updated, outlets: e.outlets, revision: e.revision, title: e.title } : f)))
  },
  remove(id: string) { write(read().filter((f) => f.id !== id)) },
  use(): Followed[] {
    const [v, setV] = useState(read)
    useEffect(() => { const f = () => setV(read()); subs.add(f); addEventListener('storage', f); return () => { subs.delete(f); removeEventListener('storage', f) } }, [])
    return v
  },
}

/** What changed since the reader last looked at a followed story. */
export function changesFor(f: Followed, e?: Event): string[] {
  if (!e) return []
  const out: string[] = []
  if (e.outlets > f.outlets) out.push(`${e.outlets - f.outlets} more outlet${e.outlets - f.outlets === 1 ? '' : 's'} reporting`)
  if (e.revision > f.revision) out.push('details updated')
  if (!out.length && e.last_updated > f.seen) out.push('new reports')
  return out
}
