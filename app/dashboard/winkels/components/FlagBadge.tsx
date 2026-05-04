'use client'
export function FlagBadge({ land }: { land: string | null }) {
  if (land === 'Belgium') return <span title="België" aria-label="België">🇧🇪</span>
  if (land === 'Netherlands') return <span title="Nederland" aria-label="Nederland">🇳🇱</span>
  return null
}
