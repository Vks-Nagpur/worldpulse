import { useMemo } from 'react'
import { CountryBars, EventList, Loading, PageHead, Tiles, useCountries } from '../components/ui'
import type { Event, Meta, Risk, Source } from '../data'
import { BASE, REPO, useData } from '../data'
import { t } from '../i18n'
import { getFilters } from '../store'
import { ago, Badge, Ext, filterEvents, flag, fmtDate, RISK } from '../util'
import { PULSE, useLatest } from './today'

type Quality = { ok: boolean; problems: string[]; checks: { check: string; ok: boolean; detail: string }[]; generated_at?: string }

export function About() {
  const { data } = useData<{ sources: Source[]; generated_at: string }>('sources.json')
  const meta = useData<Meta>('meta.json')
  const q = useData<Quality>('quality.json')
  const feed = `${location.origin}${location.pathname}${BASE.replace(/^\.?\//, '')}feed.xml`.replace(/([^:])\/\//g, '$1/')
  const tone: Record<string, string> = { ok: 'b-ok', failing: 'b-bad', disabled: 'b-mute', never_run: 'b-warn' }
  return (
    <>
      <PageHead title={`🧪 ${t('About & sources')}`} sub="Where every number comes from, whether each source worked on the latest run, and how WorldPulse works. Free for everyone: no sign-in, no ads, no paid data." />
      <div className="grid g2">
        <div className="card">
          <h3>🩺 Data status</h3>
          <p className="sub">Latest run {meta.data ? `${fmtDate(meta.data.generated_at)} (${ago(meta.data.generated_at)})` : '…'}. Data refreshes about every 3 hours; GitHub may delay scheduled runs.</p>
          {q.data ? <div className="list">{q.data.checks.map((c) => <div key={c.check} className="item"><span>{c.ok ? '✅' : '⚠️'}</span><div><b>{c.check}</b><div className="small muted">{c.detail}</div></div></div>)}</div> : <Loading rows={3} />}
          <p className="small faint">If a check fails, an issue is opened automatically in the project’s GitHub repository.</p>
        </div>
        <div className="card">
          <h3>🔗 Use &amp; share for free</h3>
          <ul className="small" style={{ paddingLeft: 18, lineHeight: 1.9 }}>
            <li><b>Install as an app:</b> phone browser menu → “Add to Home screen” / “Install app”. On a laptop, use the install icon in the address bar.</li>
            <li><b>RSS feed</b> of top developments for any news reader: <a href={feed}>{feed}</a></li>
            <li><b>Embed widgets</b> on your own website: <a href="#/embed">get the code</a></li>
            <li><b>Suggest a free source:</b> <Ext href={`${REPO}/issues/new?template=source_suggestion.yml`}>open a suggestion</Ext></li>
            <li><b>Report a wrong item:</b> <Ext href={`${REPO}/issues/new?template=wrong_item.yml`}>report it</Ext></li>
            <li><b>Contribute or run your own copy:</b> <Ext href={REPO}>source code on GitHub</Ext> (open source)</li>
          </ul>
        </div>
      </div>
      <div className="card" style={{ marginTop: 14 }}>
        <h3>Source health</h3><p className="sub">A failing source never stops the others. Only headlines, short excerpts and links are stored; no paywalls are bypassed.</p>
        {!data ? <Loading /> : (
          <div className="table-wrap"><table><thead><tr><th>Source</th><th>Status</th><th className="hide-sm">Last success</th><th style={{ textAlign: 'right' }}>Items</th><th className="hide-sm">Last error</th></tr></thead>
            <tbody>{[...data.sources].sort((a, b) => (a.status === 'failing' ? -1 : 0) - (b.status === 'failing' ? -1 : 0) || a.name.localeCompare(b.name)).map((s) => (
              <tr key={s.id}><td><b>{s.name}</b><div className="fresh">{s.type}{s.tags?.length ? ` · ${s.tags.join(', ')}` : ''}</div></td>
                <td><Badge tone={tone[s.status] || 'b-mute'}><span className="dot" />{s.status.replace('_', ' ')}</Badge></td><td className="hide-sm">{ago(s.last_success)}</td>
                <td className="num">{s.last_items ?? '—'}</td><td className="small hide-sm" style={{ color: 'var(--bad)', maxWidth: 300 }}>{s.last_error}</td></tr>))}</tbody></table></div>
        )}
      </div>
      <div className="grid g2" style={{ marginTop: 14 }}>
        <div className="card"><h3>How it works</h3>
          <ol className="muted small" style={{ paddingLeft: 18, lineHeight: 1.8 }}>
            <li>Fetch public feeds politely (timeouts, retries, per-site limits).</li><li>Normalize dates, links, headlines and language.</li>
            <li>Remove duplicates: same link, same page, same headline, near-identical headline.</li><li>Sort topics with open keyword rules (each item shows its keywords) and tag countries.</li>
            <li>Group related headlines into developments; add instrument data (USGS) and official alerts (GDACS).</li><li>Detect unusual changes against recent normal levels.</li>
            <li>Link developments as observed facts or hypotheses — never as cause.</li><li>Write briefings from extracted facts only, with numbered sources.</li>
            <li>Run automatic quality checks, then publish compact files for this site.</li></ol></div>
        <div className="card"><h3>What WorldPulse does not do</h3>
          <ul className="muted small" style={{ paddingLeft: 18, lineHeight: 1.8 }}>
            <li>No live tick-by-tick prices (those need paid licences). Prices are delayed daily closes.</li><li>No full articles or paywall bypassing.</li>
            <li>No “truth scores” for outlets — only measurable facts (official or not, how many outlets, corrections).</li><li>No predictions. Signals describe unusual data, with their limits.</li>
            <li>No made-up content. If evidence is missing, the site says so.</li><li>No accounts, tracking or ads. Watchlists and alerts stay in your browser.</li></ul></div>
      </div>
    </>
  )
}

// ---------------------------------------------------------------- Learn (explainers)
type Ex = { id: string; title: string; body: string[]; refs: [string, string][] }
export const EXPLAINERS: Ex[] = [
  { id: 'hormuz', title: 'Strait of Hormuz', body: ['A narrow sea passage between Iran and Oman that links the Persian Gulf to the Gulf of Oman and the Arabian Sea.', 'Much of the crude oil and liquefied natural gas exported by Gulf producers passes through it, so security incidents or threats there are watched closely by energy and shipping markets.', 'WorldPulse counts headlines that mention it in the Chokepoint watch; that measures reporting, not tanker traffic.'], refs: [['U.S. EIA — World oil transit chokepoints', 'https://www.eia.gov/international/analysis/special-topics/World_Oil_Transit_Chokepoints']] },
  { id: 'red-sea', title: 'Red Sea route & Bab el-Mandeb', body: ['The Bab el-Mandeb strait connects the Red Sea to the Gulf of Aden; together with the Suez Canal it forms the shortest sea route between Asia and Europe.', 'When ships avoid the route because of attacks or risk, many sail around Africa instead, which takes longer and can raise freight and insurance costs.'], refs: [['U.S. EIA — World oil transit chokepoints', 'https://www.eia.gov/international/analysis/special-topics/World_Oil_Transit_Chokepoints']] },
  { id: 'suez', title: 'Suez Canal', body: ['An Egyptian canal linking the Mediterranean and the Red Sea, operated by the Suez Canal Authority.', 'Blockages or diversions affect container shipping, oil and gas flows, and delivery times between Asia and Europe.'], refs: [['Suez Canal Authority', 'https://www.suezcanal.gov.eg']] },
  { id: 'opec', title: 'OPEC and OPEC+', body: ['OPEC is an organisation of oil-producing countries; “OPEC+” adds other producers that coordinate output with it, such as Russia.', 'Their production decisions are among the developments oil markets follow most closely, because changes in planned supply can move prices.'], refs: [['OPEC — official site', 'https://www.opec.org']] },
  { id: 'sanctions', title: 'Sanctions & export controls', body: ['Sanctions restrict dealings with named countries, companies or people (for example asset freezes or bans on transactions). Export controls restrict selling certain goods or technology abroad.', 'They are legal measures: news reports are a starting point, but businesses must check the official lists and texts before acting.'], refs: [['U.S. Treasury — OFAC sanctions', 'https://ofac.treasury.gov'], ['EU sanctions map', 'https://www.sanctionsmap.eu'], ['UK sanctions list', 'https://www.gov.uk/government/publications/the-uk-sanctions-list']] },
  { id: 'tariffs', title: 'Tariffs', body: ['A tariff is a tax on imported goods. It can make imports more expensive and may lead trading partners to respond with their own tariffs.', 'The World Trade Organization publishes tariff data and trade rules.'], refs: [['WTO — tariffs', 'https://www.wto.org/english/tratop_e/tariffs_e/tariffs_e.htm']] },
  { id: 'rates', title: 'Central bank interest rates', body: ['Central banks set a policy interest rate (for example the RBI repo rate or the US federal funds rate target) to influence borrowing costs and inflation.', 'Rate decisions are published on the banks’ own websites; WorldPulse collects their press releases under Policy & elections → Central banks.'], refs: [['Reserve Bank of India', 'https://www.rbi.org.in'], ['US Federal Reserve', 'https://www.federalreserve.gov'], ['European Central Bank', 'https://www.ecb.europa.eu']] },
  { id: 'oil-benchmarks', title: 'Oil benchmarks: Brent and WTI', body: ['Brent and West Texas Intermediate (WTI) are reference prices for crude oil. WorldPulse shows front-month futures prices, which are delayed daily closes from a free source.', 'Futures “roll” from one month to the next, which can create small artificial jumps in a long price chart.'], refs: [['U.S. EIA — petroleum prices', 'https://www.eia.gov/petroleum/']] },
  { id: 'fx', title: 'Exchange rates', body: ['WorldPulse shows how many units of a currency one US dollar buys (ECB reference rates, published once per business day). A higher number means that currency got weaker against the dollar.', 'Importers usually pay more when their currency weakens; exporters may earn more in local currency.'], refs: [['ECB — euro foreign exchange reference rates', 'https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html'], ['RBI — reference rate', 'https://www.rbi.org.in']] },
  { id: 'gas', title: 'Natural gas prices', body: ['WorldPulse shows the US Henry Hub natural gas futures price. Gas prices differ by region (for example Europe and Asia have their own benchmarks), so one price does not describe every market.'], refs: [['U.S. EIA — natural gas', 'https://www.eia.gov/naturalgas/']] },
  { id: 'nato', title: 'NATO', body: ['The North Atlantic Treaty Organization is a military alliance of countries in Europe and North America. Members agree to defend each other if one is attacked.', 'News about NATO is usually about defence spending, military exercises, new members or the alliance’s response to conflicts near its borders.'], refs: [['NATO — official site', 'https://www.nato.int']] },
  { id: 'unsc', title: 'United Nations & the Security Council', body: ['The United Nations is an organisation of almost every country in the world. Its Security Council is the body that can approve sanctions or peacekeeping missions.', 'Five permanent members (China, France, Russia, the United Kingdom and the United States) can each block a Security Council decision with a veto.'], refs: [['UN Security Council', 'https://www.un.org/securitycouncil/']] },
  { id: 'ceasefire', title: 'Ceasefire', body: ['A ceasefire is an agreement to stop fighting, for a set time or until talks produce a longer deal. It is not the same as a peace agreement.', 'Reports about ceasefires often disagree on whether it is holding; WorldPulse shows each report with its source so you can compare.'], refs: [] },
  { id: 'inflation', title: 'Inflation', body: ['Inflation means prices in general are rising, so the same money buys less. It is usually measured as the yearly change in consumer prices.', 'Central banks often raise interest rates when inflation is high and cut them when it is low.'], refs: [['IMF — What is inflation?', 'https://www.imf.org/en/Publications/fandd/issues/Series/Back-to-Basics/Inflation']] },
  { id: 'gdp', title: 'GDP (gross domestic product)', body: ['GDP is the total value of goods and services a country produces in a period. “GDP growth” is how much that value rose or fell, usually after removing inflation.', 'WorldPulse shows World Bank GDP figures with their year; they are annual and not live.'], refs: [['World Bank — GDP data', 'https://data.worldbank.org/indicator/NY.GDP.MKTP.CD']] },
  { id: 'recession', title: 'Recession', body: ['A recession is a period when a country’s economy shrinks and activity, jobs and incomes fall, rather than grow.', 'Different countries and organisations use different official definitions, so news reports may disagree on whether a recession has started.'], refs: [] },
  { id: 'houthis', title: 'The Houthis', body: ['The Houthis are an armed movement in Yemen that controls much of the country’s north, including the capital Sanaa.', 'They appear in news about attacks on shipping in the Red Sea and about the conflicts in Yemen and the wider Middle East.'], refs: [] },
  { id: 'gaza', title: 'Gaza', body: ['Gaza (the Gaza Strip) is a small Palestinian territory on the Mediterranean coast, bordering Israel and Egypt.', 'It has been at the centre of repeated wars between Israel and Hamas, the armed group that governed it. Casualty and damage figures are often disputed; WorldPulse shows who reported each figure.'], refs: [['UN OCHA — occupied Palestinian territory', 'https://www.ochaopt.org']] },
  { id: 'taiwan', title: 'Taiwan & China', body: ['Taiwan is a self-governing island off China’s coast. The government in Beijing considers it part of China and has not ruled out using force to take control.', 'News often covers Chinese military activity near Taiwan, Taiwan’s politics and its large semiconductor (computer-chip) industry.'], refs: [] },
  { id: 'support', title: 'How to read “support” labels', body: ['Measured: recorded by an instrument network (USGS). Official alert: issued by a monitoring body (GDACS). Official source: published by a government or institution.', 'Several outlets: two or more outlets reported it — they may repeat the same original report, so this is not independent confirmation. One outlet: an unverified claim so far.'], refs: [] },
  { id: 'signals', title: 'What a signal means', body: ['A signal compares a number (news coverage, a price, earthquake counts) with its recent normal level. It appears when the gap is unusually large.', 'It is not a prediction. More reporting about a country does not always mean more is happening there.'], refs: [] },
]

export function Learn({ id }: { id?: string }) {
  const ex = EXPLAINERS.find((x) => x.id === id)
  return (
    <>
      <PageHead title={`📘 ${t('Learn')}`} sub="Short explainers for topics that come up often. Each links to official references." />
      {ex && (
        <div className="card explainer" style={{ marginBottom: 14 }}>
          <h3>{ex.title}</h3>{ex.body.map((p) => <p key={p}>{p}</p>)}
          {ex.refs.length > 0 && <><b className="small">Official references</b><ul className="ref-list">{ex.refs.map(([l, u]) => <li key={u}><Ext href={u}>{l}</Ext></li>)}</ul></>}
        </div>
      )}
      <div className="grid g3">
        {EXPLAINERS.filter((x) => x.id !== id).map((x) => (
          <a key={x.id} href={`#/learn/${x.id}`} className="card" style={{ color: 'var(--text)', textDecoration: 'none' }}><b>{x.title}</b><div className="small muted" style={{ marginTop: 6 }}>{x.body[0]}</div></a>
        ))}
      </div>
    </>
  )
}

// ---------------------------------------------------------------- Embed widgets
const WIDGETS: [string, string, number][] = [['prices', 'Key prices', 330], ['oil', 'Oil & gas prices', 200], ['conflict', 'Conflict watch (top developments)', 460], ['risk', 'Country risk (top countries)', 420], ['trade', 'Trade & shipping news', 460]]

export function EmbedInfo() {
  const base = `${location.origin}${location.pathname}`
  return (
    <>
      <PageHead title="🧩 Embed widgets" sub="Put a free, always-updated WorldPulse box on your own website or blog. Copy the code and paste it into your page’s HTML." />
      <div className="grid g2">
        {WIDGETS.map(([id, label, h]) => (
          <div key={id} className="card"><h3>{label}</h3>
            <pre>{`<iframe src="${base}#/embed/${id}" width="100%" height="${h}" style="border:0;border-radius:12px" loading="lazy" title="WorldPulse ${label}"></iframe>`}</pre>
            <a href={`#/embed/${id}`} className="small">Preview →</a></div>
        ))}
      </div>
    </>
  )
}

export function EmbedWidget({ id }: { id: string }) {
  const lt = useLatest()
  const ev = useData<{ events: Event[] }>(id === 'conflict' || id === 'trade' ? 'events.json' : null)
  const risk = useData<{ countries: Risk[] }>(id === 'risk' ? 'risk.json' : null)
  const { by, regionOf } = useCountries()
  const rows = useMemo(() => (ev.data ? filterEvents(ev.data.events, { ...getFilters(), country: '', region: '', q: '', hours: 72, support: 'multi' }, regionOf, id === 'trade' ? 'trade' : 'conflict') : null), [ev.data, id, regionOf])
  const site = `${location.origin}${location.pathname}`
  return (
    <div className="embed-body">
      {id === 'prices' && <Tiles items={lt.data} ids={PULSE} onPick={() => window.open(`${site}#/markets`, '_blank')} />}
      {id === 'oil' && <Tiles items={lt.data} ids={PULSE.slice(0, 3)} onPick={() => window.open(`${site}#/energy`, '_blank')} />}
      {(id === 'conflict' || id === 'trade') && <div className="card"><h3>{id === 'trade' ? '🚢 Trade & shipping' : '🛡️ Conflict watch'} <span className="small muted">(72 h)</span></h3><EventList rows={rows} step={5} names={by} /></div>}
      {id === 'risk' && <div className="card"><h3>🚦 Country risk</h3>{risk.data ? risk.data.countries.slice(0, 8).map((r) => (
        <div key={r.iso2} className="row spread small" style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}><span>{flag(r.iso2)} {r.name}</span><Badge tone={RISK[r.level].tone}>{RISK[r.level].label}</Badge></div>)) : <Loading />}</div>}
      {id === 'map' && <CountryBars rows={rows} />}
      <div className="fresh" style={{ marginTop: 6, textAlign: 'right' }}><a href={site} target="_blank" rel="noopener">WorldPulse</a> · free public data</div>
    </div>
  )
}
