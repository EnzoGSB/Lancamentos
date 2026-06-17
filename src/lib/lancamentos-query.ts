import type { SupabaseClient } from '@supabase/supabase-js'
import type { Lancamento } from './types'
import { interpretarFaixaMetragem, removerSufixoLixoTipologia } from './formatar-lancamento'
import {
  isBuscaTipologiaComercial,
  matchesConsultaTexto,
} from './busca-texto'
import {
  matchesFiltroAndar,
  padroesAndarSqlOr,
} from './andar-unidade'
import {
  type FiltrosEntrega,
  matchesFiltroEntrega,
  padroesEntregaSql,
  temFiltroEntrega,
} from './entrega-query'

export { isEntregaPronta, isImovelPronto } from './entrega-query'

export type CondicaoAlternativa = {
  suites_min?: number | null
  suites_max?: number | null
  dormitorios_min?: number | null
  dormitorios_max?: number | null
  exige_duplex?: boolean
  tipologia_contem?: string[]
}

export type FiltrosLancamentos = {
  q?: string
  termos?: string[]
  construtora?: string[]
  empreendimento?: string[]
  bairro?: string[]
  tipologia?: string[]
  unidade?: string[]
  andar?: string[]
  desconto_contem?: string[]
  valor_min?: number | null
  valor_max?: number | null
  metragem_min?: number | null
  metragem_max?: number | null
  dormitorios_min?: number | null
  dormitorios_max?: number | null
  suites_min?: number | null
  suites_max?: number | null
  vagas_min?: number | null
  condicoes_or?: CondicaoAlternativa[]
  tipo_imovel?: 'apartamento' | 'studio' | null
} & FiltrosEntrega

export type OpcoesCatalogo = {
  construtoras: string[]
  empreendimentos: string[]
  bairros: string[]
  tipologias: string[]
  entregas: string[]
  descontos: string[]
}

export type ResultadoBusca = {
  lancamentos: Lancamento[]
  total: number
  limit: number
  offset: number
  usou_tolerancia_metragem: boolean
  usou_busca_similar: boolean
}

const TOLERANCIA_METRAGEM_PERCENT = 0.05

function escapeIlike(value: string) {
  return value.replace(/[%_\\]/g, '\\$&')
}

function applyMultiFilter<T extends { eq: (col: string, val: string) => T; in: (col: string, vals: string[]) => T }>(
  query: T,
  column: string,
  values: string[] | undefined
): T {
  if (!values?.length) return query
  if (values.length === 1) return query.eq(column, values[0])
  return query.in(column, values)
}

export function textoCompletoImovel(l: Lancamento): string {
  const parts: string[] = [
    l.construtora,
    l.empreendimento,
    l.bairro ?? '',
    l.tipologia ?? '',
    l.unidade ?? '',
    l.andar ?? '',
    l.endereco ?? '',
    l.vagas ?? '',
    l.desconto_margem ?? '',
    l.data_entrega ?? '',
    l.metragem ?? '',
  ]
  if (l.mais_detalhes != null) {
    try {
      parts.push(typeof l.mais_detalhes === 'string'
        ? l.mais_detalhes
        : JSON.stringify(l.mais_detalhes))
    } catch { /* ignore */ }
  }
  return parts.filter(Boolean).join(' ').toLowerCase()
}

export function parseMetragemM2(val: string | null | undefined): { min: number | null; max: number | null } {
  return interpretarFaixaMetragem(val)
}

export function extrairSuites(tipologia: string | null | undefined): number | null {
  if (!tipologia) return null
  const tip = removerSufixoLixoTipologia(tipologia)
  const m = tip.match(/(\d+)\s*suítes?/i)
  return m ? parseInt(m[1], 10) : null
}

export function extrairDormitorios(tipologia: string | null | undefined): number | null {
  if (!tipologia) return null
  const tip = removerSufixoLixoTipologia(tipologia)
  const m = tip.match(/(\d+)\s*dorms?/i) ?? tip.match(/(\d+)\s*dorm\.?/i)
  if (m) return parseInt(m[1], 10)
  const quartos = tip.match(/(\d+)\s*quartos?/i)
  if (quartos) return parseInt(quartos[1], 10)
  return null
}

/** Studio: tipologia explícita ou 0–1 dormitório/quarto. */
export function isStudioImovel(l: Lancamento): boolean {
  const tip = removerSufixoLixoTipologia(l.tipologia ?? '').trim()
  if (/^studio\b/i.test(tip)) return true
  const d = extrairDormitorios(tip)
  return d != null && d <= 1
}

