'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { ProcessamentoLancamento } from '@/lib/types'

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

export default function Dashboard() {
  const [processamentos, setProcessamentos] = useState<ProcessamentoLancamento[]>([])
  const [loading, setLoading] = useState(true)
  const [totalLancamentos, setTotalLancamentos] = useState<number | null>(null)

  useEffect(() => {
    fetch('/api/processamentos')
      .then(r => r.json())
      .then(data => setProcessamentos(Array.isArray(data) ? data : []))
      .catch(() => setProcessamentos([]))
      .finally(() => setLoading(false))

    fetch('/api/lancamentos/count')
      .then(r => r.json())
      .then(d => setTotalLancamentos(d.count ?? 0))
      .catch(() => {})
  }, [])

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <Link
          href="/upload"
          className="inline-flex items-center px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 text-sm font-medium"
        >
          + Novo Upload
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">Lançamentos no Banco</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{totalLancamentos ?? '—'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">PDFs Processados</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{processamentos.filter(p => p.status === 'concluido').length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">Aguardando Revisão</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{processamentos.filter(p => p.status === 'aguardando_confirmacao').length}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Histórico de Processamentos</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-gray-500 text-sm">Carregando...</p>
          ) : processamentos.length === 0 ? (
            <p className="text-gray-500 text-sm">Nenhum processamento ainda. Comece enviando um PDF!</p>
          ) : (
            <div className="divide-y">
              {processamentos.map((p) => {
                const statusInfo = STATUS_LABELS[p.status] ?? { label: p.status, variant: 'secondary' as const }
                const analise = p.analise_ia as { construtora?: string; tipo?: string } | null

                return (
                  <div key={p.id} className="flex items-center justify-between py-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {p.original_filename || 'Arquivo sem nome'}
                      </p>
                      <p className="text-xs text-gray-500">
                        {analise?.construtora ?? (p.tipo === 'multi' ? 'Multi-empreendimento' : p.tipo === 'single' ? 'Empreendimento único' : '—')}
                        {p.created_at && ` • ${new Date(p.created_at).toLocaleString('pt-BR')}`}
                      </p>
                      {p.status === 'concluido' && p.resultado && (
                        <p className="text-xs text-green-600 mt-1">
                          {(p.resultado as { inseridos: number }).inseridos} lançamentos inseridos
                        </p>
                      )}
                      {p.erro && <p className="text-xs text-red-500 mt-1">{p.erro}</p>}
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                      {p.status === 'aguardando_confirmacao' && (
                        <Link
                          href={`/mapeamento/${p.id}`}
                          className="text-xs px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
                        >
                          Revisar
                        </Link>
                      )}
                      {p.status === 'concluido' && (
                        <Link
                          href={`/preview/${p.id}`}
                          className="text-xs px-3 py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                        >
                          Ver dados
                        </Link>
                      )}
                      {p.status === 'pendente' && (
                        <Link
                          href={`/mapeamento/${p.id}`}
                          className="text-xs px-3 py-1 bg-gray-900 text-white rounded hover:bg-gray-800"
                        >
                          Processar
                        </Link>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
