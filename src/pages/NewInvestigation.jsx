import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { CircleAlert, CircleCheck, Database, LoaderCircle, Play, Radio, Sparkles } from 'lucide-react'
import { createInvestigation, createLiveInvestigation, getSamples } from '../lib/api'
import { NETWORKS, detectNetwork } from '../lib/format'
import { Card, Field, NetworkBadge, PageHeader, btn, input, useAsync } from '../components/ui'
import { t } from '../i18n'

const FRAUD = [
  'Investment / Trading App Fraud', 'Task-based Part-time Job Fraud', 'Pig-butchering (Romance-Investment)',
  'Fake Crypto Exchange / Wallet', 'Digital Arrest Scam', 'Ponzi / MLM Token Scheme', 'Loan App Extortion',
]
const STATES = ['Maharashtra', 'Karnataka', 'Delhi', 'Telangana', 'Tamil Nadu', 'Uttar Pradesh', 'Rajasthan', 'Gujarat',
  'West Bengal', 'Punjab', 'Haryana', 'Kerala', 'Madhya Pradesh', 'Bihar', 'Odisha']

export default function NewInvestigation() {
  const nav = useNavigate()
  const [params] = useSearchParams()
  const samples = useAsync(getSamples, [])
  const [f, setF] = useState({
    source: params.get('live') === '1' ? 'live' : 'demo', address: params.get('address') || '', network: '', ncrp: '', victimName: '', amount: '', incidentDate: '',
    fraudType: FRAUD[0], state: 'Maharashtra', district: '', depth: 6, window: 90, bridges: true, mixers: true, watch: true, notes: '',
  })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [hint, setHint] = useState('')
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e }))

  const det = useMemo(() => detectNetwork(f.address), [f.address])
  const network = det ? (det.networks.includes(f.network) ? f.network : det.networks[0]) : ''
  const canLive = det?.family === 'TRON'
  const live = f.source === 'live' && canLive

  const submit = async (e) => {
    e.preventDefault()
    setErr('')
    setHint('')
    if (!det) return setErr(t('Enter a valid Bitcoin, Ethereum/EVM or TRON wallet address.'))
    if (f.source === 'live' && !canLive) return setErr(t('Live tracing works for TRON (USDT) wallets for now.'))
    setBusy(true)
    try {
      const r = live
        ? await createLiveInvestigation({ ...f, network, depth: Math.min(4, Number(f.depth)) })
        : await createInvestigation({ ...f, network, depth: Number(f.depth) })
      nav(`/analysis/${r.id}${r.existing ? '?existing=1' : r.live ? '?live=1' : ''}`)
    } catch (ex) {
      setErr(t(String(ex.message || ex)))
      if (ex.hint) setHint(t(ex.hint))
      setBusy(false)
    }
  }

  return (
    <>
      <PageHeader
        title={t('New investigation')}
        subtitle={t('Enter the wallet address the victim paid to. RAAZ traces where the money went and finds the exchange that received it.')}
      />
      <form onSubmit={submit} className="grid gap-5 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-2">
          <Card title={t('1. Suspect wallet')} subtitle={t('As reported by the complainant (from the NCRP complaint or payment screenshot)')}>
            <Field label={t('Wallet address')} required>
              <input
                className={`${input} font-mono`}
                value={f.address}
                onChange={set('address')}
                placeholder={t('e.g. TQ4n…, 0x7a2f…, bc1q…')}
                spellCheck={false}
                autoFocus
              />
            </Field>
            <div className="mt-2 min-h-6 text-xs">
              {f.address && (det ? (
                <span className="inline-flex items-center gap-1.5 text-good-ink"><CircleCheck size={14} /> {t('Detected:')} {det.label}</span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-critical-ink"><CircleAlert size={14} /> {t('Address format not recognised')}</span>
              ))}
            </div>
            <div className="mt-1 mb-4">
              <div className="mb-1 text-xs font-semibold text-ink-2">{t('Data source')}</div>
              <div role="radiogroup" aria-label={t('Data source')} className="inline-flex rounded-md border border-line bg-page p-0.5 text-sm">
                {[['demo', Database, t('Demo dataset')], ['live', Radio, t('Live TRON blockchain (beta)')]].map(([v, Icon, l]) => (
                  <button key={v} type="button" role="radio" aria-checked={f.source === v} onClick={() => setF((s) => ({ ...s, source: v }))}
                    className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 font-medium ${f.source === v ? 'bg-white text-brand-700 shadow-sm ring-1 ring-line' : 'text-ink-2 hover:text-ink'}`}>
                    <Icon size={14} /> {l}
                  </button>
                ))}
              </div>
              {f.source === 'live' && (
                <p className={`mt-1.5 text-xs ${canLive || !f.address ? 'text-ink-3' : 'text-warn-ink'}`}>
                  {canLive || !f.address
                    ? t('Reads real USDT (TRC-20) transfers from the TRON blockchain and follows them up to 4 hops. Takes 10-20 seconds.')
                    : t('Live tracing works for TRON (USDT) wallets for now.')}
                </p>
              )}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('Blockchain network')} required hint={det?.family === 'EVM' ? t('EVM addresses are valid on several chains - pick the one in the complaint.') : t('Set automatically from the address.')}>
                <select className={input} value={network} onChange={set('network')} disabled={!det || det.networks.length === 1}>
                  {!det && <option value="">{t('- enter address first -')}</option>}
                  {(det?.networks || []).map((n) => <option key={n} value={n}>{NETWORKS[n].name}</option>)}
                </select>
              </Field>
              <Field label={t('NCRP acknowledgement no.')}>
                <input className={input} value={f.ncrp} onChange={set('ncrp')} placeholder={t('14-digit ack. number')} />
              </Field>
            </div>
            {samples.data && (
              <div className="mt-4 rounded-lg bg-brand-50 p-3">
                <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-brand-700"><Sparkles size={13} /> {t('Try a sample wallet from the demo dataset')}</div>
                <div className="flex flex-wrap gap-2">
                  {samples.data.map((s) => (
                    <button
                      type="button"
                      key={s.address}
                      onClick={() => setF((x) => ({ ...x, address: s.address, network: s.network }))}
                      className="inline-flex items-center gap-1.5 rounded-md border border-brand-200 bg-white px-2 py-1 text-xs hover:border-brand-500"
                      title={s.label}
                    >
                      <NetworkBadge network={s.network} />
                      <span className="font-mono">{s.address.slice(0, 10)}…</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </Card>

          <Card title={t('2. Complaint details')} subtitle={t('Used for the report and the notice to the exchange')}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('Complainant name')}><input className={input} value={f.victimName} onChange={set('victimName')} /></Field>
              <Field label={t('Amount lost (₹)')}><input className={input} type="number" min="0" value={f.amount} onChange={set('amount')} placeholder={t('e.g. 450000')} /></Field>
              <Field label={t('Date of first payment')}><input className={input} type="date" value={f.incidentDate} onChange={set('incidentDate')} max="2026-09-24" /></Field>
              <Field label={t('Fraud type')}>
                <select className={input} value={f.fraudType} onChange={set('fraudType')}>{FRAUD.map((x) => <option key={x} value={x}>{t(x)}</option>)}</select>
              </Field>
              <Field label={t('State')}>
                <select className={input} value={f.state} onChange={set('state')}>{STATES.map((x) => <option key={x} value={x}>{t(x)}</option>)}</select>
              </Field>
              <Field label={t('District')}><input className={input} value={f.district} onChange={set('district')} /></Field>
            </div>
            <div className="mt-4">
              <Field label={t('Notes (optional)')}>
                <textarea className={`${input} min-h-20`} value={f.notes} onChange={set('notes')} placeholder={t('Brief description of how the fraud happened')} />
              </Field>
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          <Card title={t('3. Trace settings')}>
            <Field label={t('Maximum hop depth: {n}', { n: live ? Math.min(4, f.depth) : f.depth })} hint={live ? t('Live traces follow up to 4 hops to stay within the API limits.') : t('How many wallet-to-wallet hops to follow from the reported wallet.')}>
              <input type="range" min="1" max="10" value={f.depth} onChange={set('depth')} className="w-full accent-brand-600" />
            </Field>
            <div className="mt-4">
              <Field label={t('Time window after first payment')}>
                <select className={input} value={f.window} onChange={set('window')}>
                  {[7, 30, 90, 180].map((d) => <option key={d} value={d}>{t('{n} days', { n: d })}</option>)}
                </select>
              </Field>
            </div>
            <div className="mt-4 space-y-2.5 text-sm">
              {[
                ['bridges', t('Follow cross-chain bridges')],
                ['mixers', t('Follow mixer outputs (probabilistic)')],
                ['watch', t('Add suspect wallet to watchlist')],
              ].map(([k, l]) => (
                <label key={k} className="flex items-center gap-2.5">
                  <input type="checkbox" checked={f[k]} onChange={set(k)} className="size-4 accent-brand-600" /> {l}
                </label>
              ))}
            </div>
          </Card>

          <Card>
            <div className="text-sm font-semibold text-navy-900">{t('What happens next')}</div>
            <ol className="mt-2 space-y-1.5 text-xs text-ink-2">
              <li>{t("1. Fetch the wallet's transactions from blockchain explorers")}</li>
              <li>{t('2. Follow the money hop by hop and build the graph')}</li>
              <li>{t('3. Detect laundering patterns and group related wallets')}</li>
              <li>{t('4. Match deposit addresses to known exchanges')}</li>
              <li>{t('5. Score the risk and prepare the report')}</li>
            </ol>
            {err && <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-critical-ink">{err}</div>}
            <button className={`${btn.primary} mt-4 w-full py-2.5`} disabled={busy || !f.address}>
              {busy ? <LoaderCircle size={16} className="animate-spin" /> : live ? <Radio size={16} /> : <Play size={16} />} {live ? t('Start live trace') : t('Start automated trace')}
            </button>
            {busy && live && <p className="mt-2 text-xs text-ink-3">{t('Fetching live transfers from TronGrid…')}</p>}
            {hint && <p className="mt-2 text-xs text-ink-2">{hint}</p>}
          </Card>
        </div>
      </form>
    </>
  )
}
