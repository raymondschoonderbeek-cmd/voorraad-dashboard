'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'
import { DYNAMO_BLUE, DYNAMO_GOLD, FONT_FAMILY } from '@/lib/theme'
import { WEEKDAYS_NL } from '@/lib/lunch-schedule'

const fetcher = (url: string) => fetch(url).then(r => r.json())

const REMINDER_TEST_DELAY_SEC = 30

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
  const supabase = createClient()
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
            <span className="font-bold">{lunchOnly ? 'Lunch beheer' : 'DRG Portal'}</span>
          </Link>
          <button
            onClick={async () => { await supabase.auth.signOut(); router.push('/login') }}
            className="text-sm font-medium px-3 py-1.5 rounded-lg"
            style={{ background: 'rgba(255,255,255,0.15)', color: 'white', border: '1px solid rgba(255,255,255,0.3)' }}
          >
            Uitloggen
          </button>
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
        <div className="flex gap-2 border-b" style={{ borderColor: 'rgba(45,69,124,0.1)' }}>
          <button
            type="button"
            onClick={() => setTab('orders')}
            className="px-4 py-2 font-semibold text-sm rounded-t-lg transition"
            style={{
              background: tab === 'orders' ? 'white' : 'transparent',
              color: tab === 'orders' ? DYNAMO_BLUE : 'rgba(45,69,124,0.5)',
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
              color: tab === 'products' ? DYNAMO_BLUE : 'rgba(45,69,124,0.5)',
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
              color: tab === 'instellingen' ? DYNAMO_BLUE : 'rgba(45,69,124,0.5)',
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
                style={{ borderColor: 'rgba(45,69,124,0.2)', background: 'white', color: DYNAMO_BLUE }}
              />
              <div className="flex gap-4 ml-4">
                <span className="text-sm" style={{ color: 'rgba(45,69,124,0.6)' }}>
                  {orders.length} bestellingen · {formatPrice(ordersTotal)} totaal · {formatPrice(ordersPaid)} betaald
                </span>
              </div>
            </div>

            {aantallenPerBroodje.length > 0 && (
              <div
                className="rounded-xl overflow-hidden"
                style={{ background: 'white', border: '2px solid ' + DYNAMO_BLUE, boxShadow: '0 2px 12px rgba(45,69,124,0.15)' }}
              >
                <div className="p-4 flex items-center justify-between flex-wrap gap-2" style={{ background: 'rgba(45,69,124,0.06)', borderBottom: '1px solid rgba(45,69,124,0.15)' }}>
                  <h3 className="font-bold" style={{ color: DYNAMO_BLUE }}>🥪 Aantallen voor leverancier</h3>
                  <button
                    type="button"
                    onClick={kopieerVoorLeverancier}
                    className="px-4 py-2 rounded-lg font-semibold text-sm transition hover:opacity-90 disabled:opacity-70"
                    style={{ background: gekopieerd ? '#16a34a' : DYNAMO_BLUE, color: 'white' }}
                  >
                    {gekopieerd ? '✓ Gekopieerd!' : 'Kopieer voor leverancier'}
                  </button>
                </div>
                <div className="p-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {aantallenPerBroodje.map(([naam, qty]) => (
                      <div key={naam} className="flex justify-between items-center rounded-lg px-3 py-2" style={{ background: 'rgba(45,69,124,0.03)' }}>
                        <span className="font-medium" style={{ color: DYNAMO_BLUE }}>{naam}</span>
                        <span className="font-bold text-lg" style={{ color: DYNAMO_BLUE }}>{qty}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 pt-3 flex justify-between items-center" style={{ borderTop: '1px solid rgba(45,69,124,0.08)' }}>
                    <span className="text-sm font-semibold" style={{ color: 'rgba(45,69,124,0.6)' }}>Totaal broodjes</span>
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
                  <div key={i} className="h-24 rounded-xl animate-pulse" style={{ background: 'rgba(45,69,124,0.06)' }} />
                ))}
              </div>
            ) : orders.length === 0 ? (
              <div className="rounded-xl p-8 text-center" style={{ background: 'white', border: '1px solid rgba(45,69,124,0.1)' }}>
                <p className="text-gray-500">Geen bestellingen voor {formatDate(date)}.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {orders.map(order => (
                  <div
                    key={order.id}
                    className="rounded-xl overflow-hidden"
                    style={{ background: 'white', border: '1px solid rgba(45,69,124,0.1)', boxShadow: '0 2px 8px rgba(45,69,124,0.06)' }}
                  >
                    <div className="p-4 flex items-center justify-between flex-wrap gap-2" style={{ borderBottom: '1px solid rgba(45,69,124,0.08)' }}>
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
                          <span className="ml-2 text-xs" style={{ color: 'rgba(45,69,124,0.5)' }}>{order.user_email}</span>
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
                          <span style={{ color: 'rgba(45,69,124,0.8)' }}>
                            {item.lunch_products?.name ?? 'Product'} × {item.quantity}
                          </span>
                          <span style={{ color: 'rgba(45,69,124,0.6)' }}>{formatPrice(item.unit_price_cents * item.quantity)}</span>
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
  const [orderWeekdays, setOrderWeekdays] = useState<number[]>([1, 2, 3, 4, 5])
  const [closedDates, setClosedDates] = useState<string[]>([])
  const [newClosedDate, setNewClosedDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [savingSchedule, setSavingSchedule] = useState(false)
  const [savingNewClosed, setSavingNewClosed] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [tikkieError, setTikkieError] = useState('')
  const [tikkieSaved, setTikkieSaved] = useState(false)

  const [reminderMailEnabled, setReminderMailEnabled] = useState(false)
  const [reminderWeekday, setReminderWeekday] = useState(5)
  const [reminderTimeLocal, setReminderTimeLocal] = useState('08:00')
  const [savingReminder, setSavingReminder] = useState(false)
  const [testLoading, setTestLoading] = useState(false)
  const [testMsg, setTestMsg] = useState('')
  const [testError, setTestError] = useState('')
  const [testDelayRemaining, setTestDelayRemaining] = useState<number | null>(null)
  const testDelayIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [reminderMailSubject, setReminderMailSubject] = useState('')
  const [reminderMailHtml, setReminderMailHtml] = useState('')
  const [savingTemplate, setSavingTemplate] = useState(false)

  const [cronStatusLoading, setCronStatusLoading] = useState(false)
  const [cronStatus, setCronStatus] = useState<{
    wouldRunSendLoop: boolean
    checks: { id: string; ok: boolean; title: string; detail?: string }[]
    amsterdam: { ymd: string; weekdayLabel: string; time: string }
    configured: { reminder_weekday_label: string; reminder_time_local: string }
    recipientCount: number | null
    pendingSendCount: number | null
    alreadySentToday: number | null
  } | null>(null)
  const [cronStatusError, setCronStatusError] = useState('')

  const { data: settings, mutate } = useSWR<{
    tikkie_pay_link?: string
    order_weekdays?: number[]
    closed_dates?: string[]
    reminder_mail_enabled?: boolean
    reminder_weekday?: number
    reminder_time_local?: string
    reminder_mail_subject?: string | null
    reminder_mail_html?: string | null
  }>('/api/lunch/settings', fetcher)

  useEffect(() => {
    if (!settings) return
    if (settings.tikkie_pay_link !== undefined) setTikkieLink(settings.tikkie_pay_link ?? '')
    if (Array.isArray(settings.order_weekdays) && settings.order_weekdays.length > 0) {
      setOrderWeekdays([...settings.order_weekdays].sort((a, b) => a - b))
    }
    if (Array.isArray(settings.closed_dates)) setClosedDates([...settings.closed_dates].sort())
    if (typeof settings.reminder_mail_enabled === 'boolean') setReminderMailEnabled(settings.reminder_mail_enabled)
    if (typeof settings.reminder_weekday === 'number' && settings.reminder_weekday >= 1 && settings.reminder_weekday <= 7) {
      setReminderWeekday(settings.reminder_weekday)
    }
    if (typeof settings.reminder_time_local === 'string' && /^\d{1,2}:\d{2}$/.test(settings.reminder_time_local)) {
      const [h, m] = settings.reminder_time_local.split(':')
      setReminderTimeLocal(`${h.padStart(2, '0')}:${m.padStart(2, '0')}`)
    }
    setReminderMailSubject(
      typeof settings.reminder_mail_subject === 'string' ? settings.reminder_mail_subject : ''
    )
    setReminderMailHtml(typeof settings.reminder_mail_html === 'string' ? settings.reminder_mail_html : '')
  }, [settings])

  useEffect(() => {
    return () => {
      if (testDelayIntervalRef.current) {
        clearInterval(testDelayIntervalRef.current)
        testDelayIntervalRef.current = null
      }
    }
  }, [])

  async function patchLunchSettings(partial: Record<string, unknown>) {
    setError('')
    const res = await fetch('/api/lunch/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(partial),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error ?? 'Opslaan mislukt')
    mutate(data)
    setSuccess(true)
    window.setTimeout(() => setSuccess(false), 2500)
  }

  async function persistReminder(partial: Record<string, unknown>) {
    setSavingReminder(true)
    try {
      await patchLunchSettings(partial)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Er ging iets mis')
      await mutate()
      throw e
    } finally {
      setSavingReminder(false)
    }
  }

  async function saveMailTemplate() {
    if (reminderMailHtml.trim() && !reminderMailHtml.includes('{{actionLink}}')) {
      setError('HTML moet {{actionLink}} bevatten (inloglink).')
      return
    }
    setSavingTemplate(true)
    try {
      await patchLunchSettings({
        reminder_mail_subject: reminderMailSubject.trim() || null,
        reminder_mail_html: reminderMailHtml.trim() || null,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Er ging iets mis')
      await mutate()
    } finally {
      setSavingTemplate(false)
    }
  }

  async function resetMailTemplate() {
    setReminderMailSubject('')
    setReminderMailHtml('')
    setSavingTemplate(true)
    try {
      await patchLunchSettings({ reminder_mail_subject: null, reminder_mail_html: null })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Er ging iets mis')
      await mutate()
    } finally {
      setSavingTemplate(false)
    }
  }

  async function sendTestReminder() {
    setTestError('')
    setTestMsg('')
    setTestLoading(true)
    try {
      const res = await fetch('/api/lunch/reminder-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Versturen mislukt')
      setTestMsg(`Testmail verstuurd naar ${data.to ?? 'je e-mailadres'}.`)
    } catch (e) {
      setTestError(e instanceof Error ? e.message : 'Mislukt')
    } finally {
      setTestLoading(false)
    }
  }

  function scheduleDelayedTestReminder() {
    if (testDelayRemaining !== null || testLoading) return
    setTestError('')
    setTestMsg(`Testmail over ${REMINDER_TEST_DELAY_SEC} seconden…`)
    setTestDelayRemaining(REMINDER_TEST_DELAY_SEC)
    testDelayIntervalRef.current = setInterval(() => {
      setTestDelayRemaining(prev => {
        if (prev === null) return null
        if (prev === 1) {
          if (testDelayIntervalRef.current) {
            clearInterval(testDelayIntervalRef.current)
            testDelayIntervalRef.current = null
          }
          queueMicrotask(() => {
            void sendTestReminder()
          })
          return null
        }
        const n = prev - 1
        setTestMsg(`Testmail over ${n} seconden…`)
        return n
      })
    }, 1000)
  }

  function cancelDelayedTestReminder() {
    if (testDelayIntervalRef.current) {
      clearInterval(testDelayIntervalRef.current)
      testDelayIntervalRef.current = null
    }
    setTestDelayRemaining(null)
    setTestMsg('')
  }

  async function fetchCronStatus() {
    setCronStatusLoading(true)
    setCronStatusError('')
    setCronStatus(null)
    try {
      const res = await fetch('/api/lunch/reminder-status')
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Status ophalen mislukt')
      setCronStatus(data)
    } catch (e) {
      setCronStatusError(e instanceof Error ? e.message : 'Mislukt')
    } finally {
      setCronStatusLoading(false)
    }
  }

  async function persistSchedule(partial: { order_weekdays: number[] } | { closed_dates: string[] }) {
    setError('')
    setSavingSchedule(true)
    try {
      const res = await fetch('/api/lunch/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(partial),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Opslaan mislukt')
      mutate(data)
      setSuccess(true)
      window.setTimeout(() => setSuccess(false), 2500)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Er ging iets mis')
      await mutate()
      throw e
    } finally {
      setSavingSchedule(false)
    }
  }

  async function toggleWeekday(iso: number) {
    const has = orderWeekdays.includes(iso)
    const next = has ? orderWeekdays.filter(d => d !== iso) : [...orderWeekdays, iso].sort((a, b) => a - b)
    if (next.length === 0) return
    setOrderWeekdays(next)
    try {
      await persistSchedule({ order_weekdays: next })
    } catch {
      /* state wordt gesynchroniseerd via mutate() in persistSchedule */
    }
  }

  async function addClosedDate() {
    const d = newClosedDate.trim()
    if (!d || closedDates.includes(d)) return
    const next = [...closedDates, d].sort()
    setClosedDates(next)
    setNewClosedDate('')
    setSavingNewClosed(true)
    try {
      await persistSchedule({ closed_dates: next })
    } catch {
      setNewClosedDate(d)
    } finally {
      setSavingNewClosed(false)
    }
  }

  async function removeClosedDate(d: string) {
    const next = closedDates.filter(x => x !== d)
    setClosedDates(next)
    try {
      await persistSchedule({ closed_dates: next })
    } catch {
      /* state wordt gesynchroniseerd via mutate() in persistSchedule */
    }
  }

  async function handleSave() {
    setTikkieError('')
    setTikkieSaved(false)
    setSaving(true)
    try {
      const res = await fetch('/api/lunch/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tikkie_pay_link: tikkieLink,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Opslaan mislukt')
      mutate(data)
      setTikkieSaved(true)
      window.setTimeout(() => setTikkieSaved(false), 2500)
    } catch (e) {
      setTikkieError(e instanceof Error ? e.message : 'Er ging iets mis')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl p-4" style={{ background: 'white', border: '1px solid rgba(45,69,124,0.1)' }}>
        <h2 className="font-bold mb-3" style={{ color: DYNAMO_BLUE }}>Besteldagen</h2>
        {error && <p className="text-sm text-red-600 mb-2 rounded-lg bg-red-50 px-3 py-2 border border-red-100">{error}</p>}
        {success && !error && (
          <p className="text-sm text-green-700 mb-2 rounded-lg bg-green-50 px-3 py-2 border border-green-100">Opgeslagen.</p>
        )}
        <p className="text-sm mb-3" style={{ color: 'rgba(45,69,124,0.6)' }}>
          Vink aan op welke weekdagen medewerkers mogen bestellen. Wijzigingen worden direct opgeslagen. Gesloten dagen idem.
        </p>
        <div className="flex flex-wrap gap-2 mb-4">
          {WEEKDAYS_NL.map(({ iso, label, short }) => (
            <label
              key={iso}
              className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm border ${savingSchedule ? 'opacity-70 cursor-wait' : 'cursor-pointer'}`}
              style={{
                borderColor: orderWeekdays.includes(iso) ? DYNAMO_BLUE : 'rgba(45,69,124,0.15)',
                background: orderWeekdays.includes(iso) ? 'rgba(45,69,124,0.08)' : 'white',
                color: DYNAMO_BLUE,
              }}
            >
              <input
                type="checkbox"
                checked={orderWeekdays.includes(iso)}
                onChange={() => void toggleWeekday(iso)}
                disabled={savingSchedule}
                className="rounded border-gray-300 disabled:cursor-wait"
              />
              <span className="font-medium">{short}</span>
              <span className="hidden sm:inline text-gray-500 font-normal">{label}</span>
            </label>
          ))}
        </div>

        <h3 className="font-semibold text-sm mb-2" style={{ color: DYNAMO_BLUE }}>
          Gesloten dagen
        </h3>
        <p className="text-sm mb-2" style={{ color: 'rgba(45,69,124,0.6)' }}>
          Feestdagen of andere dagen waarop niet besteld kan worden (naast niet-aangevinkte weekdagen).
        </p>
        <div className="flex flex-wrap items-end gap-2 mb-3">
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'rgba(45,69,124,0.6)' }}>
              Datum
            </label>
            <input
              type="date"
              value={newClosedDate}
              onChange={e => setNewClosedDate(e.target.value)}
              className="rounded-lg px-3 py-2 text-sm border"
              style={{ borderColor: 'rgba(45,69,124,0.2)', color: DYNAMO_BLUE }}
            />
          </div>
          <button
            type="button"
            onClick={() => void addClosedDate()}
            disabled={!newClosedDate || savingSchedule}
            className="px-3 py-2 rounded-lg text-sm font-semibold disabled:opacity-50 border"
            style={{ borderColor: 'rgba(45,69,124,0.25)', color: DYNAMO_BLUE }}
          >
            {savingNewClosed ? 'Opslaan...' : 'Toevoegen'}
          </button>
        </div>
        {closedDates.length > 0 ? (
          <ul className="space-y-1 mb-4">
            {closedDates.map(d => (
              <li
                key={d}
                className="flex items-center justify-between rounded-lg px-3 py-2 text-sm"
                style={{ background: 'rgba(45,69,124,0.04)', color: DYNAMO_BLUE }}
              >
                <span>{new Date(d + 'T12:00:00').toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
                <button
                  type="button"
                  onClick={() => void removeClosedDate(d)}
                  disabled={savingSchedule}
                  className="text-red-600 font-medium hover:underline text-xs disabled:opacity-50"
                >
                  Verwijderen
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm mb-4" style={{ color: 'rgba(45,69,124,0.45)' }}>
            Geen extra gesloten dagen.
          </p>
        )}
      </div>

      <div className="rounded-xl p-4" style={{ background: 'white', border: '1px solid rgba(45,69,124,0.1)' }}>
        <h2 className="font-bold mb-3" style={{ color: DYNAMO_BLUE }}>Herinneringsmail (Mailgun)</h2>
        <p className="text-sm mb-3" style={{ color: 'rgba(45,69,124,0.6)' }}>
          Op de gekozen dag en tijd (Europe/Amsterdam) ontvangen lunch-gebruikers een mail met een inloglink om snel te bestellen.
          Plan op de gratis Vercel-tier een externe cron (bijv. cron-job.org) elke <strong>5 minuten</strong> op{' '}
          <code className="text-xs bg-gray-100 px-1 rounded">GET /api/lunch/reminder-cron</code> met header{' '}
          <code className="text-xs bg-gray-100 px-1 rounded">Authorization: Bearer CRON_SECRET</code>.
        </p>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <span className="text-sm font-medium" style={{ color: DYNAMO_BLUE }}>Herinneringen versturen</span>
          <button
            type="button"
            role="switch"
            aria-checked={reminderMailEnabled}
            disabled={savingReminder}
            onClick={() => {
              const next = !reminderMailEnabled
              setReminderMailEnabled(next)
              void persistReminder({ reminder_mail_enabled: next }).catch(() => setReminderMailEnabled(!next))
            }}
            className={`relative inline-flex h-7 w-12 shrink-0 rounded-full border-2 border-transparent transition-colors ${
              reminderMailEnabled ? '' : 'bg-gray-200'
            } disabled:opacity-50`}
            style={reminderMailEnabled ? { background: DYNAMO_BLUE } : {}}
          >
            <span
              className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow transition ${
                reminderMailEnabled ? 'translate-x-5' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'rgba(45,69,124,0.6)' }}>
              Dag van verzending
            </label>
            <select
              value={reminderWeekday}
              disabled={savingReminder}
              onChange={e => {
                const v = parseInt(e.target.value, 10)
                setReminderWeekday(v)
                void persistReminder({ reminder_weekday: v })
              }}
              className="w-full rounded-lg px-3 py-2 text-sm border"
              style={{ borderColor: 'rgba(45,69,124,0.2)', color: DYNAMO_BLUE }}
            >
              {WEEKDAYS_NL.map(({ iso, label }) => (
                <option key={iso} value={iso}>{label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'rgba(45,69,124,0.6)' }}>
              Tijd (Amsterdam)
            </label>
            <input
              type="time"
              value={reminderTimeLocal}
              disabled={savingReminder}
              onChange={e => setReminderTimeLocal(e.target.value)}
              onBlur={() => {
                if (reminderTimeLocal && reminderTimeLocal !== settings?.reminder_time_local) {
                  void persistReminder({ reminder_time_local: reminderTimeLocal })
                }
              }}
              className="w-full rounded-lg px-3 py-2 text-sm border"
              style={{ borderColor: 'rgba(45,69,124,0.2)', color: DYNAMO_BLUE }}
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <button
            type="button"
            onClick={() => void sendTestReminder()}
            disabled={testLoading || savingReminder || testDelayRemaining !== null}
            className="px-4 py-2 rounded-lg font-semibold text-sm disabled:opacity-50 border"
            style={{ borderColor: 'rgba(45,69,124,0.25)', color: DYNAMO_BLUE }}
          >
            {testLoading ? 'Versturen...' : 'Preview: testmail naar mij'}
          </button>
          <button
            type="button"
            onClick={scheduleDelayedTestReminder}
            disabled={testLoading || savingReminder || testDelayRemaining !== null}
            className="px-4 py-2 rounded-lg font-semibold text-sm disabled:opacity-50 border"
            style={{ borderColor: 'rgba(45,69,124,0.25)', color: DYNAMO_BLUE }}
          >
            Test over {REMINDER_TEST_DELAY_SEC} sec
          </button>
          {testDelayRemaining !== null && (
            <button
              type="button"
              onClick={cancelDelayedTestReminder}
              className="px-4 py-2 rounded-lg font-semibold text-sm border border-red-200 text-red-700 bg-red-50 hover:bg-red-100"
            >
              Annuleren
            </button>
          )}
        </div>
        {testError && <p className="text-sm text-red-600 mb-2">{testError}</p>}
        {testMsg && (
          <p
            className={`text-sm mb-2 ${testDelayRemaining !== null ? 'text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2' : 'text-green-700'}`}
          >
            {testMsg}
          </p>
        )}

        <div className="mt-4 pt-4" style={{ borderTop: '1px solid rgba(45,69,124,0.1)' }}>
          <h3 className="font-semibold text-sm mb-2" style={{ color: DYNAMO_BLUE }}>Automatische mail (cron)</h3>
          <p className="text-xs mb-3" style={{ color: 'rgba(45,69,124,0.55)' }}>
            Controleert dezelfde voorwaarden als <code className="text-[11px] bg-gray-100 px-1 rounded">/api/lunch/reminder-cron</code> op dit moment — er wordt <strong>geen</strong> mail verstuurd. Externe scheduler (elke 5 min + CRON_SECRET) moet nog steeds geconfigureerd zijn op productie.
          </p>
          <button
            type="button"
            onClick={() => void fetchCronStatus()}
            disabled={cronStatusLoading}
            className="px-4 py-2 rounded-lg font-semibold text-sm disabled:opacity-50 border mb-3"
            style={{ borderColor: 'rgba(45,69,124,0.25)', color: DYNAMO_BLUE }}
          >
            {cronStatusLoading ? 'Controleren…' : 'Controleer automatische mail'}
          </button>
          {cronStatusError && (
            <p className="text-sm text-red-600 mb-2 rounded-lg bg-red-50 px-3 py-2 border border-red-100">{cronStatusError}</p>
          )}
          {cronStatus && (
            <div className="rounded-xl p-3 space-y-3" style={{ background: 'rgba(45,69,124,0.04)', border: '1px solid rgba(45,69,124,0.1)' }}>
              <p
                className="text-sm font-semibold m-0"
                style={{ color: cronStatus.wouldRunSendLoop ? '#166534' : '#9a3412' }}
              >
                {cronStatus.wouldRunSendLoop
                  ? '✓ Nu zou de cron de verzendronde starten (voor gebruikers die deze verzenddag nog geen mail kregen).'
                  : '✗ Nu zou de cron géén mails versturen — zie onder.'}
              </p>
              <ul className="space-y-2 m-0 pl-0 list-none">
                {cronStatus.checks.map(c => (
                  <li
                    key={c.id}
                    className="text-sm rounded-lg px-3 py-2"
                    style={{
                      background: c.ok ? 'rgba(22,163,74,0.08)' : 'rgba(220,38,38,0.06)',
                      color: DYNAMO_BLUE,
                    }}
                  >
                    <span className="font-semibold">{c.ok ? '✓' : '✗'} {c.title}</span>
                    {c.detail && (
                      <span className="block text-xs mt-0.5 font-normal" style={{ color: 'rgba(45,69,124,0.75)' }}>
                        {c.detail}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              <p className="text-xs m-0" style={{ color: 'rgba(45,69,124,0.55)' }}>
                Amsterdam nu: {cronStatus.amsterdam.weekdayLabel} {cronStatus.amsterdam.ymd}, klok {cronStatus.amsterdam.time}. Ingesteld: mail op{' '}
                {cronStatus.configured.reminder_weekday_label} om {cronStatus.configured.reminder_time_local}.
                {cronStatus.recipientCount != null && (
                  <>
                    {' '}
                    Ontvangers: {cronStatus.recipientCount}, nog te mailen vandaag: {cronStatus.pendingSendCount ?? '—'}.
                  </>
                )}
              </p>
            </div>
          )}
        </div>

        <div className="mt-6 pt-4" style={{ borderTop: '1px solid rgba(45,69,124,0.1)' }}>
          <h3 className="font-semibold text-sm mb-2" style={{ color: DYNAMO_BLUE }}>E-mailtemplate</h3>
          <p className="text-xs mb-3" style={{ color: 'rgba(45,69,124,0.55)' }}>
            Leeg laten = ingebouwde standaardtekst. Placeholders:{' '}
            <code className="text-[11px] bg-gray-100 px-1 rounded">{'{{prettyDate}} {{orderDateYmd}} {{actionLink}} {{siteUrl}}'}</code>
            . In HTML is <code className="text-[11px] bg-gray-100 px-1 rounded">{'{{actionLink}}'}</code> verplicht zodra je eigen HTML opslaat.
          </p>
          <label className="block text-xs font-medium mb-1" style={{ color: 'rgba(45,69,124,0.6)' }}>
            Onderwerp
          </label>
          <input
            type="text"
            value={reminderMailSubject}
            onChange={e => setReminderMailSubject(e.target.value)}
            placeholder="Leeg = standaard: Lunch: bestel je broodje voor {{prettyDate}}"
            disabled={savingTemplate || savingReminder}
            className="w-full rounded-lg px-3 py-2 text-sm border mb-3 placeholder:text-gray-400"
            style={{ borderColor: 'rgba(45,69,124,0.2)', color: DYNAMO_BLUE }}
          />
          <label className="block text-xs font-medium mb-1" style={{ color: 'rgba(45,69,124,0.6)' }}>
            HTML-body
          </label>
          <textarea
            value={reminderMailHtml}
            onChange={e => setReminderMailHtml(e.target.value)}
            placeholder="Leeg = standaard lay-out. Eigen HTML met minimaal {{actionLink}} in de inhoud."
            rows={12}
            disabled={savingTemplate || savingReminder}
            className="w-full rounded-lg px-3 py-2 text-sm border font-mono mb-3 placeholder:text-gray-400"
            style={{ borderColor: 'rgba(45,69,124,0.2)', color: DYNAMO_BLUE }}
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void saveMailTemplate()}
              disabled={savingTemplate || savingReminder}
              className="px-4 py-2 rounded-lg font-semibold text-sm disabled:opacity-50"
              style={{ background: DYNAMO_BLUE, color: 'white' }}
            >
              {savingTemplate ? 'Opslaan...' : 'Mailtemplate opslaan'}
            </button>
            <button
              type="button"
              onClick={() => void resetMailTemplate()}
              disabled={savingTemplate || savingReminder}
              className="px-4 py-2 rounded-lg font-semibold text-sm border disabled:opacity-50"
              style={{ borderColor: 'rgba(45,69,124,0.25)', color: DYNAMO_BLUE }}
            >
              Herstel standaard
            </button>
          </div>
        </div>

        <p className="text-xs mt-4" style={{ color: 'rgba(45,69,124,0.45)' }}>
          Zelfde Mailgun als welkomstmail: MAILGUN_API_KEY, MAILGUN_DOMAIN, optioneel MAILGUN_EU=true en MAILGUN_FROM_EMAIL. Gebruikers kunnen zich afmelden onder Portal → Instellingen.
        </p>
      </div>

      <div className="rounded-xl p-4" style={{ background: 'white', border: '1px solid rgba(45,69,124,0.1)' }}>
        <h2 className="font-bold mb-3" style={{ color: DYNAMO_BLUE }}>Tikkie betaallink</h2>
        <p className="text-sm mb-3" style={{ color: 'rgba(45,69,124,0.6)' }}>
          De link die gebruikers na het bestellen zien om te betalen. Bijv. https://tikkie.me/pay/xxx
        </p>
        {tikkieError && <p className="text-sm text-red-600 mb-2 rounded-lg bg-red-50 px-3 py-2 border border-red-100">{tikkieError}</p>}
        {tikkieSaved && !tikkieError && (
          <p className="text-sm text-green-700 mb-2 rounded-lg bg-green-50 px-3 py-2 border border-green-100">Tikkie-link opgeslagen.</p>
        )}
        <input
          type="url"
          value={tikkieLink}
          onChange={e => setTikkieLink(e.target.value)}
          placeholder="https://tikkie.me/pay/..."
          className="w-full rounded-lg px-3 py-2 text-sm border mb-3 placeholder:text-gray-500"
          style={{ borderColor: 'rgba(45,69,124,0.2)', background: 'white', color: DYNAMO_BLUE }}
        />
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 rounded-lg font-semibold text-sm disabled:opacity-50"
          style={{ background: DYNAMO_BLUE, color: 'white' }}
        >
          {saving ? 'Opslaan...' : 'Tikkie-link opslaan'}
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
          <div key={i} className="h-16 rounded-xl animate-pulse" style={{ background: 'rgba(45,69,124,0.06)' }} />
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
          style={{ background: DYNAMO_BLUE, color: 'white' }}
        >
          + Nieuw product
        </button>
      </div>

      {(editingProduct || newProduct) && (
        <div className="rounded-xl p-4" style={{ background: 'white', border: '1px solid rgba(45,69,124,0.1)' }}>
          <h3 className="font-semibold mb-3" style={{ color: DYNAMO_BLUE }}>{newProduct ? 'Nieuw product' : 'Bewerken'}</h3>
          {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              type="text"
              placeholder="Naam"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="rounded-lg px-3 py-2 text-sm border placeholder:text-gray-500"
              style={{ borderColor: 'rgba(45,69,124,0.2)', background: 'white', color: DYNAMO_BLUE }}
            />
            <input
              type="number"
              placeholder="Prijs (centen)"
              value={form.price_cents}
              onChange={e => setForm(f => ({ ...f, price_cents: parseInt(e.target.value, 10) || 0 }))}
              className="rounded-lg px-3 py-2 text-sm border placeholder:text-gray-500"
              style={{ borderColor: 'rgba(45,69,124,0.2)', background: 'white', color: DYNAMO_BLUE }}
            />
            <input
              type="text"
              placeholder="Ingrediënten / beleg"
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              className="rounded-lg px-3 py-2 text-sm border sm:col-span-2 placeholder:text-gray-500"
              style={{ borderColor: 'rgba(45,69,124,0.2)', background: 'white', color: DYNAMO_BLUE }}
            />
            <input
              type="url"
              placeholder="Afbeelding URL"
              value={form.image_url}
              onChange={e => setForm(f => ({ ...f, image_url: e.target.value }))}
              className="rounded-lg px-3 py-2 text-sm border sm:col-span-2 placeholder:text-gray-500"
              style={{ borderColor: 'rgba(45,69,124,0.2)', background: 'white', color: DYNAMO_BLUE }}
            />
            <select
              value={form.category}
              onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
              className="rounded-lg px-3 py-2 text-sm border"
              style={{ borderColor: 'rgba(45,69,124,0.2)', background: 'white', color: DYNAMO_BLUE }}
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
              style={{ borderColor: 'rgba(45,69,124,0.2)' }}
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
            style={{ background: 'white', border: '1px solid rgba(45,69,124,0.08)' }}
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
              <div className="text-xs" style={{ color: 'rgba(45,69,124,0.5)' }}>
                {CATEGORY_LABELS[p.category] ?? p.category} · {formatPrice(p.price_cents)}
                {!p.active && ' · Inactief'}
              </div>
              {p.description && (
                <div className="text-xs mt-0.5 truncate" style={{ color: 'rgba(45,69,124,0.4)' }}>{p.description}</div>
              )}
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                type="button"
                onClick={() => handleEdit(p)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                style={{ background: 'rgba(45,69,124,0.08)', color: DYNAMO_BLUE }}
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
