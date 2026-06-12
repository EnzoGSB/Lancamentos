'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/confirm-dialog'
import type { ProcessamentoLancamento } from '@/lib/types'

type ProcessamentoComContagem = ProcessamentoLancamento & {
  empreendimentos_inseridos?: number | null
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

export default function DashboardPage() {
  const [processamentos, setProcessamentos] = useState<ProcessamentoComContagem[]>([])
  const [loading, setLoading] = useState(true)
  const [totalLancamentos, setTotalLancamentos] = useState<number | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ProcessamentoLancamento | null>(null)

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

  useEffect(() => {
    if (!temEmAndamento) return
    const interval = setInterval(refreshProcessamentos, 3000)
    return () => clearInterval(interval)
  }, [temEmAndamento, refreshProcessamentos])

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
          <CardTitle className="text-lg">Histórico de Processamentos</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-gray-500 text-base">Carregando...</p>
          ) : processamentos.length === 0 ? (
            <p className="text-gray-500 text-base">Nenhum processamento ainda. Comece enviando um PDF!</p>
          ) : (
            <div className="divide-y">
              {processamentos.map((p) => {
                const statusInfo = STATUS_LABELS[p.status] ?? { label: p.status, variant: 'secondary' as const }
                const analise = p.analise_ia as { construtora?: string; tipo?: string } | null

                return (
                  <div key={p.id} className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 py-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-base font-medium text-gray-900 truncate">
                        {p.original_filename || 'Arquivo sem nome'}
                      </p>
                      <p className="text-sm text-gray-500">
                        {analise?.construtora ?? (p.tipo === 'multi' ? 'Multi-empreendimento' : p.tipo === 'single' ? 'Empreendimento único' : '—')}
                        {p.created_at && ` • ${new Date(p.created_at).toLocaleString('pt-BR')}`}
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
                        <Link
                          href={`/mapeamento/${p.id}`}
                          className="text-sm px-4 py-1.5 bg-gray-900 text-white rounded hover:bg-gray-800"
                        >
                          Processar
                        </Link>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="text-gray-400 hover:text-red-600 hover:bg-red-50"
                        disabled={deletingId === p.id}
                        onClick={() => setDeleteTarget(p)}
                        title="Apagar processamento"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>
                )
              })}
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
