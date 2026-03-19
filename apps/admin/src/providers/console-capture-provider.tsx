'use client'

import { createContext, useContext, useEffect, useRef, useCallback, type ReactNode } from 'react'

export interface ConsoleLogEntry {
  level: 'error' | 'warn'
  timestamp: string
  message: string
}

interface ConsoleCaptureContextValue {
  getConsoleLogs: () => ConsoleLogEntry[]
  clearConsoleLogs: () => void
}

const ConsoleCaptureContext = createContext<ConsoleCaptureContextValue | null>(null)

const MAX_ENTRIES = 50
const MAX_MESSAGE_LENGTH = 500

function stringifyArgs(args: unknown[]): string {
  const parts = args.map((arg) => {
    if (arg instanceof Error) {
      return `${arg.message}\n${arg.stack || ''}`
    }
    if (typeof arg === 'string') return arg
    try {
      return JSON.stringify(arg)
    } catch {
      return String(arg)
    }
  })
  const message = parts.join(' ')
  return message.length > MAX_MESSAGE_LENGTH
    ? message.slice(0, MAX_MESSAGE_LENGTH) + '...'
    : message
}

export function ConsoleCaptureProvider({ children }: { children: ReactNode }) {
  const bufferRef = useRef<ConsoleLogEntry[]>([])
  const patchedRef = useRef(false)
  const originalErrorRef = useRef<typeof console.error | null>(null)
  const originalWarnRef = useRef<typeof console.warn | null>(null)

  useEffect(() => {
    // Idempotent for React Strict Mode — only patch once
    if (patchedRef.current) return

    patchedRef.current = true
    originalErrorRef.current = console.error
    originalWarnRef.current = console.warn

    const addEntry = (level: 'error' | 'warn', args: unknown[]) => {
      const entry: ConsoleLogEntry = {
        level,
        timestamp: new Date().toISOString(),
        message: stringifyArgs(args),
      }
      bufferRef.current.push(entry)
      if (bufferRef.current.length > MAX_ENTRIES) {
        bufferRef.current.shift()
      }
    }

    console.error = (...args: unknown[]) => {
      addEntry('error', args)
      originalErrorRef.current?.apply(console, args)
    }

    console.warn = (...args: unknown[]) => {
      addEntry('warn', args)
      originalWarnRef.current?.apply(console, args)
    }

    return () => {
      if (originalErrorRef.current) console.error = originalErrorRef.current
      if (originalWarnRef.current) console.warn = originalWarnRef.current
      patchedRef.current = false
    }
  }, [])

  const getConsoleLogs = useCallback(() => [...bufferRef.current], [])
  const clearConsoleLogs = useCallback(() => { bufferRef.current = [] }, [])

  return (
    <ConsoleCaptureContext.Provider value={{ getConsoleLogs, clearConsoleLogs }}>
      {children}
    </ConsoleCaptureContext.Provider>
  )
}

export function useConsoleCapture() {
  const ctx = useContext(ConsoleCaptureContext)
  if (!ctx) {
    throw new Error('useConsoleCapture must be used within ConsoleCaptureProvider')
  }
  return ctx
}
