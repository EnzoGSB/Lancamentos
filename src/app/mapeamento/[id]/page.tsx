'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Trash2, Undo2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { toast } from 'sonner'
import type { LancamentoAI, AnaliseIA } from '@/lib/types'
import {
  FIELD_CELL_CLASS,
  formatarCampo,
  metragemParaEdicao,
  normalizarLancamentos,
  sanitizarMetragemInput,
} from '@/lib/formatar-lancamento'
import { cn } from '@/lib/utils'
import { posicaoNaFila } from '@/lib/fila-processamento'
import { EVENTO_FILA_ATUALIZADA, solicitarProcessamento } from '@/lib/processamento-fila-worker'

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

const TEXT_FIELDS = [
  'construtora', 'empreendimento', 'bairro', 'data_entrega', 'tipologia',
  'unidade', 'andar', 'metragem', 'vagas',
] as const

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

const EDITABLE_FIELDS: EditableField[] = [
  ...TEXT_FIELDS,
  'valor_minimo',
  'valor_maximo',
  'desconto_margem',
]

const DRAG_THRESHOLD_PX = 4

type CellCoord = { row: number; field: EditableField }
type RangeSelection = { anchor: CellCoord; focus: CellCoord }
type ValorOriginalCelula = { row: number; field: EditableField; valor: string }
type DragState = {
  anchor: CellCoord
  pointerX: number
  pointerY: number
  didDrag: boolean
}

function fieldIndex(field: EditableField): number {
  return EDITABLE_FIELDS.indexOf(field)
}

function normalizeRange(sel: RangeSelection) {
  const anchorCol = fieldIndex(sel.anchor.field)
  const focusCol = fieldIndex(sel.focus.field)
  return {
    minRow: Math.min(sel.anchor.row, sel.focus.row),
    maxRow: Math.max(sel.anchor.row, sel.focus.row),
    minCol: Math.min(anchorCol, focusCol),
    maxCol: Math.max(anchorCol, focusCol),
  }
}

function isCellInRange(row: number, field: EditableField, sel: RangeSelection | null): boolean {
  if (!sel) return false
  const bounds = normalizeRange(sel)
  const col = fieldIndex(field)
  return row >= bounds.minRow
    && row <= bounds.maxRow
    && col >= bounds.minCol
    && col <= bounds.maxCol
}

function countCellsInColumn(sel: RangeSelection | null, field: EditableField): number {
  if (!sel) return 0
  const bounds = normalizeRange(sel)
  const col = fieldIndex(field)
  if (col < bounds.minCol || col > bounds.maxCol) return 0
  return bounds.maxRow - bounds.minRow + 1
}

function linhasNaColunaDoIntervalo(sel: RangeSelection, field: EditableField): Set<number> | null {
  const bounds = normalizeRange(sel)
  const col = fieldIndex(field)
  if (col < bounds.minCol || col > bounds.maxCol) return null
  return linhasNoIntervalo(bounds.minRow, bounds.maxRow)
}

function valorParaComparacao(field: EditableField, v: unknown): string {
  if (v == null || v === '') return ''
  if (field === 'valor_minimo' || field === 'valor_maximo') {
    const n = Number(v)
    return Number.isFinite(n) ? String(n) : ''
  }
  return String(v).trim()
}

function linhasNoIntervalo(a: number, b: number): Set<number> {
  const lo = Math.min(a, b)
  const hi = Math.max(a, b)
  const rows = new Set<number>()
  for (let r = lo; r <= hi; r++) rows.add(r)
  return rows
}

function inputClass(selected: boolean, field?: EditableField) {
  return cn(
    'w-full min-w-0 text-xs border-0 rounded px-0.5 py-0.5 outline-none',
    FIELD_CELL_CLASS[field as keyof typeof FIELD_CELL_CLASS],
    selected
      ? 'bg-blue-50 ring-2 ring-blue-400 ring-inset'
      : 'bg-transparent hover:bg-gray-100 focus:bg-white focus:border focus:border-gray-300'
  )
}

