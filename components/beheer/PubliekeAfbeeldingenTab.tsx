'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { DYNAMO_BLUE, FONT_FAMILY } from '@/lib/theme'

const F = FONT_FAMILY

type Afbeelding = {
  id: string
  naam: string
  slug: string
  storage_path: string
  mime_type: string
  breedte: number | null
  hoogte: number | null
  created_at: string
}

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export function PubliekeAfbeeldingenTab() {
  const supabase = createClient()
  const fileRef = useRef<HTMLInputElement>(null)

  const [lijst, setLijst] = useState<Afbeelding[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [kopieerd, setKopieerd] = useState<string | null>(null)

  const [naam, setNaam] = useState('')
  const [slug, setSlug] = useState('')
  const [slugHandmatig, setSlugHandmatig] = useState(false)
  const [breedte, setBreedte] = useState('')
  const [hoogte, setHoogte] = useState('')
  const [bestand, setBestand] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)

  const laad = async () => {
    setLoading(true)
    const res = await fetch('/api/beheer/publieke-afbeeldingen')
    const data = await res.json() as { afbeeldingen?: Afbeelding[]; error?: string }
    if (data.afbeeldingen) setLijst(data.afbeeldingen)
    setLoading(false)
  }

  useEffect(() => { void laad() }, [])

  const publiekUrl = (s: string) =>
    typeof window !== 'undefined'
      ? `${window.location.origin}/api/public/afbeelding/${s}`
      : `/api/public/afbeelding/${s}`

  const kopieerUrl = async (s: string) => {
    await navigator.clipboard.writeText(publiekUrl(s))
    setKopieerd(s)
    setTimeout(() => setKopieerd(null), 2000)
  }

  const handleNaam = (v: string) => {
    setNaam(v)
    if (!slugHandmatig) setSlug(slugify(v))
  }

  const handleBestand = (f: File | null) => {
    setBestand(f)
    setPreview(f ? URL.createObjectURL(f) : null)
  }

  const handleOpslaan = async () => {
    if (!bestand || !naam || !slug) { setError('Vul naam, slug en afbeelding in.'); return }
    if (!/^[a-z0-9-]+$/.test(slug)) { setError('Slug mag alleen kleine letters, cijfers en koppeltekens bevatten.'); return }
    setSaving(true); setError(null); setSuccess(null)

    const ext = bestand.name.split('.').pop() ?? 'jpg'
    const storagePath = `${slug}-${Date.now()}.${ext}`

    const { error: uploadErr } = await supabase.storage
      .from('publieke-afbeeldingen')
      .upload(storagePath, bestand, { contentType: bestand.type, upsert: false })

    if (uploadErr) { setError(`Upload mislukt: ${uploadErr.message}`); setSaving(false); return }

    const res = await fetch('/api/beheer/publieke-afbeeldingen', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        naam, slug, storage_path: storagePath, mime_type: bestand.type,
        breedte: breedte ? Number(breedte) : undefined,
        hoogte: hoogte ? Number(hoogte) : undefined,
      }),
    })
    const data = await res.json() as { error?: string }
    if (!res.ok) {
      await supabase.storage.from('publieke-afbeeldingen').remove([storagePath])
      setError(data.error ?? 'Opslaan mislukt')
    } else {
      setSuccess(`Afbeelding opgeslagen. Publieke URL: ${publiekUrl(slug)}`)
      setNaam(''); setSlug(''); setSlugHandmatig(false); setBreedte(''); setHoogte('')
      setBestand(null); setPreview(null)
      if (fileRef.current) fileRef.current.value = ''
      void laad()
    }
    setSaving(false)
  }

  const handleVerwijder = async (af: Afbeelding) => {
    if (!confirm(`Verwijder "${af.naam}"? De publieke URL werkt daarna niet meer.`)) return
    await fetch(`/api/beheer/publieke-afbeeldingen?id=${af.id}`, { method: 'DELETE' })
    void laad()
  }

  const inp = 'w-full rounded-xl px-3 py-2 text-sm border border-gray-200 outline-none focus:border-[#2D457C] focus:ring-1 focus:ring-[#2D457C] text-gray-900 bg-white placeholder:text-gray-400'

  return (
    <div className="space-y-6">
      {/* Uploadformulier */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
        <h2 className="text-base font-bold" style={{ color: DYNAMO_BLUE, fontFamily: F }}>Nieuwe afbeelding toevoegen</h2>

        {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</p>}
        {success && <p className="text-sm text-green-700 bg-green-50 rounded-xl px-3 py-2 break-all">{success}</p>}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Naam</label>
            <input className={inp} value={naam} onChange={e => handleNaam(e.target.value)} placeholder="bijv. Bureaublad achtergrond" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">
              Slug <span className="font-normal text-gray-400">(onderdeel van de URL)</span>
            </label>
            <input
              className={inp}
              value={slug}
              onChange={e => { setSlug(slugify(e.target.value)); setSlugHandmatig(true) }}
              placeholder="bureaublad-achtergrond"
            />
            {slug && (
              <p className="text-xs text-gray-400 mt-1 truncate">
                URL: <span className="text-[#2D457C] font-mono">/api/public/afbeelding/{slug}</span>
              </p>
            )}
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Breedte (px, optioneel)</label>
            <input className={inp} type="number" value={breedte} onChange={e => setBreedte(e.target.value)} placeholder="1920" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Hoogte (px, optioneel)</label>
            <input className={inp} type="number" value={hoogte} onChange={e => setHoogte(e.target.value)} placeholder="1080" />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1">Afbeelding (max 10 MB)</label>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={e => handleBestand(e.target.files?.[0] ?? null)}
            className="text-sm text-gray-700"
          />
          {preview && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="" className="mt-3 max-h-40 rounded-xl object-contain border border-gray-100" />
          )}
        </div>

        <button
          onClick={() => void handleOpslaan()}
          disabled={saving || !bestand || !naam || !slug}
          className="rounded-xl px-5 py-2.5 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-40"
          style={{ background: DYNAMO_BLUE, fontFamily: F }}
        >
          {saving ? 'Uploaden…' : 'Opslaan & publiceren'}
        </button>
      </div>

      {/* Overzicht */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
        <h2 className="text-base font-bold" style={{ color: DYNAMO_BLUE, fontFamily: F }}>Gepubliceerde afbeeldingen</h2>

        {loading ? (
          <p className="text-sm text-gray-400">Laden…</p>
        ) : lijst.length === 0 ? (
          <p className="text-sm text-gray-400">Nog geen afbeeldingen.</p>
        ) : (
          <div className="space-y-3">
            {lijst.map(af => {
              const { data: urlData } = supabase.storage.from('publieke-afbeeldingen').getPublicUrl(af.storage_path)
              return (
                <div key={af.id} className="flex items-center gap-4 rounded-xl border border-gray-100 p-3">
                  {/* Thumbnail */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={urlData.publicUrl} alt="" className="w-16 h-16 object-cover rounded-lg border border-gray-100 shrink-0" />

                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate" style={{ color: DYNAMO_BLUE }}>{af.naam}</p>
                    <p className="text-xs text-gray-400 font-mono truncate">/api/public/afbeelding/{af.slug}</p>
                    {(af.breedte || af.hoogte) && (
                      <p className="text-xs text-gray-400">{af.breedte ?? '?'} × {af.hoogte ?? '?'} px</p>
                    )}
                  </div>

                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => void kopieerUrl(af.slug)}
                      className="rounded-lg px-3 py-1.5 text-xs font-semibold border transition hover:opacity-80"
                      style={{ borderColor: 'rgba(45,69,124,0.2)', color: DYNAMO_BLUE, background: 'white', fontFamily: F }}
                    >
                      {kopieerd === af.slug ? '✓ Gekopieerd' : 'Kopieer URL'}
                    </button>
                    <button
                      onClick={() => void handleVerwijder(af)}
                      className="rounded-lg px-3 py-1.5 text-xs font-semibold border border-red-200 text-red-600 hover:bg-red-50 transition"
                    >
                      Verwijder
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
