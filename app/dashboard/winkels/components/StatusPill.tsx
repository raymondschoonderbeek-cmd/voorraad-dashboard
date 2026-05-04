'use client'
export function StatusPill({ actief, geblokkeerd }: { actief: boolean; geblokkeerd: string | null }) {
  if (geblokkeerd?.trim().toLowerCase() === 'ja') {
    return <span style={{ display:'inline-flex', alignItems:'center', gap:4, padding:'2px 8px', borderRadius:999, fontSize:11, fontWeight:700, background:'#fee2e2', color:'#b91c1c' }}>Geblokkeerd</span>
  }
  if (actief) {
    return <span style={{ display:'inline-flex', alignItems:'center', gap:4, padding:'2px 8px', borderRadius:999, fontSize:11, fontWeight:700, background:'#dcfce7', color:'#15803d' }}>Actief</span>
  }
  return <span style={{ display:'inline-flex', alignItems:'center', gap:4, padding:'2px 8px', borderRadius:999, fontSize:11, fontWeight:700, background:'rgba(45,69,124,0.08)', color:'rgba(45,69,124,0.5)' }}>Inactief</span>
}
