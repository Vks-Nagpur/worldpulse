import { lazy, StrictMode, Suspense, useEffect, useState, type ComponentType } from 'react'
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
const page = <T,>(f: () => Promise<Record<string, T>>, name: string) => lazy(() => f().then((m) => ({ default: m[name] as unknown as ComponentType<Record<string, string>> })))
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

const PRIMARY: [string, string, string][] = [['/', '🌍', 'Home'], ['/markets', '📈', 'Markets'], ['/countries', '🌐', 'Countries'], ['/briefings', '📋', 'Briefings']]
const EXPLORE: [string, [string, string, string][]][] = [
  ['Topics', [['/conflict', '🛡️', 'Conflict & security'], ['/trade', '🚢', 'Trade & shipping'], ['/energy', '🛢️', 'Energy'], ['/policy', '🏛️', 'Policy & elections'], ['/quakes', '🌋', 'Earthquakes']]],
  ['Analysis', [['/risk', '🚦', 'Country risk'], ['/signals', '⚡', 'Signals'], ['/news', '📰', 'All news'], ['/markets?tab=fx', '💱', 'Currency watch']]],
  ['Tools', [['/ask', '💬', 'Ask WorldPulse'], ['/search', '🔎', 'Search'], ['/watch', '⭐', 'Watchlist & alerts'], ['/learn', '📘', 'Learn'], ['/about', '🧪', 'About & sources']]],
]
const BOTTOM: [string, string, string][] = [['/', '🌍', 'Home'], ['/markets', '📈', 'Markets'], ['/countries', '🌐', 'Countries'], ['/ask', '💬', 'Ask']]

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
  const meta = useData<Meta>('meta.json')
  const [path, query = ''] = route.split('?')
  useEffect(() => setMore(false), [route])
  useEffect(() => { import('./pages/tools').then((m) => m.evaluateAlerts()).catch(() => undefined) }, [])

  if (path.startsWith('/embed/')) return <Suspense fallback={<Loading rows={3} />}><EmbedWidget id={path.split('/')[2] || 'prices'} /></Suspense>

  const active = (href: string) => (href === '/' ? path === '/' : path.startsWith(href.split('?')[0]) || (href === '/countries' && (path.startsWith('/country/') || path === '/risk')) || (href === '/signals' && path.startsWith('/signal/')))
  const exploreActive = EXPLORE.some(([, items]) => items.some(([h]) => active(h))) && !PRIMARY.some(([h]) => active(h))
  const stale = meta.data && hoursSince(meta.data.generated_at) > 24
  return (
    <div className="app">
      <header className="nav-top">
        <div className="nav-inner">
          <a className="brand" href="#/" aria-label="WorldPulse home"><div className="brand-logo"><Logo /></div><b>WorldPulse</b></a>
          <nav className="nav-links" aria-label="Main">
            {PRIMARY.map(([href, , label]) => <a key={href} href={`#${href}`} className={active(href) ? 'active' : ''}>{t(label)}</a>)}
            <div className="explore">
              <button type="button" className={`explore-btn ${exploreActive || more ? 'active' : ''}`} onClick={() => setMore(!more)} aria-expanded={more}>{t('Explore')} ▾</button>
              {more && (
                <>
                  <div className="explore-bg" onClick={() => setMore(false)} />
                  <div className="explore-menu" role="menu">
                    {EXPLORE.map(([g, items]) => (
                      <div key={g}><div className="explore-h">{t(g)}</div>
                        {items.map(([href, icon, label]) => <a key={href} role="menuitem" href={`#${href}`} className={active(href) ? 'active' : ''}><span>{icon}</span>{t(label)}</a>)}</div>
                    ))}
                  </div>
                </>
              )}
            </div>
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
        <Suspense fallback={<Loading rows={6} />}><div className="page" key={path}><Router path={path} query={query} /></div></Suspense>
        <footer className="site-foot">WorldPulse · free &amp; open source · built only from public sources{meta.data ? ` · updated ${ago(meta.data.generated_at)}` : ''} · <a href="#/about">About &amp; sources</a></footer>
      </main>
      <nav className="bottom-nav" aria-label="Main">
        {BOTTOM.map(([href, icon, label]) => <a key={href} href={`#${href}`} className={active(href) ? 'active' : ''}><span>{icon}</span>{t(label)}</a>)}
        <button type="button" className={more || exploreActive ? 'active' : ''} onClick={() => setMore(true)}><span>☰</span>{t('More')}</button>
      </nav>
      {more && (
        <div className="mobile-only">
          <div className="sheet-bg" onClick={() => setMore(false)} />
          <div className="sheet" role="dialog" aria-label="More pages">
            <div className="sheet-grip" />
            {EXPLORE.map(([g, items]) => (
              <div key={g} style={{ marginBottom: 10 }}><div className="explore-h">{t(g)}</div>
                <div className="sheet-grid">{items.map(([href, icon, label]) => <a key={href} href={`#${href}`}><span>{icon}</span>{t(label)}</a>)}</div></div>
            ))}
            <a href="#/briefings" className="btn ghost" style={{ display: 'block', textAlign: 'center', marginTop: 4 }}>📋 {t('Briefings')}</a>
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

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)

// Offline support + installable app (production only).
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  addEventListener('load', () => navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => undefined))
}
