/** Heurística de busca: inferir andar a partir do código da unidade (não grava no banco). */

export function extrairDigitosUnidade(unidade: string | null | undefined): string | null {
  if (!unidade?.trim()) return null
  const digits = unidade.replace(/\D/g, '')
  return digits || null
}

/**
 * Convenção comum em tabelões:
 * - 3+ dígitos começando com 10–99 → andar de 2 dígitos (124 → 12, 1201 → 12)
 * - 2 dígitos → 1º dígito = andar (21 → 2, 12 → 1)
 * - 1 dígito → andar direto
 */
export function inferirAndarDaUnidade(unidade: string | null | undefined): number | null {
  const digits = extrairDigitosUnidade(unidade)
  if (!digits) return null

  if (digits.length >= 3) {
    const andar2 = parseInt(digits.slice(0, 2), 10)
    if (andar2 >= 10 && andar2 <= 99) return andar2
  }

  if (digits.length >= 2) {
    const andar1 = parseInt(digits[0], 10)
    if (andar1 >= 1 && andar1 <= 9) return andar1
  }

  const n = parseInt(digits, 10)
  return Number.isFinite(n) && n >= 1 && n <= 99 ? n : null
}

export function extrairNumerosAndar(texto: string): number[] {
  const nums: number[] = []
  const s = texto.trim()

  const faixa = s.match(/(\d+)\s*º?\s*-\s*(\d+)\s*º?/i)
  if (faixa) {
    const a = parseInt(faixa[1], 10)
    const b = parseInt(faixa[2], 10)
    if (Number.isFinite(a)) nums.push(a)
    if (Number.isFinite(b)) nums.push(b)
  }

  for (const m of s.matchAll(/(\d+)\s*º/gi)) {
    const n = parseInt(m[1], 10)
    if (Number.isFinite(n)) nums.push(n)
  }

  if (/^\d+$/.test(s)) {
    nums.push(parseInt(s, 10))
  }

  return [...new Set(nums.filter(n => n >= 0 && n <= 99))]
}

export function matchesTextoAndar(andar: string | null | undefined, termo: string): boolean {
  if (!andar?.trim()) return false

  const aLower = andar.toLowerCase()
  const tLower = termo.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')

  if (/cobertura/i.test(tLower) && /cobertura/i.test(aLower)) return true
  if (/terreo/i.test(tLower) && /t[eé]rreo/i.test(aLower)) return true

  if (aLower.includes(termo.toLowerCase())) return true

  const termoNums = extrairNumerosAndar(termo)
  if (!termoNums.length) return false

  const faixa = andar.match(/(\d+)\s*º?\s*-\s*(\d+)\s*º?/i)
  if (faixa) {
    const min = Math.min(parseInt(faixa[1], 10), parseInt(faixa[2], 10))
    const max = Math.max(parseInt(faixa[1], 10), parseInt(faixa[2], 10))
    if (termoNums.some(n => n >= min && n <= max)) return true
  }

  const andarNums = extrairNumerosAndar(andar)
  return termoNums.some(n => andarNums.includes(n))
}

export function matchesAndarPorUnidade(unidade: string | null | undefined, termo: string): boolean {
  const termoNums = extrairNumerosAndar(termo)
  if (!termoNums.length) return false

  const inferido = inferirAndarDaUnidade(unidade)
  if (inferido == null) return false

  return termoNums.some(n => n === inferido)
}

export function matchesFiltroAndar(
  l: { andar?: string | null; unidade?: string | null },
  termos: string[] | undefined
): boolean {
  if (!termos?.length) return true

  return termos.some(termo => {
    if (matchesTextoAndar(l.andar, termo)) return true
    if (l.andar?.trim()) return false
    return matchesAndarPorUnidade(l.unidade, termo)
  })
}

export function padroesAndarSqlOr(termos: string[]): string[] {
  const parts: string[] = []

  for (const t of termos) {
    const escaped = t.replace(/[%_\\]/g, '\\$&')
    parts.push(`andar.ilike.%${escaped}%`)

    for (const n of extrairNumerosAndar(t)) {
      parts.push(`andar.ilike.%${n}%`)
      parts.push(`unidade.ilike.${n}%`)
    }
  }

  return [...new Set(parts)]
}
