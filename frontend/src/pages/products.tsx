import { useMemo, useState } from 'react'
import { Sparkline } from '../components/charts'
import { Empty, ErrorBox, Loading, PageHead, useCountries } from '../components/ui'
import type { Item, MarketLatest } from '../data'
import { useData } from '../data'
import { Ext, flag, fmtDate } from '../util'

// Product watch: price (where a free daily price exists) + the countries and stories that
// news about this product names this week. Countries are "most mentioned in the news",
// not producers or exporters.

type Chain = { name: string; stories_7d: number; countries: [string, number][]; latest: Item[] }
type Product = { key: string; icon: string; name: string; plain: string; prices: string[]; chain?: string }
const PRODUCTS: Product[] = [
  { key: 'oil', icon: '🛢️', name: 'Crude oil', plain: 'Fuel for transport and industry; its price feeds into petrol, diesel and shipping costs.', prices: ['mkt:BZ=F', 'mkt:CL=F'], chain: 'Oil & gas' },
  { key: 'gas', icon: '🔥', name: 'Natural gas', plain: 'Used for electricity, heating and making fertiliser.', prices: ['mkt:NG=F'], chain: 'Oil & gas' },
  { key: 'gold', icon: '🪙', name: 'Gold', plain: 'Jewellery, savings and central bank reserves.', prices: ['mkt:GC=F'] },
  { key: 'silver', icon: '🥈', name: 'Silver & platinum', plain: 'Jewellery, electronics, solar panels and car parts.', prices: ['mkt:SI=F', 'mkt:PL=F'], chain: 'Metals & rare earths' },
  { key: 'copper', icon: '🟠', name: 'Copper & metals', plain: 'Wires, power grids, electric cars and construction.', prices: ['mkt:HG=F'], chain: 'Metals & rare earths' },
  { key: 'grain', icon: '🌾', name: 'Wheat & corn', plain: 'Bread, flour, animal feed and many foods.', prices: ['mkt:ZW=F', 'mkt:ZC=F'], chain: 'Food & grain' },
  { key: 'fert', icon: '🧪', name: 'Fertiliser', plain: 'Needed to grow most crops; made largely from natural gas.', prices: ['mkt:NG=F'], chain: 'Fertilizer' },
  { key: 'chips', icon: '💾', name: 'Computer chips', plain: 'In phones, cars, computers and almost every electronic device.', prices: [], chain: 'Semiconductors' },
  { key: 'pharma', icon: '💊', name: 'Medicines', plain: 'Drugs and their ingredients, often made in a few countries.', prices: [], chain: 'Pharmaceuticals' },
  { key: 'autos', icon: '🚗', name: 'Cars & EVs', plain: 'Car makers, batteries and electric vehicles.', prices: [], chain: 'Autos & EVs' },
  { key: 'ship', icon: '🚢', name: 'Shipping & freight', plain: 'Container ships, ports and freight that move goods worldwide.', prices: [], chain: 'Shipping & logistics' },
]

const fmt = (v: number) => (Math.abs(v) >= 1000 ? v.toLocaleString(undefined, { maximumFractionDigits: 0 }) : v.toLocaleString(undefined, { maximumFractionDigits: 2 }))
const chg = (v: number | null | undefined) => v == null ? <span className="faint">—</span> : <span className={v > 0 ? 'up' : v < 0 ? 'down' : ''}>{v > 0 ? '+' : ''}{v.toFixed(1)}%</span>

