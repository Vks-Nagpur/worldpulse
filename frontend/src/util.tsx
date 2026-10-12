import type { ReactNode } from 'react'
import type { Event } from './data'
import type { Filters } from './store'
import { t } from './i18n'

export const CAT: Record<string, { label: string; color: string; icon: string }> = {
  financial_markets: { label: 'Financial markets', color: '#4f46e5', icon: '💹' },
  economics: { label: 'Economics', color: '#0ea5a4', icon: '📈' },
  trade: { label: 'Trade', color: '#2563eb', icon: '🚢' },
  energy: { label: 'Energy', color: '#d97706', icon: '🛢️' },
  military_security: { label: 'Military & security', color: '#dc2626', icon: '🛡️' },
  geopolitics: { label: 'Geopolitics', color: '#7c3aed', icon: '🌐' },
  diplomacy: { label: 'Diplomacy', color: '#0891b2', icon: '🤝' },
  cybersecurity: { label: 'Cybersecurity', color: '#9333ea', icon: '🔐' },
  technology: { label: 'Technology', color: '#3b82f6', icon: '💻' },
  elections: { label: 'Elections', color: '#db2777', icon: '🗳️' },
  natural_disasters: { label: 'Natural disasters', color: '#ea580c', icon: '🌋' },
  public_health: { label: 'Public health', color: '#16a34a', icon: '🩺' },
  environment: { label: 'Environment', color: '#15803d', icon: '🌿' },
  general: { label: 'General', color: '#94a3b8', icon: '📰' },
}
export const cat = (c?: string | null) => CAT[c || 'general'] || CAT.general

export const FOCUS: { key: string; label: string; icon: string; cats: string[] | null }[] = [
  { key: 'all', label: 'Whole world', icon: '🌍', cats: null },
  { key: 'business', label: 'Business & risk', icon: '💼', cats: ['financial_markets', 'economics', 'trade', 'energy', 'military_security', 'geopolitics', 'diplomacy', 'cybersecurity', 'technology'] },
  { key: 'markets', label: 'Markets & economy', icon: '📈', cats: ['financial_markets', 'economics'] },
  { key: 'trade', label: 'Trade & shipping', icon: '🚢', cats: ['trade'] },
  { key: 'energy', label: 'Energy', icon: '🛢️', cats: ['energy'] },
  { key: 'conflict', label: 'Wars & military', icon: '🛡️', cats: ['military_security'] },
  { key: 'geo', label: 'Sanctions & diplomacy', icon: '🏛️', cats: ['geopolitics', 'diplomacy'] },
  { key: 'cyber', label: 'Cyber & tech', icon: '🔐', cats: ['cybersecurity', 'technology'] },
  { key: 'politics', label: 'Elections & politics', icon: '🗳️', cats: ['elections', 'geopolitics'] },
  { key: 'disasters', label: 'Disasters & health', icon: '🌋', cats: ['natural_disasters', 'public_health', 'environment'] },
]

export const VERIF: Record<string, { label: string; tone: string; tip: string; rank: number }> = {
  instrument_observation: { label: 'Measured', tone: 'b-ok', tip: 'Recorded by a scientific instrument network (e.g. USGS seismometers).', rank: 5 },
  official_alert: { label: 'Official alert', tone: 'b-ok', tip: 'Issued by a public monitoring body (e.g. GDACS).', rank: 4 },
  official_statement: { label: 'Official source', tone: 'b-info', tip: 'Published by a government or international institution.', rank: 3 },
  multi_source_reporting: { label: 'Several outlets', tone: 'b-acc', tip: 'Reported by two or more outlets. Not independently verified.', rank: 2 },
  single_source_report: { label: 'One outlet', tone: 'b-warn', tip: 'Reported by a single outlet so far. Treat as an unverified claim.', rank: 1 },
}
export const SIG_STATUS: Record<string, { label: string; tone: string; tip: string }> = {
  statistical_anomaly: { label: 'Unusual change', tone: 'b-acc', tip: 'Much higher or lower than normal recently. Not a prediction.' },
  observed_measurement: { label: 'Measured', tone: 'b-ok', tip: 'Recorded by scientific instruments.' },
  official_alert: { label: 'Official alert', tone: 'b-ok', tip: 'An alert from an official monitoring organisation.' },
  measurement_alert: { label: 'Not yet confirmed', tone: 'b-warn', tip: 'Measurements suggest a problem, but no operator or authority has confirmed it yet.' },
}
export const RISK = [{ label: 'Low', tone: 'b-ok' }, { label: 'Elevated', tone: 'b-warn' }, { label: 'High', tone: 'b-bad' }]

