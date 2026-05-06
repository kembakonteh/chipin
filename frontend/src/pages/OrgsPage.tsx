import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import type { AxiosResponse } from 'axios'
import { api } from '../lib/api'
import type { Org, OrgType } from '../types'
import Layout from '../components/Layout'

function getData<T>(r: AxiosResponse<T>): T { return r.data }

const ORG_TYPE_LABELS: Record<OrgType, string> = {
  sports: '⚽ Sports',
  religious: '🕌 Religious',
  community: '🏘️ Community',
  professional: '💼 Professional',
  social: '🎉 Social',
}

function CreateOrgModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [orgType, setOrgType] = useState<OrgType>('community')
  const [phone, setPhone] = useState('')
  const [whatsapp, setWhatsapp] = useState('')

  const createOrg = useMutation({
    mutationFn: (data: object) => api.post<Org>('/orgs', data).then(getData),
    onSuccess: (org: Org) => {
      qc.invalidateQueries({ queryKey: ['orgs'] })
      navigate(`/orgs/${org.slug}`)
    },
  })

  const inputCls = "w-full border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
  const labelCls = "block text-sm font-medium text-gray-700 mb-1"

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="p-6 border-b border-gray-100">
          <h2 className="text-xl font-bold text-gray-900">Create Organisation</h2>
          <p className="text-sm text-gray-500 mt-1">
            Group your campaigns and members under one roof.
          </p>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className={labelCls}>Name *</label>
            <input
              className={inputCls}
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Eastside FC, Al-Noor Islamic Centre"
            />
          </div>
          <div>
            <label className={labelCls}>Type</label>
            <select
              className={inputCls}
              value={orgType}
              onChange={e => setOrgType(e.target.value as OrgType)}
            >
              {(Object.keys(ORG_TYPE_LABELS) as OrgType[]).map(t => (
                <option key={t} value={t}>{ORG_TYPE_LABELS[t]}</option>
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
            <label className={labelCls}>Contact Phone</label>
            <input
              className={inputCls}
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="e.g. +1 202 555 0199"
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
          {createOrg.error && (
            <p className="text-sm text-red-600">Something went wrong. Please try again.</p>
          )}
        </div>
        <div className="p-6 border-t border-gray-100 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">
            Cancel
          </button>
          <button
            onClick={() =>
              createOrg.mutate({
                name,
                description: description || null,
                org_type: orgType,
                phone: phone || null,
                whatsapp_group_name: whatsapp || null,
              })
            }
            disabled={!name.trim() || createOrg.isPending}
            className="px-5 py-2 text-sm font-semibold bg-brand-600 text-white rounded-lg hover:bg-brand-500 disabled:opacity-50 transition-colors"
          >
            {createOrg.isPending ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function OrgsPage() {
  const [showCreate, setShowCreate] = useState(false)
  const navigate = useNavigate()

  const { data: orgs = [], isLoading } = useQuery<Org[]>({
    queryKey: ['orgs'],
    queryFn: () => api.get<Org[]>('/orgs').then(getData),
  })

  return (
    <Layout>
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Organizations</h1>
          <p className="text-sm text-gray-500 mt-1">Manage your groups and their members</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700"
        >
          + New Organization
        </button>
      </div>

      {isLoading ? (
        <div className="text-center py-16 text-gray-400">Loading…</div>
      ) : orgs.length === 0 ? (
        <div className="rounded-2xl border border-gray-800 bg-gray-900 p-10 text-center">
          <p className="text-4xl mb-4">🏛️</p>
          <p className="text-lg font-semibold text-white mb-2">No organisations yet</p>
          <p className="text-sm text-gray-400 max-w-md mx-auto mb-2 leading-relaxed">
            Organisations are for groups you collect from repeatedly — the same members,
            multiple campaigns, month after month or year after year.
          </p>
          <p className="text-sm text-gray-500 max-w-md mx-auto mb-8 leading-relaxed">
            Add your members once and they are automatically imported into every new
            campaign you create for that group. No re-entering names and numbers each time.
          </p>
          <button
            onClick={() => setShowCreate(true)}
            className="px-5 py-2.5 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-500 transition-colors"
          >
            Create Organisation
          </button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {orgs.map(org => (
            <button
              key={org.id}
              onClick={() => navigate(`/orgs/${org.slug}`)}
              className="text-left bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:border-emerald-200 transition-all p-5"
            >
              <div className="flex items-start gap-3">
                {org.logo_url ? (
                  <img src={org.logo_url} alt="" className="w-12 h-12 rounded-xl object-cover flex-shrink-0" />
                ) : (
                  <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center text-2xl flex-shrink-0">
                    {org.org_type === 'sports' ? '⚽' :
                     org.org_type === 'religious' ? '🕌' :
                     org.org_type === 'professional' ? '💼' :
                     org.org_type === 'social' ? '🎉' : '🏘️'}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 truncate">{org.name}</p>
                  {org.org_type && (
                    <p className="text-xs text-gray-400 mt-0.5">{ORG_TYPE_LABELS[org.org_type]}</p>
                  )}
                  {org.description && (
                    <p className="text-sm text-gray-500 mt-1 line-clamp-2">{org.description}</p>
                  )}
                </div>
              </div>
              <div className="mt-4 flex gap-4 text-sm text-gray-500">
                <span><span className="font-semibold text-gray-900">{org.member_count}</span> members</span>
              </div>
            </button>
          ))}
        </div>
      )}

      {showCreate && <CreateOrgModal onClose={() => setShowCreate(false)} />}
    </div>
    </Layout>
  )
}
