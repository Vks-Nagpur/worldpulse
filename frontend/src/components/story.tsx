import { useEffect, useRef, useState } from 'react'
import type { CountrySummary, Event, EventDetail } from '../data'
import { load } from '../data'
import { t, useLang } from '../i18n'
import { ago, cat, compact, Ext, flag, fmtDate, VERIF } from '../util'
import { EXPLAINER_KEYS, VerifBadge } from './ui'
import { ExplainButton } from './explain'

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

// Facts for a story, shown the same way everywhere: small labelled chips.
export function StoryFacts({ e, names, dark }: { e: Event; names: Record<string, CountrySummary>; dark?: boolean }) {
  const place = e.country ? names[e.country]?.name || e.country : null
  const v = VERIF[e.verification]
  const tone = e.verification === 'single_source_report' ? 'warn' : 'ok'
  return (
    <div className="facts">
      {place && <a className="fact" href={`#/country/${e.country}`}>{flag(e.country)} {place}</a>}
      <span className="fact" title={fmtDate(e.started_at || e.first_detected)}>🕒 {ago(e.started_at || e.first_detected)}</span>
      {e.verification === 'multi_source_reporting' && e.outlets > 1
        ? <span className={`fact ${dark ? '' : 'ok'}`} title={v?.tip}>✔ {e.outlets} outlets report this</span>
        : <>
          <span className={`fact ${dark ? '' : tone}`} title={v?.tip}>{tone === 'ok' ? '✔' : '⚠'} {t(v?.label || e.verification)}</span>
          {e.outlets > 1 && <span className="fact">📰 {e.outlets} outlets</span>}
        </>}
      {whoClean(e.who, names).slice(0, 2).map((w) => <span key={w} className="fact acc">👤 {w}</span>)}
      {e.disputed && <span className="fact warn" title="Outlets report different numbers — see Understand this">⚖ Figures differ</span>}
    </div>
  )
}

const JUNK = /\b(invasion|expansion|attack|cyberattack|hackers?|heat|coastal|district|update|breaking|news|largest|fridges?|usgs|gdacs|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|county|state|slips?|rises?|falls?|stocks?|shares|hormuz|strait|ceasefire|war|crisis|deal)\b/i
const NATIONALITY = /^(american|british|chinese|russians?|ukrainians?|israelis?|palestinians?|iranians?|indians?|pakistanis?|saudis?|french|germans?|european|arabs?|western)$/i
/** Names of people/organisations only — no country names or nationality words. */
function whoClean(who: string[] | undefined, names: Record<string, CountrySummary>): string[] {
  const countries = Object.values(names).map((c) => c.name.toLowerCase())
  return (who || []).filter((w) => {
    const l = w.toLowerCase()
    return !NATIONALITY.test(w) && !JUNK.test(w) && w.split(' ').length <= 4 && !countries.some((c) => c === l || (!l.includes(' ') && c.startsWith(l)))
  })
}

export function storySummary(e: Event, lang: string): { text: string; by: string } | null {
  if (lang === 'hi' && e.sum_hi) return { text: e.sum_hi, by: 'Checked summary' }
  if (e.sum) return { text: e.sum, by: e.ai ? 'Checked summary' : e.sum_by ? `From ${e.sum_by}` : '' }
  return null
}

export function LeadStory({ e, names, n, of }: { e: Event; names: Record<string, CountrySummary>; n?: number; of?: number }) {
  const lang = useLang()
  const c = cat(e.category)
  const sm = storySummary(e, lang)
  const src = e.refs[0]
  return (
    <article className="lead">
      <div className="lead-kicker"><span className="live"><i /> Top story{n && of ? ` ${n}/${of}` : ''}</span><span>{c.icon} {c.label}</span></div>
      <h2><a href={`#/event/${encodeURIComponent(e.id)}`}>{e.title}</a></h2>
      {sm && <p className="lead-sum">{e.ai && <span className="ai-tag" title="Written by a small open AI model from the reports, then checked: every name and number must appear in them">✨ AI summary</span>}{sm.text}</p>}
      <div className="story-foot">
        <StoryFacts e={e} names={names} dark />
        <span className="row" style={{ gap: 8 }}>
          {src && <Ext href={src.u}>{src.p || 'Source'} ↗</Ext>}
          <ExplainButton e={e} names={names} />
        </span>
      </div>
    </article>
  )
}

