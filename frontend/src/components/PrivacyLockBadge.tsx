import { useState } from 'react'

export default function PrivacyLockBadge() {
  const [show, setShow] = useState(false)

  return (
    <span
      className="relative inline-flex items-center cursor-default"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      <span className="text-gray-500 text-sm select-none" title="Private on public board">🔒</span>
      {show && (
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 whitespace-nowrap
          rounded bg-gray-700 px-2 py-1 text-xs text-gray-200 shadow-lg z-10 pointer-events-none">
          Private on public board
        </span>
      )}
    </span>
  )
}
