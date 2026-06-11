'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Undo2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import type { LancamentoAI, AnaliseIA } from '@/lib/types'
import {
  FIELD_CELL_CLASS,
  formatarCampo,
  normalizarLancamentos,
} from '@/lib/formatar-lancamento'
import { cn } from '@/lib/utils'

const STATUS_EM_PROGRESSO = ['extraindo', 'analisando', 'processando']

const STATUS_LABEL: Record<string, string> = {
  extraindo: 'Extraindo texto do PDF...',
  analisando: 'Analisando estrutura do documento...',
  processando: 'Extraindo dados com IA (gpt-4.1)...',
}

type EditableField =
  | 'construtora' | 'empreendimento' | 'bairro' | 'data_entrega' | 'tipologia'
  | 'unidade' | 'andar' | 'metragem' | 'vagas' | 'desconto_margem'
  | 'valor_minimo' | 'valor_maximo'

const FIELD_LABELS: Record<EditableField, string> = {
  construtora: 'Construtora',
  empreendimento: 'Empreendimento',
  bairro: 'Bairro',
  data_entrega: 'Entrega',
  tipologia: 'Tipologia',
  unidade: 'Unidade',
  andar: 'Andar',
  metragem: 'Metragem',
  vagas: 'Vagas',
  valor_minimo: 'Valor Mín.',
  valor_maximo: 'Valor Máx.',
  desconto_margem: 'Desconto',
}

type SelectedCell = { row: number; field: EditableField }

const inputClass = (selected: boolean, field?: EditableField) =>
  cn(
    'w-full text-xs border-0 rounded px-1 py-0.5 outline-none',
    FIELD_CELL_CLASS[field as keyof typeof FIELD_CELL_CLASS] ?? 'min-w-[80px] max-w-[180px]',
    selected
      ? 'bg-blue-50 ring-2 ring-blue-400 ring-inset'
      : 'bg-transparent hover:bg-gray-100 focus:bg-white focus:border focus:border-gray-300'
  )

