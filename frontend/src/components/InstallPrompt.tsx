import { useEffect, useState } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const STORAGE_KEY = 'chipin_install_dismissed'

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    // Don't show if already dismissed
    if (localStorage.getItem(STORAGE_KEY)) return
    // Don't show if already installed (running in standalone mode)
    if (window.matchMedia('(display-mode: standalone)').matches) return
    // Mobile only
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
    if (!isMobile) return

    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      setVisible(true)
    }

    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  function dismiss() {
    localStorage.setItem(STORAGE_KEY, '1')
    setVisible(false)
  }

  async function install() {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted' || outcome === 'dismissed') {
      localStorage.setItem(STORAGE_KEY, '1')
      setVisible(false)
    }
  }

  if (!visible) return null

  return (
    <div style={{
      position: 'fixed',
      bottom: '72px', // above the bottom nav bar
      left: '12px',
      right: '12px',
      zIndex: 50,
      background: '#1f2937',
      border: '1px solid #374151',
      borderRadius: '16px',
      padding: '14px 16px',
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
    }}>
      <div style={{
        width: '40px',
        height: '40px',
        borderRadius: '10px',
        background: '#0f1117',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        fontSize: '22px',
      }}>
        🌍
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: '13px', fontWeight: 600, color: '#f3f4f6', margin: 0 }}>
          Add ChipIn to Home Screen
        </p>
        <p style={{ fontSize: '11px', color: '#9ca3af', margin: '2px 0 0' }}>
          For the best experience
        </p>
      </div>
      <button
        onClick={install}
        style={{
          padding: '7px 14px',
          background: '#2563eb',
          color: '#fff',
          border: 'none',
          borderRadius: '10px',
          fontSize: '12px',
          fontWeight: 600,
          cursor: 'pointer',
          flexShrink: 0,
        }}
      >
        Install
      </button>
      <button
        onClick={dismiss}
        style={{
          background: 'none',
          border: 'none',
          color: '#6b7280',
          cursor: 'pointer',
          fontSize: '18px',
          lineHeight: 1,
          padding: '4px',
          flexShrink: 0,
        }}
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  )
}
