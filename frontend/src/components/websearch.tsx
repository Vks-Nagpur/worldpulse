import { useEffect, useState } from 'react'
import { useLang } from '../i18n'
import { ago, Ext } from '../util'

// "From across the web": free, keyless sources that allow browser requests,
// shown in WorldPulse's own design. Wikipedia for background facts, GDELT for
// live news from outlets worldwide. Google's own search API is closed to new
// users (ends 1 Jan 2027), so Google is offered as a plain link only.

type WikiHit = { key: string; title: string; description?: string | null; excerpt: string; thumbnail?: { url: string } | null }
type NewsHit = { url: string; title: string; seendate: string; domain: string; sourcecountry?: string; language?: string }

const strip = (html: string) => {
  const d = document.createElement('div')
  d.innerHTML = html.replace(/<[^>]+>/g, '')
  return d.textContent || ''
}
const gdeltDate = (s: string) => s.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/, '$1-$2-$3T$4:$5:$6Z')

export function WebResults({ q }: { q: string }) {
  const lang = useLang()
  const [wiki, setWiki] = useState<WikiHit[] | null>(null)
  const [news, setNews] = useState<NewsHit[] | null>(null)
  const query = q.trim()
  useEffect(() => {
    setWiki(null); setNews(null)
    if (query.length < 2) return
    const ac = new AbortController()
    const tm = setTimeout(() => {
      const wl = lang === 'hi' ? 'hi' : 'en'
      fetch(`https://${wl}.wikipedia.org/w/rest.php/v1/search/page?limit=4&q=${encodeURIComponent(query)}`, { signal: ac.signal })
        .then((r) => r.json()).then((d) => setWiki((d.pages || []) as WikiHit[]), () => !ac.signal.aborted && setWiki([]))
      const words = query.split(/\s+/).filter((w) => w.length > 2 || /^[A-Z0-9]+$/.test(w))
      const gq = words.length > 1 ? `"${words.join(' ')}"` : words[0] || query
      fetch(`https://api.gdeltproject.org/api/v2/doc/doc?mode=artlist&format=json&maxrecords=12&timespan=7d&sort=hybridrel&query=${encodeURIComponent(gq + (lang === 'hi' ? '' : ' sourcelang:english'))}`, { signal: ac.signal })
        .then((r) => r.text()).then((txt) => { try { setNews((JSON.parse(txt).articles || []) as NewsHit[]) } catch { setNews([]) } }, () => !ac.signal.aborted && setNews([]))
    }, 500)
    return () => { clearTimeout(tm); ac.abort() }
  }, [query, lang])
  if (query.length < 2) return null
  const seen = new Set<string>()
  const newsRows = (news || []).filter((n) => { const k = n.title.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true }).slice(0, 8)
  return (
    <section className="web card">
      <div className="card-head"><h3>🌐 From across the web</h3>
        <a className="small" href={`https://www.google.com/search?q=${encodeURIComponent(query)}`} target="_blank" rel="noopener noreferrer">Open on Google ↗</a></div>
      <p className="sub">Live results for “{query}” from free public sources — Wikipedia for background, GDELT for news from outlets around the world.</p>

      <div className="web-h">📚 Background</div>
      {wiki == null ? <div className="skeleton" style={{ height: 60 }} /> : !wiki.length ? <div className="small faint">Nothing on Wikipedia for this.</div> : (
        <div className="web-wiki">{wiki.map((w) => (
          <a key={w.key} className="web-wcard" href={`https://${lang === 'hi' ? 'hi' : 'en'}.wikipedia.org/wiki/${encodeURIComponent(w.key)}`} target="_blank" rel="noopener noreferrer">
            {w.thumbnail?.url && <img src={w.thumbnail.url.startsWith('//') ? 'https:' + w.thumbnail.url : w.thumbnail.url} alt="" loading="lazy" />}
            <div style={{ minWidth: 0 }}><b>{w.title}</b>{w.description && <div className="small muted">{w.description}</div>}<div className="small web-ex">{strip(w.excerpt)}…</div></div>
          </a>))}</div>
      )}

      <div className="web-h">📰 Latest news worldwide (7 days)</div>
      {news == null ? <div className="skeleton" style={{ height: 80 }} /> : !newsRows.length ? <div className="small faint">No recent news found from this source. Try other words, or open on Google.</div> : (
        <div className="list">{newsRows.map((n) => (
          <div key={n.url} className="item"><div style={{ minWidth: 0 }}>
            <div className="t"><Ext href={n.url}>{n.title}</Ext></div>
            <div className="small muted">{n.domain}{n.sourcecountry ? ` · ${n.sourcecountry}` : ''} · {ago(gdeltDate(n.seendate))}</div>
          </div></div>))}</div>
      )}
      <div className="small faint" style={{ marginTop: 10 }}>Web results are not checked by WorldPulse. Wikipedia text is CC BY-SA.</div>
    </section>
  )
}
