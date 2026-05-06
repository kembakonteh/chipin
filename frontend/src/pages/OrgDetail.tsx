import { useRef, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { AxiosResponse } from 'axios'
import { api } from '../lib/api'
import type { Org, OrgMember, OrgMemberRole, OrgType } from '../types'
import { fmt } from '../types'
import Layout from '../components/Layout'

function getData<T>(r: AxiosResponse<T>): T { return r.data }

type Tab = 'campaigns' | 'members' | 'settings'

interface OrgCampaignItem {
  slug: string
  title: string
  emoji: string
  status: string
  goal_amount: string
}

interface OrgCampaignsData {
  campaigns: OrgCampaignItem[]
  stats: { total_raised: string; total_campaigns: number; active_campaigns: number }
}

const ROLE_LABELS: Record<OrgMemberRole, string> = {
  admin: 'Admin',
  treasurer: 'Treasurer',
  member: 'Member',
}

const ORG_TYPE_LABELS: Record<OrgType, string> = {
  sports: '⚽ Sports',
  religious: '🕌 Religious',
  community: '🏘️ Community',
  professional: '💼 Professional',
  social: '🎉 Social',
}

// ── Campaigns tab ────────────────────────────────────────────────────────────

function CampaignsTab({ orgSlug }: { orgSlug: string }) {
  const navigate = useNavigate()
  const { data, isLoading } = useQuery<OrgCampaignsData>({
    queryKey: ['org-campaigns', orgSlug],
    queryFn: () => api.get<OrgCampaignsData>(`/orgs/${orgSlug}/campaigns`).then(getData),
  })

  if (isLoading) return <div className="text-center py-10 text-gray-400">Loading…</div>

  const campaigns = data?.campaigns ?? []
  const stats = data?.stats

  return (
    <div>
      {stats && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            { label: 'Total Raised', value: fmt(parseFloat(stats.total_raised)) },
            { label: 'Campaigns', value: stats.total_campaigns },
            { label: 'Active', value: stats.active_campaigns },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-xl border border-gray-100 p-4 text-center">
              <p className="text-2xl font-bold text-gray-900">{s.value}</p>
              <p className="text-xs text-gray-500 mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {campaigns.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          No campaigns for this org yet.
        </div>
      ) : (
        <div className="space-y-3">
          {campaigns.map((c: { slug: string; title: string; emoji: string; status: string; goal_amount: string }) => (
            <button
              key={c.slug}
              onClick={() => navigate(`/campaigns/${c.slug}`)}
              className="w-full text-left bg-white rounded-xl border border-gray-100 hover:border-emerald-200 hover:shadow-sm transition-all p-4 flex items-center gap-3"
            >
              <span className="text-2xl">{c.emoji}</span>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 truncate">{c.title}</p>
                <p className="text-xs text-gray-400 mt-0.5">Goal: {fmt(parseFloat(c.goal_amount))}</p>
              </div>
              <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                c.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'
              }`}>
                {c.status}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Add members modal ─────────────────────────────────────────────────────────

function AddMembersModal({ orgSlug, onClose }: { orgSlug: string; onClose: () => void }) {
  const qc = useQueryClient()
  const [rows, setRows] = useState([{ name: '', phone: '', email: '' }])
  const fileRef = useRef<HTMLInputElement>(null)
  const [csvLoading, setCsvLoading] = useState(false)
  const [csvResult, setCsvResult] = useState<{ imported: number; skipped: number } | null>(null)

  const addMembers = useMutation({
    mutationFn: (members: object[]) =>
      api.post<unknown>(`/orgs/${orgSlug}/members`, members).then(getData),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org-members', orgSlug] })
      onClose()
    },
  })

  const handleCsv = async (file: File) => {
    setCsvLoading(true)
    const fd = new FormData()
    fd.append('file', file)
    try {
      const res = await api.post<{ imported: number; skipped: number }>(`/orgs/${orgSlug}/members/import-csv`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setCsvResult(res.data)
      qc.invalidateQueries({ queryKey: ['org-members', orgSlug] })
    } finally {
      setCsvLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="p-6 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">Add Members</h2>
        </div>
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          {/* Manual rows */}
          <div className="space-y-3">
            {rows.map((row, i) => (
              <div key={i} className="grid grid-cols-3 gap-2">
                <input
                  className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  placeholder="Name *"
                  value={row.name}
                  onChange={e => setRows(prev => prev.map((r, j) => j === i ? { ...r, name: e.target.value } : r))}
                />
                <input
                  className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  placeholder="Phone"
                  value={row.phone}
                  onChange={e => setRows(prev => prev.map((r, j) => j === i ? { ...r, phone: e.target.value } : r))}
                />
                <input
                  className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  placeholder="Email"
                  value={row.email}
                  onChange={e => setRows(prev => prev.map((r, j) => j === i ? { ...r, email: e.target.value } : r))}
                />
              </div>
            ))}
          </div>
          <button
            onClick={() => setRows(prev => [...prev, { name: '', phone: '', email: '' }])}
            className="text-sm text-emerald-600 hover:underline"
          >
            + Add another row
          </button>

          <div className="border-t border-gray-100 pt-4">
            <p className="text-sm font-medium text-gray-700 mb-2">Or import from CSV</p>
            <p className="text-xs text-gray-400 mb-2">Columns: name, phone, email (header row required)</p>
            <input
              ref={fileRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={e => e.target.files?.[0] && handleCsv(e.target.files[0])}
            />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={csvLoading}
              className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {csvLoading ? 'Uploading…' : 'Upload CSV'}
            </button>
            {csvResult && (
              <p className="text-sm text-emerald-700 mt-2">
                ✓ Imported {csvResult.imported}, skipped {csvResult.skipped}
              </p>
            )}
          </div>
        </div>
        <div className="p-6 border-t border-gray-100 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Cancel</button>
          <button
            onClick={() => {
              const valid = rows.filter(r => r.name.trim())
              if (valid.length > 0) addMembers.mutate(valid.map(r => ({
                name: r.name.trim(),
                phone: r.phone.trim() || null,
                email: r.email.trim() || null,
              })))
            }}
            disabled={!rows.some(r => r.name.trim()) || addMembers.isPending}
            className="px-5 py-2 text-sm font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
          >
            {addMembers.isPending ? 'Adding…' : 'Add Members'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Members tab ───────────────────────────────────────────────────────────────

function MembersTab({ orgSlug }: { orgSlug: string }) {
  const qc = useQueryClient()
  const [showAdd, setShowAdd] = useState(false)
  const [search, setSearch] = useState('')

  const { data: members = [], isLoading } = useQuery<OrgMember[]>({
    queryKey: ['org-members', orgSlug],
    queryFn: () => api.get<OrgMember[]>(`/orgs/${orgSlug}/members`).then(getData),
  })

  const updateMember = useMutation({
    mutationFn: ({ id, data }: { id: string; data: object }) =>
      api.patch<unknown>(`/orgs/${orgSlug}/members/${id}`, data).then(getData),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['org-members', orgSlug] }),
  })

  const filtered = members.filter(m =>
    m.name.toLowerCase().includes(search.toLowerCase()) ||
    (m.phone && m.phone.includes(search))
  )

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <input
          className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          placeholder="Search members…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <button
          onClick={() => setShowAdd(true)}
          className="px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 whitespace-nowrap"
        >
          + Add Members
        </button>
      </div>

      {isLoading ? (
        <div className="text-center py-10 text-gray-400">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-10 text-gray-400">
          {search ? 'No members match.' : 'No members yet. Add some above.'}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Phone</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Role</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Campaigns</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(m => (
                <tr key={m.id} className={`hover:bg-gray-50 ${!m.is_active ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3 font-medium text-gray-900">{m.name}</td>
                  <td className="px-4 py-3 text-gray-500">{m.phone || '—'}</td>
                  <td className="px-4 py-3">
                    <select
                      className="text-xs border border-gray-200 rounded px-2 py-1 bg-white"
                      value={m.role}
                      onChange={e => updateMember.mutate({ id: m.id, data: { role: e.target.value } })}
                    >
                      {(Object.keys(ROLE_LABELS) as OrgMemberRole[]).map(r => (
                        <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    <span className="text-emerald-600 font-medium">{m.paid_campaigns}</span>
                    <span className="text-gray-400">/{m.total_campaigns} paid</span>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() =>
                        updateMember.mutate({ id: m.id, data: { is_active: !m.is_active } })
                      }
                      className={`text-xs px-2 py-1 rounded-full font-medium ${
                        m.is_active
                          ? 'bg-emerald-100 text-emerald-700 hover:bg-red-100 hover:text-red-700'
                          : 'bg-gray-100 text-gray-500 hover:bg-emerald-100 hover:text-emerald-700'
                      } transition-colors`}
                    >
                      {m.is_active ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showAdd && <AddMembersModal orgSlug={orgSlug} onClose={() => setShowAdd(false)} />}
    </div>
  )
}

// ── Settings tab ──────────────────────────────────────────────────────────────

function SettingsTab({ org }: { org: Org }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const logoRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState(org.name)
  const [description, setDescription] = useState(org.description ?? '')
  const [orgType, setOrgType] = useState<OrgType>(org.org_type ?? 'community')
  const [whatsapp, setWhatsapp] = useState(org.whatsapp_group_name ?? '')
  const [saved, setSaved] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const updateOrg = useMutation({
    mutationFn: (data: object) =>
      api.patch<Org>(`/orgs/${org.slug}`, data).then(getData),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org', org.slug] })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    },
  })

  const uploadLogo = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData()
      fd.append('logo', file)
      return api.post<Org>(`/orgs/${org.slug}/logo`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }).then(getData)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['org', org.slug] }),
  })

  const deleteOrg = useMutation({
    mutationFn: () => api.delete(`/orgs/${org.slug}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orgs'] })
      navigate('/orgs')
    },
  })

  const inputCls = "w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
  const labelCls = "block text-xs text-gray-400 mb-1"

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <p className={labelCls}>Logo</p>
        <div className="flex items-center gap-4">
          {org.logo_url ? (
            <img src={org.logo_url} alt="" className="w-16 h-16 rounded-xl object-cover" />
          ) : (
            <div className="w-16 h-16 rounded-xl bg-gray-800 flex items-center justify-center text-2xl">🏛️</div>
          )}
          <input ref={logoRef} type="file" accept="image/*" className="hidden"
            onChange={e => e.target.files?.[0] && uploadLogo.mutate(e.target.files[0])} />
          <button
            onClick={() => logoRef.current?.click()}
            className="px-4 py-2 border border-gray-700 rounded-lg text-sm text-gray-300 hover:text-white hover:border-gray-500 transition-colors"
          >
            {uploadLogo.isPending ? 'Uploading…' : 'Change Logo'}
          </button>
        </div>
      </div>

      <div>
        <label className={labelCls}>Name</label>
        <input className={inputCls} value={name} onChange={e => setName(e.target.value)} />
      </div>

      <div>
        <label className={labelCls}>Type</label>
        <select
          className={inputCls}
          value={orgType}
          onChange={e => setOrgType(e.target.value as OrgType)}
        >
          {(Object.keys(ORG_TYPE_LABELS) as OrgType[]).map(t => (
            <option key={t} value={t} className="bg-gray-800">{ORG_TYPE_LABELS[t]}</option>
          ))}
        </select>
      </div>

      <div>
        <label className={labelCls}>Description</label>
        <textarea
          className={`${inputCls} resize-none`}
          rows={3}
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="e.g. A community sports club that collects dues each season for kits, match fees, and events."
        />
      </div>

      <div>
        <label className={labelCls}>WhatsApp Group Name</label>
        <input
          className={inputCls}
          value={whatsapp}
          onChange={e => setWhatsapp(e.target.value)}
          placeholder="Optional — for quick reminders"
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={() =>
            updateOrg.mutate({
              name,
              description: description || null,
              org_type: orgType,
              whatsapp_group_name: whatsapp || null,
            })
          }
          disabled={updateOrg.isPending}
          className="px-5 py-2 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-500 disabled:opacity-50 transition-colors"
        >
          {updateOrg.isPending ? 'Saving…' : 'Save Changes'}
        </button>
        {saved && <p className="text-sm text-brand-400">✓ Saved</p>}
      </div>

      <div className="border-t border-gray-800 pt-4">
        <p className="text-sm text-gray-500">
          Public page: <Link to={`/o/${org.slug}`} className="text-brand-400 hover:underline" target="_blank">/o/{org.slug}</Link>
        </p>
      </div>

      {/* Danger zone */}
      <div className="border-t border-red-900/40 pt-6">
        <p className="text-sm font-semibold text-red-600 mb-1">Danger Zone</p>
        <p className="text-xs text-gray-500 mb-3">
          Deleting this organisation removes the member roster. Your campaigns and all payment history are <span className="font-medium text-gray-700">not affected</span> — they stay intact as standalone campaigns. If you create a new organisation afterwards, you will need to re-add or re-import the members.
        </p>
        {!confirmDelete ? (
          <button
            onClick={() => setConfirmDelete(true)}
            className="px-4 py-2 border border-red-300 text-red-600 text-sm rounded-lg hover:bg-red-50 transition-colors"
          >
            Delete Organization
          </button>
        ) : (
          <div className="rounded-lg border border-red-300 bg-red-50 p-4 space-y-3">
            <p className="text-sm font-medium text-red-700">
              Are you sure? This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => deleteOrg.mutate()}
                disabled={deleteOrg.isPending}
                className="px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {deleteOrg.isPending ? 'Deleting…' : 'Yes, delete it'}
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="px-4 py-2 border border-gray-300 text-gray-600 text-sm rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function OrgDetail() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('campaigns')

  const { data: org, isLoading } = useQuery<Org>({
    queryKey: ['org', slug],
    queryFn: () => api.get<Org>(`/orgs/${slug}`).then(getData),
    enabled: !!slug,
  })

  if (isLoading) return <div className="text-center py-20 text-gray-400">Loading…</div>
  if (!org) return <div className="text-center py-20 text-gray-500">Organization not found.</div>

  const tabs: { key: Tab; label: string }[] = [
    { key: 'campaigns', label: 'Campaigns' },
    { key: 'members', label: `Members (${org.member_count})` },
    { key: 'settings', label: 'Settings' },
  ]

  return (
    <Layout>
    <div>
      <button
        onClick={() => navigate('/orgs')}
        className="text-sm text-gray-400 hover:text-white mb-4 inline-flex items-center gap-1"
      >
        ← Organizations
      </button>

      <div className="flex items-start gap-4 mb-6">
        {org.logo_url ? (
          <img src={org.logo_url} alt="" className="w-16 h-16 rounded-2xl object-cover flex-shrink-0" />
        ) : (
          <div className="w-16 h-16 rounded-2xl bg-gray-800 flex items-center justify-center text-3xl flex-shrink-0">
            {org.org_type === 'sports' ? '⚽' :
             org.org_type === 'religious' ? '🕌' :
             org.org_type === 'professional' ? '💼' :
             org.org_type === 'social' ? '🎉' : '🏘️'}
          </div>
        )}
        <div>
          <h1 className="text-2xl font-bold text-white">{org.name}</h1>
          {org.org_type && (
            <p className="text-sm text-gray-400 mt-0.5">{ORG_TYPE_LABELS[org.org_type]}</p>
          )}
          {org.description && (
            <p className="text-sm text-gray-400 mt-1">{org.description}</p>
          )}
        </div>
      </div>

      <div className="flex gap-1 border-b border-gray-800 mb-6">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key
                ? 'border-brand-500 text-brand-400'
                : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'campaigns' && <CampaignsTab orgSlug={slug!} />}
      {tab === 'members' && <MembersTab orgSlug={slug!} />}
      {tab === 'settings' && <SettingsTab org={org} />}
    </div>
    </Layout>
  )
}
