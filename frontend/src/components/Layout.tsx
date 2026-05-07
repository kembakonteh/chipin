import { Link, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '../contexts/AuthContext'

interface Tab {
  to: string
  label: string
  icon: string
}

function buildTabs(features: { campaigns_enabled: boolean; susu_enabled: boolean; org_enabled: boolean } | null): Tab[] {
  const tabs: Tab[] = [{ to: '/dashboard', label: 'Home', icon: '🏠' }]
  if (features?.campaigns_enabled) tabs.push({ to: '/campaigns', label: 'Campaigns', icon: '📋' })
  if (features?.susu_enabled) tabs.push({ to: '/susu', label: 'Susu', icon: '💰' })
  if (features?.org_enabled) tabs.push({ to: '/orgs', label: 'My Org', icon: '👥' })
  tabs.push({ to: '/profile', label: 'Profile', icon: '👤' })
  return tabs
}

export default function Layout({ children }: { children: ReactNode }) {
  const { features } = useAuth()
  const { pathname } = useLocation()
  const tabs = buildTabs(features)

  function isActive(to: string) {
    if (to === '/dashboard') return pathname === '/dashboard'
    if (to === '/campaigns') return pathname === '/campaigns' || pathname.startsWith('/campaigns/')  || pathname.startsWith('/dashboard/')
    return pathname.startsWith(to)
  }

  return (
    <div style={{ minHeight: '100vh', background: '#030712', color: '#f3f4f6', paddingBottom: '64px' }}>

      {/* Minimal top header — logo only */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 30,
        background: 'rgba(3,7,18,0.95)',
        borderBottom: '1px solid #1f2937',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          height: '48px',
          padding: '0 16px',
        }}>
          <Link to="/dashboard" style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            textDecoration: 'none',
          }}>
            <span style={{ fontSize: '20px' }}>🌍</span>
            <span style={{ fontSize: '15px', fontWeight: 700, color: '#fff' }}>ChipIn</span>
          </Link>
        </div>
      </header>

      {/* Page content */}
      <main style={{
        maxWidth: '1024px',
        margin: '0 auto',
        padding: '24px 16px',
        boxSizing: 'border-box',
        width: '100%',
      }}>
        {children}
      </main>

      {/* Bottom tab bar */}
      <nav style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 40,
        background: 'rgba(3,7,18,0.97)',
        borderTop: '1px solid #1f2937',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex',
        height: '64px',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}>
        {tabs.map(tab => {
          const active = isActive(tab.to)
          return (
            <Link
              key={`${tab.to}-${tab.label}`}
              to={tab.to}
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '2px',
                textDecoration: 'none',
                color: active ? '#3b82f6' : '#6b7280',
                transition: 'color 0.15s',
              }}
            >
              <span style={{ fontSize: '22px', lineHeight: 1 }}>{tab.icon}</span>
              <span style={{ fontSize: '11px', fontWeight: active ? 600 : 400 }}>{tab.label}</span>
            </Link>
          )
        })}
      </nav>

    </div>
  )
}
