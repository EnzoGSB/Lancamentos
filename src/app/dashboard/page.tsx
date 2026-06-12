'use client'

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import Link from 'next/link'
import { Building2, ChevronDown, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { FilaProcessamentoBanner } from '@/components/fila-processamento-banner'
import {
  lerFilaBatch,
  limparFilaBatch,
  proximoPendente,
  resumoFilaBatch,
  type FilaBatch,
} from '@/lib/fila-processamento'
import type { AnaliseIA, ProcessamentoLancamento } from '@/lib/types'

type ProcessamentoComContagem = ProcessamentoLancamento & {
  empreendimentos_inseridos?: number | null
}

const CONSTRUTORA_NAO_IDENTIFICADA = 'A identificar'

function getConstrutora(p: ProcessamentoComContagem): string {
  const analise = p.analise_ia as AnaliseIA | null
  const nome = analise?.construtora?.trim()
  return nome || CONSTRUTORA_NAO_IDENTIFICADA
}

function ordenarConstrutoras(a: string, b: string): number {
  if (a === CONSTRUTORA_NAO_IDENTIFICADA) return 1
  if (b === CONSTRUTORA_NAO_IDENTIFICADA) return -1
  return a.localeCompare(b, 'pt-BR')
}

const STATUS_LABELS: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  pendente:               { label: 'Pendente',              variant: 'secondary' },
  extraindo:              { label: 'Extraindo',             variant: 'outline' },
  analisando:             { label: 'Analisando (IA)',       variant: 'outline' },
  processando:            { label: 'Processando (IA)',      variant: 'outline' },
  aguardando_confirmacao: { label: 'Aguardando Revisão',    variant: 'default' },
  salvando:               { label: 'Salvando',              variant: 'outline' },
  concluido:              { label: 'Concluído',             variant: 'default' },
  erro:                   { label: 'Erro',                  variant: 'destructive' },
}

const STATUS_EM_PROGRESSO = ['extraindo', 'analisando', 'processando', 'salvando'] as const

function emProgresso(status: string) {
  return (STATUS_EM_PROGRESSO as readonly string[]).includes(status)
}

