'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import {
  type AssistenteConversa,
  type AssistenteMessage,
  carregarHistorico,
  salvarHistorico,
  tituloDaConversa,
} from '@/lib/assistente-historico'

type AssistenteContextValue = {
  conversas: AssistenteConversa[]
  activeId: string | null
  activeMessages: AssistenteMessage[]
  novaConversa: () => void
  abrirConversa: (id: string) => void
  removerConversa: (id: string) => void
  salvarMensagens: (id: string, messages: AssistenteMessage[]) => void
  iniciarConversa: (primeiraMensagem: string) => string
}

const AssistenteContext = createContext<AssistenteContextValue | null>(null)

export function AssistenteProvider({ children }: { children: React.ReactNode }) {
  const [conversas, setConversas] = useState<AssistenteConversa[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    setConversas(carregarHistorico())
    setHydrated(true)
  }, [])

  const novaConversa = useCallback(() => {
    setActiveId(null)
  }, [])

  const abrirConversa = useCallback((id: string) => {
    setActiveId(id)
  }, [])

  const removerConversa = useCallback((id: string) => {
    setConversas(prev => {
      const next = prev.filter(c => c.id !== id)
      salvarHistorico(next)
      return next
    })
    setActiveId(current => (current === id ? null : current))
  }, [])

  const salvarMensagens = useCallback((id: string, messages: AssistenteMessage[]) => {
    const primeiraUser = messages.find(m => m.role === 'user')
    const titulo = primeiraUser ? tituloDaConversa(primeiraUser.content) : 'Nova pesquisa'

    setConversas(prev => {
      const existente = prev.find(c => c.id === id)
      const atualizada: AssistenteConversa = {
        id,
        titulo: existente?.titulo ?? titulo,
        messages,
        updatedAt: Date.now(),
      }
      const restantes = prev.filter(c => c.id !== id)
      const next = [atualizada, ...restantes]
      salvarHistorico(next)
      return next
    })
  }, [])

  const iniciarConversa = useCallback((primeiraMensagem: string) => {
    const id = crypto.randomUUID()
    const nova: AssistenteConversa = {
      id,
      titulo: tituloDaConversa(primeiraMensagem),
      messages: [],
      updatedAt: Date.now(),
    }
    setConversas(prev => {
      const next = [nova, ...prev]
      salvarHistorico(next)
      return next
    })
    setActiveId(id)
    return id
  }, [])

  const activeMessages = useMemo(() => {
    if (!hydrated || !activeId) return []
    return conversas.find(c => c.id === activeId)?.messages ?? []
  }, [activeId, conversas, hydrated])

  const value = useMemo(
    () => ({
      conversas,
      activeId,
      activeMessages,
      novaConversa,
      abrirConversa,
      removerConversa,
      salvarMensagens,
      iniciarConversa,
    }),
    [
      conversas,
      activeId,
      activeMessages,
      novaConversa,
      abrirConversa,
      removerConversa,
      salvarMensagens,
      iniciarConversa,
    ]
  )

  return (
    <AssistenteContext.Provider value={value}>
      {children}
    </AssistenteContext.Provider>
  )
}

export function useAssistente() {
  const ctx = useContext(AssistenteContext)
  if (!ctx) throw new Error('useAssistente must be used within AssistenteProvider')
  return ctx
}
