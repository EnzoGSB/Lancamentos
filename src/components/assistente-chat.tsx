'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, Send, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { VerPdfButton } from '@/components/ver-pdf-button'
import { useAssistente } from '@/components/assistente-provider'
import type { AssistenteMessage } from '@/lib/assistente-historico'
import type { ImovelResumo } from '@/lib/assistente-imoveis'

const EXEMPLOS = [
  'Apartamento na Vila Mariana com 3 quartos até 2 milhões',
  'Studio em Moema com 1 vaga',
  'Imóveis da Cyrela com 2 suítes',
  'Lançamentos prontos para morar até 1,5M',
]

function formatValor(v: number | null) {
  return v != null ? `R$ ${v.toLocaleString('pt-BR')}` : '—'
}

function ImovelCard({ imovel }: { imovel: ImovelResumo }) {
  return (
    <div className="rounded-xl border bg-white p-4 md:p-5 text-base shadow-sm">
      <p className="font-semibold text-gray-900 leading-snug text-base md:text-lg">{imovel.titulo}</p>
      <p className="text-sm md:text-base text-gray-500 mt-1.5">
        {imovel.construtora}
        {imovel.bairro ? ` · ${imovel.bairro}` : ''}
      </p>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3 text-sm md:text-base text-gray-600">
        {imovel.metragem && <span>{imovel.metragem}</span>}
        {imovel.dormitorios != null && <span>{imovel.dormitorios} dorms</span>}
        {imovel.suites != null && <span>{imovel.suites} suíte{imovel.suites === 1 ? '' : 's'}</span>}
        {imovel.vagas && <span>{imovel.vagas} vaga{imovel.vagas === '1' ? '' : 's'}</span>}
        {imovel.entrega && <span>Entrega {imovel.entrega}</span>}
      </div>
      <p className="text-lg md:text-xl font-bold text-gray-900 mt-3 tabular-nums">
        {formatValor(imovel.valor)}
      </p>
      <div className="mt-3">
        <VerPdfButton processamentoId={imovel.processamento_id} size="sm" />
      </div>
    </div>
  )
}

export function AssistenteChat() {
  const {
    activeId,
    activeMessages,
    salvarMensagens,
    iniciarConversa,
  } = useAssistente()

  const [messages, setMessages] = useState<AssistenteMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const conversaIdRef = useRef<string | null>(null)

  useEffect(() => {
    conversaIdRef.current = activeId
    setMessages(activeMessages)
    setInput('')
    setLoading(false)
  }, [activeId, activeMessages])

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }))
  }, [])

  const enviar = useCallback(async (texto: string) => {
    const message = texto.trim()
    if (!message || loading) return

    let conversaId = conversaIdRef.current
    if (!conversaId) {
      conversaId = iniciarConversa(message)
      conversaIdRef.current = conversaId
    }

    const userMsg: AssistenteMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: message,
    }

    const nextMessages = [...messages, userMsg]
    setMessages(nextMessages)
    salvarMensagens(conversaId, nextMessages)
    setInput('')
    setLoading(true)
    scrollToBottom()

    const history = nextMessages
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

      const withReply: AssistenteMessage[] = [...nextMessages, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: data.resposta,
        imoveis: data.imoveis,
      }]
      setMessages(withReply)
      salvarMensagens(conversaId, withReply)
    } catch (err) {
      const withError: AssistenteMessage[] = [...nextMessages, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: err instanceof Error ? err.message : 'Erro ao buscar imóveis. Tente novamente.',
      }]
      setMessages(withError)
      salvarMensagens(conversaId, withError)
    } finally {
      setLoading(false)
      scrollToBottom()
    }
  }, [loading, messages, salvarMensagens, iniciarConversa, scrollToBottom])

  return (
    <div className="flex flex-col h-full w-full max-w-none 2xl:max-w-[1400px] mx-auto px-3 sm:px-5 md:px-10 lg:px-14 py-3 sm:py-6 md:py-8">
      <div className="mb-4 sm:mb-6 shrink-0">
        <div className="flex items-center gap-2 sm:gap-3 mb-1 sm:mb-2">
          <Sparkles className="size-6 sm:size-7 text-blue-600 shrink-0" />
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900">Pesquisa de Imóveis</h1>
        </div>
        <p className="text-sm sm:text-base md:text-lg text-gray-500 max-w-3xl">
          Descreva o que procura em linguagem natural. A IA interpreta e busca no catálogo extraído dos PDFs.
        </p>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-4 sm:gap-5 mb-3 sm:mb-6 pr-0.5 overscroll-contain">
        {messages.length === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center text-center py-6 sm:py-10 md:py-16">
            <p className="text-lg sm:text-xl md:text-2xl font-semibold text-gray-800 mb-2">O que você procura?</p>
            <p className="text-sm sm:text-base md:text-lg text-gray-500 mb-6 sm:mb-8 max-w-xl px-2">
              Experimente uma destas buscas ou descreva o imóvel ideal no campo abaixo.
            </p>
            <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2 sm:gap-3 justify-center w-full max-w-4xl px-1">
              {EXEMPLOS.map(ex => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => enviar(ex)}
                  className="text-sm sm:text-base px-4 sm:px-5 py-3 rounded-xl sm:rounded-full border bg-white text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-colors text-left touch-manipulation w-full sm:w-auto"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map(msg => (
          <div
            key={msg.id}
            className={msg.role === 'user' ? 'flex justify-end' : 'flex justify-start'}
          >
            <div
              className={
                msg.role === 'user'
                  ? 'max-w-[92%] sm:max-w-[85%] rounded-2xl rounded-br-md bg-gray-900 text-white px-4 sm:px-5 py-3 sm:py-3.5 text-sm sm:text-base md:text-lg leading-relaxed'
                  : 'max-w-full w-full space-y-3 sm:space-y-4'
              }
            >
              {msg.role === 'assistant' && (
                <p className="text-sm sm:text-base md:text-lg text-gray-700 bg-gray-100 rounded-2xl rounded-bl-md px-4 sm:px-5 py-3 sm:py-3.5 leading-relaxed">
                  {msg.content}
                </p>
              )}
              {msg.role === 'user' && msg.content}
              {msg.imoveis && msg.imoveis.length > 0 && (
                <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
                  {msg.imoveis.map(imovel => (
                    <ImovelCard key={imovel.id} imovel={imovel} />
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex items-center gap-3 text-base md:text-lg text-gray-500">
            <Loader2 className="size-5 animate-spin" />
            Buscando imóveis...
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="shrink-0 sticky bottom-0 bg-gray-50 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] -mx-3 px-3 sm:mx-0 sm:px-0 border-t border-transparent sm:border-0">
        <form
          className="flex gap-2 sm:gap-3"
          onSubmit={e => {
            e.preventDefault()
            enviar(input)
          }}
        >
          <Input
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Descreva o imóvel que procura..."
            disabled={loading}
            className="flex-1 min-w-0 h-11 sm:h-12 md:h-14 text-base md:text-lg px-3 sm:px-4 bg-white"
          />
          <Button
            type="submit"
            size="lg"
            className="h-11 sm:h-12 md:h-14 px-4 sm:px-5 shrink-0 touch-manipulation"
            disabled={loading || !input.trim()}
          >
            {loading ? <Loader2 className="size-5 animate-spin" /> : <Send className="size-5" />}
          </Button>
        </form>

        <p className="hidden sm:block text-sm text-gray-400 mt-3 text-center">
          Powered by gpt-4o-mini · resultados do catálogo salvo no banco
        </p>
      </div>
    </div>
  )
}
