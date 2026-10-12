import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { CountrySummary, Event, EventDetail } from '../data'
import { load } from '../data'
import { useLang } from '../i18n'
import { EXPLAINERS } from '../pages/explainers'
import { cat, compact, fmtDate, safeUrl, VERIF, ago } from '../util'
import { TOPIC_PLAIN } from './story'
import { EXPLAINER_KEYS } from './ui'

// "Understand this news": a plain-language explanation assembled only from
// stored facts (sources, timeline, connected stories, Wikipedia background,
// explainers) plus, when available, a short AI summary that passed automatic
// checks against those sources. It is typed out on screen.

type Block = { kind: 'h' | 'p' | 'li' | 'quote' | 'src'; text: string; href?: string; note?: string }

const WHY: Record<string, string> = {
  military_security: 'Armed conflict can cost lives, force people from their homes, and affect neighbouring countries, trade routes and energy prices.',
  geopolitics: 'Decisions like sanctions or changes in government can change who countries trade with and how businesses operate there.',
  diplomacy: 'Talks and agreements between countries can calm or worsen conflicts and change trade and travel rules.',
  elections: 'Election results decide who makes laws and policies, which can change a country’s direction, its economy and its relations abroad.',
  economics: 'Changes in prices, jobs, growth or interest rates affect what people pay, earn and borrow.',
  financial_markets: 'Market moves change the value of savings, pensions and company shares, and can signal what investors expect next.',
  energy: 'Energy prices feed into transport, electricity and the cost of making almost everything.',
  trade: 'Changes in trade rules can affect the price and availability of imported goods and the businesses that depend on them.',
  natural_disasters: 'Disasters can harm people and damage homes, roads, power and supply chains in the affected area.',
  technology: 'Technology decisions can affect jobs, products, prices and how people communicate.',
  cybersecurity: 'Cyberattacks can disrupt services people rely on and expose personal or business data.',
  public_health: 'Health developments can affect how people live, travel and work, and how hospitals cope.',
  environment: 'Environmental changes affect health, food, water and the cost of adapting to a changing climate.',
}

