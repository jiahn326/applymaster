import { Building2, Users, Ellipsis } from 'lucide-react'
import { appliedThroughLabel } from '../lib/appliedThrough'

// Compact marker for where an application was submitted. Job boards get a letter
// badge in their brand color (no logo files); the rest use generic icons.
// The full name is in the tooltip and for screen readers.
const BADGES: Record<string, { text: string; className: string }> = {
  linkedin:  { text: 'in', className: 'bg-[#0A66C2] text-white' },
  indeed:    { text: 'i',  className: 'bg-[#003A9B] text-white' },
  handshake: { text: 'H',  className: 'bg-gray-900 text-[#D3FB52]' },
}
const ICONS: Record<string, typeof Building2> = {
  company: Building2,
  referral: Users,
  other: Ellipsis,
}

export default function SourceIcon({ value }: { value: string | null | undefined }) {
  const label = appliedThroughLabel(value)
  if (!value || !label) return <span className="text-gray-300" aria-label="Source not set">—</span>

  const badge = BADGES[value]
  const Icon = ICONS[value]
  return (
    <span title={label} aria-label={label} role="img" className="inline-flex items-center justify-center w-5 h-5">
      {badge ? (
        <span className={`inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold leading-none ${badge.className}`}>{badge.text}</span>
      ) : Icon ? (
        <Icon size={16} strokeWidth={2} className="text-gray-500" aria-hidden="true" />
      ) : (
        <span className="text-[10px] text-gray-500 truncate">{label}</span>
      )}
    </span>
  )
}
