import { Component, lazy, StrictMode, Suspense, useEffect, useState, type ComponentType, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import { Loading, ToastHost } from './components/ui'
import { Welcome } from './components/welcome'
import { SearchBox } from './components/searchbox'
import type { Meta } from './data'
import { useData } from './data'
import { setLang, t, useLang } from './i18n'
import { ago, hoursSince } from './util'

// Pages load on demand so the first screen is small and fast.
// After a new version is published, an open tab may ask for page files that no longer exist.
// Try again once, then reload the page once to pick up the new version (never loops).
const RELOADED = 'worldpulse.reloaded'
function freshReload() {
  try { if (sessionStorage.getItem(RELOADED) === '1') return false; sessionStorage.setItem(RELOADED, '1') } catch { return false }
  location.reload()
  return true
}
setTimeout(() => { try { sessionStorage.removeItem(RELOADED) } catch { /* ignore */ } }, 15000)
addEventListener('vite:preloadError', (ev) => { if (freshReload()) ev.preventDefault() })
const load = <T,>(f: () => Promise<T>): Promise<T> => f().catch(() => new Promise<T>((ok, bad) => setTimeout(() => f().then(ok, (err) => { freshReload(); bad(err) }), 800)))
const page = <T,>(f: () => Promise<Record<string, T>>, name: string) => lazy(() => load(f).then((m) => ({ default: m[name] as unknown as ComponentType<Record<string, string>> })))

/** Never a blank screen: if a page fails, say so in plain words and offer a reload. */
class Boundary extends Component<{ children: ReactNode; resetKey: string }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidUpdate(prev: { resetKey: string }) { if (prev.resetKey !== this.props.resetKey && this.state.failed) this.setState({ failed: false }) }
  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="card" style={{ textAlign: 'center', padding: '36px 18px' }}>
        <div style={{ fontSize: 40 }}>🔄</div>
        <h3 style={{ margin: '8px 0' }}>This page didn’t load properly</h3>
        <p className="sub">WorldPulse may have just been updated. Reloading usually fixes it.</p>
        <button type="button" className="btn" onClick={() => location.reload()}>Reload</button>
        <a className="btn ghost" href="#/" style={{ marginLeft: 8 }}>Go home</a>
      </div>
    )
  }
}
const Today = page(() => import('./pages/today'), 'Today')
const Markets = page(() => import('./pages/markets'), 'Markets')
const Energy = page(() => import('./pages/markets'), 'Energy')
const Trade = page(() => import('./pages/trade'), 'Trade')
const Conflict = page(() => import('./pages/trade'), 'Conflict')
const RiskPage = page(() => import('./pages/countries'), 'RiskPage')
const Countries = page(() => import('./pages/countries'), 'Countries')
const Country = page(() => import('./pages/countries'), 'Country')
const EventDetail = page(() => import('./pages/detail'), 'EventDetail')
const Signals = page(() => import('./pages/detail'), 'Signals')
const SignalDetail = page(() => import('./pages/detail'), 'SignalDetail')
const News = page(() => import('./pages/detail'), 'News')
const Quakes = page(() => import('./pages/detail'), 'Quakes')
const WorldMap = page(() => import('./pages/map'), 'WorldMap')
const Impact = page(() => import('./pages/impact'), 'Impact')
const Products = page(() => import('./pages/products'), 'Products')
const Crises = page(() => import('./pages/crises'), 'Crises')
const Calendar = page(() => import('./pages/calendar'), 'Calendar')
const StressPage = page(() => import('./pages/stress'), 'StressPage')
const CrisisPage = page(() => import('./pages/crises'), 'CrisisPage')
const Policy = page(() => import('./pages/policy'), 'Policy')
const Briefings = page(() => import('./pages/policy'), 'Briefings')
const Ask = page(() => import('./pages/tools'), 'Ask')
const Search = page(() => import('./pages/tools'), 'Search')
const Watch = page(() => import('./pages/tools'), 'Watch')
const About = page(() => import('./pages/about'), 'About')
const Learn = page(() => import('./pages/about'), 'Learn')
const EmbedInfo = page(() => import('./pages/about'), 'EmbedInfo')
const EmbedWidget = page(() => import('./pages/about'), 'EmbedWidget')

function useRoute() {
  const [h, setH] = useState(location.hash.slice(1) || '/')
  useEffect(() => {
    const f = () => { setH(location.hash.slice(1) || '/'); window.scrollTo({ top: 0 }) }
    addEventListener('hashchange', f)
    return () => removeEventListener('hashchange', f)
  }, [])
  return h
}

function useTheme() {
  const pref = () => { try { return localStorage.getItem('worldpulse.theme') } catch { return null } }
  const [th, setTh] = useState<string>(pref() || 'light')
  useEffect(() => {
    document.documentElement.dataset.theme = th
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', th === 'dark' ? '#0b1120' : '#4f46e5')
    try { localStorage.setItem('worldpulse.theme', th) } catch { /* ignore */ }
  }, [th])
  return [th, () => setTh(th === 'dark' ? 'light' : 'dark')] as const
}