export function StoryCard({ e, names, rank, fresh }: { e: Event; names: Record<string, CountrySummary>; rank?: number; fresh?: boolean }) {
  const lang = useLang()
  const c = cat(e.category)
  const sm = storySummary(e, lang)
  const src = e.refs[0]
  return (
    <article className="story">
      <div className="story-bar" style={{ background: c.color }} />
      <div className="story-body">
        <div className="story-top">
          {rank != null && <span className="story-rank">{rank}</span>}
          {fresh && <span className="new-dot" title="New since your last visit">New</span>}
          <span className="story-cat" style={{ color: c.color }}>{c.icon} {c.label}</span>
          {src?.p && <span className="faint">· {src.p}</span>}
        </div>
        <h3 className="story-title"><a href={`#/event/${encodeURIComponent(e.id)}`}>{e.title}</a></h3>
        {sm && <p className="story-sum">{e.ai && <span className="ai-tag" title="Written by a small open AI model from the reports, then checked: every name and number must appear in them">✨ AI summary</span>}{sm.text}</p>}
        <div className="story-foot">
          <StoryFacts e={e} names={names} />
          <ExplainButton e={e} names={names} small />
        </div>
      </div>
    </article>
  )
}

/** Swipeable slider of the biggest stories. Native scroll-snap so swiping feels natural on phones;
 *  arrows and dots on laptops; moves on by itself every 5 s (pausing 5 s after a touch). */
export function TopSlider({ items, names }: { items: Event[]; names: Record<string, CountrySummary> }) {
  const track = useRef<HTMLDivElement>(null)
  const [i, setI] = useState(0)
  const last = useRef(0) // time of the reader's last touch; auto-advance waits 5 s after it
  const go = (k: number) => {
    const el = track.current
    if (!el) return
    const n = (k + items.length) % items.length
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
    el.scrollTo({ left: n * el.clientWidth, behavior: reduce ? 'auto' : 'smooth' })
  }
  useEffect(() => {
    const el = track.current
    if (!el) return
    const on = () => setI(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)))
    el.addEventListener('scroll', on, { passive: true })
    return () => el.removeEventListener('scroll', on)
  }, [])
  useEffect(() => {
    if (items.length < 2) return
    const id = setInterval(() => {
      if (document.hidden || Date.now() - last.current < 5000) return
      go(i + 1)
    }, 5000)
    return () => clearInterval(id)
  }, [i, items.length])
  useEffect(() => { track.current?.scrollTo({ left: 0 }); setI(0) }, [items])
  const stop = () => { last.current = Date.now() }
  return (
    <section className="slider" aria-roledescription="carousel" aria-label="Top stories">
      <div className="slider-track" ref={track} onPointerDown={stop} onTouchStart={stop} onWheel={stop}>
        {items.map((e, k) => <div className="slide" key={e.id}><LeadStory e={e} names={names} n={k + 1} of={items.length} /></div>)}
      </div>
      {items.length > 1 && <>
        <button type="button" className="slider-arrow prev" aria-label="Previous story" onClick={() => { stop(); go(i - 1) }}>‹</button>
        <button type="button" className="slider-arrow next" aria-label="Next story" onClick={() => { stop(); go(i + 1) }}>›</button>
        <div className="slider-dots">{items.map((e, k) => <button type="button" key={e.id} className={k === i ? 'on' : ''} aria-label={`Story ${k + 1}`} onClick={() => { stop(); go(k) }} />)}</div>
      </>}
    </section>
  )
}

/** The biggest stories, one per subject: skip a story if an earlier pick has the same country and topic. */
export function topPicks(rows: Event[], n = 6): Event[] {
  const out: Event[] = []
  const seen = new Set<string>()
  for (const e of rows) {
    if (e.verification === 'single_source_report') continue
    const k = `${e.country || ''}|${e.category}`
    if (seen.has(k)) continue
    seen.add(k); out.push(e)
    if (out.length >= n) break
  }
  return out.length ? out : rows.slice(0, 1)
}