function ProcessamentoRow({
  p,
  deletingId,
  onDelete,
  compact = false,
  naFila = false,
}: {
  p: ProcessamentoComContagem
  deletingId: string | null
  onDelete: (p: ProcessamentoComContagem) => void
  compact?: boolean
  naFila?: boolean
}) {
  const statusInfo = STATUS_LABELS[p.status] ?? { label: p.status, variant: 'secondary' as const }

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 py-4">
      <div className="flex-1 min-w-0">
        <p className="text-base font-medium text-gray-900 truncate">
          {p.original_filename || 'Arquivo sem nome'}
        </p>
        <p className="text-sm text-gray-500 mt-0.5">
          {compact && p.tipo === 'multi' && 'Multi-empreendimento • '}
          {compact && p.tipo === 'single' && 'Empreendimento único • '}
          {compact && !p.tipo && 'Aguardando identificação • '}
          {p.created_at && new Date(p.created_at).toLocaleString('pt-BR')}
        </p>
        {p.status === 'concluido' && p.resultado && (
          <div className="mt-1 space-y-0.5">
            {p.empreendimentos_inseridos != null && (
              <p className="text-sm text-green-600">
                {p.empreendimentos_inseridos}{' '}
                {p.empreendimentos_inseridos === 1 ? 'empreendimento' : 'empreendimentos'}
              </p>
            )}
            <p className="text-sm text-green-600">
              {(p.resultado as { inseridos: number }).inseridos} lançamentos inseridos
            </p>
          </div>
        )}
        {p.erro && <p className="text-sm text-red-500 mt-1">{p.erro}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:ml-4 shrink-0">
        <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
        {p.status === 'aguardando_confirmacao' && (
          <Link
            href={`/mapeamento/${p.id}`}
            className="text-sm px-4 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Revisar
          </Link>
        )}
        {p.status === 'concluido' && (
          <Link
            href={`/preview/${p.id}`}
            className="text-sm px-4 py-1.5 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
          >
            Ver dados
          </Link>
        )}
        {p.status === 'pendente' && (
          naFila ? (
            <span className="text-sm px-4 py-1.5 bg-gray-100 text-gray-600 rounded">
              Na fila
            </span>
          ) : (
            <Link
              href={`/mapeamento/${p.id}`}
              className="text-sm px-4 py-1.5 bg-gray-900 text-white rounded hover:bg-gray-800"
            >
              Processar
            </Link>
          )
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="text-gray-400 hover:text-red-600 hover:bg-red-50"
          disabled={deletingId === p.id}
          onClick={() => onDelete(p)}
          title="Apagar processamento"
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
    </div>
  )
}

function resumoStatus(items: ProcessamentoComContagem[]) {
  const concluidos = items.filter(p => p.status === 'concluido').length
  const revisao = items.filter(p => p.status === 'aguardando_confirmacao').length
  const pendentes = items.filter(p => p.status === 'pendente').length
  return { concluidos, revisao, pendentes }
}

function ConstrutoraBloco({
  construtora,
  items,
  aberta,
  onToggle,
  deletingId,
  onDelete,
  idsNaFila,
}: {
  construtora: string
  items: ProcessamentoComContagem[]
  aberta: boolean
  onToggle: () => void
  deletingId: string | null
  onDelete: (p: ProcessamentoComContagem) => void
  idsNaFila?: Set<string>
}) {
  const naoIdentificada = construtora === CONSTRUTORA_NAO_IDENTIFICADA
  const { concluidos, revisao, pendentes } = resumoStatus(items)

  return (
    <div
      className={`rounded-xl border overflow-hidden transition-shadow ${
        naoIdentificada
          ? 'border-amber-200 bg-amber-50/40'
          : 'border-gray-200 bg-white shadow-sm hover:shadow-md'
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={aberta}
        className={`w-full flex items-start sm:items-center gap-3 px-4 py-4 sm:px-5 text-left transition-colors ${
          naoIdentificada ? 'hover:bg-amber-50' : 'hover:bg-gray-50'
        }`}
      >
        <ChevronDown
          className={`size-5 shrink-0 text-gray-500 mt-0.5 sm:mt-0 transition-transform duration-200 ${
            aberta ? '' : '-rotate-90'
          }`}
        />
        <div
          className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${
            naoIdentificada ? 'bg-amber-100 text-amber-800' : 'bg-gray-900 text-white'
          }`}
        >
          <Building2 className="size-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-lg sm:text-xl font-bold text-gray-900">{construtora}</span>
            <Badge
              variant={naoIdentificada ? 'outline' : 'secondary'}
              className="text-xs sm:text-sm font-semibold px-2.5"
            >
              {items.length} {items.length === 1 ? 'PDF' : 'PDFs'}
            </Badge>
          </div>
          {!aberta && (
            <p className="text-sm text-gray-500 mt-1 truncate">
              {items.slice(0, 2).map(i => i.original_filename || 'Sem nome').join(' · ')}
              {items.length > 2 && ` · +${items.length - 2}`}
            </p>
          )}
          {aberta && (
            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5 text-xs sm:text-sm text-gray-500">
              {concluidos > 0 && <span className="text-green-600 font-medium">{concluidos} concluído{concluidos !== 1 ? 's' : ''}</span>}
              {revisao > 0 && <span className="text-blue-600 font-medium">{revisao} em revisão</span>}
              {pendentes > 0 && <span>{pendentes} pendente{pendentes !== 1 ? 's' : ''}</span>}
            </div>
          )}
        </div>
      </button>
      {aberta && (
        <div className={`border-t divide-y ${naoIdentificada ? 'border-amber-200/80 bg-white/60' : 'border-gray-100 bg-gray-50/50'} px-4 sm:px-5`}>
          {items.map(p => (
            <ProcessamentoRow
              key={p.id}
              p={p}
              deletingId={deletingId}
              onDelete={onDelete}
              compact
              naFila={idsNaFila?.has(p.id) ?? false}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default function DashboardPage() {
  const [processamentos, setProcessamentos] = useState<ProcessamentoComContagem[]>([])
  const [loading, setLoading] = useState(true)
  const [totalLancamentos, setTotalLancamentos] = useState<number | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ProcessamentoLancamento | null>(null)
  const [filtroConstrutora, setFiltroConstrutora] = useState<string | null>(null)
  const [recolhidas, setRecolhidas] = useState<Set<string>>(new Set())
  const [filaBatch, setFilaBatch] = useState<FilaBatch | null>(null)
  const filaProcessandoRef = useRef(false)

  useEffect(() => {
    setFilaBatch(lerFilaBatch())
  }, [])

  const idsNaFila = useMemo(
    () => (filaBatch ? new Set(filaBatch.ids) : undefined),
    [filaBatch]
  )

  const resumoFila = useMemo(
    () => (filaBatch ? resumoFilaBatch(filaBatch, processamentos) : null),
    [filaBatch, processamentos]
  )

  useEffect(() => {
    if (!filaBatch || processamentos.length === 0) return
    setRecolhidas(prev => {
      const temNaFila = processamentos.some(
        p => filaBatch.ids.includes(p.id) && getConstrutora(p) === CONSTRUTORA_NAO_IDENTIFICADA
      )
      if (!temNaFila) return prev
      const next = new Set(prev)
      next.delete(CONSTRUTORA_NAO_IDENTIFICADA)
      return next
    })
  }, [filaBatch, processamentos])

  const toggleRecolhida = useCallback((construtora: string) => {
    setRecolhidas(prev => {
      const next = new Set(prev)
      if (next.has(construtora)) next.delete(construtora)
      else next.add(construtora)
      return next
    })
  }, [])

  const gruposVisiveis = useMemo(() => {
    if (filtroConstrutora) {
      const items = processamentos.filter(p => getConstrutora(p) === filtroConstrutora)
      return items.length ? [[filtroConstrutora, items] as const] : []
    }
    const map = new Map<string, ProcessamentoComContagem[]>()
    for (const p of processamentos) {
      const c = getConstrutora(p)
      if (!map.has(c)) map.set(c, [])
      map.get(c)!.push(p)
    }
    return [...map.entries()].sort(([a], [b]) => ordenarConstrutoras(a, b))
  }, [processamentos, filtroConstrutora])

  const recolherTodas = useCallback(() => {
    setRecolhidas(new Set(gruposVisiveis.map(([c]) => c)))
  }, [gruposVisiveis])

  const expandirTodas = useCallback(() => {
    setRecolhidas(new Set())
  }, [])

  const construtorasComContagem = useMemo(() => {
    const map = new Map<string, number>()
    for (const p of processamentos) {
      const c = getConstrutora(p)
      map.set(c, (map.get(c) ?? 0) + 1)
    }
    return [...map.entries()].sort(([a], [b]) => ordenarConstrutoras(a, b))
  }, [processamentos])

  const refreshCount = useCallback(() => {
    fetch('/api/lancamentos/count')
      .then(r => r.json())
      .then(d => setTotalLancamentos(d.count ?? 0))
      .catch(() => {})
  }, [])

  const refreshProcessamentos = useCallback(async () => {
    try {
      const res = await fetch('/api/processamentos')
      const data = await res.json()
      if (!Array.isArray(data)) return

      setProcessamentos(prev => {
        let refreshCountNeeded = false
        for (const p of data) {
          const old = prev.find(x => x.id === p.id)
          if (!old || old.status === p.status) continue

          const nome = p.original_filename || 'PDF'
          if (emProgresso(old.status) && p.status === 'aguardando_confirmacao') {
            toast.success(`${nome} pronto para revisão.`)
          } else if (old.status === 'salvando' && p.status === 'concluido') {
            toast.success(`${nome} salvo no banco.`)
            refreshCountNeeded = true
          } else if (emProgresso(old.status) && p.status === 'erro') {
            toast.error(`Erro ao processar ${nome}.`)
          }
        }
        if (refreshCountNeeded) queueMicrotask(refreshCount)
        return data
      })
    } catch {
      // silencioso no polling
    }
  }, [refreshCount])

  useEffect(() => {
    fetch('/api/processamentos')
      .then(r => r.json())
      .then(data => setProcessamentos(Array.isArray(data) ? data : []))
      .catch(() => setProcessamentos([]))
      .finally(() => setLoading(false))

    refreshCount()
  }, [refreshCount])

  const temEmAndamento = processamentos.some(p => emProgresso(p.status))
  const temPendentes = processamentos.some(p => p.status === 'pendente')
  const filaAtiva = resumoFila?.ativa ?? false

  useEffect(() => {
    if (!temEmAndamento && !temPendentes && !filaAtiva) return
    const interval = setInterval(refreshProcessamentos, 3000)
    return () => clearInterval(interval)
  }, [temEmAndamento, temPendentes, filaAtiva, refreshProcessamentos])

  useEffect(() => {
    if (!filaBatch || processamentos.length === 0) return

    const resumo = resumoFilaBatch(filaBatch, processamentos)
    if (!resumo.ativa && resumo.concluidos >= resumo.total) {
      limparFilaBatch()
      return
    }

    const proximo = proximoPendente(processamentos, filaBatch.ids)
    if (!proximo || !filaBatch.ids.includes(proximo.id)) return

    if (filaProcessandoRef.current) return

    filaProcessandoRef.current = true
    ;(async () => {
      try {
        const res = await fetch('/api/processar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ processamentoId: proximo.id }),
        })
        if (!res.ok) {
          const data = await res.json()
          toast.error(data.error || 'Erro ao processar PDF')
        }
        await refreshProcessamentos()
      } catch {
        toast.error('Erro de conexão ao processar PDF')
      } finally {
        filaProcessandoRef.current = false
      }
    })()
  }, [filaBatch, processamentos, refreshProcessamentos])

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return

    setDeletingId(deleteTarget.id)
    try {
      const res = await fetch(`/api/processamentos/${deleteTarget.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao apagar')

      setProcessamentos(prev => prev.filter(item => item.id !== deleteTarget.id))
      setDeleteTarget(null)
      refreshCount()
      toast.success(
        data.lancamentosRemovidos > 0
          ? `Processamento apagado (${data.lancamentosRemovidos} lançamentos removidos).`
          : 'Processamento apagado.'
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao apagar')
    } finally {
      setDeletingId(null)
    }
  }, [deleteTarget, refreshCount])

  return (
    <div className="w-full max-w-[1600px] mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 mb-5 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Dashboard</h1>
        <Link
          href="/upload"
          className="inline-flex items-center justify-center px-5 py-2.5 bg-gray-900 text-white rounded-lg hover:bg-gray-800 text-base font-medium w-full sm:w-auto touch-manipulation"
        >
          + Novo Upload
        </Link>
      </div>

      {filaBatch && (
        <FilaProcessamentoBanner fila={filaBatch} processamentos={processamentos} />
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium text-gray-500">Lançamentos no Banco</CardTitle>
          </CardHeader>
          <CardContent>
            <Link href="/imoveis" className="text-4xl font-bold hover:text-gray-700 transition-colors">
              {totalLancamentos ?? '—'}
            </Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium text-gray-500">PDFs Processados</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-4xl font-bold">{processamentos.filter(p => p.status === 'concluido').length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium text-gray-500">Aguardando Revisão</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-4xl font-bold">{processamentos.filter(p => p.status === 'aguardando_confirmacao').length}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <CardTitle className="text-lg">Histórico de Processamentos</CardTitle>
              {gruposVisiveis.length > 1 && (
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={expandirTodas}>
                    Expandir todas
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={recolherTodas}>
                    Recolher todas
                  </Button>
                </div>
              )}
            </div>
            {processamentos.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-sm text-gray-500">Filtrar por construtora</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setFiltroConstrutora(null)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                      filtroConstrutora === null
                        ? 'bg-gray-900 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    Todas ({processamentos.length})
                  </button>
                  {construtorasComContagem.map(([nome, count]) => (
                    <button
                      key={nome}
                      type="button"
                      onClick={() => setFiltroConstrutora(nome)}
                      className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                        filtroConstrutora === nome
                          ? 'bg-gray-900 text-white'
                          : nome === CONSTRUTORA_NAO_IDENTIFICADA
                            ? 'bg-amber-50 text-amber-900 hover:bg-amber-100 border border-amber-200'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {nome} ({count})
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-gray-500 text-base">Carregando...</p>
          ) : processamentos.length === 0 ? (
            <p className="text-gray-500 text-base">Nenhum processamento ainda. Comece enviando um PDF!</p>
          ) : gruposVisiveis.length === 0 ? (
            <p className="text-gray-500 text-base">Nenhum PDF para esta construtora.</p>
          ) : (
            <div className="space-y-4">
              {gruposVisiveis.map(([construtora, items]) => (
                <ConstrutoraBloco
                  key={construtora}
                  construtora={construtora}
                  items={items}
                  aberta={!recolhidas.has(construtora)}
                  onToggle={() => toggleRecolhida(construtora)}
                  deletingId={deletingId}
                  onDelete={setDeleteTarget}
                  idsNaFila={idsNaFila}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={open => { if (!open) setDeleteTarget(null) }}
        title="Apagar processamento?"
        description={
          <>
            <p>
              Você está prestes a apagar{' '}
              <span className="font-medium text-foreground">
                {deleteTarget?.original_filename || 'este processamento'}
              </span>
              .
            </p>
            <p>
              Isso remove o PDF, os lançamentos salvos no banco e todos os dados extraídos.
              <span className="font-medium text-red-600"> Não dá para desfazer.</span>
            </p>
          </>
        }
        confirmLabel="Apagar"
        cancelLabel="Cancelar"
        variant="destructive"
        loading={!!deletingId}
        onConfirm={handleDelete}
      />
    </div>
  )
}
