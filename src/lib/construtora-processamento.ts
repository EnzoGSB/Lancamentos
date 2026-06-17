const CONSTRUTORAS_IGNORADAS = new Set([
  'a identificar',
  'não informada',
  'nao informada',
  'não informado',
  'nao informado',
])

function normalizarNomeConstrutora(nome: string): string {
  return nome.trim().replace(/\s+/g, ' ')
}

function construtoraLinhaVazia(construtora: string | null | undefined): boolean {
  const c = construtora?.trim()
  if (!c) return true
  return CONSTRUTORAS_IGNORADAS.has(c.toLowerCase())
}

/** A IA não identificou construtora (vazio ou placeholder). */
export function analiseSemConstrutora(construtora: string | null | undefined): boolean {
  return construtoraLinhaVazia(construtora)
}

/**
 * Coluna Construtora consistente: todas as linhas com o mesmo nome
 * ou vazias/placeholder. Não permite nomes diferentes na mesma tabela.
 */
export function analisarColunaConstrutora(
  lancamentos: { construtora?: string | null }[]
): { ok: true; nome: string | null } | { ok: false; error: string } {
  const nomes = new Set<string>()

  for (const l of lancamentos) {
    const bruto = l.construtora?.trim()
    if (!bruto || CONSTRUTORAS_IGNORADAS.has(bruto.toLowerCase())) continue
    nomes.add(normalizarNomeConstrutora(bruto))
  }

  if (nomes.size > 1) {
    return {
      ok: false,
      error: 'A coluna Construtora deve ter o mesmo nome em todas as linhas (ou ficar vazia).',
    }
  }

  return { ok: true, nome: nomes.size === 1 ? [...nomes][0] : null }
}

/** @deprecated Use analisarColunaConstrutora — mantido para compatibilidade interna. */
export function todasLinhasComConstrutora(
  lancamentos: { construtora?: string | null }[]
): boolean {
  const r = analisarColunaConstrutora(lancamentos)
  return r.ok && r.nome != null
}

/** Nome único da coluna quando todas as linhas preenchidas são iguais (ou só uma distinta). */
export function inferirConstrutoraDosLancamentos(
  lancamentos: { construtora?: string | null }[]
): string | null {
  const r = analisarColunaConstrutora(lancamentos)
  return r.ok ? r.nome : null
}

/**
 * Construtora manual para o Dashboard — só quando a IA não encontrou,
 * há ao menos um nome preenchido e todos os nomes preenchidos são iguais.
 * Linhas vazias são permitidas.
 */
export function construtoraManualSeAplicavel(
  analiseConstrutora: string | null | undefined,
  lancamentos: { construtora?: string | null }[]
): string | null {
  if (!analiseSemConstrutora(analiseConstrutora)) return null
  const r = analisarColunaConstrutora(lancamentos)
  if (!r.ok || !r.nome) return null
  return r.nome
}

/** Nome exibido no Dashboard: IA quando encontrou; senão manual se aplicável. */
export function construtoraEfetivaProcessamento(
  analiseConstrutora: string | null | undefined,
  construtoraDosLancamentos: string | null | undefined
): string | null {
  if (!analiseSemConstrutora(analiseConstrutora)) {
    return analiseConstrutora!.trim()
  }
  return construtoraDosLancamentos?.trim() || null
}
