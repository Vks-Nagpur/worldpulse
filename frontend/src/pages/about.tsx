import { useMemo } from 'react'
import { CountryBars, EventList, Loading, PageHead, Tiles, useCountries } from '../components/ui'
import type { Event, Meta, Risk, Source } from '../data'
import { BASE, REPO, useData } from '../data'
import { t } from '../i18n'
import { getFilters } from '../store'
import { ago, Badge, Ext, filterEvents, flag, fmtDate, RISK } from '../util'
import { PULSE, useLatest } from './today'
import { EXPLAINERS } from './explainers'

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
