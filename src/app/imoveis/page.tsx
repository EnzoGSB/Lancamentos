'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Search, X } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import type { Lancamento } from '@/lib/types'
import { exibirCampo } from '@/lib/formatar-lancamento'
import { VerPdfButton } from '@/components/ver-pdf-button'

type FiltrosMulti = {
  construtora: string[]
  empreendimento: string[]
  bairro: string[]
  tipologia: string[]
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
  tipologias: string[]
}

const FILTROS_VAZIOS: Filtros = {
  q: '',
  construtora: [],
  empreendimento: [],
  bairro: [],
  tipologia: [],
  valor_min: '',
  valor_max: '',
}

function formatValor(v: number | null) {
  return v != null ? `R$ ${v.toLocaleString('pt-BR')}` : '—'
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
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const toggle = (opt: string) => {
    if (values.includes(opt)) onChange(values.filter(v => v !== opt))
    else onChange([...values, opt])
  }

  const resumo =
    values.length === 0
      ? 'Todos'
      : values.length === 1
        ? values[0]
        : `${values.length} selecionados`

  return (
    <div ref={ref} className="relative flex flex-col gap-1 min-w-[160px] flex-1">
      <label className="text-xs font-medium text-gray-500">{label}</label>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="h-8 w-full rounded-lg border border-input bg-white px-2 text-sm text-left flex items-center justify-between gap-2 outline-none hover:bg-gray-50 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <span className="truncate text-gray-900">{resumo}</span>
        <ChevronDown className={`size-4 shrink-0 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute top-full left-0 z-50 mt-1 w-full min-w-[200px] max-h-52 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg p-1">
          {options.length === 0 ? (
            <p className="px-2 py-1.5 text-xs text-gray-400">Sem opções</p>
          ) : (
            options.map(opt => (
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
      )}
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
    tipologias: [],
  })
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

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

  const fetchLancamentos = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filtros.q) params.set('q', filtros.q)
      filtros.construtora.forEach(v => params.append('construtora', v))
      filtros.empreendimento.forEach(v => params.append('empreendimento', v))
      filtros.bairro.forEach(v => params.append('bairro', v))
      filtros.tipologia.forEach(v => params.append('tipologia', v))
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
  }, [filtros])

  useEffect(() => {
    fetchLancamentos()
  }, [fetchLancamentos])

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
      || filtros.tipologia.length > 0,
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
    <div className="max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Imóveis</h1>
          <p className="text-sm text-gray-500 mt-1">
            Catálogo de lançamentos salvos no banco mestre
          </p>
        </div>
        {temFiltrosAtivos && (
          <Button variant="outline" size="sm" onClick={limparFiltros}>
            <X className="size-3.5 mr-1" />
            Limpar filtros
          </Button>
        )}
      </div>

      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Busca e filtros</CardTitle>
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

          <div className="flex flex-wrap gap-3">
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
              values={filtros.tipologia}
              options={opcoes.tipologias}
              onChange={v => atualizarFiltroMulti('tipologia', v)}
            />
            <div className="flex flex-col gap-1 min-w-[120px] flex-1">
              <label className="text-xs font-medium text-gray-500">Valor mín. (R$)</label>
              <Input
                type="number"
                placeholder="Ex: 500000"
                value={filtros.valor_min}
                onChange={e => setFiltros(prev => ({ ...prev, valor_min: e.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-1 min-w-[120px] flex-1">
              <label className="text-xs font-medium text-gray-500">Valor máx. (R$)</label>
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
          <CardTitle className="text-base">
            {loading
              ? 'Carregando...'
              : `${lancamentos.length} de ${total} imóve${total === 1 ? 'l' : 'is'} exibido${lancamentos.length === 1 ? '' : 's'}`}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {!loading && lancamentos.length === 0 ? (
            <p className="text-gray-500 text-sm p-6">
              {temFiltrosAtivos
                ? 'Nenhum imóvel encontrado com esses filtros.'
                : 'Nenhum lançamento salvo ainda. Processe um PDF e confirme os dados.'}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-gray-50">
                    {['Construtora', 'Empreendimento', 'Bairro', 'Entrega', 'Tipologia', 'Unidade', 'Andar', 'Metragem', 'Vagas', 'Valor Mín.', 'Valor Máx.', 'Desconto', 'PDF'].map(h => (
                      <th key={h} className="text-left p-2 font-medium text-gray-500 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lancamentos.map(l => (
                    <tr key={l.id} className="border-b hover:bg-gray-50">
                      <td className="p-2 whitespace-nowrap font-medium">{l.construtora}</td>
                      <td className="p-2 max-w-[200px] truncate" title={l.empreendimento}>{l.empreendimento}</td>
                      <td className="p-2 whitespace-nowrap">{l.bairro ?? '—'}</td>
                      <td className="p-2 whitespace-nowrap tabular-nums">{exibirCampo('data_entrega', l.data_entrega)}</td>
                      <td className="p-2 whitespace-nowrap">{exibirCampo('tipologia', l.tipologia)}</td>
                      <td className="p-2 whitespace-nowrap tabular-nums text-center">{l.unidade ?? '—'}</td>
                      <td className="p-2 whitespace-nowrap tabular-nums">{exibirCampo('andar', l.andar)}</td>
                      <td className="p-2 whitespace-nowrap tabular-nums text-right">{exibirCampo('metragem', l.metragem)}</td>
                      <td className="p-2 whitespace-nowrap text-center">{l.vagas ?? '—'}</td>
                      <td className="p-2 whitespace-nowrap">{formatValor(l.valor_minimo)}</td>
                      <td className="p-2 whitespace-nowrap">{formatValor(l.valor_maximo)}</td>
                      <td className="p-2 whitespace-nowrap">{l.desconto_margem ?? '—'}</td>
                      <td className="p-2 whitespace-nowrap">
                        <VerPdfButton processamentoId={l.processamento_id} size="xs" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
