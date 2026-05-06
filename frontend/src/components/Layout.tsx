import { Link, useNavigate, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '../contexts/AuthContext'

const NAV_ITEMS = [
  { label: 'Campaigns',     short: 'Camp.',   to: '/dashboard',      match: ['/dashboard', '/campaigns'] },
  { label: 'Organizations', short: 'Orgs',    to: '/orgs',           match: ['/orgs'] },
  { label: 'Recurring',     short: 'Recur.',  to: '/recurring',      match: ['/recurring'] },
  { label: 'Susu',          short: 'Susu',    to: '/susu',           match: ['/susu'] },
  { label: 'Payouts',       short: 'Pay.',    to: '/settings/payout',match: ['/settings'] },
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

      {/* Sticky top header */}
      <header
        className="sticky top-0 z-30 border-b border-gray-800 bg-gray-950/90 backdrop-blur"
        style={{ width: '100%', maxWidth: '100vw', boxSizing: 'border-box' }}
      >
        <div style={{
          display: 'flex',
          alignItems: 'center',
          padding: '0 12px',
          height: '52px',
          gap: '8px',
          width: '100%',
          boxSizing: 'border-box',
        }}>

          {/* Logo — fixed, never shrinks */}
          <Link
            to="/dashboard"
            style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: '6px', textDecoration: 'none' }}
          >
            <span style={{ fontSize: '22px', lineHeight: 1 }}>🌍</span>
            <div style={{ lineHeight: 1.1 }}>
              <span style={{ display: 'block', fontSize: '10px', color: '#52B788', fontWeight: 500, letterSpacing: '0.05em' }}>KafoTech</span>
              <span style={{ display: 'block', fontSize: '14px', fontWeight: 700, color: '#fff' }}>ChipIn</span>
            </div>
          </Link>

          {/* Scrollable nav — fills available space */}
          <div
            className="nav-scroll"
            style={{
              flex: 1,
              overflowX: 'auto',
              overflowY: 'hidden',
              WebkitOverflowScrolling: 'touch',
            }}
          >
            <nav style={{
              display: 'flex',
              alignItems: 'center',
              gap: '2px',
              whiteSpace: 'nowrap',
              width: 'max-content',
              padding: '0 4px',
            }}>
              {NAV_ITEMS.map(item => {
                const active = isActive(item.match)
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    style={{
                      display: 'inline-block',
                      padding: '5px 10px',
                      borderRadius: '8px',
                      fontSize: '12px',
                      fontWeight: active ? 600 : 400,
                      color: active ? '#B7E4C7' : '#9ca3af',
                      background: active ? 'rgba(45,106,79,0.3)' : 'transparent',
                      textDecoration: 'none',
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                    }}
                  >
                    <span className="nav-label-full">{item.label}</span>
                    <span className="nav-label-short">{item.short}</span>
                  </Link>
                )
              })}
            </nav>
          </div>

          {/* Sign out — fixed, never shrinks */}
          <button
            type="button"
            onClick={handleLogout}
            style={{
              flexShrink: 0,
              padding: '5px 10px',
              borderRadius: '8px',
              border: '1px solid #374151',
              background: 'transparent',
              color: '#9ca3af',
              fontSize: '12px',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            Sign out
          </button>

        </div>
      </header>

      {/* Page content */}
      <main className="mx-auto max-w-5xl px-4 py-6">
        {children}
      </main>

    </div>
  )
}
