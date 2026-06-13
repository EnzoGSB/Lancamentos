'use client'

import { Loader2 } from 'lucide-react'
import type { ProcessamentoLancamento } from '@/lib/types'
import { resumoFilaGlobal } from '@/lib/fila-processamento'

type FilaProcessamentoBannerProps = {
  processamentos: ProcessamentoLancamento[]
}

export function FilaProcessamentoBanner({ processamentos }: FilaProcessamentoBannerProps) {
  const resumo = resumoFilaGlobal(processamentos)
  const atual = resumo.emProgresso

  if (!resumo.ativa) return null

  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 sm:px-5 sm:py-4 mb-6">
      <div className="flex items-start gap-3">
        <Loader2 className="size-5 shrink-0 text-blue-600 animate-spin mt-0.5" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-blue-900">
            Fila de processamento · um PDF por vez
          </p>
          {atual && (
            <p className="text-sm text-blue-800 mt-1 truncate">
              Processando: {atual.original_filename || 'PDF'}
            </p>
          )}
          {resumo.totalPendentes > 0 && (
            <p className="text-sm text-blue-800 mt-1">
              {resumo.totalPendentes}{' '}
              {resumo.totalPendentes === 1 ? 'PDF aguardando' : 'PDFs aguardando'} na fila
              {atual ? ' — iniciará automaticamente em seguida' : ''}.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
