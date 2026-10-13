import { useMemo, useState } from 'react'
import { StoryCard } from '../components/story'
import { Loading, PageHead, useCountries } from '../components/ui'
import type { CountryProfile, Event, MarketLatest } from '../data'
import { useData } from '../data'
import { Badge, byImportance, flag, frontWorthy, RISK } from '../util'

// "How does this affect me?" — a short daily note for one kind of reader, built only from
// published prices and stories. It says what moved and links the related news; it never
// claims that one thing caused another and never predicts.

type Role = 'family' | 'business' | 'investor' | 'traveller' | 'student' | 'farmer'
export const ROLES: { v: Role; icon: string; label: string; who: string }[] = [
  { v: 'family', icon: '🏠', label: 'Household budget', who: 'Fuel, food, gold and your currency' },
  { v: 'business', icon: '🚢', label: 'Import / export business', who: 'Currency, shipping routes, sanctions and tariffs' },
  { v: 'investor', icon: '📈', label: 'Investor', who: 'Share markets, gold, crypto and central banks' },
  { v: 'traveller', icon: '✈️', label: 'Traveller', who: 'Safety, disasters and money where you are going' },
  { v: 'student', icon: '🎓', label: 'Student abroad', who: 'Your study country, its currency and news' },
  { v: 'farmer', icon: '🌾', label: 'Farming & food', who: 'Grain prices, fertiliser, weather and trade rules' },
]

type Me = { role: Role; home: string; dest: string }
const KEY = 'worldpulse.me.v1'
export function readMe(): Me | null { try { const v = JSON.parse(localStorage.getItem(KEY) || 'null'); return v && v.role ? v : null } catch { return null } }
function saveMe(m: Me) { try { localStorage.setItem(KEY, JSON.stringify(m)) } catch { /* private mode */ } }

