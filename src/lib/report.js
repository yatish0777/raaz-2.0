// Report helpers: grounded facts -> LLM prompt, plus an offline template narrative.
// The LLM only writes prose; every number in the report tables comes from the trace itself.

import { inrShort, inr, dateOnly, NETWORKS } from './format'
import { getLang, t } from '../i18n'

export function buildFacts(d, exchanges = []) {
  const c = d.case
  const ex = (id) => exchanges.find((e) => e.id === id)
  const hops = d.transactions.reduce((m, t) => Math.max(m, t.hop ?? 0), 0)
  return {
    case_id: c.id,
    ncrp_ack: c.ncrp_ack,
    fraud_type: c.fraud_type,
    complaint_summary: c.description,
    location: `${c.district}, ${c.state}`,
    reported_on: dateOnly(c.reported_at),
    network: NETWORKS[c.network]?.name ?? c.network,
    token: c.token,
    amount_lost: inr(c.amount_lost_inr),
    victim_payments: c.payments,
    reported_wallet: c.reported_wallet,
    wallets_traced: c.wallets_traced,
    transactions_traced: c.transactions_traced,
    max_hop_depth: hops,
    total_inflow_to_reported_wallet: inr(d.pool_inr),
    traced_to_exchanges: inr(c.traced_to_vasp_inr),
    held_in_wallets: inr(c.held_in_wallets_inr),
    risk: `${d.risk.score}/100 (${t(d.risk.level)})`,
    top_risk_factors: d.risk.factors.slice(0, 5).map((f) => f.feature),
    patterns: d.patterns.map((p) => `${p.type} [${p.severity}]: ${p.description}`), // English facts; the prompt asks for the chosen language
    exchanges: d.attributions.map((a) => ({
      name: a.exchange, jurisdiction: a.jurisdiction, fiu_ind_registered: a.fiu_ind_registered, hops: a.hops,
      amount_received: inr(a.amount_inr), victim_share_pro_rata: inr(a.victim_attributable_inr),
      confidence: `${Math.round(a.confidence * 100)}%`, deposit_addresses: a.deposit_addresses,
      cooperation: ex(a.exchange_id)?.cooperation,
    })),
    nearest_exchange: d.attributions[0]?.exchange ?? null,
    linked_cases: c.linked_cases,
    syndicate: c.syndicate,
  }
}

const LANG_NAME = { en: 'English', hi: 'Hindi (Devanagari script)', mr: 'Marathi (Devanagari script)' }

/** System prompt in the officer's chosen UI language (wallet addresses, hashes and names stay as-is) */
export function systemPrompt(lang = getLang()) {
  return `You are a financial-crime analyst assisting Indian law-enforcement (cyber crime police / I4C).
Write in formal, precise ${LANG_NAME[lang] || 'English'} suitable for a case file. Use ONLY the facts provided in the JSON.
Never invent wallet addresses, amounts, names, dates or exchanges. If a fact is missing, say "not available".
Keep wallet addresses, transaction hashes, case IDs, exchange names and legal section numbers exactly as given.
Use Indian number formatting (lakh / crore) when restating amounts.`
}
export const SYSTEM_PROMPT = systemPrompt('en')

export function buildPrompt(facts, lang = getLang()) {
  const h = (s) => (lang === 'en' ? s : t(s))
  return `Case facts (JSON):
${JSON.stringify(facts, null, 2)}

Write the narrative sections of an investigation report in ${LANG_NAME[lang] || 'English'} with exactly these headings, each on its own line starting with "### ":
### ${h('Executive Summary')}
(one paragraph: what happened, how much, where the funds went, the nearest probable exchange)
### ${h('Modus Operandi and Fund-Flow Analysis')}
(one or two paragraphs explaining the laundering pattern hop by hop, referencing the detected patterns)
### ${h('Basis for Exchange Attribution')}
(one paragraph explaining why the funds are attributed to the exchange(s), with confidence and limitations)
### ${h('Recommended Next Steps')}
(4-6 bullet points starting with "- ", e.g. notice under Section 94 BNSS, freeze request, watchlist, linked cases)

Do not add any other headings. Do not repeat the JSON.`
}