type BIP = Event & { prompt: () => Promise<void> }
function useInstall() {
  const [evt, setEvt] = useState<BIP | null>(null)
  useEffect(() => {
    const f = (e: Event) => { e.preventDefault(); setEvt(e as BIP) }
    addEventListener('beforeinstallprompt', f)
    return () => removeEventListener('beforeinstallprompt', f)
  }, [])
  return evt ? () => { evt.prompt(); setEvt(null) } : null
}

// Site map: four sections, each page with a one-line description.
type NavItem = [string, string, string, string]
const SECTIONS: [string, string, NavItem[]][] = [
  ['World', '🌍', [['/stress', '🌡️', 'World Stress Index', 'How tense the world is today'], ['/map', '🗺️', 'World map', 'Tap any country to see what is happening'],
    ['/explain', '🧭', 'Big conflicts, explained', 'How they started, who is involved'], ['/countries', '🌐', 'Countries', 'A profile for every country'],
    ['/risk', '🚦', 'Country risk', 'Traffic-light levels by country'], ['/calendar', '📅', 'Coming up', 'Elections and interest-rate decisions']]],
  ['Money', '💰', [['/markets', '📈', 'Markets', 'Prices and charts'], ['/markets?tab=fx', '💱', 'Currency watch', 'Currencies against the US dollar'],
    ['/products', '📦', 'Product watch', 'Oil, grain, metals, chips…'], ['/energy', '🛢️', 'Energy', 'Oil and gas prices with the news'],
    ['/trade', '🚢', 'Trade & shipping', 'Sanctions, tariffs, sea routes, supply chains']]],
  ['News', '📰', [['/news', '📰', 'All news', 'Every headline from the last 3 days'], ['/conflict', '🛡️', 'Conflict & security', 'Wars, attacks and security'],
    ['/policy', '🏛️', 'Policy & elections', 'Governments, central banks, elections'], ['/quakes', '🌋', 'Earthquakes', 'Measured by USGS'],
    ['/briefings', '📋', 'Briefings', 'Daily and weekly summaries'], ['/signals', '⚡', 'Unusual activity', 'Numbers moving much faster than normal']]],
  ['For you', '🎯', [['/me', '🎯', 'How does this affect me?', 'A short note for your situation'], ['/watch', '⭐', 'Watchlist & alerts', 'Follow countries, prices, topics'],
    ['/ask', '💬', 'Ask WorldPulse', 'Ask a question in plain words'], ['/search', '🔎', 'Search', 'Stories, countries, prices and the web'],
    ['/learn', '📘', 'Learn the words', 'Simple explanations of news terms'], ['/about', '🧪', 'About & sources', 'Where everything comes from']]],
]
const BOTTOM: [string, string, string][] = [['/', '🏠', 'Home'], ['/map', '🗺️', 'Map'], ['/markets', '📈', 'Markets'], ['/me', '🎯', 'For you']]

function Router({ path, query }: { path: string; query: string }) {
  const parts = path.split('/').filter(Boolean)
  const id = decodeURIComponent(parts[1] || '')
  switch (parts[0]) {
    case undefined: return <Today />
    case 'markets': return <Markets query={query} key={query} />
    case 'energy': return <Energy />
    case 'trade': return <Trade query={query} key={query} />
    case 'conflict': return <Conflict />
    case 'risk': return <RiskPage />
    case 'countries': return <Countries />
    case 'country': return <Country code={id} key={id} />
    case 'event': return <EventDetail id={id} key={id} />
    case 'signals': return <Signals />
    case 'signal': return <SignalDetail id={id} key={id} />
    case 'news': return <News />
    case 'quakes': return <Quakes />
    case 'map': return <WorldMap />
    case 'me': return <Impact />
    case 'products': return <Products />
    case 'calendar': return <Calendar />
    case 'stress': return <StressPage />
    case 'explain': return id ? <CrisisPage id={id} key={id} /> : <Crises />
    case 'policy': return <Policy query={query} key={query} />
    case 'briefings': return <Briefings query={query} />
    case 'ask': return <Ask />
    case 'search': return <Search initial={new URLSearchParams(query).get('q') || ''} />
    case 'watch': return <Watch />
    case 'learn': return <Learn id={id} key={id} />
    case 'embed': return <EmbedInfo />
    case 'about': return <About />
    default: return <div className="empty">Page not found. <a href="#/">Go to Today</a></div>
  }
}

