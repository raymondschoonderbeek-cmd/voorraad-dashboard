'use client'

import { createContext, useCallback, useContext, useRef, useState } from 'react'

type ToastType = 'success' | 'error' | 'warning' | 'info'

interface Toast {
  id: number
  message: string
  type: ToastType
}

interface ToastContextValue {
  addToast: (message: string, type?: ToastType) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const ICONS: Record<ToastType, string> = {
  success: '✓',
  error: '✕',
  warning: '⚠',
  info: 'ℹ',
}

const STYLES: Record<ToastType, { bg: string; border: string; icon: string; text: string }> = {
  success: { bg: '#f0fdf4', border: '#86efac', icon: '#16a34a', text: '#15803d' },
  error:   { bg: '#fef2f2', border: '#fca5a5', icon: '#dc2626', text: '#b91c1c' },
  warning: { bg: '#fffbeb', border: '#fcd34d', icon: '#d97706', text: '#b45309' },
  info:    { bg: '#eff6ff', border: '#93c5fd', icon: '#2563eb', text: '#1d4ed8' },
}

function ToastItem({ toast, onRemove }: { toast: Toast; onRemove: (id: number) => void }) {
  const s = STYLES[toast.type]
  return (
    <div
      role="alert"
      aria-live="assertive"
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '10px',
        padding: '12px 14px',
        borderRadius: '10px',
        border: `1px solid ${s.border}`,
        background: s.bg,
        boxShadow: '0 4px 12px rgba(0,0,0,0.10)',
        minWidth: '260px',
        maxWidth: '360px',
        animation: 'toast-in 0.25s ease',
        fontFamily: 'inherit',
        fontSize: '14px',
        lineHeight: '1.4',
      }}
    >
      <span style={{ color: s.icon, fontWeight: 700, fontSize: '15px', marginTop: '1px', flexShrink: 0 }}>
        {ICONS[toast.type]}
      </span>
      <span style={{ color: s.text, flex: 1 }}>{toast.message}</span>
      <button
        type="button"
        onClick={() => onRemove(toast.id)}
        aria-label="Sluiten"
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: s.icon,
          opacity: 0.6,
          fontSize: '16px',
          lineHeight: 1,
          padding: '0 0 0 4px',
          flexShrink: 0,
        }}
      >
        ×
      </button>
    </div>
  )
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const counter = useRef(0)

  const addToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = ++counter.current
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000)
  }, [])

  const removeToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      {toasts.length > 0 && (
        <div
          aria-live="polite"
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            alignItems: 'flex-end',
          }}
        >
          {toasts.map(toast => (
            <ToastItem key={toast.id} toast={toast} onRemove={removeToast} />
          ))}
        </div>
      )}
      <style>{`
        @keyframes toast-in {
          from { opacity: 0; transform: translateX(24px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx.addToast
}
