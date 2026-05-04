'use client'
import { useState } from 'react'
import useSWR from 'swr'
import type { WinkelActiviteit } from '@/lib/types'
import { IconClock } from '@/components/DashboardIcons'

const fetcher = (url: string) => fetch(url).then(r => r.json())

const KIND_LABELS: Record<string, string> = { notitie: 'Notitie', taak: 'Taak', belverslag: 'Belverslag' }
const KIND_COLORS: Record<string, { bg: string; fg: string }> = {
  notitie: { bg: 'rgba(45,69,124,0.08)', fg: 'rgba(45,69,124,0.6)' },
  taak: { bg: '#fef9c3', fg: '#b45309' },
  belverslag: { bg: '#dbeafe', fg: '#1d4ed8' },
}

export function TabActiviteit({ winkelId }: { winkelId: number }) {
  const { data: items = [], mutate } = useSWR<WinkelActiviteit[]>(`/api/winkels/${winkelId}/activiteit`, fetcher)
  const [kind, setKind] = useState<'notitie' | 'taak' | 'belverslag'>('notitie')
  const [body, setBody] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit() {
    if (!body.trim()) return
    setSaving(true)
    try {
      const res = await fetch(`/api/winkels/${winkelId}/activiteit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, body }),
      })
      if (res.ok) { setBody(''); await mutate() }
    } finally { setSaving(false) }
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
      {/* Compose */}
      <div style={{ padding:16, borderRadius:10, background:'var(--drg-card)', border:'1px solid var(--drg-line)' }}>
        <div style={{ display:'flex', gap:6, marginBottom:8 }}>
          {(['notitie', 'taak', 'belverslag'] as const).map(k => (
            <button key={k} onClick={() => setKind(k)}
              style={{ padding:'4px 10px', borderRadius:6, border:'1px solid', fontSize:12, fontWeight:600, cursor:'pointer',
                background: kind === k ? 'var(--drg-ink-2)' : 'transparent',
                color: kind === k ? 'white' : 'var(--drg-text-2)',
                borderColor: kind === k ? 'var(--drg-ink-2)' : 'rgba(45,69,124,0.15)' }}>
              {KIND_LABELS[k]}
            </button>
          ))}
        </div>
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          placeholder={`Nieuwe ${KIND_LABELS[kind].toLowerCase()}…`}
          rows={3}
          style={{ width:'100%', padding:'8px 10px', borderRadius:8, border:'1px solid rgba(45,69,124,0.15)', fontSize:13, resize:'vertical', background:'white', color:'var(--drg-ink)', boxSizing:'border-box' }}
        />
        <div style={{ display:'flex', justifyContent:'flex-end', marginTop:8 }}>
          <button onClick={submit} disabled={saving || !body.trim()} style={{ padding:'6px 16px', borderRadius:8, background:'var(--drg-ink-2)', color:'white', border:'none', cursor:'pointer', fontSize:13, fontWeight:600, opacity: (!body.trim() || saving) ? 0.5 : 1 }}>
            {saving ? 'Opslaan…' : 'Toevoegen'}
          </button>
        </div>
      </div>

      {/* Timeline */}
      {items.length === 0 ? (
        <p style={{ color:'var(--drg-text-3)', fontSize:13 }}>Nog geen activiteiten.</p>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {items.map(item => {
            const c = KIND_COLORS[item.kind] ?? KIND_COLORS.notitie
            return (
              <div key={item.id} style={{ padding:14, borderRadius:10, background:'var(--drg-card)', border:'1px solid var(--drg-line)' }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                  <span style={{ padding:'2px 8px', borderRadius:999, fontSize:11, fontWeight:700, background:c.bg, color:c.fg }}>{KIND_LABELS[item.kind]}</span>
                  <span style={{ fontSize:11, color:'var(--drg-text-3)', display:'flex', alignItems:'center', gap:4 }}>
                    <IconClock size={11} />
                    {new Date(item.created_at).toLocaleString('nl-NL', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' })}
                  </span>
                </div>
                <p style={{ margin:0, fontSize:13, color:'var(--drg-ink)', whiteSpace:'pre-wrap' }}>{item.body}</p>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
