'use client'

import { useCallback, useRef, useState } from 'react'
import { ArrowUp, Building2, Loader2, MapPin, Sparkles } from 'lucide-react'
import { VerPdfButton } from '@/components/ver-pdf-button'
import type { ImovelResumo } from '@/lib/assistente-imoveis'
import { cn } from '@/lib/utils'

type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  imoveis?: ImovelResumo[]
}

const EXEMPLOS = [
  {
    label: 'Apartamento na Vila Mariana',
    query: 'Apartamento na Vila Mariana com 3 quartos até 2 milhões',
    icon: MapPin,
  },
  {
    label: 'Studio em Moema',
    query: 'Studio em Moema com 1 vaga',
    icon: Building2,
  },
  {
    label: 'Imóveis Cyrela',
    query: 'Imóveis da Cyrela com 2 suítes',
    icon: Sparkles,
  },
  {
    label: 'Prontos para morar',
    query: 'Lançamentos prontos para morar até 1,5M',
    icon: Building2,
  },
]

function formatValor(v: number | null) {
  return v != null ? `R$ ${v.toLocaleString('pt-BR')}` : '—'
}

function ImovelCard({ imovel }: { imovel: ImovelResumo }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 text-sm shadow-sm hover:border-gray-300 transition-colors">
      <p className="font-medium text-[15px] text-gray-900 leading-snug">{imovel.titulo}</p>
      <p className="text-[13px] text-gray-500 mt-1">
        {imovel.construtora}
        {imovel.bairro ? ` · ${imovel.bairro}` : ''}
      </p>
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2.5 text-[13px] text-gray-600">
        {imovel.metragem && <span>{imovel.metragem}</span>}
        {imovel.dormitorios != null && <span>{imovel.dormitorios} dorms</span>}
        {imovel.suites != null && <span>{imovel.suites} suíte{imovel.suites === 1 ? '' : 's'}</span>}
        {imovel.vagas && <span>{imovel.vagas} vaga{imovel.vagas === '1' ? '' : 's'}</span>}
        {imovel.entrega && <span>Entrega {imovel.entrega}</span>}
      </div>
      <p className="text-[15px] font-semibold text-gray-900 mt-2.5 tabular-nums">
        {formatValor(imovel.valor)}
      </p>
      <div className="mt-2.5">
        <VerPdfButton processamentoId={imovel.processamento_id} size="xs" />
      </div>
    </div>
  )
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-2 text-[15px] text-gray-500 py-2">
      <Loader2 className="size-4 animate-spin shrink-0" />
      <span>Buscando imóveis...</span>
    </div>
  )
}

export default function AssistenteImoveisPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }))
  }, [])

  const enviar = useCallback(async (texto: string) => {
    const message = texto.trim()
    if (!message || loading) return

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: message,
    }

    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)
    scrollToBottom()

    const history = [...messages, userMsg]
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .slice(-6)
      .map(m => ({ role: m.role, content: m.content }))

    try {
      const res = await fetch('/api/lancamentos/assistente', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, history }),
      })
      const data = await res.json()

      if (!res.ok) throw new Error(data.error || 'Erro na busca')

      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: data.resposta,
        imoveis: data.imoveis,
      }])
    } catch (err) {
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: err instanceof Error ? err.message : 'Erro ao buscar imóveis. Tente novamente.',
      }])
    } finally {
      setLoading(false)
      scrollToBottom()
    }
  }, [loading, messages, scrollToBottom])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      enviar(input)
    }
  }

  const isEmpty = messages.length === 0 && !loading
  const canSend = input.trim().length > 0 && !loading

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto">
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center min-h-full px-4 pb-32">
            <h1 className="text-[28px] sm:text-[32px] font-normal text-gray-800 text-center tracking-tight">
              O que você procura hoje?
            </h1>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
            {messages.map(msg => (
              <div key={msg.id} className="w-full">
                {msg.role === 'user' ? (
                  <div className="flex justify-end">
                    <div className="max-w-[85%] rounded-[1.25rem] bg-[#f4f4f4] px-4 py-2.5 text-[15px] text-gray-900 leading-relaxed">
                      {msg.content}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <p className="text-[15px] text-gray-800 leading-relaxed whitespace-pre-wrap">
                      {msg.content}
                    </p>
                    {msg.imoveis && msg.imoveis.length > 0 && (
                      <div className="grid gap-3 sm:grid-cols-2">
                        {msg.imoveis.map(imovel => (
                          <ImovelCard key={imovel.id} imovel={imovel} />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
            {loading && <TypingIndicator />}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <div className="shrink-0 bg-gradient-to-t from-white via-white to-white/80 px-4 pb-4 pt-2">
        <div className="max-w-3xl mx-auto">
          <form
            onSubmit={e => {
              e.preventDefault()
              enviar(input)
            }}
          >
            <div
              className={cn(
                'flex items-end gap-2 rounded-[1.75rem] border bg-white px-4 py-3 shadow-[0_0_0_1px_rgba(0,0,0,0.03),0_2px_8px_rgba(0,0,0,0.06)]',
                'focus-within:border-gray-300 transition-colors'
              )}
            >
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Pergunte alguma coisa"
                disabled={loading}
                rows={1}
                className={cn(
                  'flex-1 resize-none bg-transparent text-[15px] text-gray-900 placeholder:text-gray-400',
                  'outline-none min-h-[24px] max-h-[120px] py-0.5 leading-relaxed'
                )}
              />
              <button
                type="submit"
                disabled={!canSend}
                aria-label="Enviar"
                className={cn(
                  'shrink-0 flex items-center justify-center size-8 rounded-full transition-colors',
                  canSend
                    ? 'bg-gray-900 text-white hover:bg-gray-800'
                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                )}
              >
                {loading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <ArrowUp className="size-4 stroke-[2.5]" />
                )}
              </button>
            </div>
          </form>

          {isEmpty && (
            <div className="flex flex-wrap justify-center gap-2 mt-4">
              {EXEMPLOS.map(ex => {
                const Icon = ex.icon
                return (
                  <button
                    key={ex.query}
                    type="button"
                    onClick={() => enviar(ex.query)}
                    className={cn(
                      'inline-flex items-center gap-2 px-4 py-2 rounded-full',
                      'border border-gray-200 bg-white text-[13px] text-gray-700',
                      'hover:bg-gray-50 transition-colors shadow-sm'
                    )}
                  >
                    <Icon className="size-3.5 text-gray-500" />
                    {ex.label}
                  </button>
                )
              })}
            </div>
          )}

          <p className="text-[11px] text-gray-400 text-center mt-3">
            Assistente usa gpt-4o-mini · resultados do catálogo salvo no banco
          </p>
        </div>
      </div>
    </div>
  )
}
