import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { listAlerts, listCases, listExchanges, subscribe } from '../lib/api'
import { ago, inrShort, nowSim, num, STATUS_ORDER, NETWORKS, FRAUD_SHORT } from '../lib/format'
import { useAuth } from '../context/AuthContext'
import { ErrorBox, Loading, NetworkBadge, RiskBadge, btn, useAsync } from '../components/ui'

// What needs doing next on a case, and how urgent it is (higher = sooner)
function nextStep(c) {
  const notice = { label: 'Draft notice', to: `/reports/${c.id}?tab=notice` }
  const open = { label: 'Open case', to: `/cases/${c.id}` }
  if (c.nearest_exchange && (c.status === 'Exchange Identified' || c.status === 'Tracing' || c.status === 'New')) {
    return { weight: 3, reason: `Money reached ${c.nearest_exchange}. No notice sent yet.`, action: notice, urgent: true }
  }
  if (!c.nearest_exchange && c.held_in_wallets_inr > 0 && c.status !== 'Closed') {
    return { weight: 2, reason: `${inrShort(c.held_in_wallets_inr)} still sitting in suspect wallets and can move.`, action: open, urgent: true }
  }
  if (c.status === 'Notice Sent') return { weight: 1, reason: `Waiting for ${c.nearest_exchange} to reply to the notice.`, action: open }
  if (c.status === 'KYC Received') return { weight: 1, reason: 'Exchange shared KYC. Identify the account holder.', action: open }
  if (c.status === 'Monitoring') return { weight: 0, reason: 'Watching the wallets for new movement.', action: open }
  return { weight: -1, reason: 'Closed.', action: open }
}

const STAGE_TONE = {
  New: 'bg-slate-300', Tracing: 'bg-brand-200', 'Exchange Identified': 'bg-stamp', 'Notice Sent': 'bg-warn',
  'KYC Received': 'bg-brand-500', Monitoring: 'bg-navy-600', Closed: 'bg-good',
}

function Section({ title, note, action, children, className = '' }) {
  return (
    <section className={className}>
      <div className="mb-3 flex items-baseline justify-between gap-3 border-b border-line pb-2">
        <h2 className="text-lg font-semibold text-navy-900">{title}</h2>
        <div className="flex items-baseline gap-3 text-xs text-ink-3">{note}{action}</div>
      </div>
      {children}
    </section>
  )
}

function BarList({ rows, format = num, onClick }) {
  const max = Math.max(1, ...rows.map((r) => r.value))
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.label}>
          <button type="button" onClick={onClick} disabled={!onClick} className="w-full text-left disabled:cursor-default">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate text-ink">{r.label}</span>
              <span className="tabular shrink-0 text-ink-2">{format(r.value)}</span>
            </div>
            <div className="mt-1 h-1 rounded-sm bg-page"><div className="h-1 rounded-sm bg-brand-600" style={{ width: `${(100 * r.value) / max}%` }} /></div>
          </button>
        </li>
      ))}
    </ul>
  )
}

