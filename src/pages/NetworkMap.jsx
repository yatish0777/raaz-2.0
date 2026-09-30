import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Download } from 'lucide-react'
import { getNxGlobal, listCases } from '../lib/api'
import { ROLES, inr, inrShort, short, FRAUD_SHORT } from '../lib/format'
import { Address, ErrorBox, Loading, NetworkBadge, PageHeader, RiskBadge, useAsync } from '../components/ui'
import { RoleGlyph } from '../components/TxGraph'

// One operator group drawn as a flow: complaints (left) -> shared wallet(s) (centre) -> exchanges (right).
// Cases are linked because money from each complaint passes through the same fraudster-controlled wallet.
const ROW = 34
const W = 920
const X_CASE = 250
const X_HUB = 520
const X_EX = 700

function GroupFlow({ grp, casesById, nodeById, onOpen }) {
  const rows = grp.cases
    .map((id) => ({ id, c: casesById[id], n: nodeById[id] }))
    .sort((a, b) => (b.n?.amount_lost_inr || 0) - (a.n?.amount_lost_inr || 0))
  const exchanges = [...new Set(rows.map((r) => r.n?.nearest_exchange).filter(Boolean))]
  const exCount = Object.fromEntries(exchanges.map((e) => [e, rows.filter((r) => r.n?.nearest_exchange === e).length]))
  const H = Math.max(rows.length, 3) * ROW + 24
  const maxLost = Math.max(...rows.map((r) => r.n?.amount_lost_inr || 0), 1)
  const yCase = (i) => 20 + i * ROW
  const hubs = grp.shared_wallets
  const yHub = (j) => H / 2 + (j - (hubs.length - 1) / 2) * 40
  const yEx = (k) => H / 2 + (k - (exchanges.length - 1) / 2) * 44
  const curve = (x1, y1, x2, y2) => `M${x1},${y1} C${(x1 + x2) / 2},${y1} ${(x1 + x2) / 2},${y2} ${x2},${y2}`

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full min-w-[640px]" role="img"
      aria-label={`${rows.length} complaints linked through ${hubs.length} shared wallet(s) to ${exchanges.length} exchange(s)`}>
      {/* complaint -> hub */}
      {rows.map((r, i) => hubs.map((h, j) => (
        <path key={r.id + h} d={curve(X_CASE + 6, yCase(i), X_HUB - 10, yHub(j))} fill="none"
          stroke="var(--color-navy-600)" strokeOpacity="0.35" strokeWidth={1 + 6 * Math.sqrt((r.n?.amount_lost_inr || 0) / maxLost)} />
      )))}
      {/* hub -> exchange */}
      {hubs.map((h, j) => exchanges.map((e, k) => (
        <path key={h + e} d={curve(X_HUB + 10, yHub(j), X_EX - 8, yEx(k))} fill="none"
          stroke="var(--color-brand-600)" strokeOpacity="0.45" strokeWidth={1.5 + 2.5 * exCount[e]} />
      )))}

      {/* complaints */}
      {rows.map((r, i) => (
        <g key={r.id} transform={`translate(0,${yCase(i)})`} className="cursor-pointer" onClick={() => onOpen(r.id)}>
          <title>{`${r.id}: ${r.c?.fraud_type || ''}, ${inr(r.n?.amount_lost_inr || 0)} lost. Click to open.`}</title>
          <rect x="0" y={-ROW / 2 + 2} width={X_CASE + 10} height={ROW - 4} fill="transparent" />
          <text x="0" y="-2" fontSize="14" fontWeight="600" fill="var(--color-navy-900)" style={{ fontFamily: 'var(--font-cond)' }}>{r.id}</text>
          <text x="0" y="12" fontSize="11.5" fill="var(--color-ink-3)">{r.c ? `${r.c.district}, ${r.c.state}` : ''}</text>
          <text x={X_CASE - 12} y="4" fontSize="12.5" textAnchor="end" fill="var(--color-ink)" className="tabular">{inrShort(r.n?.amount_lost_inr || 0)}</text>
          <circle cx={X_CASE} cy="0" r="5" fill="var(--color-navy-900)" />
        </g>
      ))}

      {/* shared wallets */}
      {hubs.map((h, j) => (
        <g key={h} transform={`translate(${X_HUB},${yHub(j)})`}>
          <rect x="-10" y="-10" width="20" height="20" rx="2" fill="var(--color-stamp)" />
          <text y="-18" textAnchor="middle" fontSize="12" fontWeight="600" fill="var(--color-stamp-ink)">Shared wallet</text>
          <text y="28" textAnchor="middle" fontSize="11.5" fill="var(--color-ink-2)" style={{ fontFamily: 'var(--font-mono)' }}>{short(h, 6, 5)}</text>
        </g>
      ))}

      {/* exchanges */}
      {exchanges.map((e, k) => (
        <g key={e} transform={`translate(${X_EX},${yEx(k)})`}>
          <circle r="6" fill="var(--color-brand-600)" />
          <text x="14" y="-1" fontSize="13.5" fontWeight="600" fill="var(--color-navy-900)">{e}</text>
          <text x="14" y="14" fontSize="11.5" fill="var(--color-ink-3)">{exCount[e]} complaint{exCount[e] === 1 ? '' : 's'} cash out here</text>
        </g>
      ))}
      {!exchanges.length && (
        <text x={X_EX} y={H / 2} fontSize="12.5" fill="var(--color-ink-3)">No exchange reached yet</text>
      )}
    </svg>
  )
}

