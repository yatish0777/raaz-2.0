import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowRight, Building2, CircleCheck, Database, Gauge, GitBranch, LoaderCircle, Network, ScanSearch, Waypoints } from 'lucide-react'
import { getCase } from '../lib/api'
import { NETWORKS, inrShort, short } from '../lib/format'
import { Card, ErrorBox, Loading, PageHeader, btn, useAsync } from '../components/ui'
import { t } from '../i18n'

// Mirrors the Celery pipeline stages of the real backend
function buildSteps(d) {
  const c = d.case
  const net = NETWORKS[c.network].name
  const maxHop = Math.max(...d.nodes.map((n) => n.hop))
  const byHop = {}
  d.nodes.forEach((n) => { if (n.hop >= 1) byHop[n.hop] = (byHop[n.hop] || 0) + 1 })
  const n0 = d.attributions[0]
  return [
    { icon: Database, t: t('Fetching transactions'), src: c.network === 'BTC' ? 'Blockchair API' : c.network === 'TRON' ? 'TRON API' : 'Etherscan V2 / Blockscout',
      logs: [t('Connected to {net} data source', { net }), t('Wallet {w}: {n} transactions found', { w: short(c.reported_wallet, 10, 6), n: d.transactions.filter((x) => x.to_address === c.reported_wallet || x.from_address === c.reported_wallet).length }), t('Received {amt} in total from {n} source wallet(s)', { amt: inrShort(d.pool_inr), n: d.nodes.filter((n) => n.hop === -1).length })] },
    { icon: GitBranch, t: t('Tracing multi-hop fund flow'), src: t('Tracing engine (Celery worker)'),
      logs: Object.entries(byHop).slice(0, 7).map(([h, n]) => t('Hop {h}: {n} wallet(s) followed', { h, n })).concat([
        c.trace_depth && maxHop > c.trace_depth
          ? t('Depth auto-extended from {a} to {b} hops to reach an exchange deposit', { a: c.trace_depth, b: maxHop })
          : t('Deepest hop reached: {n}', { n: maxHop }),
      ]) },
    { icon: Network, t: t('Building transaction graph'), src: t('NetworkX (Neo4j planned)'),
      logs: [t('{a} nodes, {b} edges in the transaction graph', { a: d.nodes.length, b: d.transactions.length }), t('Computed flow values and time ordering per edge')] },
    { icon: ScanSearch, t: t('Detecting patterns & clustering wallets'), src: t('Pattern rules + clustering heuristics'),
      logs: [...d.patterns.map((p) => t('Pattern: {p} ({s})', { p: t(p.type), s: t(p.severity) })), t('{n} wallet cluster(s) formed', { n: d.clusters.length })] },
    { icon: Building2, t: t('Attributing exchanges (VASPs)'), src: t('Address-label DB + hot-wallet sweep matching'),
      logs: n0 ? d.attributions.map((a) => t('{ex}: deposit reached at hop {h}, {c}% confidence', { ex: a.exchange, h: a.hops, c: Math.round(a.confidence * 100) })) : [t('No exchange deposit found within trace depth - funds are held in wallets')] },
    { icon: Gauge, t: t('Scoring risk'), src: t(d.risk.model),
      logs: [
        t('Rule engine: {a} of {b} rules triggered (score {s})', { a: (d.risk.rules || []).filter((x) => x.fired).length, b: (d.risk.rules || []).length, s: d.risk.rule_score ?? d.risk.score }),
        ...(d.risk.ml ? [
          t('Isolation Forest anomaly score: {n}/100', { n: Math.round(d.risk.ml.anomaly.case_score) }),
          t('Laundering-wallet classifier flagged {a} of {b} wallets', { a: d.risk.ml.supervised.flagged, b: d.risk.ml.supervised.of }),
        ] : []),
        t('Final risk score {s}/100 ({l})', { s: d.risk.score, l: t(d.risk.level) }),
      ] },
  ]
}