function numberInputClass(selected: boolean, field?: 'valor_minimo' | 'valor_maximo') {
  return cn(
    'w-full min-w-0 text-xs border-0 rounded px-0.5 py-0.5 outline-none',
    field ? FIELD_CELL_CLASS[field] : undefined,
    selected
      ? 'bg-blue-50 ring-2 ring-blue-400 ring-inset'
      : 'bg-transparent hover:bg-gray-100 focus:bg-white focus:border focus:border-gray-300'
  )
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
  const [posicaoFila, setPosicaoFila] = useState<number | null>(null)
  const [selectedCell, setSelectedCell] = useState<CellCoord | null>(null)
  const [rangeSelection, setRangeSelection] = useState<RangeSelection | null>(null)
  const [selectedRows, setSelectedRows] = useState<Set<number>>(() => new Set())
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [isDraggingCells, setIsDraggingCells] = useState(false)
  const [undoStack, setUndoStack] = useState<LancamentoAI[][]>([])

  const undoStackRef = useRef(undoStack)
  undoStackRef.current = undoStack
  const valorOriginalCelulaRef = useRef<ValorOriginalCelula | null>(null)
  const lastRowClickRef = useRef<number | null>(null)
  const dragStateRef = useRef<DragState | null>(null)

  const snapshotLancamentos = (items: LancamentoAI[]) =>
    items.map(l => ({ ...l }))

  const limparSelecoes = useCallback(() => {
    setSelectedCell(null)
    setRangeSelection(null)
    setSelectedRows(new Set())
    valorOriginalCelulaRef.current = null
  }, [])

  const isCellHighlighted = useCallback((row: number, field: EditableField) => {
    return isCellInRange(row, field, rangeSelection)
  }, [rangeSelection])

  const definirSelecao = useCallback((
    row: number,
    field: EditableField,
    opts?: { shift?: boolean; anchor?: CellCoord }
  ) => {
    setSelectedCell({ row, field })
    setRangeSelection(prev => {
      if (opts?.shift) {
        const anchor = opts.anchor ?? prev?.anchor ?? { row, field }
        return { anchor, focus: { row, field } }
      }
      return { anchor: { row, field }, focus: { row, field } }
    })
  }, [])

  const iniciarArraste = useCallback((
    row: number,
    field: EditableField,
    e: React.PointerEvent<HTMLTableCellElement>
  ) => {
    if (e.button !== 0) return

    const anchor = e.shiftKey
      ? (rangeSelection?.anchor ?? selectedCell ?? { row, field })
      : { row, field }

    dragStateRef.current = {
      anchor,
      pointerX: e.clientX,
      pointerY: e.clientY,
      didDrag: false,
    }
    setIsDraggingCells(true)
    setSelectedCell({ row, field })
    setRangeSelection({ anchor, focus: { row, field } })
  }, [rangeSelection, selectedCell])

  const estenderArraste = useCallback((
    row: number,
    field: EditableField,
    clientX?: number,
    clientY?: number
  ) => {
    const drag = dragStateRef.current
    if (!drag) return

    const x = clientX ?? drag.pointerX
    const y = clientY ?? drag.pointerY
    const dist = Math.hypot(x - drag.pointerX, y - drag.pointerY)
    const saiuDaOrigem = row !== drag.anchor.row || field !== drag.anchor.field
    if (!drag.didDrag && dist < DRAG_THRESHOLD_PX && saiuDaOrigem) return

    if (!drag.didDrag) {
      drag.didDrag = true
      if (document.activeElement instanceof HTMLInputElement) {
        document.activeElement.blur()
      }
    }

    setRangeSelection({ anchor: drag.anchor, focus: { row, field } })
    setSelectedCell({ row, field })
  }, [])

  const finalizarArraste = useCallback((e: React.PointerEvent<HTMLTableCellElement>) => {
    const didDrag = dragStateRef.current?.didDrag
    dragStateRef.current = null
    setIsDraggingCells(false)
    if (!didDrag) {
      e.currentTarget.querySelector('input')?.focus()
    }
  }, [])

  useEffect(() => {
    if (!isDraggingCells) return

    const onPointerMove = (e: PointerEvent) => {
      const drag = dragStateRef.current
      if (!drag || drag.didDrag) return
      const dist = Math.hypot(e.clientX - drag.pointerX, e.clientY - drag.pointerY)
      if (dist >= DRAG_THRESHOLD_PX) {
        drag.didDrag = true
        if (document.activeElement instanceof HTMLInputElement) {
          document.activeElement.blur()
        }
      }
    }

    const onPointerUp = () => {
      dragStateRef.current = null
      setIsDraggingCells(false)
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
    }
  }, [isDraggingCells])

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
          limparSelecoes()
        }
      } catch {
        toast.error('Erro ao carregar processamento')
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [id, limparSelecoes])

  useEffect(() => {
    if (!['pendente', ...STATUS_EM_PROGRESSO].includes(status)) return

    const poll = async () => {
      try {
        const [resSelf, resAll] = await Promise.all([
          fetch(`/api/processamentos/${id}`),
          status === 'pendente' ? fetch('/api/processamentos') : Promise.resolve(null),
        ])
        const data = await resSelf.json()
        setStatus(data.status)
        setErro(data.erro || '')
        if (data.analise_ia) setAnalise(data.analise_ia as AnaliseIA)
        if (data.lancamentos_ai?.lancamentos) {
          setLancamentos(normalizarLancamentos(data.lancamentos_ai.lancamentos as LancamentoAI[]))
          setUndoStack([])
          limparSelecoes()
        }

        if (status === 'pendente' && resAll) {
          const all = await resAll.json()
          if (Array.isArray(all)) {
            setPosicaoFila(posicaoNaFila(id, all))
          }
        }
      } catch {
        // silencioso
      }
    }

    void poll()
    const interval = setInterval(poll, 3000)
    return () => clearInterval(interval)
  }, [id, status, limparSelecoes])

  const handleRetry = useCallback(async () => {
    setProcessing(true)
    setErro('')
    try {
      const result = await solicitarProcessamento(id)
      if (!result.ok) {
        toast.error(result.error || 'Erro ao reenfileirar')
        return
      }
      setStatus('pendente')
      window.dispatchEvent(new CustomEvent(EVENTO_FILA_ATUALIZADA))
      toast.message('PDF reenfileirado — aguarde o processamento anterior terminar.')
    } catch {
      toast.error('Erro de conexão')
    } finally {
      setProcessing(false)
    }
  }, [id])

  const handleConfirm = useCallback(async () => {
    if (lancamentos.length === 0) {
      toast.error('Adicione pelo menos um lançamento antes de salvar')
      return
    }
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
    const next = field === 'metragem' && typeof value === 'string'
      ? sanitizarMetragemInput(value)
      : value
    setLancamentos(prev => prev.map((l, i) => i === index ? { ...l, [field]: next } : l))
  }, [])

  const blurCampo = useCallback((index: number, field: EditableField) => {
    setLancamentos(prev => prev.map((l, i) => {
      if (i !== index) return l
      const formatted = formatarCampo(field, l[field])
      if (formatted === l[field]) return l
      return { ...l, [field]: formatted }
    }))
  }, [])

  const registrarFocusCelula = useCallback((
    row: number,
    field: EditableField,
    valor: unknown,
    e?: React.FocusEvent<HTMLInputElement>
  ) => {
    const mod = e?.nativeEvent as unknown as { shiftKey?: boolean }
    const shift = !!mod?.shiftKey
    const anchor = shift ? (rangeSelection?.anchor ?? selectedCell ?? undefined) : undefined
    definirSelecao(row, field, { shift, anchor })
    valorOriginalCelulaRef.current = { row, field, valor: valorParaComparacao(field, valor) }
  }, [definirSelecao, rangeSelection, selectedCell])

  const toggleLinhaSelecionada = useCallback((row: number, shift: boolean) => {
    setSelectedRows(prev => {
      const next = new Set(prev)
      if (shift && lastRowClickRef.current != null) {
        for (const r of linhasNoIntervalo(lastRowClickRef.current, row)) next.add(r)
      } else if (next.has(row)) {
        next.delete(row)
      } else {
        next.add(row)
      }
      return next
    })
    lastRowClickRef.current = row
  }, [])

  const toggleTodasLinhas = useCallback(() => {
    setSelectedRows(prev => {
      if (prev.size === lancamentos.length) return new Set()
      return new Set(lancamentos.map((_, i) => i))
    })
  }, [lancamentos.length])

  const desfazer = useCallback(() => {
    setUndoStack(prev => {
      if (prev.length === 0) return prev
      const next = [...prev]
      const snapshot = next.pop()!
      setLancamentos(snapshot)
      limparSelecoes()
      toast.success('Alteração desfeita')
      return next
    })
  }, [limparSelecoes])

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

  const aplicarParaSemelhantes = useCallback(() => {
    if (!selectedCell) {
      toast.error('Selecione uma célula antes de aplicar')
      return
    }
    const { row, field } = selectedCell
    const origem = valorOriginalCelulaRef.current
    if (!origem || origem.row !== row || origem.field !== field) {
      toast.error('Clique na célula editada antes de aplicar aos semelhantes')
      return
    }

    const valorNovo = formatarCampo(field, lancamentos[row]?.[field])
    const valorAntigo = origem.valor
    const limitarSelecao = rangeSelection
      ? linhasNaColunaDoIntervalo(rangeSelection, field)
      : null
    let alteradas = 0

    setUndoStack(prev => [...prev, snapshotLancamentos(lancamentos)])
    setLancamentos(prev => prev.map((l, idx) => {
      if (limitarSelecao && !limitarSelecao.has(idx)) return l
      if (valorParaComparacao(field, l[field]) !== valorAntigo) return l
      alteradas++
      return { ...l, [field]: valorNovo }
    }))

    if (alteradas === 0) {
      toast.error('Nenhuma linha com o valor original encontrada')
      setUndoStack(prev => prev.slice(0, -1))
      return
    }

    toast.success(
      `"${FIELD_LABELS[field]}" aplicado em ${alteradas} linha${alteradas !== 1 ? 's' : ''} com "${valorAntigo || '—'}"`
    )
  }, [selectedCell, lancamentos, rangeSelection])

  const aplicarASelecao = useCallback(() => {
    if (!selectedCell) {
      toast.error('Selecione uma célula antes de aplicar')
      return
    }
    const { row, field } = selectedCell
    const linhasIntervalo = rangeSelection
      ? linhasNaColunaDoIntervalo(rangeSelection, field)
      : null
    const rows = linhasIntervalo && linhasIntervalo.size > 1
      ? linhasIntervalo
      : new Set([row])

    const valor = formatarCampo(field, lancamentos[row]?.[field])
    setUndoStack(prev => [...prev, snapshotLancamentos(lancamentos)])
    setLancamentos(prev => prev.map((l, idx) =>
      rows.has(idx) ? { ...l, [field]: valor } : l
    ))
    toast.success(`"${FIELD_LABELS[field]}" aplicado em ${rows.size} célula${rows.size !== 1 ? 's' : ''}`)
  }, [selectedCell, rangeSelection, lancamentos])

  const apagarLinhasSelecionadas = useCallback(() => {
    if (selectedRows.size === 0) {
      toast.error('Selecione pelo menos uma linha para apagar')
      return
    }
    if (lancamentos.length - selectedRows.size < 1) {
      toast.error('Deixe pelo menos um imóvel na tabela')
      return
    }

    setUndoStack(prev => [...prev, snapshotLancamentos(lancamentos)])
    setLancamentos(prev => prev.filter((_, i) => !selectedRows.has(i)))
    limparSelecoes()
    setDeleteConfirmOpen(false)
    toast.success(`${selectedRows.size} linha${selectedRows.size !== 1 ? 's' : ''} removida${selectedRows.size !== 1 ? 's' : ''}`)
  }, [selectedRows, lancamentos, limparSelecoes])

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

  const celulasSelecionadas = selectedCell
    ? countCellsInColumn(rangeSelection, selectedCell.field)
    : 0

  const celulaProps = (row: number, field: EditableField) => ({
    onPointerDown: (e: React.PointerEvent<HTMLTableCellElement>) => iniciarArraste(row, field, e),
    onPointerEnter: (e: React.PointerEvent<HTMLTableCellElement>) => {
      if (isDraggingCells) estenderArraste(row, field, e.clientX, e.clientY)
    },
    onPointerUp: finalizarArraste,
  })

  const renderCelula = (row: number, field: EditableField, l: LancamentoAI) => {
    const highlighted = isCellHighlighted(row, field)
    return (
      <td
        key={field}
        className={cn(
          'p-1 align-top select-none touch-none',
          highlighted && 'bg-blue-50/80'
        )}
        {...celulaProps(row, field)}
      >
        <input
          type="text"
          inputMode={field === 'metragem' ? 'decimal' : undefined}
          value={field === 'metragem'
            ? metragemParaEdicao(l[field] as string)
            : ((l[field] as string) ?? '')}
          title={(l[field] as string) ?? undefined}
          onChange={e => updateLancamento(row, field, e.target.value)}
          onFocus={e => {
            registrarFocusCelula(row, field, l[field], e)
            if (field === 'metragem' && l.metragem) {
              const num = metragemParaEdicao(l.metragem)
              if (num !== l.metragem) updateLancamento(row, 'metragem', num)
            }
          }}
          onBlur={() => blurCampo(row, field)}
          className={inputClass(highlighted, field)}
        />
      </td>
    )
  }

  if (loading) {
    return <div className="flex items-center justify-center min-h-[50vh]"><p className="text-gray-500">Carregando...</p></div>
  }

  return (
    <div className="w-full max-w-6xl mx-auto">
      <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">Revisão de Lançamentos</h1>

      {status === 'pendente' && (
        <Card className="mb-6">
          <CardContent className="py-10 text-center">
            <p className="text-lg font-medium text-gray-700">PDF na fila de processamento</p>
            <p className="text-sm text-gray-500 mt-2">
              {posicaoFila != null && posicaoFila > 1
                ? `Posição ${posicaoFila} na fila — aguardando o PDF anterior terminar.`
                : 'Aguardando slot livre — o processamento inicia automaticamente.'}
            </p>
            <p className="text-xs text-gray-400 mt-3">
              Apenas um PDF é processado por vez. Acompanhe a fila no Dashboard.
            </p>
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
            <Button onClick={handleRetry} variant="outline" disabled={processing}>
              {processing ? 'Reenfileirando...' : 'Tentar novamente'}
            </Button>
          </CardContent>
        </Card>
      )}

      {status === 'aguardando_confirmacao' && (
        <>
          {analise && (
            <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-4">
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

          <div className="flex flex-col-reverse sm:flex-row sm:flex-wrap sm:justify-between items-stretch sm:items-center gap-3 mb-4">
            <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-2 sm:gap-3">
              <p className="text-sm text-gray-500">
                Arraste para selecionar várias células. Shift+clique estende a seleção.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={aplicarParaColuna}
                  disabled={!selectedCell}
                  className="flex-1 sm:flex-none touch-manipulation"
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
                  onClick={aplicarParaSemelhantes}
                  disabled={!selectedCell}
                  className="flex-1 sm:flex-none touch-manipulation"
                  title={selectedCell
                    ? `Aplicar o valor editado só nas linhas com o mesmo valor original (${FIELD_LABELS[selectedCell.field]})`
                    : 'Edite uma célula e aplique só nas linhas com o mesmo valor anterior'}
                >
                  Aplicar aos semelhantes
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={aplicarASelecao}
                  disabled={!selectedCell || celulasSelecionadas < 2}
                  className="flex-1 sm:flex-none touch-manipulation"
                  title="Copia o valor da célula focada para as células selecionadas na mesma coluna"
                >
                  Aplicar à seleção{celulasSelecionadas > 1 ? ` (${celulasSelecionadas})` : ''}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setDeleteConfirmOpen(true)}
                  disabled={selectedRows.size === 0}
                  className="flex-1 sm:flex-none touch-manipulation text-red-700 hover:text-red-800"
                >
                  <Trash2 className="size-3.5 mr-1" />
                  Apagar{selectedRows.size > 0 ? ` (${selectedRows.size})` : ''}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={desfazer}
                  disabled={undoStack.length === 0}
                  className="touch-manipulation"
                  title="Desfazer última alteração (Ctrl+Z)"
                >
                  <Undo2 className="size-3.5" />
                  Desfazer
                </Button>
              </div>
              {selectedCell && (
                <span className="text-xs text-blue-600">
                  Foco: linha {selectedCell.row + 1}, {FIELD_LABELS[selectedCell.field]}
                  {celulasSelecionadas > 1 ? ` · ${celulasSelecionadas} células selecionadas` : ''}
                  {selectedRows.size > 0 ? ` · ${selectedRows.size} linha${selectedRows.size !== 1 ? 's' : ''} marcada${selectedRows.size !== 1 ? 's' : ''} para apagar` : ''}
                </span>
              )}
            </div>
            <Button
              onClick={handleConfirm}
              disabled={confirming || lancamentos.length === 0}
              size="lg"
              className="w-full sm:w-auto touch-manipulation shrink-0"
            >
              {confirming ? 'Salvando...' : `Confirmar e Salvar ${lancamentos.length} lançamentos`}
            </Button>
          </div>

          <ConfirmDialog
            open={deleteConfirmOpen}
            onOpenChange={setDeleteConfirmOpen}
            title="Apagar linhas selecionadas?"
            description={`${selectedRows.size} imóvel${selectedRows.size !== 1 ? 'is' : ''} será${selectedRows.size !== 1 ? 'ão' : ''} removido${selectedRows.size !== 1 ? 's' : ''} da revisão. Você pode desfazer antes de salvar no banco.`}
            confirmLabel="Apagar"
            variant="destructive"
            onConfirm={apagarLinhasSelecionadas}
          />

          <Card>
            <CardContent className="p-0">
              <p className="md:hidden text-xs text-gray-400 px-3 py-2 border-b bg-gray-50">
                Deslize horizontalmente para ver todas as colunas
              </p>
              <div className="md:p-1 max-md:overflow-x-auto max-md:overscroll-x-contain">
                <table className="w-full table-fixed text-xs max-md:min-w-[1150px]">
                  <colgroup>
                    <col style={{ width: '3%' }} />
                    <col style={{ width: '3%' }} />
                    <col style={{ width: '8%' }} />
                    <col style={{ width: '12%' }} />
                    <col style={{ width: '9%' }} />
                    <col style={{ width: '6%' }} />
                    <col style={{ width: '11%' }} />
                    <col style={{ width: '5%' }} />
                    <col style={{ width: '5%' }} />
                    <col style={{ width: '6%' }} />
                    <col style={{ width: '5%' }} />
                    <col style={{ width: '9%' }} />
                    <col style={{ width: '9%' }} />
                    <col style={{ width: '6%' }} />
                  </colgroup>
                  <thead>
                    <tr className="border-b bg-gray-50">
                      <th className="p-1 text-center">
                        <input
                          type="checkbox"
                          checked={lancamentos.length > 0 && selectedRows.size === lancamentos.length}
                          ref={el => {
                            if (el) {
                              el.indeterminate = selectedRows.size > 0 && selectedRows.size < lancamentos.length
                            }
                          }}
                          onChange={toggleTodasLinhas}
                          title="Selecionar todas as linhas"
                          className="size-3.5 cursor-pointer"
                        />
                      </th>
                      <th className="text-left p-1 font-medium text-gray-500 leading-tight">#</th>
                      <th className="text-left p-1 font-medium text-gray-500 leading-tight whitespace-normal">Construtora</th>
                      <th className="text-left p-1 font-medium text-gray-500 leading-tight whitespace-normal">Empreendimento</th>
                      <th className="text-left p-1 font-medium text-gray-500 leading-tight whitespace-normal">Bairro</th>
                      <th className="text-left p-1 font-medium text-gray-500 leading-tight whitespace-normal">Entrega</th>
                      <th className="text-left p-1 font-medium text-gray-500 leading-tight whitespace-normal">Tipologia</th>
                      <th className="text-left p-1 font-medium text-gray-500 leading-tight whitespace-normal">Unidade</th>
                      <th className="text-left p-1 font-medium text-gray-500 leading-tight whitespace-normal">Andar</th>
                      <th className="text-left p-1 font-medium text-gray-500 leading-tight whitespace-normal">m²</th>
                      <th className="text-left p-1 font-medium text-gray-500 leading-tight whitespace-normal">Vagas</th>
                      <th className="text-left p-1 font-medium text-gray-500 leading-tight whitespace-normal">Mínimo</th>
                      <th className="text-left p-1 font-medium text-gray-500 leading-tight whitespace-normal">Máximo</th>
                      <th className="text-left p-1 font-medium text-gray-500 leading-tight whitespace-normal">Desconto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lancamentos.map((l, i) => (
                      <tr
                        key={i}
                        className={cn(
                          'border-b hover:bg-gray-50',
                          selectedRows.has(i) && 'bg-red-50/40'
                        )}
                      >
                        <td className="p-1 text-center align-top">
                          <input
                            type="checkbox"
                            checked={selectedRows.has(i)}
                            onClick={e => toggleLinhaSelecionada(i, e.shiftKey)}
                            title="Selecionar linha para apagar (Shift estende)"
                            className="size-3.5 cursor-pointer"
                          />
                        </td>
                        <td className="p-1 text-gray-400 tabular-nums">{i + 1}</td>
                        {TEXT_FIELDS.map(field => renderCelula(i, field, l))}
                        {(['valor_minimo', 'valor_maximo'] as const).map(field => (
                          <td
                            key={field}
                            className={cn(
                              'p-1 align-top select-none touch-none',
                              isCellHighlighted(i, field) && 'bg-blue-50/80'
                            )}
                            {...celulaProps(i, field)}
                          >
                            <input
                              type="number"
                              value={l[field] ?? ''}
                              onChange={e => updateLancamento(i, field, e.target.value ? Number(e.target.value) : null)}
                              onFocus={e => registrarFocusCelula(i, field, l[field], e)}
                              onBlur={() => blurCampo(i, field)}
                              className={numberInputClass(isCellHighlighted(i, field), field)}
                            />
                          </td>
                        ))}
                        {renderCelula(i, 'desconto_margem', l)}
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
