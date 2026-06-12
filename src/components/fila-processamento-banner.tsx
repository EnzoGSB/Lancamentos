'use client'

import { Loader2 } from 'lucide-react'
import type { ProcessamentoLancamento } from '@/lib/types'
import { resumoFilaBatch, type FilaBatch } from '@/lib/fila-processamento'

type FilaProcessamentoBannerProps = {
  fila: FilaBatch
  processamentos: ProcessamentoLancamento[]
}

export function FilaProcessamentoBanner({ fila, processamentos }: FilaProcessamentoBannerProps) {
  const resumo = resumoFilaBatch(fila, processamentos)

  const atual = resumo.emProgresso
    ? processamentos.find(p => p.id === resumo.emProgresso)
    : null

  const todosProntos = resumo.concluidos >= resumo.total

  return (
    <div
      className={`rounded-xl border px-4 py-3 sm:px-5 sm:py-4 mb-6 ${
        todosProntos
          ? 'border-green-200 bg-green-50'
          : 'border-blue-200 bg-blue-50'
      }`}
    >
      <div className="flex items-start gap-3">
        {!todosProntos && <Loader2 className="size-5 shrink-0 text-blue-600 animate-spin mt-0.5" />}
        <div className="min-w-0 flex-1">
          <p className={`font-semibold ${todosProntos ? 'text-green-900' : 'text-blue-900'}`}>
            {todosProntos
              ? 'Fila concluída — revise os PDFs abaixo'
              : `Fila de processamento · ${resumo.concluidos} de ${resumo.total} finalizados`}
          </p>
          {!todosProntos && atual && (
            <p className="text-sm text-blue-800 mt-1 truncate">
              Processando: {atual.original_filename || 'PDF'}
            </p>
          )}
          {todosProntos && resumo.erros > 0 && (
            <p className="text-sm text-amber-800 mt-1">
              {resumo.erros} {resumo.erros === 1 ? 'arquivo com erro' : 'arquivos com erro'} — confira abaixo.
            </p>
          )}
          {todosProntos && resumo.processados > 0 && (
            <p className="text-sm text-green-800 mt-1">
              {resumo.processados} {resumo.processados === 1 ? 'PDF pronto' : 'PDFs prontos'} para revisão.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
