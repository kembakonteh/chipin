import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { api } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import Layout from '../components/Layout'
import type { UserFeatures } from '../types'

interface UserMe {
  email: string
  name: string
  phone: string | null
}

interface ToggleRowProps {
  label: string
  icon: string
  color: string
  enabled: boolean
  disabled: boolean
  onChange: (val: boolean) => void
}

function ToggleRow({ label, icon, color, enabled, disabled, onChange }: ToggleRowProps) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '14px 0',
      borderBottom: '1px solid #1f2937',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span style={{ fontSize: '20px' }}>{icon}</span>
        <span style={{ fontSize: '15px', color: '#e5e7eb', fontWeight: 500 }}>{label}</span>
      </div>
      <button
        type="button"
        onClick={() => !disabled && onChange(!enabled)}
        style={{
          width: '44px',
          height: '24px',
          borderRadius: '12px',
          border: 'none',
          background: enabled ? color : '#374151',
          cursor: disabled ? 'not-allowed' : 'pointer',
          position: 'relative',
          transition: 'background 0.2s',
          opacity: disabled ? 0.5 : 1,
          flexShrink: 0,
        }}
        title={disabled ? 'At least one feature must remain enabled' : undefined}
      >
        <span style={{
          position: 'absolute',
          top: '2px',
          left: enabled ? '22px' : '2px',
          width: '20px',
          height: '20px',
          borderRadius: '50%',
          background: '#fff',
          transition: 'left 0.2s',
        }} />
      </button>
    </div>
  )
}

