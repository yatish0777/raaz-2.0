// Lightweight i18n: English text is the key, so untranslated strings fall back to English.
// t('Hello {name}', { name }) works anywhere (components, helpers, chart labels).
// Changing the language re-mounts the app (see LanguageProvider), so plain t() calls pick it up.
import { Fragment, createContext, useContext, useEffect, useState } from 'react'
import hi from './hi'
import mr from './mr'

export const LANGS = [
  { code: 'en', label: 'English', short: 'EN', locale: 'en-IN' },
  { code: 'hi', label: 'हिंदी', short: 'हिं', locale: 'hi-IN' },
  { code: 'mr', label: 'मराठी', short: 'मरा', locale: 'mr-IN' },
]
const DICTS = { hi, mr }
const KEY = 'raaz.lang'

function initial() {
  try {
    const q = new URLSearchParams(window.location.search).get('lang')
    if (q && LANGS.some((l) => l.code === q)) {
      try { localStorage.setItem(KEY, q) } catch { /* keep for this page only */ } // ?lang=mr in a link sticks for the visit
      return q
    }
    const s = localStorage.getItem(KEY)
    if (s && LANGS.some((l) => l.code === s)) return s
  } catch { /* storage blocked - use English */ }
  return 'en'
}

let current = initial()

export function getLang() { return current }

/** Locale for dates, always with Latin digits so numbers stay readable in tables */
export function dateLocale() {
  return `${LANGS.find((l) => l.code === current)?.locale || 'en-IN'}-u-nu-latn`
}

export function t(text, vars) {
  if (text == null) return text
  const d = DICTS[current]
  let s = (d && d[text]) || text
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : m))
  return s
}

