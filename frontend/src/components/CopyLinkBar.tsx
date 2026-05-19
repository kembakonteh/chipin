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
  const isPartyMeeting = campaign.campaign_type === 'political' &&
    !!(campaign.event_date || campaign.event_location)

  function handleCopy() {
    navigator.clipboard.writeText(publicUrl).then(() => {
      setCopied(true)
      toast.success('Link copied!')
      setTimeout(() => setCopied(false), 2000)
    })
  }

  function handleWhatsApp() {
    const stats = computeStats(campaign, contributors)

    if (campaign.campaign_type === 'celebration') {
      const lines: string[] = []
      lines.push(`🎉 You're invited to *${campaign.title}*!`)
      if (campaign.description) {
        lines.push('')
        lines.push(campaign.description)
      }
      if (stats.totalRaised > 0) {
        lines.push('')
        lines.push(`💚 ${stats.paidCount} people attending`)
      }
      lines.push('')
      lines.push(`View details & RSVP here: ${publicUrl}`)
      window.open(`https://wa.me/?text=${encodeURIComponent(lines.join('\n'))}`, '_blank')
      return
    }

    if (campaign.campaign_type === 'memorial') {
      const lines: string[] = []
      lines.push(`🕊️ *${campaign.title}*`)
      lines.push('')
      lines.push('We humbly ask for your support as we work to bring our beloved home. Every contribution, no matter the size, brings us closer.')
      const ben = campaign.beneficiary
      if (ben) {
        lines.push('')
        const story = ben.story ? ben.story.slice(0, 100) + (ben.story.length > 100 ? '…' : '') : null
        lines.push(story ? `${ben.display_name} — ${story}` : ben.display_name)
      }
      if (stats.totalRaised > 0) {
        lines.push('')
        const raised = fmt(stats.totalRaised, campaign.currency)
        lines.push(
          stats.goalAmount != null
            ? `💚 ${stats.paidCount} people have contributed — ${raised} raised of ${fmt(stats.goalAmount, campaign.currency)}`
            : `💚 ${stats.paidCount} people have contributed — ${raised} raised`
        )
      }
      lines.push('')
      lines.push(`Please chip in here: ${publicUrl}`)
      window.open(`https://wa.me/?text=${encodeURIComponent(lines.join('\n'))}`, '_blank')
      return
    }

    if (campaign.campaign_type === 'political') {
      if (isPartyMeeting) {
        const lines: string[] = []
        lines.push(`🏛️ *${campaign.title}*`)
        if (campaign.description) {
          const snippet = campaign.description.slice(0, 100) + (campaign.description.length > 100 ? '…' : '')
          lines.push(snippet)
        }
        lines.push('')
        if (campaign.event_date) {
          const dateStr = new Date(campaign.event_date + 'T00:00:00').toLocaleDateString('en-US', {
            weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
          })
          lines.push(`📅 ${dateStr}`)
        }
        if (campaign.event_time) {
          lines.push(`🕐 ${campaign.event_time}`)
        }
        if (campaign.event_location) {
          lines.push(`📍 ${campaign.event_location}`)
        }
        lines.push('')
        lines.push(`RSVP here: ${publicUrl}`)
        window.open(`https://wa.me/?text=${encodeURIComponent(lines.join('\n'))}`, '_blank')
        return
      }

      const lines: string[] = []
      lines.push(`🗳️ *${campaign.title}*`)
      if (campaign.description) {
        lines.push('')
        lines.push(campaign.description)
      }
      if (stats.totalRaised > 0) {
        const raised = fmt(stats.totalRaised, campaign.currency)
        lines.push('')
        lines.push(
          stats.goalAmount != null
            ? `💚 ${stats.paidCount} supporters — ${raised} raised of ${fmt(stats.goalAmount, campaign.currency)}`
            : `💚 ${stats.paidCount} supporters — ${raised} raised so far`
        )
      }
      lines.push('')
      lines.push(`Click here to contribute: ${publicUrl}`)
      window.open(`https://wa.me/?text=${encodeURIComponent(lines.join('\n'))}`, '_blank')
      return
    }

    const raised = fmt(stats.totalRaised, campaign.currency)
    const progress = stats.goalAmount != null
      ? `${stats.paidCount} people have contributed — ${raised} raised of ${fmt(stats.goalAmount, campaign.currency)}.`
      : `${stats.paidCount} people have contributed — ${raised} raised so far.`
    const msg = [
      `Hey! Chip in for *${campaign.title}* 💚`,
      progress,
      `Join here: ${publicUrl}`,
    ].join('\n\n')
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank')
  }

  function handleShareAttendees() {
    const lines: string[] = []
    lines.push(`✅ *Confirmed Attendees — ${campaign.title}*`)
    lines.push('')
    lines.push('The following members have confirmed attendance:')
    contributors.forEach((c, i) => {
      lines.push(`${i + 1}. ${c.name}`)
    })
    const parts: string[] = []
    if (campaign.event_date) {
      const dateStr = new Date(campaign.event_date + 'T00:00:00').toLocaleDateString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
      })
      parts.push(`📅 ${dateStr}`)
    }
    if (campaign.event_location) {
      parts.push(`📍 ${campaign.event_location}`)
    }
    if (parts.length > 0) {
      lines.push('')
      lines.push(parts.join(' | '))
    }
    lines.push('')
    lines.push(`Not on the list? RSVP here: ${publicUrl}`)
    window.open(`https://wa.me/?text=${encodeURIComponent(lines.join('\n'))}`, '_blank')
  }

  return (
    <div className="flex flex-col gap-2">
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
      {isPartyMeeting && (
        <button
          type="button"
          onClick={handleShareAttendees}
          className="flex items-center justify-center gap-2 rounded-lg border border-brand-700
            bg-brand-900/40 px-4 py-2 text-sm font-medium text-brand-300
            hover:bg-brand-800/60 transition-colors w-full"
        >
          <span>✅</span>
          <span>Share Attendees List</span>
        </button>
      )}
    </div>
  )
}