/** Apartamento: 2+ dormitórios; exclui studios. Tipologias sem contagem mas claramente multi-quarto contam. */
export function isApartamentoImovel(l: Lancamento): boolean {
  if (isStudioImovel(l)) return false
  const tip = removerSufixoLixoTipologia(l.tipologia ?? '')
  const d = extrairDormitorios(tip)
  if (d != null && d >= 2) return true
  if (tip && /\d+\s*suítes?|duplex|triplex|cobertura|penthouse|garden|loft/i.test(tip)) return true
  return false
}

export function isDuplex(l: Lancamento): boolean {
  return /duplex/i.test(textoCompletoImovel(l))
}

function parseVagas(val: string | null | undefined): number | null {
  if (!val?.trim()) return null
  const n = parseInt(val.trim(), 10)
  return Number.isFinite(n) ? n : null
}

function matchesMetragem(
  l: Lancamento,
  min: number | null | undefined,
  max: number | null | undefined,
  percentTolerance: number
): boolean {
  if (min == null && max == null) return true
  const item = parseMetragemM2(l.metragem)
  if (item.min == null && item.max == null) return false

  const iMin = item.min ?? item.max!
  const iMax = item.max ?? item.min!

  let fMin = min ?? 0
  let fMax = max ?? Infinity

  if (percentTolerance > 0) {
    if (min != null) fMin = min * (1 - percentTolerance)
    if (max != null) fMax = max * (1 + percentTolerance)
  }

  return iMax >= fMin && iMin <= fMax
}

function matchesContagemNumerica(
  valor: number | null,
  min: number | null | undefined,
  max: number | null | undefined
): boolean {
  if (min != null && min > 0 && (valor == null || valor < min)) return false
  if (max != null && max > 0 && (valor == null || valor > max)) return false
  return true
}

function matchesCondicaoOr(l: Lancamento, cond: CondicaoAlternativa): boolean {
  const tip = l.tipologia ?? ''
  let hasCriterion = false

  if (cond.exige_duplex) {
    hasCriterion = true
    if (!isDuplex(l)) return false
  }

  if ((cond.suites_min != null && cond.suites_min > 0) || (cond.suites_max != null && cond.suites_max > 0)) {
    hasCriterion = true
    if (!matchesContagemNumerica(extrairSuites(tip), cond.suites_min, cond.suites_max)) return false
  }

  if ((cond.dormitorios_min != null && cond.dormitorios_min > 0)
    || (cond.dormitorios_max != null && cond.dormitorios_max > 0)) {
    hasCriterion = true
    if (!matchesContagemNumerica(extrairDormitorios(tip), cond.dormitorios_min, cond.dormitorios_max)) {
      return false
    }
  }

  if (cond.tipologia_contem?.length) {
    hasCriterion = true
    const tipLower = tip.toLowerCase()
    if (!cond.tipologia_contem.some(t => tipLower.includes(t.toLowerCase()))) return false
  }

  return hasCriterion
}

function applyIlikeMultiFilter<T extends { ilike: (col: string, val: string) => T; or: (expr: string) => T }>(
  query: T,
  column: string,
  values: string[] | undefined
): T {
  if (!values?.length) return query
  if (values.length === 1) return query.ilike(column, `%${escapeIlike(values[0])}%`)
  return query.or(values.map(v => `${column}.ilike.%${escapeIlike(v)}%`).join(','))
}

function faixaValorImovel(l: Lancamento): { min: number; max: number } | null {
  const min = l.valor_minimo
  const max = l.valor_maximo ?? l.valor_minimo
  if (min == null && max == null) return null
  return { min: min ?? max!, max: max ?? min! }
}

function matchesValor(
  l: Lancamento,
  min: number | null | undefined,
  max: number | null | undefined
): boolean {
  if (min == null && max == null) return true
  const faixa = faixaValorImovel(l)
  if (!faixa) return false
  if (max != null && faixa.min > max) return false
  if (min != null && faixa.max < min) return false
  return true
}

function matchesCampoParcial(val: string | null | undefined, termos: string[] | undefined): boolean {
  if (!termos?.length) return true
  const lower = (val ?? '').toLowerCase()
  return termos.some(t => lower.includes(t.toLowerCase()))
}

function matchesTermos(l: Lancamento, filtros: Pick<FiltrosLancamentos, 'q' | 'termos'>): boolean {
  return matchesConsultaTexto(textoCompletoImovel(l), {
    q: filtros.q,
    termos: filtros.termos,
  })
}

