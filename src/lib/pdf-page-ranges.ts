/** Converte lista ordenada de páginas (1-based) em texto compacto: [1,2,3,5] → "1-3,5". */
export function formatarPaginas(paginas: number[]): string {
  if (paginas.length === 0) return ''

  const sorted = [...new Set(paginas)].sort((a, b) => a - b)
  const partes: string[] = []
  let inicio = sorted[0]
  let fim = sorted[0]

  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === fim + 1) {
      fim = sorted[i]
    } else {
      partes.push(inicio === fim ? String(inicio) : `${inicio}-${fim}`)
      inicio = sorted[i]
      fim = sorted[i]
    }
  }
  partes.push(inicio === fim ? String(inicio) : `${inicio}-${fim}`)
  return partes.join(',')
}

export type ParsePaginasResult =
  | { ok: true; paginas: number[] }
  | { ok: false; error: string }

/** Interpreta "1,5-8" em páginas 1-based, validadas contra totalPaginas. */
export function parsearPaginas(texto: string, totalPaginas: number): ParsePaginasResult {
  const trimmed = texto.trim()
  if (!trimmed) return { ok: true, paginas: [] }

  const paginas = new Set<number>()

  for (const parte of trimmed.split(',')) {
    const token = parte.trim()
    if (!token) continue

    if (token.includes('-')) {
      const [aRaw, bRaw] = token.split('-').map(s => s.trim())
      const a = Number(aRaw)
      const b = Number(bRaw)
      if (!Number.isInteger(a) || !Number.isInteger(b) || a < 1 || b < 1) {
        return { ok: false, error: `Intervalo inválido: "${token}"` }
      }
      const inicio = Math.min(a, b)
      const fim = Math.max(a, b)
      for (let p = inicio; p <= fim; p++) {
        if (p > totalPaginas) {
          return { ok: false, error: `Página ${p} excede o total (${totalPaginas})` }
        }
        paginas.add(p)
      }
    } else {
      const p = Number(token)
      if (!Number.isInteger(p) || p < 1) {
        return { ok: false, error: `Página inválida: "${token}"` }
      }
      if (p > totalPaginas) {
        return { ok: false, error: `Página ${p} excede o total (${totalPaginas})` }
      }
      paginas.add(p)
    }
  }

  return { ok: true, paginas: [...paginas].sort((a, b) => a - b) }
}

export function validarPaginasRemover(paginas: number[], totalPaginas: number): string | null {
  if (paginas.length === 0) return null
  if (paginas.length >= totalPaginas) {
    return 'Não é possível remover todas as páginas do documento.'
  }
  for (const p of paginas) {
    if (!Number.isInteger(p) || p < 1 || p > totalPaginas) {
      return `Página ${p} inválida (total: ${totalPaginas}).`
    }
  }
  return null
}
