import type { LancamentoAI } from './types'

const MESES: Record<string, string> = {
  jan: 'Jan', fev: 'Fev', mar: 'Mar', abr: 'Abr', mai: 'Mai', jun: 'Jun',
  jul: 'Jul', ago: 'Ago', set: 'Set', out: 'Out', nov: 'Nov', dez: 'Dez',
}

const MODIFICADORES_TIPOLOGIA = ['Duplex', 'Triplex', 'Garden', 'Penthouse', 'Cobertura', 'Loft'] as const

function palavraSuite(quantidade: number) {
  return quantidade === 1 ? 'suíte' : 'suítes'
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
  const doTexto = buscarTipologiaNoTextoNativo(val, textoNativo)
  const base = doTexto ?? completarTipologiaTruncada(val)
  return formatarTipologiaInterno(base)
}

function capitalizarMes(mes: string) {
  const key = mes.toLowerCase().slice(0, 3)
  return MESES[key] ?? (mes.charAt(0).toUpperCase() + mes.slice(1).toLowerCase())
}

function formatarParteMetragem(part: string): string {
  const cleaned = part.trim().replace(',', '.')
  const num = parseFloat(cleaned)
  if (Number.isNaN(num)) return part.trim()
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
  let s = val.trim().replace(/\s+/g, '')
  s = s.replace(/m2/gi, 'm²')
  const hasSuffix = /m²$/i.test(s)
  const core = hasSuffix ? s.replace(/m²$/i, '') : s

  if (core.includes('-')) {
    const [a, b] = core.split('-')
    return `${formatarParteMetragem(a)}-${formatarParteMetragem(b)}m²`
  }
  return `${formatarParteMetragem(core)}m²`
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
  return formatarTipologiaInterno(completarTipologiaTruncada(val))
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
  tipologia: 'min-w-[140px]',
  unidade: 'min-w-[56px] max-w-[80px] tabular-nums text-center',
  andar: 'min-w-[88px] whitespace-nowrap tabular-nums',
  metragem: 'min-w-[88px] whitespace-nowrap tabular-nums text-right',
  data_entrega: 'min-w-[80px] whitespace-nowrap',
  vagas: 'min-w-[48px] max-w-[64px] tabular-nums text-center',
  valor_minimo: 'text-right tabular-nums',
  valor_maximo: 'text-right tabular-nums',
}
