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
  metragemTemFaixa,
  normalizarLancamentos,
  sanitizarMetragemTexto,
} from '@/lib/formatar-lancamento'
import { cn } from '@/lib/utils'
import { ProcessamentoProgressBar } from '@/components/processamento-progress-bar'
import { posicaoNaFila } from '@/lib/fila-processamento'
import { EVENTO_FILA_ATUALIZADA, solicitarProcessamento } from '@/lib/processamento-fila-worker'
import {
  calcularProgressoEstimado,
  sublabelProgressoEstimado,
} from '@/lib/processamento-progresso-estimado'

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
type DragState = {
  anchor: CellCoord
  pointerX: number
  pointerY: number
  didDrag: boolean
  ctrlToggle?: boolean
  cellsBeforeDrag?: Set<string>
  preserveSelection?: boolean
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

function cellKey(row: number, field: EditableField): string {
  return `${row}:${field}`
}

function cellsInRange(anchor: CellCoord, focus: CellCoord): Set<string> {
  const bounds = normalizeRange({ anchor, focus })
  const cells = new Set<string>()
  for (let r = bounds.minRow; r <= bounds.maxRow; r++) {
    for (let c = bounds.minCol; c <= bounds.maxCol; c++) {
      cells.add(cellKey(r, EDITABLE_FIELDS[c]))
    }
  }
  return cells
}

function parseCellKey(key: string): CellCoord {
  const idx = key.indexOf(':')
  return { row: Number(key.slice(0, idx)), field: key.slice(idx + 1) as EditableField }
}

function sanitizeValor(field: EditableField, value: unknown): unknown {
  if (field === 'metragem' && typeof value === 'string') return sanitizarMetragemTexto(value)
  if (field === 'valor_minimo' || field === 'valor_maximo') {
    if (typeof value === 'number') return value
    if (value === null || value === '') return null
    return Number(value)
  }
  return value
}

function isCellInSet(row: number, field: EditableField, cells: Set<string>): boolean {
  return cells.has(cellKey(row, field))
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
  const [progressoEstimado, setProgressoEstimado] = useState(0)
  const [selectedCell, setSelectedCell] = useState<CellCoord | null>(null)
  const [selectedCells, setSelectedCells] = useState<Set<string>>(() => new Set())
  const [selectionAnchor, setSelectionAnchor] = useState<CellCoord | null>(null)
  const [selectedRows, setSelectedRows] = useState<Set<number>>(() => new Set())
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [isDraggingCells, setIsDraggingCells] = useState(false)
  const [undoStack, setUndoStack] = useState<LancamentoAI[][]>([])

  const undoStackRef = useRef(undoStack)
  undoStackRef.current = undoStack
  const selectedCellsRef = useRef(selectedCells)
  selectedCellsRef.current = selectedCells
  const selectedCellRef = useRef(selectedCell)
  selectedCellRef.current = selectedCell
  const lastRowClickRef = useRef<number | null>(null)
  const dragStateRef = useRef<DragState | null>(null)
  const skipNextFocusSelectionRef = useRef(false)
  const multiEditUndoPushedRef = useRef(false)
  const processandoDesdeRef = useRef<number | null>(null)
  const statusAnteriorRef = useRef('')

  const snapshotLancamentos = (items: LancamentoAI[]) =>
    items.map(l => ({ ...l }))

  const limparSelecoes = useCallback(() => {
    setSelectedCell(null)
    setSelectedCells(new Set())
    setSelectionAnchor(null)
    setSelectedRows(new Set())
    multiEditUndoPushedRef.current = false
  }, [])

  const isCellHighlighted = useCallback((row: number, field: EditableField) => {
    return isCellInSet(row, field, selectedCells)
  }, [selectedCells])

  const definirSelecao = useCallback((
    row: number,
    field: EditableField,
    opts?: { shift?: boolean; anchor?: CellCoord }
  ) => {
    const anchor = opts?.shift
      ? (opts.anchor ?? selectionAnchor ?? { row, field })
      : { row, field }
    const cells = cellsInRange(anchor, { row, field })
    setSelectedCell({ row, field })
    setSelectedCells(cells)
    if (!opts?.shift) setSelectionAnchor(anchor)
  }, [selectionAnchor])

  const alternarCelulaCtrl = useCallback((row: number, field: EditableField) => {
    const key = cellKey(row, field)
    setSelectedCells(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      if (next.size === 0) {
        setSelectedCell(null)
        setSelectionAnchor(null)
      } else {
        setSelectedCell({ row, field })
        if (next.size === 1) setSelectionAnchor({ row, field })
      }
      return next
    })
  }, [])

  const iniciarArraste = useCallback((
    row: number,
    field: EditableField,
    e: React.PointerEvent<HTMLTableCellElement>
  ) => {
    if (e.button !== 0) return

    const ctrl = e.ctrlKey || e.metaKey
    const shift = e.shiftKey
    const key = cellKey(row, field)
    const emSelecaoMultipla = !ctrl && !shift && selectedCells.size > 1 && selectedCells.has(key)
    const anchor = shift && !ctrl
      ? (selectionAnchor ?? selectedCell ?? { row, field })
      : { row, field }

    dragStateRef.current = {
      anchor,
      pointerX: e.clientX,
      pointerY: e.clientY,
      didDrag: false,
      ctrlToggle: ctrl,
      cellsBeforeDrag: ctrl ? new Set(selectedCells) : undefined,
      preserveSelection: emSelecaoMultipla,
    }
    setIsDraggingCells(true)
    setSelectedCell({ row, field })

    if (ctrl || emSelecaoMultipla) return

    setSelectedCells(cellsInRange(anchor, { row, field }))
    if (!shift) setSelectionAnchor(anchor)
  }, [selectionAnchor, selectedCell, selectedCells])

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

    const range = cellsInRange(drag.anchor, { row, field })
    if (drag.cellsBeforeDrag) {
      setSelectedCells(new Set([...drag.cellsBeforeDrag, ...range]))
    } else {
      setSelectedCells(range)
    }
    setSelectedCell({ row, field })
  }, [])

  const finalizarArraste = useCallback((
    row: number,
    field: EditableField,
    e: React.PointerEvent<HTMLTableCellElement>
  ) => {
    const drag = dragStateRef.current
    const didDrag = drag?.didDrag
    dragStateRef.current = null
    setIsDraggingCells(false)

    if (drag?.ctrlToggle && !didDrag) {
      skipNextFocusSelectionRef.current = true
      alternarCelulaCtrl(row, field)
    } else if (drag?.preserveSelection && !didDrag) {
      skipNextFocusSelectionRef.current = true
    }

    if (!didDrag) {
      const input = e.currentTarget.querySelector('input')
      input?.focus()
      if (drag?.preserveSelection && input) {
        input.select()
      }
    }
  }, [alternarCelulaCtrl])

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

  useEffect(() => {
    if (status === 'processando' && statusAnteriorRef.current !== 'processando') {
      processandoDesdeRef.current = Date.now()
    }
    if (!['pendente', ...STATUS_EM_PROGRESSO].includes(status)) {
      processandoDesdeRef.current = null
    }
    statusAnteriorRef.current = status
  }, [status])

  useEffect(() => {
    const emProgresso =
      loading || ['pendente', ...STATUS_EM_PROGRESSO].includes(status)
    if (!emProgresso) return

    const atualizar = () => {
      if (loading && !['pendente', ...STATUS_EM_PROGRESSO].includes(status)) {
        setProgressoEstimado(5)
        return
      }
      setProgressoEstimado(
        calcularProgressoEstimado(status, processandoDesdeRef.current, posicaoFila)
      )
    }

    atualizar()
    const interval = setInterval(atualizar, 1000)
    return () => clearInterval(interval)
  }, [loading, status, posicaoFila])

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

  const updateValorSelecao = useCallback((
    row: number,
    field: EditableField,
    value: unknown
  ) => {
    const key = cellKey(row, field)
    const alvo = selectedCells.size > 1 && selectedCells.has(key)
      ? selectedCells
      : new Set([key])

    setLancamentos(prev => {
      if (alvo.size > 1 && !multiEditUndoPushedRef.current) {
        multiEditUndoPushedRef.current = true
        setUndoStack(u => [...u, snapshotLancamentos(prev)])
      }

      return prev.map((l, i) => {
        let patch: Partial<LancamentoAI> | null = null
        for (const k of alvo) {
          const { row: r, field: f } = parseCellKey(k)
          if (r !== i) continue
          patch = { ...(patch ?? {}), [f]: sanitizeValor(f, value) }
        }
        return patch ? { ...l, ...patch } : l
      })
    })
  }, [selectedCells])

  const blurCampoSelecao = useCallback((row: number, field: EditableField) => {
    const key = cellKey(row, field)
    const alvo = selectedCells.size > 1 && selectedCells.has(key)
      ? selectedCells
      : new Set([key])

    setLancamentos(prev => prev.map((l, i) => {
      let next = l
      for (const k of alvo) {
        const { row: r, field: f } = parseCellKey(k)
        if (r !== i) continue
        const formatted = formatarCampo(f, next[f])
        if (formatted !== next[f]) next = { ...next, [f]: formatted }
      }
      return next
    }))
    multiEditUndoPushedRef.current = false
  }, [selectedCells])

  const registrarFocusCelula = useCallback((
    row: number,
    field: EditableField,
    _valor: unknown,
    e?: React.FocusEvent<HTMLInputElement>
  ) => {
    if (skipNextFocusSelectionRef.current) {
      skipNextFocusSelectionRef.current = false
      multiEditUndoPushedRef.current = false
      return
    }
    if (selectedCells.size > 1 && selectedCells.has(cellKey(row, field))) {
      multiEditUndoPushedRef.current = false
      setSelectedCell({ row, field })
      return
    }
    multiEditUndoPushedRef.current = false
    const mod = e?.nativeEvent as unknown as { shiftKey?: boolean }
    const shift = !!mod?.shiftKey
    const anchor = shift ? (selectionAnchor ?? selectedCell ?? undefined) : undefined
    definirSelecao(row, field, { shift, anchor })
  }, [definirSelecao, selectionAnchor, selectedCell, selectedCells])

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

  const focarInputCelula = useCallback((row: number, field: EditableField) => {
    requestAnimationFrame(() => {
      const input = document.querySelector<HTMLInputElement>(
        `[data-cell="${cellKey(row, field)}"]`
      )
      if (!input) return
      input.focus()
      input.select()
    })
  }, [])

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
    toast.success(`${selectedRows.size} imóve${selectedRows.size !== 1 ? 'is' : 'l'} removido${selectedRows.size !== 1 ? 's' : ''}`)
  }, [selectedRows, lancamentos, limparSelecoes])

  useEffect(() => {
    if (status !== 'aguardando_confirmacao') return

    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      const emInput = tag === 'INPUT' || tag === 'TEXTAREA'

      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        if (emInput) return
        if (undoStackRef.current.length === 0) return
        e.preventDefault()
        desfazer()
        return
      }

      const cells = selectedCellsRef.current
      const focus = selectedCellRef.current
      if (cells.size <= 1 || !focus || emInput) return

      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault()
        updateValorSelecao(focus.row, focus.field, e.key)
        focarInputCelula(focus.row, focus.field)
        return
      }

      if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault()
        const vazio = focus.field === 'valor_minimo' || focus.field === 'valor_maximo' ? null : ''
        updateValorSelecao(focus.row, focus.field, vazio)
        focarInputCelula(focus.row, focus.field)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [status, desfazer, updateValorSelecao, focarInputCelula])

  const celulaProps = (row: number, field: EditableField) => ({
    onPointerDown: (e: React.PointerEvent<HTMLTableCellElement>) => iniciarArraste(row, field, e),
    onPointerEnter: (e: React.PointerEvent<HTMLTableCellElement>) => {
      if (isDraggingCells) estenderArraste(row, field, e.clientX, e.clientY)
    },
    onPointerUp: (e: React.PointerEvent<HTMLTableCellElement>) => finalizarArraste(row, field, e),
  })

  const renderCelula = (row: number, field: EditableField, l: LancamentoAI) => {
    const highlighted = isCellHighlighted(row, field)
    const isMetragem = field === 'metragem'
    const isFaixaMetragem = isMetragem && metragemTemFaixa(l.metragem)

    return (
      <td
        key={field}
        className={cn(
          'p-1 align-top select-none touch-none',
          FIELD_CELL_CLASS[field],
          highlighted && 'bg-blue-50/80'
        )}
        {...celulaProps(row, field)}
      >
        {isMetragem ? (
          <div className={cn(
            'flex min-w-0 items-center',
            isFaixaMetragem ? '' : 'justify-end gap-0.5'
          )}>
            <input
              type="text"
              data-cell={cellKey(row, field)}
              inputMode={isFaixaMetragem ? 'text' : 'decimal'}
              value={metragemParaEdicao(l.metragem)}
              title={l.metragem ?? undefined}
              onChange={e => updateValorSelecao(row, field, e.target.value)}
              onFocus={e => {
                registrarFocusCelula(row, field, l.metragem, e)
                if (selectedCells.size > 1 && selectedCells.has(cellKey(row, field))) {
                  e.target.select()
                }
                if (l.metragem && !metragemTemFaixa(l.metragem)) {
                  const num = metragemParaEdicao(l.metragem)
                  if (num !== l.metragem) updateValorSelecao(row, 'metragem', num)
                }
              }}
              onBlur={() => blurCampoSelecao(row, field)}
              className={cn(
                inputClass(highlighted, field),
                'min-w-0',
                isFaixaMetragem ? 'w-full' : 'flex-1 text-right'
              )}
            />
            {!isFaixaMetragem && (
              <span className="shrink-0 text-[0.85em] text-gray-400">m²</span>
            )}
          </div>
        ) : (
          <input
            type="text"
            data-cell={cellKey(row, field)}
            value={(l[field] as string) ?? ''}
            title={(l[field] as string) ?? undefined}
            onChange={e => updateValorSelecao(row, field, e.target.value)}
            onFocus={e => {
              registrarFocusCelula(row, field, l[field], e)
              if (selectedCells.size > 1 && selectedCells.has(cellKey(row, field))) {
                e.target.select()
              }
            }}
            onBlur={() => blurCampoSelecao(row, field)}
            className={inputClass(highlighted, field)}
          />
        )}
      </td>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh] px-4">
        <ProcessamentoProgressBar
          percent={progressoEstimado}
          label="Carregando..."
        />
      </div>
    )
  }

  return (
    <div className="w-full max-w-6xl mx-auto">
      <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">Revisão de Lançamentos</h1>

      {status === 'pendente' && (
        <Card className="mb-6">
          <CardContent className="py-10 px-6">
            <ProcessamentoProgressBar
              percent={progressoEstimado}
              label="PDF na fila de processamento"
              sublabel={
                posicaoFila != null && posicaoFila > 1
                  ? `Posição ${posicaoFila} na fila — aguardando o PDF anterior terminar.`
                  : 'Aguardando slot livre — o processamento inicia automaticamente.'
              }
            />
            <p className="text-xs text-gray-400 text-center mt-4">
              {sublabelProgressoEstimado('pendente')}
            </p>
          </CardContent>
        </Card>
      )}

      {STATUS_EM_PROGRESSO.includes(status) && (
        <Card className="mb-6">
          <CardContent className="py-10 px-6">
            <ProcessamentoProgressBar
              percent={progressoEstimado}
              label={STATUS_LABEL[status] ?? 'Processando...'}
              sublabel={sublabelProgressoEstimado(status)}
            />
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
                Arraste ou Ctrl+clique para selecionar células e digite para preencher todas. Use a caixa à esquerda para apagar imóveis inteiros.
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
              {selectedCells.size > 0 && (
                <span className="text-xs text-blue-600">
                  {selectedCells.size} célula{selectedCells.size !== 1 ? 's' : ''} selecionada{selectedCells.size !== 1 ? 's' : ''}
                  {selectedCell ? ` · foco: ${FIELD_LABELS[selectedCell.field]}, linha ${selectedCell.row + 1}` : ''}
                </span>
              )}
              {selectedRows.size > 0 && (
                <span className="text-xs text-red-600">
                  {selectedRows.size} imóve{selectedRows.size !== 1 ? 'is' : 'l'} marcado{selectedRows.size !== 1 ? 's' : ''} para apagar
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
            title="Apagar imóveis selecionados?"
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
                    <col style={{ width: '7%' }} />
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
                            title="Selecionar imóvel para apagar (Shift estende)"
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
                              FIELD_CELL_CLASS[field],
                              isCellHighlighted(i, field) && 'bg-blue-50/80'
                            )}
                            {...celulaProps(i, field)}
                          >
                            <input
                              type="number"
                              data-cell={cellKey(i, field)}
                              value={l[field] ?? ''}
                              onChange={e => updateValorSelecao(
                                i,
                                field,
                                e.target.value ? Number(e.target.value) : null
                              )}
                              onFocus={e => {
                                registrarFocusCelula(i, field, l[field], e)
                                if (selectedCells.size > 1 && selectedCells.has(cellKey(i, field))) {
                                  e.target.select()
                                }
                              }}
                              onBlur={() => blurCampoSelecao(i, field)}
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
