import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  Bell, Bot, Building2, FileText, FolderSearch, Languages, LayoutDashboard, Menu, Network, PanelLeftClose, PanelLeftOpen, Radar, Search, X,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { listAlerts, search, startLiveFeed, subscribe } from '../lib/api'
import { checkOllama, getOllamaConfig } from '../lib/ollama'
import { LANGS, t, useLang } from '../i18n'

const NAV = () => [
  { to: '/', label: t('Dashboard'), icon: LayoutDashboard, end: true },
  { to: '/investigate', label: t('New Investigation'), icon: Search },
  { to: '/cases', label: t('Cases'), icon: FolderSearch },
  { to: '/watchlist', label: t('Watchlist & Alerts'), icon: Radar, badge: 'alerts' },
  { to: '/network', label: t('Network Map'), icon: Network },
  { to: '/exchanges', label: t('VASP Directory'), icon: Building2 },
  { to: '/reports', label: t('Reports'), icon: FileText },
]

function LanguageSwitch() {
  const { lang, setLang } = useLang()
  return (
    <div role="radiogroup" aria-label={t('Language')} title={t('Language')} className="flex items-center rounded-md border border-line bg-page p-0.5">
      <Languages size={15} className="mx-1.5 hidden text-ink-3 sm:block" aria-hidden />
      {LANGS.map((l) => (
        <button
          key={l.code}
          type="button"
          role="radio"
          aria-checked={lang === l.code}
          aria-label={l.label}
          title={l.label}
          onClick={() => setLang(l.code)}
          className={`rounded px-2 py-1 text-xs font-semibold whitespace-nowrap ${lang === l.code ? 'bg-white text-brand-700 shadow-sm ring-1 ring-line' : 'text-ink-2 hover:text-ink'}`}
        >
          <span className="hidden md:inline">{l.label}</span><span className="md:hidden">{l.short}</span>
        </button>
      ))}
    </div>
  )
}

export function Logo({ light = false, size = 'md' }) {
  return (
    <div className="leading-none">
      <div className={`font-cond font-bold tracking-[0.08em] ${light ? 'text-white' : 'text-navy-900'} ${size === 'lg' ? 'text-4xl' : 'text-[26px]'}`}>
        RAAZ<span className="text-stamp">.</span>
      </div>
      <div className={`mt-1 text-[11.5px] ${light ? 'text-brand-200' : 'text-ink-3'}`}>{t('Crypto fraud tracing for cyber police')}</div>
    </div>
  )
}

function useUnread() {
  const [n, setN] = useState(0)
  useEffect(() => {
    const load = () => listAlerts().then((a) => setN(a.filter((x) => !x.read).length))
    load()
    return subscribe(load)
  }, [])
  return n
}

function OllamaStatus() {
  const [st, setSt] = useState(null)
  useEffect(() => {
    const run = () => checkOllama().then(setSt)
    run()
    const t = setInterval(run, 60000)
    return () => clearInterval(t)
  }, [])
  const cfg = getOllamaConfig()
  const ok = st?.ok
  return (
    <Link to="/reports" className="flex items-start gap-2 rounded-md px-2 py-2 text-xs text-ink-2 hover:bg-page">
      <Bot size={14} className="mt-0.5 shrink-0" />
      <span>
        {t('Local AI (Ollama)')}
        <span className="flex items-center gap-1.5 text-ink-3">
          <span className={`size-1.5 rounded-full ${st == null ? 'bg-slate-400' : ok ? 'bg-good' : 'bg-warn'}`} />
          {st == null ? t('Checking') : ok ? t('Connected, {model}', { model: cfg.model }) : t('Offline, using report template')}
        </span>
      </span>
    </Link>
  )
}