export function Badge({ tone = 'b-mute', children, title }: { tone?: string; children: ReactNode; title?: string }) {
  return <span className={`badge ${tone}`} title={title}>{children}</span>
}

export function flag(iso2?: string | null) {
  if (!iso2 || iso2.length !== 2 || iso2 === 'XK') return '🏳️'
  return String.fromCodePoint(...[...iso2.toUpperCase()].map((c) => 0x1f1a5 + c.charCodeAt(0)))
}
const toDate = (iso: string) => new Date(iso.length === 10 ? iso + 'T00:00:00Z' : iso)
export function ago(iso?: string | null): string {
  if (!iso) return 'never'
  const ms = toDate(iso).getTime()
  if (isNaN(ms)) return iso
  const s = (Date.now() - ms) / 1000
  if (s < 90) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)} min ago`
  if (s < 86400) return `${Math.round(s / 3600)} h ago`
  return `${Math.round(s / 86400)} d ago`
}
export const hoursSince = (iso?: string | null) => (iso ? (Date.now() - toDate(iso).getTime()) / 3.6e6 : Infinity)
export function fmtDate(iso?: string | null, withTime = true) {
  if (!iso) return '—'
  const d = toDate(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleString(undefined, withTime ? { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' } : { day: 'numeric', month: 'short', year: 'numeric' })
}
export const compact = (n?: number | null) => (n == null ? '—' : Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n))
export const num = (n?: number | null, d = 2) => (n == null || isNaN(n) ? '—' : n.toLocaleString(undefined, Math.abs(n) >= 1000 ? { maximumFractionDigits: 0 } : { maximumFractionDigits: d, minimumFractionDigits: Math.min(d, 2) }))
export const pct = (n?: number | null) => (n == null || isNaN(n) ? '—' : `${n > 0 ? '+' : ''}${n.toFixed(2)}%`)
export const tone = (n?: number | null) => (n == null ? '' : n > 0 ? 'up' : n < 0 ? 'down' : '')

/** Only http(s) links from collected data are rendered. */
export function safeUrl(u?: string | null): string | undefined {
  if (!u) return undefined
  try { const p = new URL(u, location.href); return p.protocol === 'https:' || p.protocol === 'http:' ? p.href : undefined } catch { return undefined }
}
export function Ext({ href, children }: { href?: string | null; children: ReactNode }) {
  const u = safeUrl(href)
  return u ? <a href={u} target="_blank" rel="noopener noreferrer nofollow">{children}</a> : <>{children}</>
}
export const go = (path: string) => { location.hash = path }

/** Freshness label shown next to numbers. */
export function Fresh({ at, annual }: { at?: string | null; annual?: boolean }) {
  if (!at) return null
  return <span className="fresh" title={at}>{annual ? `annual figure, ${at}` : `as of ${fmtDate(at, at.length > 10)} · ${ago(at)}`}</span>
}

/** Rows → CSV download (opens in Excel / Google Sheets). */
export function downloadCSV(name: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return
  const cols = Object.keys(rows[0])
  const esc = (v: unknown) => {
    const s = v == null ? '' : Array.isArray(v) ? v.join(' ') : String(v)
    const safe = /^[=+\-@]/.test(s) ? `'${s}` : s // avoid spreadsheet formula injection
    return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
  }
  const csv = '﻿' + [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  a.download = `worldpulse-${name}-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}

/** Developments matching the global filters. */
export function filterEvents(events: Event[], f: Filters, regionOf: (iso2?: string | null) => string | undefined, focusKey?: string) {
  const fx = FOCUS.find((x) => x.key === (focusKey || f.focus))
  const cats = fx?.cats
  const ok = { all: () => true, multi: (e: Event) => e.verification !== 'single_source_report', official: (e: Event) => ['instrument_observation', 'official_alert', 'official_statement'].includes(e.verification) }[f.support]
  const q = f.q.toLowerCase()
  const now = Date.now()
  return events.filter((e) => (!cats || cats.includes(e.category)) && ok(e) && now - new Date(e.started_at || e.first_detected).getTime() <= f.hours * 3.6e6 &&
    (!f.country || e.country === f.country || e.countries.includes(f.country)) && (!f.region || regionOf(e.country) === f.region) && (!q || e.title.toLowerCase().includes(q)))
}
export const sortEvents = (rows: Event[]) => [...rows].sort((a, b) => ((VERIF[b.verification]?.rank || 0) * 2 + b.outlets) - ((VERIF[a.verification]?.rank || 0) * 2 + a.outlets) ||
  (b.started_at || b.first_detected).localeCompare(a.started_at || a.first_detected))

export { t }

export const evidenceLabel = (c: string) => (c === 'high' ? 'Strong evidence' : c === 'medium' ? 'Some evidence' : 'Weak evidence')
