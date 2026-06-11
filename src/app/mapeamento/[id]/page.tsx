'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import type { LancamentoAI, AnaliseIA } from '@/lib/types'

const STATUS_EM_PROGRESSO = ['extraindo', 'analisando', 'processando']

const STATUS_LABEL: Record<string, string> = {
  extraindo: 'Extraindo texto do PDF...',
  analisando: 'Analisando estrutura do documento...',
  processando: 'Extraindo dados com IA (gpt-4.1)...',
}

export default function MapeamentoPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [status, setStatus] = useState('')
  const [erro, setErro] = useState('')
  const [analise, setAnalise] = useState<AnaliseIA | null>(null)
  const [lancamentos, setLancamentos] = useState<LancamentoAI[]>([])

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch(`/api/processamentos/${id}`)
        const data = await res.json()
        setStatus(data.status)
        setErro(data.erro || '')
        if (data.analise_ia) setAnalise(data.analise_ia as AnaliseIA)
        if (data.lancamentos_ai?.lancamentos) {
          setLancamentos(data.lancamentos_ai.lancamentos as LancamentoAI[])
        }
      } catch {
        toast.error('Erro ao carregar processamento')
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [id])

  // Poll enquanto em progresso
  useEffect(() => {
    if (!STATUS_EM_PROGRESSO.includes(status)) return
    const interval = setInterval(async () => {
      const res = await fetch(`/api/processamentos/${id}`)
      const data = await res.json()
      setStatus(data.status)
      if (data.analise_ia) setAnalise(data.analise_ia as AnaliseIA)
      if (data.lancamentos_ai?.lancamentos) {
        setLancamentos(data.lancamentos_ai.lancamentos as LancamentoAI[])
        clearInterval(interval)
      }
      if (data.status === 'erro') {
        setErro(data.erro || 'Erro desconhecido')
        clearInterval(interval)
      }
    }, 3000)
    return () => clearInterval(interval)
  }, [id, status])

  const handleProcess = useCallback(async () => {
    setProcessing(true)
    setStatus('extraindo')
    try {
      const res = await fetch('/api/processar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ processamentoId: id }),
      })
      const data = await res.json()
      if (res.ok) {
        setAnalise(data.analise)
        setLancamentos(data.lancamentos)
        setStatus('aguardando_confirmacao')
        toast.success(`${data.lancamentos.length} tipologias extraídas pela IA.`)
      } else {
        setStatus('erro')
        setErro(data.error || 'Erro ao processar')
        toast.error(data.error || 'Erro ao processar')
      }
    } catch {
      setStatus('erro')
      toast.error('Erro de conexão')
    } finally {
      setProcessing(false)
    }
  }, [id])

  const handleConfirm = useCallback(async () => {
    setConfirming(true)
    try {
      const res = await fetch('/api/confirmar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ processamentoId: id, lancamentos }),
      })
      const result = await res.json()
      if (res.ok) {
        toast.success(`${result.inseridos} lançamentos salvos no banco!`)
        router.push(`/preview/${id}`)
      } else {
        toast.error(result.error || 'Erro ao confirmar')
      }
    } catch {
      toast.error('Erro de conexão')
    } finally {
      setConfirming(false)
    }
  }, [id, lancamentos, router])

  const updateLancamento = useCallback((index: number, field: keyof LancamentoAI, value: unknown) => {
    setLancamentos(prev => prev.map((l, i) => i === index ? { ...l, [field]: value } : l))
  }, [])

  if (loading) {
    return <div className="flex items-center justify-center min-h-[50vh]"><p className="text-gray-500">Carregando...</p></div>
  }

  return (
    <div className="max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Revisão de Lançamentos</h1>

      {status === 'pendente' && (
        <Card className="mb-6">
          <CardContent className="py-10 text-center">
            <p className="text-gray-600 mb-4">PDF enviado. Clique para processar com IA.</p>
            <Button onClick={handleProcess} disabled={processing} size="lg">
              {processing ? 'Iniciando...' : 'Processar com IA'}
            </Button>
          </CardContent>
        </Card>
      )}

      {STATUS_EM_PROGRESSO.includes(status) && (
        <Card className="mb-6">
          <CardContent className="py-10 text-center">
            <div className="animate-pulse">
              <p className="text-lg font-medium text-gray-700">{STATUS_LABEL[status] ?? 'Processando...'}</p>
              <p className="text-sm text-gray-400 mt-2">Isso pode levar até 1 minuto para PDFs grandes</p>
            </div>
          </CardContent>
        </Card>
      )}

      {status === 'erro' && (
        <Card className="mb-6 border-red-200 bg-red-50">
          <CardContent className="py-6 text-center">
            <p className="text-red-700 font-medium mb-4">{erro}</p>
            <Button onClick={handleProcess} variant="outline">Tentar novamente</Button>
          </CardContent>
        </Card>
      )}

      {status === 'aguardando_confirmacao' && (
        <>
          {analise && (
            <div className="flex items-center gap-3 mb-4">
              <Badge variant={analise.tipo === 'multi' ? 'secondary' : 'default'}>
                {analise.tipo === 'multi' ? 'Multi-empreendimento' : 'Empreendimento único'}
              </Badge>
              <span className="text-sm text-gray-500">{analise.construtora}</span>
              <span className="text-sm text-gray-400">•</span>
              <span className="text-sm text-gray-500">
                {lancamentos.length} linhas extraídas
                {analise.tipo === 'multi' && analise.empreendimentos_identificados?.length
                  ? ` · ~${analise.empreendimentos_identificados.length} empreendimentos no PDF`
                  : ''}
              </span>
            </div>
          )}

          {analise?.tipo === 'multi'
            && (analise.empreendimentos_identificados?.length ?? 0) > lancamentos.length + 5 && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
              A análise identificou mais empreendimentos do que linhas extraídas. Revise a tabela e complemente manualmente o que faltar antes de salvar.
            </p>
          )}

          <div className="flex justify-between items-center mb-4">
            <p className="text-sm text-gray-500">
              Revise os dados abaixo. Você pode editar qualquer campo antes de salvar.
            </p>
            <Button onClick={handleConfirm} disabled={confirming} size="lg">
              {confirming ? 'Salvando...' : `Confirmar e Salvar ${lancamentos.length} lançamentos`}
            </Button>
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-gray-50">
                      <th className="text-left p-2 font-medium text-gray-500 whitespace-nowrap">#</th>
                      <th className="text-left p-2 font-medium text-gray-500 whitespace-nowrap">Construtora</th>
                      <th className="text-left p-2 font-medium text-gray-500 whitespace-nowrap">Empreendimento</th>
                      <th className="text-left p-2 font-medium text-gray-500 whitespace-nowrap">Bairro</th>
                      <th className="text-left p-2 font-medium text-gray-500 whitespace-nowrap">Entrega</th>
                      <th className="text-left p-2 font-medium text-gray-500 whitespace-nowrap">Tipologia</th>
                      <th className="text-left p-2 font-medium text-gray-500 whitespace-nowrap">Unidade</th>
                      <th className="text-left p-2 font-medium text-gray-500 whitespace-nowrap">Andar</th>
                      <th className="text-left p-2 font-medium text-gray-500 whitespace-nowrap">Metragem</th>
                      <th className="text-left p-2 font-medium text-gray-500 whitespace-nowrap">Vagas</th>
                      <th className="text-left p-2 font-medium text-gray-500 whitespace-nowrap">Valor Mín.</th>
                      <th className="text-left p-2 font-medium text-gray-500 whitespace-nowrap">Valor Máx.</th>
                      <th className="text-left p-2 font-medium text-gray-500 whitespace-nowrap">Desconto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lancamentos.map((l, i) => (
                      <tr key={i} className="border-b hover:bg-gray-50">
                        <td className="p-2 text-gray-400">{i + 1}</td>
                        {(['construtora', 'empreendimento', 'bairro', 'data_entrega', 'tipologia', 'unidade', 'andar', 'metragem', 'vagas'] as const).map(field => (
                          <td key={field} className="p-2">
                            <input
                              type="text"
                              value={(l[field] as string) ?? ''}
                              onChange={e => updateLancamento(i, field, e.target.value)}
                              className="w-full min-w-[80px] max-w-[180px] text-xs border-0 bg-transparent hover:bg-gray-100 focus:bg-white focus:border focus:border-gray-300 rounded px-1 py-0.5 outline-none"
                            />
                          </td>
                        ))}
                        <td className="p-2">
                          <input
                            type="number"
                            value={l.valor_minimo ?? ''}
                            onChange={e => updateLancamento(i, 'valor_minimo', e.target.value ? Number(e.target.value) : null)}
                            className="w-24 text-xs border-0 bg-transparent hover:bg-gray-100 focus:bg-white focus:border focus:border-gray-300 rounded px-1 py-0.5 outline-none"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="number"
                            value={l.valor_maximo ?? ''}
                            onChange={e => updateLancamento(i, 'valor_maximo', e.target.value ? Number(e.target.value) : null)}
                            className="w-24 text-xs border-0 bg-transparent hover:bg-gray-100 focus:bg-white focus:border focus:border-gray-300 rounded px-1 py-0.5 outline-none"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="text"
                            value={(l.desconto_margem as string) ?? ''}
                            onChange={e => updateLancamento(i, 'desconto_margem', e.target.value)}
                            className="w-20 text-xs border-0 bg-transparent hover:bg-gray-100 focus:bg-white focus:border focus:border-gray-300 rounded px-1 py-0.5 outline-none"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
