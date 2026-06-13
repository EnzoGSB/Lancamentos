const PADRAO = 4
const MIN = 1
const MAX = 10

/** Faixas processadas em paralelo por PDF (env: EXTRACTION_FAIXA_CONCURRENCY). */
export function lerConcorrenciaFaixas(): number {
  const raw = process.env.EXTRACTION_FAIXA_CONCURRENCY?.trim()
  if (!raw) return PADRAO

  const n = parseInt(raw, 10)
  if (!Number.isFinite(n)) return PADRAO

  return Math.min(MAX, Math.max(MIN, n))
}