function filtrarPosQuery(
  items: Lancamento[],
  filtros: FiltrosLancamentos,
  percentToleranceMetragem: number
): Lancamento[] {
  return items.filter(l => {
    if (!matchesMetragem(l, filtros.metragem_min, filtros.metragem_max, percentToleranceMetragem)) {
      return false
    }

    const buscaComercial = isBuscaTipologiaComercial(filtros)

    if (filtros.condicoes_or?.length) {
      if (!filtros.condicoes_or.some(c => matchesCondicaoOr(l, c))) return false
    } else if (!buscaComercial) {
      if ((filtros.dormitorios_min != null && filtros.dormitorios_min > 0)
        || (filtros.dormitorios_max != null && filtros.dormitorios_max > 0)) {
        if (!matchesContagemNumerica(
          extrairDormitorios(l.tipologia),
          filtros.dormitorios_min,
          filtros.dormitorios_max
        )) return false
      }
      if ((filtros.suites_min != null && filtros.suites_min > 0)
        || (filtros.suites_max != null && filtros.suites_max > 0)) {
        if (!matchesContagemNumerica(
          extrairSuites(l.tipologia),
          filtros.suites_min,
          filtros.suites_max
        )) return false
      }
    }

    if (filtros.vagas_min != null && filtros.vagas_min > 0) {
      const v = parseVagas(l.vagas)
      if (v == null || v < filtros.vagas_min) return false
    }

    if (!matchesTermos(l, filtros)) return false

    if (!matchesValor(l, filtros.valor_min, filtros.valor_max)) return false
    if (!matchesCampoParcial(l.unidade, filtros.unidade)) return false
    if (!matchesFiltroAndar(l, filtros.andar)) return false
    if (!matchesCampoParcial(l.desconto_margem, filtros.desconto_contem)) return false

    if (!buscaComercial) {
      if (filtros.tipo_imovel === 'studio' && !isStudioImovel(l)) return false
      if (filtros.tipo_imovel === 'apartamento' && !isApartamentoImovel(l)) return false
    }

    if (!matchesFiltroEntrega(l.data_entrega, filtros)) return false

    return true
  })
}

function scoreRelevancia(l: Lancamento, filtros: FiltrosLancamentos): number {
  let score = 0
  const texto = textoCompletoImovel(l)

  if (filtros.bairro?.length && l.bairro && filtros.bairro.some(b =>
    l.bairro!.toLowerCase().includes(b.toLowerCase()))) {
    score += 15
  }

  if (filtros.metragem_min != null || filtros.metragem_max != null) {
    if (matchesMetragem(l, filtros.metragem_min, filtros.metragem_max, 0)) score += 20
    else if (matchesMetragem(l, filtros.metragem_min, filtros.metragem_max, TOLERANCIA_METRAGEM_PERCENT)) score += 10
  }

  for (const t of filtros.termos ?? []) {
    if (matchesConsultaTexto(texto, { termos: [t] })) score += 5
  }

  if (filtros.q && matchesConsultaTexto(texto, { q: filtros.q })) score += 5

  if (l.valor_minimo != null) score += 2
  if (l.metragem) score += 2
  if (l.tipologia) score += 2

  return score
}

function ordenarPorRelevancia(items: Lancamento[], filtros: FiltrosLancamentos): Lancamento[] {
  return [...items].sort((a, b) => scoreRelevancia(b, filtros) - scoreRelevancia(a, filtros))
}

function precisaPosFiltro(filtros: FiltrosLancamentos): boolean {
  return (filtros.metragem_min ?? 0) > 0
    || filtros.metragem_max != null
    || (filtros.dormitorios_min ?? 0) > 0
    || (filtros.dormitorios_max ?? 0) > 0
    || (filtros.suites_min ?? 0) > 0
    || (filtros.suites_max ?? 0) > 0
    || (filtros.vagas_min ?? 0) > 0
    || (filtros.condicoes_or?.length ?? 0) > 0
    || (filtros.termos?.length ?? 0) > 0
    || filtros.tipo_imovel != null
    || temFiltroEntrega(filtros)
    || filtros.valor_min != null
    || filtros.valor_max != null
    || (filtros.unidade?.length ?? 0) > 0
    || (filtros.andar?.length ?? 0) > 0
    || (filtros.desconto_contem?.length ?? 0) > 0
    || Boolean(filtros.q?.trim())
}