function buildBlocks(e: Event, d: EventDetail | null, names: Record<string, CountrySummary>, lang: string): Block[] {
  const b: Block[] = []
  const c = cat(e.category)
  const places = [...new Set([e.country, ...e.countries].filter(Boolean) as string[])].slice(0, 3)
  const placeText = places.map((p) => {
    const x = names[p]
    return x ? `${x.name} (${x.region}${x.capital ? `, capital ${x.capital}` : ''}${x.population ? `, about ${compact(x.population.value)} people` : ''})` : p
  })
  b.push({ kind: 'h', text: 'In short' })
  b.push({ kind: 'p', text: `“${e.title}.”` })
  const sm = d?.summary
  if (sm) {
    const txt = lang === 'hi' && sm.text_hi ? sm.text_hi : sm.text
    b.push({ kind: 'quote', text: txt, note: 'Summary written by a small open AI model from the reports below, then automatically checked: every name and number must appear in those reports.' })
  }
  const joined = placeText.length > 1 ? `${placeText.slice(0, -1).join(', ')} and ${placeText[placeText.length - 1]}` : placeText[0]
  b.push({ kind: 'p', text: `${(TOPIC_PLAIN[e.category] || TOPIC_PLAIN.general)}${placeText.length ? ` It concerns ${joined}.` : ''}` })

  const who = (d?.entities || []).filter((x) => ['person', 'organisation', 'group'].includes(x.kind)).slice(0, 5)
  if (who.length) {
    b.push({ kind: 'h', text: 'Who is involved' })
    who.forEach((x) => b.push({ kind: 'li', text: `${x.name} — ${x.kind === 'person' ? 'person' : x.kind === 'group' ? 'group' : 'organisation'}, named in ${x.mentions} report${x.mentions === 1 ? '' : 's'}` }))
  }

  b.push({ kind: 'h', text: 'How sure is this?' })
  const v = VERIF[e.verification]
  b.push({ kind: 'p', text: `${v ? v.tip : ''} ${e.outlets > 1 ? `${e.outlets} different news outlets reported it.` : 'So far one outlet has reported it, so treat it carefully until others confirm.'} First reported ${fmtDate(e.started_at || e.first_detected)}, latest report ${ago(e.last_updated)}.` })

  const disputes = d?.disputes || []
  if (disputes.length) {
    b.push({ kind: 'h', text: 'Where reports disagree' })
    disputes.forEach((x) => b.push({ kind: 'p', text: `Number ${x.kind}: ${x.figures.map((f) => `${f.value.toLocaleString()} (${f.reported_by.join(', ')})`).join(' vs ')}. ${x.note}` }))
  }

  const bg = d?.context?.background || []
  const arc = d?.context?.arc
  if (bg.length || arc) {
    b.push({ kind: 'h', text: 'How it started' })
    bg.slice(0, 2).forEach((x) => b.push({ kind: 'quote', text: x.extract, href: x.url, note: `Background from Wikipedia — “${x.title}”` }))
    if (arc) {
      b.push({ kind: 'p', text: `WorldPulse has found ${arc.reports} connected report${arc.reports === 1 ? '' : 's'} since ${fmtDate(arc.first_seen, false)}. The earliest it holds: “${arc.first_title}”${arc.first_publisher ? ` (${arc.first_publisher})` : ''}.` })
    }
  }

  const tl = (d?.timeline || []).filter((a) => !a.dup)
  if (tl.length > 1) {
    b.push({ kind: 'h', text: 'How it developed' })
    const pick = tl.length <= 4 ? tl : [tl[0], tl[Math.floor(tl.length / 3)], tl[Math.floor((2 * tl.length) / 3)], tl[tl.length - 1]]
    pick.forEach((a) => b.push({ kind: 'li', text: `${fmtDate(a.d)} — ${a.t}${a.p ? ` (${a.p})` : ''}`, href: a.u || undefined }))
  }
  if (arc?.earlier?.length) {
    b.push({ kind: 'h', text: 'Connected stories' })
    arc.earlier.slice(-4).forEach((x) => b.push({ kind: 'li', text: `${fmtDate(x.date, false)} — ${x.title}`, href: `#/event/${encodeURIComponent(x.id)}` }))
  } else if (d?.related?.length) {
    b.push({ kind: 'h', text: 'Connected stories' })
    d.related.slice(0, 3).forEach((r) => b.push({ kind: 'li', text: `${r.title}${r.observed ? '' : ' (possible link, not proven)'}`, href: `#/event/${encodeURIComponent(r.to)}` }))
  }

  const ex = EXPLAINER_KEYS.filter(([rx]) => rx.test(e.title)).map(([, id]) => EXPLAINERS.find((x) => x.id === id)).filter(Boolean) as typeof EXPLAINERS
  b.push({ kind: 'h', text: 'Why it matters' })
  b.push({ kind: 'p', text: WHY[e.category] || 'It may affect people, businesses or governments in the places involved.' })
  if (ex.length) {
    b.push({ kind: 'h', text: 'Words to know' })
    ex.slice(0, 3).forEach((x) => b.push({ kind: 'li', text: `${x.title}: ${x.body[0]}`, href: `#/learn/${x.id}` }))
  }
  const place = d?.context?.places?.[0]
  if (place) {
    b.push({ kind: 'h', text: `About ${names[place.iso2]?.name || place.title}` })
    b.push({ kind: 'quote', text: place.extract.split(/(?<=\.)\s/).slice(0, 2).join(' '), href: place.url, note: 'From Wikipedia' })
  }
  b.push({ kind: 'h', text: 'Sources' })
  ;(d?.refs || e.refs).slice(0, 4).forEach((r) => b.push({ kind: 'src', text: `${r.p || 'Source'} — ${r.t}`, href: r.u || undefined }))
  void c
  return b
}

