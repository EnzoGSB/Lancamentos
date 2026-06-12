import type { SupabaseClient } from '@supabase/supabase-js'
import type { Lancamento } from './types'

export type FiltrosLancamentos = {
  q?: string
  construtora?: string[]
  empreendimento?: string[]
  bairro?: string[]
  tipologia?: string[]
  valor_min?: number | null
  valor_max?: number | null
  dormitorios_min?: number | null
  suites_min?: number | null
  vagas_min?: number | null
}

export type OpcoesCatalogo = {
  construtoras: string[]
  empreendimentos: string[]
  bairros: string[]
  tipologias: string[]
}

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

function parseVagas(val: string | null | undefined): number | null {
  if (!val?.trim()) return null
  const n = parseInt(val.trim(), 10)
  return Number.isFinite(n) ? n : null
}

function filtrarPosQuery(items: Lancamento[], filtros: FiltrosLancamentos): Lancamento[] {
  let result = items

  if (filtros.dormitorios_min != null && filtros.dormitorios_min > 0) {
    const n = filtros.dormitorios_min
    const re = new RegExp(`\\b${n}\\s*dorms?\\b`, 'i')
    result = result.filter(l => re.test(l.tipologia ?? ''))
  }

  if (filtros.suites_min != null && filtros.suites_min > 0) {
    const n = filtros.suites_min
    const re = new RegExp(`\\b${n}\\s*suítes?\\b`, 'i')
    result = result.filter(l => re.test(l.tipologia ?? ''))
  }

  if (filtros.vagas_min != null && filtros.vagas_min > 0) {
    result = result.filter(l => {
      const v = parseVagas(l.vagas)
      return v != null && v >= filtros.vagas_min!
    })
  }

  return result
}

export async function buscarLancamentos(
  supabase: SupabaseClient,
  filtros: FiltrosLancamentos,
  opts?: { limit?: number; offset?: number }
) {
  const limit = Math.min(opts?.limit ?? 50, 100)
  const offset = Math.max(opts?.offset ?? 0, 0)
  const precisaPosFiltro = (filtros.dormitorios_min ?? 0) > 0
    || (filtros.suites_min ?? 0) > 0
    || (filtros.vagas_min ?? 0) > 0

  const fetchLimit = precisaPosFiltro ? Math.min(limit * 8, 800) : limit

  let query = supabase
    .from('lancamentos')
    .select('*')
    .order('construtora')
    .order('empreendimento')
    .order('tipologia')
    .range(offset, offset + fetchLimit - 1)

  if (filtros.q?.trim()) {
    const term = escapeIlike(filtros.q.trim())
    query = query.or(
      [
        `construtora.ilike.%${term}%`,
        `empreendimento.ilike.%${term}%`,
        `bairro.ilike.%${term}%`,
        `tipologia.ilike.%${term}%`,
        `unidade.ilike.%${term}%`,
        `endereco.ilike.%${term}%`,
      ].join(',')
    )
  }

  query = applyMultiFilter(query, 'construtora', filtros.construtora)
  query = applyMultiFilter(query, 'empreendimento', filtros.empreendimento)
  query = applyMultiFilter(query, 'bairro', filtros.bairro)
  query = applyMultiFilter(query, 'tipologia', filtros.tipologia)

  if (filtros.valor_min != null && Number.isFinite(filtros.valor_min)) {
    query = query.gte('valor_minimo', filtros.valor_min)
  }
  if (filtros.valor_max != null && Number.isFinite(filtros.valor_max)) {
    query = query.lte('valor_minimo', filtros.valor_max)
  }

  const { data, error } = await query
  if (error) throw new Error(error.message)

  let lancamentos = (data ?? []) as Lancamento[]
  if (precisaPosFiltro) {
    lancamentos = filtrarPosQuery(lancamentos, filtros).slice(0, limit)
  }

  return { lancamentos, total: lancamentos.length, limit, offset }
}

export async function carregarOpcoesCatalogo(supabase: SupabaseClient): Promise<OpcoesCatalogo> {
  const { data, error } = await supabase
    .from('lancamentos')
    .select('construtora, empreendimento, bairro, tipologia')

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
  }
}
