// Known TRON exchange wallets (hand-checked from public explorer labels; every address passes the
// TRON base58check checksum). Used when no Tronscan key is set, and always as a first lookup.
// fiu_ind_registered: true only where registration with FIU-IND is publicly reported; null = not checked.
export const KNOWN_EXCHANGE_WALLETS = {
  TV6MuMXfmLbBqPZvBHdwFsDnQeVfnmiuSi: { entity: 'Binance', label: 'Binance hot wallet', fiu_ind_registered: true },
  TDqSquXBgUCLYvYC4XZgrprLK589dkhSCf: { entity: 'Binance', label: 'Binance-Hot 7', fiu_ind_registered: true },
  TWd4WrZ9wn84f5x1hZhL4DHvk738ns5jwb: { entity: 'Binance', label: 'Binance-Cold 2', fiu_ind_registered: true },
  TU4vEruvZwLLkSfV9bNw12EJTPvNr7Pvaa: { entity: 'Bybit', label: 'Bybit hot wallet', fiu_ind_registered: null },
  TZ1SsapyhKNWaVLca6P2qgVzkHTdk6nkXa: { entity: 'HTX', label: 'HTX', fiu_ind_registered: null },
  TYh6mgoMNZTCsgpYHBz7gttEfrQmDMABub: { entity: 'HTX', label: 'HTX', fiu_ind_registered: null },
  TF2fmSbg5HAD34KPUH7WtWCxxvgXHohzYM: { entity: 'HTX', label: 'HTX', fiu_ind_registered: null },
  THZovMcKoZaV9zzFTWteQYd2f3NEvnzxAM: { entity: 'HTX', label: 'HTX', fiu_ind_registered: null },
  TH7vVF9RTMXM9x7ZnPnbNcEph734hpu8cf: { entity: 'HTX', label: 'HTX-Cold 2', fiu_ind_registered: null },
  TRSXRWudzfzY4jH7AaMowdMNUXDkHisbcd: { entity: 'HTX', label: 'HTX-Cold 3', fiu_ind_registered: null },
  TGn1uvntAVntT1pG8o7qoKkbViiYfeg6Gj: { entity: 'HTX', label: 'HTX-Cold 4', fiu_ind_registered: null },
  TAuUCiH4JVNBZmDnEDZkXEUXDARdGpXTmX: { entity: 'HTX', label: 'HTX-Cold 6', fiu_ind_registered: null },
  TKgD8Qnx9Zw3DNvG6o83PkufnMbtEXis4T: { entity: 'HTX', label: 'HTX-Cold 7', fiu_ind_registered: null },
  TEPSrSYPDSQ7yXpMFPq91Fb1QEWpMkRGfn: { entity: 'MEXC', label: 'MEXC', fiu_ind_registered: null },
  TBA6CypYJizwA9XdC7Ubgc5F1bxrQ7SqPt: { entity: 'Gate', label: 'Gate', fiu_ind_registered: null },
  TASUAUKXCqvwYjesEWv22pFjRsCeF4NKot: { entity: 'Upbit', label: 'Upbit hot wallet', fiu_ind_registered: null },
}

// Words in a Tronscan tag that mean "this is an exchange / VASP"
const EXCHANGE_WORDS = /binance|okx|okex|htx|huobi|bybit|kucoin|gate\.?io|\bgate\b|bitget|mexc|poloniex|kraken|coinbase|upbit|bithumb|crypto\.com|bitfinex|hotcoin|whitebit|bingx|coinex|lbank|wazirx|coindcx|zebpay|coinswitch|mudrex|giottus|bitbns|unocoin|exchange|\bhot\b|\bcold\b/i
const FIU_REGISTERED = /binance|kucoin|wazirx|coindcx|zebpay|coinswitch|mudrex|giottus|bitbns|unocoin/i

/** Normalise a Tronscan tag into { entity, label, fiu_ind_registered } when it names an exchange */
export function exchangeFromTag(tag) {
  if (!tag || !EXCHANGE_WORDS.test(tag)) return null
  const entity = tag.split(/[-:(]/)[0].trim().replace(/\s+(hot|cold)\s*\d*$/i, '').trim() || tag
  return { entity, label: tag, fiu_ind_registered: FIU_REGISTERED.test(tag) ? true : null }
}
