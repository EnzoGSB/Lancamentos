export type ProcessamentoMin = {
  id: string
  status: string
  created_at?: string | null
  original_filename?: string | null
  page_count?: number | null
}

/** Status visíveis como “processando” na UI. */
export const STATUS_PROCESSAMENTO_OCUPADO = ['extraindo', 'analisando', 'processando'] as const

/** Status que bloqueiam o próximo da fila no servidor (processamento ativo). */
export const STATUS_SLOT_OCUPADO = [...STATUS_PROCESSAMENTO_OCUPADO] as const

export const STATUS_EM_PROGRESSO = [
  ...STATUS_PROCESSAMENTO_OCUPADO,
  'salvando',
] as const

function ordenarPendentes(pendentes: ProcessamentoMin[]) {
  return [...pendentes].sort((a, b) => {
    const pa = a.page_count ?? Number.MAX_SAFE_INTEGER
    const pb = b.page_count ?? Number.MAX_SAFE_INTEGER
    if (pa !== pb) return pa - pb

    const ta = a.created_at ? new Date(a.created_at).getTime() : 0
    const tb = b.created_at ? new Date(b.created_at).getTime() : 0
    return ta - tb
  })
}

export function haProcessamentoEmAndamento(processamentos: ProcessamentoMin[]): boolean {
  return processamentos.some(p =>
    STATUS_PROCESSAMENTO_OCUPADO.includes(p.status as (typeof STATUS_PROCESSAMENTO_OCUPADO)[number])
  )
}

export function emProgresso(status: string): boolean {
  return (STATUS_EM_PROGRESSO as readonly string[]).includes(status)
}

/** Próximo PDF pendente na fila global (menos páginas primeiro; empate por created_at). */
export function proximoPendente(processamentos: ProcessamentoMin[]): ProcessamentoMin | null {
  if (haProcessamentoEmAndamento(processamentos)) return null

  const pendentes = ordenarPendentes(processamentos.filter(p => p.status === 'pendente'))
  return pendentes[0] ?? null
}

export function posicaoNaFila(id: string, processamentos: ProcessamentoMin[]): number | null {
  const pendentes = ordenarPendentes(processamentos.filter(p => p.status === 'pendente'))
  const idx = pendentes.findIndex(p => p.id === id)
  return idx >= 0 ? idx + 1 : null
}

export type ResumoFilaGlobal = {
  totalPendentes: number
  emProgresso: ProcessamentoMin | null
  ativa: boolean
}

export function resumoFilaGlobal(processamentos: ProcessamentoMin[]): ResumoFilaGlobal {
  const pendentes = processamentos.filter(p => p.status === 'pendente')
  const emProgresso =
    processamentos.find(p =>
      STATUS_PROCESSAMENTO_OCUPADO.includes(p.status as (typeof STATUS_PROCESSAMENTO_OCUPADO)[number])
    ) ?? null

  return {
    totalPendentes: pendentes.length,
    emProgresso,
    ativa: pendentes.length > 0 || emProgresso != null,
  }
}

/** IDs aguardando slot (exclui o primeiro da fila quando nada está processando). */
export function idsAguardandoFila(processamentos: ProcessamentoMin[]): Set<string> {
  const pendentes = ordenarPendentes(processamentos.filter(p => p.status === 'pendente'))
  if (pendentes.length === 0) return new Set()

  const ocupado = processamentos.some(p =>
    STATUS_PROCESSAMENTO_OCUPADO.includes(p.status as (typeof STATUS_PROCESSAMENTO_OCUPADO)[number])
  )
  if (ocupado) {
    return new Set(pendentes.map(p => p.id))
  }

  return new Set(pendentes.slice(1).map(p => p.id))
}
