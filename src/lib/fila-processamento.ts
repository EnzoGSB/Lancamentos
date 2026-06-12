const STORAGE_KEY = 'tabeloes-fila-batch'

export type FilaBatch = {
  ids: string[]
  createdAt: number
}

export function salvarFilaBatch(ids: string[]) {
  if (typeof sessionStorage === 'undefined' || ids.length === 0) return
  const payload: FilaBatch = { ids, createdAt: Date.now() }
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
}

export function lerFilaBatch(): FilaBatch | null {
  if (typeof sessionStorage === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as FilaBatch
    if (!Array.isArray(parsed.ids) || parsed.ids.length === 0) return null
    return parsed
  } catch {
    return null
  }
}

export function limparFilaBatch() {
  if (typeof sessionStorage === 'undefined') return
  sessionStorage.removeItem(STORAGE_KEY)
}

type ProcessamentoMin = { id: string; status: string; created_at?: string | null }

const STATUS_EM_PROGRESSO = ['extraindo', 'analisando', 'processando', 'salvando'] as const

function ordenarPendentes(pendentes: ProcessamentoMin[]) {
  return [...pendentes].sort((a, b) => {
    const ta = a.created_at ? new Date(a.created_at).getTime() : 0
    const tb = b.created_at ? new Date(b.created_at).getTime() : 0
    return ta - tb
  })
}

export function resumoFilaBatch(
  fila: FilaBatch,
  processamentos: ProcessamentoMin[]
) {
  const map = new Map(processamentos.map(p => [p.id, p]))
  let processados = 0
  let erros = 0
  let emProgresso: string | null = null
  let pendentes = 0

  for (const id of fila.ids) {
    const p = map.get(id)
    if (!p) continue
    if (p.status === 'pendente') pendentes++
    else if (['extraindo', 'analisando', 'processando'].includes(p.status)) {
      emProgresso = id
    } else if (p.status === 'erro') erros++
    else processados++
  }

  const total = fila.ids.length
  const concluidos = processados + erros
  const ativa = pendentes > 0 || emProgresso != null

  return { total, processados, erros, concluidos, pendentes, emProgresso, ativa }
}

export function proximoPendente(
  processamentos: ProcessamentoMin[],
  preferirIds?: string[]
): ProcessamentoMin | null {
  const emAndamento = processamentos.some(p =>
    STATUS_EM_PROGRESSO.includes(p.status as (typeof STATUS_EM_PROGRESSO)[number])
  )
  if (emAndamento) return null

  const pendentes = ordenarPendentes(processamentos.filter(p => p.status === 'pendente'))
  if (pendentes.length === 0) return null

  if (preferirIds?.length) {
    const set = new Set(preferirIds)
    const naFila = pendentes.filter(p => set.has(p.id))
    if (naFila.length > 0) return naFila[0]
  }

  return pendentes[0]
}