export function templateNarrative(f) {
  const n = f.exchanges[0]
  const pats = f.patterns.map((p) => t(p.split(' [')[0]).toLowerCase())
  const lines = []
  lines.push(`### ${t('Executive Summary')}`)
  lines.push(
    t('On {date}, a complaint (NCRP Ack. {ack}) was registered from {loc} relating to {fraud}.', { date: f.reported_on, ack: f.ncrp_ack, loc: f.location, fraud: t(f.fraud_type) }) + ' ' +
      t('The complainant transferred {amt} in {n} payment(s) of {tok} on the {net} network to the reported wallet {w}.', { amt: f.amount_lost, n: f.victim_payments, tok: f.token, net: f.network, w: f.reported_wallet }) + ' ' +
      t('RAAZ traced {a} wallets and {b} transactions up to {h} hops.', { a: f.wallets_traced, b: f.transactions_traced, h: f.max_hop_depth }) + ' ' +
      (n
        ? t('{amt} of the traced funds reached exchange-controlled deposit addresses; the nearest probable VASP is {ex} ({jur}) at {h} hops with {c} attribution confidence.', { amt: f.traced_to_exchanges, ex: n.name, jur: n.jurisdiction ? t(n.jurisdiction) : t('jurisdiction not checked'), h: n.hops, c: n.confidence })
        : t('No exchange deposit has been observed yet; {amt} remains in layering wallets.', { amt: f.held_in_wallets })),
  )
  lines.push(`### ${t('Modus Operandi and Fund-Flow Analysis')}`)
  lines.push(
    t('The reported wallet received {amt} in total, including inflows from other unattributed sources.', { amt: f.total_inflow_to_reported_wallet }) + ' ' +
      t('Funds were then moved through a layering structure showing {p}.', { p: pats.length ? pats.join(', ') : t('simple forwarding') }) + ' ' +
      t('The overall risk score is {r}, driven mainly by: {f}.', { r: f.risk, f: f.top_risk_factors.slice(0, 3).map((x) => t(x)).join('; ') }),
  )
  if (f.syndicate) lines.push(t('The consolidation wallet is shared with {n} other case(s) ({ids}), indicating the same operator group ({syn}).', { n: f.linked_cases.length, ids: f.linked_cases.join(', '), syn: f.syndicate }))
  lines.push(`### ${t('Basis for Exchange Attribution')}`)
  lines.push(
    n
      ? t('Attribution to {ex} is based on (i) the deposit address(es) {addrs} being swept into a known {ex} hot wallet, and (ii) the per-user deposit-address pattern of the exchange.', { ex: n.name, addrs: n.deposit_addresses.join(', ') }) + ' ' +
          t('{ex} received {amt}, of which {share} is attributable to the complainant on a pro-rata basis.', { ex: n.name, amt: n.amount_received, share: n.victim_share_pro_rata }) + ' ' +
          t("Attribution is probabilistic; confirmation must be obtained from the exchange's KYC and transaction records.")
      : t('Not available - no exchange deposit observed in the traced depth.'),
  )
  lines.push(`### ${t('Recommended Next Steps')}`)
  if (n) {
    lines.push('- ' + t('Issue notice under Section 94 BNSS to {ex} for KYC, login IP and withdrawal records of the deposit address owner.', { ex: n.name }))
    lines.push('- ' + t('Request immediate debit freeze of {amt} at {ex}.', { amt: n.victim_share_pro_rata, ex: n.name }))
  }
  lines.push('- ' + t('Add the reported wallet and consolidation wallets to the RAAZ watchlist for real-time movement alerts.'))
  if (f.syndicate) lines.push('- ' + t('Coordinate with investigating officers of linked cases {ids} for a joint operation.', { ids: f.linked_cases.join(', ') }))
  lines.push('- ' + t('Preserve on-chain evidence (transaction hashes, block numbers) with hash-verified export for court submission.'))
  lines.push('- ' + t('Update the NCRP complaint with trace findings and exchange details.'))
  return lines.join('\n')
}

export { inrShort }
