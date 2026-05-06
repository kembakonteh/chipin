import { Link, useNavigate, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '../contexts/AuthContext'

const NAV_ITEMS = [
  { label: 'Campaigns',      to: '/dashboard',       match: ['/dashboard', '/campaigns'] },
  { label: 'Organizations',  to: '/orgs',             match: ['/orgs'] },
  { label: 'Recurring',      to: '/recurring',        match: ['/recurring'] },
  { label: 'Susu',           to: '/susu',             match: ['/susu'] },
  { label: 'Payouts',        to: '/settings/payout',  match: ['/settings'] },
]

export default function Layout({ children }: { children: ReactNode }) {
  const { logout } = useAuth()
  const nav = useNavigate()
  const { pathname } = useLocation()

  function handleLogout() {
    logout()
    nav('/login')
  }

  function isActive(match: string[]) {
    return match.some(prefix => pathname === prefix || pathname.startsWith(prefix + '/'))
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* Top nav */}
      <header className="sticky top-0 z-30 border-b border-gray-800 bg-gray-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link to="/dashboard" className="flex items-center gap-2.5 group">
            <span className="text-2xl">🌍</span>
            <div className="leading-none">
              <span className="block text-xs text-brand-400 font-medium tracking-wide">KafoTech</span>
              <span className="block text-base font-bold text-white group-hover:text-brand-200 transition-colors">
                ChipIn
              </span>
            </div>
          </Link>
          <nav className="flex items-center gap-1">
            {NAV_ITEMS.map(item => (
              <Link
                key={item.to}
                to={item.to}
                className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                  isActive(item.match)
                    ? 'bg-brand-700/40 text-brand-200 font-medium'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`}
              >
                {item.label}
              </Link>
            ))}
            <button
              type="button"
              onClick={handleLogout}
              className="ml-2 rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-400
                hover:border-gray-600 hover:text-white transition-colors"
            >
              Sign out
            </button>
          </nav>
        </div>
      </header>

      {/* Page content */}
      <main className="mx-auto max-w-5xl px-4 py-6">
        {children}
      </main>
    </div>
  )
}
