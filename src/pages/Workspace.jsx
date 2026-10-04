import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  Activity, ArrowRight, BadgeCheck, Building2, Clock, FileText, Gauge, GitBranch, Globe, Layers, Network, Radar, Route, ScanSearch,
  TableProperties, TriangleAlert, Users, Waypoints,
} from 'lucide-react'
import { addToWatchlist, getCase, listCases, listExchanges } from '../lib/api'
import { NETWORKS, ROLES, dt, inr, inrShort, token } from '../lib/format'
import {
  Address, Card, ErrorBox, Loading, NetworkBadge, PriorityBadge, RiskBadge, StatusBadge, Tabs, btn, useAsync,
} from '../components/ui'
import TxGraph, { RoleGlyph } from '../components/TxGraph'
import NxTab from './workspace/NxTab'
import { AttributionTab, ClustersTab, FundFlowTab, PatternsTab, RiskTab, TimelineTab, TransactionsTab } from './workspace/tabs'
import { dateLocale, t, tMessage } from '../i18n'

/** Wallets on any path from the reported wallet to the nearest exchange (+ its hot-wallet sweep) */
function pathToNearest(d) {
  const n0 = d.attributions[0]
  if (!n0) return new Set()
  const hopOf = Object.fromEntries(d.nodes.map((n) => [n.address, n.hop]))
  const incoming = {}
  d.transactions.forEach((t) => (incoming[t.to_address] ??= []).push(t.from_address))
  const set = new Set(n0.deposit_addresses)
  const q = [...n0.deposit_addresses]
  while (q.length) {
    const a = q.pop()
    for (const f of incoming[a] || []) {
      if (hopOf[f] >= 0 && !set.has(f)) { set.add(f); q.push(f) }
    }
  }
  d.transactions.forEach((t) => { if (t.kind === 'exchange_sweep' && n0.deposit_addresses.includes(t.from_address)) set.add(t.to_address) })
  return set
}

function NodePanel({ node, d, onClose }) {
  const [added, setAdded] = useState(false)
  const c = d.case
  const tok = node.network === c.network ? c.token : d.transactions.find((t) => t.to_address === node.address)?.token
  return (
    <div className="slide-in space-y-3">
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-navy-900"><RoleGlyph role={node.role} /> {ROLES[node.role].label}</span>
        <button onClick={onClose} className={btn.ghost}>{t('Close')}</button>
      </div>
      {node.entity && <div className="rounded-lg bg-brand-50 px-3 py-2 text-sm font-semibold text-brand-700">{node.entity}</div>}
      <div className="text-xs text-ink-3">{tMessage(node.label)}</div>
      <div className="rounded-lg bg-slate-50 p-2.5 font-mono text-[11.5px] break-all text-ink">{node.address}</div>
      <dl className="grid grid-cols-2 gap-y-1.5 text-sm">
        <dt className="text-ink-3">{t('Network')}</dt><dd className="text-right"><NetworkBadge network={node.network} /></dd>
        <dt className="text-ink-3">{t('Hop')}</dt><dd className="text-right font-semibold">{node.hop < 0 ? t('Source') : node.hop}</dd>
        <dt className="text-ink-3">{t('Received')}</dt><dd className="text-right font-semibold">{inrShort(node.in_inr)}</dd>
        <dt className="text-ink-3">{t('Sent')}</dt><dd className="text-right font-semibold">{inrShort(node.out_inr)}</dd>
        {node.balance != null && <><dt className="text-ink-3">{t('Balance left')}</dt><dd className="text-right font-semibold">{token(node.balance, tok)}</dd></>}
        <dt className="text-ink-3">{t('Transactions')}</dt><dd className="text-right">{node.tx_count}</dd>
        <dt className="text-ink-3">{t('First seen')}</dt><dd className="text-right text-xs">{dt(node.first_seen)}</dd>
        <dt className="text-ink-3">{t('Last seen')}</dt><dd className="text-right text-xs">{dt(node.last_seen)}</dd>
        {node.cluster_id && <><dt className="text-ink-3">{t('Cluster')}</dt><dd className="text-right font-mono text-xs">{node.cluster_id}</dd></>}
        {node.ml_laundering_prob != null && <><dt className="text-ink-3">{t('Laundering prob. (ML)')}</dt><dd className="text-right font-semibold">{Math.round(node.ml_laundering_prob * 100)}%</dd></>}
        {node.anomaly_pct != null && <><dt className="text-ink-3">{t('Anomaly (vs all wallets)')}</dt><dd className="text-right font-semibold">{t('{n}th pct', { n: Math.round(node.anomaly_pct) })}</dd></>}
      </dl>
      <div className="flex flex-col gap-2 pt-1">
        <Link to={`/wallets/${node.address}`} className={btn.secondary}>{t('Open wallet profile')} <ArrowRight size={14} /></Link>
        {!['victim', 'exchange_hot', 'mixer', 'bridge'].includes(node.role) && (
          <button
            className={btn.secondary}
            disabled={added}
            onClick={async () => {
              await addToWatchlist({ address: node.address, network: node.network, case_id: c.id, label: ROLES[node.role].label, reason: `Flagged from graph of ${c.id}`, risk_score: c.risk_score, balance: node.balance, token: tok })
              setAdded(true)
            }}
          >
            <Radar size={14} /> {added ? t('Added to watchlist') : t('Add to watchlist')}
          </button>
        )}
      </div>
    </div>
  )
}

