import type { LancamentoAI } from './types'

const MESES: Record<string, string> = {
  jan: 'Jan', fev: 'Fev', mar: 'Mar', abr: 'Abr', mai: 'Mai', jun: 'Jun',
  jul: 'Jul', ago: 'Ago', set: 'Set', out: 'Out', nov: 'Nov', dez: 'Dez',
}

const MODIFICADORES_TIPOLOGIA = ['Duplex', 'Triplex', 'Garden', 'Penthouse', 'Cobertura', 'Loft'] as const

function palavraSuite(quantidade: number) {
  return quantidade === 1 ? 'suíte' : 'suítes'
}

/**
 * Detecta sufixo colado na extração de tabelas largas (vagas, metragem, torre, posição).
 * Ex.: "3 suítes 2 48 - T1 R" → sufixo "2 48 - T1 R"
 */
function isSufixoColunaExtra(suffix: string): boolean {
  const s = suffix.trim()
  if (!s || s.startsWith('(')) return false
  return /^(\d+\s+)+\d*(\s*-\s*)?(?:T\d+\s*)?[A-Z]?$/i.test(s)
    || /^\d+\s+\d+\s*[A-Z]?$/i.test(s)
}

/** Remove colunas extras coladas na tipologia após extração de PDF. */
export function removerSufixoLixoTipologia(val: string): string {
  const s = val.trim().replace(/\s+/g, ' ')

  const padroesCore = [
    /^((?:Studio|Duplex|Triplex|Garden|Penthouse|Cobertura|Loft)\s+\d+\s*suítes?)(?:\s+(.*))?$/i,
    /^(\d+\s*dorms?\s*\([^)]+\))(?:\s+(.*))?$/i,
    /^(\d+\s*dorms?)(?:\s+(.*))?$/i,
    /^(\d+\s*suítes?)(?:\s+(.*))?$/i,
    /^(Studio)(?:\s+(.*))?$/i,
  ]

  for (const re of padroesCore) {
    const m = s.match(re)
    if (!m) continue
    const core = m[1]
    const rest = m[2]
    if (rest && isSufixoColunaExtra(rest)) return core
    return s
  }

  return s
}

