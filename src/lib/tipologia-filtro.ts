import { removerSufixoLixoTipologia } from './formatar-lancamento'
import { extrairDormitorios, extrairSuites } from './lancamentos-query'

const TIPOS_ESPECIAIS: { re: RegExp; label: string }[] = [
  { re: /\bloja\b/i, label: 'Loja' },
  { re: /\bstudio\b/i, label: 'Studio' },
  { re: /\bduplex\b/i, label: 'Duplex' },
  { re: /\btriplex\b/i, label: 'Triplex' },
  { re: /\bpenthouse\b/i, label: 'Penthouse' },
  { re: /\bcobertura\b/i, label: 'Cobertura' },
  { re: /\bgarden\b/i, label: 'Garden' },
  { re: /\bloft\b/i, label: 'Loft' },
]

const ORDEM_TIPOS = [
  'Studio',
  'Apartamento',
  'Duplex',
  'Triplex',
  'Garden',
  'Penthouse',
  'Cobertura',
  'Loft',
  'Loja',
] as const

function palavraSuite(n: number) {
  return n === 1 ? 'suíte' : 'suítes'
}

function palavraDorm(n: number) {
  return n === 1 ? 'dorm' : 'dorms'
}

/** Rótulo canônico de dormitórios/suítes para filtros (ex.: "4 dorms (2 suítes)"). */
export function rotuloDormitorios(tipologia: string | null | undefined): string | null {
  if (!tipologia?.trim()) return null
  const tip = removerSufixoLixoTipologia(tipologia).trim()

  const combo = tip.match(/^(\d+)\s*dorms?\s*\(\s*(\d+)\s*suítes?\s*\)/i)
  if (combo) {
    const d = parseInt(combo[1], 10)
    const s = parseInt(combo[2], 10)
    return `${d} ${palavraDorm(d)} (${s} ${palavraSuite(s)})`
  }

  const dorms = extrairDormitorios(tip)
  const suites = extrairSuites(tip)

  if (dorms != null && suites != null) {
    return `${dorms} ${palavraDorm(dorms)} (${suites} ${palavraSuite(suites)})`
  }
  if (dorms != null) return `${dorms} ${palavraDorm(dorms)}`
  if (suites != null) return `${suites} ${palavraSuite(suites)}`

  return null
}

/** Tipos de imóvel inferidos da tipologia (Studio, Duplex, Apartamento…). */
export function extrairTiposImovel(tipologia: string | null | undefined): string[] {
  if (!tipologia?.trim()) return []
  const tip = removerSufixoLixoTipologia(tipologia).trim()

  const found: string[] = []
  for (const { re, label } of TIPOS_ESPECIAIS) {
    if (re.test(tip)) found.push(label)
  }
  if (found.length > 0) return [...new Set(found)]

  if (/^studio\b/i.test(tip)) return ['Studio']

  const dorms = extrairDormitorios(tip)
  const suites = extrairSuites(tip)
  if (dorms != null || suites != null) return ['Apartamento']

  return []
}

export function buildOpcoesTipos(tipologias: (string | null | undefined)[]): string[] {
  const set = new Set<string>()
  for (const t of tipologias) {
    for (const tipo of extrairTiposImovel(t)) set.add(tipo)
  }
  return ORDEM_TIPOS.filter(t => set.has(t))
}

function chaveOrdenacaoDormitorio(label: string): number {
  const n = label.match(/^(\d+)/)
  return n ? parseInt(n[1], 10) : 999
}

export function buildOpcoesDormitorios(tipologias: (string | null | undefined)[]): string[] {
  const set = new Set<string>()
  for (const t of tipologias) {
    const rotulo = rotuloDormitorios(t)
    if (rotulo) set.add(rotulo)
  }
  return [...set].sort((a, b) => {
    const da = chaveOrdenacaoDormitorio(a)
    const db = chaveOrdenacaoDormitorio(b)
    if (da !== db) return da - db
    return a.localeCompare(b, 'pt-BR')
  })
}

export function matchesFiltroTipo(
  tipologia: string | null | undefined,
  tiposSelecionados: string[]
): boolean {
  if (tiposSelecionados.length === 0) return true
  const tipos = extrairTiposImovel(tipologia)
  return tipos.some(t => tiposSelecionados.includes(t))
}

export function matchesFiltroDormitorio(
  tipologia: string | null | undefined,
  dormitoriosSelecionados: string[]
): boolean {
  if (dormitoriosSelecionados.length === 0) return true
  const rotulo = rotuloDormitorios(tipologia)
  if (!rotulo) return false
  return dormitoriosSelecionados.includes(rotulo)
}

export function matchesFiltrosTipologiaDormitorio(
  tipologia: string | null | undefined,
  tipos: string[],
  dormitorios: string[]
): boolean {
  return matchesFiltroTipo(tipologia, tipos)
    && matchesFiltroDormitorio(tipologia, dormitorios)
}
