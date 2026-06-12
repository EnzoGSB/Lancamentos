'use client'

import { useCallback, useRef, useState } from 'react'
import { Loader2, Send, Sparkles } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { ImovelResumo } from '@/lib/assistente-imoveis'

type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  imoveis?: ImovelResumo[]
}

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
    </div>
  )
}

export default function AssistenteImoveisPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

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

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles className="size-5 text-blue-600" />
          <h1 className="text-2xl font-bold text-gray-900">Assistente de Imóveis</h1>
        </div>
        <p className="text-sm text-gray-500">
          Descreva o que procura em linguagem natural. A IA interpreta e busca no catálogo extraído dos PDFs.
        </p>
      </div>

      <Card className="mb-4">
        <CardContent className="p-4 min-h-[420px] max-h-[60vh] overflow-y-auto flex flex-col gap-4">
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
        </CardContent>
      </Card>

      <form
        className="flex gap-2"
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
          className="flex-1"
        />
        <Button type="submit" disabled={loading || !input.trim()}>
          {loading ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
        </Button>
      </form>

      <p className="text-xs text-gray-400 mt-3 text-center">
        Powered by gpt-4o-mini · resultados do catálogo salvo no banco
      </p>
    </div>
  )
}