/** Truncamentos padronizados em tabelões — dedução segura, não invenção arbitrária. */
export function completarTipologiaTruncada(val: string): string {
  let s = val.trim().replace(/\s+/g, ' ')

  if (/\bsuítes?\)?\s*$/i.test(s)) return s

  const dormsComSuite = s.match(/^(\d+)\s*dorms?\.?\s*\((\d+)\s*suí$/i)
  if (dormsComSuite) {
    const n = parseInt(dormsComSuite[2], 10)
    return `${dormsComSuite[1]} dorms (${n} ${palavraSuite(n)})`
  }

  const dormComSuite = s.match(/^(\d+)\s*dorm\.?\s*\((\d+)\s*suí$/i)
  if (dormComSuite) {
    const n = parseInt(dormComSuite[2], 10)
    return `${dormComSuite[1]} dorm (${n} ${palavraSuite(n)})`
  }

  const entreParenteses = s.match(/^(.+?)\s*\((\d+)\s*suí$/i)
  if (entreParenteses) {
    const n = parseInt(entreParenteses[2], 10)
    return `${entreParenteses[1].trim()} (${n} ${palavraSuite(n)})`
  }

  const suiteNoFim = s.match(/^(.+?)\s+(\d+)\s*suí$/i)
  if (suiteNoFim) {
    const n = parseInt(suiteNoFim[2], 10)
    return `${suiteNoFim[1].trim()} ${n} ${palavraSuite(n)}`
  }

  if (/suít$/i.test(s)) return s.replace(/suít$/i, 'suítes')

  const modificadoresTruncados: [RegExp, string][] = [
    [/\bDupl$/i, 'Duplex'],
    [/\bDupli$/i, 'Duplex'],
    [/\bGarde$/i, 'Garden'],
    [/\bPentho$/i, 'Penthouse'],
    [/\bCobert$/i, 'Cobertura'],
  ]
  for (const [re, full] of modificadoresTruncados) {
    if (re.test(s)) return s.replace(re, full)
  }

  return s
}

export function tipologiaPareceTruncada(val: string | null | undefined): boolean {
  if (!val?.trim()) return false
  const s = val.trim()
  if (/suí$/i.test(s) && !/suítes?\)?\s*$/i.test(s)) return true
  if (/suít$/i.test(s)) return true
  if (/\b(Dupl|Dupli|Garde|Pentho|Cobert)$/i.test(s)) return true
  return false
}

/** Busca no texto nativo a versão completa de padrões truncados conhecidos. */
export function buscarTipologiaNoTextoNativo(
  parcial: string,
  textoNativo: string
): string | null {
  if (!parcial.trim() || !textoNativo.trim()) return null

  const dorms = parcial.match(/^(\d+)\s*dorms?\.?\s*\((\d+)\s*suí/i)
  if (dorms) {
    const re = new RegExp(
      `${dorms[1]}\\s*dorms?\\.?\\s*\\(\\s*${dorms[2]}\\s*suítes?\\)`,
      'i'
    )
    const m = textoNativo.match(re)
    if (m) return m[0].trim()
  }

  const dorm = parcial.match(/^(\d+)\s*dorm\.?\s*\((\d+)\s*suí/i)
  if (dorm) {
    const re = new RegExp(
      `${dorm[1]}\\s*dorm\\.?\\s*\\(\\s*${dorm[2]}\\s*suítes?\\)`,
      'i'
    )
    const m = textoNativo.match(re)
    if (m) return m[0].trim()
  }

  const prefixo = parcial.trim().slice(0, Math.min(12, parcial.trim().length))
  if (prefixo.length < 4) return null
  const escaped = prefixo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`${escaped}[\\w().º°\\s-]{0,30}`, 'i')
  const m = textoNativo.match(re)
  if (m && m[0].trim().length > parcial.trim().length) {
    const candidato = m[0].trim()
    if (!tipologiaPareceTruncada(candidato)) return candidato
  }

  return null
}

export function resolverTipologia(
  val: string | null | undefined,
  textoNativo = ''
): string | null {
  if (!val?.trim()) return null
  const limpa = removerSufixoLixoTipologia(val)
  const doTexto = buscarTipologiaNoTextoNativo(limpa, textoNativo)
  const base = doTexto ?? completarTipologiaTruncada(limpa)
  return formatarTipologiaInterno(base)
}

function capitalizarMes(mes: string) {
  const key = mes.toLowerCase().slice(0, 3)
  return MESES[key] ?? (mes.charAt(0).toUpperCase() + mes.slice(1).toLowerCase())
}

/** Metragem residencial/comercial plausível — abaixo disso, corrigir vírgula deslocada (ex.: 1,02 → 102). */
const METRAGEM_MIN_PLAUSIVEL = 10
const METRAGEM_MAX_PLAUSIVEL = 9999

/**
 * Interpreta número de m² vindos de PDF (BR: 102,00 / 1.102,50 / faixas mal lidas).
 * Corrige extrações impossíveis como 1,02 m² → 102 m².
 */
export function interpretarNumeroMetragem(part: string): number | null {
  const raw = part.trim().replace(/\s+/g, '')
  if (!raw || !/\d/.test(raw)) return null

  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(raw)) {
    const n = parseFloat(raw.replace(/\./g, '').replace(',', '.'))
    return Number.isFinite(n) ? n : null
  }

  if (raw.includes(',')) {
    const n = parseFloat(raw.replace(',', '.'))
    if (!Number.isFinite(n)) return null
    if (n >= METRAGEM_MIN_PLAUSIVEL) return n
    return corrigirMetragemImpossivel(raw, n)
  }

  if (raw.includes('.')) {
    const asDecimal = parseFloat(raw)
    if (!Number.isFinite(asDecimal)) return null
    if (asDecimal >= METRAGEM_MIN_PLAUSIVEL) return asDecimal

    const milhar = raw.match(/^(\d)\.(\d{3})$/)
    if (milhar) {
      const corrigido = parseInt(milhar[1] + milhar[2], 10)
      if (corrigido >= METRAGEM_MIN_PLAUSIVEL && corrigido <= METRAGEM_MAX_PLAUSIVEL) return corrigido
    }

    return corrigirMetragemImpossivel(raw.replace('.', ','), asDecimal)
  }

  const n = parseFloat(raw)
  return Number.isFinite(n) ? n : null
}

function corrigirMetragemImpossivel(raw: string, n: number): number {
  const concat = raw.match(/^(\d),(\d{2})$/)
  if (concat) {
    const corrigido = parseInt(concat[1] + concat[2], 10)
    if (corrigido >= METRAGEM_MIN_PLAUSIVEL && corrigido <= METRAGEM_MAX_PLAUSIVEL) return corrigido
  }

  const vezes10 = n * 10
  if (vezes10 >= METRAGEM_MIN_PLAUSIVEL && vezes10 <= METRAGEM_MAX_PLAUSIVEL) return vezes10

  return n
}

function formatarParteMetragem(part: string): string {
  const num = interpretarNumeroMetragem(part)
  if (num == null || Number.isNaN(num)) return part.trim()
  return num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** Mantém só dígitos e separadores válidos (vírgula, ponto, hífen para faixas). */
export function sanitizarMetragemInput(val: string): string {
  return val.replace(/[^\d,.-]/g, '')
}

/** Valor numérico para edição, sem sufixo m² (com correção de vírgula deslocada). */
export function metragemParaEdicao(val: string | null | undefined): string {
  if (!val?.trim()) return ''
  const core = sanitizarMetragemInput(
    val.trim().replace(/\s+/g, '').replace(/m²$/i, '').replace(/m2$/i, '')
  )
  if (!core) return ''
  const num = interpretarNumeroMetragem(core)
  if (num == null) return core
  return num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function formatarAndar(val: string | null | undefined): string | null {
  if (!val?.trim()) return null
  const s = val.trim().replace(/\s+/g, ' ')
  const lower = s.toLowerCase()

  if (lower === 'terreo' || lower === 'térreo') return 'Térreo'
  if (lower === 'cobertura') return 'Cobertura'

  const faixa = s.match(/^(\d+º)\s*-\s*(\d+º)(?:\s+andar)?$/i)
  if (faixa) return `${faixa[1]}-${faixa[2]}`

  const comAndar = s.match(/^(\d+º)\s+andar$/i)
  if (comAndar) return `${comAndar[1]} andar`

  const soOrdinal = s.match(/^(\d+º)$/i)
  if (soOrdinal) return `${soOrdinal[1]} andar`

  const semOrdinal = s.match(/^(\d+)\s*andar$/i)
  if (semOrdinal) return `${semOrdinal[1]}º andar`

  return s
}

export function formatarMetragem(val: string | null | undefined): string | null {
  if (!val?.trim()) return null
  let s = sanitizarMetragemInput(val.trim().replace(/\s+/g, ''))
  if (!s || !/\d/.test(s)) return null

  if (s.includes('-')) {
    const [a, b] = s.split('-')
    return `${formatarParteMetragem(a)}-${formatarParteMetragem(b)}m²`
  }
  return `${formatarParteMetragem(s)}m²`
}

function formatarTipologiaInterno(val: string): string {
  let s = val.trim().replace(/\s+/g, ' ')

  if (/^studio\b/i.test(s)) {
    s = s.replace(/^studio/i, 'Studio')
  }

  s = s.replace(/\b(\d+)\s*dorms?\.?\b/gi, '$1 dorms')
  s = s.replace(/\b(\d+)\s*suítes\b/gi, '$1 suítes')
  s = s.replace(/\b(\d+)\s*suíte\b/gi, '$1 suíte')
  s = s.replace(/\b(\d+)\s*dorm\.?\b/gi, '$1 dorm')

  for (const mod of MODIFICADORES_TIPOLOGIA) {
    s = s.replace(new RegExp(`\\b${mod}\\b`, 'gi'), mod)
  }

  return s
}

export function formatarTipologia(val: string | null | undefined): string | null {
  if (!val?.trim()) return null
  return formatarTipologiaInterno(completarTipologiaTruncada(removerSufixoLixoTipologia(val)))
}

export function formatarDataEntrega(val: string | null | undefined): string | null {
  if (!val?.trim()) return null
  const s = val.trim()
  if (/^pronto$/i.test(s)) return 'Pronto'

  const abrev = s.match(/^([A-Za-z]{3})[-/](\d{2,4})$/i)
  if (abrev) {
    const mes = capitalizarMes(abrev[1])
    const ano = abrev[2].length === 2 ? `20${abrev[2]}` : abrev[2]
    return `${mes}/${ano}`
  }

  const mesAno = s.match(/^([A-Za-z]{3,})\/(\d{4})$/i)
  if (mesAno) return `${capitalizarMes(mesAno[1])}/${mesAno[2]}`

  return s
}

export function formatarVagas(val: string | null | undefined): string | null {
  if (val == null || val === '') return null
  return String(val).trim()
}

export function formatarDesconto(val: string | null | undefined): string | null {
  if (!val?.trim()) return null
  return val.trim().replace(/\s+/g, ' ')
}

const CAMPOS_FORMATAVEIS = [
  'tipologia', 'andar', 'metragem', 'data_entrega', 'vagas', 'desconto_margem',
] as const

export type CampoFormatavel = (typeof CAMPOS_FORMATAVEIS)[number]

export function formatarCampo(
  field: keyof LancamentoAI,
  value: unknown
): string | null | unknown {
  if (typeof value !== 'string' && value != null && field !== 'vagas') return value

  switch (field) {
    case 'tipologia': return formatarTipologia(value as string)
    case 'andar': return formatarAndar(value as string)
    case 'metragem': return formatarMetragem(value as string)
    case 'data_entrega': return formatarDataEntrega(value as string)
    case 'vagas': return formatarVagas(value as string)
    case 'desconto_margem': return formatarDesconto(value as string)
    default: return value
  }
}

export function normalizarLancamento(
  l: LancamentoAI,
  textoNativo = ''
): LancamentoAI {
  return {
    ...l,
    tipologia: resolverTipologia(l.tipologia, textoNativo),
    andar: formatarAndar(l.andar),
    metragem: formatarMetragem(l.metragem),
    data_entrega: formatarDataEntrega(l.data_entrega),
    vagas: formatarVagas(l.vagas),
    desconto_margem: formatarDesconto(l.desconto_margem),
    unidade: l.unidade?.trim() || null,
    empreendimento: l.empreendimento?.trim() || l.empreendimento,
    construtora: l.construtora?.trim() || l.construtora,
    bairro: l.bairro?.trim() || null,
  }
}

export function normalizarLancamentos(
  items: LancamentoAI[],
  textoNativo = ''
): LancamentoAI[] {
  return items.map(l => normalizarLancamento(l, textoNativo))
}

export function exibirCampo(
  field: 'tipologia' | 'andar' | 'metragem' | 'data_entrega',
  val: string | null | undefined
): string {
  const formatted = formatarCampo(field, val)
  if (formatted == null || formatted === '') return '—'
  return String(formatted)
}

export const FIELD_CELL_CLASS: Partial<Record<CampoFormatavel | 'unidade' | 'valor_minimo' | 'valor_maximo', string>> = {
  tipologia: 'min-w-0',
  unidade: 'min-w-0 tabular-nums text-center',
  andar: 'min-w-0 tabular-nums',
  metragem: 'min-w-0 tabular-nums text-right',
  data_entrega: 'min-w-0',
  vagas: 'min-w-0 tabular-nums text-center',
  valor_minimo: 'min-w-0 text-right tabular-nums',
  valor_maximo: 'min-w-0 text-right tabular-nums',
}