export function ExplainPanel({ e, names, onClose }: { e: Event; names: Record<string, CountrySummary>; onClose: () => void }) {
  const [d, setD] = useState<EventDetail | null>(null)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    let live = true
    load<EventDetail>(`events/${encodeURIComponent(e.id)}.json`).then((x) => live && (setD(x), setReady(true)), () => live && setReady(true))
    return () => { live = false }
  }, [e.id])
  useEffect(() => {
    const esc = (ev: KeyboardEvent) => ev.key === 'Escape' && onClose()
    addEventListener('keydown', esc)
    addEventListener('hashchange', onClose)
    document.body.style.overflow = 'hidden'
    return () => { removeEventListener('keydown', esc); removeEventListener('hashchange', onClose); document.body.style.overflow = ''; speechSynthesis?.cancel() }
  }, [onClose])
  const lang = useLang()
  const blocks = useMemo(() => (ready ? buildBlocks(e, d, names, lang) : []), [ready, e, d, names, lang])
  return (
    <>
      <div className="sheet-bg" onClick={onClose} />
      <div className="explain" role="dialog" aria-modal="true" aria-label="Understand this news">
        <div className="sheet-grip" />
        <div className="explain-head">
          <div className="explain-badge">🧠</div>
          <div style={{ minWidth: 0 }}><div className="small muted">Understand this news</div><b className="explain-title">{e.title}</b></div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {!ready ? <div className="explain-thinking"><span /><span /><span /> Gathering the background…</div> : <Typewriter blocks={blocks} ai={!!d?.summary} />}
      </div>
    </>
  )
}

function Typewriter({ blocks, ai }: { blocks: Block[]; ai?: boolean }) {
  const total = blocks.reduce((n, b) => n + b.text.length, 0)
  const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
  const [shown, setShown] = useState(reduce ? total : 0)
  const [speaking, setSpeaking] = useState(false)
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (shown >= total) return
    const cps = Math.max(90, total / 9) // finish in about 9 seconds, never slower than 90 chars/s
    let last = performance.now()
    let raf = 0
    const step = (now: number) => {
      const add = Math.max(1, Math.round(((now - last) / 1000) * cps))
      last = now
      setShown((s) => Math.min(total, s + add))
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [total, shown >= total])
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }) }, [Math.floor(shown / 120)])
  const speak = () => {
    if (!('speechSynthesis' in window)) return
    if (speaking) { speechSynthesis.cancel(); setSpeaking(false); return }
    const u = new SpeechSynthesisUtterance(blocks.filter((b) => b.kind !== 'src').map((b) => b.text).join('. '))
    u.rate = 1; u.onend = () => setSpeaking(false)
    speechSynthesis.cancel(); speechSynthesis.speak(u); setSpeaking(true)
  }
  let left = shown
  const done = shown >= total
  return (
    <div className="explain-body">
      {blocks.map((b, i) => {
        if (left <= 0) return null
        const vis = b.text.slice(0, left)
        const complete = vis.length === b.text.length
        left -= b.text.length
        const typing = !complete
        const cursor = typing ? <span className="caret" /> : null
        const link = (txt: string) => (complete && b.href && safeUrl(b.href) ? <a href={b.href} target={b.href.startsWith('#') ? undefined : '_blank'} rel="noopener noreferrer nofollow">{txt}</a> : txt)
        if (b.kind === 'h') return <h4 key={i} className="ex-h">{vis}{cursor}</h4>
        if (b.kind === 'li') return <div key={i} className="ex-li">• {link(vis)}{cursor}</div>
        if (b.kind === 'src') return <div key={i} className="ex-src">↗ {link(vis)}{cursor}</div>
        if (b.kind === 'quote') return <blockquote key={i} className="ex-quote">{vis}{cursor}{complete && b.note && <div className="ex-note">{b.href ? <a href={b.href} target="_blank" rel="noopener noreferrer">{b.note} ↗</a> : b.note}</div>}</blockquote>
        return <p key={i} className="ex-p">{vis}{cursor}</p>
      })}
      <div ref={end} />
      <div className="explain-foot">
        {!done && <button type="button" className="btn ghost" onClick={() => setShown(total)}>Show all</button>}
        {'speechSynthesis' in window && <button type="button" className="btn ghost" onClick={speak}>{speaking ? '⏹ Stop' : '🔊 Read aloud'}</button>}
        <span className="small faint">{ai ? 'Put together from the sources shown; the summary was checked against them.' : 'Written automatically from the sources shown — nothing added.'} Wikipedia text is CC BY-SA.</span>
      </div>
    </div>
  )
}

export function ExplainButton({ e, names, small }: { e: Event; names: Record<string, CountrySummary>; small?: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className={`explain-btn ${small ? 'sm' : ''}`} onClick={(ev) => { ev.preventDefault(); ev.stopPropagation(); setOpen(true) }} title="Understand this news">
        🧠 {small ? 'Explain' : 'Understand this'}</button>
      {open && createPortal(<ExplainPanel e={e} names={names} onClose={() => setOpen(false)} />, document.body)}
    </>
  )
}