export default function Analysis() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const nav = useNavigate()
  const { data, error, loading } = useAsync(() => getCase(id), [id])
  const steps = useMemo(() => (data ? buildSteps(data) : []), [data])
  const [cur, setCur] = useState(0)
  const [logs, setLogs] = useState([])
  const logRef = useRef(null)

  useEffect(() => {
    if (!steps.length) return
    let alive = true
    let i = 0
    const timers = []
    const run = () => {
      if (!alive) return
      if (i >= steps.length) { setCur(steps.length); return }
      setCur(i)
      const s = steps[i]
      s.logs.forEach((l, j) => timers.push(setTimeout(() => alive && setLogs((x) => [...x, { step: i, t: l }]), 250 + j * (900 / s.logs.length))))
      i++
      timers.push(setTimeout(run, 1300))
    }
    run()
    return () => { alive = false; timers.forEach(clearTimeout) }
  }, [steps])

  useEffect(() => { logRef.current?.scrollTo({ top: 1e6, behavior: 'smooth' }) }, [logs])

  const done = cur >= steps.length && steps.length > 0
  useEffect(() => {
    if (!done) return
    const t = setTimeout(() => nav(`/cases/${id}`), 1800)
    return () => clearTimeout(t)
  }, [done, id, nav])

  if (loading) return <Loading />
  if (error) return <ErrorBox error={error} />
  const c = data.case
  const pctDone = Math.round((Math.min(cur, steps.length) / steps.length) * 100)

  return (
    <>
      <PageHeader
        title={done ? t('Trace complete') : t('Analysis in progress')}
        subtitle={
          params.get('existing')
            ? t('This wallet is already part of an existing case. Re-running the trace for the latest on-chain data.')
            : t('Tracing {net} wallet {w}', { net: NETWORKS[c.network].name, w: short(c.reported_wallet, 10, 8) })
        }
        actions={<Link to={`/cases/${id}`} className={btn.secondary}>{t('Skip to results')} <ArrowRight size={15} /></Link>}
      />
      <div className="mb-5 h-2 overflow-hidden rounded-full bg-slate-200">
        <div className="h-full rounded-full bg-brand-600 transition-all duration-700" style={{ width: `${pctDone}%` }} />
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title={t('Pipeline')} subtitle={t('Each stage runs as a Celery task in the backend')}>
          <ol className="space-y-1">
            {steps.map((s, i) => {
              const state = i < cur ? 'done' : i === cur ? 'run' : 'wait'
              return (
                <li key={s.t} className={`flex items-center gap-3 rounded-lg px-3 py-2.5 ${state === 'run' ? 'bg-brand-50' : ''}`}>
                  <div className={`grid size-9 shrink-0 place-items-center rounded-full ${state === 'done' ? 'bg-green-50 text-good' : state === 'run' ? 'bg-brand-600 text-white' : 'bg-slate-100 text-ink-3'}`}>
                    {state === 'done' ? <CircleCheck size={18} /> : state === 'run' ? <LoaderCircle size={18} className="animate-spin" /> : <s.icon size={17} />}
                  </div>
                  <div className="min-w-0">
                    <div className={`text-sm font-semibold ${state === 'wait' ? 'text-ink-3' : 'text-ink'}`}>{s.t}</div>
                    <div className="text-xs text-ink-3">{s.src}</div>
                  </div>
                </li>
              )
            })}
          </ol>
        </Card>
        <Card title={t('Live log')} pad={false}>
          <div ref={logRef} className="h-[380px] overflow-y-auto bg-navy-950 p-4 font-mono text-[12px] leading-relaxed text-brand-100">
            {logs.map((l, i) => (
              <div key={i} className="slide-in">
                <span className="text-brand-500">[{String(l.step + 1).padStart(2, '0')}]</span> {l.t}
              </div>
            ))}
            {done && (
              <div className="mt-3 text-green-400">
                ✔ {t('Trace complete.')} {data.attributions[0] ? t('Nearest VASP: {ex}.', { ex: data.attributions[0].exchange }) : t('No VASP reached yet.')} {t('Opening workspace…')}
              </div>
            )}
            {!done && <span className="caret" />}
          </div>
        </Card>
      </div>
      {done && (
        <div className="mt-5 flex justify-center">
          <Link to={`/cases/${id}`} className={btn.primary}><Waypoints size={16} /> {t('Open investigation workspace')}</Link>
        </div>
      )}
    </>
  )
}
