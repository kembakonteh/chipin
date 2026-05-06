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
  const [whatsapp, setWhatsapp] = useState('')

  const createOrg = useMutation({
    mutationFn: (data: object) => api.post<Org>('/orgs', data).then(getData),
    onSuccess: (org: Org) => {
      qc.invalidateQueries({ queryKey: ['orgs'] })
      navigate(`/orgs/${org.slug}`)
    },
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md text-gray-900">
        <div className="p-6 border-b border-gray-100">
          <h2 className="text-xl font-bold text-gray-900">Create Organization</h2>
          <p className="text-sm text-gray-500 mt-1">
            Group your campaigns and members under one roof.
          </p>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
            <input
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Eastside FC, Grace Community"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
            <select
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              value={orgType}
              onChange={e => setOrgType(e.target.value as OrgType)}
            >
              {(Object.keys(ORG_TYPE_LABELS) as OrgType[]).map(t => (
                <option key={t} value={t}>{ORG_TYPE_LABELS[t]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
              rows={3}
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="e.g. A community sports club that collects dues each season for kits, match fees, and events."
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">WhatsApp Group Name</label>
            <input
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
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
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900"
          >
            Cancel
          </button>
          <button
            onClick={() =>
              createOrg.mutate({
                name,
                description: description || null,
                org_type: orgType,
                whatsapp_group_name: whatsapp || null,
              })
            }
            disabled={!name.trim() || createOrg.isPending}
            className="px-5 py-2 text-sm font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
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
        <div className="text-center py-20 bg-white rounded-2xl border border-gray-100 shadow-sm">
          <p className="text-4xl mb-3">🏛️</p>
          <p className="font-semibold text-gray-700">No organizations yet</p>
          <p className="text-sm text-gray-500 mt-1 mb-6">
            Create one to manage members across campaigns
          </p>
          <button
            onClick={() => setShowCreate(true)}
            className="px-5 py-2.5 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700"
          >
            Create Organization
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
