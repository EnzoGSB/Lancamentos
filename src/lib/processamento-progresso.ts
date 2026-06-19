import type { LancamentoAI } from './types'

/** Progresso salvo em lancamentos_ai enquanto a extração roda em várias etapas. */
export type ProgressoExtracao = {
  proximaFaixa: number
  totalFaixas: number
  resultadosPorFaixa: LancamentoAI[][]
  modo: 'single_tiling' | 'multi' | 'single_pdf'
}

const CHAVE = '_progresso' as const

export function lerProgressoExtracao(lancamentosAi: unknown): ProgressoExtracao | null {
  if (!lancamentosAi || typeof lancamentosAi !== 'object') return null
  const raw = (lancamentosAi as Record<string, unknown>)[CHAVE]
  if (!raw || typeof raw !== 'object') return null
  const p = raw as ProgressoExtracao
  if (
    typeof p.proximaFaixa !== 'number'
    || typeof p.totalFaixas !== 'number'
    || !Array.isArray(p.resultadosPorFaixa)
    || !['single_tiling', 'multi', 'single_pdf'].includes(p.modo)
  ) {
    return null
  }
  return p
}

export function progressoIncompleto(p: ProgressoExtracao): boolean {
  return p.proximaFaixa < p.totalFaixas
}

export function serializarLancamentosAiComProgresso(
  progresso: ProgressoExtracao
): { _progresso: ProgressoExtracao; lancamentos: LancamentoAI[] } {
  const flat = progresso.resultadosPorFaixa.flat()
  return { _progresso: progresso, lancamentos: flat }
}

export function criarProgressoVazio(
  totalFaixas: number,
  modo: ProgressoExtracao['modo']
): ProgressoExtracao {
  return {
    proximaFaixa: 0,
    totalFaixas,
    resultadosPorFaixa: Array.from({ length: totalFaixas }, () => []),
    modo,
  }
}