async function executarQuerySql(
  supabase: SupabaseClient,
  filtros: FiltrosLancamentos,
  fetchLimit: number,
  offset: number
): Promise<Lancamento[]> {
  let query = supabase
    .from('lancamentos')
    .select('*')
    .order('construtora')
    .order('empreendimento')
    .order('tipologia')
    .range(offset, offset + fetchLimit - 1)

  const termosBusca = [
    ...(filtros.q ? [filtros.q] : []),
    ...(filtros.termos ?? []),
  ]

  if (termosBusca.length > 0) {
    const orParts: string[] = []
    for (const term of termosBusca) {
      const t = escapeIlike(term)
      orParts.push(
        `construtora.ilike.%${t}%`,
        `empreendimento.ilike.%${t}%`,
        `bairro.ilike.%${t}%`,
        `tipologia.ilike.%${t}%`,
        `unidade.ilike.%${t}%`,
        `andar.ilike.%${t}%`,
        `endereco.ilike.%${t}%`,
        `metragem.ilike.%${t}%`,
        `desconto_margem.ilike.%${t}%`,
        `data_entrega.ilike.%${t}%`,
      )
    }
    query = query.or(orParts.join(','))
  }

  query = applyMultiFilter(query, 'construtora', filtros.construtora)
  query = applyMultiFilter(query, 'empreendimento', filtros.empreendimento)
  query = applyMultiFilter(query, 'bairro', filtros.bairro)
  query = applyMultiFilter(query, 'tipologia', filtros.tipologia)
  query = applyIlikeMultiFilter(query, 'unidade', filtros.unidade)
  if (filtros.andar?.length) {
    query = query.or(padroesAndarSqlOr(filtros.andar).join(','))
  }
  query = applyIlikeMultiFilter(query, 'desconto_margem', filtros.desconto_contem)

  if (filtros.valor_min != null && Number.isFinite(filtros.valor_min)) {
    query = query.or(`valor_minimo.gte.${filtros.valor_min},valor_maximo.gte.${filtros.valor_min}`)
  }
  if (filtros.valor_max != null && Number.isFinite(filtros.valor_max)) {
    query = query.lte('valor_minimo', filtros.valor_max)
  }

  const padroesEntrega = padroesEntregaSql(filtros)
  if (padroesEntrega.length === 1) {
    query = query.ilike('data_entrega', padroesEntrega[0])
  } else if (padroesEntrega.length > 1) {
    query = query.or(padroesEntrega.map(p => `data_entrega.ilike.${p}`).join(','))
  }

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data ?? []) as Lancamento[]
}

function buscarEmMemoria(
  candidatos: Lancamento[],
  filtros: FiltrosLancamentos,
  percentToleranceMetragem: number,
  limit: number
): Lancamento[] {
  const filtrados = filtrarPosQuery(candidatos, filtros, percentToleranceMetragem)
  return ordenarPorRelevancia(filtrados, filtros).slice(0, limit)
}

export async function buscarLancamentos(
  supabase: SupabaseClient,
  filtros: FiltrosLancamentos,
  opts?: { limit?: number; offset?: number }
): Promise<ResultadoBusca> {
  const limit = Math.min(opts?.limit ?? 50, 100)
  const offset = Math.max(opts?.offset ?? 0, 0)
  const posFiltro = precisaPosFiltro(filtros)
  const fetchLimit = posFiltro ? Math.min(limit * 12, 1000) : limit
  const temMetragem = filtros.metragem_min != null || filtros.metragem_max != null

  const candidatos = await executarQuerySql(supabase, filtros, fetchLimit, offset)

  let lancamentos = buscarEmMemoria(candidatos, filtros, 0, limit)
  let usouTolerancia = false

  if (lancamentos.length === 0 && temMetragem && candidatos.length > 0) {
    lancamentos = buscarEmMemoria(candidatos, filtros, TOLERANCIA_METRAGEM_PERCENT, limit)
    if (lancamentos.length > 0) usouTolerancia = true
  }

  if (lancamentos.length > 0 && temMetragem) {
    const algumNaTolerancia = lancamentos.some(l =>
      !matchesMetragem(l, filtros.metragem_min, filtros.metragem_max, 0)
      && matchesMetragem(l, filtros.metragem_min, filtros.metragem_max, TOLERANCIA_METRAGEM_PERCENT)
    )
    if (algumNaTolerancia) usouTolerancia = true
  }

  return {
    lancamentos,
    total: lancamentos.length,
    limit,
    offset,
    usou_tolerancia_metragem: usouTolerancia,
    usou_busca_similar: false,
  }
}

export async function carregarOpcoesCatalogo(supabase: SupabaseClient): Promise<OpcoesCatalogo> {
  const { data, error } = await supabase
    .from('lancamentos')
    .select('construtora, empreendimento, bairro, tipologia, data_entrega, desconto_margem')

  if (error) throw new Error(error.message)

  const unique = (values: (string | null | undefined)[]) =>
    [...new Set(values.filter((v): v is string => Boolean(v?.trim())))]
      .sort((a, b) => a.localeCompare(b, 'pt-BR'))

  const rows = data ?? []
  return {
    construtoras: unique(rows.map(r => r.construtora)),
    empreendimentos: unique(rows.map(r => r.empreendimento)),
    bairros: unique(rows.map(r => r.bairro)),
    tipologias: unique(rows.map(r => r.tipologia)),
    entregas: unique(rows.map(r => r.data_entrega)),
    descontos: unique(rows.map(r => r.desconto_margem)),
  }
}