export default function Layout() {
  const { user } = useAuth()
  const nav = useNavigate()
  const loc = useLocation()
  const unread = useUnread()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [railOpen, setRailOpen] = useState(false)
  const [pinned, setPinned] = useState(() => {
    try { return localStorage.getItem('raaz.menuPinned') === '1' } catch { return false }
  })
  useEffect(() => {
    try { localStorage.setItem('raaz.menuPinned', pinned ? '1' : '0') } catch { /* storage blocked - keep in memory */ }
  }, [pinned])
  useEffect(() => setRailOpen(false), [loc.pathname])

  useEffect(() => startLiveFeed(), [])
  useEffect(() => setOpen(false), [loc.pathname])

  const onSearch = async (e) => {
    e.preventDefault()
    const to = await search(q)
    if (to) {
      nav(to)
      setQ('')
    }
  }

  // compact = icon rail. On desktop the rail stays slim while you work in the main area and
  // slides open when you point at it (or tab into it). "Keep open" pins it at full width.
  const renderSidebar = (compact, mobile = false) => (
    <aside className={`flex h-full flex-col border-r border-line bg-white ${mobile ? 'w-60' : 'w-full'}`}>
      <div className={`flex items-start justify-between pt-6 pb-5 transition-[padding] duration-200 ${compact ? 'px-[22px]' : 'px-5'}`}>
        {compact ? (
          <div className="font-cond text-[26px] leading-none font-bold text-navy-900" aria-label="RAAZ">R<span className="text-stamp">.</span></div>
        ) : (
          <div className="sidebar-fade"><Logo /></div>
        )}
        {mobile && <button className="text-ink-3" onClick={() => setOpen(false)} aria-label={t('Close menu')}><X size={20} /></button>}
      </div>
      <nav className="flex-1 space-y-px px-3" aria-label={t('Main')}>
        {NAV().map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            title={compact ? n.label : undefined}
            className={({ isActive }) =>
              `relative flex items-center gap-3 rounded-md border-l-[3px] px-3 py-2 text-sm whitespace-nowrap ${
                isActive ? 'border-brand-600 bg-brand-50 font-semibold text-navy-900' : 'border-transparent text-ink-2 hover:bg-page hover:text-ink'
              }`
            }
          >
            <n.icon size={17} strokeWidth={1.9} className="shrink-0" />
            {compact ? (
              n.badge === 'alerts' && unread > 0 && <span className="absolute top-1.5 left-7 size-2 rounded-full bg-stamp" aria-label={t('{n} unread alerts', { n: unread })} />
            ) : (
              <>
                <span className="sidebar-fade flex-1">{n.label}</span>
                {n.badge === 'alerts' && unread > 0 && (
                  <span className="sidebar-fade tabular rounded bg-stamp px-1.5 text-[11px] font-semibold text-white">{unread}</span>
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>
      <div className="space-y-2 border-t border-line px-3 pt-3 pb-4">
        {compact ? (
          <div className="flex justify-center py-2 text-ink-3" title={t('Local AI (Ollama) status')}><Bot size={16} /></div>
        ) : (
          <div className="sidebar-fade space-y-2">
            <OllamaStatus />
            <p className="px-2 text-[11px] leading-relaxed text-ink-3">
              {t('For authorised police use. Every action is logged. SIH26183 prototype v0.2.')}
            </p>
          </div>
        )}
        {!mobile && (
          <button
            type="button"
            onClick={() => setPinned((p) => !p)}
            aria-pressed={pinned}
            title={pinned ? t('Let the menu slide away') : t('Keep the menu open')}
            className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs whitespace-nowrap text-ink-3 hover:bg-page hover:text-ink ${compact ? 'justify-center' : ''}`}
          >
            {pinned ? <PanelLeftClose size={16} className="shrink-0" /> : <PanelLeftOpen size={16} className="shrink-0" />}
            {!compact && <span className="sidebar-fade">{pinned ? t('Let menu slide away') : t('Keep menu open')}</span>}
          </button>
        )}
      </div>
    </aside>
  )

  const expanded = pinned || railOpen
  return (
    <div className="app-shell flex h-full">
      {/* desktop: the space the menu takes animates between rail (68px) and full (240px) only when pinned;
          when not pinned it opens over the page so the content doesn't jump */}
      <div
        className="no-print relative hidden shrink-0 transition-[width] duration-300 ease-out lg:block"
        style={{ width: pinned ? 240 : 68 }}
        onMouseEnter={() => setRailOpen(true)}
        onMouseLeave={() => setRailOpen(false)}
        onFocus={() => setRailOpen(true)}
        onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setRailOpen(false) }}
      >
        <div
          className={`absolute inset-y-0 left-0 z-30 overflow-hidden transition-[width,box-shadow] duration-300 ease-out ${
            expanded && !pinned ? 'shadow-[8px_0_24px_-12px_rgba(20,32,43,0.35)]' : ''
          }`}
          style={{ width: expanded ? 240 : 68 }}
        >
          {renderSidebar(!expanded)}
        </div>
      </div>
      {open && (
        <div className="no-print fixed inset-0 z-40 flex lg:hidden">
          {renderSidebar(false, true)}
          <button className="flex-1 bg-black/40" aria-label={t('Close menu')} onClick={() => setOpen(false)} />
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="no-print bg-amber-50 px-4 py-1 text-center text-[12px] text-warn-ink">
          {t('Demo data: every wallet, hash, person and exchange name here is fictional.')}
        </div>
        <header className="no-print flex items-center gap-3 border-b border-line bg-white px-4 py-2 lg:px-8">
          <button className="text-ink-2 lg:hidden" onClick={() => setOpen(true)} aria-label={t('Open menu')}><Menu size={22} /></button>
          <form onSubmit={onSearch} className="relative max-w-xl flex-1">
            <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('Search wallet address, case ID, NCRP ack no. or victim name…')}
              className="w-full rounded-md border border-line bg-page py-2 pr-3 pl-9 text-sm placeholder:text-ink-3 focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-100 focus:outline-none"
            />
          </form>
          <div className="ml-auto flex items-center gap-2">
            <LanguageSwitch />
            <span className="hidden items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-warn-ink md:inline-flex" title={t('Prototype running on demo data. Live blockchain tracing is not connected in this build.')}>
              <span className="size-2 rounded-full bg-amber-500" /> {t('Demo mode')}
            </span>
            <Link to="/watchlist" className="relative rounded-lg p-2 text-ink-2 hover:bg-slate-100" aria-label={t('{n} unread alerts', { n: unread })}>
              <Bell size={19} />
              {unread > 0 && (
                <span className="absolute -top-0.5 -right-0.5 grid min-w-4 place-items-center rounded bg-stamp px-1 text-[10px] font-bold text-white">{unread}</span>
              )}
            </Link>
            <div className="hidden text-right sm:block">
              <div className="text-sm font-semibold text-ink">{user.name}</div>
              <div className="text-[11px] text-ink-3">{t(user.rank)}, {user.badge}</div>
            </div>
            <div className="grid size-9 place-items-center rounded-md bg-navy-900 font-cond text-sm font-semibold text-white">
              {user.name.split(' ').map((p) => p[0]).slice(0, 2).join('')}
            </div>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto px-4 py-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
