import { useEffect, useState } from 'react'
import type { CountrySummary, Event, EventDetail } from '../data'
import { load } from '../data'
import { t } from '../i18n'
import { ago, cat, compact, Ext, flag, fmtDate, VERIF } from '../util'
import { EXPLAINER_KEYS, VerifBadge } from './ui'

// Plain-language meaning of each topic, for readers new to the subject.
export const TOPIC_PLAIN: Record<string, string> = {
  military_security: 'A story about armed forces, attacks, defence or security incidents.',
  geopolitics: 'A story about power between countries or inside a government — for example sanctions, protests, coups or territorial disputes.',
  diplomacy: 'A story about how countries talk and agree with each other — meetings, peace talks, treaties, ambassadors.',
  elections: 'A story about voting, candidates or election results.',
  economics: 'A story about a country’s economy — prices (inflation), jobs, growth, interest rates, budgets or debt.',
  financial_markets: 'A story about stock markets, currencies, bonds or crypto — where shares and money are traded.',
  energy: 'A story about oil, gas, electricity or other energy supply and prices.',
  trade: 'A story about buying and selling between countries — tariffs (import taxes), exports, shipping and supply chains.',
  natural_disasters: 'A story about earthquakes, storms, floods, fires or other natural hazards.',
  technology: 'A story about technology companies, AI, chips or digital services.',
  cybersecurity: 'A story about hacking, data leaks or attacks on computer systems.',
  public_health: 'A story about diseases, outbreaks, hospitals or health policy.',
  environment: 'A story about climate, pollution or nature.',
  general: 'A news story that does not fit one of the main topics.',
}

export function Background({ e, names }: { e: Event; names: Record<string, CountrySummary> }) {
  const [d, setD] = useState<EventDetail | null>(null)
  const [err, setErr] = useState(false)
  useEffect(() => { load<EventDetail>(`events/${encodeURIComponent(e.id)}.json`).then(setD, () => setErr(true)) }, [e.id])
  const learn = EXPLAINER_KEYS.filter(([rx]) => rx.test(e.title))
  const places = [...new Set([e.country, ...e.countries].filter(Boolean) as string[])].slice(0, 3)
  const tl = d?.timeline.filter((a) => !a.dup) || []
  return (
    <div className="bg-panel">
      <div className="bg-row"><span className="bg-k">📌 What kind of story</span><span>{TOPIC_PLAIN[e.category] || TOPIC_PLAIN.general}</span></div>
      {places.length > 0 && (
        <div className="bg-row"><span className="bg-k">🌍 Where</span><span>{places.map((c) => {
          const x = names[c]
          return <span key={c} className="bg-place"><a href={`#/country/${c}`}>{flag(c)} {x?.name || c}</a>{x ? ` — ${x.region}${x.capital ? `, capital ${x.capital}` : ''}${x.population ? `, about ${compact(x.population.value)} people (World Bank ${x.population.period})` : ''}` : ''}</span>
        })}</span></div>
      )}
      <div className="bg-row"><span className="bg-k">✅ How sure is this?</span><span><VerifBadge v={e.verification} /> {VERIF[e.verification]?.tip}</span></div>
      {d && tl.length > 1 && (
        <div className="bg-row"><span className="bg-k">🕒 How it developed</span><span>
          First reported {fmtDate(tl[0].d)} by {tl[0].p || 'an outlet'}; {tl.length - 1} later report{tl.length > 2 ? 's' : ''}, most recent {ago(tl[tl.length - 1].d)}.
          <ul className="bg-list">{tl.slice(0, 3).map((a, i) => <li key={i}><Ext href={a.u}>{a.t}</Ext> <span className="faint">— {a.p}, {fmtDate(a.d)}</span></li>)}</ul></span></div>
      )}
      {d && d.related.length > 0 && (
        <div className="bg-row"><span className="bg-k">🔗 Connected stories</span><span><ul className="bg-list">{d.related.slice(0, 3).map((r) => (
          <li key={r.to + r.type}><a href={`#/event/${encodeURIComponent(r.to)}`}>{r.title}</a> <span className="faint">— {r.observed ? 'shared fact' : 'possible link, not proven'}: {r.evidence}</span></li>))}</ul></span></div>
      )}
      {!d && !err && <div className="skeleton" style={{ height: 14, width: '60%', margin: '6px 0' }} />}
      <div className="bg-row"><span className="bg-k">📘 {t('Learn')}</span><span>
        {learn.map(([, id, label]) => <a key={id} href={`#/learn/${id}`} className="bg-chip">{label}</a>)}
        <a href="#/learn/support" className="bg-chip">How to read trust labels</a>
        <a href={`#/event/${encodeURIComponent(e.id)}`} className="bg-chip">Full story & all sources →</a></span></div>
    </div>
  )
}

export function StoryCard({ e, names, rank }: { e: Event; names: Record<string, CountrySummary>; rank?: number }) {
  const [open, setOpen] = useState(false)
  const c = cat(e.category)
  const src = e.refs[0]
  const place = e.country ? names[e.country]?.name || e.country : null
  return (
    <article className="story">
      <div className="story-bar" style={{ background: c.color }} />
      <div className="story-body">
        <div className="story-top">
          {rank != null && <span className="story-rank">{rank}</span>}
          <span className="story-cat" style={{ color: c.color }}>{c.icon} {c.label}</span>
          {place && <a className="story-place" href={`#/country/${e.country}`}>{flag(e.country)} {place}</a>}
          <span className="faint">· {ago(e.started_at || e.first_detected)}</span>
        </div>
        <h3 className="story-title"><a href={`#/event/${encodeURIComponent(e.id)}`}>{e.title}</a></h3>
        <div className="story-meta">
          <VerifBadge v={e.verification} />
          {e.outlets > 1 && <span>📰 {e.outlets} outlets</span>}
          {src && <Ext href={src.u}>{src.p || 'source'} ↗</Ext>}
          <button type="button" className={`bg-btn ${open ? 'on' : ''}`} onClick={() => setOpen(!open)} aria-expanded={open}>💡 {open ? 'Hide background' : 'Background'}</button>
        </div>
        {open && <Background e={e} names={names} />}
      </div>
    </article>
  )
}