function App() {
  const route = useRoute()
  const lang = useLang()
  const [theme, toggle] = useTheme()
  const install = useInstall()
  const [more, setMore] = useState(false)
  const [sec, setSec] = useState<string | null>(null)
  const meta = useData<Meta>('meta.json')
  const [path, query = ''] = route.split('?')
  useEffect(() => { setMore(false); setSec(null) }, [route])
  useEffect(() => { import('./pages/tools').then((m) => m.evaluateAlerts()).catch(() => undefined) }, [])

  if (path.startsWith('/embed/')) return <Suspense fallback={<Loading rows={3} />}><EmbedWidget id={path.split('/')[2] || 'prices'} /></Suspense>

  const active = (href: string) => (href === '/' ? path === '/' : path.startsWith(href.split('?')[0]) || (href === '/countries' && (path.startsWith('/country/') || path === '/risk')) || (href === '/signals' && path.startsWith('/signal/')))
  const secActive = (items: NavItem[]) => items.some(([h]) => active(h))
  const exploreActive = SECTIONS.some(([, , items]) => secActive(items)) && !BOTTOM.some(([h]) => active(h))
  const stale = meta.data && hoursSince(meta.data.generated_at) > 24
  return (
    <div className="app">
      <header className="nav-top">
        <div className="nav-inner">
          <a className="brand" href="#/" aria-label="WorldPulse home"><div className="brand-logo"><Logo /></div><b>WorldPulse</b></a>
          <nav className="nav-links" aria-label="Main">
            <a href="#/" className={path === '/' ? 'active' : ''}>{t('Home')}</a>
            {SECTIONS.map(([g, icon, items]) => (
              <div key={g} className="explore">
                <button type="button" className={`explore-btn ${secActive(items) || sec === g ? 'active' : ''}`} onClick={() => setSec(sec === g ? null : g)} aria-expanded={sec === g}>{icon} {t(g)} ▾</button>
                {sec === g && <>
                  <div className="explore-bg" onClick={() => setSec(null)} />
                  <div className="explore-menu mega" role="menu">
                    {items.map(([href, ic, label, desc]) => <a key={href} role="menuitem" href={`#${href}`} className={active(href) ? 'active' : ''}><span className="mi">{ic}</span><span><b>{t(label)}</b><small>{desc}</small></span></a>)}
                  </div>
                </>}
              </div>
            ))}
          </nav>
          <SearchBox />
          <div className="nav-actions">
            <button type="button" className="icon-btn" onClick={() => setLang(lang === 'hi' ? 'en' : 'hi')} aria-label={t('Language')} title={t('Language')}>{lang === 'hi' ? 'EN' : 'हि'}</button>
            <button type="button" className="icon-btn" onClick={toggle} aria-label="Toggle theme">{theme === 'dark' ? '☀️' : '🌙'}</button>
            {install && <button type="button" className="icon-btn hide-sm" onClick={install}>⬇ {t('Install app')}</button>}
          </div>
        </div>
      </header>
      <main className="main">
        {stale && <div className="soft-note">🕒 News on this page was last updated {ago(meta.data!.generated_at)}. It refreshes automatically.</div>}
        <Boundary resetKey={path + query}><Suspense fallback={<Loading rows={6} />}><div className="page" key={path}><Router path={path} query={query} /></div></Suspense></Boundary>
        <footer className="site-foot">WorldPulse · free &amp; open source · built only from public sources{meta.data ? ` · updated ${ago(meta.data.generated_at)}` : ''} · <a href="#/about">About &amp; sources</a></footer>
      </main>
      <nav className="bottom-nav" aria-label="Main">
        {BOTTOM.map(([href, icon, label]) => <a key={href} href={`#${href}`} className={active(href) ? 'active' : ''}><span>{icon}</span>{t(label)}</a>)}
        <button type="button" className={`more-fab ${more || exploreActive ? 'active' : ''}`} onClick={() => setMore(true)} aria-label={t('More')}><span className="mf-icon"><i /><i /><i /><i /></span>{t('More')}</button>
      </nav>
      {more && (
        <div className="mobile-only">
          <div className="sheet-bg" onClick={() => setMore(false)} />
          <div className="sheet more-sheet" role="dialog" aria-label="More pages">
            <div className="sheet-grip" />
            <div className="ms-head"><div><b>All of WorldPulse</b><span>Pick a page</span></div><button type="button" className="icon-btn" onClick={() => setMore(false)} aria-label="Close">✕</button></div>
            {SECTIONS.map(([g, icon, items], si) => (
              <section key={g} className={`ms-sec ms-${si}`}><div className="ms-h"><span>{icon}</span>{t(g)}</div>
                <div className="sheet-grid">{items.map(([href, ic, label]) => <a key={href} href={`#${href}`} className={active(href) ? 'active' : ''}><span>{ic}</span>{t(label)}</a>)}</div></section>
            ))}
            {install && <button type="button" className="btn" style={{ width: '100%', marginTop: 10 }} onClick={install}>⬇ {t('Install app')}</button>}
          </div>
        </div>
      )}
      <ToastHost />
      <Welcome />
    </div>
  )
}
const Logo = () => <svg width="20" height="20" viewBox="0 0 24 24"><path d="M2 13h4l3-7 5 13 3-6h5" stroke="white" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>

createRoot(document.getElementById('root')!).render(<StrictMode><Boundary resetKey="app"><App /></Boundary></StrictMode>)

// Offline support + installable app (production only).
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  addEventListener('load', () => navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => undefined))
}