function NavPreview(f: { campaigns: boolean; susu: boolean; org: boolean }) {
  const tabs: { label: string; icon: string }[] = [{ label: 'Home', icon: '🏠' }]
  if (f.campaigns) tabs.push({ label: 'Campaigns', icon: '📋' })
  if (f.susu) tabs.push({ label: 'Susu', icon: '💰' })
  if (f.org && !f.campaigns) tabs.push({ label: 'My Org', icon: '👥' })
  tabs.push({ label: 'Profile', icon: '👤' })

  return (
    <div style={{
      background: '#111827',
      border: '1px solid #1f2937',
      borderRadius: '12px',
      padding: '12px',
      marginTop: '16px',
    }}>
      <p style={{ fontSize: '12px', color: '#6b7280', margin: '0 0 10px' }}>Nav tabs preview</p>
      <div style={{ display: 'flex', gap: '4px' }}>
        {tabs.map(t => (
          <div key={t.label} style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '3px',
            padding: '8px 4px',
            background: '#1f2937',
            borderRadius: '8px',
          }}>
            <span style={{ fontSize: '18px' }}>{t.icon}</span>
            <span style={{ fontSize: '10px', color: '#9ca3af' }}>{t.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function ProfilePage() {
  const { features, setFeatures, logout } = useAuth()
  const nav = useNavigate()

  const [local, setLocal] = useState({
    campaigns: features?.campaigns_enabled ?? true,
    susu: features?.susu_enabled ?? false,
    org: features?.org_enabled ?? false,
  })
  const [saving, setSaving] = useState(false)

  const [me, setMe] = useState<UserMe | null>(null)
  const [name, setName] = useState('')
  const [nameEditing, setNameEditing] = useState(false)
  const [nameSaving, setNameSaving] = useState(false)
  const [phone, setPhone] = useState('')
  const [phoneEditing, setPhoneEditing] = useState(false)
  const [phoneSaving, setPhoneSaving] = useState(false)

  useEffect(() => {
    api.get<UserMe>('/users/me').then(r => {
      setMe(r.data)
      setName(r.data.name ?? '')
      setPhone(r.data.phone ?? '')
    }).catch(() => {})
  }, [])

  async function handleSaveName() {
    if (!name.trim()) return
    setNameSaving(true)
    try {
      const { data } = await api.patch<UserMe>('/users/me', { name: name.trim() })
      setMe(data)
      setName(data.name ?? '')
      setNameEditing(false)
      toast.success('Name saved')
    } catch {
      toast.error('Failed to save name')
    } finally {
      setNameSaving(false)
    }
  }

  async function handleSavePhone() {
    setPhoneSaving(true)
    try {
      const { data } = await api.patch<UserMe>('/users/me', { phone: phone.trim() || null })
      setMe(data)
      setPhone(data.phone ?? '')
      setPhoneEditing(false)
      toast.success('Phone number saved')
    } catch {
      toast.error('Failed to save phone number')
    } finally {
      setPhoneSaving(false)
    }
  }

  useEffect(() => {
    if (features) {
      setLocal({
        campaigns: features.campaigns_enabled,
        susu: features.susu_enabled,
        org: features.org_enabled,
      })
    }
  }, [features])

  const enabledCount = [local.campaigns, local.susu, local.org].filter(Boolean).length

  async function handleToggle(key: 'campaigns' | 'susu' | 'org', val: boolean) {
    const next = { ...local, [key]: val }
    if (!next.campaigns && !next.susu && !next.org) return
    setLocal(next)
    setSaving(true)
    try {
      const { data } = await api.post<UserFeatures>('/users/me/features', next)
      setFeatures(data)
    } catch {
      toast.error('Failed to save preferences')
      setLocal(local)
    } finally {
      setSaving(false)
    }
  }

  function handleLogout() {
    logout()
    nav('/login')
  }

  return (
    <Layout>
      <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#fff', marginBottom: '24px' }}>Profile</h1>

      {/* Account section */}
      <div style={{
        background: '#111827',
        border: '1px solid #1f2937',
        borderRadius: '16px',
        padding: '16px 20px',
        marginBottom: '24px',
      }}>
        <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#fff', margin: '0 0 12px' }}>Account</h2>
        {me && (
          <div style={{ marginBottom: '8px' }}>
            <span style={{ fontSize: '13px', color: '#6b7280' }}>{me.email}</span>
          </div>
        )}
        {/* Full name */}
        <div style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
            <span style={{ fontSize: '14px', color: '#e5e7eb', fontWeight: 500 }}>Full name</span>
            {!nameEditing && (
              <button
                type="button"
                onClick={() => setNameEditing(true)}
                style={{ fontSize: '13px', color: '#40916c', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                Edit
              </button>
            )}
          </div>
          {nameEditing ? (
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Your full name"
                style={{
                  flex: 1,
                  background: '#1f2937',
                  border: '1px solid #374151',
                  borderRadius: '8px',
                  padding: '8px 12px',
                  color: '#fff',
                  fontSize: '14px',
                  outline: 'none',
                }}
              />
              <button
                type="button"
                onClick={handleSaveName}
                disabled={nameSaving || !name.trim()}
                style={{
                  padding: '8px 14px',
                  background: '#065f46',
                  color: '#6ee7b7',
                  border: '1px solid #047857',
                  borderRadius: '8px',
                  fontSize: '13px',
                  cursor: (nameSaving || !name.trim()) ? 'not-allowed' : 'pointer',
                  opacity: (nameSaving || !name.trim()) ? 0.6 : 1,
                }}
              >
                {nameSaving ? 'Saving…' : 'Save'}
              </button>
              <button
                type="button"
                onClick={() => { setNameEditing(false); setName(me?.name ?? '') }}
                style={{ padding: '8px', color: '#6b7280', background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px' }}
              >
                Cancel
              </button>
            </div>
          ) : (
            <p style={{ fontSize: '14px', color: me?.name ? '#d1d5db' : '#4b5563', margin: 0 }}>
              {me?.name ?? 'Not set'}
            </p>
          )}
          <p style={{ fontSize: '11px', color: '#4b5563', margin: '4px 0 0' }}>
            Shown as the organizer name on your public susu pages.
          </p>
        </div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
            <span style={{ fontSize: '14px', color: '#e5e7eb', fontWeight: 500 }}>Phone number</span>
            {!phoneEditing && (
              <button
                type="button"
                onClick={() => setPhoneEditing(true)}
                style={{ fontSize: '13px', color: '#40916c', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                {me?.phone ? 'Edit' : '+ Add'}
              </button>
            )}
          </div>
          {phoneEditing ? (
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="+1 206 555 0100"
                style={{
                  flex: 1,
                  background: '#1f2937',
                  border: '1px solid #374151',
                  borderRadius: '8px',
                  padding: '8px 12px',
                  color: '#fff',
                  fontSize: '14px',
                  outline: 'none',
                }}
              />
              <button
                type="button"
                onClick={handleSavePhone}
                disabled={phoneSaving}
                style={{
                  padding: '8px 14px',
                  background: '#065f46',
                  color: '#6ee7b7',
                  border: '1px solid #047857',
                  borderRadius: '8px',
                  fontSize: '13px',
                  cursor: phoneSaving ? 'not-allowed' : 'pointer',
                  opacity: phoneSaving ? 0.6 : 1,
                }}
              >
                {phoneSaving ? 'Saving…' : 'Save'}
              </button>
              <button
                type="button"
                onClick={() => { setPhoneEditing(false); setPhone(me?.phone ?? '') }}
                style={{ padding: '8px', color: '#6b7280', background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px' }}
              >
                Cancel
              </button>
            </div>
          ) : (
            <p style={{ fontSize: '14px', color: me?.phone ? '#d1d5db' : '#4b5563', margin: 0 }}>
              {me?.phone ?? 'Not set — add your number for WhatsApp notifications'}
            </p>
          )}
          <p style={{ fontSize: '11px', color: '#4b5563', margin: '4px 0 0' }}>
            Used for Susu WhatsApp standings reports. Include country code.
          </p>
        </div>
      </div>

      {/* Features section */}
      <div style={{
        background: '#111827',
        border: '1px solid #1f2937',
        borderRadius: '16px',
        padding: '16px 20px',
        marginBottom: '24px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#fff', margin: 0 }}>Features I use</h2>
          {saving && <span style={{ fontSize: '12px', color: '#6b7280' }}>Saving…</span>}
        </div>
        <p style={{ fontSize: '13px', color: '#6b7280', margin: '0 0 4px' }}>
          Toggle the features you want. At least one must stay on.
        </p>

        <ToggleRow
          label="Campaigns"
          icon="📋"
          color="#3b82f6"
          enabled={local.campaigns}
          disabled={local.campaigns && enabledCount === 1}
          onChange={v => handleToggle('campaigns', v)}
        />
        <ToggleRow
          label="Susu / Savings Circle"
          icon="💰"
          color="#10b981"
          enabled={local.susu}
          disabled={local.susu && enabledCount === 1}
          onChange={v => handleToggle('susu', v)}
        />
        <ToggleRow
          label="Organization / Association"
          icon="👥"
          color="#8b5cf6"
          enabled={local.org}
          disabled={local.org && enabledCount === 1}
          onChange={v => handleToggle('org', v)}
        />

        <NavPreview campaigns={local.campaigns} susu={local.susu} org={local.org} />
      </div>

      {/* Sign out */}
      <button
        type="button"
        onClick={handleLogout}
        style={{
          width: '100%',
          padding: '13px',
          borderRadius: '12px',
          border: '1px solid #374151',
          background: 'transparent',
          color: '#9ca3af',
          fontSize: '15px',
          cursor: 'pointer',
        }}
      >
        Sign out
      </button>
    </Layout>
  )
}