export default function Workspace() {
  const { id } = useParams()
  const { data, error, loading } = useAsync(() => Promise.all([getCase(id), listExchanges(), listCases()]), [id])
  const [tab, setTab] = useState('graph')
  const [sel, setSel] = useState(null)
  const [showPath, setShowPath] = useState(true)
  const d = data?.[0]
  const exchanges = data?.[1]
  const allCases = data?.[2]
  const path = useMemo(() => (d ? pathToNearest(d) : new Set()), [d])
  const rolesPresent = useMemo(() => (d ? Object.keys(ROLES).filter((r) => d.nodes.some((n) => n.role === r)) : []), [d])

  if (loading) return <Loading label={t('Loading investigation…')} />
  if (error) return <ErrorBox error={error} />
  const c = d.case
  const n0 = d.attributions[0]
  const selNode = sel && d.nodes.find((n) => n.address === sel.address)

  const TABS = [
    { id: 'graph', label: t('Transaction graph'), icon: Waypoints },
    { id: 'nx', label: t('NetworkX analysis'), icon: Network },
    { id: 'flow', label: t('Fund flow'), icon: Route },
    { id: 'tx', label: t('Transactions'), icon: TableProperties, count: d.transactions.length },
    { id: 'patterns', label: t('Patterns'), icon: ScanSearch, count: d.patterns.length },
    { id: 'clusters', label: t('Wallet clusters'), icon: Users, count: d.clusters.length },
    { id: 'attr', label: t('Exchange attribution'), icon: Building2, count: d.attributions.length },
    { id: 'risk', label: t('Risk score'), icon: Gauge },
    { id: 'timeline', label: t('Timeline & legal'), icon: Clock },
  ]

  return (
    <>
      {/* header: the case file */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-line pb-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-sm text-ink-3">
            <Link to="/cases" className="hover:text-ink hover:underline">{t('Cases')}</Link>
            <span aria-hidden="true">/</span>
            <span>{t(c.fraud_type)}</span>
            {c.demo_generated && <span className="rounded bg-violet-50 px-1.5 py-0.5 text-xs font-semibold text-violet-700">{t('Demo-generated result')}</span>}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <h1 className="text-[38px] leading-none font-semibold tracking-tight text-navy-900">{c.id}</h1>
            <StatusBadge status={c.status} />
            <PriorityBadge p={c.priority} />
            <RiskBadge level={c.risk_level} score={c.risk_score} />
          </div>
          <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <div className="flex gap-1.5"><dt className="text-ink-3">{t('NCRP ack.')}</dt><dd className="tabular text-ink">{c.ncrp_ack}</dd></div>
            <div className="flex gap-1.5"><dt className="text-ink-3">{t('Place')}</dt><dd className="text-ink">{c.district}, {c.state}</dd></div>
            <div className="flex gap-1.5"><dt className="text-ink-3">{t('Officer')}</dt><dd className="text-ink">{c.investigator}</dd></div>
            <div className="flex items-center gap-1.5"><dt className="text-ink-3">{t('Chain')}</dt><dd><NetworkBadge network={c.network} long /></dd></div>
          </dl>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to={`/reports/${c.id}`} className={btn.secondary}><FileText size={16} /> {t('Investigation report')}</Link>
          {n0 && <Link to={`/reports/${c.id}?tab=notice`} className={btn.primary}>{t('Draft notice to {ex}', { ex: n0.exchange })}</Link>}
        </div>
      </div>

      {/* the money trail - the one bold element on this page */}
      {(() => {
        const tx = d.transactions
        const first = (pred) => tx.filter(pred).map((t) => t.timestamp).sort()[0]
        const suspect = d.nodes.find((n) => n.role === 'suspect')
        const consNodes = d.nodes.filter((n) => n.role === 'consolidation')
        const layering = d.nodes.filter((n) => n.role === 'intermediary').length
        const hasMixer = d.nodes.some((n) => n.role === 'mixer')
        const hasBridge = d.nodes.some((n) => n.role === 'bridge')
        const deepest = Math.max(...d.nodes.map((n) => n.hop))
        const tPaid = first((t) => t.kind === 'victim_payment')
        const tOut = first((t) => t.from_address === suspect?.address)
        const tCons = consNodes.length ? first((t) => consNodes.some((n) => n.address === t.to_address)) : null
        const tEx = first((t) => t.kind === 'exchange_deposit' && n0?.deposit_addresses.includes(t.to_address))
        const gap = (a, b) => {
          if (!a || !b) return null
          const m = Math.max(0, Math.round((new Date(b) - new Date(a)) / 60000))
          if (m < 60) return t('{m} min', { m })
          const h = Math.floor(m / 60)
          if (h < 48) return t('{h} h {m} min', { h, m: m % 60 })
          return t('{d} days {h} h', { d: Math.floor(h / 24), h: h % 24 })
        }
        const when = (iso) => iso ? new Date(iso).toLocaleString(dateLocale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' }) : null
        const steps = [
          { k: t('Victim paid'), v: inr(c.amount_lost_inr), s: `${token(c.amount_lost_token, c.token)}, ${c.payments === 1 ? t('1 payment') : t('{n} payments', { n: c.payments })}`, t: tPaid },
          { k: t('Reported wallet'), v: <Address value={c.reported_wallet} head={6} tail={5} />, s: suspect ? t('Received {amt} in total', { amt: inrShort(suspect.in_inr) }) : t('From the complaint'), t: tOut, tLabel: t('sent onward') },
          { k: t('Layering'), v: layering === 1 ? t('1 wallet') : t('{n} wallets', { n: layering }), s: [t('{n} hops deep', { n: deepest }), hasMixer && t('via a mixer'), hasBridge && t('across a bridge')].filter(Boolean).join(', ') },
          ...(consNodes.length ? [{ k: t('Merged again'), v: consNodes.length === 1 ? t('1 wallet') : t('{n} wallets', { n: consNodes.length }), s: t('Collected {amt}', { amt: inrShort(consNodes.reduce((s, n) => s + n.in_inr, 0)) }), t: tCons }] : []),
        ]
        const total = gap(tPaid, tEx)
        const others = n0 && n0.amount_inr > n0.victim_attributable_inr * 1.05
        return (
          <section aria-labelledby="trail-h" className="mb-6 overflow-hidden rounded-md border border-line bg-white">
            <div className="flex flex-wrap items-baseline justify-between gap-3 px-6 pt-5">
              <h2 id="trail-h" className="text-xl font-semibold text-navy-900">{t('Where the money went')}</h2>
              {total ? (
                <p className="text-sm text-ink-2">
                  {t('Reached the exchange')} <b className="font-cond text-lg font-semibold text-stamp-ink">{total}</b> {t('after the victim paid')}
                </p>
              ) : !n0 && <p className="text-sm text-ink-2">{t('Not at an exchange yet')}</p>}
            </div>

            <ol className="grid grid-cols-1 px-6 pt-5 pb-6 md:grid-cols-[repeat(var(--n),minmax(0,1fr))_minmax(0,1.35fr)]" style={{ '--n': steps.length }}>
              {steps.map((st) => (
                <li key={st.k} className="relative border-l-2 border-navy-900/70 pb-5 pl-5 md:border-t-2 md:border-l-0 md:pt-4 md:pr-5 md:pb-0 md:pl-0">
                  <span className="absolute top-0 -left-[6px] size-2.5 rounded-full border-2 border-white bg-navy-900 md:-top-[6px] md:left-0" />
                  <svg aria-hidden="true" viewBox="0 0 8 10" className="absolute hidden size-2.5 fill-navy-900/70 md:-top-[6px] md:right-1 md:block"><path d="M0 0l8 5-8 5z" /></svg>
                  <div className="text-[13px] text-ink-3">{st.k}</div>
                  <div className="mt-0.5 font-cond text-xl leading-snug font-semibold text-navy-900">{st.v}</div>
                  <div className="mt-0.5 text-[13px] text-ink-2">{st.s}</div>
                  {st.t && <div className="mt-1.5 text-xs text-ink-3 tabular">{st.tLabel ? `${st.tLabel} ` : ''}{when(st.t)}</div>}
                </li>
              ))}
              <li className={`relative border-l-[3px] pl-5 md:border-t-[3px] md:border-l-0 md:pt-4 md:pl-0 ${n0 ? 'border-stamp' : 'border-dashed border-warn'}`}>
                <span className={`absolute top-0 -left-[7px] size-3 rotate-45 md:-top-[7.5px] md:left-0 ${n0 ? 'bg-stamp' : 'bg-warn'}`} />
                {n0 ? (
                  <>
                    <div className="text-[13px] text-stamp-ink">{t('Cash-out point, {n} hops from the reported wallet', { n: n0.hops })}</div>
                    <div className="mt-0.5 font-cond text-[28px] leading-tight font-semibold text-navy-900">{n0.exchange}</div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-[13px] text-ink-2">
                      {n0.fiu_ind_registered ? <BadgeCheck size={14} className="text-good" /> : <Globe size={14} className="text-warn-ink" />}
                      {t(n0.jurisdiction)}, {n0.fiu_ind_registered ? t('registered with FIU-IND') : t('not registered in India')}
                    </div>
                    {tEx && <div className="mt-1.5 text-xs text-ink-3 tabular">{t('deposited')} {when(tEx)}</div>}
                  </>
                ) : (
                  <>
                    <div className="text-[13px] text-warn-ink">{t('No exchange reached yet')}</div>
                    <div className="mt-0.5 font-cond text-[26px] leading-tight font-semibold text-navy-900">{t('{amt} can still move', { amt: inrShort(c.held_in_wallets_inr) })}</div>
                    <div className="mt-0.5 text-[13px] text-ink-2">{t('These wallets are on the watchlist. You get an alert when money moves towards an exchange.')}</div>
                  </>
                )}
              </li>
            </ol>

            {n0 && (
              <div className="flex flex-wrap items-center gap-x-10 gap-y-3 border-t border-line bg-page/60 px-6 py-4">
                <div>
                  <div className="text-xs text-ink-3">{t('Reached {ex}', { ex: n0.exchange })}</div>
                  <div className="tabular font-cond text-xl font-semibold text-navy-900">{inr(n0.amount_inr)}</div>
                </div>
                <div>
                  <div className="text-xs text-ink-3">{t("This victim's share to freeze")}</div>
                  <div className="tabular font-cond text-xl font-semibold text-stamp-ink">{inr(n0.victim_attributable_inr)}</div>
                </div>
                <div>
                  <div className="text-xs text-ink-3">{t('Probable match')}</div>
                  <div className="flex items-center gap-2">
                    <span className="tabular font-cond text-xl font-semibold text-navy-900">{Math.round(n0.confidence * 100)}%</span>
                    <span className="h-1.5 w-16 overflow-hidden rounded-sm bg-line"><span className="block h-full bg-brand-600" style={{ width: `${n0.confidence * 100}%` }} /></span>
                  </div>
                </div>
                {others && (
                  <p className="max-w-[46ch] flex-1 text-xs leading-relaxed text-ink-3">
                    {t('More money reached the exchange than this victim lost, because other senders paid into the same wallets. The share is split in proportion to what each one paid.')}
                  </p>
                )}
              </div>
            )}
          </section>
        )
      })()}

      {/* cross-case link - same operator across complaints */}
      {c.linked_cases.length > 0 && (() => {
        const linked = (allCases || []).filter((x) => c.linked_cases.includes(x.id))
        const group = [c, ...linked]
        const total = group.reduce((s, x) => s + (x.amount_lost_inr || 0), 0)
        const states = [...new Set(group.map((x) => x.state).filter(Boolean))]
        return (
          <section aria-label={t('Linked cases')} className="mb-6 flex flex-wrap items-start gap-4 rounded-md border border-line border-l-[3px] border-l-stamp bg-white px-5 py-4">
            <Layers size={20} className="mt-0.5 shrink-0 text-stamp" />
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-semibold text-navy-900">
                {t('Same operator in {n} complaints', { n: group.length })}{states.length > 1 ? t(' from {n} states', { n: states.length }) : ''}
              </h2>
              <p className="mt-0.5 max-w-[80ch] text-sm text-ink-2">
                {t('These cases send money through the same consolidation wallet ({syn}). Together the victims lost {amt}.', { syn: c.syndicate, amt: inr(total) })}
                {' '}{t('One joint request to the exchange covers all of them.')}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {c.linked_cases.map((x) => <Link key={x} to={`/cases/${x}`} className="rounded border border-line px-2 py-0.5 font-cond text-sm font-medium text-navy-900 hover:border-stamp hover:text-stamp-ink">{x}</Link>)}
              </div>
            </div>
          </section>
        )
      })()}

      {/* key figures */}
      <dl className="mb-6 grid grid-cols-2 border-y border-line md:grid-cols-3 xl:grid-cols-6">
        {[
          [t('Victim lost'), inr(c.amount_lost_inr), t('{n} payment(s)', { n: c.payments })],
          [t('Wallets traced'), c.wallets_traced, t('{n} transactions', { n: c.transactions_traced })],
          [t('Deepest hop'), Math.max(...d.nodes.map((n) => n.hop)), NETWORKS[c.network].name],
          [t('At exchanges'), inrShort(c.traced_to_vasp_inr), t('{n} exchange(s)', { n: d.attributions.length })],
          [t('Can still move'), inrShort(c.held_in_wallets_inr), t('In suspect wallets')],
          [t('Frozen'), inrShort(c.frozen_inr), c.frozen_inr ? t('At the exchange') : t('Nothing yet')],
        ].map(([k, v, sub]) => (
          <div key={k} className="border-line px-4 py-3 [&:not(:first-child)]:border-l">
            <dt className="text-xs text-ink-3">{k}</dt>
            <dd className="tabular font-cond text-xl font-semibold text-navy-900">{v}</dd>
            <dd className="truncate text-xs text-ink-3">{sub}</dd>
          </div>
        ))}
      </dl>

      <Tabs tabs={TABS} value={tab} onChange={setTab} />
      <div className="mt-5">
        {tab === 'graph' && (
          <div className="space-y-5">
            <Card pad={false}>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5">
                <div className="flex items-center gap-2 text-sm text-ink-2">
                  <GitBranch size={15} /> {t('{a} wallets · {b} transactions · left to right = hops away from the reported wallet', { a: d.nodes.length, b: d.transactions.length })}
                </div>
                {n0 && (
                  <label className="flex items-center gap-2 text-sm font-medium text-ink">
                    <input type="checkbox" className="size-4 accent-brand-600" checked={showPath} onChange={(e) => setShowPath(e.target.checked)} />
                    {t('Highlight path to {ex}', { ex: n0.exchange })}
                  </label>
                )}
              </div>
              <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-line bg-slate-50/60 px-4 py-2 text-xs text-ink-2">
                {rolesPresent.map((r) => (
                  <li key={r} className="flex items-center gap-1.5"><RoleGlyph role={r} size={12} /> {ROLES[r].label}</li>
                ))}
                <li className="flex items-center gap-1.5"><svg width="20" height="6"><line x1="0" y1="3" x2="20" y2="3" stroke="#7b8699" strokeWidth="2" strokeDasharray="4 3" /></svg> {t('Probabilistic link (mixer)')}</li>
                <li className="flex items-center gap-1.5"><svg width="20" height="6"><line x1="0" y1="3" x2="20" y2="3" stroke="#1d4ed8" strokeWidth="3" /></svg> {t('Path to nearest exchange')}</li>
                <li className="text-ink-3">{t('Line thickness = value')}</li>
              </ul>
              <div className="relative">
                <TxGraph
                  nodes={d.nodes}
                  transactions={d.transactions}
                  highlight={showPath ? path : null}
                  selected={sel?.address}
                  onSelect={setSel}
                  height={560}
                />
                {selNode ? (
                  <div className="absolute top-3 left-3 max-h-[calc(100%-24px)] w-80 overflow-y-auto rounded-xl border border-line bg-white p-4 shadow-lg">
                    <NodePanel key={selNode.address} node={selNode} d={d} onClose={() => setSel(null)} />
                  </div>
                ) : (
                  <div className="pointer-events-none absolute bottom-3 left-3 flex items-center gap-1.5 rounded-lg bg-white/90 px-3 py-1.5 text-xs text-ink-2 shadow-sm ring-1 ring-line">
                    <Activity size={13} /> {t('Click a wallet for details · hover to see its counterparties · Ctrl + scroll to zoom · drag to pan')}
                  </div>
                )}
              </div>
            </Card>
            <div className="grid gap-5 md:grid-cols-2">
              <Card title={t('Reported wallet')}>
                <Address value={c.reported_wallet} full />
                <div className="mt-3 text-xs text-ink-3">{t("Complainant's wallet")}</div>
                <Address value={c.victim_wallet} full />
              </Card>
            </div>
          </div>
        )}
        {tab === 'nx' && <NxTab d={d} />}
        {tab === 'flow' && <FundFlowTab d={d} />}
        {tab === 'tx' && <TransactionsTab d={d} />}
        {tab === 'patterns' && <PatternsTab d={d} />}
        {tab === 'clusters' && <ClustersTab d={d} />}
        {tab === 'attr' && <AttributionTab d={d} exchanges={exchanges} />}
        {tab === 'risk' && <RiskTab d={d} />}
        {tab === 'timeline' && <TimelineTab d={d} />}
      </div>
      <p className="mt-6 max-w-[80ch] text-sm text-ink-2"><span className="text-ink-3">{t('Complaint summary:')}</span> {c.description}</p>
    </>
  )
}
