'use client'

import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'
import { DYNAMO_BLUE, FONT_FAMILY } from '@/lib/theme'
import { checkOrderDateAllowed, normalizeOrderWeekdays } from '@/lib/lunch-schedule'

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
  const router = useRouter()
  const supabase = createClient()
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
  const [heeftTikkieGeklikt, setHeeftTikkieGeklikt] = useState(false)
  const [error, setError] = useState('')
  const [cartToast, setCartToast] = useState<string | null>(null)
  const cartPanelRef = useRef<HTMLDivElement>(null)
  const toastClearRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { data: products = [], isLoading } = useSWR<LunchProduct[]>('/api/lunch/products', fetcher)
  const { data: sessionData } = useSWR<{ isAdmin?: boolean; lunchOnly?: boolean }>('/api/auth/session-info', fetcher)
  const { data: lunchSettings } = useSWR<{
    order_weekdays?: number[]
    closed_dates?: string[]
  }>('/api/lunch/settings', fetcher)

  const orderWeekdays = useMemo(
    () => normalizeOrderWeekdays(lunchSettings?.order_weekdays) ?? [1, 2, 3, 4, 5],
    [lunchSettings?.order_weekdays]
  )
  const closedDates = useMemo(
    () => (Array.isArray(lunchSettings?.closed_dates) ? lunchSettings.closed_dates : []),
    [lunchSettings?.closed_dates]
  )
  const dateCheck = useMemo(
    () => checkOrderDateAllowed(orderDate, orderWeekdays, closedDates),
    [orderDate, orderWeekdays, closedDates]
  )
  const isAdmin = sessionData?.isAdmin === true
  const lunchOnly = sessionData?.lunchOnly === true

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

  const addToCartWithFeedback = useCallback((product: LunchProduct, qty = 1) => {
    addToCart(product, qty)
    if (toastClearRef.current) clearTimeout(toastClearRef.current)
    setCartToast(`“${product.name}” toegevoegd aan je winkelwagen`)
    toastClearRef.current = setTimeout(() => setCartToast(null), 4000)
  }, [addToCart])

  useEffect(() => {
    return () => {
      if (toastClearRef.current) clearTimeout(toastClearRef.current)
    }
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
  const cartItemCount = useMemo(() => cart.reduce((s, i) => s + i.quantity, 0), [cart])

  function scrollToCart() {
    cartPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  async function doCheckout() {
    if (cart.length === 0 || totalCents <= 0) return
    setError('')
    setCheckoutResult(null)
    setHeeftTikkieGeklikt(false)
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
        input, select { color: #2D457C !important; }
        input::placeholder { color: #6b7280 !important; }
      `}</style>

      <header style={{ background: DYNAMO_BLUE }} className="sticky top-0 z-50">
        <div className="px-4 py-3 flex items-center justify-between">
          <Link href={lunchOnly ? '/dashboard/lunch' : '/dashboard'} className="flex items-center gap-2 text-white hover:opacity-90">
            <span>←</span>
            <span className="font-bold">{lunchOnly ? 'Lunch bestellen' : 'DRG Portal'}</span>
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
                style={{ background: 'rgba(255,255,255,0.15)', color: 'white', border: '1px solid rgba(255,255,255,0.3)' }}
              >
                Beheer
              </Link>
            )}
            <button
              onClick={async () => { await supabase.auth.signOut(); router.push('/login') }}
              className="text-sm font-medium px-3 py-1.5 rounded-lg"
              style={{ background: 'rgba(255,255,255,0.15)', color: 'white', border: '1px solid rgba(255,255,255,0.3)' }}
            >
              Uitloggen
            </button>
          </div>
        </div>
      </header>

      {cartToast && (
        <div
          className="fixed left-3 right-3 z-[60] max-w-lg mx-auto pointer-events-none top-[calc(4.25rem+env(safe-area-inset-top,0px))]"
          role="status"
          aria-live="polite"
        >
          <div
            className="pointer-events-auto rounded-2xl px-4 py-3.5 shadow-lg border text-center"
            style={{
              background: DYNAMO_BLUE,
              color: 'white',
              borderColor: 'rgba(255,255,255,0.2)',
              boxShadow: '0 10px 40px rgba(45,69,124,0.35)',
            }}
          >
            <p className="text-sm sm:text-base font-semibold leading-snug">🥪 {cartToast}</p>
          </div>
        </div>
      )}

      <main
        className={`max-w-4xl mx-auto p-4 sm:p-6 space-y-6 ${cart.length > 0 ? 'pb-24 lg:pb-6' : ''}`}
      >
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm font-semibold" style={{ color: DYNAMO_BLUE }}>
            Besteldatum:
          </label>
          <input
            type="date"
            value={orderDate}
            onChange={e => setOrderDate(e.target.value)}
            className="rounded-xl px-3 py-2 text-sm border placeholder:text-gray-500"
            style={{
              borderColor: dateCheck.ok ? 'rgba(45,69,124,0.2)' : '#f97373',
              background: 'white',
              color: DYNAMO_BLUE,
            }}
          />
        </div>
        {!dateCheck.ok && (
          <div
            className="rounded-2xl p-4 sm:p-5 border-2 shadow-sm"
            style={{
              background: dateCheck.variant === 'closed' ? '#fff1f2' : '#fff7ed',
              borderColor: dateCheck.variant === 'closed' ? '#fecdd3' : '#fdba74',
              color: '#7c2d12',
            }}
            role="alert"
          >
            <p className="text-base sm:text-lg font-bold mb-2" style={{ color: '#9a3412' }}>
              {dateCheck.title}
            </p>
            <p className="text-sm sm:text-base leading-relaxed" style={{ color: '#7c2d12' }}>
              {dateCheck.description}
            </p>
          </div>
        )}

        {error && (
          <div className="rounded-xl p-3 text-sm font-medium" style={{ background: '#fef2f2', color: '#b91c1c' }}>
            {error}
          </div>
        )}

        {checkoutResult && (
          <div ref={checkoutRef} className="rounded-2xl overflow-hidden" style={{ background: 'white', border: '1px solid rgba(45,69,124,0.1)', boxShadow: '0 4px 24px rgba(45,69,124,0.08)' }}>
            <div className="p-6 sm:p-8 text-center" style={{ borderBottom: '1px solid rgba(45,69,124,0.08)' }}>
              <div className="text-5xl mb-3">🎉</div>
              <h2 className="text-2xl font-bold mb-1" style={{ color: DYNAMO_BLUE }}>Bedankt{checkoutResult.user_name ? ` ${checkoutResult.user_name}` : ''}!</h2>
              <p className="text-sm" style={{ color: 'rgba(45,69,124,0.6)' }}>
                Je bestelling is geplaatst{checkoutResult.user_name ? `, ${checkoutResult.user_name}` : ''}. Betaal hieronder via Tikkie.
              </p>
            </div>

            <div className="px-6 sm:px-8 py-6">
              {heeftTikkieGeklikt ? (
                <div className="rounded-xl p-6 text-center" style={{ background: 'rgba(34,197,94,0.08)', border: '2px solid rgba(34,197,94,0.3)' }}>
                  <div className="text-4xl mb-3">🥪</div>
                  <h3 className="font-bold text-lg mb-2" style={{ color: DYNAMO_BLUE }}>Top, betaling ontvangen!</h3>
                  <p className="text-sm" style={{ color: 'rgba(45,69,124,0.7)' }}>
                    Je broodje staat op de lijst. Eet smakelijk alvast! 🥪
                  </p>
                </div>
              ) : (
                <>
                  <div className="rounded-xl p-4 mb-4" style={{ background: 'rgba(45,69,124,0.08)', border: '2px solid rgba(45,69,124,0.25)' }}>
                    <div className="text-sm font-semibold mb-1" style={{ color: DYNAMO_BLUE }}>Te betalen bedrag</div>
                    <div className="text-3xl font-bold mb-2" style={{ color: DYNAMO_BLUE }}>
                      {checkoutResult.amount_cents != null && checkoutResult.amount_cents > 0
                        ? formatPrice(checkoutResult.amount_cents)
                        : '—'}
                    </div>
                    <p className="text-xs font-semibold" style={{ color: 'rgba(45,69,124,0.7)' }}>
                      LET OP: vul dit bedrag zelf in bij Tikkie!
                    </p>
                  </div>

                  {checkoutResult.tikkie_url ? (
                    <a
                      href={checkoutResult.tikkie_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => setHeeftTikkieGeklikt(true)}
                      className="block w-full py-4 rounded-xl font-bold text-center text-lg transition hover:opacity-90"
                      style={{ background: DYNAMO_BLUE, color: 'white' }}
                    >
                      Betaal via Tikkie
                    </a>
                  ) : (
                    <div className="rounded-xl p-4 text-sm" style={{ background: 'rgba(45,69,124,0.04)', border: '1px solid rgba(45,69,124,0.12)' }}>
                      <p style={{ color: 'rgba(45,69,124,0.7)' }}>Geen betaallink geconfigureerd. De beheerder kan een Tikkie-link instellen in Lunch beheer → Instellingen.</p>
                    </div>
                  )}
                </>
              )}

              {checkoutResult.items && checkoutResult.items.length > 0 && (
                <div className="mt-6 pt-6" style={{ borderTop: '1px solid rgba(45,69,124,0.08)' }}>
                  <h3 className="font-bold mb-3" style={{ color: DYNAMO_BLUE }}>Je bestelling</h3>
                  <ul className="space-y-2">
                    {checkoutResult.items.map((item, i) => (
                      <li key={i} className="flex justify-between text-sm">
                        <span style={{ color: 'rgba(45,69,124,0.8)' }}>
                          {item.quantity}x {item.product_name ?? 'Product'}
                        </span>
                        <span style={{ color: DYNAMO_BLUE }}>{formatPrice(item.unit_price_cents * item.quantity)}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="flex justify-between font-bold mt-2 pt-2" style={{ borderTop: '1px solid rgba(45,69,124,0.06)' }}>
                    <span style={{ color: DYNAMO_BLUE }}>Totaal</span>
                    <span style={{ color: DYNAMO_BLUE }}>{formatPrice(checkoutResult.amount_cents ?? 0)}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="rounded-xl p-3" style={{ background: 'rgba(45,69,124,0.04)', border: '1px solid rgba(45,69,124,0.08)' }}>
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
          {/* Productcatalogus — op mobiel onder de winkelwagen (order-2) */}
          <div className="order-2 lg:order-1 lg:col-span-2">
            <h2 className="text-lg font-bold mb-4" style={{ color: DYNAMO_BLUE }}>
              Broodjes
            </h2>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map(i => (
                  <div key={i} className="h-20 rounded-xl animate-pulse" style={{ background: 'rgba(45,69,124,0.06)' }} />
                ))}
              </div>
            ) : products.length === 0 ? (
              <div className="rounded-xl p-8 text-center" style={{ background: 'white', border: '1px solid rgba(45,69,124,0.1)' }}>
                <p className="text-gray-500">Geen producten beschikbaar.</p>
              </div>
            ) : (
              <div className="space-y-6">
                {Object.entries(byCategory).map(([cat, items]) => (
                  <div key={cat}>
                    <h3 className="text-sm font-semibold uppercase tracking-wider mb-2" style={{ color: 'rgba(45,69,124,0.5)' }}>
                      {CATEGORY_LABELS[cat] ?? cat}
                    </h3>
                    <div className="space-y-2">
                      {items.map(p => (
                        <div
                          key={p.id}
                          className="flex items-start gap-3 rounded-xl p-3 sm:p-4"
                          style={{ background: 'white', border: '1px solid rgba(45,69,124,0.08)', boxShadow: '0 1px 3px rgba(45,69,124,0.04)' }}
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
                              <div className="text-sm mt-0.5" style={{ color: 'rgba(45,69,124,0.6)' }}>
                                {p.description}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="font-bold text-sm" style={{ color: DYNAMO_BLUE }}>{formatPrice(p.price_cents)}</span>
                            <button
                              type="button"
                              onClick={() => addToCartWithFeedback(p)}
                              className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm transition hover:opacity-80"
                              style={{ background: DYNAMO_BLUE, color: 'white' }}
                              aria-label={`${p.name} toevoegen aan winkelwagen`}
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

          {/* Winkelwagen — op mobiel boven de lijst broodjes (order-1) */}
          <div className="order-1 lg:order-2" ref={cartPanelRef} id="winkelwagen">
            <div className="lg:sticky lg:top-20 rounded-2xl overflow-hidden" style={{ background: 'white', border: '1px solid rgba(45,69,124,0.1)', boxShadow: '0 4px 12px rgba(45,69,124,0.08)' }}>
              <div className="p-4 border-b" style={{ borderColor: 'rgba(45,69,124,0.08)' }}>
                <h2 className="font-bold" style={{ color: DYNAMO_BLUE }}>Winkelwagen</h2>
                <p className="text-xs mt-0.5" style={{ color: 'rgba(45,69,124,0.5)' }}>{orderDate}</p>
              </div>
              <div className="p-4 max-h-64 overflow-y-auto">
                {cart.length === 0 ? (
                  <p className="text-sm" style={{ color: 'rgba(45,69,124,0.4)' }}>Winkelwagen is leeg</p>
                ) : (
                  <ul className="space-y-2">
                    {cart.map(({ product, quantity }) => (
                      <li key={product.id} className="flex items-center justify-between gap-2 text-sm">
                        <div className="min-w-0 flex-1">
                          <span className="font-medium" style={{ color: DYNAMO_BLUE }}>{product.name}</span>
                          <span className="ml-1" style={{ color: 'rgba(45,69,124,0.5)' }}>× {quantity}</span>
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
              <div className="p-4 border-t" style={{ borderColor: 'rgba(45,69,124,0.08)' }}>
                <div className="flex justify-between items-center mb-3">
                  <span className="font-semibold" style={{ color: DYNAMO_BLUE }}>Totaal</span>
                  <span className="font-bold text-lg" style={{ color: DYNAMO_BLUE }}>{formatPrice(totalCents)}</span>
                </div>
                <button
                  type="button"
                  onClick={doCheckout}
                  disabled={cart.length === 0 || checkoutLoading || !dateCheck.ok}
                  className="w-full py-3 rounded-xl font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed transition"
                  style={{ background: DYNAMO_BLUE, color: 'white' }}
                >
                  {checkoutLoading
                    ? 'Bezig...'
                    : !dateCheck.ok
                      ? dateCheck.variant === 'closed'
                        ? 'Kies een open dag om te bestellen'
                        : dateCheck.variant === 'invalid'
                          ? 'Kies een geldige datum'
                          : 'Kies een toegestane dag om te bestellen'
                      : 'Bestellen & betalen via Tikkie'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>

      {cart.length > 0 && (
        <div
          className="lg:hidden fixed bottom-0 left-0 right-0 z-40 border-t px-3 pt-2"
          style={{
            background: 'white',
            borderColor: 'rgba(45,69,124,0.12)',
            boxShadow: '0 -6px 28px rgba(45,69,124,0.12)',
            paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0px))',
          }}
        >
          <div className="max-w-4xl mx-auto flex items-center gap-3 pb-1">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'rgba(45,69,124,0.45)' }}>
                Winkelwagen
              </p>
              <p className="text-sm font-bold truncate" style={{ color: DYNAMO_BLUE }}>
                {cartItemCount} {cartItemCount === 1 ? 'broodje' : 'broodjes'} · {formatPrice(totalCents)}
              </p>
            </div>
            <button
              type="button"
              onClick={scrollToCart}
              className="shrink-0 px-4 py-2.5 rounded-xl text-sm font-bold text-white active:opacity-90"
              style={{ background: DYNAMO_BLUE }}
            >
              Naar winkelwagen
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
