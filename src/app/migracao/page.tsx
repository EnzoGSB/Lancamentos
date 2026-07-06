'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  Database,
  Download,
  ExternalLink,
  Loader2,
  RefreshCw,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { SqlScriptBlock } from '@/components/sql-script-block'
import { MIGRACAO_PASSOS, SQL_LIMPAR_DESTINO } from '@/lib/migracao-sql'

type MigracaoStats = {
  projectRef: string | null
  supabaseUrl: string
  counts: Record<string, number>
  storage: {
    bucket: string | null
    arquivosUploads: number
  }
}

const TABELA_LABELS: Record<string, string> = {
  processamentos_lancamentos: 'Processamentos',
  lancamentos: 'Lançamentos',
  extracao_pdf_cache: 'Cache de extração',
}

function badgeProjeto(projeto: 'destino' | 'origem' | 'ambos') {
  if (projeto === 'destino') return <Badge variant="default">Projeto destino</Badge>
  if (projeto === 'origem') return <Badge variant="secondary">Projeto origem (atual)</Badge>
  return <Badge variant="outline">Ambos</Badge>
}

export default function MigracaoPage() {
  const [stats, setStats] = useState<MigracaoStats | null>(null)
  const [loadingStats, setLoadingStats] = useState(true)
  const [downloading, setDownloading] = useState(false)

  const carregarStats = useCallback(async () => {
    setLoadingStats(true)
    try {
      const res = await fetch('/api/migracao/stats')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Falha ao carregar estatísticas')
      setStats(data)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao carregar estatísticas')
    } finally {
      setLoadingStats(false)
    }
  }, [])

  useEffect(() => {
    carregarStats()
  }, [carregarStats])

  const baixarSqlCompleto = useCallback(async () => {
    setDownloading(true)
    try {
      const res = await fetch('/api/migracao/export')
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'Falha ao gerar exportação')
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `tabeloes-migracao-${new Date().toISOString().slice(0, 10)}.sql`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Arquivo SQL baixado — cole no SQL Editor do projeto destino')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao baixar SQL')
    } finally {
      setDownloading(false)
    }
  }, [])

  const sqlEditorUrl = stats?.projectRef
    ? `https://supabase.com/dashboard/project/${stats.projectRef}/sql/new`
    : 'https://supabase.com/dashboard'

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-8">
      <div>
        <div className="flex items-center gap-2 text-gray-900">
          <Database className="size-6 shrink-0" />
          <h1 className="text-2xl font-bold">Migração Supabase</h1>
        </div>
        <p className="text-gray-600 mt-2 text-base leading-relaxed">
          Migre tabelas e dados para outro projeto Supabase usando o SQL Editor.
          A ordem importa: schema no destino, exportação no origem, importação no destino.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div>
              <CardTitle>Projeto atual (origem)</CardTitle>
              <CardDescription className="mt-1">
                Use estes números para validar a migração no projeto destino.
              </CardDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={carregarStats}
              disabled={loadingStats}
              className="shrink-0"
            >
              {loadingStats ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}
              <span className="ml-2">Atualizar</span>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {loadingStats && !stats ? (
            <div className="flex items-center gap-2 text-gray-500">
              <Loader2 className="size-4 animate-spin" />
              Carregando...
            </div>
          ) : stats ? (
            <>
              <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600">
                <span className="font-mono truncate max-w-full">{stats.supabaseUrl}</span>
                {stats.projectRef && (
                  <a
                    href={sqlEditorUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                  >
                    Abrir SQL Editor
                    <ExternalLink className="size-3.5" />
                  </a>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                {Object.entries(stats.counts).map(([tabela, total]) => (
                  <div key={tabela} className="rounded-lg border bg-gray-50 px-4 py-3">
                    <p className="text-sm text-gray-500">{TABELA_LABELS[tabela] ?? tabela}</p>
                    <p className="text-2xl font-bold tabular-nums text-gray-900">{total}</p>
                  </div>
                ))}
              </div>

              <p className="text-sm text-gray-600">
                Storage: bucket <code className="text-xs bg-gray-100 px-1 rounded">pdfs</code>
                {' · '}
                {stats.storage.arquivosUploads} arquivo(s) em <code className="text-xs bg-gray-100 px-1 rounded">uploads/</code>
              </p>
            </>
          ) : null}
        </CardContent>
      </Card>

      <Card className="border-blue-200 bg-blue-50/50">
        <CardHeader>
          <CardTitle className="text-blue-950">Atalho: exportar tudo de uma vez</CardTitle>
          <CardDescription>
            Gera um arquivo <strong>.sql</strong> com schema + INSERTs prontos. Cole no SQL Editor do
            projeto destino (ou divida em partes se o arquivo for grande).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button type="button" onClick={baixarSqlCompleto} disabled={downloading || loadingStats}>
            {downloading ? (
              <Loader2 className="size-4 animate-spin mr-2" />
            ) : (
              <Download className="size-4 mr-2" />
            )}
            Baixar SQL completo
          </Button>
        </CardContent>
      </Card>

      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 flex gap-3">
        <AlertTriangle className="size-5 shrink-0 text-amber-700 mt-0.5" />
        <div className="text-sm text-amber-950 space-y-2">
          <p className="font-medium">PDFs no Storage não migram pelo SQL Editor</p>
          <p>
            Os caminhos em <code className="bg-amber-100 px-1 rounded">storage_path</code> são copiados,
            mas os arquivos precisam ir para o bucket <code className="bg-amber-100 px-1 rounded">pdfs</code>{' '}
            do projeto destino (Dashboard → Storage → upload manual, ou Supabase CLI{' '}
            <code className="bg-amber-100 px-1 rounded">storage cp</code>).
          </p>
          <p>
            Depois da migração, atualize o <code className="bg-amber-100 px-1 rounded">.env.local</code>{' '}
            com URL e chaves do novo projeto.
          </p>
        </div>
      </div>

      <div className="space-y-8">
        <h2 className="text-lg font-semibold text-gray-900">Passo a passo no SQL Editor</h2>

        {MIGRACAO_PASSOS.map((passo, index) => (
          <Card key={passo.id}>
            <CardHeader>
              <div className="flex flex-wrap items-center gap-2">
                {badgeProjeto(passo.projeto)}
                {passo.opcional && <Badge variant="outline">Opcional</Badge>}
              </div>
              <CardTitle className="mt-2">{passo.titulo}</CardTitle>
              <CardDescription>{passo.descricao}</CardDescription>
            </CardHeader>
            <CardContent>
              <SqlScriptBlock sql={passo.sql} />
            </CardContent>
            {index < MIGRACAO_PASSOS.length - 1 && (
              <div className="flex justify-center pb-2 text-gray-300">
                <ArrowRight className="size-5 rotate-90" />
              </div>
            )}
          </Card>
        ))}
      </div>

      <Card className="border-red-200">
        <CardHeader>
          <CardTitle className="text-red-900">Limpar projeto destino (refazer migração)</CardTitle>
          <CardDescription>
            Só execute no projeto NOVO se precisar apagar tudo e importar de novo.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SqlScriptBlock sql={SQL_LIMPAR_DESTINO} />
        </CardContent>
      </Card>
    </div>
  )
}
