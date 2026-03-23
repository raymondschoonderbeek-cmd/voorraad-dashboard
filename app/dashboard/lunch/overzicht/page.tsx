'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'
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
  order_date: string
  status: string
  total_cents: number
  created_at: string
  lunch_order_items: OrderItem[]
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'In afwachting betaling',
  paid: 'Betaald',
  cancelled: 'Geannuleerd',
}

function formatPrice(cents: number) {
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(cents / 100)
}

function formatDate(s: string) {
  return new Date(s).toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' })
}

export default function LunchOverzichtPage() {
  const router = useRouter()
  const supabase = createClient()
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const { data: orders = [], isLoading } = useSWR<Order[]>(`/api/lunch/orders?date=${date}`, fetcher)
  const { data: sessionData } = useSWR<{ isAdmin?: boolean; lunchOnly?: boolean }>('/api/auth/session-info', fetcher)
  const isAdmin = sessionData?.isAdmin === true
  const lunchOnly = sessionData?.lunchOnly === true

  return (
    <div className="min-h-screen" style={{ background: '#f4f6fb', fontFamily: FONT_FAMILY }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap');
        input, select { color: #2D457C !important; }
        input::placeholder { color: #6b7280 !important; }
      `}</style>

      <header style={{ background: DYNAMO_BLUE }} className="sticky top-0 z-50">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link href={lunchOnly ? '/dashboard/lunch' : '/dashboard'} className="flex items-center gap-2 text-white hover:opacity-90">
              <span>←</span>
              <span className="font-bold">{lunchOnly ? 'Mijn bestellingen' : 'Dashboard'}</span>
            </Link>
            {isAdmin && (
              <Link
                href="/dashboard/lunch/beheer"
                className="text-sm font-medium px-3 py-1.5 rounded-lg ml-2"
                style={{ background: 'rgba(255,255,255,0.15)', color: 'white', border: '1px solid rgba(255,255,255,0.3)' }}
              >
                Beheer
              </Link>
            )}
            <button
              onClick={async () => { await supabase.auth.signOut(); router.push('/login') }}
              className="text-sm font-medium px-3 py-1.5 rounded-lg ml-auto"
              style={{ background: 'rgba(255,255,255,0.15)', color: 'white', border: '1px solid rgba(255,255,255,0.3)' }}
            >
              Uitloggen
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-4 sm:p-6 space-y-4">
        <div className="flex items-center gap-3">
          <label className="text-sm font-semibold" style={{ color: DYNAMO_BLUE }}>Datum:</label>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="rounded-xl px-3 py-2 text-sm border placeholder:text-gray-500"
            style={{ borderColor: 'rgba(45,69,124,0.2)', background: 'white', color: DYNAMO_BLUE }}
          />
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-24 rounded-xl animate-pulse" style={{ background: 'rgba(45,69,124,0.06)' }} />
            ))}
          </div>
        ) : orders.length === 0 ? (
          <div className="rounded-xl p-8 text-center" style={{ background: 'white', border: '1px solid rgba(45,69,124,0.1)' }}>
            <p className="text-gray-500">Geen bestellingen voor deze datum.</p>
            <Link href="/dashboard/lunch" className="inline-block mt-4 px-4 py-2 rounded-xl font-semibold text-sm" style={{ background: DYNAMO_BLUE, color: 'white' }}>
              Bestellen
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {orders.map(order => (
              <div
                key={order.id}
                className="rounded-xl overflow-hidden"
                style={{ background: 'white', border: '1px solid rgba(45,69,124,0.1)', boxShadow: '0 2px 8px rgba(45,69,124,0.06)' }}
              >
                <div className="p-4 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(45,69,124,0.08)' }}>
                  <div>
                    <span className="font-semibold" style={{ color: DYNAMO_BLUE }}>{formatDate(order.order_date)}</span>
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
      </main>
    </div>
  )
}
