'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Search, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/confirm-dialog'
import type { Lancamento } from '@/lib/types'
import { LancamentoMobileCard } from '@/components/lancamento-mobile-card'
import { LancamentosTable } from '@/components/lancamentos-table'
import { ImoveisFontSizeControl } from '@/components/imoveis-font-size-control'
import { FONT_SIZE_DEFAULT, loadFontSize, saveFontSize } from '@/lib/imoveis-font-size'
import { normalizarTextoBusca, textoContemConsulta } from '@/lib/busca-texto'

type FiltrosMulti = {
  construtora: string[]
  empreendimento: string[]
  bairro: string[]
  tipo: string[]
  dormitorio: string[]
  entrega: string[]
}

type Filtros = FiltrosMulti & {
  q: string
  valor_min: string
  valor_max: string
}

type OpcoesFiltro = {
  construtoras: string[]
  empreendimentos: string[]
  empreendimentosPorConstrutora: Record<string, string[]>
  bairros: string[]
  tipos: string[]
  dormitorios: string[]
  entregas: string[]
}

const FILTROS_VAZIOS: Filtros = {
  q: '',
  construtora: [],
  empreendimento: [],
  bairro: [],
  tipo: [],
  dormitorio: [],
  entrega: [],
  valor_min: '',
  valor_max: '',
}

const PAGE_SIZE = 30

function PaginacaoImoveis({
  pagina,
  totalPaginas,
  onPagina,
}: {
  pagina: number
  totalPaginas: number
  onPagina: (p: number) => void
}) {
  if (totalPaginas <= 1) return null

  return (
    <nav
      className="flex flex-wrap items-center justify-center gap-1.5 p-4 border-t border-gray-100"
      aria-label="Paginação de imóveis"
    >
      {Array.from({ length: totalPaginas }, (_, i) => i + 1).map(n => (
        <Button
          key={n}
          type="button"
          variant={n === pagina ? 'default' : 'outline'}
          size="sm"
          className="min-w-9 touch-manipulation"
          onClick={() => onPagina(n)}
          aria-current={n === pagina ? 'page' : undefined}
          aria-label={`Página ${n}`}
        >
          {n}
        </Button>
      ))}
    </nav>
  )
}