export default function NetworkMap() {
  const nav = useNavigate()
  const { data, error, loading } = useAsync(() => Promise.all([getNxGlobal(), listCases()]), [])

  const m = useMemo(() => {
    if (!data) return null
    const [nx, cases] = data
    const casesById = Object.fromEntries(cases.map((c) => [c.id, c]))
    const nodeById = Object.fromEntries(nx.case_nodes.map((n) => [n.id, n]))
    const groups = [...nx.groups].sort((a, b) => b.total_lost_inr - a.total_lost_inr)
    const unlinked = nx.case_nodes.filter((n) => n.group == null).sort((a, b) => b.amount_lost_inr - a.amount_lost_inr)
    return { nx, casesById, nodeById, groups, unlinked }
  }, [data])

  if (loading) return <Loading />
  if (error) return <ErrorBox error={error} />
  const { nx, casesById, nodeById, groups, unlinked } = m
  const s = nx.stats
  const linkedLost = groups.reduce((t, g) => t + g.total_lost_inr, 0)

  return (
    <div className="mx-auto max-w-[1280px]">
      <PageHeader
        title="Network map"
        subtitle={`${s.linked_cases} of ${s.cases} complaints trace back to one of ${s.shared_wallets} wallets the fraudsters reuse. Each wallet below is probably one operator, so one joint request can cover every complaint in its group.`}
        actions={<a href="/data/nx/png/global_case_links.png" download className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:underline"><Download size={15} /> Download graph image</a>}
      />

      <dl className="mb-8 grid grid-cols-2 border-y border-line sm:grid-cols-4">
        {[
          ['Operator groups', s.linked_groups],
          ['Complaints in a group', `${s.linked_cases} of ${s.cases}`],
          ['Lost across groups', inrShort(linkedLost)],
          ['Wallets analysed', s.wallets.toLocaleString('en-IN')],
        ].map(([k, v]) => (
          <div key={k} className="border-line px-4 py-3 [&:not(:first-child)]:border-l">
            <dt className="text-xs text-ink-3">{k}</dt>
            <dd className="tabular font-cond text-2xl font-semibold text-navy-900">{v}</dd>
          </div>
        ))}
      </dl>

      <div className="space-y-10">
        {groups.map((grp, i) => (
          <section key={grp.id} aria-labelledby={`grp-${grp.id}`}>
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3 border-b border-line pb-2">
              <h2 id={`grp-${grp.id}`} className="text-xl font-semibold text-navy-900">
                Operator group {i + 1}: {grp.size} complaints, {inrShort(grp.total_lost_inr)} lost
              </h2>
              <div className="flex items-center gap-2 text-sm text-ink-2">
                {grp.networks.map((n) => <NetworkBadge key={n} network={n} long />)}
              </div>
            </div>
            <p className="mb-3 max-w-[80ch] text-sm text-ink-2">
              Money from every complaint here passes through {grp.shared_wallets.length === 1 ? 'the same wallet' : `the same ${grp.shared_wallets.length} wallets`}
              {grp.exchanges.length ? <> before cashing out at {grp.exchanges.join(' and ')}. Send one joint request to {grp.exchanges.length === 1 ? 'that exchange' : 'these exchanges'} covering all {grp.size} complaints.</> : '. No exchange reached yet, so keep the shared wallet on the watchlist.'}
            </p>
            <div className="overflow-x-auto rounded-md border border-line bg-white px-5 py-4">
              <GroupFlow grp={grp} casesById={casesById} nodeById={nodeById} onOpen={(id) => nav(`/cases/${id}`)} />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-3">
              <span>Shared wallet{grp.shared_wallets.length > 1 ? 's' : ''}:</span>
              {grp.shared_wallets.map((w) => <Address key={w} value={w} head={10} tail={8} />)}
            </div>
          </section>
        ))}
      </div>

      <section className="mt-12">
        <div className="mb-3 flex items-baseline justify-between gap-3 border-b border-line pb-2">
          <h2 className="text-xl font-semibold text-navy-900">No link found yet</h2>
          <span className="text-xs text-ink-3">{unlinked.length} complaints, largest loss first</span>
        </div>
        <p className="mb-3 max-w-[80ch] text-sm text-ink-2">
          These complaints share no fraudster wallet with any other case so far. They are re-checked every time a new complaint is traced.
        </p>
        <ul className="flex flex-wrap gap-1.5">
          {unlinked.map((n) => (
            <li key={n.id}>
              <Link to={`/cases/${n.id}`} title={`${FRAUD_SHORT[casesById[n.id]?.fraud_type] || ''}, ${inrShort(n.amount_lost_inr)} lost`}
                className="inline-flex items-center gap-2 rounded border border-line bg-white px-2 py-1 text-sm hover:border-brand-600">
                <span className="font-cond font-semibold text-navy-900">{n.id}</span>
                <span className="tabular text-xs text-ink-3">{inrShort(n.amount_lost_inr)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <div className="mt-12 grid gap-10 lg:grid-cols-5">
        <section className="lg:col-span-3">
          <div className="mb-3 flex items-baseline justify-between gap-3 border-b border-line pb-2">
            <h2 className="text-xl font-semibold text-navy-900">Busiest wallets</h2>
            <span className="text-xs text-ink-3">Most connections in the merged graph</span>
          </div>
          <div className="overflow-x-auto rounded-md border border-line bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-line text-left text-xs text-ink-3">
                <tr>
                  <th className="px-4 py-2 font-medium">Wallet</th>
                  <th className="px-3 py-2 font-medium">What it is</th>
                  <th className="px-3 py-2 text-right font-medium">Connections</th>
                  <th className="px-4 py-2 text-right font-medium">Complaints</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {nx.top_wallets.map((w) => (
                  <tr key={w.id}>
                    <td className="px-4 py-2"><span className="flex items-center gap-1.5"><NetworkBadge network={w.network} /><Address value={w.id} head={6} tail={4} copy={false} /></span></td>
                    <td className="px-3 py-2"><span className="inline-flex items-center gap-1.5 text-ink-2"><RoleGlyph role={w.role} size={10} />{w.entity || ROLES[w.role].label}</span></td>
                    <td className="tabular px-3 py-2 text-right">{w.degree}</td>
                    <td className="tabular px-4 py-2 text-right">{w.cases.length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="lg:col-span-2">
          <div className="mb-3 border-b border-line pb-2">
            <h2 className="text-xl font-semibold text-navy-900">How the links are found</h2>
          </div>
          <ol className="list-decimal space-y-2 pl-5 text-sm text-ink-2">
            <li>Every case's transaction graph is merged into one NetworkX graph ({s.wallets.toLocaleString('en-IN')} wallets, {s.transfers.toLocaleString('en-IN')} transfers).</li>
            <li>Two complaints are linked when they share a wallet the fraudsters control. Exchange hot wallets, mixers and bridges are ignored, because unrelated people use them too.</li>
            <li>Linked complaints are grouped with connected components. Each group is one probable operator.</li>
          </ol>
          <p className="mt-3 text-xs text-ink-3">A shared wallet is a strong lead, not proof. Confirm with the exchange's KYC reply before merging cases.</p>
        </section>
      </div>
    </div>
  )
}
