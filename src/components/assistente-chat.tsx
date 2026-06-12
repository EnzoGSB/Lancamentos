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
    <div className="rounded-lg border bg-white p-3 text-sm shadow-sm">
      <p className="font-medium text-gray-900 leading-snug">{imovel.titulo}</p>
      <p className="text-xs text-gray-500 mt-1">
        {imovel.construtora}
        {imovel.bairro ? ` · ${imovel.bairro}` : ''}
      </p>
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-xs text-gray-600">
        {imovel.metragem && <span>{imovel.metragem}</span>}
        {imovel.dormitorios != null && <span>{imovel.dormitorios} dorms</span>}
        {imovel.suites != null && <span>{imovel.suites} suíte{imovel.suites === 1 ? '' : 's'}</span>}
        {imovel.vagas && <span>{imovel.vagas} vaga{imovel.vagas === '1' ? '' : 's'}</span>}
        {imovel.entrega && <span>Entrega {imovel.entrega}</span>}
      </div>
      <p className="text-sm font-semibold text-gray-900 mt-2 tabular-nums">
        {formatValor(imovel.valor)}
      </p>
      <div className="mt-2">
        <VerPdfButton processamentoId={imovel.processamento_id} size="xs" />
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
    <div className="flex flex-col h-full max-w-3xl mx-auto w-full px-4 py-4">
      <div className="mb-4 shrink-0">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles className="size-5 text-blue-600" />
          <h1 className="text-xl font-bold text-gray-900">Pesquisa de Imóveis</h1>
        </div>
        <p className="text-sm text-gray-500">
          Descreva o que procura em linguagem natural. A IA interpreta e busca no catálogo extraído dos PDFs.
        </p>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-4 mb-4 pr-1">
        {messages.length === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center text-center py-8">
            <p className="text-gray-500 text-sm mb-4">Experimente uma destas buscas:</p>
            <div className="flex flex-wrap gap-2 justify-center max-w-lg">
              {EXEMPLOS.map(ex => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => enviar(ex)}
                  className="text-xs px-3 py-2 rounded-full border bg-white text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-colors"
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
                  ? 'max-w-[85%] rounded-2xl rounded-br-md bg-gray-900 text-white px-4 py-2.5 text-sm'
                  : 'max-w-[95%] w-full space-y-3'
              }
            >
              {msg.role === 'assistant' && (
                <p className="text-sm text-gray-700 bg-gray-100 rounded-2xl rounded-bl-md px-4 py-2.5">
                  {msg.content}
                </p>
              )}
              {msg.role === 'user' && msg.content}
              {msg.imoveis && msg.imoveis.length > 0 && (
                <div className="grid gap-2 sm:grid-cols-2">
                  {msg.imoveis.map(imovel => (
                    <ImovelCard key={imovel.id} imovel={imovel} />
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Loader2 className="size-4 animate-spin" />
            Buscando imóveis...
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <form
        className="flex gap-2 shrink-0"
        onSubmit={e => {
          e.preventDefault()
          enviar(input)
        }}
      >
        <Input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Ex: quero um apê de 3 quartos na Vila Mariana até 2 milhões..."
          disabled={loading}
          className="flex-1 bg-white"
        />
        <Button type="submit" disabled={loading || !input.trim()}>
          {loading ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
        </Button>
      </form>

      <p className="text-xs text-gray-400 mt-2 text-center shrink-0">
        Powered by gpt-4o-mini · resultados do catálogo salvo no banco
      </p>
    </div>
  )
}
