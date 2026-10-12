import { useState, useSyncExternalStore } from 'react'
import { t } from '../i18n'

// The visitor's first name, kept only in this browser (never sent anywhere).
const KEY = 'worldpulse.user.v1'
type User = { name: string; at: string } | { skipped: true; at: string }
const read = (): User | null => { try { return JSON.parse(localStorage.getItem(KEY) || 'null') } catch { return null } }
let user = read()
const subs = new Set<() => void>()
const save = (u: User | null) => {
  user = u
  try { u ? localStorage.setItem(KEY, JSON.stringify(u)) : localStorage.removeItem(KEY) } catch { /* storage blocked: ask again next visit */ }
  subs.forEach((f) => f())
}
export const useUser = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f) }, () => user)
export const userName = (u: User | null) => (u && 'name' in u ? u.name : '')
export const resetName = () => save(null)

export function greeting(name: string) {
  const h = new Date().getHours()
  const part = h < 5 ? 'Good evening' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
  const hi: Record<string, string> = { 'Good morning': 'सुप्रभात', 'Good afternoon': 'नमस्कार', 'Good evening': 'शुभ संध्या' }
  return `${t(part) === part && document.documentElement.lang === 'hi' ? hi[part] : part}${name ? `, ${name}` : ''}`
}

export function Welcome() {
  const u = useUser()
  const [name, setName] = useState('')
  const [leaving, setLeaving] = useState(false)
  if (u) return null
  const finish = (val: User) => { setLeaving(true); setTimeout(() => save(val), 260) }
  const clean = name.replace(/[<>{}]/g, '').trim().slice(0, 40)
  return (
    <div className={`welcome-bg ${leaving ? 'out' : ''}`} role="dialog" aria-modal="true" aria-labelledby="welcome-title">
      <div className="welcome">
        <div className="welcome-orb" aria-hidden="true">
          <svg width="44" height="44" viewBox="0 0 24 24"><path d="M2 13h4l3-7 5 13 3-6h5" stroke="white" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </div>
        <h2 id="welcome-title">Welcome to WorldPulse 👋</h2>
        <p>Markets, trade, energy and conflict — from public sources, free for everyone. What should we call you?</p>
        <form onSubmit={(e) => { e.preventDefault(); if (clean) finish({ name: clean, at: new Date().toISOString() }) }}>
          <input className="input welcome-input" autoFocus placeholder="Your first name" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} aria-label="Your first name" autoComplete="given-name" />
          <button type="submit" className="btn welcome-btn" disabled={!clean}>Let’s go →</button>
        </form>
        <button type="button" className="welcome-skip" onClick={() => finish({ skipped: true, at: new Date().toISOString() })}>Skip</button>
        <div className="welcome-note">🔒 Saved only on this device. Never sent anywhere. We won’t ask again.</div>
      </div>
    </div>
  )
}
