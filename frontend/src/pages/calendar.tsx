import { useState } from 'react'
import { Chips, Empty, Loading, PageHead, useCountries } from '../components/ui'
import { useData } from '../data'
import { Ext, flag } from '../util'

// Known upcoming events, only from the bodies that publish them (central banks) and
// Wikipedia's national electoral calendar. Dates can change, so each links to its source.

export type CalItem = { date: string; title: string; kind: 'central_bank' | 'election'; country: string; source: string; url: string; note?: string }
export type Cal = { generated_at: string; days: number; items: CalItem[]; note: string }

const ICON = { central_bank: '🏦', election: '🗳️' }
export const daysUntil = (d: string) => Math.round((new Date(d + 'T12:00:00Z').getTime() - Date.now()) / 864e5)
export const whenText = (d: string) => { const n = daysUntil(d); return n <= 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days` }

export function Calendar() {
  const { data, error } = useData<Cal>('calendar.json')
  const { by } = useCountries()
  const [kind, setKind] = useState<'all' | 'central_bank' | 'election'>('all')
  if (error) return <><PageHead title="📅 Coming up" /><Empty>The calendar will appear after the next data update.</Empty></>
  if (!data) return <Loading rows={6} />
  const items = data.items.filter((x) => kind === 'all' || x.kind === kind)
  const months = new Map<string, CalItem[]>()
  items.forEach((x) => { const k = x.date.slice(0, 7); months.set(k, [...(months.get(k) || []), x]) })
  const name = (iso: string) => (iso === 'EU' ? 'Euro area' : by[iso]?.name || iso)
  return (
    <>
      <PageHead title="📅 Coming up" sub="Interest-rate decisions and national elections in the next few months — dates from the official sources." />
      <Chips value={kind} onChange={setKind} options={[{ v: 'all', label: 'All' }, { v: 'central_bank', label: '🏦 Interest-rate decisions' }, { v: 'election', label: '🗳️ Elections' }]} />
      {!items.length ? <Empty>No dates for this choice yet.</Empty> : [...months.entries()].map(([m, rows]) => (
        <section key={m} style={{ marginTop: 16 }}>
          <h3 className="section-title" style={{ margin: '0 2px 8px' }}>{new Date(m + '-01T12:00:00Z').toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h3>
          <div className="card cal-list">{rows.map((x, i) => (
            <div key={i} className="cal-row">
              <div className="cal-date"><b>{new Date(x.date + 'T12:00:00Z').getUTCDate()}</b><span>{new Date(x.date + 'T12:00:00Z').toLocaleDateString(undefined, { weekday: 'short' })}</span></div>
              <div style={{ minWidth: 0 }}>
                <div className="cal-title">{ICON[x.kind]} {x.title}</div>
                <div className="small muted">{x.country !== 'EU' ? <a href={`#/country/${x.country}`}>{flag(x.country)} {name(x.country)}</a> : '🇪🇺 Euro area'} · {whenText(x.date)}{x.note ? ` · ${x.note}` : ''} · <Ext href={x.url}>{x.source} ↗</Ext></div>
              </div>
            </div>))}</div>
        </section>
      ))}
      <p className="small faint" style={{ marginTop: 10 }}>{data.note}</p>
    </>
  )
}
