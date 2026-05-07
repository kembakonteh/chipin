import { useState } from 'react'
import toast from 'react-hot-toast'
import type { Campaign } from '../types'
import { fmt, computeStats } from '../types'
import type { Contributor } from '../types'

interface Props {
  campaign: Campaign
  contributors?: Contributor[]
}

export default function CopyLinkBar({ campaign, contributors = [] }: Props) {
  const [copied, setCopied] = useState(false)
  const publicUrl = `${window.location.origin}/p/${campaign.slug}`

  function handleCopy() {
    navigator.clipboard.writeText(publicUrl).then(() => {
      setCopied(true)
      toast.success('Link copied!')
      setTimeout(() => setCopied(false), 2000)
    })
  }

  function handleWhatsApp() {
    const stats = computeStats(campaign, contributors)
    const msg = [
      `Hey! Chip in for *${campaign.title}* 💚`,
      `${stats.paidCount} people have contributed — ${fmt(stats.totalRaised, campaign.currency)} raised of ${fmt(stats.goalAmount ?? 0, campaign.currency)}.`,
      `Join here: ${publicUrl}`,
    ].join('\n\n')
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank')
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <div className="flex flex-1 items-center rounded-lg border border-gray-700 bg-gray-800 overflow-hidden">
        <span className="flex-1 truncate px-3 py-2 text-sm text-gray-300 font-mono select-all">
          {publicUrl}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className={`shrink-0 border-l border-gray-700 px-3 py-2 text-sm font-medium transition-colors
            ${copied ? 'text-brand-300 bg-brand-800/40' : 'text-gray-400 hover:text-white hover:bg-gray-700'}`}
        >
          {copied ? '✓ Copied' : 'Copy'}
        </button>
      </div>
      <button
        type="button"
        onClick={handleWhatsApp}
        className="flex items-center justify-center gap-2 rounded-lg border border-green-700
          bg-green-900/40 px-4 py-2 text-sm font-medium text-green-300
          hover:bg-green-800/60 transition-colors shrink-0"
      >
        <span>📱</span>
        <span>Share on WhatsApp</span>
      </button>
    </div>
  )
}