const GOLD = /\bgold (price|prices|rate|rates|futures|hits|rall\w*|record|demand)\b|\bbullion\b|\bprice of gold\b/i
const EURO = new Set(['AT', 'BE', 'HR', 'CY', 'EE', 'FI', 'FR', 'DE', 'GR', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PT', 'SK', 'SI', 'ES'])
const fmt = (v: number) => (Math.abs(v) >= 1000 ? v.toLocaleString(undefined, { maximumFractionDigits: 0 }) : v.toLocaleString(undefined, { maximumFractionDigits: 2 }))

type Line = { icon: string; text: string; tone: 'up' | 'down' | 'flat' | 'info'; why?: string; story?: Event | null; link?: string }

function priceLine(m: MarketLatest | undefined, icon: string, label: string, why: string, story?: Event | null): Line | null {
  if (!m || m.chg_5d == null) return null
  const w = m.chg_5d
  const move = Math.abs(w) < 1 ? 'is steady this week' : w > 0 ? `is up ${w.toFixed(1)}% this week` : `is down ${Math.abs(w).toFixed(1)}% this week`
  return { icon, text: `${label} ${move} (${fmt(m.last)} ${m.unit.replace('USD/', '$/')}, ${m.as_of}).`, tone: Math.abs(w) < 1 ? 'flat' : w > 0 ? 'up' : 'down', why, story, link: `#/markets?s=${encodeURIComponent(m.id)}` }
}

function fxLine(m: MarketLatest | undefined, cur: string): Line | null {
  if (!m || m.chg_5d == null) return null
  // USD/XXX up = the local currency buys fewer dollars = weaker
  const w = m.chg_5d
  const state = Math.abs(w) < 0.5 ? 'is steady against the US dollar this week' : w > 0 ? `is weaker against the US dollar this week (dollars ${w.toFixed(1)}% dearer)` : `is stronger against the US dollar this week (dollars ${Math.abs(w).toFixed(1)}% cheaper)`
  return { icon: '💱', text: `The ${cur} ${state}. 1 US dollar = ${fmt(m.last)} ${cur} (${m.as_of}).`, tone: Math.abs(w) < 0.5 ? 'flat' : w > 0 ? 'down' : 'up',
    why: 'A weaker currency makes imports, foreign travel and study abroad cost more; a stronger one makes them cheaper.', link: `#/markets?tab=fx` }
}

export function Impact() {
  const lt = useData<MarketLatest[]>('dashboard/markets_latest.json')
  const ev = useData<{ events: Event[] }>('events.json')
  const ch = useData<{ routes: { name: string; stories_7d: number; daily: [string, number][] }[] }>('chokepoints.json')
  const risk = useData<{ countries: { iso2: string; level: number; components: { component: string; level: number; reason: string }[] }[] }>('risk.json')
  const { list, by } = useCountries()
  const [me, setMe] = useState<Me | null>(readMe)
  const [draft, setDraft] = useState<Me>(me || { role: 'family', home: 'IN', dest: '' })
  const prof = useData<CountryProfile>(me?.home ? `countries/${me.home}.json` : null)
  const destProf = useData<CountryProfile>(me?.dest && ['traveller', 'student'].includes(me.role) ? `countries/${me.dest}.json` : null)

  const lines = useMemo(() => {
    if (!me || !lt.data || !ev.data) return null
    const get = (id: string) => lt.data!.find((x) => x.id === id)
    const evs = byImportance(ev.data.events.filter(frontWorthy))
    const find = (rx: RegExp, country?: string) => evs.find((e) => rx.test(e.title) && (!country || e.country === country || e.countries.includes(country))) || null
    const curOf = (iso: string, p?: CountryProfile | null) => (EURO.has(iso) ? 'EUR' : p?.currency || '')
    const fxFor = (iso: string, p?: CountryProfile | null) => { const c = curOf(iso, p); return c && c !== 'USD' ? [get(`fx:USD${c}`), c] as const : null }
    const home = me.home, out: Line[] = []
    const indexFor = (iso: string) => lt.data!.find((x) => x.kind === 'index' && x.country === iso && x.id !== 'mkt:^VIX')
    const oil = () => priceLine(get('mkt:BZ=F'), '🛢️', 'Brent crude oil', 'Petrol, diesel, transport and many goods are linked to oil prices.', find(/\b(oil|crude|brent)\b.*\b(price|prices|output|supply|barrel|exports?)\b|\bopec\b|\bbarrels?\b|oil (rises|falls|jumps|slips|surges|prices)/i))
    const fx = fxFor(home, prof.data)
    switch (me.role) {
      case 'family':
        out.push(oil()!, priceLine(get('mkt:ZW=F'), '🌾', 'Wheat', 'Wheat prices feed into bread, flour and other food costs.', find(/\bwheat\b|\bgrain (prices?|exports?|deal|shipments?)\b|food prices?/i))!,
          priceLine(get('mkt:GC=F'), '🪙', 'Gold', 'Gold is a common savings choice; its price matters for jewellery and savings.', find(GOLD))!)
        if (fx) out.push(fxLine(fx[0], fx[1])!)
        break
      case 'business': {
        if (fx) out.push(fxLine(fx[0], fx[1])!)
        out.push(oil()!)
        const busy = (ch.data?.routes || []).filter((r) => r.stories_7d >= 10).sort((a, b) => b.stories_7d - a.stories_7d).slice(0, 2)
        busy.forEach((r) => out.push({ icon: '⚓', text: `${r.name}: ${r.stories_7d} stories this week — a lot of news about this shipping route.`, tone: 'info', why: 'Trouble on a major route can delay shipments and raise freight and insurance costs.', story: find(new RegExp(r.name.split(' ').slice(-1)[0], 'i')), link: '#/trade?tab=routes' }))
        const sanc = find(/sanction|tariff|export control|embargo|duty/i, home) || find(/sanction|tariff|export control|embargo/i)
        if (sanc) out.push({ icon: '⚖️', text: 'Trade rules in the news: sanctions or tariffs are being reported.', tone: 'info', why: 'New tariffs or sanctions can change costs or block deals with some countries.', story: sanc, link: '#/trade' })
        break
      }
      case 'investor': {
        const idx = indexFor(home) || get('mkt:^GSPC')
        out.push(priceLine(idx, '📊', idx?.name || 'Share market', 'The main share index shows how big companies’ shares moved overall.', find(/stock|shares|market|sensex|nifty|wall street/i, home))!,
          priceLine(get('mkt:GC=F'), '🪙', 'Gold', 'Gold often draws money when investors are worried.', find(GOLD))!,
          priceLine(get('crypto:bitcoin'), '₿', 'Bitcoin', 'Crypto prices can swing sharply in both directions.', find(/bitcoin|crypto/i))!,
          priceLine(get('mkt:^VIX'), '😰', 'The US “fear index” (VIX)', 'A higher VIX means investors expect bigger price swings.', null)!)
        const cb = find(/central bank|interest rate|rate cut|rate hike|repo rate|federal reserve|\bfed\b|\brbi\b|\becb\b/i)
        if (cb) out.push({ icon: '🏦', text: 'Central banks and interest rates are in the news.', tone: 'info', why: 'Interest rate decisions affect loans, savings and share prices.', story: cb, link: '#/policy?tab=banks' })
        break
      }
      case 'traveller':
      case 'student': {
        const dest = me.dest
        if (!dest) break
        const r = risk.data?.countries.find((c) => c.iso2 === dest)
        const name = by[dest]?.name || dest
        out.push({ icon: '🚦', text: r ? `${name}: risk level ${RISK[r.level]?.label}. ${r.components.filter((c) => c.level > 0).slice(0, 2).map((c) => c.component).join(', ') || 'No major flags'}.` : `${name}: no risk flags recorded this week.`,
          tone: r && r.level >= 2 ? 'down' : 'info', why: 'Risk level combines conflict, sanctions, disasters and unusual signals. Always check official travel advice too.', link: `#/country/${dest}` })
        const fxd = fxFor(dest, destProf.data)
        if (fxd?.[0]) out.push(fxLine(fxd[0], fxd[1])!)
        else if (destProf.data?.currency) out.push({ icon: '💱', text: `${name} uses the ${destProf.data.currency}. WorldPulse doesn’t track this currency’s daily rate yet.`, tone: 'info' })
        const top = evs.find((e) => e.country === dest || e.countries.includes(dest))
        if (top) out.push({ icon: '📰', text: `Top story about ${name} this week.`, tone: 'info', story: top, link: `#/country/${dest}` })
        if (me.role === 'student') {
          const visa = find(/visa|student|universit|immigration|tuition/i, dest)
          if (visa) out.push({ icon: '🎓', text: `Study and visa news for ${name}.`, tone: 'info', why: 'Rule changes on visas or fees can affect students directly.', story: visa })
        }
        const dis = evs.find((e) => e.category === 'natural_disasters' && (e.country === dest || e.countries.includes(dest)))
        if (dis) out.push({ icon: '🌋', text: `Disaster news in ${name}.`, tone: 'down', story: dis, link: '#/quakes' })
        break
      }
      case 'farmer':
        out.push(priceLine(get('mkt:ZW=F'), '🌾', 'Wheat', 'World wheat prices influence what grain sells for.', find(/wheat|grain/i))!,
          priceLine(get('mkt:ZC=F'), '🌽', 'Corn (maize)', 'Corn prices matter for animal feed and food.', find(/corn|maize/i))!,
          priceLine(get('mkt:NG=F'), '🔥', 'Natural gas', 'Gas is a main input for making fertiliser.', find(/fertili[sz]er|urea|natural gas/i))!)
        { const tr = find(/export ban|food export|grain deal|fertili[sz]er|monsoon|drought|crop/i); if (tr) out.push({ icon: '🚜', text: 'Crops, fertiliser or food-trade rules are in the news.', tone: 'info', story: tr }) }
        break
    }
    return out.filter(Boolean)
  }, [me, lt.data, ev.data, ch.data, risk.data, prof.data, destProf.data, by])

  const needsDest = draft.role === 'traveller' || draft.role === 'student'
  const sorted = useMemo(() => [...list].sort((a, b) => a.name.localeCompare(b.name)), [list])
  const role = ROLES.find((r) => r.v === me?.role)
  return (
    <>
      <PageHead title="🎯 How does this affect me?" sub="Pick who you are. You get a short note on what moved this week and the related news — in plain words, with sources." />
      {!me || !lines ? null : (
        <div className="card impact-note">
          <div className="row spread"><h3>{role?.icon} Your note · {role?.label}{me.home ? ` · ${flag(me.home)} ${by[me.home]?.name || me.home}` : ''}{me.dest && needsDestFor(me.role) ? ` → ${flag(me.dest)} ${by[me.dest]?.name || me.dest}` : ''}</h3>
            <button type="button" className="icon-btn" onClick={() => setMe(null)}>✎ Change</button></div>
          {!lines.length && <p className="sub">Not enough data for this choice yet. Try another option.</p>}
          <div className="impact-lines">{lines.map((l, i) => (
            <div key={i} className={`impact-line t-${l.tone}`}>
              <div className="il-icon">{l.icon}</div>
              <div style={{ minWidth: 0 }}>
                <div className="il-text">{l.link ? <a href={l.link}>{l.text}</a> : l.text}</div>
                {l.why && <div className="small muted">{l.why}</div>}
                {l.story && <div className="il-story"><span className="small faint">Related news:</span> <a href={`#/event/${encodeURIComponent(l.story.id)}`}>{l.story.title}</a> <span className="small faint">· {l.story.outlets} outlet{l.story.outlets === 1 ? '' : 's'}</span></div>}
              </div>
            </div>))}</div>
          <p className="small faint" style={{ marginTop: 10 }}>Prices are daily closing values with their dates. “Related news” is shown next to a price; it doesn’t mean the story caused the move. Not financial or travel advice.</p>
        </div>
      )}
      {me && !lines && <Loading rows={4} />}
      {!me && (
        <div className="card">
          <h3>1. Who are you?</h3>
          <div className="role-grid">{ROLES.map((r) => (
            <button key={r.v} type="button" className={`role ${draft.role === r.v ? 'on' : ''}`} onClick={() => setDraft({ ...draft, role: r.v })}>
              <span className="role-i">{r.icon}</span><b>{r.label}</b><span className="small muted">{r.who}</span></button>))}</div>
          <h3 style={{ marginTop: 16 }}>2. {needsDest ? 'Your home country and where you are going' : 'Your country'}</h3>
          <div className="row" style={{ gap: 8, marginTop: 8 }}>
            <select className="input" value={draft.home} onChange={(e) => setDraft({ ...draft, home: e.target.value })} aria-label="Home country">
              {sorted.map((c) => <option key={c.iso2} value={c.iso2}>{flag(c.iso2)} {c.name}</option>)}</select>
            {needsDest && <select className="input" value={draft.dest} onChange={(e) => setDraft({ ...draft, dest: e.target.value })} aria-label="Destination">
              <option value="">✈️ Where are you going?</option>{sorted.map((c) => <option key={c.iso2} value={c.iso2}>{flag(c.iso2)} {c.name}</option>)}</select>}
          </div>
          <button type="button" className="btn" style={{ marginTop: 14 }} disabled={needsDest && !draft.dest} onClick={() => { saveMe(draft); setMe(draft) }}>Show my note →</button>
          <p className="small faint" style={{ marginTop: 8 }}>Saved on this device only.</p>
        </div>
      )}
      {me && lines && <TopForMe me={me} events={ev.data?.events} />}
      {me && (me.role === 'traveller' || me.role === 'student') && (
        <div className="card" style={{ marginTop: 14 }}><h3>🛂 Official travel advice</h3><p className="sub">Always check your government’s advice before travelling:</p>
          <div className="chips wrap"><a className="chip" href="https://www.mea.gov.in/" target="_blank" rel="noopener noreferrer">India — MEA</a>
            <a className="chip" href="https://travel.state.gov/content/travel/en/traveladvisories/traveladvisories.html" target="_blank" rel="noopener noreferrer">USA — State Department</a>
            <a className="chip" href="https://www.gov.uk/foreign-travel-advice" target="_blank" rel="noopener noreferrer">UK — FCDO</a></div></div>
      )}
    </>
  )
}
const needsDestFor = (r: Role) => r === 'traveller' || r === 'student'

function TopForMe({ me, events }: { me: Me; events?: Event[] }) {
  const { by } = useCountries()
  const cats: Record<Role, string[]> = { family: ['economics', 'energy'], business: ['trade', 'economics', 'geopolitics'], investor: ['financial_markets', 'economics'], traveller: [], student: [], farmer: ['trade', 'natural_disasters', 'environment'] }
  const where = me.dest && needsDestFor(me.role) ? me.dest : me.home
  const rows = byImportance((events || []).filter((e) => frontWorthy(e) && (e.country === where || e.countries.includes(where)) && (!cats[me.role].length || cats[me.role].includes(e.category)))).slice(0, 4)
  if (!rows.length) return null
  return <div style={{ marginTop: 14 }}><h3 className="section-title" style={{ margin: '0 2px 8px' }}>📌 Most relevant for you · {flag(where)} {by[where]?.name}</h3><div className="stack">{rows.map((e) => <StoryCard key={e.id} e={e} names={by} />)}</div><Badge tone="b-mute">Picked by topic and country</Badge></div>
}
