/** Progresso aproximado por fase — não reflete faixas reais da IA. */
const PROGRESSO_BASE: Record<string, number> = {
  pendente: 8,
  extraindo: 12,
  analisando: 22,
  processando: 30,
}

const PROCESSANDO_MAX = 92
/** PDF grande (~16 páginas) — referência para a curva de tempo em `processando`. */
const ESTIMADO_PROCESSANDO_MS = 15 * 60 * 1000

export function calcularProgressoEstimado(
  status: string,
  processandoDesde: number | null,
  posicaoFila: number | null
): number {
  if (status === 'pendente') {
    if (posicaoFila != null && posicaoFila > 1) return 3
    return PROGRESSO_BASE.pendente
  }

  const base = PROGRESSO_BASE[status]
  if (base == null) return 0

  if (status !== 'processando') return base

  const margem = PROCESSANDO_MAX - base
  if (!processandoDesde) return base

  const elapsed = Date.now() - processandoDesde
  const creep = Math.min(margem, (elapsed / ESTIMADO_PROCESSANDO_MS) * margem)
  return Math.round(base + creep)
}

export function sublabelProgressoEstimado(status: string): string {
  if (status === 'processando') {
    return 'PDFs grandes podem levar 10–20 minutos. A porcentagem é estimada.'
  }
  if (status === 'pendente') {
    return 'Apenas um PDF é processado por vez. Acompanhe a fila no Dashboard.'
  }
  return 'A porcentagem é estimada — não reflete o progresso exato da IA.'
}
