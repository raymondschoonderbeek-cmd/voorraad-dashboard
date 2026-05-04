'use client'
export function KvList({ children }: { children: React.ReactNode }) {
  return (
    <dl style={{ display:'grid', gridTemplateColumns:'auto 1fr', gap:'4px 16px', margin:0 }}>
      {children}
    </dl>
  )
}
export function KvItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <>
      <dt style={{ fontSize:12, fontWeight:600, color:'var(--drg-text-3)', whiteSpace:'nowrap', paddingTop:1 }}>{label}</dt>
      <dd style={{ fontSize:13, color: value ? 'var(--drg-ink)' : 'var(--drg-text-3)', margin:0 }}>{value || '—'}</dd>
    </>
  )
}
