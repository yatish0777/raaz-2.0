import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { BadgeCheck, Brain, Building2, CheckCircle2, Circle, Download, FileText, Gavel, Globe, Link2, ListChecks, Search, ShieldAlert, Snowflake, Sparkles, TriangleAlert, UserRound } from 'lucide-react'
import { ROLES, TX_KIND, dt, inr, inrShort, num, short, token } from '../../lib/format'
import { Address, Card, ConfidenceBar, CopyBtn, Empty, RiskBadge, btn, input, inputAuto } from '../../components/ui'
import { HBar } from '../../components/charts'
import RiskGauge from '../../components/RiskGauge'
import { RoleGlyph } from '../../components/TxGraph'
import { t, tMessage } from '../../i18n'

// ---------------------------------------------------------------- Fund flow
export function FundFlowTab({ d }) {
  const c = d.case
  const hops = useMemo(() => {
    const byAddr = Object.fromEntries(d.nodes.map((n) => [n.address, n]))
    const rows = {}
    for (const n of d.nodes) {
      if (n.hop < 0) continue
      rows[n.hop] ??= { hop: n.hop, wallets: 0, value: 0, roles: new Set() }
      rows[n.hop].wallets++
      rows[n.hop].roles.add(n.role)
    }
    for (const t of d.transactions) {
      const h = byAddr[t.to_address]?.hop
      if (h == null || h < 0) continue
      rows[h].value += t.value_inr
    }
    return Object.values(rows).sort((a, b) => a.hop - b.hop)
  }, [d])
  const pool = d.pool_inr
  const toVasp = c.traced_to_vasp_inr
  const held = c.held_in_wallets_inr
  const other = Math.max(0, pool - toVasp - held)
  const parts = [
    { k: t('Reached exchanges (VASPs)'), v: toVasp, color: '#2a78d6' },
    { k: t('Still held in suspect / layering wallets'), v: held, color: '#eb6834' },
    { k: t('Fees, mixer loss & untraced'), v: other, color: '#c3c2b7' },
  ]
  const total = parts.reduce((s, p) => s + p.v, 0) || 1
  const maxV = Math.max(...hops.map((h) => h.value), 1)

  return (
    <div className="space-y-5">
      <Card title={t('Where the money went')} subtitle={t("Of {pool} that entered the reported wallet (complainant's {lost} plus other inbound transfers)", { pool: inr(pool), lost: inr(c.amount_lost_inr) })}>
        <div className="flex h-7 w-full gap-[2px] overflow-hidden rounded-md">
          {parts.filter((p) => p.v > 0).map((p) => (
            <div key={p.k} title={`${p.k}: ${inr(p.v)}`} style={{ width: `${(100 * p.v) / total}%`, background: p.color }} className="first:rounded-l-md last:rounded-r-md" />
          ))}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {parts.map((p) => (
            <div key={p.k} className="flex items-start gap-2.5">
              <span className="mt-1 size-3 shrink-0 rounded-sm" style={{ background: p.color }} />
              <div>
                <div className="text-xs text-ink-2">{p.k}</div>
                <div className="font-bold text-navy-900">{inrShort(p.v)} <span className="text-xs font-medium text-ink-3">· {Math.round((100 * p.v) / total)}%</span></div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card title={t('Hop-by-hop trace')} subtitle={t('Value moving into each hop away from the reported wallet')} pad={false}>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-ink-2">
            <tr>
              <th className="px-5 py-2.5 font-semibold">{t('Hop')}</th>
              <th className="px-3 py-2.5 font-semibold">{t('Wallets')}</th>
              <th className="px-3 py-2.5 font-semibold">{t("What's here")}</th>
              <th className="w-[40%] px-3 py-2.5 font-semibold">{t('Value moved in')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {hops.map((h) => (
              <tr key={h.hop}>
                <td className="px-5 py-2.5 font-semibold text-navy-900">{h.hop === 0 ? t('0 · reported') : h.hop}</td>
                <td className="tabular px-3 py-2.5">{h.wallets}</td>
                <td className="px-3 py-2.5">
                  <div className="flex flex-wrap gap-1.5">
                    {[...h.roles].map((r) => (
                      <span key={r} className="inline-flex items-center gap-1 rounded bg-slate-50 px-1.5 py-0.5 text-[11.5px] text-ink-2 ring-1 ring-line"><RoleGlyph role={r} size={10} />{ROLES[r].label}</span>
                    ))}
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[#2a78d6]" style={{ width: `${(100 * h.value) / maxV}%` }} /></div>
                    <span className="tabular w-20 text-right text-xs font-semibold">{inrShort(h.value)}</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------- Transactions
export function TransactionsTab({ d }) {
  const [q, setQ] = useState('')
  const [kind, setKind] = useState('')
  const [page, setPage] = useState(0)
  const [sort, setSort] = useState('time')
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase()
    let r = d.transactions.filter((t) => (!kind || t.kind === kind) && (!s || t.hash.includes(s) || t.from_address.toLowerCase().includes(s) || t.to_address.toLowerCase().includes(s)))
    r = [...r].sort(sort === 'value' ? (a, b) => b.value_inr - a.value_inr : (a, b) => a.timestamp.localeCompare(b.timestamp))
    return r
  }, [d, q, kind, sort])
  const PER = 20
  const view = rows.slice(page * PER, page * PER + PER)
  const kinds = [...new Set(d.transactions.map((t) => t.kind))]

  const exportCsv = () => {
    const cols = ['hash', 'network', 'block', 'timestamp', 'from_address', 'to_address', 'amount', 'token', 'value_inr', 'kind', 'hop', 'inferred']
    const csv = [cols.join(','), ...rows.map((t) => cols.map((k) => JSON.stringify(t[k] ?? '')).join(','))].join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = `${d.case.id}-transactions.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <Card pad={false}>
      <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
        <div className="relative min-w-56 flex-1">
          <Search size={15} className="absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" />
          <input className={`${input} pl-8`} placeholder={t('Filter by hash or address')} value={q} onChange={(e) => { setQ(e.target.value); setPage(0) }} />
        </div>
        <select className={inputAuto} value={kind} onChange={(e) => { setKind(e.target.value); setPage(0) }}>
          <option value="">{t('All types')}</option>
          {kinds.map((k) => <option key={k} value={k}>{TX_KIND[k]}</option>)}
        </select>
        <select className={inputAuto} value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="time">{t('Sort: time')}</option>
          <option value="value">{t('Sort: value')}</option>
        </select>
        <button onClick={exportCsv} className={btn.secondary}><Download size={15} /> CSV</button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-ink-2">
            <tr>{['Time (IST)', 'Tx hash', 'From', 'To', 'Amount', 'Value', 'Type', 'Hop', 'Block'].map((h) => <th key={h} className="px-3 py-2.5 font-semibold whitespace-nowrap">{t(h)}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-line">
            {view.map((tx) => (
              <tr key={tx.id + tx.to_address} className="hover:bg-slate-50">
                <td className="px-3 py-2 text-xs whitespace-nowrap text-ink-2">{dt(tx.timestamp)}</td>
                <td className="px-3 py-2"><span className="inline-flex items-center font-mono text-[12px]">{short(tx.hash, 8, 6)}<CopyBtn text={tx.hash} size={11} /></span></td>
                <td className="px-3 py-2"><Address value={tx.from_address} head={6} tail={4} copy={false} /></td>
                <td className="px-3 py-2"><Address value={tx.to_address} head={6} tail={4} copy={false} /></td>
                <td className="tabular px-3 py-2 whitespace-nowrap">{token(tx.amount, tx.token)}</td>
                <td className="tabular px-3 py-2 whitespace-nowrap">{inrShort(tx.value_inr)}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11.5px] text-ink-2">{TX_KIND[tx.kind]}</span>
                  {tx.inferred && <span className="ml-1 rounded bg-violet-50 px-1.5 py-0.5 text-[11px] text-violet-700" title={t('Probabilistic link (mixer)')}>{t('inferred')}</span>}
                </td>
                <td className="tabular px-3 py-2">{tx.hop}</td>
                <td className="tabular px-3 py-2 text-xs text-ink-3">{num(tx.block)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <Empty>{t('No transactions match the filter.')}</Empty>}
      </div>
      <div className="flex items-center justify-between border-t border-line px-4 py-2.5 text-xs text-ink-2">
        <span>{t('{n} transactions', { n: rows.length })}</span>
        <div className="flex gap-1">
          <button className={btn.ghost} disabled={page === 0} onClick={() => setPage((p) => p - 1)}>{t('Previous')}</button>
          <span className="px-2 py-1">{t('Page {a} / {b}', { a: page + 1, b: Math.max(1, Math.ceil(rows.length / PER)) })}</span>
          <button className={btn.ghost} disabled={(page + 1) * PER >= rows.length} onClick={() => setPage((p) => p + 1)}>{t('Next')}</button>
        </div>
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------- Patterns
export function PatternsTab({ d }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {d.patterns.map((p, i) => (
        <Card key={i}>
          <div className="flex items-start justify-between gap-3">
            <div className="font-semibold text-navy-900">{t(p.type)}</div>
            <RiskBadge level={p.severity === 'Low' ? 'Low' : p.severity} />
          </div>
          <p className="mt-2 text-sm text-ink-2">{tMessage(p.description)}</p>
          <div className="mt-3 flex items-center gap-2 text-xs text-ink-3">{t('Detection confidence')} <ConfidenceBar value={p.confidence} /></div>
          {p.type === 'Cross-case linkage' && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {d.case.linked_cases.map((id) => <Link key={id} to={`/cases/${id}`} className="rounded bg-red-50 px-2 py-0.5 text-xs font-semibold text-critical-ink hover:underline">{id}</Link>)}
            </div>
          )}
          <div className="mt-3 border-t border-line pt-2.5">
            <div className="mb-1 text-[13px] font-semibold text-ink-2">{t('Evidence wallets ({n})', { n: p.wallets.length })}</div>
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {p.wallets.slice(0, 6).map((w) => <Address key={w} value={w} head={6} tail={4} copy={false} />)}
              {p.wallets.length > 6 && <span className="text-xs text-ink-3">{t('+{n} more', { n: p.wallets.length - 6 })}</span>}
            </div>
          </div>
        </Card>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------- Clusters
export function ClustersTab({ d }) {
  const byAddr = Object.fromEntries(d.nodes.map((n) => [n.address, n]))
  return (
    <div className="space-y-4">
      {d.clusters.map((c) => (
        <Card key={c.id} title={tMessage(c.name)} subtitle={`${c.id} · ${t('Heuristic:')} ${t(c.heuristic)}`} action={<ConfidenceBar value={c.confidence} />}>
          {c.id.startsWith('CL-SYN') && (
            <div className="mb-3 flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-critical-ink">
              <Link2 size={15} /> {t('This cluster also appears in:')} {d.case.linked_cases.map((id, i) => <span key={id}>{i > 0 && ', '}<Link className="font-semibold underline" to={`/cases/${id}`}>{id}</Link></span>)}
            </div>
          )}
          <div className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {c.wallets.map((w) => (
              <div key={w} className="flex items-center gap-2">
                {byAddr[w] && <RoleGlyph role={byAddr[w].role} size={11} />}
                <Address value={w} head={8} tail={6} copy={false} />
                <span className="text-[11px] text-ink-3">{byAddr[w] ? inrShort(byAddr[w].in_inr) : ''}</span>
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------- Attribution
export function AttributionTab({ d, exchanges }) {
  if (!d.attributions.length) return <Card><Empty>{t('No exchange deposit observed within the trace depth. Funds are still in layering wallets - watchlist monitoring is active.')}</Empty></Card>
  const ex = (id) => exchanges?.find((e) => e.id === id)
  return (
    <div className="space-y-4">
      {d.attributions.map((a, i) => {
        const e = ex(a.exchange_id)
        return (
          <Card key={a.exchange_id} className={i === 0 ? 'ring-2 ring-brand-500' : ''}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="grid size-11 place-items-center rounded-lg bg-brand-50 text-brand-600"><Building2 size={22} /></div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-lg font-bold text-navy-900">{a.exchange}</span>
                    {i === 0 && <span className="rounded bg-brand-600 px-1.5 py-0.5 text-[11px] font-bold text-white">{t('NEAREST')}</span>}
                    {a.fiu_ind_registered
                      ? <span className="inline-flex items-center gap-1 rounded bg-green-50 px-1.5 py-0.5 text-[11px] font-semibold text-good-ink"><BadgeCheck size={12} /> {t('FIU-IND registered')}</span>
                      : <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-semibold text-warn-ink"><Globe size={12} /> {t('Not registered in India')}</span>}
                  </div>
                  <div className="mt-0.5 text-sm text-ink-2">{t(a.type)} · {t(a.jurisdiction)}</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-ink-3">{t('Attribution confidence')}</div>
                <ConfidenceBar value={a.confidence} className="mt-1 justify-end" />
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-4 border-t border-line pt-4 text-sm md:grid-cols-5">
              <div><div className="text-xs text-ink-3">{t('Hops from reported wallet')}</div><div className="text-lg font-bold">{a.hops}</div></div>
              <div><div className="text-xs text-ink-3">{t('Amount received')}</div><div className="text-lg font-bold">{inrShort(a.amount_inr)}</div></div>
              <div><div className="text-xs text-ink-3">{t("Complainant's share (pro-rata)")}</div><div className="text-lg font-bold">{inrShort(a.victim_attributable_inr)}</div></div>
              <div><div className="text-xs text-ink-3">{t('Cooperation with LEA')}</div><div className="text-lg font-bold">{e?.cooperation ? t(e.cooperation) : '-'}</div></div>
              <div><div className="text-xs text-ink-3">{t('Avg. response time')}</div><div className="text-lg font-bold">{e?.avg_response_days ? t('{n} days', { n: e.avg_response_days }) : t('No response')}</div></div>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <div className="mb-1 text-[13px] font-semibold text-ink-2">{t('Deposit address(es) - request KYC for these')}</div>
                {a.deposit_addresses.map((w) => <div key={w}><Address value={w} full /></div>)}
              </div>
              <div>
                <div className="mb-1 text-[13px] font-semibold text-ink-2">{t('Evidence')}</div>
                <ul className="list-disc space-y-0.5 pl-4 text-sm text-ink-2">{a.evidence.map((x) => <li key={x}>{tMessage(x)}</li>)}</ul>
                {a.confidence_steps && (
                  <div className="mt-3 rounded-lg border border-line bg-slate-50 p-3">
                    <div className="mb-1 text-[13px] font-semibold text-ink-2">{t('How the confidence is calculated')}</div>
                    <table className="w-full text-sm">
                      <tbody>
                        {a.confidence_steps.map((st) => (
                          <tr key={st.step}>
                            <td className="py-0.5 pr-3 text-ink-2">{tMessage(st.step)}</td>
                            <td className={`py-0.5 text-right font-mono font-semibold ${st.points < 0 ? 'text-critical' : 'text-navy-900'}`}>{st.points > 0 ? `+${st.points}` : st.points}</td>
                          </tr>
                        ))}
                        <tr className="border-t border-line">
                          <td className="pt-1 pr-3 font-semibold text-ink">{t('Confidence (limited to 52-97)')}</td>
                          <td className="pt-1 text-right font-mono font-bold text-navy-900">{Math.round(a.confidence * 100)}%</td>
                        </tr>
                      </tbody>
                    </table>
                    <div className="mt-1 text-[11px] text-ink-3">{t('Fixed formula, no machine learning. "Probable" attribution only - confirm with the exchange\'s KYC reply.')}</div>
                  </div>
                )}
              </div>
            </div>
            {i === 0 && (
              <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
                <Link to={`/reports/${d.case.id}?tab=notice`} className={btn.primary}><Gavel size={15} /> {t('Draft notice (Sec. 94 BNSS)')}</Link>
                <Link to={`/reports/${d.case.id}`} className={btn.secondary}><FileText size={15} /> {t('Full investigation report')}</Link>
                {e && <span className="self-center text-xs text-ink-3">{t('Compliance contact:')} {e.compliance_contact}</span>}
              </div>
            )}
          </Card>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------- Risk
function RuleTable({ r }) {
  const rules = r.rules || []
  const fired = rules.filter((x) => x.fired)
  return (
    <Card className="lg:col-span-3" title={t('Layer 1 - Rule engine (known patterns)')} subtitle={t('{a} of {b} rules triggered · rule score {s}/100 · every point has a named reason', { a: fired.length, b: rules.length, s: r.rule_score ?? r.score })} pad={false}>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs font-medium text-ink-3">
            <th className="px-5 py-2 font-semibold">{t('Rule')}</th>
            <th className="px-3 py-2 font-semibold">{t('Evidence in this case')}</th>
            <th className="px-5 py-2 text-right font-semibold">{t('Points')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          <tr>
            <td className="px-5 py-2.5 align-top"><div className="flex items-start gap-2 font-medium text-ink"><CheckCircle2 size={16} className="mt-0.5 shrink-0 text-brand-600" /> {t('Base score')}</div></td>
            <td className="px-3 py-2.5 text-ink-2">{t(r.base_reason || 'Wallet reported in a victim complaint')}</td>
            <td className="px-5 py-2.5 text-right font-mono font-semibold text-navy-900">+{r.base ?? 0}</td>
          </tr>
          {rules.map((x) => (
            <tr key={x.id} className={x.fired ? '' : 'text-ink-3'}>
              <td className="px-5 py-2.5 align-top">
                <div className={`flex items-start gap-2 font-medium ${x.fired ? 'text-ink' : ''}`}>
                  {x.fired ? <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-critical" /> : <Circle size={16} className="mt-0.5 shrink-0" />}
                  <span>{t(x.name)}<div className="font-mono text-[10.5px] font-normal text-ink-3">{x.id}</div></span>
                </div>
              </td>
              <td className={`px-3 py-2.5 align-top ${x.fired ? 'text-ink-2' : ''}`}>{tMessage(x.evidence)}</td>
              <td className={`px-5 py-2.5 text-right align-top font-mono ${x.fired ? 'font-semibold text-critical' : ''}`}>{x.fired ? `+${x.points}` : `(${x.points})`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}

export function RiskTab({ d }) {
  const r = d.risk
  const ml = r.ml
  const b = r.blend
  if (!r.rules) {
    return (
      <Card title={t('Risk score')} subtitle={t(r.model)}>
        <RiskGauge score={r.score} />
        <HBar label={t('Points')} labels={r.factors.map((x) => t(x.feature))} values={r.factors.map((x) => x.contribution)} format={(v) => `+${v}`} />
      </Card>
    )
  }
  const fired = r.rules.filter((x) => x.fired).length
  const an = ml?.anomaly
  const sv = ml?.supervised
  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <Card title={t('Final risk score')} subtitle={t(r.model)}>
        <RiskGauge score={r.score} />
        {b && (
          <div className="mt-4 rounded-lg bg-slate-50 p-3 font-mono text-xs leading-relaxed text-ink-2">
            {Math.round(b.rules_weight * 100)}% × {t('rules')} {b.rule_score}<br />
            + {Math.round(b.anomaly_weight * 100)}% × {t('anomaly')} {b.anomaly_score}<br />
            = <b className="text-navy-900">{r.score}</b>
          </div>
        )}
        <p className="mt-3 text-xs text-ink-3">
          {t('Bands: Low < 40 · Medium 40-59 · High 60-79 · Critical ≥ 80. The score ranks which cases to act on first. It is not proof of guilt.')}
        </p>
      </Card>

      <Card className="lg:col-span-2" title={t('How RAAZ scores a case')} subtitle={t('Known patterns, unknown patterns, and wallet-level ML - side by side')}>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-line p-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-ink-2"><ListChecks size={14} /> {t('Rule engine')}</div>
            <div className="mt-1 text-2xl font-bold text-navy-900">{r.rule_score ?? r.score}<span className="text-sm font-medium text-ink-3">/100</span></div>
            <div className="text-[11px] text-ink-3">{t('{a} of {b} rules · catches known patterns', { a: fired, b: r.rules.length })}</div>
          </div>
          {an && (
            <div className="rounded-xl border border-line p-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-ink-2"><Sparkles size={14} /> {t('Anomaly (unsupervised)')}</div>
              <div className="mt-1 text-2xl font-bold text-navy-900">{Math.round(an.case_score)}<span className="text-sm font-medium text-ink-3">/100</span></div>
              <div className="text-[11px] text-ink-3">{t('Isolation Forest · catches new / unknown behaviour')}</div>
            </div>
          )}
          {sv && (
            <div className="rounded-xl border border-line p-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-ink-2"><Brain size={14} /> {t('Classifier (supervised)')}</div>
              <div className="mt-1 text-2xl font-bold text-navy-900">{sv.flagged}<span className="text-sm font-medium text-ink-3"> {t('of {n}', { n: sv.of })}</span></div>
              <div className="text-[11px] text-ink-3">{t('traced wallets flagged as laundering wallets')}</div>
            </div>
          )}
        </div>
        {an && (an.new_pattern ? (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-critical-ink">
            <TriangleAlert size={16} className="mt-0.5 shrink-0" />
            <div><b>{t('Possible new pattern.')}</b> {an.new_pattern_note}</div>
          </div>
        ) : (
          <div className="mt-4 rounded-lg bg-slate-50 p-3 text-xs text-ink-2">
            <b>{t('New-pattern check:')}</b> {t('not triggered - the unusual behaviour here is already explained by the rules.')}
            {' '}{t('It fires when the anomaly score is 90+ while at most one rule fires, i.e. the wallets look very abnormal but no known pattern explains why.')}
          </div>
        ))}
      </Card>

      <RuleTable r={r} />

      {an && (
        <Card className="lg:col-span-3 xl:col-span-1" title={t('Layer 2 - Anomaly detection (unsupervised)')} subtitle={tMessage(an.card.model)}>
          <p className="text-sm text-ink-2">{t(an.card.how)}</p>
          <div className="mt-3 text-[13px] font-semibold text-ink-2">{t('Most unusual wallets in this case')}</div>
          <ul className="mt-1 space-y-2.5">
            {an.top_wallets.map((w) => (
              <li key={w.address} className="rounded-lg border border-line p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1.5"><RoleGlyph role={w.role} size={11} /><Address value={w.address} head={6} tail={5} copy={false} /></span>
                  <span className="shrink-0 text-xs font-semibold text-navy-900">{t('more unusual than {n}%', { n: Math.round(w.anomaly_pct) })}</span>
                </div>
                <div className="text-[11px] text-ink-3">{ROLES[w.role]?.label}</div>
                {w.reasons.length > 0 && <ul className="mt-1 list-disc pl-4 text-xs text-ink-2">{w.reasons.map((x) => <li key={x}>{t(x)}</li>)}</ul>}
              </li>
            ))}
          </ul>
          <div className="mt-3 text-[11px] text-ink-3">{t('Case anomaly score = average of its 3 most unusual traced wallets, as a percentile of all {n} wallets analysed.', { n: an.card.wallets })}</div>
        </Card>
      )}

      {sv && (
        <Card className="lg:col-span-3 xl:col-span-2" title={t('Layer 3 - Laundering-wallet classifier (supervised)')} subtitle={t(sv.card.model)}>
          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <div className="text-sm text-ink-2">{t(sv.card.task)}</div>
              <div className="mt-3 grid grid-cols-4 gap-2 text-center">
                {[['Precision', sv.card.precision], ['Recall', sv.card.recall], ['F1', sv.card.f1], ['ROC-AUC', sv.card.roc_auc]].map(([k, v]) => (
                  <div key={k} className="rounded-lg bg-slate-50 py-2"><div className="text-[11px] text-ink-3">{t(k)}</div><div className="font-bold text-navy-900">{v.toFixed(2)}</div></div>
                ))}
              </div>
              <div className="mt-2 text-[11px] text-ink-3">{tMessage(sv.card.validation)} · {t('{a} behaviour features · {b} wallets from {c} cases', { a: sv.card.features, b: sv.card.wallets, c: sv.card.cases })}</div>
              <div className="mt-3 text-[13px] font-semibold text-ink-2">{t('What the model relies on most')}</div>
              <HBar label={t('Importance')} labels={sv.card.top_features.map((f) => t(f.feature))} values={sv.card.top_features.map((f) => f.importance)} format={(v) => v.toFixed(3)} />
            </div>
            <div>
              <div className="text-[13px] font-semibold text-ink-2">{t('Wallets flagged in this case (held-out prediction)')}</div>
              {sv.wallets.length ? (
                <ul className="mt-1 divide-y divide-line">
                  {sv.wallets.map((w) => (
                    <li key={w.address} className="flex items-center justify-between gap-2 py-1.5">
                      <span className="flex min-w-0 items-center gap-1.5"><RoleGlyph role={w.role} size={11} /><Address value={w.address} head={6} tail={5} copy={false} /></span>
                      <ConfidenceBar value={w.prob} />
                    </li>
                  ))}
                </ul>
              ) : <div className="mt-2 text-sm text-ink-3">{t('No wallet crossed the 50% threshold.')}</div>}
              {sv.flagged > sv.wallets.length && <div className="mt-1 text-[11px] text-ink-3">{t('+{n} more', { n: sv.flagged - sv.wallets.length })}</div>}
            </div>
          </div>
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-warn-ink">
            <TriangleAlert size={14} className="mt-0.5 shrink-0" /><div>{t(sv.card.caveat)}</div>
          </div>
        </Card>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- Timeline & legal
export function TimelineTab({ d }) {
  const { notice, kyc_response: kyc } = d
  return (
    <div className="grid gap-5 lg:grid-cols-5">
      <Card className="lg:col-span-3" title={t('Case timeline')}>
        <ol className="relative ml-2 border-l-2 border-line">
          {d.timeline.map((e, i) => (
            <li key={i} className="mb-5 ml-5 last:mb-0">
              <span className={`absolute -left-[7px] mt-1 size-3 rounded-full ring-4 ring-white ${i === d.timeline.length - 1 ? 'bg-brand-600' : 'bg-slate-300'}`} />
              <div className="text-xs text-ink-3">{dt(e.at)}</div>
              <div className="text-sm font-medium text-ink">{tMessage(e.event)}</div>
            </li>
          ))}
        </ol>
      </Card>
      <div className="space-y-5 lg:col-span-2">
        <Card title={t('Notice to exchange')} action={<Gavel size={16} className="text-ink-3" />}>
          {notice ? (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              <dt className="text-ink-3">{t('Reference')}</dt><dd className="font-mono text-xs">{notice.ref}</dd>
              <dt className="text-ink-3">{t('Exchange')}</dt><dd>{notice.exchange}</dd>
              <dt className="text-ink-3">{t('Sent on')}</dt><dd>{dt(notice.sent_on)}</dd>
              <dt className="text-ink-3">{t('Freeze requested')}</dt><dd className="font-semibold">{inr(notice.freeze_requested_inr)}</dd>
              <dt className="text-ink-3">{t('Status')}</dt><dd><span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${notice.status === 'Responded' ? 'bg-green-50 text-good-ink' : 'bg-amber-50 text-warn-ink'}`}>{t(notice.status)}</span></dd>
              <dt className="text-ink-3">{t('Legal basis')}</dt><dd className="text-xs text-ink-2">{tMessage(notice.legal_basis)}</dd>
            </dl>
          ) : (
            <div className="text-sm text-ink-2">
              {t('No notice sent yet.')}
              {d.attributions[0] && <Link to={`/reports/${d.case.id}?tab=notice`} className={`${btn.primary} mt-3 w-full`}><Gavel size={15} /> {t('Draft notice now')}</Link>}
            </div>
          )}
        </Card>
        <Card title={t('KYC response from exchange')} action={<UserRound size={16} className="text-ink-3" />}>
          {kyc ? (
            <>
              <div className="mb-3 flex items-center gap-2 rounded-lg bg-teal-50 px-3 py-2 text-sm font-semibold text-teal-800"><Snowflake size={15} /> {t('{amt} frozen', { amt: inr(kyc.funds_frozen_inr) })}</div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                <dt className="text-ink-3">{t('Account holder')}</dt><dd className="font-mono">{kyc.account_holder}</dd>
                <dt className="text-ink-3">{t('Mobile')}</dt><dd className="font-mono">{kyc.registered_mobile}</dd>
                <dt className="text-ink-3">{t('Email')}</dt><dd className="font-mono text-xs">{kyc.email}</dd>
                <dt className="text-ink-3">{t('PAN')}</dt><dd className="font-mono">{kyc.pan}</dd>
                <dt className="text-ink-3">{t('KYC country')}</dt><dd>{kyc.kyc_country}</dd>
                <dt className="text-ink-3">{t('Linked bank')}</dt><dd>{kyc.linked_bank}</dd>
                <dt className="text-ink-3">{t('Login IPs')}</dt><dd className="font-mono text-xs">{kyc.login_ips.join(', ')}</dd>
                <dt className="text-ink-3">{t('Received')}</dt><dd>{dt(kyc.received_on)}</dd>
              </dl>
              <p className="mt-3 flex items-start gap-1.5 text-[11.5px] text-ink-3"><ShieldAlert size={13} className="mt-0.5 shrink-0" /> {t('Personal data is masked. Full details are visible only to the assigned investigating officer.')}</p>
            </>
          ) : (
            <div className="text-sm text-ink-2">{notice ? t('Awaiting response from the exchange.') : t('Available after the notice is answered.')}</div>
          )}
        </Card>
      </div>
    </div>
  )
}