function MultiSelectFiltro({
  label,
  values,
  options,
  onChange,
}: {
  label: string
  values: string[]
  options: string[]
  onChange: (v: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const [buscaLocal, setBuscaLocal] = useState('')
  const [panelRect, setPanelRect] = useState<{ top: number; left: number; width: number } | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const updatePanelRect = useCallback(() => {
    if (!inputRef.current) return
    const rect = inputRef.current.getBoundingClientRect()
    setPanelRect({
      top: rect.bottom + 4,
      left: rect.left,
      width: Math.max(rect.width, 220),
    })
  }, [])

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      if (ref.current?.contains(target)) return
      if (panelRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  useEffect(() => {
    if (!open) {
      setPanelRect(null)
      return
    }
    updatePanelRect()
    window.addEventListener('scroll', updatePanelRect, true)
    window.addEventListener('resize', updatePanelRect)
    return () => {
      window.removeEventListener('scroll', updatePanelRect, true)
      window.removeEventListener('resize', updatePanelRect)
    }
  }, [open, updatePanelRect, buscaLocal, options.length])

  useEffect(() => {
    if (open) {
      inputRef.current?.focus()
    } else {
      setBuscaLocal('')
    }
  }, [open])

  const toggle = (opt: string) => {
    if (values.includes(opt)) onChange(values.filter(v => v !== opt))
    else onChange([...values, opt])
  }

  const resumo =
    values.length === 0
      ? ''
      : values.length === 1
        ? values[0]
        : `${values.length} selecionados`

  const opcoesFiltradas = useMemo(() => {
    if (!buscaLocal.trim()) return options
    return options.filter(opt => textoContemConsulta(opt, buscaLocal))
  }, [options, buscaLocal])

  const valorInput = open ? buscaLocal : resumo

  const painelOpcoes = open && panelRect ? (
    <div
      ref={panelRef}
      role="listbox"
      style={{
        position: 'fixed',
        top: panelRect.top,
        left: panelRect.left,
        width: panelRect.width,
        zIndex: 9999,
      }}
      className="max-h-60 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-xl p-1"
    >
      {buscaLocal.trim() && options.length > 0 && (
        <p className="px-2 py-1 text-xs text-gray-400 border-b border-gray-100 mb-1">
          {opcoesFiltradas.length} de {options.length}
          {normalizarTextoBusca(buscaLocal) ? ` · “${buscaLocal.trim()}”` : ''}
        </p>
      )}
      {options.length === 0 ? (
        <p className="px-2 py-1.5 text-xs text-gray-400">Sem opções</p>
      ) : opcoesFiltradas.length === 0 ? (
        <p className="px-2 py-1.5 text-xs text-gray-400">Nenhuma opção encontrada</p>
      ) : (
        opcoesFiltradas.map(opt => (
          <label
            key={opt}
            className="flex items-center gap-2 px-2 py-1.5 hover:bg-gray-50 rounded cursor-pointer text-sm"
          >
            <input
              type="checkbox"
              checked={values.includes(opt)}
              onChange={() => toggle(opt)}
              className="size-3.5 rounded border-gray-300 accent-gray-900"
            />
            <span className="truncate" title={opt}>{opt}</span>
          </label>
        ))
      )}
      {values.length > 0 && (
        <button
          type="button"
          onClick={() => onChange([])}
          className="w-full mt-1 pt-1 border-t border-gray-100 px-2 py-1.5 text-xs text-gray-500 hover:text-gray-900 text-left"
        >
          Limpar seleção
        </button>
      )}
    </div>
  ) : null

  return (
    <div className="relative flex flex-col gap-1 w-full sm:min-w-[160px] sm:flex-1">
      <label className="text-sm font-medium text-gray-500">{label}</label>
      <div ref={ref} className="relative">
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          placeholder="Digite para filtrar"
          value={valorInput}
          onChange={e => {
            setBuscaLocal(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          className="h-10 w-full rounded-lg border border-input bg-white pl-3 pr-9 text-base text-gray-900 outline-none hover:bg-gray-50 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 placeholder:text-gray-400"
        />
        <button
          type="button"
          tabIndex={-1}
          aria-label={`Abrir opções de ${label}`}
          onClick={() => {
            setOpen(o => {
              const next = !o
              if (next) queueMicrotask(() => inputRef.current?.focus())
              return next
            })
          }}
          className="absolute right-0 top-0 h-10 px-2.5 text-gray-400 hover:text-gray-600"
        >
          <ChevronDown className={`size-4 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>
      {typeof document !== 'undefined' && painelOpcoes
        ? createPortal(painelOpcoes, document.body)
        : null}
    </div>
  )
}

export default function ImoveisPage() {
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_VAZIOS)
  const [busca, setBusca] = useState('')
  const [opcoes, setOpcoes] = useState<OpcoesFiltro>({
    construtoras: [],
    empreendimentos: [],
    empreendimentosPorConstrutora: {},
    bairros: [],
    tipos: [],
    dormitorios: [],
    entregas: [],
  })
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([])
  const [total, setTotal] = useState(0)
  const [pagina, setPagina] = useState(1)
  const [loading, setLoading] = useState(true)
  const [fontSizePx, setFontSizePx] = useState(FONT_SIZE_DEFAULT)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    setFontSizePx(loadFontSize())
  }, [])

  const aplicarFontSize = (size: number) => {
    setFontSizePx(size)
    saveFontSize(size)
  }

  useEffect(() => {
    fetch('/api/lancamentos/opcoes')
      .then(r => r.json())
      .then(data => {
        if (!data.error) setOpcoes(data)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    const t = setTimeout(() => {
      setFiltros(prev => ({ ...prev, q: busca }))
    }, 300)
    return () => clearTimeout(t)
  }, [busca])

  useEffect(() => {
    setPagina(1)
  }, [filtros])

  const fetchLancamentos = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('limit', String(PAGE_SIZE))
      params.set('offset', String((pagina - 1) * PAGE_SIZE))
      if (filtros.q) params.set('q', filtros.q)
      filtros.construtora.forEach(v => params.append('construtora', v))
      filtros.empreendimento.forEach(v => params.append('empreendimento', v))
      filtros.bairro.forEach(v => params.append('bairro', v))
      filtros.tipo.forEach(v => params.append('tipo', v))
      filtros.dormitorio.forEach(v => params.append('dormitorio', v))
      filtros.entrega.forEach(v => params.append('entrega', v))
      if (filtros.valor_min) params.set('valor_min', filtros.valor_min)
      if (filtros.valor_max) params.set('valor_max', filtros.valor_max)

      const res = await fetch(`/api/lancamentos?${params}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao carregar')

      setLancamentos(data.lancamentos ?? [])
      setTotal(data.total ?? 0)
    } catch {
      setLancamentos([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [filtros, pagina])

  useEffect(() => {
    fetchLancamentos()
  }, [fetchLancamentos])

  useEffect(() => {
    const max = Math.max(1, Math.ceil(total / PAGE_SIZE))
    if (pagina > max) setPagina(max)
  }, [total, pagina])

  useEffect(() => {
    setSelectedIds(prev => {
      const visiveis = new Set(lancamentos.map(l => l.id))
      const next = new Set([...prev].filter(id => visiveis.has(id)))
      return next.size === prev.size ? prev : next
    })
  }, [lancamentos])

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleSelectAll = useCallback((checked: boolean) => {
    if (!checked) {
      setSelectedIds(new Set())
      return
    }
    setSelectedIds(new Set(lancamentos.map(l => l.id)))
  }, [lancamentos])

  const handleDeleteSelected = useCallback(async () => {
    const ids = [...selectedIds]
    if (ids.length === 0) return

    setDeleting(true)
    try {
      const res = await fetch('/api/lancamentos', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao apagar')

      const removidos = data.removidos ?? ids.length
      setLancamentos(prev => prev.filter(l => !selectedIds.has(l.id)))
      setTotal(prev => Math.max(0, prev - removidos))
      setSelectedIds(new Set())
      setDeleteOpen(false)
      toast.success(
        removidos === 1
          ? '1 imóvel removido do banco.'
          : `${removidos} imóveis removidos do banco.`
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao apagar imóveis')
    } finally {
      setDeleting(false)
    }
  }, [selectedIds])

  const qtdSelecionados = selectedIds.size

  const totalPaginas = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const inicioLista = total === 0 ? 0 : (pagina - 1) * PAGE_SIZE + 1
  const fimLista = total === 0 ? 0 : Math.min(pagina * PAGE_SIZE, total)

  const irParaPagina = useCallback((novaPagina: number) => {
    setPagina(Math.min(Math.max(1, novaPagina), totalPaginas))
  }, [totalPaginas])

  const empreendimentosFiltrados = useMemo(() => {
    if (filtros.construtora.length === 0) return opcoes.empreendimentos
    const set = new Set<string>()
    for (const c of filtros.construtora) {
      for (const e of opcoes.empreendimentosPorConstrutora[c] ?? []) {
        set.add(e)
      }
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [filtros.construtora, opcoes.empreendimentos, opcoes.empreendimentosPorConstrutora])

  const temFiltrosAtivos = useMemo(
    () =>
      filtros.q !== ''
      || filtros.valor_min !== ''
      || filtros.valor_max !== ''
      || filtros.construtora.length > 0
      || filtros.empreendimento.length > 0
      || filtros.bairro.length > 0
      || filtros.tipo.length > 0
      || filtros.dormitorio.length > 0
      || filtros.entrega.length > 0,
    [filtros]
  )

  const limparFiltros = () => {
    setBusca('')
    setFiltros(FILTROS_VAZIOS)
  }

  const atualizarFiltroMulti = (campo: keyof FiltrosMulti, valores: string[]) => {
    setFiltros(prev => {
      const next = { ...prev, [campo]: valores }
      if (campo === 'construtora') {
        const permitidos = new Set<string>()
        for (const c of valores) {
          for (const e of opcoes.empreendimentosPorConstrutora[c] ?? []) {
            permitidos.add(e)
          }
        }
        next.empreendimento = valores.length === 0
          ? prev.empreendimento
          : prev.empreendimento.filter(e => permitidos.has(e))
      }
      return next
    })
  }

  return (
    <div className="w-full mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4 mb-5 sm:mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Imóveis</h1>
          <p className="text-sm sm:text-base text-gray-500 mt-1 sm:mt-2">
            Catálogo de lançamentos salvos no banco mestre
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
          <ImoveisFontSizeControl value={fontSizePx} onApply={aplicarFontSize} />
          {temFiltrosAtivos && (
            <Button variant="outline" size="sm" onClick={limparFiltros} className="w-full sm:w-auto touch-manipulation">
              <X className="size-3.5 mr-1" />
              Limpar filtros
            </Button>
          )}
        </div>
      </div>

      <Card className="mb-6 overflow-visible relative z-20">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Busca e filtros</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-gray-400" />
            <Input
              type="search"
              placeholder="Buscar por construtora, empreendimento, bairro, tipologia, unidade..."
              value={busca}
              onChange={e => setBusca(e.target.value)}
              className="pl-9"
            />
          </div>

          <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3">
            <MultiSelectFiltro
              label="Construtora"
              values={filtros.construtora}
              options={opcoes.construtoras}
              onChange={v => atualizarFiltroMulti('construtora', v)}
            />
            <MultiSelectFiltro
              label="Empreendimento"
              values={filtros.empreendimento}
              options={empreendimentosFiltrados}
              onChange={v => atualizarFiltroMulti('empreendimento', v)}
            />
            <MultiSelectFiltro
              label="Bairro"
              values={filtros.bairro}
              options={opcoes.bairros}
              onChange={v => atualizarFiltroMulti('bairro', v)}
            />
            <MultiSelectFiltro
              label="Tipologia"
              values={filtros.tipo}
              options={opcoes.tipos}
              onChange={v => atualizarFiltroMulti('tipo', v)}
            />
            <MultiSelectFiltro
              label="Dormitórios"
              values={filtros.dormitorio}
              options={opcoes.dormitorios}
              onChange={v => atualizarFiltroMulti('dormitorio', v)}
            />
            <MultiSelectFiltro
              label="Entrega"
              values={filtros.entrega}
              options={opcoes.entregas}
              onChange={v => atualizarFiltroMulti('entrega', v)}
            />
            <div className="flex flex-col gap-1 w-full sm:min-w-[120px] sm:flex-1">
              <label className="text-sm font-medium text-gray-500">Valor mín. (R$)</label>
              <Input
                type="number"
                placeholder="Ex: 500000"
                value={filtros.valor_min}
                onChange={e => setFiltros(prev => ({ ...prev, valor_min: e.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-1 w-full sm:min-w-[120px] sm:flex-1">
              <label className="text-sm font-medium text-gray-500">Valor máx. (R$)</label>
              <Input
                type="number"
                placeholder="Ex: 2000000"
                value={filtros.valor_max}
                onChange={e => setFiltros(prev => ({ ...prev, valor_max: e.target.value }))}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <CardTitle className="text-lg">
              {loading
                ? 'Carregando...'
                : total === 0
                  ? 'Nenhum imóvel'
                  : `${inicioLista}–${fimLista} de ${total} imóve${total === 1 ? 'l' : 'is'} · página ${pagina} de ${totalPaginas}`}
            </CardTitle>
            {qtdSelecionados > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-gray-600">
                  {qtdSelecionados} selecionado{qtdSelecionados === 1 ? '' : 's'}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedIds(new Set())}
                >
                  Limpar seleção
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  className="bg-red-600 text-white hover:bg-red-700"
                  onClick={() => setDeleteOpen(true)}
                >
                  <Trash2 className="size-3.5" />
                  Apagar selecionados
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {!loading && lancamentos.length === 0 ? (
            <p className="text-gray-500 text-base p-8">
              {temFiltrosAtivos
                ? 'Nenhum imóvel encontrado com esses filtros.'
                : 'Nenhum lançamento salvo ainda. Processe um PDF e confirme os dados.'}
            </p>
          ) : (
            <>
              <div className="md:hidden p-3 space-y-3">
                {lancamentos.map(l => (
                  <LancamentoMobileCard
                    key={l.id}
                    lancamento={l}
                    fontSizePx={fontSizePx}
                    selectable
                    selected={selectedIds.has(l.id)}
                    onToggleSelect={toggleSelect}
                  />
                ))}
              </div>
              <div className="hidden md:block p-1 overflow-x-auto">
                <LancamentosTable
                  lancamentos={lancamentos}
                  showPdf
                  fontSizePx={fontSizePx}
                  selectable
                  selectedIds={selectedIds}
                  onToggleSelect={toggleSelect}
                  onToggleSelectAll={toggleSelectAll}
                />
              </div>
              <PaginacaoImoveis
                pagina={pagina}
                totalPaginas={totalPaginas}
                onPagina={irParaPagina}
              />
            </>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Apagar imóveis selecionados?"
        description={
          <>
            <p>
              {qtdSelecionados === 1
                ? '1 imóvel será removido permanentemente do banco mestre.'
                : `${qtdSelecionados} imóveis serão removidos permanentemente do banco mestre.`}
            </p>
            <p>Esta ação não pode ser desfeita.</p>
          </>
        }
        confirmLabel="Apagar"
        variant="destructive"
        loading={deleting}
        onConfirm={handleDeleteSelected}
      />
    </div>
  )
}