const numberInputClass = (selected: boolean, field?: 'valor_minimo' | 'valor_maximo') =>
  cn(
    'w-24 text-xs border-0 rounded px-1 py-0.5 outline-none',
    field ? FIELD_CELL_CLASS[field] : undefined,
    selected
      ? 'bg-blue-50 ring-2 ring-blue-400 ring-inset'
      : 'bg-transparent hover:bg-gray-100 focus:bg-white focus:border focus:border-gray-300'
  )

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
  const [selectedCell, setSelectedCell] = useState<SelectedCell | null>(null)
  const [undoStack, setUndoStack] = useState<LancamentoAI[][]>([])
  const undoStackRef = useRef(undoStack)
  undoStackRef.current = undoStack

  const snapshotLancamentos = (items: LancamentoAI[]) =>
    items.map(l => ({ ...l }))

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch(`/api/processamentos/${id}`)
        const data = await res.json()
        setStatus(data.status)
        setErro(data.erro || '')
        if (data.analise_ia) setAnalise(data.analise_ia as AnaliseIA)
        if (data.lancamentos_ai?.lancamentos) {
          setLancamentos(normalizarLancamentos(data.lancamentos_ai.lancamentos as LancamentoAI[]))
          setUndoStack([])
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
        setLancamentos(normalizarLancamentos(data.lancamentos_ai.lancamentos as LancamentoAI[]))
        setUndoStack([])
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
        setLancamentos(normalizarLancamentos(data.lancamentos))
        setUndoStack([])
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

  const blurCampo = useCallback((index: number, field: EditableField) => {
    setLancamentos(prev => prev.map((l, i) => {
      if (i !== index) return l
      const formatted = formatarCampo(field, l[field])
      if (formatted === l[field]) return l
      return { ...l, [field]: formatted }
    }))
  }, [])

  const selectCell = useCallback((row: number, field: EditableField) => {
    setSelectedCell({ row, field })
  }, [])

  const padronizarTabela = useCallback(() => {
    setUndoStack(prev => [...prev, snapshotLancamentos(lancamentos)])
    setLancamentos(prev => normalizarLancamentos(prev))
    toast.success('Formatação da tabela padronizada')
  }, [lancamentos])

  const desfazer = useCallback(() => {
    setUndoStack(prev => {
      if (prev.length === 0) return prev
      const next = [...prev]
      const snapshot = next.pop()!
      setLancamentos(snapshot)
      toast.success('Alteração desfeita')
      return next
    })
  }, [])

  const aplicarParaColuna = useCallback(() => {
    if (!selectedCell) {
      toast.error('Selecione uma célula antes de aplicar')
      return
    }
    const { row, field } = selectedCell
    const valor = formatarCampo(field, lancamentos[row]?.[field])
    setUndoStack(prev => [...prev, snapshotLancamentos(lancamentos)])
    setLancamentos(prev => prev.map(l => ({ ...l, [field]: valor })))
    toast.success(`"${FIELD_LABELS[field]}" aplicado em ${lancamentos.length} linhas`)
  }, [selectedCell, lancamentos])

  useEffect(() => {
    if (status !== 'aguardando_confirmacao') return

    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key !== 'z' || e.shiftKey) return
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (undoStackRef.current.length === 0) return
      e.preventDefault()
      desfazer()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [status, desfazer])

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

          <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm text-gray-500">
                Revise os dados abaixo. Você pode editar qualquer campo antes de salvar.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={aplicarParaColuna}
                disabled={!selectedCell}
                title={selectedCell
                  ? `Aplicar o valor da linha ${selectedCell.row + 1} (${FIELD_LABELS[selectedCell.field]}) em todas as linhas`
                  : 'Clique em uma célula e depois aplique para toda a coluna'}
              >
                Aplicar para toda a coluna
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={padronizarTabela}
                title="Padroniza andar, metragem, tipologia e entrega em todas as linhas"
              >
                Padronizar formatação
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={desfazer}
                disabled={undoStack.length === 0}
                title="Desfazer última aplicação em coluna (Ctrl+Z)"
              >
                <Undo2 className="size-3.5" />
                Desfazer
              </Button>
              {selectedCell && (
                <span className="text-xs text-blue-600">
                  Selecionado: linha {selectedCell.row + 1}, {FIELD_LABELS[selectedCell.field]}
                </span>
              )}
            </div>
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
                              title={(l[field] as string) ?? undefined}
                              onChange={e => updateLancamento(i, field, e.target.value)}
                              onFocus={() => selectCell(i, field)}
                              onBlur={() => blurCampo(i, field)}
                              className={inputClass(selectedCell?.row === i && selectedCell?.field === field, field)}
                            />
                          </td>
                        ))}
                        <td className="p-2">
                          <input
                            type="number"
                            value={l.valor_minimo ?? ''}
                            onChange={e => updateLancamento(i, 'valor_minimo', e.target.value ? Number(e.target.value) : null)}
                            onFocus={() => selectCell(i, 'valor_minimo')}
                            className={numberInputClass(selectedCell?.row === i && selectedCell?.field === 'valor_minimo', 'valor_minimo')}
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="number"
                            value={l.valor_maximo ?? ''}
                            onChange={e => updateLancamento(i, 'valor_maximo', e.target.value ? Number(e.target.value) : null)}
                            onFocus={() => selectCell(i, 'valor_maximo')}
                            className={numberInputClass(selectedCell?.row === i && selectedCell?.field === 'valor_maximo', 'valor_maximo')}
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="text"
                            value={(l.desconto_margem as string) ?? ''}
                            onChange={e => updateLancamento(i, 'desconto_margem', e.target.value)}
                            onFocus={() => selectCell(i, 'desconto_margem')}
                            onBlur={() => blurCampo(i, 'desconto_margem')}
                            className={inputClass(selectedCell?.row === i && selectedCell?.field === 'desconto_margem', 'desconto_margem')}
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