export function Products() {
  const lt = useData<MarketLatest[]>('dashboard/markets_latest.json')
  const sp = useData<{ note: string; chains: Chain[] }>('supply.json')
  const { by } = useCountries()
  const [open, setOpen] = useState<string>('oil')
  const chains = useMemo(() => Object.fromEntries((sp.data?.chains || []).map((c) => [c.name, c])), [sp.data])
  if (lt.error) return <ErrorBox error={lt.error} />
  if (!lt.data || !sp.data) return <Loading rows={6} />
  const price = (id: string) => lt.data!.find((m) => m.id === id)
  const cur = PRODUCTS.find((p) => p.key === open)!
  return (
    <>
      <PageHead title="📦 Product watch" sub="Prices of everyday raw materials and goods, and the news about them this week — in one place." />
      <div className="prod-grid">
        {PRODUCTS.map((p) => {
          const m = p.prices[0] ? price(p.prices[0]) : undefined
          const c = p.chain ? chains[p.chain] : undefined
          return (
            <button key={p.key} type="button" className={`prod ${open === p.key ? 'on' : ''}`} onClick={() => { setOpen(p.key); setTimeout(() => document.getElementById('prod-detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50) }}>
              <span className="prod-i">{p.icon}</span>
              <b>{p.name}</b>
              {m ? <span className="prod-p">{fmt(m.last)} <span className="faint small">{m.unit.replace('USD/', '$/')}</span> · {chg(m.chg_5d)} <span className="faint small">week</span></span>
                : <span className="prod-p small muted">{c ? `${c.stories_7d} stories this week` : 'News only'}</span>}
              {m?.spark && <Sparkline values={m.spark.slice(-30)} width={120} height={26} color="var(--accent)" />}
            </button>
          )
        })}
      </div>
      <ProductDetail p={cur} prices={cur.prices.map(price).filter(Boolean) as MarketLatest[]} chain={cur.chain ? chains[cur.chain] : undefined} names={by} />
      <p className="small faint" style={{ marginTop: 10 }}>{sp.data.note} Prices are delayed daily closes with their dates.</p>
    </>
  )
}

function ProductDetail({ p, prices, chain, names }: { p: Product; prices: MarketLatest[]; chain?: Chain; names: Record<string, { name: string }> }) {
  const max = Math.max(1, ...(chain?.countries || []).map((c) => c[1]))
  return (
    <div id="prod-detail" className="card scroll-anchor prod-detail">
      <h3 style={{ fontSize: 20 }}>{p.icon} {p.name}</h3>
      <p className="sub">{p.plain}</p>
      {prices.length > 0 && (
        <div className="table-wrap" style={{ marginTop: 8 }}><table>
          <thead><tr><th>Price</th><th>Latest</th><th>1 week</th><th>1 month</th><th>1 year</th></tr></thead>
          <tbody>{prices.map((m) => (
            <tr key={m.id} className="click" onClick={() => { location.hash = `/markets?s=${encodeURIComponent(m.id)}` }}>
              <td><b>{m.name}</b><div className="faint small">{fmtDate(m.as_of, false)}</div></td><td>{fmt(m.last)} <span className="faint small">{m.unit}</span></td>
              <td>{chg(m.chg_5d)}</td><td>{chg(m.chg_21d)}</td><td>{chg(m.chg_252d)}</td></tr>))}</tbody></table></div>
      )}
      {chain ? <>
        <h4 className="ex-h" style={{ marginTop: 14 }}>🌍 Countries most in this product’s news (7 days)</h4>
        <div className="hb" style={{ marginTop: 6 }}>{chain.countries.slice(0, 8).map(([iso, n]) => [
          <a key={iso + 'n'} href={`#/country/${iso}`}>{flag(iso)} {names[iso]?.name || iso}</a>,
          <div key={iso + 'b'} className="bar-bg"><div className="bar-fg" style={{ width: `${(n / max) * 100}%` }} /></div>,
          <b key={iso + 'c'} className="num">{n}</b>])}</div>
        <h4 className="ex-h" style={{ marginTop: 14 }}>📰 Latest news</h4>
        {chain.latest.length ? <div className="list">{chain.latest.slice(0, 6).map((a, i) => (
          <div key={i} className="item"><div style={{ minWidth: 0 }}><div className="t"><Ext href={a.u}>{a.t}</Ext></div><div className="small muted">{a.p} · {fmtDate(a.d)}</div></div></div>))}</div>
          : <Empty>No news about this product this week.</Empty>}
      </> : <p className="small muted" style={{ marginTop: 10 }}>Search the news: <a href={`#/search?q=${encodeURIComponent(p.name.split(' ')[0].toLowerCase())}`}>{p.name}</a></p>}
    </div>
  )
}