export default function Dashboard() {
  const { user } = useAuth()
  const nav = useNavigate()
  const { data, error, loading } = useAsync(() => Promise.all([listCases(), listExchanges()]), [])
  const [alerts, setAlerts] = useState([])
  useEffect(() => {
    const load = () => listAlerts().then(setAlerts)
    load()
    return subscribe(load)
  }, [])

  const m = useMemo(() => {
    if (!data) return null
    const [cases, exchanges] = data
    const open = cases.filter((c) => c.status !== 'Closed')
    const queue = open
      .map((c) => ({ c, s: nextStep(c) }))
      .sort((a, b) => b.s.weight - a.s.weight || b.c.risk_score - a.c.risk_score || b.c.amount_lost_inr - a.c.amount_lost_inr)
    return {
      cases, open, queue,
      needNotice: queue.filter((q) => q.s.weight === 3).length,
      movable: queue.filter((q) => q.s.weight === 2).length,
      frozen: cases.reduce((s, c) => s + c.frozen_inr, 0),
      pipeline: STATUS_ORDER.map((s) => [s, cases.filter((c) => c.status === s).length]),
      exRank: [...exchanges].sort((a, b) => b.total_inr_received - a.total_inr_received).slice(0, 6),
      byFraud: Object.entries(cases.reduce((a, c) => ({ ...a, [c.fraud_type]: (a[c.fraud_type] || 0) + 1 }), {})).sort((a, b) => b[1] - a[1]),
      byNet: Object.keys(NETWORKS).map((n) => [n, cases.filter((c) => c.network === n).length]).filter(([, v]) => v).sort((a, b) => b[1] - a[1]),
    }
  }, [data])

  if (loading) return <Loading />
  if (error) return <ErrorBox error={error} />

  const today = new Date(nowSim()).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })
  const total = m.cases.length

  return (
    <div className="mx-auto max-w-[1280px]">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-ink-3">{today}, {user.unit}</p>
          <h1 className="mt-1 text-[34px] leading-tight font-semibold text-navy-900">
            {m.needNotice + m.movable} cases need action today
          </h1>
          <p className="mt-1 max-w-[72ch] text-[15px] text-ink-2">
            {m.needNotice} have money sitting at an exchange with no notice sent, {m.movable} still have money that can move.
            {' '}{m.open.length} cases are open and {inrShort(m.frozen)} has been frozen so far.
          </p>
        </div>
        <Link to="/investigate" className={btn.primary}><Plus size={16} /> Start a trace</Link>
      </header>

      <Section
        title="Act on these first"
        note={<span>Sorted by what can still be recovered, then risk</span>}
        action={<Link to="/cases" className="font-medium text-brand-700 hover:underline">All cases</Link>}
      >
        <div className="overflow-x-auto rounded-md border border-line bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-line text-left text-xs text-ink-3">
              <tr>
                <th className="py-2 pr-2 pl-4 font-medium">Case</th>
                <th className="px-2 py-2 font-medium">Why now</th>
                <th className="px-2 py-2 text-right font-medium">Victim lost</th>
                <th className="px-2 py-2 font-medium">Risk</th>
                <th className="px-2 py-2 font-medium">Opened</th>
                <th className="py-2 pr-4 pl-2" aria-label="Next step" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {m.queue.slice(0, 9).map(({ c, s }) => (
                <tr key={c.id} className="align-top hover:bg-page/60">
                  <td className={`py-3 pr-2 pl-4 whitespace-nowrap ${s.urgent ? 'border-l-[3px] border-stamp' : 'border-l-[3px] border-transparent'}`}>
                    <Link to={`/cases/${c.id}`} className="font-cond text-[15px] font-semibold text-navy-900 hover:underline">{c.id}</Link>
                    <div className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-3">{FRAUD_SHORT[c.fraud_type]} <NetworkBadge network={c.network} /></div>
                  </td>
                  <td className="px-2 py-3">
                    <div className={s.urgent ? 'font-medium text-ink' : 'text-ink-2'}>{s.reason}</div>
                    <div className="mt-0.5 text-xs text-ink-3">{c.district}, {c.state}{c.linked_cases?.length ? `. Linked to ${c.linked_cases.length} other cases.` : ''}</div>
                  </td>
                  <td className="tabular px-2 py-3 text-right whitespace-nowrap">{inrShort(c.amount_lost_inr)}</td>
                  <td className="px-2 py-3"><RiskBadge level={c.risk_level} score={c.risk_score} /></td>
                  <td className="px-2 py-3 whitespace-nowrap text-ink-3">{ago(c.created_at)}</td>
                  <td className="py-2.5 pr-4 pl-2 text-right">
                    <Link to={s.action.to} className={`${btn.secondary} whitespace-nowrap ${s.urgent ? 'border-brand-600 font-semibold text-brand-700' : ''}`}>{s.action.label}</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <div className="mt-10 grid gap-10 lg:grid-cols-5">
        <Section className="lg:col-span-3" title="Where the cases are" note={<span>{total} cases in this unit</span>}>
          <div className="flex h-3 overflow-hidden rounded-sm">
            {m.pipeline.filter(([, n]) => n).map(([s, n]) => (
              <button key={s} title={`${s}: ${n}`} onClick={() => nav(`/cases?status=${encodeURIComponent(s)}`)}
                className={`${STAGE_TONE[s]} border-r-2 border-white last:border-r-0`} style={{ width: `${(100 * n) / total}%` }} />
            ))}
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
            {m.pipeline.map(([s, n]) => (
              <button key={s} onClick={() => nav(`/cases?status=${encodeURIComponent(s)}`)} className="flex items-center gap-2 text-left text-sm hover:underline">
                <span className={`size-2.5 shrink-0 rounded-sm ${STAGE_TONE[s]}`} />
                <dt className="text-ink-2">{s}</dt>
                <dd className="tabular ml-auto font-semibold text-navy-900">{n}</dd>
              </button>
            ))}
          </dl>
        </Section>

        <Section className="lg:col-span-2" title="Wallet movements" note={<span>Simulated in demo mode</span>}
          action={<Link to="/watchlist" className="font-medium text-brand-700 hover:underline">Watchlist</Link>}>
          <ul className="divide-y divide-line">
            {alerts.slice(0, 4).map((a) => (
              <li key={a.id} className={`py-2.5 ${a.live ? 'slide-in' : ''}`}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm text-ink">{a.message}</span>
                  <span className="shrink-0 text-xs text-ink-3">{ago(a.at)}</span>
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-xs">
                  <RiskBadge level={a.severity} />
                  <Link to={`/cases/${a.case_id}`} className="text-brand-700 hover:underline">{a.case_id}</Link>
                </div>
              </li>
            ))}
          </ul>
        </Section>
      </div>

      <div className="mt-10 grid gap-10 md:grid-cols-3">
        <Section title="Exchanges receiving the money">
          <BarList rows={m.exRank.map((e) => ({ label: e.name, value: e.total_inr_received }))} format={inrShort} onClick={() => nav('/exchanges')} />
        </Section>
        <Section title="Fraud types">
          <BarList rows={m.byFraud.map(([k, v]) => ({ label: FRAUD_SHORT[k] || k, value: v }))} />
        </Section>
        <Section title="Blockchains">
          <BarList rows={m.byNet.map(([k, v]) => ({ label: NETWORKS[k].name, value: v }))} />
        </Section>
      </div>

      <p className="mt-10 text-xs text-ink-3">All figures are demo data generated for the SIH26183 prototype.</p>
    </div>
  )
}
