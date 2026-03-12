'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { DYNAMO_BLUE, DYNAMO_GOLD, FONT_FAMILY } from '@/lib/theme'

const fetcher = (url: string) => fetch(url).then(r => r.json())

type OrderItem = {
  id: string
  quantity: number
  unit_price_cents: number
  lunch_products: { id: string; name: string } | null
}

type Order = {
  id: string
  user_email: string | null
  user_name: string | null
  order_date: string
  status: string
  total_cents: number
  created_at: string
  lunch_order_items: OrderItem[]
}

type LunchProduct = {
  id: string
  name: string
  description: string | null
  price_cents: number
  category: string
  active: boolean
  sort_order: number
  image_url?: string | null
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'In afwachting',
  paid: 'Betaald',
  cancelled: 'Geannuleerd',
}

const CATEGORY_LABELS: Record<string, string> = {
  italiaanse_bol: 'Italiaanse bol',
  bruine_driehoek: 'Bruine driehoek',
  ciabatta: 'Ciabatta',
}

function formatPrice(cents: number) {
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(cents / 100)
}

function formatDate(s: string) {
  return new Date(s).toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' })
}

export default function LunchBeheerPage() {
  const router = useRouter()
  const [tab, setTab] = useState<'orders' | 'products' | 'instellingen'>('orders')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const { data: sessionData } = useSWR<{ isAdmin?: boolean; lunchOnly?: boolean }>('/api/auth/session-info', fetcher)
  const isAdmin = sessionData?.isAdmin === true
  const lunchOnly = sessionData?.lunchOnly === true

  useEffect(() => {
    if (sessionData && !sessionData.isAdmin) {
      router.replace('/dashboard/lunch')
    }
  }, [sessionData, router])
  const [editingProduct, setEditingProduct] = useState<LunchProduct | null>(null)
  const [newProduct, setNewProduct] = useState(false)
  const [gekopieerd, setGekopieerd] = useState(false)

  const { data: orders = [], isLoading: ordersLoading, mutate: mutateOrders } = useSWR<Order[]>(
    tab === 'orders' ? `/api/lunch/orders?date=${date}&admin=true` : null,
    fetcher
  )
  const { data: products = [], isLoading: productsLoading, mutate: mutateProducts } = useSWR<LunchProduct[]>(
    tab === 'products' ? '/api/lunch/products' : null,
    fetcher
  )

  const ordersTotal = orders.reduce((s, o) => s + o.total_cents, 0)
  const ordersPaid = orders.filter(o => o.status === 'paid').reduce((s, o) => s + o.total_cents, 0)

  // Aantallen per broodje (exclusief geannuleerde bestellingen)
  const aantallenPerBroodje = useMemo(() => {
    const map = new Map<string, number>()
    for (const order of orders) {
      if (order.status === 'cancelled') continue
      for (const item of order.lunch_order_items ?? []) {
        const naam = item.lunch_products?.name ?? 'Onbekend'
        map.set(naam, (map.get(naam) ?? 0) + item.quantity)
      }
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1])
  }, [orders])

  const leverancierTekst = useMemo(() => {
    const datum = formatDate(date)
    const regels = aantallenPerBroodje.map(([naam, qty]) => `${naam}: ${qty}`)
    return `Bestelling lunch ${datum}\n\n${regels.join('\n')}\n\nTotaal: ${aantallenPerBroodje.reduce((s, [, q]) => s + q, 0)} broodjes`
  }, [date, aantallenPerBroodje])

  async function kopieerVoorLeverancier() {
    try {
      await navigator.clipboard.writeText(leverancierTekst)
      setGekopieerd(true)
      setTimeout(() => setGekopieerd(false), 2500)
    } catch {
      setGekopieerd(false)
    }
  }

  async function markAsPaid(orderId: string) {
    const res = await fetch(`/api/lunch/orders/${orderId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'paid' }),
    })
    if (res.ok) mutateOrders()
  }

  async function verwijderBestelling(orderId: string, naam: string) {
    if (!confirm(`Bestelling van "${naam}" definitief verwijderen?`)) return
    const res = await fetch(`/api/lunch/orders/${orderId}`, { method: 'DELETE' })
    if (res.ok) mutateOrders()
    else {
      const data = await res.json().catch(() => ({}))
      alert(data.error ?? 'Verwijderen mislukt.')
    }
  }

  return (
    <div className="min-h-screen" style={{ background: '#f4f6fb', fontFamily: FONT_FAMILY }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap');
        input, select { color: #0d1f4e !important; }
        input::placeholder { color: #6b7280 !important; }
      `}</style>

      <header style={{ background: DYNAMO_BLUE }} className="sticky top-0 z-50">
        <div className="px-4 py-3 flex items-center justify-between">
          <Link href={lunchOnly ? '/dashboard/lunch' : '/dashboard'} className="flex items-center gap-2 text-white hover:opacity-90">
            <span>←</span>
            <span className="font-bold">{lunchOnly ? 'Lunch beheer' : 'Dashboard'}</span>
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
        {!isAdmin && sessionData && (
          <div className="rounded-xl p-4 text-center" style={{ background: '#fef2f2', color: '#991b1b' }}>
            Geen toegang. Alleen beheerders kunnen deze pagina bekijken.
          </div>
        )}
        {isAdmin && (
        <>
        <div className="flex gap-2 border-b" style={{ borderColor: 'rgba(13,31,78,0.1)' }}>
          <button
            type="button"
            onClick={() => setTab('orders')}
            className="px-4 py-2 font-semibold text-sm rounded-t-lg transition"
            style={{
              background: tab === 'orders' ? 'white' : 'transparent',
              color: tab === 'orders' ? DYNAMO_BLUE : 'rgba(13,31,78,0.5)',
              borderBottom: tab === 'orders' ? '2px solid ' + DYNAMO_BLUE : '2px solid transparent',
            }}
          >
            Dagoverzicht
          </button>
          <button
            type="button"
            onClick={() => setTab('products')}
            className="px-4 py-2 font-semibold text-sm rounded-t-lg transition"
            style={{
              background: tab === 'products' ? 'white' : 'transparent',
              color: tab === 'products' ? DYNAMO_BLUE : 'rgba(13,31,78,0.5)',
              borderBottom: tab === 'products' ? '2px solid ' + DYNAMO_BLUE : '2px solid transparent',
            }}
          >
            Producten
          </button>
          <button
            type="button"
            onClick={() => setTab('instellingen')}
            className="px-4 py-2 font-semibold text-sm rounded-t-lg transition"
            style={{
              background: tab === 'instellingen' ? 'white' : 'transparent',
              color: tab === 'instellingen' ? DYNAMO_BLUE : 'rgba(13,31,78,0.5)',
              borderBottom: tab === 'instellingen' ? '2px solid ' + DYNAMO_BLUE : '2px solid transparent',
            }}
          >
            Instellingen
          </button>
        </div>

        {tab === 'orders' && (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <label className="text-sm font-semibold" style={{ color: DYNAMO_BLUE }}>Datum:</label>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="rounded-xl px-3 py-2 text-sm border placeholder:text-gray-500"
                style={{ borderColor: 'rgba(13,31,78,0.2)', background: 'white', color: DYNAMO_BLUE }}
              />
              <div className="flex gap-4 ml-4">
                <span className="text-sm" style={{ color: 'rgba(13,31,78,0.6)' }}>
                  {orders.length} bestellingen · {formatPrice(ordersTotal)} totaal · {formatPrice(ordersPaid)} betaald
                </span>
              </div>
            </div>

            {aantallenPerBroodje.length > 0 && (
              <div
                className="rounded-xl overflow-hidden"
                style={{ background: 'white', border: '2px solid ' + DYNAMO_GOLD, boxShadow: '0 2px 12px rgba(240,192,64,0.2)' }}
              >
                <div className="p-4 flex items-center justify-between flex-wrap gap-2" style={{ background: 'rgba(240,192,64,0.1)', borderBottom: '1px solid rgba(240,192,64,0.3)' }}>
                  <h3 className="font-bold" style={{ color: DYNAMO_BLUE }}>🥪 Aantallen voor leverancier</h3>
                  <button
                    type="button"
                    onClick={kopieerVoorLeverancier}
                    className="px-4 py-2 rounded-lg font-semibold text-sm transition hover:opacity-90 disabled:opacity-70"
                    style={{ background: gekopieerd ? '#16a34a' : DYNAMO_GOLD, color: gekopieerd ? 'white' : DYNAMO_BLUE }}
                  >
                    {gekopieerd ? '✓ Gekopieerd!' : 'Kopieer voor leverancier'}
                  </button>
                </div>
                <div className="p-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {aantallenPerBroodje.map(([naam, qty]) => (
                      <div key={naam} className="flex justify-between items-center rounded-lg px-3 py-2" style={{ background: 'rgba(13,31,78,0.03)' }}>
                        <span className="font-medium" style={{ color: DYNAMO_BLUE }}>{naam}</span>
                        <span className="font-bold text-lg" style={{ color: DYNAMO_GOLD }}>{qty}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 pt-3 flex justify-between items-center" style={{ borderTop: '1px solid rgba(13,31,78,0.08)' }}>
                    <span className="text-sm font-semibold" style={{ color: 'rgba(13,31,78,0.6)' }}>Totaal broodjes</span>
                    <span className="font-bold text-xl" style={{ color: DYNAMO_BLUE }}>
                      {aantallenPerBroodje.reduce((s, [, q]) => s + q, 0)}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {ordersLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className="h-24 rounded-xl animate-pulse" style={{ background: 'rgba(13,31,78,0.06)' }} />
                ))}
              </div>
            ) : orders.length === 0 ? (
              <div className="rounded-xl p-8 text-center" style={{ background: 'white', border: '1px solid rgba(13,31,78,0.1)' }}>
                <p className="text-gray-500">Geen bestellingen voor {formatDate(date)}.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {orders.map(order => (
                  <div
                    key={order.id}
                    className="rounded-xl overflow-hidden"
                    style={{ background: 'white', border: '1px solid rgba(13,31,78,0.1)', boxShadow: '0 2px 8px rgba(13,31,78,0.06)' }}
                  >
                    <div className="p-4 flex items-center justify-between flex-wrap gap-2" style={{ borderBottom: '1px solid rgba(13,31,78,0.08)' }}>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold" style={{ color: DYNAMO_BLUE }}>
                          {order.user_name || order.user_email || 'Onbekend'}
                        </span>
                        {order.status === 'pending' && (
                          <button
                            type="button"
                            onClick={() => markAsPaid(order.id)}
                            className="text-xs px-2 py-1 rounded font-semibold"
                            style={{ background: '#dcfce7', color: '#166534' }}
                          >
                            Markeer als betaald
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => verwijderBestelling(order.id, order.user_name || order.user_email || 'Onbekend')}
                          className="text-xs px-2 py-1 rounded font-semibold"
                          style={{ background: 'rgba(220,38,38,0.1)', color: '#b91c1c' }}
                        >
                          Verwijderen
                        </button>
                        {order.user_email && order.user_name && (
                          <span className="ml-2 text-xs" style={{ color: 'rgba(13,31,78,0.5)' }}>{order.user_email}</span>
                        )}
                        <span className="ml-2 text-sm px-2 py-0.5 rounded-full" style={{
                          background: order.status === 'paid' ? '#dcfce7' : order.status === 'cancelled' ? '#fee2e2' : '#fef3c7',
                          color: order.status === 'paid' ? '#166534' : order.status === 'cancelled' ? '#991b1b' : '#92400e',
                        }}>
                          {STATUS_LABELS[order.status] ?? order.status}
                        </span>
                      </div>
                      <span className="font-bold" style={{ color: DYNAMO_BLUE }}>{formatPrice(order.total_cents)}</span>
                    </div>
                    <ul className="p-4 space-y-1">
                      {order.lunch_order_items?.map((item: OrderItem) => (
                        <li key={item.id} className="flex justify-between text-sm">
                          <span style={{ color: 'rgba(13,31,78,0.8)' }}>
                            {item.lunch_products?.name ?? 'Product'} × {item.quantity}
                          </span>
                          <span style={{ color: 'rgba(13,31,78,0.6)' }}>{formatPrice(item.unit_price_cents * item.quantity)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {tab === 'instellingen' && (
          <InstellingenBeheer />
        )}

        {tab === 'products' && (
          <ProductBeheer
            products={products}
            isLoading={productsLoading}
            mutate={mutateProducts}
            editingProduct={editingProduct}
            setEditingProduct={setEditingProduct}
            newProduct={newProduct}
            setNewProduct={setNewProduct}
          />
        )}
        </>
        )}
      </main>
    </div>
  )
}

function InstellingenBeheer() {
  const [tikkieLink, setTikkieLink] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const { data: settings, mutate } = useSWR<{ tikkie_pay_link?: string }>('/api/lunch/settings', fetcher)

  useEffect(() => {
    if (settings?.tikkie_pay_link !== undefined) {
      setTikkieLink(settings.tikkie_pay_link ?? '')
    }
  }, [settings])

  async function handleSave() {
    setError('')
    setSuccess(false)
    setSaving(true)
    try {
      const res = await fetch('/api/lunch/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tikkie_pay_link: tikkieLink }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Opslaan mislukt')
      mutate({ tikkie_pay_link: tikkieLink })
      setSuccess(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Er ging iets mis')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl p-4" style={{ background: 'white', border: '1px solid rgba(13,31,78,0.1)' }}>
        <h2 className="font-bold mb-3" style={{ color: DYNAMO_BLUE }}>Tikkie betaallink</h2>
        <p className="text-sm mb-3" style={{ color: 'rgba(13,31,78,0.6)' }}>
          De link die gebruikers na het bestellen zien om te betalen. Bijv. https://tikkie.me/pay/xxx
        </p>
        {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
        {success && <p className="text-sm text-green-600 mb-2">Opgeslagen.</p>}
        <input
          type="url"
          value={tikkieLink}
          onChange={e => setTikkieLink(e.target.value)}
          placeholder="https://tikkie.me/pay/..."
          className="w-full rounded-lg px-3 py-2 text-sm border mb-3 placeholder:text-gray-500"
          style={{ borderColor: 'rgba(13,31,78,0.2)', background: 'white', color: DYNAMO_BLUE }}
        />
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 rounded-lg font-semibold text-sm disabled:opacity-50"
          style={{ background: DYNAMO_BLUE, color: 'white' }}
        >
          {saving ? 'Opslaan...' : 'Opslaan'}
        </button>
      </div>
    </div>
  )
}

function ProductBeheer({
  products,
  isLoading,
  mutate,
  editingProduct,
  setEditingProduct,
  newProduct,
  setNewProduct,
}: {
  products: LunchProduct[]
  isLoading: boolean
  mutate: () => void
  editingProduct: LunchProduct | null
  setEditingProduct: (p: LunchProduct | null) => void
  newProduct: boolean
  setNewProduct: (v: boolean) => void
}) {
  const [form, setForm] = useState({ name: '', description: '', image_url: '', price_cents: 500, category: 'italiaanse_bol', active: true })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleEdit = (p: LunchProduct) => {
    setEditingProduct(p)
    setNewProduct(false)
    setForm({
      name: p.name,
      description: p.description ?? '',
      image_url: p.image_url ?? '',
      price_cents: p.price_cents,
      category: p.category,
      active: p.active,
    })
  }

  const handleNew = () => {
    setNewProduct(true)
    setEditingProduct(null)
    setForm({ name: '', description: '', image_url: '', price_cents: 500, category: 'italiaanse_bol', active: true })
  }

  async function save() {
    setError('')
    setSaving(true)
    try {
      if (editingProduct) {
        const res = await fetch(`/api/lunch/products/${editingProduct.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...form, image_url: form.image_url || null }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error ?? 'Opslaan mislukt')
        setEditingProduct(null)
      } else if (newProduct) {
        const res = await fetch('/api/lunch/products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...form, image_url: form.image_url || null }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error ?? 'Aanmaken mislukt')
        setNewProduct(false)
      }
      mutate()
      setForm({ name: '', description: '', image_url: '', price_cents: 500, category: 'italiaanse_bol', active: true })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Er ging iets mis')
    } finally {
      setSaving(false)
    }
  }

  async function remove(id: string) {
    if (!confirm('Product verwijderen?')) return
    const res = await fetch(`/api/lunch/products/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setEditingProduct(null)
      mutate()
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="h-16 rounded-xl animate-pulse" style={{ background: 'rgba(13,31,78,0.06)' }} />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="font-bold" style={{ color: DYNAMO_BLUE }}>Productbeheer</h2>
        <button
          type="button"
          onClick={handleNew}
          className="px-4 py-2 rounded-xl font-semibold text-sm"
          style={{ background: DYNAMO_GOLD, color: DYNAMO_BLUE }}
        >
          + Nieuw product
        </button>
      </div>

      {(editingProduct || newProduct) && (
        <div className="rounded-xl p-4" style={{ background: 'white', border: '1px solid rgba(13,31,78,0.1)' }}>
          <h3 className="font-semibold mb-3" style={{ color: DYNAMO_BLUE }}>{newProduct ? 'Nieuw product' : 'Bewerken'}</h3>
          {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              type="text"
              placeholder="Naam"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="rounded-lg px-3 py-2 text-sm border placeholder:text-gray-500"
              style={{ borderColor: 'rgba(13,31,78,0.2)', background: 'white', color: DYNAMO_BLUE }}
            />
            <input
              type="number"
              placeholder="Prijs (centen)"
              value={form.price_cents}
              onChange={e => setForm(f => ({ ...f, price_cents: parseInt(e.target.value, 10) || 0 }))}
              className="rounded-lg px-3 py-2 text-sm border placeholder:text-gray-500"
              style={{ borderColor: 'rgba(13,31,78,0.2)', background: 'white', color: DYNAMO_BLUE }}
            />
            <input
              type="text"
              placeholder="Ingrediënten / beleg"
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              className="rounded-lg px-3 py-2 text-sm border sm:col-span-2 placeholder:text-gray-500"
              style={{ borderColor: 'rgba(13,31,78,0.2)', background: 'white', color: DYNAMO_BLUE }}
            />
            <input
              type="url"
              placeholder="Afbeelding URL"
              value={form.image_url}
              onChange={e => setForm(f => ({ ...f, image_url: e.target.value }))}
              className="rounded-lg px-3 py-2 text-sm border sm:col-span-2 placeholder:text-gray-500"
              style={{ borderColor: 'rgba(13,31,78,0.2)', background: 'white', color: DYNAMO_BLUE }}
            />
            <select
              value={form.category}
              onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
              className="rounded-lg px-3 py-2 text-sm border"
              style={{ borderColor: 'rgba(13,31,78,0.2)', background: 'white', color: DYNAMO_BLUE }}
            >
              {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.active}
                onChange={e => setForm(f => ({ ...f, active: e.target.checked }))}
              />
              <span className="text-sm">Actief</span>
            </label>
          </div>
          <div className="flex gap-2 mt-3">
            <button
              type="button"
              onClick={save}
              disabled={!form.name.trim() || saving}
              className="px-4 py-2 rounded-lg font-semibold text-sm disabled:opacity-50"
              style={{ background: DYNAMO_BLUE, color: 'white' }}
            >
              {saving ? 'Opslaan...' : 'Opslaan'}
            </button>
            <button
              type="button"
              onClick={() => { setEditingProduct(null); setNewProduct(false) }}
              className="px-4 py-2 rounded-lg font-semibold text-sm border"
              style={{ borderColor: 'rgba(13,31,78,0.2)' }}
            >
              Annuleren
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {products.map(p => (
          <div
            key={p.id}
            className="flex items-center gap-3 rounded-xl p-3"
            style={{ background: 'white', border: '1px solid rgba(13,31,78,0.08)' }}
          >
            <div className="w-12 h-12 shrink-0 rounded-lg overflow-hidden bg-gray-100 flex items-center justify-center">
              {p.image_url ? (
                <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" />
              ) : (
                <span className="text-lg">🥪</span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-semibold" style={{ color: DYNAMO_BLUE }}>{p.name}</div>
              <div className="text-xs" style={{ color: 'rgba(13,31,78,0.5)' }}>
                {CATEGORY_LABELS[p.category] ?? p.category} · {formatPrice(p.price_cents)}
                {!p.active && ' · Inactief'}
              </div>
              {p.description && (
                <div className="text-xs mt-0.5 truncate" style={{ color: 'rgba(13,31,78,0.4)' }}>{p.description}</div>
              )}
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                type="button"
                onClick={() => handleEdit(p)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                style={{ background: 'rgba(13,31,78,0.08)', color: DYNAMO_BLUE }}
              >
                Bewerken
              </button>
              <button
                type="button"
                onClick={() => remove(p.id)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-red-600 hover:bg-red-50"
              >
                Verwijderen
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
