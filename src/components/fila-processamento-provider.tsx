'use client'

import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { EVENTO_FILA_ATUALIZADA, tentarProcessarProximo } from '@/lib/processamento-fila-worker'

const POLL_MS = 3000

export function FilaProcessamentoProvider({ children }: { children: React.ReactNode }) {
  const tickRef = useRef<() => void>(() => {})

  useEffect(() => {
    let cancelled = false
    let intervalId: ReturnType<typeof setInterval> | null = null

    const tick = async () => {
      if (cancelled) return
      const result = await tentarProcessarProximo()
      if (result.erro && result.iniciou) {
        toast.error(result.erro)
      }
    }

    tickRef.current = tick

    void tick()

    intervalId = setInterval(tick, POLL_MS)

    const onAtualizar = () => {
      void tick()
    }
    window.addEventListener(EVENTO_FILA_ATUALIZADA, onAtualizar)

    return () => {
      cancelled = true
      if (intervalId) clearInterval(intervalId)
      window.removeEventListener(EVENTO_FILA_ATUALIZADA, onAtualizar)
    }
  }, [])

  return <>{children}</>
}
