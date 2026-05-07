import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import type { UserFeatures } from '../types'

interface Card {
  key: 'campaigns' | 'susu' | 'org'
  title: string
  icon: string
  description: string
  examples: string[]
  color: string
}

const CARDS: Card[] = [
  {
    key: 'campaigns',
    title: 'Campaigns',
    icon: '📋',
    color: '#3b82f6',
    description:
      'Collect money for any group need — sports dues, a funeral, a wedding, an emergency, a celebration. Share one link, get paid by card or Zelle.',
    examples: ['Sports & team dues', 'Funeral repatriation', 'Wedding gift', 'Community emergency'],
  },
  {
    key: 'susu',
    title: 'Susu / Savings Circle',
    icon: '💰',
    color: '#10b981',
    description:
      'Rotating savings group where everyone contributes each cycle and takes turns receiving the full pot. Fully digital.',
    examples: ['10 members × $100/month', 'Everyone receives once', 'No manual tracking'],
  },
  {
    key: 'org',
    title: 'Organization / Association',
    icon: '👥',
    color: '#8b5cf6',
    description:
      'Manage dues, members, and finances for a community group or association. Monthly dues, member directory, financial statements.',
    examples: ['Monthly dues', 'Member directory', 'Financial statements'],
  },
]

export default function Onboarding() {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const { setFeatures } = useAuth()
  const nav = useNavigate()

  function toggle(key: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  async function handleContinue() {
    if (selected.size === 0) return
    setSaving(true)
    try {
      const { data } = await api.post<UserFeatures>('/users/me/features', {
        campaigns: selected.has('campaigns'),
        susu: selected.has('susu'),
        org: selected.has('org'),
      })
      setFeatures(data)
      nav('/dashboard', { replace: true })
    } catch {
      setSaving(false)
    }
  }

  const canContinue = selected.size > 0 && !saving

  return (
    <div style={{
      minHeight: '100vh',
      background: '#030712',
      color: '#f3f4f6',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '32px 16px 40px',
      boxSizing: 'border-box',
    }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '32px', maxWidth: '480px' }}>
        <div style={{ fontSize: '36px', marginBottom: '12px' }}>🌍</div>
        <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#fff', margin: '0 0 8px' }}>
          Welcome to ChipIn
        </h1>
        <p style={{ fontSize: '15px', color: '#9ca3af', margin: 0 }}>
          What will you use ChipIn for? Pick everything that applies.
        </p>
      </div>

      {/* Cards */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        width: '100%',
        maxWidth: '480px',
        marginBottom: '28px',
      }}>
        {CARDS.map(card => {
          const isSelected = selected.has(card.key)
          return (
            <button
              key={card.key}
              type="button"
              onClick={() => toggle(card.key)}
              style={{
                background: isSelected ? `${card.color}18` : '#111827',
                border: `2px solid ${isSelected ? card.color : '#1f2937'}`,
                borderRadius: '16px',
                padding: '20px',
                cursor: 'pointer',
                textAlign: 'left',
                position: 'relative',
                transition: 'border-color 0.15s, background 0.15s',
              }}
            >
              {/* Checkmark */}
              {isSelected && (
                <div style={{
                  position: 'absolute',
                  top: '16px',
                  right: '16px',
                  width: '24px',
                  height: '24px',
                  borderRadius: '50%',
                  background: card.color,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '13px',
                  color: '#fff',
                  fontWeight: 700,
                }}>
                  ✓
                </div>
              )}

              {/* Title row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                <span style={{ fontSize: '24px' }}>{card.icon}</span>
                <span style={{
                  fontSize: '17px',
                  fontWeight: 700,
                  color: isSelected ? '#fff' : '#e5e7eb',
                }}>
                  {card.title}
                </span>
              </div>

              {/* Description */}
              <p style={{ fontSize: '14px', color: '#9ca3af', margin: '0 0 12px', lineHeight: '1.5' }}>
                {card.description}
              </p>

              {/* Examples */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {card.examples.map(ex => (
                  <span key={ex} style={{
                    fontSize: '12px',
                    padding: '3px 8px',
                    borderRadius: '20px',
                    background: isSelected ? `${card.color}28` : '#1f2937',
                    color: isSelected ? card.color : '#6b7280',
                    border: `1px solid ${isSelected ? `${card.color}50` : '#374151'}`,
                  }}>
                    {ex}
                  </span>
                ))}
              </div>
            </button>
          )
        })}
      </div>

      {/* Continue button */}
      <div style={{ width: '100%', maxWidth: '480px' }}>
        <button
          type="button"
          onClick={handleContinue}
          disabled={!canContinue}
          style={{
            width: '100%',
            padding: '14px',
            borderRadius: '12px',
            border: 'none',
            background: canContinue ? '#3b82f6' : '#1f2937',
            color: canContinue ? '#fff' : '#4b5563',
            fontSize: '16px',
            fontWeight: 600,
            cursor: canContinue ? 'pointer' : 'not-allowed',
            transition: 'background 0.15s',
            marginBottom: '16px',
          }}
        >
          {saving ? 'Saving…' : 'Continue'}
        </button>

        <p style={{ fontSize: '13px', color: '#6b7280', textAlign: 'center', margin: 0 }}>
          You can turn features on or off anytime in Profile → Settings
        </p>
      </div>
    </div>
  )
}