// Alert / feed messages arrive as English sentences from the data layer; match the known
// shapes and translate them with their values kept.
const MESSAGE_PATTERNS = [
  [/^Funds from watched wallet reached an exchange deposit address in (\d+) hops$/, 'Funds from watched wallet reached an exchange deposit address in {n} hops', ['n']],
  [/^Funds from watched wallet reached (.+) deposit address in (\d+) hops$/, 'Funds from watched wallet reached {ex} deposit address in {n} hops', ['ex', 'n']],
  [/^(.+) acknowledged notice and marked account for review$/, '{ex} acknowledged notice and marked account for review', ['ex']],
  [/^New inbound of (.+) to watched wallet - possible new victim$/, 'New inbound of {amt} to watched wallet - possible new victim', ['amt']],
  [/^Wallet dormant for (\d+) days became active again$/, 'Wallet dormant for {n} days became active again', ['n']],
  [/^Watched wallet interacted with (.+)$/, 'Watched wallet interacted with {ex}', ['ex']],
  [/^Watched wallet moved (.+) to a new address$/, 'Watched wallet moved {amt} to a new address', ['amt']],
  // case timeline
  [/^Complaint filed on NCRP \(Ack\. (\d+)\)$/, 'Complaint filed on NCRP (Ack. {ack})', ['ack']],
  [/^Case opened in RAAZ by (.+?) \(NCRP (.+)\)$/, 'Case opened in RAAZ by {name} (NCRP {ack})', ['name', 'ack']],
  [/^Case opened in RAAZ by (.+)$/, 'Case opened in RAAZ by {name}', ['name']],
  [/^Automated multi-hop trace completed \(depth (\d+)\)$/, 'Automated multi-hop trace completed (depth {n})', ['n']],
  [/^Live trace on TRON completed \((\d+) API calls\)$/, 'Live trace on TRON completed ({n} API calls)', ['n']],
  [/^The reported wallet itself is labelled (.+)\.$/, 'The reported wallet itself is labelled {label}.', ['label']],
  [/^Nearest VASP identified: (.+) \((\d+) hops, (\d+)% confidence\)$/, 'Nearest VASP identified: {ex} ({n} hops, {c}% confidence)', ['ex', 'n', 'c']],
  [/^Notice (\S+) sent to (.+)$/, 'Notice {ref} sent to {ex}', ['ref', 'ex']],
  [/^KYC details received; INR ([\d,]+) frozen at (.+)$/, 'KYC details received; INR {amt} frozen at {ex}', ['amt', 'ex']],
  // watchlist / wallet labels
  [/^Shared across (\d+) cases - syndicate cash-out hub$/, 'Shared across {n} cases - syndicate cash-out hub', ['n']],
  [/^Suspect wallet in (.+)$/, 'Suspect wallet in {fraud}', ['fraud'], { fraud: true }],
  [/^Flagged from graph of (.+)$/, 'Flagged from graph of {id}', ['id']],
  [/^Consolidation wallet \(Syndicate (\w)\)$/, 'Consolidation wallet (Syndicate {s})', ['s']],
  [/^(.+): deposit address \(attributed\)$/, '{ex}: deposit address (attributed)', ['ex']],
  [/^(.+): hot wallet$/, '{ex}: hot wallet', ['ex']],
  [/^Bridge output wallet on (.+)$/, 'Bridge output wallet on {net}', ['net']],
  [/^(.+) \(cross-chain bridge\)$/, '{name} (cross-chain bridge)', ['name']],
  [/^(.+) \(mixing service\)$/, '{name} (mixing service)', ['name']],
  // pattern descriptions and rule evidence written by the data generator
  [/^Consolidation wallet also appears in (\d+) other RAAZ case\(s\): (.+)\. Likely the same operator \((.+)\)\.$/, 'Consolidation wallet also appears in {n} other RAAZ case(s): {ids}. Likely the same operator ({syn}).', ['n', 'ids', 'syn']],
  [/^Funds moved from (.+) to (.+) through (.+)\.$/, 'Funds moved from {a} to {b} through {br}.', ['a', 'b', 'br']],
  [/^Median time between hops is under (\d+) minutes, consistent with scripted or automated movement\.$/, 'Median time between hops is under {n} minutes, consistent with scripted or automated movement.', ['n']],
  [/^Median time between hops is under (\d+) minutes\.$/, 'Median time between hops is under {n} minutes.', ['n']],
  [/^(.+) sent into (.+); outputs linked probabilistically by amount and timing\.$/, '{amt} sent into {mx}; outputs linked probabilistically by amount and timing.', ['amt', 'mx']],
  [/^(\d+) other wallets paid into the reported wallet in the same window - possible additional victims\.$/, '{n} other wallets paid into the reported wallet in the same window - possible additional victims.', ['n']],
  [/^(\d+)-step peel chain: each hop sheds (\d+)-(\d+)% to a side wallet and forwards the change\.$/, '{n}-step peel chain: each hop sheds {a}-{b}% to a side wallet and forwards the change.', ['n', 'a', 'b']],
  [/^(\d+)-step peel chain shedding small side amounts at each hop\.$/, '{n}-step peel chain shedding small side amounts at each hop.', ['n']],
  [/^Reported wallet split funds into (\d+) fresh wallets within minutes of the last victim payment\.$/, 'Reported wallet split funds into {n} fresh wallets within minutes of the last victim payment.', ['n']],
  [/^Reported wallet split funds into (\d+) fresh wallets\.$/, 'Reported wallet split funds into {n} fresh wallets.', ['n']],
  [/^Reported wallet sent to only (\d+) wallet\(s\)\.$/, 'Reported wallet sent to only {n} wallet(s).', ['n']],
  [/^(\d+) consolidation wallet\(s\) re-merge layering branches before the exchange\.$/, '{n} consolidation wallet(s) re-merge layering branches before the exchange.', ['n']],
  [/^(.+ (?:USDT|USDC|BTC|ETH|BNB)) sent into (.+)$/, '{amt} sent into {mx}', ['amt', 'mx']],
  [/^(\d+) hop\(s\) beyond (\d+) x (-?[\d.]+)$/, '{a} hop(s) beyond {b} x {c}', ['a', 'b', 'c']],
  [/^Cash-out cluster - Syndicate (\w)$/, 'Cash-out cluster - Syndicate {s}', ['s']],
  [/^Section (\d+) BNSS, (\d+) \(production of documents\) \+ request to freeze under Sec\. (\d+) BNSS$/, 'Section {a} BNSS, {y} (production of documents) + request to freeze under Sec. {b} BNSS', ['a', 'y', 'b']],
  [/^Isolation Forest \(scikit-learn, (\d+) trees\)$/, 'Isolation Forest (scikit-learn, {n} trees)', ['n']],
  [/^(\d+)-fold cross-validation grouped by case \(held-out cases\)$/, '{n}-fold cross-validation grouped by case (held-out cases)', ['n']],
]

export function tMessage(msg) {
  if (!msg || current === 'en') return msg
  if (DICTS[current]?.[msg]) return t(msg)
  for (const [re, key, names, translateVars] of MESSAGE_PATTERNS) {
    const m = msg.match(re)
    if (m) return t(key, Object.fromEntries(names.map((n, i) => [n, translateVars?.[n] ? t(m[i + 1]) : m[i + 1]])))
  }
  return t(msg)
}

const Ctx = createContext({ lang: current, setLang: () => {} })
export const useLang = () => useContext(Ctx)

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(current)
  const setLang = (l) => {
    current = l
    try { localStorage.setItem(KEY, l) } catch { /* keep in memory */ }
    setLangState(l)
  }
  useEffect(() => { document.documentElement.lang = lang }, [lang])
  // key={lang} re-mounts the tree so every t() call re-evaluates in the new language
  return <Ctx.Provider value={{ lang, setLang }}><Fragment key={lang}>{children}</Fragment></Ctx.Provider>
}
