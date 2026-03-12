'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { DYNAMO_BLUE, DYNAMO_GOLD, FONT_FAMILY } from '@/lib/theme'

const fetcher = (url: string) => fetch(url).then(r => r.json())

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

type CartItem = { product: LunchProduct; quantity: number }

const CATEGORY_LABELS: Record<string, string> = {
  italiaanse_bol: 'Italiaanse bol',
  bruine_driehoek: 'Bruine driehoek',
  ciabatta: 'Ciabatta',
}

function formatPrice(cents: number) {
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(cents / 100)
}

export default function LunchPage() {
  const [cart, setCart] = useState<CartItem[]>([])
  const [orderDate, setOrderDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const checkoutRef = useRef<HTMLDivElement>(null)
  const [checkoutResult, setCheckoutResult] = useState<{
    tikkie_url?: string
    order_id?: string
    amount_cents?: number
    user_name?: string | null
    items?: { product_name: string | null; quantity: number; unit_price_cents: number }[]
  } | null>(null)
  const [error, setError] = useState('')

  const { data: products = [], isLoading } = useSWR<LunchProduct[]>('/api/lunch/products', fetcher)
  const { data: sessionData } = useSWR<{ isAdmin?: boolean }>('/api/auth/session-info', fetcher)
  const isAdmin = sessionData?.isAdmin === true

  const addToCart = useCallback((product: LunchProduct, qty = 1) => {
    setCart(prev => {
      const existing = prev.find(i => i.product.id === product.id)
      if (existing) {
        const next = prev.map(i =>
          i.product.id === product.id ? { ...i, quantity: Math.min(99, i.quantity + qty) } : i
        )
        return next
      }
      return [...prev, { product, quantity: Math.min(99, qty) }]
    })
  }, [])

  const updateQuantity = useCallback((productId: string, delta: number) => {
    setCart(prev =>
      prev
        .map(i =>
          i.product.id === productId ? { ...i, quantity: Math.max(0, i.quantity + delta) } : i
        )
        .filter(i => i.quantity > 0)
    )
  }, [])

  const removeFromCart = useCallback((productId: string) => {
    setCart(prev => prev.filter(i => i.product.id !== productId))
  }, [])

  const totalCents = cart.reduce((s, i) => s + i.product.price_cents * i.quantity, 0)

  async function doCheckout() {
    if (cart.length === 0 || totalCents <= 0) return
    setError('')
    setCheckoutResult(null)
    setCheckoutLoading(true)
    try {
      const res = await fetch('/api/lunch/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_date: orderDate,
          items: cart.map(i => ({ product_id: i.product.id, quantity: i.quantity })),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Bestelling mislukt')

      const checkoutRes = await fetch(`/api/lunch/orders/${data.id}/checkout`, { method: 'POST' })
      const checkoutData = await checkoutRes.json().catch(() => ({}))
      if (!checkoutRes.ok) throw new Error(checkoutData.error ?? 'Checkout mislukt')

      setCheckoutResult({
        tikkie_url: checkoutData.tikkie_url,
        order_id: data.id,
        amount_cents: checkoutData.amount_cents ?? data.total_cents ?? totalCents,
        user_name: data.user_name ?? null,
        items: data.items ?? cart.map(i => ({ product_name: i.product.name, quantity: i.quantity, unit_price_cents: i.product.price_cents })),
      })
      setCart([])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Er ging iets mis')
    } finally {
      setCheckoutLoading(false)
    }
  }

  useEffect(() => {
    if (checkoutResult) checkoutRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [checkoutResult])

  const byCategory = products.reduce<Record<string, LunchProduct[]>>((acc, p) => {
    const c = p.category || 'italiaanse_bol'
    if (!acc[c]) acc[c] = []
    acc[c].push(p)
    return acc
  }, {})

  return (
    <div className="min-h-screen" style={{ background: '#f4f6fb', fontFamily: FONT_FAMILY }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap');
        input, select { color: #0d1f4e !important; }
        input::placeholder { color: #6b7280 !important; }
      `}</style>

      <header style={{ background: DYNAMO_BLUE }} className="sticky top-0 z-50">
        <div className="px-4 py-3 flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-2 text-white hover:opacity-90">
            <span>←</span>
            <span className="font-bold">Lunch bestellen</span>
          </Link>
          <div className="flex items-center gap-2">
            <Link
              href="/dashboard/lunch/overzicht"
              className="text-sm font-medium px-3 py-1.5 rounded-lg"
              style={{ background: 'rgba(255,255,255,0.1)', color: 'white' }}
            >
              Mijn bestellingen
            </Link>
            {isAdmin && (
              <Link
                href="/dashboard/lunch/beheer"
                className="text-sm font-medium px-3 py-1.5 rounded-lg"
                style={{ background: 'rgba(240,192,64,0.2)', color: DYNAMO_GOLD }}
              >
                Beheer
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm font-semibold" style={{ color: DYNAMO_BLUE }}>
            Besteldatum:
          </label>
          <input
            type="date"
            value={orderDate}
            onChange={e => setOrderDate(e.target.value)}
            className="rounded-xl px-3 py-2 text-sm border placeholder:text-gray-500"
            style={{ borderColor: 'rgba(13,31,78,0.2)', background: 'white', color: DYNAMO_BLUE }}
          />
        </div>

        {error && (
          <div className="rounded-xl p-3 text-sm font-medium" style={{ background: '#fef2f2', color: '#b91c1c' }}>
            {error}
          </div>
        )}

        {checkoutResult && (
          <div ref={checkoutRef} className="rounded-2xl overflow-hidden" style={{ background: 'white', border: '1px solid rgba(13,31,78,0.1)', boxShadow: '0 4px 24px rgba(13,31,78,0.12)' }}>
            <div className="p-6 sm:p-8 text-center">
              <div className="text-5xl mb-3">🎉</div>
              <h2 className="text-2xl font-bold mb-1" style={{ color: DYNAMO_BLUE }}>Bedankt topper!</h2>
              <p className="text-sm" style={{ color: 'rgba(13,31,78,0.6)' }}>
                Je bestelling is geplaatst{checkoutResult.user_name ? `, ${checkoutResult.user_name}` : ''}. Betaal hieronder via Tikkie.
              </p>
            </div>

            <div className="px-6 sm:px-8 pb-6">
              <div className="rounded-xl p-4 mb-4" style={{ background: '#fff7ed', border: '2px solid #fb923c' }}>
                <div className="text-sm font-semibold mb-1" style={{ color: '#9a3412' }}>Te betalen bedrag</div>
                <div className="text-3xl font-bold mb-2" style={{ color: '#ea580c' }}>
                  {checkoutResult.amount_cents != null && checkoutResult.amount_cents > 0
                    ? formatPrice(checkoutResult.amount_cents)
                    : '—'}
                </div>
                <p className="text-xs font-semibold" style={{ color: '#b91c1c' }}>
                  LET OP: vul dit bedrag zelf in bij Tikkie!
                </p>
              </div>

              {checkoutResult.tikkie_url ? (
                <a
                  href={checkoutResult.tikkie_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full py-4 rounded-xl font-bold text-center text-lg transition hover:opacity-90"
                  style={{ background: '#ea580c', color: 'white' }}
                >
                  Betaal via Tikkie
                </a>
              ) : (
                <div className="rounded-xl p-4 text-sm" style={{ background: '#fef3c7', border: '1px solid #f59e0b' }}>
                  <p style={{ color: '#92400e' }}>Geen betaallink geconfigureerd. De beheerder kan een Tikkie-link instellen in Lunch beheer → Instellingen.</p>
                </div>
              )}

              {checkoutResult.items && checkoutResult.items.length > 0 && (
                <div className="mt-6 pt-6" style={{ borderTop: '1px solid rgba(13,31,78,0.08)' }}>
                  <h3 className="font-bold mb-3" style={{ color: DYNAMO_BLUE }}>Je bestelling</h3>
                  <ul className="space-y-2">
                    {checkoutResult.items.map((item, i) => (
                      <li key={i} className="flex justify-between text-sm">
                        <span style={{ color: 'rgba(13,31,78,0.8)' }}>
                          {item.quantity}x {item.product_name ?? 'Product'}
                        </span>
                        <span style={{ color: DYNAMO_BLUE }}>{formatPrice(item.unit_price_cents * item.quantity)}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="flex justify-between font-bold mt-2 pt-2" style={{ borderTop: '1px solid rgba(13,31,78,0.06)' }}>
                    <span style={{ color: DYNAMO_BLUE }}>Totaal</span>
                    <span style={{ color: DYNAMO_BLUE }}>{formatPrice(checkoutResult.amount_cents ?? 0)}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="rounded-xl p-3" style={{ background: 'rgba(13,31,78,0.04)', border: '1px solid rgba(13,31,78,0.08)' }}>
          <a
            href="https://www.paniniitaliani.nl/webshop/panini-italiani-belegde-broodjes-amersfoort/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium hover:underline"
            style={{ color: DYNAMO_BLUE }}
          >
            🥪 Bekijk het volledige assortiment op Panini Italiani →
          </a>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Productcatalogus */}
          <div className="lg:col-span-2">
            <h2 className="text-lg font-bold mb-4" style={{ color: DYNAMO_BLUE }}>
              Broodjes
            </h2>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map(i => (
                  <div key={i} className="h-20 rounded-xl animate-pulse" style={{ background: 'rgba(13,31,78,0.06)' }} />
                ))}
              </div>
            ) : products.length === 0 ? (
              <div className="rounded-xl p-8 text-center" style={{ background: 'white', border: '1px solid rgba(13,31,78,0.1)' }}>
                <p className="text-gray-500">Geen producten beschikbaar.</p>
              </div>
            ) : (
              <div className="space-y-6">
                {Object.entries(byCategory).map(([cat, items]) => (
                  <div key={cat}>
                    <h3 className="text-sm font-semibold uppercase tracking-wider mb-2" style={{ color: 'rgba(13,31,78,0.5)' }}>
                      {CATEGORY_LABELS[cat] ?? cat}
                    </h3>
                    <div className="space-y-2">
                      {items.map(p => (
                        <div
                          key={p.id}
                          className="flex items-start gap-3 rounded-xl p-3 sm:p-4"
                          style={{ background: 'white', border: '1px solid rgba(13,31,78,0.08)', boxShadow: '0 1px 3px rgba(13,31,78,0.04)' }}
                        >
                          <div className="w-20 h-20 shrink-0 rounded-lg overflow-hidden bg-gray-100 flex items-center justify-center">
                            {p.image_url ? (
                              <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" />
                            ) : (
                              <span className="text-2xl">🥪</span>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="font-semibold" style={{ color: DYNAMO_BLUE }}>{p.name}</div>
                            {p.description && (
                              <div className="text-sm mt-0.5" style={{ color: 'rgba(13,31,78,0.6)' }}>
                                {p.description}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="font-bold text-sm" style={{ color: DYNAMO_BLUE }}>{formatPrice(p.price_cents)}</span>
                            <button
                              type="button"
                              onClick={() => addToCart(p)}
                              className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm transition hover:opacity-80"
                              style={{ background: DYNAMO_BLUE, color: 'white' }}
                            >
                              +
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Winkelwagen */}
          <div>
            <div className="sticky top-20 rounded-2xl overflow-hidden" style={{ background: 'white', border: '1px solid rgba(13,31,78,0.1)', boxShadow: '0 4px 12px rgba(13,31,78,0.08)' }}>
              <div className="p-4 border-b" style={{ borderColor: 'rgba(13,31,78,0.08)' }}>
                <h2 className="font-bold" style={{ color: DYNAMO_BLUE }}>Winkelwagen</h2>
                <p className="text-xs mt-0.5" style={{ color: 'rgba(13,31,78,0.5)' }}>{orderDate}</p>
              </div>
              <div className="p-4 max-h-64 overflow-y-auto">
                {cart.length === 0 ? (
                  <p className="text-sm" style={{ color: 'rgba(13,31,78,0.4)' }}>Winkelwagen is leeg</p>
                ) : (
                  <ul className="space-y-2">
                    {cart.map(({ product, quantity }) => (
                      <li key={product.id} className="flex items-center justify-between gap-2 text-sm">
                        <div className="min-w-0 flex-1">
                          <span className="font-medium" style={{ color: DYNAMO_BLUE }}>{product.name}</span>
                          <span className="ml-1" style={{ color: 'rgba(13,31,78,0.5)' }}>× {quantity}</span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => updateQuantity(product.id, -1)}
                            className="w-6 h-6 rounded flex items-center justify-center text-xs font-bold hover:bg-gray-100"
                            style={{ color: DYNAMO_BLUE }}
                          >
                            −
                          </button>
                          <span className="w-6 text-center font-medium">{quantity}</span>
                          <button
                            type="button"
                            onClick={() => updateQuantity(product.id, 1)}
                            className="w-6 h-6 rounded flex items-center justify-center text-xs font-bold hover:bg-gray-100"
                            style={{ color: DYNAMO_BLUE }}
                          >
                            +
                          </button>
                          <button
                            type="button"
                            onClick={() => removeFromCart(product.id)}
                            className="ml-1 text-red-500 hover:text-red-700 text-xs"
                          >
                            ✕
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="p-4 border-t" style={{ borderColor: 'rgba(13,31,78,0.08)' }}>
                <div className="flex justify-between items-center mb-3">
                  <span className="font-semibold" style={{ color: DYNAMO_BLUE }}>Totaal</span>
                  <span className="font-bold text-lg" style={{ color: DYNAMO_BLUE }}>{formatPrice(totalCents)}</span>
                </div>
                <button
                  type="button"
                  onClick={doCheckout}
                  disabled={cart.length === 0 || checkoutLoading}
                  className="w-full py-3 rounded-xl font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed transition"
                  style={{ background: DYNAMO_GOLD, color: DYNAMO_BLUE }}
                >
                  {checkoutLoading ? 'Bezig...' : 'Bestellen & betalen via Tikkie'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
