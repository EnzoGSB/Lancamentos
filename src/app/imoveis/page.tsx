'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Search, X } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import type { Lancamento } from '@/lib/types'

type Filtros = {
  q: string
  construtora: string
  empreendimento: string
  bairro: string
  tipologia: string
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
  construtora: '',
  empreendimento: '',
  bairro: '',
  tipologia: '',
  valor_min: '',
  valor_max: '',
}

function formatValor(v: number | null) {
  return v != null ? `R$ ${v.toLocaleString('pt-BR')}` : '—'
}

function SelectFiltro({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: string[]
  onChange: (v: string) => void
}) {
  return (
    <div className="flex flex-col gap-1 min-w-[140px] flex-1">
      <label className="text-xs font-medium text-gray-500">{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="h-8 w-full rounded-lg border border-input bg-white px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <option value="">Todos</option>
        {options.map(opt => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
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
      if (filtros.construtora) params.set('construtora', filtros.construtora)
      if (filtros.empreendimento) params.set('empreendimento', filtros.empreendimento)
      if (filtros.bairro) params.set('bairro', filtros.bairro)
      if (filtros.tipologia) params.set('tipologia', filtros.tipologia)
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
    if (!filtros.construtora) return opcoes.empreendimentos
    return opcoes.empreendimentosPorConstrutora[filtros.construtora] ?? []
  }, [filtros.construtora, opcoes.empreendimentos, opcoes.empreendimentosPorConstrutora])

  const temFiltrosAtivos = useMemo(
    () => Object.entries(filtros).some(([, v]) => v !== ''),
    [filtros]
  )

  const limparFiltros = () => {
    setBusca('')
    setFiltros(FILTROS_VAZIOS)
  }

  const atualizarFiltro = (campo: keyof Filtros, valor: string) => {
    setFiltros(prev => {
      const next = { ...prev, [campo]: valor }
      if (campo === 'construtora') next.empreendimento = ''
      return next
    })
  }

  return (
    <div>
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
            <SelectFiltro
              label="Construtora"
              value={filtros.construtora}
              options={opcoes.construtoras}
              onChange={v => atualizarFiltro('construtora', v)}
            />
            <SelectFiltro
              label="Empreendimento"
              value={filtros.empreendimento}
              options={empreendimentosFiltrados}
              onChange={v => atualizarFiltro('empreendimento', v)}
            />
            <SelectFiltro
              label="Bairro"
              value={filtros.bairro}
              options={opcoes.bairros}
              onChange={v => atualizarFiltro('bairro', v)}
            />
            <SelectFiltro
              label="Tipologia"
              value={filtros.tipologia}
              options={opcoes.tipologias}
              onChange={v => atualizarFiltro('tipologia', v)}
            />
            <div className="flex flex-col gap-1 min-w-[120px] flex-1">
              <label className="text-xs font-medium text-gray-500">Valor mín. (R$)</label>
              <Input
                type="number"
                placeholder="Ex: 500000"
                value={filtros.valor_min}
                onChange={e => atualizarFiltro('valor_min', e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1 min-w-[120px] flex-1">
              <label className="text-xs font-medium text-gray-500">Valor máx. (R$)</label>
              <Input
                type="number"
                placeholder="Ex: 2000000"
                value={filtros.valor_max}
                onChange={e => atualizarFiltro('valor_max', e.target.value)}
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
                    {['Construtora', 'Empreendimento', 'Bairro', 'Entrega', 'Tipologia', 'Unidade', 'Andar', 'Metragem', 'Vagas', 'Valor Mín.', 'Valor Máx.', 'Desconto'].map(h => (
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
                      <td className="p-2 whitespace-nowrap">{l.data_entrega ?? '—'}</td>
                      <td className="p-2 whitespace-nowrap">{l.tipologia ?? '—'}</td>
                      <td className="p-2 whitespace-nowrap">{l.unidade ?? '—'}</td>
                      <td className="p-2 whitespace-nowrap">{l.andar ?? '—'}</td>
                      <td className="p-2 whitespace-nowrap">{l.metragem ?? '—'}</td>
                      <td className="p-2 whitespace-nowrap text-center">{l.vagas ?? '—'}</td>
                      <td className="p-2 whitespace-nowrap">{formatValor(l.valor_minimo)}</td>
                      <td className="p-2 whitespace-nowrap">{formatValor(l.valor_maximo)}</td>
                      <td className="p-2 whitespace-nowrap">{l.desconto_margem ?? '—'}</td>
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
